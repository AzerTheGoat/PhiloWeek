const express = require('express')
const router = express.Router()
const JSZip = require('jszip')
const matter = require('gray-matter')
const { getDb } = require('../db')

router.get('/obsidian', async (req, res) => {
  const db = await getDb()
  const zip = new JSZip()
  const allFiles = await db.all('SELECT * FROM files ORDER BY type DESC, sort_order, name')

  const pathMap = {}
  function getPath(id) {
    if (pathMap[id] !== undefined) return pathMap[id]
    const f = allFiles.find(x => x.id === id)
    if (!f) return ''
    pathMap[id] = f.parent_id ? getPath(f.parent_id) + '/' + f.name : f.name
    return pathMap[id]
  }
  allFiles.forEach(f => getPath(f.id))

  for (const file of allFiles) {
    if (file.type !== 'file') continue

    // Skip files inside locked folders
    let curr = file
    let locked = false
    while (curr.parent_id) {
      const parent = allFiles.find(x => x.id === curr.parent_id)
      if (!parent) break
      if (parent.type === 'locked_folder') { locked = true; break }
      curr = parent
    }
    if (locked) continue

    const rawContent = file.content || ''
    let parsed
    try { parsed = matter(rawContent) }
    catch (_) { parsed = { data: {}, content: rawContent } }

    const tags = (await db.all('SELECT tag FROM file_tags WHERE file_id = ?', [file.id])).map(r => r.tag)

    const frontmatter = {
      ...parsed.data,
      title: parsed.data.title || file.name.replace(/\.md$/i, ''),
      tags: tags.length > 0 ? tags : (parsed.data.tags || []),
      created: file.created_at,
      modified: file.updated_at
    }

    const finalContent = matter.stringify(parsed.content, frontmatter)
    const zipPath = (pathMap[file.id] || file.name).replace(/\.md$/i, '') + '.md'
    zip.file(zipPath, finalContent)
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  const date = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="philoweek-vault-${date}.zip"`)
  res.send(buffer)
})

module.exports = router
