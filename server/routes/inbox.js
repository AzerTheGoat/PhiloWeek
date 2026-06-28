const express = require('express')
const router = express.Router()
const { getDb } = require('../db')
const { v4: uuidv4 } = require('uuid')

// ——— Resources ———

router.get('/resources', async (req, res) => {
  const db = await getDb()
  const { status, type } = req.query
  let sql = 'SELECT * FROM inbox_resources WHERE 1=1'
  const params = []
  if (status) { sql += ' AND status = ?'; params.push(status) }
  if (type) { sql += ' AND type = ?'; params.push(type) }
  sql += ' ORDER BY created_at DESC'
  res.json(await db.all(sql, params))
})

router.post('/resources', async (req, res) => {
  const db = await getDb()
  const { url, title, type, notes } = req.body
  if (!url) return res.status(400).json({ error: 'url required' })
  const id = uuidv4()
  const now = new Date().toISOString()
  await db.run(
    'INSERT INTO inbox_resources (id, url, title, type, notes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, \'todo\', ?, ?)',
    [id, url, title || null, type || 'article', notes || null, now, now]
  )
  res.status(201).json(await db.get('SELECT * FROM inbox_resources WHERE id = ?', [id]))
})

router.put('/resources/:id', async (req, res) => {
  const db = await getDb()
  const { title, status, notes, type } = req.body
  const now = new Date().toISOString()
  const sets = ['updated_at = ?']
  const vals = [now]
  if (title !== undefined) { sets.push('title = ?'); vals.push(title) }
  if (status !== undefined) { sets.push('status = ?'); vals.push(status) }
  if (notes !== undefined) { sets.push('notes = ?'); vals.push(notes) }
  if (type !== undefined) { sets.push('type = ?'); vals.push(type) }
  vals.push(req.params.id)
  await db.run(`UPDATE inbox_resources SET ${sets.join(', ')} WHERE id = ?`, vals)
  res.json(await db.get('SELECT * FROM inbox_resources WHERE id = ?', [req.params.id]))
})

router.delete('/resources/:id', async (req, res) => {
  const db = await getDb()
  await db.run('DELETE FROM inbox_resources WHERE id = ?', [req.params.id])
  res.json({ ok: true })
})

// ——— Ideas ———

router.get('/ideas', async (req, res) => {
  const db = await getDb()
  res.json(await db.all('SELECT * FROM inbox_ideas ORDER BY created_at DESC'))
})

router.post('/ideas', async (req, res) => {
  const db = await getDb()
  const { content, tags } = req.body
  if (!content?.trim()) return res.status(400).json({ error: 'content required' })
  const id = uuidv4()
  const now = new Date().toISOString()
  await db.run(
    'INSERT INTO inbox_ideas (id, content, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, content.trim(), JSON.stringify(tags || []), now, now]
  )
  res.status(201).json(await db.get('SELECT * FROM inbox_ideas WHERE id = ?', [id]))
})

router.put('/ideas/:id', async (req, res) => {
  const db = await getDb()
  const { content, tags } = req.body
  const now = new Date().toISOString()
  const sets = ['updated_at = ?']
  const vals = [now]
  if (content !== undefined) { sets.push('content = ?'); vals.push(content.trim()) }
  if (tags !== undefined) { sets.push('tags = ?'); vals.push(JSON.stringify(tags)) }
  vals.push(req.params.id)
  await db.run(`UPDATE inbox_ideas SET ${sets.join(', ')} WHERE id = ?`, vals)
  res.json(await db.get('SELECT * FROM inbox_ideas WHERE id = ?', [req.params.id]))
})

router.delete('/ideas/:id', async (req, res) => {
  const db = await getDb()
  await db.run('DELETE FROM inbox_ideas WHERE id = ?', [req.params.id])
  res.json({ ok: true })
})

// POST /api/inbox/ideas/:id/send-to-file
router.post('/ideas/:id/send-to-file', async (req, res) => {
  const db = await getDb()
  const { fileId } = req.body
  if (!fileId) return res.status(400).json({ error: 'fileId required' })

  const idea = await db.get('SELECT * FROM inbox_ideas WHERE id = ?', [req.params.id])
  if (!idea) return res.status(404).json({ error: 'Idea not found' })

  const file = await db.get('SELECT * FROM files WHERE id = ?', [fileId])
  if (!file) return res.status(404).json({ error: 'File not found' })

  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const append = `\n\n---\n*Idée capturée le ${date} :*\n\n${idea.content}\n`
  const newContent = (file.content || '') + append

  await db.run(
    "UPDATE files SET content = ?, updated_at = datetime('now') WHERE id = ?",
    [newContent, fileId]
  )
  await db.run('DELETE FROM inbox_ideas WHERE id = ?', [req.params.id])

  res.json({ ok: true, file: await db.get('SELECT * FROM files WHERE id = ?', [fileId]) })
})

module.exports = router
