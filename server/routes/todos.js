const express = require('express')
const router = express.Router()
const { v4: uuidv4 } = require('uuid')
const { getDb } = require('../db')

router.get('/', (req, res) => {
  const db = getDb()
  const status = req.query.status === 'all' ? 'all' : req.query.status === 'done' ? 'done' : 'open'
  const rows = status === 'all'
    ? db.prepare(`
        SELECT * FROM todos
        WHERE user_id = ?
        ORDER BY status ASC, due_at ASC, created_at DESC
      `).all(req.user.id)
    : db.prepare(`
        SELECT * FROM todos
        WHERE user_id = ? AND status = ?
        ORDER BY due_at ASC, created_at DESC
      `).all(req.user.id, status)
  res.json(rows)
})

router.get('/reminder', (req, res) => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT * FROM todos
    WHERE user_id = ? AND status = 'open'
    ORDER BY due_at ASC, created_at DESC
    LIMIT 12
  `).all(req.user.id)
  res.json(rows)
})

router.post('/', (req, res) => {
  const db = getDb()
  const title = String(req.body.title || '').trim()
  const dueAt = normalizeDueDate(req.body.due_at)
  if (!title) return res.status(400).json({ error: 'title required' })
  if (!dueAt) return res.status(400).json({ error: 'due_at required' })

  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO todos (id, title, notes, status, due_at, user_id, created_at, updated_at)
    VALUES (?, ?, ?, 'open', ?, ?, ?, ?)
  `).run(
    id,
    title,
    emptyToNull(req.body.notes),
    dueAt,
    req.user.id,
    now,
    now,
  )

  res.status(201).json(db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(id, req.user.id))
})

router.get('/dashboard', (req, res) => {
  const db = getDb()
  const days = clampInt(req.query.days, 7, 180, 42)
  const since = shiftDate(todayInput(), -(days - 1))
  const practices = db.prepare(`
    SELECT * FROM agenda_practices
    WHERE user_id = ?
    ORDER BY active DESC, created_at ASC
  `).all(req.user.id)
  const checks = db.prepare(`
    SELECT practice_id, entry_date, done FROM agenda_checks
    WHERE user_id = ? AND entry_date >= ?
    ORDER BY entry_date ASC
  `).all(req.user.id, since)
  const profile = db.prepare('SELECT * FROM life_profiles WHERE user_id = ?').get(req.user.id) || {
    user_id: req.user.id,
    birth_date: null,
    life_expectancy_years: 85,
  }
  res.json({ practices, checks, profile, today: todayInput(), since })
})

router.post('/practices', (req, res) => {
  const db = getDb()
  const title = String(req.body.title || '').trim()
  if (!title) return res.status(400).json({ error: 'title required' })
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO agenda_practices (id, title, color, active, user_id, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?, ?)
  `).run(id, title, normalizeColor(req.body.color), req.user.id, now, now)
  res.status(201).json(db.prepare('SELECT * FROM agenda_practices WHERE id = ? AND user_id = ?').get(id, req.user.id))
})

router.put('/practices/:id', (req, res) => {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM agenda_practices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const title = req.body.title !== undefined ? String(req.body.title).trim() : existing.title
  if (!title) return res.status(400).json({ error: 'title required' })
  const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : existing.active
  const now = new Date().toISOString()
  const archivedAt = active ? null : (existing.archived_at || now)
  db.prepare(`
    UPDATE agenda_practices
    SET title = ?, color = ?, active = ?, updated_at = ?, archived_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    title,
    req.body.color !== undefined ? normalizeColor(req.body.color) : existing.color,
    active,
    now,
    archivedAt,
    req.params.id,
    req.user.id,
  )
  res.json(db.prepare('SELECT * FROM agenda_practices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id))
})

router.put('/practices/:id/check', (req, res) => {
  const db = getDb()
  const practice = db.prepare('SELECT id FROM agenda_practices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!practice) return res.status(404).json({ error: 'Not found' })
  const entryDate = normalizeDate(req.body.entry_date) || todayInput()
  const done = req.body.done ? 1 : 0
  db.prepare(`
    INSERT INTO agenda_checks (practice_id, entry_date, done, user_id, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, practice_id, entry_date)
    DO UPDATE SET done = excluded.done, updated_at = excluded.updated_at
  `).run(req.params.id, entryDate, done, req.user.id, new Date().toISOString())
  res.json({ practice_id: req.params.id, entry_date: entryDate, done })
})

router.delete('/practices/:id', (req, res) => {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM agenda_practices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  db.prepare('DELETE FROM agenda_checks WHERE practice_id = ? AND user_id = ?').run(req.params.id, req.user.id)
  db.prepare('DELETE FROM agenda_practices WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id)
  res.json({ ok: true })
})

router.put('/life-profile', (req, res) => {
  const db = getDb()
  const birthDate = req.body.birth_date ? normalizeDate(req.body.birth_date) : null
  if (req.body.birth_date && !birthDate) return res.status(400).json({ error: 'birth_date invalid' })
  const years = clampInt(req.body.life_expectancy_years, 1, 130, 85)
  db.prepare(`
    INSERT INTO life_profiles (user_id, birth_date, life_expectancy_years, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id)
    DO UPDATE SET birth_date = excluded.birth_date, life_expectancy_years = excluded.life_expectancy_years, updated_at = excluded.updated_at
  `).run(req.user.id, birthDate, years, new Date().toISOString())
  res.json(db.prepare('SELECT * FROM life_profiles WHERE user_id = ?').get(req.user.id))
})

router.put('/:id', (req, res) => {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })

  const nextStatus = req.body.status !== undefined ? String(req.body.status) : existing.status
  if (!['open', 'done'].includes(nextStatus)) return res.status(400).json({ error: 'Invalid status' })

  const nextDueAt = req.body.due_at !== undefined ? normalizeDueDate(req.body.due_at) : existing.due_at
  if (!nextDueAt) return res.status(400).json({ error: 'due_at required' })
  const nextTitle = req.body.title !== undefined ? String(req.body.title).trim() : existing.title
  if (!nextTitle) return res.status(400).json({ error: 'title required' })

  const now = new Date().toISOString()
  const completedAt = nextStatus === 'done'
    ? (existing.completed_at || now)
    : null

  db.prepare(`
    UPDATE todos
    SET title = ?, notes = ?, status = ?, due_at = ?, updated_at = ?, completed_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    nextTitle,
    req.body.notes !== undefined ? emptyToNull(req.body.notes) : existing.notes,
    nextStatus,
    nextDueAt,
    now,
    completedAt,
    req.params.id,
    req.user.id,
  )

  res.json(db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id))
})

router.delete('/:id', (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id)
  res.json({ ok: true })
})

function normalizeDueDate(value) {
  const text = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  return text
}

function normalizeDate(value) {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
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

function todayInput() {
  return new Date().toISOString().slice(0, 10)
}

function shiftDate(date, deltaDays) {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + deltaDays)
  return next.toISOString().slice(0, 10)
}

function emptyToNull(value) {
  const text = String(value || '').trim()
  return text || null
}

module.exports = router
