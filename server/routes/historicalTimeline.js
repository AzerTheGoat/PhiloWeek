const express = require('express')
const { v4: uuidv4 } = require('uuid')
const { getDb } = require('../db')
const { normalizeImageValue } = require('../imageValue')

const router = express.Router()

router.get('/', (req, res) => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT historical_events.*,
      users.username AS owner_username,
      CASE WHEN historical_events.user_id = ? THEN 1 ELSE 0 END AS can_edit
    FROM historical_events
    LEFT JOIN users ON users.id = historical_events.user_id
    ORDER BY start_year ASC, COALESCE(start_month, 0) ASC, COALESCE(start_day, 0) ASC, historical_events.created_at ASC
  `).all(req.user.id)
  const eventIds = rows.map(row => row.id)
  const articlesByEvent = new Map(eventIds.map(id => [id, []]))
  if (eventIds.length > 0) {
    const placeholders = eventIds.map(() => '?').join(', ')
    const articles = db.prepare(`
      SELECT articles.id, articles.title, articles.excerpt, articles.published_on,
        articles.event_id, users.username AS author_username
      FROM articles
      LEFT JOIN users ON users.id = articles.user_id
      WHERE articles.status = 'published'
        AND articles.event_id IN (${placeholders})
      ORDER BY articles.published_on DESC, articles.published_at DESC
    `).all(...eventIds)
    for (const article of articles) {
      const bucket = articlesByEvent.get(article.event_id)
      if (bucket) bucket.push(article)
    }
  }
  res.json(rows.map(row => ({
    ...row,
    linked_articles: articlesByEvent.get(row.id) || [],
  })))
})

router.post('/', (req, res) => {
  const db = getDb()
  const data = normalizePayload(req.body)
  if (!data.title) return res.status(400).json({ error: 'title required' })
  if (!data.start) return res.status(400).json({ error: 'start date invalid' })
  if (data.end && compareParts(data.end, data.start) < 0) {
    return res.status(400).json({ error: 'end date must be after start date' })
  }

  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO historical_events (
      id, title, start_label, start_year, start_month, start_day,
      end_label, end_year, end_month, end_day, description, category, color,
      image_data, image_caption, tags, user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.title,
    data.start.label,
    data.start.year,
    data.start.month,
    data.start.day,
    data.end?.label || null,
    data.end?.year ?? null,
    data.end?.month ?? null,
    data.end?.day ?? null,
    data.description,
    data.category,
    data.color,
    data.image_data,
    data.image_caption,
    data.tags,
    req.user.id,
    now,
    now
  )

  res.status(201).json(db.prepare('SELECT * FROM historical_events WHERE id = ? AND user_id = ?').get(id, req.user.id))
})

router.put('/:id', (req, res) => {
  const db = getDb()
  const existing = getOwnedEvent(db, req.params.id, req.user.id)
  if (existing?.error) return res.status(existing.status).json({ error: existing.error })

  const data = normalizePayload({ ...existingToPayload(existing), ...req.body })
  if (!data.title) return res.status(400).json({ error: 'title required' })
  if (!data.start) return res.status(400).json({ error: 'start date invalid' })
  if (data.end && compareParts(data.end, data.start) < 0) {
    return res.status(400).json({ error: 'end date must be after start date' })
  }

  db.prepare(`
    UPDATE historical_events
    SET title = ?, start_label = ?, start_year = ?, start_month = ?, start_day = ?,
      end_label = ?, end_year = ?, end_month = ?, end_day = ?, description = ?,
      category = ?, color = ?, image_data = ?, image_caption = ?, tags = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    data.title,
    data.start.label,
    data.start.year,
    data.start.month,
    data.start.day,
    data.end?.label || null,
    data.end?.year ?? null,
    data.end?.month ?? null,
    data.end?.day ?? null,
    data.description,
    data.category,
    data.color,
    data.image_data,
    data.image_caption,
    data.tags,
    new Date().toISOString(),
    req.params.id,
    req.user.id
  )

  res.json(db.prepare('SELECT * FROM historical_events WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id))
})

router.delete('/:id', (req, res) => {
  const db = getDb()
  const existing = getOwnedEvent(db, req.params.id, req.user.id)
  if (existing?.error) return res.status(existing.status).json({ error: existing.error })
  db.prepare('DELETE FROM historical_events WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id)
  res.json({ ok: true })
})

function getOwnedEvent(db, id, userId) {
  const event = db.prepare('SELECT * FROM historical_events WHERE id = ?').get(id)
  if (!event) return { status: 404, error: 'Not found' }
  if (event.user_id !== userId) return { status: 403, error: 'Tu peux modifier seulement tes cartes.' }
  return event
}

function normalizePayload(body = {}) {
  const startText = body.start || body.start_label
  const endText = body.end || body.end_label
  return {
    title: String(body.title || '').trim(),
    start: parseHistoricalDate(startText),
    end: String(endText || '').trim() ? parseHistoricalDate(endText) : null,
    description: emptyToNull(body.description),
    category: emptyToNull(body.category),
    color: normalizeColor(body.color),
    image_data: normalizeImageValue(body.image_data),
    image_caption: emptyToNull(body.image_caption),
    tags: normalizeTags(body.tags),
  }
}

function existingToPayload(row) {
  return {
    title: row.title,
    start: row.start_label,
    end: row.end_label || '',
    description: row.description,
    category: row.category,
    color: row.color,
    image_data: row.image_data,
    image_caption: row.image_caption,
    tags: safeJsonArray(row.tags),
  }
}

function parseHistoricalDate(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(-?\d{1,6})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/)
  if (!match) return null
  const year = Number(match[1])
  const month = match[2] ? Number(match[2]) : null
  const day = match[3] ? Number(match[3]) : null
  if (!Number.isInteger(year)) return null
  if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) return null
  if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) return null
  return { label: text, year, month, day }
}

function compareParts(a, b) {
  return dateValue(a) - dateValue(b)
}

function dateValue(parts) {
  return parts.year + ((parts.month || 1) - 1) / 12 + ((parts.day || 1) - 1) / 372
}

function normalizeColor(value) {
  const color = String(value || '').trim()
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#6ba3e8'
}

function normalizeTags(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map(tag => String(tag).trim()).filter(Boolean))
  if (typeof value === 'string') {
    const parsed = safeJsonArray(value)
    if (parsed.length) return JSON.stringify(parsed)
    return JSON.stringify(value.split(',').map(tag => tag.trim()).filter(Boolean))
  }
  return '[]'
}

function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'))
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch (_) {
    return []
  }
}

function emptyToNull(value) {
  const text = String(value || '').trim()
  return text || null
}

module.exports = router
