const express = require('express')
const router = express.Router()
const Anthropic = require('@anthropic-ai/sdk')
const { v4: uuidv4 } = require('uuid')
const { getDb } = require('../db')

const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

router.get('/quotes', (req, res) => {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM quotes ORDER BY created_at DESC').all()
  res.json(rows)
})

router.post('/quotes', (req, res) => {
  const db = getDb()
  const { quote, author, source, notes, tags } = req.body
  if (!quote || !quote.trim()) return res.status(400).json({ error: 'quote required' })

  const id = uuidv4()
  const now = new Date().toISOString()
  const safeTags = JSON.stringify(Array.isArray(tags) ? tags : [])
  db.prepare(
    `INSERT INTO quotes (id, quote, author, source, notes, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, quote.trim(), emptyToNull(author), emptyToNull(source), emptyToNull(notes), safeTags, now, now)

  res.status(201).json(db.prepare('SELECT * FROM quotes WHERE id = ?').get(id))
})

router.put('/quotes/:id', (req, res) => {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })

  const { quote, author, source, notes, tags } = req.body
  if (quote !== undefined && !quote.trim()) return res.status(400).json({ error: 'quote required' })

  const next = {
    quote: quote !== undefined ? quote.trim() : existing.quote,
    author: author !== undefined ? emptyToNull(author) : existing.author,
    source: source !== undefined ? emptyToNull(source) : existing.source,
    notes: notes !== undefined ? emptyToNull(notes) : existing.notes,
    tags: tags !== undefined ? JSON.stringify(Array.isArray(tags) ? tags : []) : existing.tags,
    updated_at: new Date().toISOString(),
  }

  db.prepare(
    `UPDATE quotes SET quote = ?, author = ?, source = ?, notes = ?, tags = ?, updated_at = ? WHERE id = ?`
  ).run(next.quote, next.author, next.source, next.notes, next.tags, next.updated_at, req.params.id)

  res.json(db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id))
})

router.delete('/quotes/:id', (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM quotes WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

router.post('/report', async (req, res) => {
  const days = clampDays(req.body.days)
  const provider = req.body.provider === 'openai' ? 'openai' : 'anthropic'
  const model = req.body.model || (provider === 'openai' ? 'gpt-4.1-mini' : 'claude-sonnet-4-6')
  const maxTokens = clampMaxTokens(req.body.max_tokens)
  const end = new Date()
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)

  const db = getDb()
  const activity = collectActivity(db, start, end)
  const prompt = buildLifePrompt(activity, start, end)

  try {
    const text = provider === 'openai'
      ? await callOpenAI({ model, prompt, maxTokens })
      : await callAnthropic({ model, prompt, maxTokens })

    res.json({
      text,
      period: { days, start: start.toISOString(), end: end.toISOString() },
      counts: activity.counts,
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

function collectActivity(db, start, end) {
  const inRange = row => {
    const raw = row.updated_at || row.created_at
    const d = new Date(raw)
    return !Number.isNaN(d.getTime()) && d >= start && d <= end
  }

  const files = db.prepare(
    "SELECT id, name, content, created_at, updated_at FROM files WHERE type = 'file' AND content IS NOT NULL"
  ).all().filter(inRange).map(f => ({
    name: f.name,
    updated_at: f.updated_at,
    excerpt: stripFrontmatter(f.content || '').slice(0, 2200),
  }))

  const timers = db.prepare('SELECT * FROM timer_sessions ORDER BY created_at DESC').all()
    .filter(inRange)

  const resources = db.prepare('SELECT * FROM inbox_resources ORDER BY created_at DESC').all()
    .filter(inRange)

  const ideas = db.prepare('SELECT * FROM inbox_ideas ORDER BY created_at DESC').all()
    .filter(inRange)

  const quotes = db.prepare('SELECT * FROM quotes ORDER BY created_at DESC').all()
    .filter(inRange)

  const voiceNotes = db.prepare('SELECT * FROM voice_notes ORDER BY created_at DESC').all()
    .filter(inRange)

  return {
    files,
    timers,
    resources,
    ideas,
    quotes,
    voiceNotes,
    counts: {
      notes: files.length,
      timerSessions: timers.length,
      resources: resources.length,
      ideas: ideas.length,
      quotes: quotes.length,
      voiceNotes: voiceNotes.length,
    },
  }
}

function buildLifePrompt(activity, start, end) {
  return `Tu es un analyste de vie personnel, prudent et non-medical. Tu dois produire un rapport en francais sur la periode ${start.toISOString().slice(0, 10)} -> ${end.toISOString().slice(0, 10)}.

Objectif :
- comprendre ce qui se passe actuellement dans la vie intellectuelle et mentale de l'utilisateur ;
- identifier ses centres d'interet, tensions, obsessions, besoins possibles et signaux de surcharge ou d'elan ;
- rester nuance : ne pose pas de diagnostic medical, ne fais pas de certitude clinique ;
- relier les lectures, citations, idees, notes et sessions de travail.

Format attendu :
## Vue d'ensemble
## Ce qui semble t'interesser
## Etat mental probable (hypotheses prudentes)
## Tensions / signaux faibles
## Pistes concretes pour la semaine suivante
## Questions a te poser

Donnees de la periode :

NOTES MODIFIEES
${activity.files.map(f => `### ${f.name} (${f.updated_at})\n${f.excerpt}`).join('\n\n') || 'Aucune note modifiee.'}

CITATIONS
${activity.quotes.map(q => `- "${q.quote}"${q.author ? ` — ${q.author}` : ''}${q.source ? `, ${q.source}` : ''}${q.notes ? `\n  Notes: ${q.notes}` : ''}`).join('\n') || 'Aucune citation.'}

IDEES CAPTUREES
${activity.ideas.map(i => `- ${i.content} (${i.created_at})`).join('\n') || 'Aucune idee.'}

RESSOURCES
${activity.resources.map(r => `- ${r.title || r.url} [${r.type}/${r.status}] ${r.notes || ''}`).join('\n') || 'Aucune ressource.'}

SESSIONS DE TRAVAIL
${activity.timers.map(t => `- ${Math.round(t.duration_seconds / 60)} min, ${t.activity_type}, ${t.notes || ''} (${t.created_at})`).join('\n') || 'Aucune session.'}

NOTES VOCALES
${activity.voiceNotes.map(v => `- ${v.title || v.filename}, ${v.duration_seconds || 0}s (${v.created_at})`).join('\n') || 'Aucune note vocale.'}`
}

async function callAnthropic({ model, prompt, maxTokens }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const error = new Error('ANTHROPIC_API_KEY manquante dans .env')
    error.status = 400
    throw error
  }

  const response = await anthropicClient.messages.create({
    model,
    max_tokens: maxTokens,
    system: 'Tu aides a faire un rapport de vie a partir de notes personnelles. Tu es lucide, empathique, analytique et prudent.',
    messages: [{ role: 'user', content: prompt }],
  })
  return response.content?.[0]?.text || ''
}

async function callOpenAI({ model, prompt, maxTokens }) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('OPENAI_API_KEY manquante dans .env')
    error.status = 400
    throw error
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      instructions: 'Tu aides a faire un rapport de vie a partir de notes personnelles. Tu es lucide, empathique, analytique et prudent.',
      input: prompt,
      max_output_tokens: maxTokens,
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data?.error?.message || response.statusText || 'OpenAI request failed')
    error.status = response.status
    throw error
  }

  if (data.output_text) return data.output_text
  return (data.output || [])
    .flatMap(item => item.content || [])
    .filter(content => content.type === 'output_text' && content.text)
    .map(content => content.text)
    .join('\n')
}

function clampDays(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 7
  return Math.max(1, Math.min(365, Math.round(n)))
}

function clampMaxTokens(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 1600
  return Math.max(400, Math.min(8000, Math.round(n)))
}

function stripFrontmatter(content) {
  return String(content || '').replace(/^---[\s\S]*?---\n?/, '').trim()
}

function emptyToNull(value) {
  const text = String(value || '').trim()
  return text || null
}

module.exports = router
