const express = require('express')
const router = express.Router()
const { getDb } = require('../db')
const { requireFileAccess } = require('../fileAccess')
const { encryptCurrentFileContent, encryptRevisionContent, materializeFile } = require('../vaultCrypto')
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
  let file
  try { file = materializeFile(db, accessCheck.access.file, req.user.session_id) }
  catch (error) { return res.status(error.status || 423).json({ error: error.message, code: error.code }) }
  if (file.type !== 'file') return res.status(400).json({ error: 'La cible doit etre un fichier' })

  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const append = `\n\n---\n*Idée capturée le ${date} :*\n\n${idea.content}\n`
  const newContent = (file.content || '') + append

  const nextRevision = Number(file.history_revision || 0) + 1
  const now = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM file_revisions WHERE file_id = ? AND revision_no > ?').run(fileId, Number(file.history_revision || 0))
    const currentEncrypted = file.encrypted_folder_id
      ? encryptRevisionContent(fileId, Number(file.history_revision || 0), file.content || '', file.encrypted_folder_id, req.user.session_id)
      : null
    const nextEncrypted = file.encrypted_folder_id
      ? encryptRevisionContent(fileId, nextRevision, newContent, file.encrypted_folder_id, req.user.session_id)
      : null
    const insertRevision = db.prepare(`
      INSERT OR IGNORE INTO file_revisions (
        file_id, user_id, revision_no, content, encrypted_content, encrypted_folder_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    insertRevision.run(
      fileId, file.user_id, Number(file.history_revision || 0), file.encrypted_folder_id ? '' : (file.content || ''),
      currentEncrypted, file.encrypted_folder_id || null, file.updated_at || now
    )
    insertRevision.run(
      fileId, file.user_id, nextRevision, file.encrypted_folder_id ? '' : newContent,
      nextEncrypted, file.encrypted_folder_id || null, now
    )
    db.prepare('UPDATE file_revisions SET actor_user_id = ? WHERE file_id = ? AND revision_no IN (?, ?)')
      .run(req.user.id, fileId, Number(file.history_revision || 0), nextRevision)
    if (file.encrypted_folder_id) {
      db.prepare(`
        UPDATE files SET content = NULL, encrypted_content = ?, history_revision = ?,
          content_version = content_version + 1, last_edited_by = ?, updated_at = ? WHERE id = ?
      `).run(
        encryptCurrentFileContent(fileId, newContent, file.encrypted_folder_id, req.user.session_id),
        nextRevision, req.user.id, now, fileId
      )
    } else {
      db.prepare('UPDATE files SET content = ?, history_revision = ?, content_version = content_version + 1, last_edited_by = ?, updated_at = ? WHERE id = ?')
        .run(newContent, nextRevision, req.user.id, now, fileId)
    }
    db.prepare('DELETE FROM inbox_ideas WHERE id = ?').run(req.params.id)
  })
  tx()

  res.json({ ok: true, file: { id: fileId, content_version: Number(file.content_version || 0) + 1 } })
})

module.exports = router
