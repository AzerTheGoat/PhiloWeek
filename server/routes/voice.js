const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { getDb } = require('../db')
const { v4: uuidv4 } = require('uuid')

const RECORDINGS_DIR = path.join(__dirname, '../recordings')
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR)

const storage = multer.diskStorage({
  destination: RECORDINGS_DIR,
  filename: (req, file, cb) => cb(null, `${uuidv4()}.webm`)
})
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } })

router.get('/', async (req, res) => {
  const db = await getDb()
  const { file_id } = req.query
  const rows = file_id
    ? await db.all('SELECT * FROM voice_notes WHERE file_id = ? ORDER BY created_at DESC', [file_id])
    : await db.all('SELECT * FROM voice_notes ORDER BY created_at DESC')
  res.json(rows)
})

router.post('/', upload.single('audio'), async (req, res) => {
  const db = await getDb()
  const { file_id, duration, title } = req.body
  if (!req.file) return res.status(400).json({ error: 'No audio file' })

  const id = uuidv4()
  await db.run(
    "INSERT INTO voice_notes (id, file_id, filename, duration_seconds, title, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
    [id, file_id || null, req.file.filename, parseInt(duration) || 0, title || null]
  )
  res.status(201).json(await db.get('SELECT * FROM voice_notes WHERE id = ?', [id]))
})

router.delete('/:id', async (req, res) => {
  const db = await getDb()
  const note = await db.get('SELECT * FROM voice_notes WHERE id = ?', [req.params.id])
  if (!note) return res.status(404).json({ error: 'Not found' })
  try { fs.unlinkSync(path.join(RECORDINGS_DIR, note.filename)) } catch (_) {}
  await db.run('DELETE FROM voice_notes WHERE id = ?', [req.params.id])
  res.json({ ok: true })
})

module.exports = router
