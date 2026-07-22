const express = require('express')
const crypto = require('crypto')
const { v4: uuidv4 } = require('uuid')
const { getDb } = require('../db')
const { getAccessibleFileRows, getFileAccess } = require('../fileAccess')
const { createOrRefreshGeneratedQuiz } = require('../generatedQuizzes')
const { materializeFile } = require('../vaultCrypto')

const router = express.Router()

router.post('/generate-from-note/:fileId', (req, res) => {
  const db = getDb()
  try {
    const result = db.transaction(() => createOrRefreshGeneratedQuiz(db, req.params.fileId, req.user.id, req.user.session_id))()
    res.status(result.created ? 201 : 200).json(result)
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Creation du quiz impossible' })
  }
})

router.post('/session', (req, res) => {
  const db = getDb()
  const { scope = 'all', folder_ids = [], file_id = null, file_ids = [], limit = 12 } = req.body || {}
  const files = getQuestionnaireFiles(db, { scope, folderIds: folder_ids, fileId: file_id, fileIds: file_ids }, req.user.id, req.user.session_id)
  const stats = getStats(db, req.user.id)
  const questions = []

  for (const file of files) {
    const parsed = parseReviewFile(file.content)
    if (!parsed) continue
    parsed.questions.forEach((question, index) => {
      const normalized = normalizeReviewQuestion(question, index, parsed, file)
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
  const target = getFileAccess(db, req.params.fileId, req.user.id)?.file
  if (!target || target.type !== 'file') return res.json([])

  const targetPath = getFilePath(db, target.id, req.user.id)
  const rows = readableRows(db, req.user.id, req.user.session_id)

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
  if (body.questionnaire_file_id) {
    const source = getFileAccess(db, String(body.questionnaire_file_id), req.user.id)
    if (!source) return res.status(404).json({ error: 'Questionnaire introuvable' })
  }

  const id = uuidv4()
  db.prepare(`
    INSERT INTO questionnaire_results (
      id, question_key, questionnaire_file_id, questionnaire_title, question_id,
      question_text, answer_text, expected_answer, correct, score, response_ms, user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    req.user.id,
    new Date().toISOString()
  )

  res.status(201).json({ ok: true, id })
})

router.get('/results', (req, res) => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT * FROM questionnaire_results
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 500
  `).all(req.user.id)
  res.json(rows)
})

module.exports = router

function getQuestionnaireFiles(db, { scope, folderIds, fileId, fileIds }, userId, sessionId) {
  let rows = readableRows(db, userId, sessionId)

  if (scope === 'file' && fileId) {
    rows = rows.filter(file => file.id === fileId)
  } else if (scope === 'linked_file' && fileId) {
    const target = getFileAccess(db, fileId, userId)?.file
    if (!target || target.type !== 'file') return []
    const targetPath = getFilePath(db, target.id, userId)
    rows = rows.filter(file => {
      if (!isQuestionnaireContent(file.name, file.content)) return false
      return questionnaireMatchesFile(parseQuestionnaire(file.content), target, targetPath)
    })
  } else if (scope === 'source_files') {
    const directIds = new Set(Array.isArray(fileIds) ? fileIds.map(id => String(id)) : [])
    const targets = Array.isArray(fileIds)
      ? fileIds
        .map(id => getFileAccess(db, String(id), userId)?.file)
        .filter(file => file && file.type === 'file')
        .map(file => ({ file, path: getFilePath(db, file.id, userId) }))
      : []
    if (targets.length === 0) return []
    rows = rows.filter(file => {
      if (directIds.has(String(file.id)) && isReviewContent(file.name, file.content)) return true
      const parsed = parseQuestionnaire(file.content)
      if (!parsed) return false
      return targets.some(target => questionnaireMatchesFile(parsed, target.file, target.path))
    })
  } else if (scope === 'folders') {
    if (!Array.isArray(folderIds) || folderIds.length === 0) return []
    const allowed = collectFolderScope(db, folderIds, userId)
    rows = rows.filter(file => allowed.has(file.parent_id))
  }

  return rows.filter(file => isReviewContent(file.name, file.content))
}

function readableRows(db, userId, sessionId) {
  return getAccessibleFileRows(db, userId, { filesOnly: true }).flatMap(file => {
    try { return [materializeFile(db, file, sessionId)] }
    catch (_) { return [] }
  }).filter(file => file.content !== null)
}

function collectFolderScope(db, folderIds, userId) {
  const allowed = new Set()
  const childrenStmt = db.prepare('SELECT id, type FROM files WHERE parent_id = ? AND deleted_at IS NULL')
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

function isReviewContent(name, content) {
  if (!/\.json$/i.test(String(name || ''))) return false
  return Boolean(parseReviewFile(content))
}

function parseReviewFile(content) {
  return parseQuestionnaire(content) || parseDefinitions(content)
}

function parseJsonContent(content) {
  return JSON.parse(String(content || '').replace(/^\uFEFF/, ''))
}

function parseQuestionnaire(content) {
  try {
    const parsed = parseJsonContent(content)
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

function parseDefinitions(content) {
  try {
    const parsed = parseJsonContent(content)
    if (!parsed || typeof parsed !== 'object') return null
    const definitions = Array.isArray(parsed.definitions) ? parsed.definitions : []
    if (parsed.philoweek_type !== 'definitions' && definitions.length === 0) return null
    return {
      id: parsed.id || parsed.slug || parsed.title || 'definitions',
      title: parsed.title || 'Definitions',
      description: parsed.description || '',
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      questions: definitions.map((item, index) => definitionToQuestion(item, index)),
    }
  } catch (_) {
    return null
  }
}

function definitionToQuestion(item, index) {
  const term = item?.term || item?.word || item?.name || ''
  const definition = item?.definition || item?.answer || item?.meaning || ''
  const example = item?.example || item?.explanation || item?.notes || ''
  return {
    id: item?.id || hash(`${term}|${definition}`) || `definition-${index + 1}`,
    type: 'definition',
    prompt: term ? `Definis : ${term}` : `Definition ${index + 1}`,
    answer: definition,
    explanation: example,
    tags: Array.isArray(item?.tags) ? item.tags : [],
  }
}

function normalizeReviewQuestion(question, index, questionnaire, file) {
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
  if (type === 'definition') return 'definition'
  return ['open', 'mcq', 'true_false'].includes(type) ? type : 'open'
}

function getStats(db, userId) {
  const rows = db.prepare(`
    SELECT
      question_key,
      COUNT(*) AS attempts,
      SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) AS correct_count,
      AVG(COALESCE(score, CASE WHEN correct = 1 THEN 1 ELSE 0 END)) AS average_score,
      MAX(created_at) AS last_seen
    FROM questionnaire_results
    WHERE user_id = ?
    GROUP BY question_key
  `).all(userId)

  const latestRows = db.prepare(`
    SELECT r.question_key, r.correct, r.score
    FROM questionnaire_results r
    JOIN (
      SELECT question_key, MAX(created_at) AS last_seen
      FROM questionnaire_results
      WHERE user_id = ?
      GROUP BY question_key
    ) latest ON latest.question_key = r.question_key AND latest.last_seen = r.created_at
    WHERE r.user_id = ?
  `).all(userId, userId)

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
  return sourceIds.has(String(file.id)) ||
    sourcePaths.has(normalizePath(filePath)) ||
    sourcePaths.has(normalizePath(file.name)) ||
    sourcePaths.has(normalizePath(file.name.replace(/\.md$/i, '')))
}

function getFilePath(db, fileId, userId) {
  const parts = []
  let cursor = getFileAccess(db, fileId, userId)?.file
  while (cursor) {
    parts.unshift(cursor.name)
    if (!cursor.parent_id) break
    const parentAccess = getFileAccess(db, cursor.parent_id, userId)
    if (!parentAccess) break
    cursor = parentAccess.file
  }
  return parts.join('/')
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').trim().toLowerCase()
}
