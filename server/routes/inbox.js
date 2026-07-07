const express = require('express')
const router = express.Router()
const { getDb } = require('../db')
const { v4: uuidv4 } = require('uuid')

// ——— Resources ———

router.get('/resources', (req, res) => {
  const db = getDb()
  const { status, type } = req.query
  let sql = 'SELECT * FROM inbox_resources WHERE user_id = ?'
  const params = [req.user.id]
  if (status) { sql += ' AND status = ?'; params.push(status) }
  if (type) { sql += ' AND type = ?'; params.push(type) }
  sql += ' ORDER BY created_at DESC'
  res.json(db.prepare(sql).all(...params))
})

router.post('/resources', (req, res) => {
  const db = getDb()
  const { url, title, type, notes } = req.body
  if (!url) return res.status(400).json({ error: 'url required' })
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(
    "INSERT INTO inbox_resources (id, url, title, type, notes, status, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'todo', ?, ?, ?)"
  ).run(id, url, title || null, type || 'article', notes || null, req.user.id, now, now)
  res.status(201).json(db.prepare('SELECT * FROM inbox_resources WHERE id = ? AND user_id = ?').get(id, req.user.id))
})

router.put('/resources/:id', (req, res) => {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM inbox_resources WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const { title, status, notes, type } = req.body
  const now = new Date().toISOString()
  const sets = ['updated_at = ?']
  const vals = [now]
  if (title !== undefined) { sets.push('title = ?'); vals.push(title) }
  if (status !== undefined) { sets.push('status = ?'); vals.push(status) }
  if (notes !== undefined) { sets.push('notes = ?'); vals.push(notes) }
  if (type !== undefined) { sets.push('type = ?'); vals.push(type) }
  vals.push(req.params.id)
  db.prepare(`UPDATE inbox_resources SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  res.json(db.prepare('SELECT * FROM inbox_resources WHERE id = ?').get(req.params.id))
})

router.delete('/resources/:id', (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM inbox_resources WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id)
  res.json({ ok: true })
})

// ——— Ideas ———

router.get('/ideas', (req, res) => {
  const db = getDb()
  res.json(db.prepare('SELECT * FROM inbox_ideas WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id))
})

router.post('/ideas', (req, res) => {
  const db = getDb()
  const { content, tags } = req.body
  if (!content?.trim()) return res.status(400).json({ error: 'content required' })
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO inbox_ideas (id, content, tags, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, content.trim(), JSON.stringify(tags || []), req.user.id, now, now)
  res.status(201).json(db.prepare('SELECT * FROM inbox_ideas WHERE id = ? AND user_id = ?').get(id, req.user.id))
})

router.put('/ideas/:id', (req, res) => {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM inbox_ideas WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const { content, tags } = req.body
  const now = new Date().toISOString()
  const sets = ['updated_at = ?']
  const vals = [now]
  if (content !== undefined) { sets.push('content = ?'); vals.push(content.trim()) }
  if (tags !== undefined) { sets.push('tags = ?'); vals.push(JSON.stringify(tags)) }
  vals.push(req.params.id)
  db.prepare(`UPDATE inbox_ideas SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  res.json(db.prepare('SELECT * FROM inbox_ideas WHERE id = ?').get(req.params.id))
})

router.delete('/ideas/:id', (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM inbox_ideas WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id)
  res.json({ ok: true })
})

router.post('/ideas/:id/send-to-file', (req, res) => {
  const db = getDb()
  const { fileId } = req.body
  if (!fileId) return res.status(400).json({ error: 'fileId required' })

  const idea = db.prepare('SELECT * FROM inbox_ideas WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!idea) return res.status(404).json({ error: 'Idea not found' })

  const file = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').get(fileId, req.user.id)
  if (!file) return res.status(404).json({ error: 'File not found' })

  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const append = `\n\n---\n*Idée capturée le ${date} :*\n\n${idea.content}\n`
  const newContent = (file.content || '') + append

  db.prepare("UPDATE files SET content = ?, updated_at = datetime('now') WHERE id = ?").run(newContent, fileId)
  db.prepare('DELETE FROM inbox_ideas WHERE id = ?').run(req.params.id)

  res.json({ ok: true, file: db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) })
})

module.exports = router
