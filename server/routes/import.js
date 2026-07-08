const express = require('express')
const router = express.Router()
const multer = require('multer')
const JSZip = require('jszip')
const matter = require('gray-matter')
const { getDb, updateTags } = require('../db')
const { v4: uuidv4 } = require('uuid')

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })

router.post('/obsidian', upload.single('vault'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

  const db = getDb()
  const conflict = req.body.conflict || 'rename'
  const report = { imported: 0, skipped: 0, linksResolved: 0, linksBroken: 0, errors: [] }

  try {
    const zip = await JSZip.loadAsync(req.file.buffer)

    // Phase 1: collect supported entries (sorted shallowest first)
    const importEntries = []
    zip.forEach((relativePath, entry) => {
      if (
        !entry.dir &&
        /\.(md|json)$/i.test(relativePath) &&
        !relativePath.startsWith('__MACOSX')
      ) {
        importEntries.push({ relativePath, entry })
      }
    })
    importEntries.sort((a, b) => a.relativePath.split('/').length - b.relativePath.split('/').length)

    // Phase 2: decompress all files asynchronously (before touching the DB)
    const decompressed = []
    for (const { relativePath, entry } of importEntries) {
      try {
        const rawContent = await entry.async('text')
        decompressed.push({ relativePath, rawContent })
      } catch (err) {
        report.errors.push(`${relativePath}: ${err.message}`)
      }
    }

    // Phase 3: all DB writes in a single transaction (fast)
    const pathToId = {}

    const importTx = db.transaction(() => {
      const insertFolder = db.prepare(
        "INSERT INTO files (id, parent_id, name, type, user_id, created_at, updated_at) VALUES (?, ?, ?, 'folder', ?, datetime('now'), datetime('now'))"
      )
      const insertFile = db.prepare(
        "INSERT INTO files (id, parent_id, name, type, content, user_id, created_at, updated_at) VALUES (?, ?, ?, 'file', ?, ?, datetime('now'), datetime('now'))"
      )
      const updateFile = db.prepare(
        "UPDATE files SET content = ?, updated_at = datetime('now') WHERE id = ?"
      )
      const insertQuote = db.prepare(
        `INSERT INTO quotes (id, quote, author, source, notes, tags, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      const insertFactCheck = db.prepare(
        `INSERT INTO fact_checks (id, claim, status, notes, source, tags, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      const insertTodo = db.prepare(
        `INSERT OR IGNORE INTO todos (
          id, title, notes, status, due_at, user_id, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      const insertPractice = db.prepare(
        `INSERT OR IGNORE INTO agenda_practices (
          id, title, color, active, user_id, created_at, updated_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      const insertAgendaCheck = db.prepare(
        `INSERT OR REPLACE INTO agenda_checks (
          practice_id, entry_date, done, user_id, updated_at
        ) VALUES (?, ?, ?, ?, ?)`
      )
      const upsertLifeProfile = db.prepare(
        `INSERT INTO life_profiles (user_id, birth_date, life_expectancy_years, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id)
         DO UPDATE SET birth_date = excluded.birth_date, life_expectancy_years = excluded.life_expectancy_years, updated_at = excluded.updated_at`
      )
      const insertQuestionnaireResult = db.prepare(
        `INSERT OR IGNORE INTO questionnaire_results (
          id, question_key, questionnaire_file_id, questionnaire_title, question_id,
          question_text, answer_text, expected_answer, correct, score, response_ms, user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      const insertHistorySnapshot = db.prepare(
        `INSERT OR IGNORE INTO app_snapshots (id, user_id, created_at, reason, data_json)
         VALUES (?, ?, ?, ?, ?)`
      )

      for (const { relativePath, rawContent } of decompressed) {
        try {
          const jsonSpecial = safeJson(rawContent)
          const parsedSpecial = /\.md$/i.test(relativePath) ? safeMatter(rawContent) : { data: {}, content: rawContent }
          if (jsonSpecial?.philoweek_type === 'questionnaire_results') {
            const results = Array.isArray(jsonSpecial.results) ? jsonSpecial.results : []
            for (const result of results) {
              if (!result.question_key || !result.question_text) continue
              insertQuestionnaireResult.run(
                result.id || uuidv4(),
                String(result.question_key),
                result.questionnaire_file_id || null,
                result.questionnaire_title || null,
                result.question_id || null,
                String(result.question_text),
                result.answer_text || '',
                result.expected_answer || '',
                result.correct ? 1 : 0,
                Number.isFinite(Number(result.score)) ? Number(result.score) : (result.correct ? 1 : 0),
                Number.isFinite(Number(result.response_ms)) ? Number(result.response_ms) : null,
                req.user.id,
                result.created_at || new Date().toISOString()
              )
              report.imported++
            }
            continue
          }

          if (jsonSpecial?.philoweek_type === 'history') {
            const snapshots = Array.isArray(jsonSpecial.snapshots) ? jsonSpecial.snapshots : []
            for (const snapshot of snapshots) {
              if (!snapshot?.data_json || !isValidJson(snapshot.data_json)) continue
              insertHistorySnapshot.run(
                snapshot.id || uuidv4(),
                req.user.id,
                normalizeIsoDate(snapshot.created_at) || new Date().toISOString(),
                snapshot.reason || 'import',
                snapshot.data_json
              )
              report.imported++
            }
            continue
          }

          if (jsonSpecial?.philoweek_type === 'todos') {
            const todos = Array.isArray(jsonSpecial.todos) ? jsonSpecial.todos : []
            for (const todo of todos) {
              const title = String(todo.title || '').trim()
              const dueAt = normalizeDueDate(todo.due_at)
              if (!title || !dueAt) continue
              const status = todo.status === 'done' ? 'done' : 'open'
              const now = new Date().toISOString()
              insertTodo.run(
                todo.id || uuidv4(),
                title,
                todo.notes || null,
                status,
                dueAt,
                req.user.id,
                todo.created_at || now,
                todo.updated_at || now,
                status === 'done' ? (todo.completed_at || now) : null
              )
              report.imported++
            }
            continue
          }

          if (jsonSpecial?.philoweek_type === 'dashboard') {
            const now = new Date().toISOString()
            const practices = Array.isArray(jsonSpecial.practices) ? jsonSpecial.practices : []
            const knownPracticeIds = new Set()
            for (const practice of practices) {
              const title = String(practice.title || '').trim()
              if (!title) continue
              const id = practice.id || uuidv4()
              knownPracticeIds.add(id)
              insertPractice.run(
                id,
                title,
                normalizeColor(practice.color),
                practice.active ? 1 : 0,
                req.user.id,
                practice.created_at || now,
                practice.updated_at || now,
                practice.active ? null : (practice.archived_at || now)
              )
              report.imported++
            }
            const checks = Array.isArray(jsonSpecial.checks) ? jsonSpecial.checks : []
            for (const check of checks) {
              const entryDate = normalizeDueDate(check.entry_date)
              if (!check.practice_id || !entryDate || !knownPracticeIds.has(check.practice_id)) continue
              insertAgendaCheck.run(
                check.practice_id,
                entryDate,
                check.done ? 1 : 0,
                req.user.id,
                check.updated_at || now
              )
              report.imported++
            }
            if (jsonSpecial.life_profile) {
              upsertLifeProfile.run(
                req.user.id,
                normalizeDueDate(jsonSpecial.life_profile.birth_date),
                clampInt(jsonSpecial.life_profile.life_expectancy_years, 1, 130, 85),
                jsonSpecial.life_profile.updated_at || now
              )
              report.imported++
            }
            continue
          }

          if (parsedSpecial.data.philoweek_type === 'quotes') {
            const quotes = parseQuotesExport(parsedSpecial.content)
            for (const quote of quotes) {
              const id = uuidv4()
              const now = new Date().toISOString()
              insertQuote.run(
                id,
                quote.quote,
                quote.author,
                quote.source,
                quote.notes,
                quote.tags,
                req.user.id,
                quote.created_at || now,
                now
              )
              report.imported++
            }
            continue
          }

          if (parsedSpecial.data.philoweek_type === 'fact_checks') {
            const factChecks = parseFactChecksExport(parsedSpecial.content)
            for (const factCheck of factChecks) {
              const id = uuidv4()
              const now = new Date().toISOString()
              insertFactCheck.run(
                id,
                factCheck.claim,
                factCheck.status,
                factCheck.notes,
                factCheck.source,
                factCheck.tags,
                req.user.id,
                factCheck.created_at || now,
                now
              )
              report.imported++
            }
            continue
          }

          const parts = relativePath.split('/')
          const fileName = parts[parts.length - 1]
          const dirParts = parts.slice(0, -1)

          let parentId = null
          let pathAccum = ''
          for (const dirName of dirParts) {
            pathAccum = pathAccum ? pathAccum + '/' + dirName : dirName
            if (!pathToId[pathAccum]) {
              const existing = db.prepare(
                "SELECT id FROM files WHERE name = ? AND parent_id IS ? AND type = 'folder' AND user_id = ?"
              ).get(dirName, parentId, req.user.id)
              if (existing) {
                pathToId[pathAccum] = existing.id
              } else {
                const id = uuidv4()
                insertFolder.run(id, parentId, dirName, req.user.id)
                pathToId[pathAccum] = id
              }
            }
            parentId = pathToId[pathAccum]
          }

          const existing = db.prepare(
            'SELECT id FROM files WHERE name = ? AND parent_id IS ? AND user_id = ?'
          ).get(fileName, parentId, req.user.id)

          let fileId
          if (existing) {
            if (conflict === 'skip') { report.skipped++; return }
            if (conflict === 'overwrite') {
              updateFile.run(rawContent, existing.id)
              fileId = existing.id
            } else {
              const newName = fileName.replace(/\.md$/i, '') + `-import-${Date.now()}.md`
              fileId = uuidv4()
              insertFile.run(fileId, parentId, newName, rawContent, req.user.id)
            }
          } else {
            fileId = uuidv4()
            insertFile.run(fileId, parentId, fileName, rawContent, req.user.id)
          }

          pathToId[relativePath] = fileId
          updateTags(db, fileId, rawContent)
          report.imported++
        } catch (err) {
          report.errors.push(`${relativePath}: ${err.message}`)
        }
      }
    })

    importTx()

    // Phase 4: resolve [[links]] — one query to get all files with content
    const allFiles = db.prepare("SELECT id, name, content FROM files WHERE type = 'file' AND user_id = ?").all(req.user.id)
    const nameToId = {}
    allFiles.forEach(f => {
      nameToId[f.name] = f.id
      nameToId[f.name.replace(/\.md$/i, '')] = f.id
    })

    const linkTx = db.transaction(() => {
      const deleteLinks = db.prepare('DELETE FROM file_links WHERE source_id = ?')
      const insertLink = db.prepare(
        'INSERT OR IGNORE INTO file_links (source_id, target_id, link_text) VALUES (?, ?, ?)'
      )
      const linkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
      for (const file of allFiles) {
        const content = file.content || ''
        deleteLinks.run(file.id)
        let m
        linkRegex.lastIndex = 0
        while ((m = linkRegex.exec(content)) !== null) {
          const linkText = m[1].trim()
          const targetId = nameToId[linkText] || nameToId[linkText + '.md']
          if (targetId && targetId !== file.id) {
            try { insertLink.run(file.id, targetId, linkText); report.linksResolved++ }
            catch (_) {}
          } else {
            report.linksBroken++
          }
        }
      }
    })

    linkTx()

    res.json({ ok: true, report })
  } catch (err) {
    console.error('Import error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

function safeMatter(rawContent) {
  try { return matter(rawContent) }
  catch (_) { return { data: {}, content: rawContent } }
}

function safeJson(rawContent) {
  try { return JSON.parse(String(rawContent || '').replace(/^\uFEFF/, '')) }
  catch (_) { return null }
}

function isValidJson(rawContent) {
  try { JSON.parse(String(rawContent || '')); return true }
  catch (_) { return false }
}

function parseQuotesExport(content) {
  return String(content || '')
    .split(/\n---\n/g)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const lines = block.split('\n')
      const quoteLines = []
      let i = 0
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      const rest = lines.slice(i).join('\n').trim()
      const author = matchLine(rest, 'Auteur')
      const source = matchLine(rest, 'Source')
      const tags = matchLine(rest, 'Tags') || '[]'
      const created = matchLine(rest, 'Ajoute')
      const notesMatch = rest.match(/Notes:\n([\s\S]*)$/)
      return {
        quote: quoteLines.join('\n').trim(),
        author,
        source,
        tags,
        created_at: created,
        notes: notesMatch ? notesMatch[1].trim() : null,
      }
    })
    .filter(q => q.quote)
}

const STATUS_LABEL_TO_VALUE = {
  'a verifier': 'to_check',
  'vrai': 'true',
  'faux': 'false',
  'partiellement vrai': 'partial',
}

function parseFactChecksExport(content) {
  return String(content || '')
    .split(/\n---\n/g)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const lines = block.split('\n')
      const claimLines = []
      let i = 0
      while (i < lines.length && lines[i].startsWith('>')) {
        claimLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      const rest = lines.slice(i).join('\n').trim()
      const statusLabel = matchLine(rest, 'Statut')
      const source = matchLine(rest, 'Source')
      const tags = matchLine(rest, 'Tags') || '[]'
      const created = matchLine(rest, 'Ajoute')
      const notesMatch = rest.match(/Notes:\n([\s\S]*)$/)
      return {
        claim: claimLines.join('\n').trim(),
        status: STATUS_LABEL_TO_VALUE[String(statusLabel || '').trim().toLowerCase()] || 'to_check',
        source,
        tags,
        created_at: created,
        notes: notesMatch ? notesMatch[1].trim() : null,
      }
    })
    .filter(f => f.claim)
}

function matchLine(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = String(text || '').match(new RegExp(`^${escaped}:\\s*(.+)$`, 'm'))
  return match ? match[1].trim() : null
}

function normalizeDueDate(value) {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function normalizeIsoDate(value) {
  const text = String(value || '').trim()
  if (!text) return null
  const date = new Date(text)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function normalizeColor(value) {
  const color = String(value || '').trim()
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#6ba3e8'
}

function clampInt(value, min, max, fallback) {
  const next = Number(value)
  if (!Number.isFinite(next)) return fallback
  return Math.min(max, Math.max(min, Math.round(next)))
}
