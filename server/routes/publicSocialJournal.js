const express = require('express')
const { v4: uuidv4 } = require('uuid')
const { getDb } = require('../db')
const crypto = require('crypto')
const { isRailway } = require('../paths')
const { publicReadLimiter } = require('../securityControls')

const router = express.Router()

router.get('/articles/:id', (req, res) => {
  const db = getDb()
  const article = db.prepare(`
    SELECT articles.*,
      users.username AS author_username,
      historical_events.title AS event_title,
      historical_events.start_label AS event_start_label,
      historical_events.end_label AS event_end_label,
      0 AS can_edit,
      (SELECT COUNT(*) FROM article_comments WHERE article_comments.article_id = articles.id) AS comment_count,
      (SELECT COUNT(*) FROM article_reactions WHERE article_reactions.article_id = articles.id AND reaction = 'like') AS like_count,
      (SELECT COUNT(*) FROM article_reads WHERE article_reads.article_id = articles.id) AS read_count,
      0 AS liked_by_me
    FROM articles
    LEFT JOIN users ON users.id = articles.user_id
    LEFT JOIN historical_events ON historical_events.id = articles.event_id
    WHERE articles.id = ? AND articles.status = 'published'
  `).get(req.params.id)

  if (!article) return res.status(404).json({ error: 'Article introuvable ou non publie.' })

  const comments = db.prepare(`
    SELECT article_comments.id, article_comments.article_id, article_comments.parent_id, article_comments.body,
      article_comments.created_at, article_comments.updated_at,
      users.username AS author_username,
      0 AS can_edit
    FROM article_comments
    LEFT JOIN users ON users.id = article_comments.user_id
    WHERE article_comments.article_id = ?
    ORDER BY article_comments.created_at ASC
  `).all(req.params.id)

  res.json({
    ...normalizeArticleRow(article),
    comments,
  })
})

// Lecture depuis le lien public (visiteur sans compte). Dédup par appareil
// via un cookie aléatoire HttpOnly signé par le serveur.
router.post('/articles/:id/read', publicReadLimiter, (req, res) => {
  const db = getDb()
  const published = db.prepare(
    "SELECT id FROM articles WHERE id = ? AND status = 'published'"
  ).get(req.params.id)
  if (!published) return res.status(404).json({ error: 'Article introuvable ou non publie.' })

  const anonId = getSignedReaderId(req, res)

  const now = new Date().toISOString()
  const existing = db.prepare(
    'SELECT id FROM article_reads WHERE article_id = ? AND anon_id = ?'
  ).get(req.params.id, anonId)
  if (existing) {
    db.prepare('UPDATE article_reads SET updated_at = ? WHERE id = ?').run(now, existing.id)
  } else {
    db.prepare(
      'INSERT INTO article_reads (id, article_id, anon_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(uuidv4(), req.params.id, anonId, now, now)
  }

  const read_count = db.prepare(
    'SELECT COUNT(*) AS count FROM article_reads WHERE article_id = ?'
  ).get(req.params.id).count
  res.json({ read_count: Number(read_count || 0) })
})

function getSignedReaderId(req, res) {
  const secret = readerSecret()
  const raw = String(req.cookies?.pw_reader || '')
  const [id, signature] = raw.split('.')
  if (/^[a-zA-Z0-9_-]{24,64}$/.test(id || '') && safeEqual(signature, signReader(id, secret))) {
    return crypto.createHmac('sha256', secret).update(id).digest('base64url')
  }
  const next = crypto.randomBytes(24).toString('base64url')
  res.cookie('pw_reader', `${next}.${signReader(next, secret)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isRailway || process.env.NODE_ENV === 'production',
    path: '/api/public/social-journal',
    maxAge: 365 * 24 * 60 * 60 * 1000,
  })
  return crypto.createHmac('sha256', secret).update(next).digest('base64url')
}

let fallbackReaderSecret = null
function readerSecret() {
  if (process.env.PUBLIC_READER_SECRET?.length >= 32) return process.env.PUBLIC_READER_SECRET
  if (!fallbackReaderSecret) fallbackReaderSecret = crypto.randomBytes(32)
  return fallbackReaderSecret
}

function signReader(id, secret) {
  return crypto.createHmac('sha256', secret).update(id).digest('base64url')
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function normalizeArticleRow(row) {
  return {
    ...row,
    can_edit: false,
    liked_by_me: false,
    comment_count: Number(row.comment_count || 0),
    like_count: Number(row.like_count || 0),
    read_count: Number(row.read_count || 0),
  }
}

module.exports = router
