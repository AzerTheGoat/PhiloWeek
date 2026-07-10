const express = require('express')
const { getDb } = require('../db')

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
      0 AS liked_by_me
    FROM articles
    LEFT JOIN users ON users.id = articles.user_id
    LEFT JOIN historical_events ON historical_events.id = articles.event_id
    WHERE articles.id = ? AND articles.status = 'published'
  `).get(req.params.id)

  if (!article) return res.status(404).json({ error: 'Article introuvable ou non publie.' })

  const comments = db.prepare(`
    SELECT article_comments.id, article_comments.article_id, article_comments.body,
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

function normalizeArticleRow(row) {
  return {
    ...row,
    can_edit: false,
    liked_by_me: false,
    comment_count: Number(row.comment_count || 0),
    like_count: Number(row.like_count || 0),
  }
}

module.exports = router
