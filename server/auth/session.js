const crypto = require('crypto')
const { v4: uuidv4 } = require('uuid')
const { getDb } = require('../db')

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 jours

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// Retourne le token BRUT (jamais stocké tel quel : seul son hash SHA-256
// vit en base, donc une fuite de la DB seule ne suffit pas à se connecter).
function createSession(userId, userAgent) {
  const token = crypto.randomBytes(32).toString('hex')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)
  getDb().prepare(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, user_agent, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(uuidv4(), userId, hashToken(token), now.toISOString(), expiresAt.toISOString(), userAgent || null, now.toISOString())
  return token
}

// Résout un token brut en { id, username }, ou null. Supprime
// paresseusement la session si elle est expirée.
function resolveSession(token) {
  if (!token) return null
  const db = getDb()
  const session = db.prepare(
    `SELECT s.id as session_id, s.expires_at, u.id as user_id, u.username
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`
  ).get(hashToken(token))
  if (!session) return null
  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(session.session_id)
    return null
  }
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), session.session_id)
  return { id: session.user_id, username: session.username }
}

function destroySession(token) {
  if (!token) return
  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
}

function pruneExpiredSessions() {
  getDb().prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString())
}

module.exports = { createSession, resolveSession, destroySession, pruneExpiredSessions, SESSION_TTL_MS }
