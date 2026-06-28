const express = require('express')
const router = express.Router()
const { getDb } = require('../db')
const { v4: uuidv4 } = require('uuid')

router.get('/', (req, res) => {
  const db = getDb()
  const { file_id } = req.query
  const rows = file_id
    ? db.prepare('SELECT * FROM timer_sessions WHERE file_id = ? ORDER BY created_at DESC LIMIT 50').all(file_id)
    : db.prepare('SELECT * FROM timer_sessions ORDER BY created_at DESC LIMIT 100').all()
  res.json(rows)
})

router.get('/stats', (req, res) => {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)
  const { total: todaySeconds } = db.prepare(
    "SELECT COALESCE(SUM(duration_seconds),0) as total FROM timer_sessions WHERE date(created_at) = ?"
  ).get(today) || { total: 0 }
  const { total: allSeconds } = db.prepare(
    "SELECT COALESCE(SUM(duration_seconds),0) as total FROM timer_sessions"
  ).get() || { total: 0 }
  res.json({ today_seconds: todaySeconds, total_seconds: allSeconds })
})

router.post('/', (req, res) => {
  const db = getDb()
  const { file_id, duration_seconds, activity_type, notes } = req.body
  if (!duration_seconds || duration_seconds < 1) {
    return res.status(400).json({ error: 'duration_seconds required' })
  }
  const id = uuidv4()
  db.prepare(
    "INSERT INTO timer_sessions (id, file_id, duration_seconds, activity_type, notes, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
  ).run(id, file_id || null, duration_seconds, activity_type || 'thinking', notes || null)
  res.status(201).json(db.prepare('SELECT * FROM timer_sessions WHERE id = ?').get(id))
})

router.delete('/:id', (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM timer_sessions WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

module.exports = router
