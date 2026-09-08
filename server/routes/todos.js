const express = require('express')
const router = express.Router()
const { v4: uuidv4 } = require('uuid')
const { getDb } = require('../db')

router.get('/', (req, res) => {
  const db = getDb()
  const status = req.query.status === 'all' ? 'all' : req.query.status === 'done' ? 'done' : 'open'
  const rows = status === 'all'
    ? db.prepare(`
        SELECT * FROM todos
        WHERE user_id = ?
        ORDER BY status ASC, due_at ASC, created_at DESC
      `).all(req.user.id)
    : db.prepare(`
        SELECT * FROM todos
        WHERE user_id = ? AND status = ?
        ORDER BY due_at ASC, created_at DESC
      `).all(req.user.id, status)
  res.json(rows)
})

router.get('/reminder', (req, res) => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT * FROM todos
    WHERE user_id = ? AND status = 'open'
    ORDER BY due_at ASC, created_at DESC
    LIMIT 12
  `).all(req.user.id)
  res.json(rows)
})

router.post('/', (req, res) => {
  const db = getDb()
  const title = String(req.body.title || '').trim()
  const dueAt = normalizeDueDate(req.body.due_at)
  if (!title) return res.status(400).json({ error: 'title required' })
  if (!dueAt) return res.status(400).json({ error: 'due_at required' })

  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO todos (id, title, notes, status, due_at, user_id, created_at, updated_at)
    VALUES (?, ?, ?, 'open', ?, ?, ?, ?)
  `).run(
    id,
    title,
    emptyToNull(req.body.notes),
    dueAt,
    req.user.id,
    now,
    now,
  )

  res.status(201).json(db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(id, req.user.id))
})

router.get('/dashboard', (req, res) => {
  const db = getDb()
  const days = clampInt(req.query.days, 7, 180, 42)
  const since = shiftDate(todayInput(), -(days - 1))
  const practices = db.prepare(`
    SELECT * FROM agenda_practices
    WHERE user_id = ?
    ORDER BY active DESC, created_at ASC
  `).all(req.user.id)
  const checks = db.prepare(`
    SELECT practice_id, entry_date, done FROM agenda_checks
    WHERE user_id = ? AND entry_date >= ?
    ORDER BY entry_date ASC
  `).all(req.user.id, since)
  const profile = db.prepare('SELECT * FROM life_profiles WHERE user_id = ?').get(req.user.id) || {
    user_id: req.user.id,
    birth_date: null,
    life_expectancy_years: 85,
  }
  const events = db.prepare(`
    SELECT * FROM agenda_events
    WHERE user_id = ?
    ORDER BY start_date ASC, COALESCE(start_time, '') ASC, created_at ASC
    LIMIT 2500
  `).all(req.user.id)
  res.json({ practices, checks, events, profile, today: todayInput(), since })
})

router.post('/practices', (req, res) => {
  const db = getDb()
  const title = String(req.body.title || '').trim()
  if (!title) return res.status(400).json({ error: 'title required' })
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO agenda_practices (id, title, color, active, user_id, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?, ?)
  `).run(id, title, normalizeColor(req.body.color), req.user.id, now, now)
  res.status(201).json(db.prepare('SELECT * FROM agenda_practices WHERE id = ? AND user_id = ?').get(id, req.user.id))
})

router.put('/practices/:id', (req, res) => {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM agenda_practices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const title = req.body.title !== undefined ? String(req.body.title).trim() : existing.title
  if (!title) return res.status(400).json({ error: 'title required' })
  const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : existing.active
  const now = new Date().toISOString()
  const archivedAt = active ? null : (existing.archived_at || now)
  db.prepare(`
    UPDATE agenda_practices
    SET title = ?, color = ?, active = ?, updated_at = ?, archived_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    title,
    req.body.color !== undefined ? normalizeColor(req.body.color) : existing.color,
    active,
    now,
    archivedAt,
    req.params.id,
    req.user.id,
  )
  res.json(db.prepare('SELECT * FROM agenda_practices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id))
})

router.put('/practices/:id/check', (req, res) => {
  const db = getDb()
  const practice = db.prepare('SELECT id FROM agenda_practices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!practice) return res.status(404).json({ error: 'Not found' })
  const entryDate = normalizeDate(req.body.entry_date) || todayInput()
  const done = req.body.done ? 1 : 0
  db.prepare(`
    INSERT INTO agenda_checks (practice_id, entry_date, done, user_id, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, practice_id, entry_date)
    DO UPDATE SET done = excluded.done, updated_at = excluded.updated_at
  `).run(req.params.id, entryDate, done, req.user.id, new Date().toISOString())
  res.json({ practice_id: req.params.id, entry_date: entryDate, done })
})

router.delete('/practices/:id', (req, res) => {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM agenda_practices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  db.prepare('DELETE FROM agenda_checks WHERE practice_id = ? AND user_id = ?').run(req.params.id, req.user.id)
  db.prepare('DELETE FROM agenda_practices WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id)
  res.json({ ok: true })
})

router.post('/events/import-ics', (req, res) => {
  const db = getDb()
  const content = String(req.body.content || '')
  if (!content.trim()) return res.status(400).json({ error: 'Fichier iCalendar vide' })
  if (Buffer.byteLength(content, 'utf8') > 2 * 1024 * 1024) {
    return res.status(413).json({ error: 'Le fichier iCalendar dépasse 2 Mo' })
  }

  const parsed = parseIcsEvents(content).slice(0, 500)
  if (parsed.length === 0) return res.status(400).json({ error: 'Aucun événement compatible trouvé' })
  const now = new Date().toISOString()
  const upsert = db.prepare(`
    INSERT INTO agenda_events (
      id, title, notes, location, start_date, start_time, end_date, end_time,
      all_day, source_uid, user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, source_uid) WHERE source_uid IS NOT NULL DO UPDATE SET
      title = excluded.title, notes = excluded.notes, location = excluded.location,
      start_date = excluded.start_date, start_time = excluded.start_time,
      end_date = excluded.end_date, end_time = excluded.end_time,
      all_day = excluded.all_day, updated_at = excluded.updated_at
  `)
  const importEvents = db.transaction(() => {
    for (const event of parsed) {
      upsert.run(
        uuidv4(), event.title, event.notes, event.location,
        event.start_date, event.start_time, event.end_date, event.end_time,
        event.all_day ? 1 : 0, event.source_uid || `ics-${uuidv4()}`,
        req.user.id, now, now,
      )
    }
  })
  importEvents()
  res.json({ imported: parsed.length })
})

router.get('/events/export-ics', (req, res) => {
  const db = getDb()
  const events = db.prepare(`
    SELECT * FROM agenda_events WHERE user_id = ?
    ORDER BY start_date ASC, COALESCE(start_time, '') ASC
  `).all(req.user.id)
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Opuscule//Agenda//FR', 'CALSCALE:GREGORIAN']
  for (const event of events) {
    lines.push('BEGIN:VEVENT', `UID:${escapeIcs(event.source_uid || `${event.id}@opuscule`)}`)
    lines.push(`DTSTAMP:${icsTimestamp(event.updated_at)}`)
    if (event.all_day) {
      lines.push(`DTSTART;VALUE=DATE:${event.start_date.replace(/-/g, '')}`)
      lines.push(`DTEND;VALUE=DATE:${shiftDate(event.end_date, 1).replace(/-/g, '')}`)
    } else {
      lines.push(`DTSTART:${icsLocalDateTime(event.start_date, event.start_time)}`)
      lines.push(`DTEND:${icsLocalDateTime(event.end_date, event.end_time)}`)
    }
    lines.push(`SUMMARY:${escapeIcs(event.title)}`)
    if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`)
    if (event.notes) lines.push(`DESCRIPTION:${escapeIcs(event.notes)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="agenda-opuscule.ics"')
  res.send(lines.join('\r\n'))
})

router.post('/events', (req, res) => {
  const db = getDb()
  const event = normalizeAgendaEvent(req.body)
  if (event.error) return res.status(400).json({ error: event.error })
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO agenda_events (
      id, title, notes, location, start_date, start_time, end_date, end_time,
      all_day, source_uid, user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
  `).run(
    id, event.title, event.notes, event.location, event.start_date, event.start_time,
    event.end_date, event.end_time, event.all_day ? 1 : 0, req.user.id, now, now,
  )
  res.status(201).json(db.prepare('SELECT * FROM agenda_events WHERE id = ? AND user_id = ?').get(id, req.user.id))
})

router.put('/events/:id', (req, res) => {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM agenda_events WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const event = normalizeAgendaEvent({ ...existing, ...req.body })
  if (event.error) return res.status(400).json({ error: event.error })
  db.prepare(`
    UPDATE agenda_events SET
      title = ?, notes = ?, location = ?, start_date = ?, start_time = ?,
      end_date = ?, end_time = ?, all_day = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    event.title, event.notes, event.location, event.start_date, event.start_time,
    event.end_date, event.end_time, event.all_day ? 1 : 0, new Date().toISOString(),
    req.params.id, req.user.id,
  )
  res.json(db.prepare('SELECT * FROM agenda_events WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id))
})

router.delete('/events/:id', (req, res) => {
  const db = getDb()
  const result = db.prepare('DELETE FROM agenda_events WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id)
  if (!result.changes) return res.status(404).json({ error: 'Not found' })
  res.json({ ok: true })
})

router.put('/life-profile', (req, res) => {
  const db = getDb()
  const birthDate = req.body.birth_date ? normalizeDate(req.body.birth_date) : null
  if (req.body.birth_date && !birthDate) return res.status(400).json({ error: 'birth_date invalid' })
  const years = clampInt(req.body.life_expectancy_years, 1, 130, 85)
  db.prepare(`
    INSERT INTO life_profiles (user_id, birth_date, life_expectancy_years, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id)
    DO UPDATE SET birth_date = excluded.birth_date, life_expectancy_years = excluded.life_expectancy_years, updated_at = excluded.updated_at
  `).run(req.user.id, birthDate, years, new Date().toISOString())
  res.json(db.prepare('SELECT * FROM life_profiles WHERE user_id = ?').get(req.user.id))
})

router.put('/:id', (req, res) => {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })

  const nextStatus = req.body.status !== undefined ? String(req.body.status) : existing.status
  if (!['open', 'done'].includes(nextStatus)) return res.status(400).json({ error: 'Invalid status' })

  const nextDueAt = req.body.due_at !== undefined ? normalizeDueDate(req.body.due_at) : existing.due_at
  if (!nextDueAt) return res.status(400).json({ error: 'due_at required' })
  const nextTitle = req.body.title !== undefined ? String(req.body.title).trim() : existing.title
  if (!nextTitle) return res.status(400).json({ error: 'title required' })

  const now = new Date().toISOString()
  const completedAt = nextStatus === 'done'
    ? (existing.completed_at || now)
    : null

  db.prepare(`
    UPDATE todos
    SET title = ?, notes = ?, status = ?, due_at = ?, updated_at = ?, completed_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    nextTitle,
    req.body.notes !== undefined ? emptyToNull(req.body.notes) : existing.notes,
    nextStatus,
    nextDueAt,
    now,
    completedAt,
    req.params.id,
    req.user.id,
  )

  res.json(db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id))
})

router.delete('/:id', (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id)
  res.json({ ok: true })
})

function normalizeDueDate(value) {
  const text = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  return text
}

function normalizeDate(value) {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function normalizeColor(value) {
  const color = String(value || '').trim()
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#6ba3e8'
}

function normalizeAgendaEvent(value) {
  const title = String(value.title || '').trim().slice(0, 240)
  const startDate = normalizeDate(value.start_date)
  const endDate = normalizeDate(value.end_date || value.start_date)
  const allDay = value.all_day === true || value.all_day === 1 || value.all_day === '1'
  const startTime = allDay ? null : normalizeTime(value.start_time)
  const endTime = allDay ? null : normalizeTime(value.end_time)
  if (!title) return { error: 'Le titre est requis' }
  if (!startDate || !endDate) return { error: 'Les dates sont invalides' }
  if (endDate < startDate) return { error: 'La fin doit être après le début' }
  if (!allDay && (!startTime || !endTime)) return { error: 'Les horaires sont requis' }
  if (!allDay && endDate === startDate && endTime <= startTime) return { error: 'L’heure de fin doit être après le début' }
  return {
    title,
    notes: limitedText(value.notes, 4000),
    location: limitedText(value.location, 500),
    start_date: startDate,
    start_time: startTime,
    end_date: endDate,
    end_time: endTime,
    all_day: allDay,
    source_uid: limitedText(value.source_uid, 500),
  }
}

function normalizeTime(value) {
  const match = String(value || '').trim().match(/^(\d{2}):(\d{2})/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour <= 23 && minute <= 59 ? `${match[1]}:${match[2]}` : null
}

function limitedText(value, max) {
  const text = String(value || '').trim()
  return text ? text.slice(0, max) : null
}

function parseIcsEvents(content) {
  const unfolded = String(content).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/gi) || []
  return blocks.map(block => {
    const properties = {}
    for (const line of block.split(/\r?\n/)) {
      const separator = line.indexOf(':')
      if (separator < 0) continue
      const rawKey = line.slice(0, separator)
      const key = rawKey.split(';')[0].toUpperCase()
      if (!properties[key]) properties[key] = { value: line.slice(separator + 1), rawKey }
    }
    const start = parseIcsDate(properties.DTSTART)
    if (!start) return null
    const rawEnd = parseIcsDate(properties.DTEND)
    let end = rawEnd || { ...start }
    if (start.allDay && rawEnd && rawEnd.date > start.date) end = { ...rawEnd, date: shiftDate(rawEnd.date, -1) }
    return normalizeAgendaEvent({
      title: unescapeIcs(properties.SUMMARY?.value || 'Événement importé'),
      notes: unescapeIcs(properties.DESCRIPTION?.value || ''),
      location: unescapeIcs(properties.LOCATION?.value || ''),
      start_date: start.date,
      start_time: start.time,
      end_date: end.date,
      end_time: end.time || start.time,
      all_day: start.allDay,
      source_uid: unescapeIcs(properties.UID?.value || ''),
    })
  }).filter(event => event && !event.error)
}

function parseIcsDate(property) {
  if (!property) return null
  const value = String(property.value || '').trim()
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/)
  if (!match) return null
  const date = `${match[1]}-${match[2]}-${match[3]}`
  if (!normalizeDate(date)) return null
  const allDay = /VALUE=DATE/i.test(property.rawKey) || !match[4]
  return { date, time: allDay ? null : `${match[4]}:${match[5]}`, allDay }
}

function unescapeIcs(value) {
  return String(value || '').replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

function escapeIcs(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function icsLocalDateTime(date, time) {
  return `${String(date).replace(/-/g, '')}T${String(time || '00:00').replace(':', '')}00`
}

function icsTimestamp(value) {
  const date = new Date(value || Date.now())
  return Number.isFinite(date.getTime())
    ? date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
    : new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function clampInt(value, min, max, fallback) {
  const next = Number(value)
  if (!Number.isFinite(next)) return fallback
  return Math.min(max, Math.max(min, Math.round(next)))
}

function todayInput() {
  return new Date().toISOString().slice(0, 10)
}

function shiftDate(date, deltaDays) {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + deltaDays)
  return next.toISOString().slice(0, 10)
}

function emptyToNull(value) {
  const text = String(value || '').trim()
  return text || null
}

module.exports = router
