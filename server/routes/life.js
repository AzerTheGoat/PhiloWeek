const express = require('express')
const router = express.Router()
const { v4: uuidv4 } = require('uuid')
const { getDb } = require('../db')

router.get('/quotes', (req, res) => {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM quotes WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)
  res.json(rows)
})

router.post('/quotes', (req, res) => {
  const db = getDb()
  const now = new Date().toISOString()
  const id = uuidv4()
  const tags = Array.isArray(req.body.tags)
    ? JSON.stringify(req.body.tags.map(String))
    : JSON.stringify([])

  db.prepare(`
    INSERT INTO quotes (id, quote, author, source, notes, tags, user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    String(req.body.quote || '').trim(),
    emptyToNull(req.body.author),
    emptyToNull(req.body.source),
    emptyToNull(req.body.notes),
    tags,
    req.user.id,
    now,
    now,
  )

  res.status(201).json(db.prepare('SELECT * FROM quotes WHERE id = ? AND user_id = ?').get(id, req.user.id))
})

router.put('/quotes/:id', (req, res) => {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM quotes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })

  const tags = Array.isArray(req.body.tags)
    ? JSON.stringify(req.body.tags.map(String))
    : existing.tags

  db.prepare(`
    UPDATE quotes
    SET quote = ?, author = ?, source = ?, notes = ?, tags = ?, updated_at = ?
    WHERE id = ?
  `).run(
    req.body.quote !== undefined ? String(req.body.quote).trim() : existing.quote,
    req.body.author !== undefined ? emptyToNull(req.body.author) : existing.author,
    req.body.source !== undefined ? emptyToNull(req.body.source) : existing.source,
    req.body.notes !== undefined ? emptyToNull(req.body.notes) : existing.notes,
    tags,
    new Date().toISOString(),
    req.params.id,
  )

  res.json(db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id))
})

router.delete('/quotes/:id', (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM quotes WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id)
  res.json({ ok: true })
})

router.post('/report', async (req, res) => {
  res.status(410).json({ error: 'Le rapport IA a ete retire. Utilise le panneau Copier pour copier un recap de periode.' })
})

function emptyToNull(value) {
  const text = String(value || '').trim()
  return text || null
}

module.exports = router
