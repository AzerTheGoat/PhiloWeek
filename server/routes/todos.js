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

function emptyToNull(value) {
  const text = String(value || '').trim()
  return text || null
}

module.exports = router
