const express = require('express')
const router = express.Router()
const { getDb, updateTags, updateLinks } = require('../db')
const { v4: uuidv4 } = require('uuid')

// GET /api/files — full tree
router.get('/', async (req, res) => {
  const db = await getDb()
  const rows = await db.all(
    'SELECT id, parent_id, name, type, sort_order, created_at, updated_at FROM files ORDER BY type DESC, sort_order ASC, name ASC'
  )
  const map = {}
  rows.forEach(r => (map[r.id] = { ...r, children: [] }))
  const roots = []
  rows.forEach(r => {
    if (r.parent_id && map[r.parent_id]) map[r.parent_id].children.push(map[r.id])
    else if (!r.parent_id) roots.push(map[r.id])
  })
  res.json(roots)
})

// GET /api/files/search?q=
router.get('/search', async (req, res) => {
  const db = await getDb()
  const { q } = req.query
  if (!q || q.length < 2) return res.json([])
  const results = await db.all(
    `SELECT id, name, type, parent_id,
      substr(content, max(1, instr(lower(content), lower(?)) - 60), 160) as excerpt
     FROM files WHERE type = 'file' AND (lower(name) LIKE lower(?) OR lower(content) LIKE lower(?))
     LIMIT 20`,
    [q, `%${q}%`, `%${q}%`]
  )
  res.json(results)
})

// GET /api/files/names — for [[link]] autocomplete
router.get('/names', async (req, res) => {
  const db = await getDb()
  const files = await db.all("SELECT id, name, parent_id FROM files WHERE type = 'file' ORDER BY name")
  res.json(files)
})

// GET /api/files/:id
router.get('/:id', async (req, res) => {
  const db = await getDb()
  const file = await db.get('SELECT * FROM files WHERE id = ?', [req.params.id])
  if (!file) return res.status(404).json({ error: 'Not found' })

  if (file.type === 'locked_folder') {
    return res.json({ id: file.id, name: file.name, type: file.type, parent_id: file.parent_id, locked: true })
  }

  const tags = (await db.all('SELECT tag FROM file_tags WHERE file_id = ?', [file.id])).map(r => r.tag)
  const links = await db.all(
    `SELECT f.id, f.name FROM file_links fl JOIN files f ON f.id = fl.target_id WHERE fl.source_id = ?`,
    [file.id]
  )
  const backlinks = await db.all(
    `SELECT f.id, f.name FROM file_links fl JOIN files f ON f.id = fl.source_id WHERE fl.target_id = ?`,
    [file.id]
  )
  res.json({ ...file, tags, links, backlinks })
})

// POST /api/files
router.post('/', async (req, res) => {
  const db = await getDb()
  const { parent_id, name, type, content } = req.body
  if (!name || !type) return res.status(400).json({ error: 'name and type required' })

  const id = uuidv4()
  const now = new Date().toISOString()
  await db.run(
    'INSERT INTO files (id, parent_id, name, type, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, parent_id || null, name, type, content || null, now, now]
  )

  if (content) {
    await updateTags(db, id, content)
    await updateLinks(db, id, content)
  }

  res.status(201).json(await db.get('SELECT * FROM files WHERE id = ?', [id]))
})

// PUT /api/files/:id
router.put('/:id', async (req, res) => {
  const db = await getDb()
  const file = await db.get('SELECT * FROM files WHERE id = ?', [req.params.id])
  if (!file) return res.status(404).json({ error: 'Not found' })

  const { name, content, parent_id, sort_order } = req.body
  const now = new Date().toISOString()
  const sets = []
  const vals = []

  if (name !== undefined) { sets.push('name = ?'); vals.push(name) }
  if (content !== undefined) { sets.push('content = ?'); vals.push(content) }
  if (parent_id !== undefined) { sets.push('parent_id = ?'); vals.push(parent_id || null) }
  if (sort_order !== undefined) { sets.push('sort_order = ?'); vals.push(sort_order) }

  if (sets.length === 0) return res.json(file)

  sets.push('updated_at = ?')
  vals.push(now, req.params.id)

  await db.run(`UPDATE files SET ${sets.join(', ')} WHERE id = ?`, vals)

  if (content !== undefined) {
    await updateTags(db, req.params.id, content)
    await updateLinks(db, req.params.id, content)
  }

  res.json(await db.get('SELECT * FROM files WHERE id = ?', [req.params.id]))
})

// DELETE /api/files/:id
router.delete('/:id', async (req, res) => {
  const db = await getDb()
  const file = await db.get('SELECT * FROM files WHERE id = ?', [req.params.id])
  if (!file) return res.status(404).json({ error: 'Not found' })
  if (file.name === 'Journal' && !file.parent_id) {
    return res.status(403).json({ error: 'Cannot delete the Journal folder' })
  }
  await db.run('DELETE FROM files WHERE id = ?', [req.params.id])
  res.json({ ok: true })
})

// PUT /api/files/:id/move
router.put('/:id/move', async (req, res) => {
  const db = await getDb()
  const { parent_id, sort_order } = req.body
  await db.run(
    "UPDATE files SET parent_id = ?, sort_order = ?, updated_at = datetime('now') WHERE id = ?",
    [parent_id || null, sort_order ?? 0, req.params.id]
  )
  res.json({ ok: true })
})

// POST /api/files/:id/unlock
router.post('/:id/unlock', async (req, res) => {
  const bcrypt = require('bcrypt')
  const crypto = require('crypto')
  const db = await getDb()
  const { password } = req.body

  const folder = await db.get(
    "SELECT * FROM files WHERE id = ? AND type = 'locked_folder'",
    [req.params.id]
  )
  if (!folder) return res.status(404).json({ error: 'Not found' })

  const valid = await bcrypt.compare(password, folder.password_hash)
  if (!valid) return res.status(401).json({ error: 'Wrong password' })

  const children = await db.all('SELECT * FROM files WHERE parent_id = ?', [req.params.id])
  const key = crypto.scryptSync(password, 'philoweek-salt-v2', 32)

  const decrypted = children.map(child => {
    if (!child.encrypted_content) return child
    try {
      const iv = Buffer.from(child.encrypted_content.slice(0, 32), 'hex')
      const ciphertext = child.encrypted_content.slice(32)
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
      let plain = decipher.update(ciphertext, 'hex', 'utf8')
      plain += decipher.final('utf8')
      return { ...child, content: plain, encrypted_content: undefined }
    } catch {
      return { ...child, content: '[Decryption error]' }
    }
  })

  res.json(decrypted)
})

// POST /api/files/:id/lock
router.post('/:id/lock', async (req, res) => {
  const bcrypt = require('bcrypt')
  const crypto = require('crypto')
  const db = await getDb()
  const { password } = req.body
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' })
  }

  const hash = await bcrypt.hash(password, 10)
  const key = crypto.scryptSync(password, 'philoweek-salt-v2', 32)

  await db.run("UPDATE files SET type = 'locked_folder', password_hash = ? WHERE id = ?", [hash, req.params.id])

  const children = await db.all('SELECT * FROM files WHERE parent_id = ?', [req.params.id])
  for (const child of children) {
    if (!child.content) continue
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    let enc = cipher.update(child.content, 'utf8', 'hex')
    enc += cipher.final('hex')
    await db.run('UPDATE files SET encrypted_content = ?, content = NULL WHERE id = ?', [
      iv.toString('hex') + enc, child.id
    ])
  }

  res.json({ ok: true })
})

module.exports = router
