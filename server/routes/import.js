const express = require('express')
const router = express.Router()
const multer = require('multer')
const JSZip = require('jszip')
const matter = require('gray-matter')
const { getDb, updateTags } = require('../db')
const { v4: uuidv4 } = require('uuid')

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })

router.post('/obsidian', upload.single('vault'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

  const db = getDb()
  const conflict = req.body.conflict || 'rename'
  const report = { imported: 0, skipped: 0, linksResolved: 0, linksBroken: 0, errors: [] }

  try {
    const zip = await JSZip.loadAsync(req.file.buffer)
    const pathToId = {}
    const mdEntries = []

    zip.forEach((relativePath, entry) => {
      if (!entry.dir && relativePath.endsWith('.md') && !relativePath.startsWith('__MACOSX')) {
        mdEntries.push({ path: relativePath, entry })
      }
    })

    mdEntries.sort((a, b) => a.path.split('/').length - b.path.split('/').length)

    const insertFolder = db.prepare(
      "INSERT INTO files (id, parent_id, name, type, created_at, updated_at) VALUES (?, ?, ?, 'folder', datetime('now'), datetime('now'))"
    )
    const insertFile = db.prepare(
      "INSERT INTO files (id, parent_id, name, type, content, created_at, updated_at) VALUES (?, ?, ?, 'file', ?, datetime('now'), datetime('now'))"
    )
    const updateContent = db.prepare("UPDATE files SET content = ?, updated_at = datetime('now') WHERE id = ?")

    for (const { path: relativePath, entry } of mdEntries) {
      try {
        const parts = relativePath.split('/')
        const fileName = parts[parts.length - 1]
        const dirParts = parts.slice(0, -1)

        let parentId = null
        let pathAccum = ''
        for (const dirName of dirParts) {
          pathAccum = pathAccum ? pathAccum + '/' + dirName : dirName
          if (!pathToId[pathAccum]) {
            const existing = db.prepare(
              "SELECT id FROM files WHERE name = ? AND parent_id IS ? AND type = 'folder'"
            ).get(dirName, parentId)
            if (existing) {
              pathToId[pathAccum] = existing.id
            } else {
              const id = uuidv4()
              insertFolder.run(id, parentId, dirName)
              pathToId[pathAccum] = id
            }
          }
          parentId = pathToId[pathAccum]
        }

        const rawContent = await entry.async('text')
        const existing = db.prepare(
          'SELECT id FROM files WHERE name = ? AND parent_id IS ?'
        ).get(fileName, parentId)

        let fileId
        if (existing) {
          if (conflict === 'skip') { report.skipped++; continue }
          if (conflict === 'overwrite') {
            updateContent.run(rawContent, existing.id)
            fileId = existing.id
          } else {
            const newName = fileName.replace(/\.md$/i, '') + `-import-${Date.now()}.md`
            fileId = uuidv4()
            insertFile.run(fileId, parentId, newName, rawContent)
          }
        } else {
          fileId = uuidv4()
          insertFile.run(fileId, parentId, fileName, rawContent)
        }

        pathToId[relativePath] = fileId
        updateTags(db, fileId, rawContent)
        report.imported++
      } catch (err) {
        report.errors.push(`${relativePath}: ${err.message}`)
      }
    }

    // Resolve [[links]]
    const allFiles = db.prepare("SELECT id, name FROM files WHERE type = 'file'").all()
    const nameToId = {}
    allFiles.forEach(f => {
      nameToId[f.name] = f.id
      nameToId[f.name.replace(/\.md$/i, '')] = f.id
    })

    const deleteLinks = db.prepare('DELETE FROM file_links WHERE source_id = ?')
    const insertLink = db.prepare(
      'INSERT OR IGNORE INTO file_links (source_id, target_id, link_text) VALUES (?, ?, ?)'
    )

    for (const file of allFiles) {
      const row = db.prepare('SELECT content FROM files WHERE id = ?').get(file.id)
      const content = row?.content || ''
      const linkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
      let m
      deleteLinks.run(file.id)
      while ((m = linkRegex.exec(content)) !== null) {
        const linkText = m[1].trim()
        const targetId = nameToId[linkText] || nameToId[linkText + '.md']
        if (targetId && targetId !== file.id) {
          try { insertLink.run(file.id, targetId, linkText); report.linksResolved++ }
          catch (_) {}
        } else {
          report.linksBroken++
        }
      }
    }

    res.json({ ok: true, report })
  } catch (err) {
    console.error('Import error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
