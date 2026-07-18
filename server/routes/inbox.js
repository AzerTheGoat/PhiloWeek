const express = require('express')
const router = express.Router()
const { getDb } = require('../db')
const { requireFileAccess } = require('../fileAccess')
const { v4: uuidv4 } = require('uuid')

// N'accepte que des URL http(s). Bloque javascript:, data:, file:, etc.
function isSafeUrl(url) {
  return /^https?:\/\//i.test(String(url || '').trim())
}

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
  if (!isSafeUrl(url)) return res.status(400).json({ error: 'URL invalide (http(s) uniquement)' })
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

  const accessCheck = requireFileAccess(db, fileId, req.user.id, 'edit')
  if (accessCheck.error) return res.status(accessCheck.status).json({ error: accessCheck.error })
  const file = accessCheck.access.file
  if (file.type !== 'file') return res.status(400).json({ error: 'La cible doit etre un fichier' })

  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const append = `\n\n---\n*Idée capturée le ${date} :*\n\n${idea.content}\n`
  const newContent = (file.content || '') + append

  const nextRevision = Number(file.history_revision || 0) + 1
  const now = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM file_revisions WHERE file_id = ? AND revision_no > ?').run(fileId, Number(file.history_revision || 0))
    db.prepare(
      'INSERT OR IGNORE INTO file_revisions (file_id, user_id, revision_no, content, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(fileId, file.user_id, Number(file.history_revision || 0), file.content || '', file.updated_at || now)
    db.prepare(
      'INSERT INTO file_revisions (file_id, user_id, revision_no, content, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(fileId, file.user_id, nextRevision, newContent, now)
    db.prepare('UPDATE file_revisions SET actor_user_id = ? WHERE file_id = ? AND revision_no IN (?, ?)')
      .run(req.user.id, fileId, Number(file.history_revision || 0), nextRevision)
    db.prepare('UPDATE files SET content = ?, history_revision = ?, content_version = content_version + 1, last_edited_by = ?, updated_at = ? WHERE id = ?')
      .run(newContent, nextRevision, req.user.id, now, fileId)
    db.prepare('DELETE FROM inbox_ideas WHERE id = ?').run(req.params.id)
  })
  tx()

  res.json({ ok: true, file: db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) })
})

module.exports = router
