const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { getDb } = require('../db')
const { RECORDINGS_DIR } = require('../paths')
const { v4: uuidv4 } = require('uuid')

if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: RECORDINGS_DIR,
  filename: (req, file, cb) => cb(null, `${uuidv4()}.webm`)
})
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } })

router.get('/', (req, res) => {
  const db = getDb()
  const { file_id } = req.query
  const rows = file_id
    ? db.prepare('SELECT * FROM voice_notes WHERE file_id = ? ORDER BY created_at DESC').all(file_id)
    : db.prepare('SELECT * FROM voice_notes ORDER BY created_at DESC').all()
  res.json(rows)
})

router.post('/', upload.single('audio'), (req, res) => {
  const db = getDb()
  const { file_id, duration, title } = req.body
  if (!req.file) return res.status(400).json({ error: 'No audio file' })

  const id = uuidv4()
  db.prepare(
    "INSERT INTO voice_notes (id, file_id, filename, duration_seconds, title, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
  ).run(id, file_id || null, req.file.filename, parseInt(duration) || 0, title || null)
  res.status(201).json(db.prepare('SELECT * FROM voice_notes WHERE id = ?').get(id))
})

router.delete('/:id', (req, res) => {
  const db = getDb()
  const note = db.prepare('SELECT * FROM voice_notes WHERE id = ?').get(req.params.id)
  if (!note) return res.status(404).json({ error: 'Not found' })
  try { fs.unlinkSync(path.join(RECORDINGS_DIR, note.filename)) } catch (_) {}
  db.prepare('DELETE FROM voice_notes WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

module.exports = router
