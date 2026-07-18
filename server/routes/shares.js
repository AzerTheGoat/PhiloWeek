const express = require('express')
const { v4: uuidv4 } = require('uuid')
const { getDb } = require('../db')
const { requireFileAccess } = require('../fileAccess')

const router = express.Router()
const PRESENCE_TTL_MS = 45 * 1000
const presence = new Map()

setInterval(() => {
  const now = Date.now()
  for (const [fileId, participants] of presence) {
    for (const [userId, participant] of participants) {
      if (now - participant.lastSeen > PRESENCE_TTL_MS) participants.delete(userId)
    }
    if (participants.size === 0) presence.delete(fileId)
  }
}, 60 * 1000).unref()

router.post('/presence/:fileId', (req, res) => {
  const db = getDb()
  const check = requireFileAccess(db, req.params.fileId, req.user.id, 'read')
  if (check.error) return res.status(check.status).json({ error: check.error })
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id)
  const now = Date.now()
  const participants = presence.get(req.params.fileId) || new Map()
  participants.set(req.user.id, { username: user?.username || 'Utilisateur', lastSeen: now })
  for (const [id, participant] of participants) {
    if (now - participant.lastSeen > PRESENCE_TTL_MS) participants.delete(id)
  }
  presence.set(req.params.fileId, participants)
  res.json({
    content_version: Number(check.access.file.content_version || 0),
    participants: Array.from(participants.entries()).map(([id, participant]) => ({
      username: participant.username,
      is_me: id === req.user.id,
      last_seen_at: new Date(participant.lastSeen).toISOString(),
    })),
  })
})

router.delete('/presence/:fileId', (req, res) => {
  presence.get(req.params.fileId)?.delete(req.user.id)
  res.json({ ok: true })
})

router.get('/:fileId', (req, res) => {
  const db = getDb()
  const check = requireFileAccess(db, req.params.fileId, req.user.id, 'owner')
  if (check.error) return res.status(check.status).json({ error: check.error })
  const rows = db.prepare(`
    WITH RECURSIVE ancestors(id, parent_id, depth) AS (
      SELECT id, parent_id, 0 FROM files WHERE id = ?
      UNION ALL
      SELECT parent.id, parent.parent_id, ancestors.depth + 1
      FROM files parent JOIN ancestors ON parent.id = ancestors.parent_id
    )
    SELECT s.id, s.permission, s.created_at, s.updated_at,
      u.id AS user_id, u.username, s.file_id AS source_file_id,
      source.name AS source_name, CASE WHEN s.file_id = ? THEN 0 ELSE 1 END AS is_inherited
    FROM ancestors
    JOIN file_shares s ON s.file_id = ancestors.id
    JOIN users u ON u.id = s.shared_with_user_id
    JOIN files source ON source.id = s.file_id
    WHERE s.owner_id = ?
    ORDER BY lower(u.username), ancestors.depth ASC
  `).all(req.params.fileId, req.params.fileId, req.user.id)
  res.json(rows)
})

router.post('/:fileId', (req, res) => {
  const db = getDb()
  const check = requireFileAccess(db, req.params.fileId, req.user.id, 'owner')
  if (check.error) return res.status(check.status).json({ error: check.error })
  if (check.access.file.type === 'locked_folder') {
    return res.status(409).json({ error: 'Deverrouille le dossier avant de le partager' })
  }
  const username = String(req.body?.username || '').trim()
  const permission = req.body?.permission === 'edit' ? 'edit' : 'view'
  if (!username) return res.status(400).json({ error: 'Identifiant utilisateur requis' })
  const target = db.prepare('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE').get(username)
  if (!target) return res.status(404).json({ error: 'Aucun utilisateur ne correspond a cet identifiant' })
  if (target.id === req.user.id) return res.status(409).json({ error: 'Tu es deja proprietaire de cet element' })

  const existing = db.prepare(
    'SELECT id FROM file_shares WHERE file_id = ? AND shared_with_user_id = ?'
  ).get(req.params.fileId, target.id)
  const now = new Date().toISOString()
  if (existing) {
    db.prepare('UPDATE file_shares SET permission = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
      .run(permission, now, existing.id, req.user.id)
  } else {
    db.prepare(`
      INSERT INTO file_shares (id, file_id, owner_id, shared_with_user_id, permission, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), req.params.fileId, req.user.id, target.id, permission, now, now)
  }
  const saved = db.prepare(`
    SELECT s.id, s.permission, s.created_at, s.updated_at, u.id AS user_id, u.username
    FROM file_shares s JOIN users u ON u.id = s.shared_with_user_id
    WHERE s.file_id = ? AND s.shared_with_user_id = ?
  `).get(req.params.fileId, target.id)
  res.status(existing ? 200 : 201).json(saved)
})

router.patch('/:fileId/:shareId', (req, res) => {
  const db = getDb()
  const check = requireFileAccess(db, req.params.fileId, req.user.id, 'owner')
  if (check.error) return res.status(check.status).json({ error: check.error })
  const permission = req.body?.permission === 'edit' ? 'edit' : 'view'
  const result = db.prepare(`
    UPDATE file_shares SET permission = ?, updated_at = ?
    WHERE id = ? AND file_id = ? AND owner_id = ?
  `).run(permission, new Date().toISOString(), req.params.shareId, req.params.fileId, req.user.id)
  if (!result.changes) return res.status(404).json({ error: 'Partage introuvable' })
  res.json({ ok: true, permission })
})

router.delete('/:fileId/:shareId', (req, res) => {
  const db = getDb()
  const check = requireFileAccess(db, req.params.fileId, req.user.id, 'owner')
  if (check.error) return res.status(check.status).json({ error: check.error })
  const result = db.prepare(
    'DELETE FROM file_shares WHERE id = ? AND file_id = ? AND owner_id = ?'
  ).run(req.params.shareId, req.params.fileId, req.user.id)
  if (!result.changes) return res.status(404).json({ error: 'Partage introuvable' })
  res.json({ ok: true })
})

module.exports = router
