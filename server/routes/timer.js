const express = require('express')
const router = express.Router()
const { getDb } = require('../db')
const { v4: uuidv4 } = require('uuid')

router.get('/', async (req, res) => {
  const db = await getDb()
  const { file_id } = req.query
  const rows = file_id
    ? await db.all('SELECT * FROM timer_sessions WHERE file_id = ? ORDER BY created_at DESC LIMIT 50', [file_id])
    : await db.all('SELECT * FROM timer_sessions ORDER BY created_at DESC LIMIT 100')
  res.json(rows)
})

router.get('/stats', async (req, res) => {
  const db = await getDb()
  const today = new Date().toISOString().slice(0, 10)
  const { total: todaySeconds } = await db.get(
    "SELECT COALESCE(SUM(duration_seconds),0) as total FROM timer_sessions WHERE date(created_at) = ?",
    [today]
  ) || { total: 0 }
  const { total: allSeconds } = await db.get(
    "SELECT COALESCE(SUM(duration_seconds),0) as total FROM timer_sessions"
  ) || { total: 0 }
  res.json({ today_seconds: todaySeconds, total_seconds: allSeconds })
})

router.post('/', async (req, res) => {
  const db = await getDb()
  const { file_id, duration_seconds, activity_type, notes } = req.body
  if (!duration_seconds || duration_seconds < 1) {
    return res.status(400).json({ error: 'duration_seconds required' })
  }
  const id = uuidv4()
  await db.run(
    "INSERT INTO timer_sessions (id, file_id, duration_seconds, activity_type, notes, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
    [id, file_id || null, duration_seconds, activity_type || 'thinking', notes || null]
  )
  res.status(201).json(await db.get('SELECT * FROM timer_sessions WHERE id = ?', [id]))
})

router.delete('/:id', async (req, res) => {
  const db = await getDb()
  await db.run('DELETE FROM timer_sessions WHERE id = ?', [req.params.id])
  res.json({ ok: true })
})

module.exports = router
