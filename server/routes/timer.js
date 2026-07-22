const express = require('express')
const router = express.Router()
const { getDb } = require('../db')
const { v4: uuidv4 } = require('uuid')
const { requireFileAccess } = require('../fileAccess')
const { summarizeAppUsage } = require('../appUsage')

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

router.get('/', (req, res) => {
  const db = getDb()
  const { file_id } = req.query
  const rows = file_id
    ? db.prepare('SELECT * FROM timer_sessions WHERE file_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 50').all(file_id, req.user.id)
    : db.prepare('SELECT * FROM timer_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(req.user.id)
  res.json(rows)
})

router.get('/stats', (req, res) => {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)
  const { total: todaySeconds } = db.prepare(
    "SELECT COALESCE(SUM(duration_seconds),0) as total FROM timer_sessions WHERE date(created_at) = ? AND user_id = ?"
  ).get(today, req.user.id) || { total: 0 }
  const { total: allSeconds } = db.prepare(
    "SELECT COALESCE(SUM(duration_seconds),0) as total FROM timer_sessions WHERE user_id = ?"
  ).get(req.user.id) || { total: 0 }
  res.json({ today_seconds: todaySeconds, total_seconds: allSeconds })
})

router.get('/app-usage', (req, res) => {
  const db = getDb()
  const today = isValidDay(String(req.query.day || ''))
    ? String(req.query.day)
    : logicalDay(new Date())
  const history = db.prepare(`
    SELECT entry_date, duration_seconds
    FROM app_usage_daily
    WHERE user_id = ?
    ORDER BY entry_date DESC
  `).all(req.user.id)

  res.json({
    day_boundary_hour: 3,
    today,
    ...summarizeAppUsage(history, today),
    history,
  })
})

router.post('/app-usage', (req, res) => {
  const db = getDb()
  const entries = Array.isArray(req.body?.entries) ? req.body.entries : []
  const normalized = entries
    .map(entry => ({
      day: String(entry?.day || ''),
      seconds: Math.floor(Number(entry?.seconds)),
    }))
    .filter(entry => isValidDay(entry.day) && Number.isFinite(entry.seconds) && entry.seconds > 0 && entry.seconds <= 300)

  if (normalized.length === 0) return res.status(400).json({ error: 'Aucune duree valide' })

  const upsert = db.prepare(`
    INSERT INTO app_usage_daily (user_id, entry_date, duration_seconds, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, entry_date) DO UPDATE SET
      duration_seconds = duration_seconds + excluded.duration_seconds,
      updated_at = datetime('now')
  `)
  db.transaction(() => {
    for (const entry of normalized) upsert.run(req.user.id, entry.day, entry.seconds)
  })()

  res.json({ ok: true })
})

router.post('/', (req, res) => {
  const db = getDb()
  const { file_id, duration_seconds, activity_type, notes } = req.body
  if (!duration_seconds || duration_seconds < 1) {
    return res.status(400).json({ error: 'duration_seconds required' })
  }
  if (file_id) {
    const access = requireFileAccess(db, file_id, req.user.id, 'read')
    if (access.error) return res.status(404).json({ error: 'Fichier introuvable' })
  }
  const id = uuidv4()
  db.prepare(
    "INSERT INTO timer_sessions (id, file_id, duration_seconds, activity_type, notes, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
  ).run(id, file_id || null, duration_seconds, activity_type || 'thinking', notes || null, req.user.id)
  res.status(201).json(db.prepare('SELECT * FROM timer_sessions WHERE id = ? AND user_id = ?').get(id, req.user.id))
})

router.delete('/:id', (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM timer_sessions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id)
  res.json({ ok: true })
})

module.exports = router

function logicalDay(date) {
  const shifted = new Date(date)
  shifted.setHours(shifted.getHours() - 3)
  const year = shifted.getFullYear()
  const month = String(shifted.getMonth() + 1).padStart(2, '0')
  const day = String(shifted.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDay(day) {
  return new Date(`${day}T00:00:00.000Z`)
}

function isValidDay(day) {
  if (!DAY_RE.test(day)) return false
  const date = parseDay(day)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day
}
