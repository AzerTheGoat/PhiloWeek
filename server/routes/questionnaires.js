const express = require('express')
const crypto = require('crypto')
const { v4: uuidv4 } = require('uuid')
const { getDb } = require('../db')

const router = express.Router()

router.post('/session', (req, res) => {
  const db = getDb()
  const { scope = 'all', folder_ids = [], file_id = null, limit = 12 } = req.body || {}
  const files = getQuestionnaireFiles(db, { scope, folderIds: folder_ids, fileId: file_id })
  const stats = getStats(db)
  const questions = []

  for (const file of files) {
    const parsed = parseQuestionnaire(file.content)
    if (!parsed) continue
    parsed.questions.forEach((question, index) => {
      const normalized = normalizeQuestion(question, index, parsed, file)
      if (normalized) questions.push(withStats(normalized, stats.get(normalized.question_key)))
    })
  }

  res.json({
    questions: pickWeighted(questions, clampLimit(limit)),
    total: questions.length,
  })
})

router.get('/linked/:fileId', (req, res) => {
  const db = getDb()
  const target = db.prepare('SELECT id, name, parent_id, type FROM files WHERE id = ?').get(req.params.fileId)
  if (!target || target.type !== 'file') return res.json([])

  const targetPath = getFilePath(db, target.id)
  const rows = db.prepare(`
    SELECT id, parent_id, name, content, created_at, updated_at
    FROM files
    WHERE type = 'file' AND content IS NOT NULL
  `).all()

  const linked = rows
    .filter(file => isQuestionnaireContent(file.name, file.content))
    .map(file => ({ file, parsed: parseQuestionnaire(file.content) }))
    .filter(item => questionnaireMatchesFile(item.parsed, target, targetPath))
    .map(item => ({
      id: item.file.id,
      name: item.file.name,
      title: item.parsed.title || item.file.name.replace(/\.json$/i, ''),
      question_count: item.parsed.questions.length,
      source_paths: item.parsed.source_paths,
    }))

  res.json(linked)
})

router.post('/results', (req, res) => {
  const db = getDb()
  const body = req.body || {}
  if (!body.question_key || !body.question_text) {
    return res.status(400).json({ error: 'question_key and question_text required' })
  }

  const id = uuidv4()
  db.prepare(`
    INSERT INTO questionnaire_results (
      id, question_key, questionnaire_file_id, questionnaire_title, question_id,
      question_text, answer_text, expected_answer, correct, score, response_ms, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    String(body.question_key),
    body.questionnaire_file_id || null,
    body.questionnaire_title || null,
    body.question_id || null,
    String(body.question_text),
    body.answer_text || '',
    body.expected_answer || '',
    body.correct ? 1 : 0,
    Number.isFinite(Number(body.score)) ? Number(body.score) : (body.correct ? 1 : 0),
    Number.isFinite(Number(body.response_ms)) ? Math.max(0, Math.round(Number(body.response_ms))) : null,
    new Date().toISOString()
  )

  res.status(201).json({ ok: true, id })
})

router.get('/results', (req, res) => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT * FROM questionnaire_results
    ORDER BY created_at DESC
    LIMIT 500
  `).all()
  res.json(rows)
})

module.exports = router

function getQuestionnaireFiles(db, { scope, folderIds, fileId }) {
  let rows = db.prepare(`
    SELECT id, parent_id, name, content, created_at, updated_at
    FROM files
    WHERE type = 'file' AND content IS NOT NULL
  `).all()

  if (scope === 'file' && fileId) {
    rows = rows.filter(file => file.id === fileId)
  } else if (scope === 'linked_file' && fileId) {
    const target = db.prepare('SELECT id, name, parent_id, type FROM files WHERE id = ?').get(fileId)
    if (!target || target.type !== 'file') return []
    const targetPath = getFilePath(db, target.id)
    rows = rows.filter(file => {
      if (!isQuestionnaireContent(file.name, file.content)) return false
      return questionnaireMatchesFile(parseQuestionnaire(file.content), target, targetPath)
    })
  } else if (scope === 'folders') {
    if (!Array.isArray(folderIds) || folderIds.length === 0) return []
    const allowed = collectFolderScope(db, folderIds)
    rows = rows.filter(file => allowed.has(file.parent_id))
  }

  return rows.filter(file => isQuestionnaireContent(file.name, file.content))
}

function collectFolderScope(db, folderIds) {
  const allowed = new Set()
  const childrenStmt = db.prepare('SELECT id, type FROM files WHERE parent_id = ?')
  function walk(id) {
    if (!id || allowed.has(id)) return
    allowed.add(id)
    childrenStmt.all(id).forEach(child => {
      if (child.type === 'folder') walk(child.id)
    })
  }
  folderIds.forEach(id => walk(String(id)))
  return allowed
}

function isQuestionnaireContent(name, content) {
  if (!/\.json$/i.test(String(name || ''))) return false
  return Boolean(parseQuestionnaire(content))
}

function parseQuestionnaire(content) {
  try {
    const parsed = JSON.parse(String(content || '').replace(/^\uFEFF/, ''))
    if (!parsed || typeof parsed !== 'object') return null
    const questions = Array.isArray(parsed.questions) ? parsed.questions : []
    if (parsed.philoweek_type !== 'questionnaire' && questions.length === 0) return null
    return {
      id: parsed.id || parsed.slug || parsed.title || 'questionnaire',
      title: parsed.title || 'Questionnaire',
      description: parsed.description || '',
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      source_paths: Array.isArray(parsed.source_paths) ? parsed.source_paths.map(String) : [],
      source_file_ids: Array.isArray(parsed.source_file_ids) ? parsed.source_file_ids.map(String) : [],
      questions,
    }
  } catch (_) {
    return null
  }
}

function normalizeQuestion(question, index, questionnaire, file) {
  if (!question || typeof question !== 'object') return null
  const prompt = question.prompt || question.question || question.text
  if (!prompt) return null
  const answer = question.answer || question.expected_answer || question.correction || ''
  const questionId = String(question.id || hash(`${prompt}|${answer}`)).slice(0, 80)
  const questionnaireKey = String(questionnaire.id || questionnaire.title || file.name).trim()
  const questionKey = `${questionnaireKey}:${questionId}`
  return {
    question_key: questionKey,
    question_id: questionId,
    questionnaire_file_id: file.id,
    questionnaire_title: questionnaire.title || file.name.replace(/\.json$/i, ''),
    file_name: file.name,
    prompt: String(prompt),
    answer: String(answer || ''),
    explanation: String(question.explanation || question.details || ''),
    type: normalizeType(question.type),
    choices: Array.isArray(question.choices) ? question.choices.map(String) : [],
    tags: Array.isArray(question.tags) ? question.tags.map(String) : [],
    index,
  }
}

function normalizeType(type) {
  return ['open', 'mcq', 'true_false'].includes(type) ? type : 'open'
}

function getStats(db) {
  const rows = db.prepare(`
    SELECT
      question_key,
      COUNT(*) AS attempts,
      SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) AS correct_count,
      AVG(COALESCE(score, CASE WHEN correct = 1 THEN 1 ELSE 0 END)) AS average_score,
      MAX(created_at) AS last_seen
    FROM questionnaire_results
    GROUP BY question_key
  `).all()

  const latestRows = db.prepare(`
    SELECT r.question_key, r.correct, r.score
    FROM questionnaire_results r
    JOIN (
      SELECT question_key, MAX(created_at) AS last_seen
      FROM questionnaire_results
      GROUP BY question_key
    ) latest ON latest.question_key = r.question_key AND latest.last_seen = r.created_at
  `).all()

  const latest = new Map(latestRows.map(row => [row.question_key, {
    correct: Boolean(row.correct),
    score: Number.isFinite(Number(row.score)) ? Number(row.score) : (row.correct ? 1 : 0),
  }]))
  return new Map(rows.map(row => [row.question_key, { ...row, latest: latest.get(row.question_key) }]))
}

function withStats(question, stat) {
  const attempts = Number(stat?.attempts || 0)
  const correct = Number(stat?.correct_count || 0)
  const wrong = Math.max(0, attempts - correct)
  const averageScore = attempts > 0 && Number.isFinite(Number(stat?.average_score))
    ? Number(stat.average_score)
    : null
  const lastScore = stat?.latest ? stat.latest.score : null
  const scoreGap = averageScore === null ? 1 : Math.max(0, 1 - averageScore)
  const lastWrongBoost = attempts > 0 && lastScore !== null && lastScore < 0.75 ? 5 : 0
  const weakHistoryBoost = scoreGap * 8
  const weight = 1 + wrong * 2 + lastWrongBoost + weakHistoryBoost
  return {
    ...question,
    stats: {
      attempts,
      correct,
      wrong,
      average_score: averageScore,
      last_score: lastScore,
      last_seen: stat?.last_seen || null,
    },
    weight,
  }
}

function pickWeighted(items, limit) {
  const pool = items.slice()
  const picked = []
  while (pool.length > 0 && picked.length < limit) {
    const total = pool.reduce((sum, item) => sum + Math.max(0.1, item.weight || 1), 0)
    let cursor = Math.random() * total
    let index = 0
    for (; index < pool.length; index++) {
      cursor -= Math.max(0.1, pool[index].weight || 1)
      if (cursor <= 0) break
    }
    picked.push(pool.splice(Math.min(index, pool.length - 1), 1)[0])
  }
  return picked
}

function clampLimit(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 12
  return Math.min(50, Math.max(1, Math.round(n)))
}

function hash(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 12)
}

function questionnaireMatchesFile(questionnaire, file, filePath) {
  if (!questionnaire) return false
  const sourceIds = new Set(questionnaire.source_file_ids || [])
  const sourcePaths = new Set((questionnaire.source_paths || []).map(normalizePath))
  return sourceIds.has(file.id) ||
    sourcePaths.has(normalizePath(filePath)) ||
    sourcePaths.has(normalizePath(file.name)) ||
    sourcePaths.has(normalizePath(file.name.replace(/\.md$/i, '')))
}

function getFilePath(db, fileId) {
  const parts = []
  let cursor = db.prepare('SELECT id, parent_id, name FROM files WHERE id = ?').get(fileId)
  while (cursor) {
    parts.unshift(cursor.name)
    cursor = cursor.parent_id
      ? db.prepare('SELECT id, parent_id, name FROM files WHERE id = ?').get(cursor.parent_id)
      : null
  }
  return parts.join('/')
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').trim().toLowerCase()
}
