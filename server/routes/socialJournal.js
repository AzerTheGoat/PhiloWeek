const express = require('express')
const { v4: uuidv4 } = require('uuid')
const { getDb } = require('../db')

const router = express.Router()

router.get('/articles', (req, res) => {
  const db = getDb()
  const scope = String(req.query.scope || 'feed')
  const query = String(req.query.q || '').trim().toLowerCase()
  const today = normalizeDate(req.query.date) || new Date().toISOString().slice(0, 10)

  const params = { userId: req.user.id }
  let where = "articles.status = 'published'"
  if (scope === 'mine') {
    where = 'articles.user_id = @userId'
  } else if (scope === 'today') {
    where = "articles.status = 'published' AND articles.published_on = @today"
    params.today = today
  }
  if (query) {
    where += ` AND (
      lower(articles.title) LIKE @query
      OR lower(COALESCE(articles.excerpt, '')) LIKE @query
      OR lower(COALESCE(articles.content, '')) LIKE @query
      OR lower(COALESCE(articles.tags, '')) LIKE @query
      OR lower(COALESCE(users.username, '')) LIKE @query
    )`
    params.query = `%${query}%`
  }

  const rows = db.prepare(articleSelectSql(where, `
    CASE WHEN articles.published_on = @todayFallback THEN 0 ELSE 1 END ASC,
    COALESCE(articles.published_at, articles.updated_at) DESC
  `)).all({ ...params, todayFallback: today })
  res.json(rows.map(normalizeArticleRow))
})

router.get('/articles/:id', (req, res) => {
  const db = getDb()
  const row = db.prepare(articleSelectSql(
    "(articles.id = @id) AND (articles.status = 'published' OR articles.user_id = @userId)",
    'articles.updated_at DESC'
  )).get({ id: req.params.id, userId: req.user.id, todayFallback: new Date().toISOString().slice(0, 10) })
  if (!row) return res.status(404).json({ error: 'Article introuvable.' })
  res.json({
    ...normalizeArticleRow(row),
    comments: getComments(db, req.params.id, req.user.id),
  })
})

router.post('/articles', (req, res) => {
  const db = getDb()
  const data = normalizeArticlePayload(req.body)
  if (!data.title) return res.status(400).json({ error: 'Titre requis.' })
  if (!data.content) return res.status(400).json({ error: 'Texte requis.' })
  if (data.event_id && !eventExists(db, data.event_id)) {
    return res.status(400).json({ error: 'Repere de frise introuvable.' })
  }

  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO articles (
      id, title, excerpt, content, status, published_on, published_at,
      cover_image_data, tags, event_id, user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.title,
    data.excerpt,
    data.content,
    data.status,
    data.published_on,
    data.status === 'published' ? now : null,
    data.cover_image_data,
    data.tags,
    data.event_id,
    req.user.id,
    now,
    now
  )

  res.status(201).json(getArticleForResponse(db, id, req.user.id))
})

router.put('/articles/:id', (req, res) => {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Article introuvable.' })
  if (existing.user_id !== req.user.id) return res.status(403).json({ error: 'Tu peux modifier seulement tes articles.' })

  const data = normalizeArticlePayload({ ...existing, ...req.body })
  if (!data.title) return res.status(400).json({ error: 'Titre requis.' })
  if (!data.content) return res.status(400).json({ error: 'Texte requis.' })
  if (data.event_id && !eventExists(db, data.event_id)) {
    return res.status(400).json({ error: 'Repere de frise introuvable.' })
  }

  const now = new Date().toISOString()
  const publishedAt = existing.published_at || (data.status === 'published' ? now : null)
  db.prepare(`
    UPDATE articles
    SET title = ?, excerpt = ?, content = ?, status = ?, published_on = ?,
      published_at = ?, cover_image_data = ?, tags = ?, event_id = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    data.title,
    data.excerpt,
    data.content,
    data.status,
    data.published_on,
    data.status === 'published' ? publishedAt : null,
    data.cover_image_data,
    data.tags,
    data.event_id,
    now,
    req.params.id,
    req.user.id
  )

  res.json(getArticleForResponse(db, req.params.id, req.user.id))
})

router.delete('/articles/:id', (req, res) => {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Article introuvable.' })
  if (existing.user_id !== req.user.id) return res.status(403).json({ error: 'Tu peux supprimer seulement tes articles.' })
  db.prepare('DELETE FROM articles WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id)
  res.json({ ok: true })
})

router.post('/articles/:id/reaction', (req, res) => {
  const db = getDb()
  const article = readableArticle(db, req.params.id, req.user.id)
  if (!article) return res.status(404).json({ error: 'Article introuvable.' })
  const existing = db.prepare(`
    SELECT 1 FROM article_reactions
    WHERE article_id = ? AND user_id = ? AND reaction = 'like'
  `).get(req.params.id, req.user.id)
  if (existing) {
    db.prepare(`
      DELETE FROM article_reactions
      WHERE article_id = ? AND user_id = ? AND reaction = 'like'
    `).run(req.params.id, req.user.id)
  } else {
    db.prepare(`
      INSERT OR IGNORE INTO article_reactions (article_id, user_id, reaction, created_at)
      VALUES (?, ?, 'like', ?)
    `).run(req.params.id, req.user.id, new Date().toISOString())
  }
  res.json(reactionSummary(db, req.params.id, req.user.id))
})

router.post('/articles/:id/read', (req, res) => {
  const db = getDb()
  const article = readableArticle(db, req.params.id, req.user.id)
  if (!article) return res.status(404).json({ error: 'Article introuvable.' })
  recordUserRead(db, req.params.id, req.user.id)
  res.json({
    read_count: readCount(db, req.params.id),
    read_by_me: true,
  })
})

router.get('/articles/:id/comments', (req, res) => {
  const db = getDb()
  const article = readableArticle(db, req.params.id, req.user.id)
  if (!article) return res.status(404).json({ error: 'Article introuvable.' })
  res.json(getComments(db, req.params.id, req.user.id))
})

router.post('/articles/:id/comments', (req, res) => {
  const db = getDb()
  const article = readableArticle(db, req.params.id, req.user.id)
  if (!article) return res.status(404).json({ error: 'Article introuvable.' })
  const body = String(req.body?.body || '').trim()
  if (!body) return res.status(400).json({ error: 'Commentaire vide.' })
  if (body.length > 2000) return res.status(400).json({ error: 'Commentaire trop long.' })
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO article_comments (id, article_id, body, user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, body, req.user.id, now, now)
  res.status(201).json(db.prepare(`
    SELECT article_comments.*, users.username AS author_username,
      1 AS can_edit
    FROM article_comments
    LEFT JOIN users ON users.id = article_comments.user_id
    WHERE article_comments.id = ?
  `).get(id))
})

router.delete('/comments/:id', (req, res) => {
  const db = getDb()
  const comment = db.prepare(`
    SELECT article_comments.*, articles.user_id AS article_owner_id
    FROM article_comments
    JOIN articles ON articles.id = article_comments.article_id
    WHERE article_comments.id = ?
  `).get(req.params.id)
  if (!comment) return res.status(404).json({ error: 'Commentaire introuvable.' })
  if (comment.user_id !== req.user.id && comment.article_owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Tu peux supprimer seulement tes commentaires ou ceux sous tes articles.' })
  }
  db.prepare('DELETE FROM article_comments WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

function articleSelectSql(where, orderBy) {
  return `
    SELECT articles.*,
      users.username AS author_username,
      historical_events.title AS event_title,
      historical_events.start_label AS event_start_label,
      historical_events.end_label AS event_end_label,
      CASE WHEN articles.user_id = @userId THEN 1 ELSE 0 END AS can_edit,
      (SELECT COUNT(*) FROM article_comments WHERE article_comments.article_id = articles.id) AS comment_count,
      (SELECT COUNT(*) FROM article_reactions WHERE article_reactions.article_id = articles.id AND reaction = 'like') AS like_count,
      (SELECT COUNT(*) FROM article_reads WHERE article_reads.article_id = articles.id) AS read_count,
      EXISTS (
        SELECT 1 FROM article_reactions
        WHERE article_reactions.article_id = articles.id
          AND article_reactions.user_id = @userId
          AND article_reactions.reaction = 'like'
      ) AS liked_by_me,
      EXISTS (
        SELECT 1 FROM article_reads
        WHERE article_reads.article_id = articles.id
          AND article_reads.user_id = @userId
      ) AS read_by_me
    FROM articles
    LEFT JOIN users ON users.id = articles.user_id
    LEFT JOIN historical_events ON historical_events.id = articles.event_id
    WHERE ${where}
    ORDER BY ${orderBy}
  `
}

function getArticleForResponse(db, id, userId) {
  const row = db.prepare(articleSelectSql(
    "(articles.id = @id) AND (articles.status = 'published' OR articles.user_id = @userId)",
    'articles.updated_at DESC'
  )).get({ id, userId, todayFallback: new Date().toISOString().slice(0, 10) })
  return row ? normalizeArticleRow(row) : null
}

function readableArticle(db, id, userId) {
  return db.prepare(`
    SELECT id FROM articles
    WHERE id = ? AND (status = 'published' OR user_id = ?)
  `).get(id, userId)
}

function reactionSummary(db, articleId, userId) {
  return {
    like_count: db.prepare(`
      SELECT COUNT(*) AS count FROM article_reactions
      WHERE article_id = ? AND reaction = 'like'
    `).get(articleId).count,
    liked_by_me: Boolean(db.prepare(`
      SELECT 1 FROM article_reactions
      WHERE article_id = ? AND user_id = ? AND reaction = 'like'
    `).get(articleId, userId)),
  }
}

function readCount(db, articleId) {
  return db.prepare('SELECT COUNT(*) AS count FROM article_reads WHERE article_id = ?').get(articleId).count
}

// Enregistre (ou rafraîchit) la lecture d'un article par un compte connecté.
// Dédup : une seule ligne par (article, user) grâce à l'index unique partiel.
function recordUserRead(db, articleId, userId) {
  const now = new Date().toISOString()
  const existing = db.prepare(
    'SELECT id FROM article_reads WHERE article_id = ? AND user_id = ?'
  ).get(articleId, userId)
  if (existing) {
    db.prepare('UPDATE article_reads SET updated_at = ? WHERE id = ?').run(now, existing.id)
  } else {
    db.prepare(
      'INSERT INTO article_reads (id, article_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(uuidv4(), articleId, userId, now, now)
  }
}

function getComments(db, articleId, userId) {
  return db.prepare(`
    SELECT article_comments.*, users.username AS author_username,
      CASE WHEN article_comments.user_id = @userId OR articles.user_id = @userId THEN 1 ELSE 0 END AS can_edit
    FROM article_comments
    JOIN articles ON articles.id = article_comments.article_id
    LEFT JOIN users ON users.id = article_comments.user_id
    WHERE article_comments.article_id = @articleId
    ORDER BY article_comments.created_at ASC
  `).all({ articleId, userId })
}

function normalizeArticlePayload(body = {}) {
  const status = body.status === 'published' ? 'published' : 'draft'
  return {
    title: String(body.title || '').trim().slice(0, 180),
    excerpt: emptyToNull(String(body.excerpt || '').trim().slice(0, 360)),
    content: String(body.content || '').trim(),
    status,
    published_on: normalizeDate(body.published_on) || new Date().toISOString().slice(0, 10),
    cover_image_data: normalizeImage(body.cover_image_data),
    tags: normalizeTags(body.tags),
    event_id: emptyToNull(body.event_id),
  }
}

function normalizeArticleRow(row) {
  return {
    ...row,
    can_edit: Boolean(row.can_edit),
    liked_by_me: Boolean(row.liked_by_me),
    read_by_me: Boolean(row.read_by_me),
    comment_count: Number(row.comment_count || 0),
    like_count: Number(row.like_count || 0),
    read_count: Number(row.read_count || 0),
  }
}

function eventExists(db, id) {
  return Boolean(db.prepare('SELECT 1 FROM historical_events WHERE id = ?').get(id))
}

function normalizeDate(value) {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function normalizeImage(value) {
  const text = String(value || '').trim()
  if (!text) return null
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(text)) return text
  if (text.length <= 2048) {
    try {
      const url = new URL(text)
      if (url.protocol === 'https:' && !url.username && !url.password) return url.href
    } catch (_) {}
  }
  return null
}

function normalizeTags(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map(tag => String(tag).trim()).filter(Boolean))
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return JSON.stringify(parsed.map(tag => String(tag).trim()).filter(Boolean))
    } catch (_) {}
    return JSON.stringify(value.split(',').map(tag => tag.trim()).filter(Boolean))
  }
  return '[]'
}

function emptyToNull(value) {
  const text = String(value || '').trim()
  return text || null
}

module.exports = router
