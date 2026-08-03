const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { v4: uuidv4 } = require('uuid')
const { getDb } = require('../db')
const { RECORDINGS_DIR } = require('../paths')
const { assertUserStorageQuota, costlyOperationLimiter } = require('../securityControls')

const router = express.Router()
const allowedExtensions = new Set(['.webm', '.m4a', '.mp4', '.aac', '.ogg', '.wav'])
const storage = multer.diskStorage({
  destination: RECORDINGS_DIR,
  filename: (_req, file, callback) => {
    const extension = allowedExtensions.has(path.extname(file.originalname || '').toLowerCase())
      ? path.extname(file.originalname).toLowerCase()
      : '.webm'
    callback(null, `elocution-${uuidv4()}${extension}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024, files: 1 } })

router.get('/courses', (req, res) => {
  const db = getDb()
  const courses = db.prepare('SELECT * FROM elocution_courses WHERE user_id = ? ORDER BY imported_at DESC').all(req.user.id)
  const chapters = db.prepare('SELECT * FROM elocution_chapters WHERE user_id = ? ORDER BY number, rowid').all(req.user.id)
  const exercises = db.prepare('SELECT * FROM elocution_exercises WHERE user_id = ? ORDER BY sort_order, rowid').all(req.user.id)
  const audios = db.prepare(`
    SELECT a.*, e.global_score, e.detail_scores_json, e.general_remarks, e.advice_json, e.raw_json, e.evaluated_at
    FROM elocution_audios a
    LEFT JOIN elocution_ai_evaluations e ON e.audio_id = a.id AND e.user_id = a.user_id
    WHERE a.user_id = ? ORDER BY a.recorded_at DESC
  `).all(req.user.id).map(normalizeAudio)
  const audioByExercise = groupBy(audios, 'exercise_id')
  const exerciseByChapter = groupBy(exercises.map(row => ({
    ...row,
    parameters: safeJson(row.parameters_json, {}),
    audios: audioByExercise[row.id] || [],
  })), 'chapter_id')
  const chapterByCourse = groupBy(chapters.map(row => ({ ...row, exercises: exerciseByChapter[row.id] || [] })), 'course_id')
  res.json(courses.map(row => ({ ...row, chapters: chapterByCourse[row.id] || [] })))
})

router.post('/courses/import', (req, res) => {
  const source = normalizeCourse(req.body)
  if (!source.title || source.chapters.length === 0) return res.status(400).json({ error: 'Le cours doit avoir un titre et au moins un chapitre.' })
  const db = getDb()
  const courseId = uuidv4()
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO elocution_courses (id, title, description, json_source, user_id) VALUES (?, ?, ?, ?, ?)')
      .run(courseId, source.title, source.description, JSON.stringify(req.body), req.user.id)
    const addChapter = db.prepare('INSERT INTO elocution_chapters (id, course_id, number, title, description, user_id) VALUES (?, ?, ?, ?, ?, ?)')
    const addExercise = db.prepare(`INSERT INTO elocution_exercises
      (id, chapter_id, type, instruction, support_text, parameters_json, sort_order, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    source.chapters.forEach((chapter, chapterIndex) => {
      const chapterId = uuidv4()
      addChapter.run(chapterId, courseId, chapter.number, chapter.title, chapter.description, req.user.id)
      chapter.exercises.forEach((exercise, index) => addExercise.run(
        uuidv4(), chapterId, exercise.type, exercise.instruction, exercise.supportText,
        JSON.stringify(exercise.parameters), index, req.user.id
      ))
    })
  })
  tx()
  res.status(201).json({ id: courseId })
})

router.delete('/courses/:id', (req, res) => {
  const db = getDb()
  const course = db.prepare('SELECT id FROM elocution_courses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!course) return res.status(404).json({ error: 'Cours introuvable' })
  const filenames = db.prepare(`SELECT a.filename FROM elocution_audios a
    JOIN elocution_exercises e ON e.id = a.exercise_id
    JOIN elocution_chapters c ON c.id = e.chapter_id
    WHERE c.course_id = ? AND a.user_id = ?`).all(course.id, req.user.id)
  db.prepare('DELETE FROM elocution_courses WHERE id = ? AND user_id = ?').run(course.id, req.user.id)
  filenames.forEach(({ filename }) => { try { fs.unlinkSync(path.join(RECORDINGS_DIR, path.basename(filename))) } catch (_) {} })
  res.json({ ok: true })
})

router.post('/exercises/:id/audio', costlyOperationLimiter, upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier audio reçu' })
  const db = getDb()
  const exercise = db.prepare('SELECT id FROM elocution_exercises WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!exercise) { try { fs.unlinkSync(req.file.path) } catch (_) {}; return res.status(404).json({ error: 'Exercice introuvable' }) }
  try { assertUserStorageQuota(db, req.user.id, req.file.size) } catch (error) {
    try { fs.unlinkSync(req.file.path) } catch (_) {}
    return res.status(error.status || 413).json({ error: error.message, code: error.code })
  }
  const id = uuidv4()
  const source = req.body.source === 'mobile' ? 'mobile' : 'web'
  db.prepare(`INSERT INTO elocution_audios (id, exercise_id, filename, duration_seconds, source, user_id)
    VALUES (?, ?, ?, ?, ?, ?)`).run(id, exercise.id, req.file.filename, Math.max(0, parseInt(req.body.duration) || 0), source, req.user.id)
  res.status(201).json(normalizeAudio(db.prepare('SELECT * FROM elocution_audios WHERE id = ?').get(id)))
})

router.get('/audios/:id/file', (req, res) => {
  const audio = getAudio(getDb(), req.params.id, req.user.id)
  if (!audio) return res.status(404).json({ error: 'Audio introuvable' })
  const filePath = path.join(RECORDINGS_DIR, path.basename(audio.filename))
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier audio manquant' })
  res.sendFile(filePath)
})

router.get('/audios/:id/prompt', (req, res) => {
  const context = getAudioContext(getDb(), req.params.id, req.user.id)
  if (!context) return res.status(404).json({ error: 'Audio introuvable' })
  res.json({ prompt: buildPrompt(context) })
})

router.put('/audios/:id/evaluation', (req, res) => {
  const db = getDb()
  const audio = getAudio(db, req.params.id, req.user.id)
  if (!audio) return res.status(404).json({ error: 'Audio introuvable' })
  const raw = typeof req.body.raw_json === 'string' ? req.body.raw_json : JSON.stringify(req.body.evaluation ?? req.body)
  let evaluation
  try { evaluation = JSON.parse(raw) } catch (_) { return res.status(400).json({ error: "La réponse n'est pas un JSON valide." }) }
  const validation = validateEvaluation(evaluation)
  if (validation) return res.status(400).json({ error: validation })
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO elocution_ai_evaluations
    (id, audio_id, global_score, detail_scores_json, general_remarks, advice_json, raw_json, user_id, evaluated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(audio_id) DO UPDATE SET global_score=excluded.global_score,
      detail_scores_json=excluded.detail_scores_json, general_remarks=excluded.general_remarks,
      advice_json=excluded.advice_json, raw_json=excluded.raw_json, evaluated_at=excluded.evaluated_at
    WHERE user_id=excluded.user_id`).run(
    uuidv4(), audio.id, Number(evaluation.score_global), JSON.stringify(evaluation.scores_details),
    String(evaluation.remarques_generales || ''), JSON.stringify(evaluation.conseils), raw, req.user.id, now
  )
  res.json({ ok: true, evaluated_at: now })
})

router.delete('/audios/:id', (req, res) => {
  const db = getDb()
  const audio = getAudio(db, req.params.id, req.user.id)
  if (!audio) return res.status(404).json({ error: 'Audio introuvable' })
  db.prepare('DELETE FROM elocution_audios WHERE id = ? AND user_id = ?').run(audio.id, req.user.id)
  try { fs.unlinkSync(path.join(RECORDINGS_DIR, path.basename(audio.filename))) } catch (_) {}
  res.json({ ok: true })
})

function normalizeCourse(body = {}) {
  const chapters = Array.isArray(body.chapters) ? body.chapters : (Array.isArray(body.days) ? body.days : [])
  return {
    title: String(body.title || body.titre || '').trim().slice(0, 200),
    description: nullable(body.description || body.objectif),
    chapters: chapters.slice(0, 200).map((chapter, index) => ({
      number: Number.isInteger(Number(chapter.number ?? chapter.numero ?? chapter.day ?? chapter.jour)) ? Number(chapter.number ?? chapter.numero ?? chapter.day ?? chapter.jour) : index + 1,
      title: String(chapter.title || chapter.titre || `Jour ${index + 1}`).trim().slice(0, 200),
      description: nullable(chapter.description || chapter.objectif),
      exercises: (Array.isArray(chapter.exercises) ? chapter.exercises : (Array.isArray(chapter.exercices) ? chapter.exercices : [])).slice(0, 200).map(exercise => ({
        type: String(exercise.type || 'lecture').trim().slice(0, 80),
        instruction: String(exercise.instruction || exercise.consigne || '').trim().slice(0, 5000),
        supportText: nullable(exercise.support_text || exercise.texte_support),
        parameters: exercise.parameters || exercise.parametres || {},
      })).filter(exercise => exercise.instruction),
    })).filter(chapter => chapter.exercises.length > 0),
  }
}

function validateEvaluation(value) {
  if (!value || typeof value !== 'object') return 'La réponse doit être un objet JSON.'
  if (!validScore(value.score_global)) return 'score_global doit être un nombre entre 0 et 10.'
  const details = value.scores_details
  for (const key of ['debit', 'articulation', 'pauses', 'fluidite', 'structure']) {
    if (!details?.[key] || !validScore(details[key].score)) return `scores_details.${key}.score doit être compris entre 0 et 10.`
  }
  if (!Array.isArray(value.conseils) || !value.conseils.every(item => typeof item === 'string')) return 'conseils doit être une liste de textes.'
  return null
}

function validScore(value) { return Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 10 }
function nullable(value) { const text = String(value || '').trim(); return text ? text.slice(0, 20000) : null }
function safeJson(value, fallback) { try { return JSON.parse(value) } catch (_) { return fallback } }
function groupBy(rows, key) { return rows.reduce((map, row) => { (map[row[key]] ||= []).push(row); return map }, {}) }
function getAudio(db, id, userId) { return db.prepare('SELECT * FROM elocution_audios WHERE id = ? AND user_id = ?').get(id, userId) }
function normalizeAudio(row) {
  if (!row) return row
  const evaluation = row.global_score == null ? null : {
    score_global: row.global_score,
    scores_details: safeJson(row.detail_scores_json, {}),
    remarques_generales: row.general_remarks || '',
    conseils: safeJson(row.advice_json, []),
    json_brut: row.raw_json,
    date_evaluation: row.evaluated_at,
  }
  return { id: row.id, exercise_id: row.exercise_id, filename: row.filename, duration_seconds: row.duration_seconds, source: row.source, recorded_at: row.recorded_at, evaluation }
}
function getAudioContext(db, id, userId) {
  return db.prepare(`SELECT a.*, e.type exercise_type, e.instruction, e.support_text, e.parameters_json,
    c.number chapter_number, c.title chapter_title, c.description chapter_description,
    co.title course_title, co.description course_description
    FROM elocution_audios a JOIN elocution_exercises e ON e.id=a.exercise_id
    JOIN elocution_chapters c ON c.id=e.chapter_id JOIN elocution_courses co ON co.id=c.course_id
    WHERE a.id=? AND a.user_id=? AND e.user_id=? AND c.user_id=? AND co.user_id=?`).get(id, userId, userId, userId, userId)
}
function buildPrompt(c) {
  const lines = [
    "Tu es un coach vocal spécialisé en élocution et en réduction du débit de parole excessif.", '',
    "Voici un enregistrement audio d'un exercice d'entraînement à l'élocution, à évaluer dans son contexte.", '',
    `Contexte du cours : ${c.course_title}`,
  ]
  if (c.course_description) lines.push(`Objectif général du cours : ${c.course_description}`)
  lines.push('', `Contexte du chapitre/jour : ${c.chapter_title} (jour ${c.chapter_number})`)
  if (c.chapter_description) lines.push(`Objectif de ce chapitre : ${c.chapter_description}`)
  lines.push('', "Contexte de l'exercice précis :", `- Type d'exercice : ${c.exercise_type}`, `- Consigne donnée : ${c.instruction}`)
  if (c.support_text) lines.push(`- Support utilisé (texte lu, virelangue, etc.) : ${c.support_text}`)
  const parameters = safeJson(c.parameters_json, {})
  if (Object.keys(parameters).length) lines.push(`- Paramètres : ${JSON.stringify(parameters)}`)
  lines.push('', "Analyse cet audio selon les critères suivants, en tenant compte du contexte ci-dessus :",
    '1. Débit de parole (mots/minute perçu, régularité)', '2. Articulation (clarté des sons, syllabes avalées ou non)',
    '3. Pauses et respiration (présence, pertinence, régularité)', '4. Fluidité générale (hésitations, tics de langage)',
    '5. Structure du discours (phrases courtes vs. trop longues, organisation des idées)', '',
    'Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ou après, au format suivant :', '',
    JSON.stringify({ score_global: 0, scores_details: { debit: { score: 0, commentaire: '' }, articulation: { score: 0, commentaire: '' }, pauses: { score: 0, commentaire: '' }, fluidite: { score: 0, commentaire: '' }, structure: { score: 0, commentaire: '' } }, remarques_generales: '', conseils: ['', ''] }, null, 2), '',
    'Chaque score est noté sur 10. Sois direct, constructif, et base-toi uniquement sur ce que tu entends dans l’audio.'
  )
  return lines.join('\n')
}

router.use((err, req, res, next) => {
  if (!(err instanceof multer.MulterError)) return next(err)
  res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Audio trop volumineux (50 Mo maximum)' : 'Upload audio invalide' })
})

module.exports = router
