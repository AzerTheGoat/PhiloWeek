const express = require('express')
const router = express.Router()
const JSZip = require('jszip')
const matter = require('gray-matter')
const { getDb } = require('../db')

router.get('/obsidian', async (req, res) => {
  const db = getDb()
  const zip = new JSZip()
  const allFiles = db.prepare('SELECT * FROM files WHERE user_id = ? ORDER BY type DESC, sort_order, name').all(req.user.id)

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
    const originalPath = pathMap[file.id] || file.name

    if (/\.md$/i.test(file.name)) {
      let parsed
      try { parsed = matter(rawContent) }
      catch (_) { parsed = { data: {}, content: rawContent } }

      const tags = db.prepare('SELECT tag FROM file_tags WHERE file_id = ?').all(file.id).map(r => r.tag)

      const frontmatter = {
        ...parsed.data,
        title: parsed.data.title || file.name.replace(/\.md$/i, ''),
        tags: tags.length > 0 ? tags : (parsed.data.tags || []),
        created: file.created_at,
        modified: file.updated_at
      }

      const finalContent = matter.stringify(parsed.content, frontmatter)
      const zipPath = originalPath.replace(/\.md$/i, '') + '.md'
      zip.file(zipPath, finalContent)
    } else {
      zip.file(originalPath, rawContent)
    }
  }

  const quotes = db.prepare('SELECT * FROM quotes WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)
  if (quotes.length > 0) {
    const body = quotes.map(q => {
      const meta = [
        q.author ? `Auteur: ${q.author}` : null,
        q.source ? `Source: ${q.source}` : null,
        q.tags ? `Tags: ${q.tags}` : null,
        `Ajoute: ${q.created_at}`,
      ].filter(Boolean).join('\n')
      return `> ${q.quote.replace(/\n/g, '\n> ')}\n\n${meta}${q.notes ? `\n\nNotes:\n${q.notes}` : ''}`
    }).join('\n\n---\n\n')

    zip.file('_Opuscule/Citations.md', matter.stringify(body, {
      title: 'Citations',
      philoweek_type: 'quotes',
      exported: new Date().toISOString(),
    }))
  }

  const questionnaireResults = db.prepare('SELECT * FROM questionnaire_results WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)
  if (questionnaireResults.length > 0) {
    zip.file('_Opuscule/QuestionnaireResults.json', JSON.stringify({
      philoweek_type: 'questionnaire_results',
      exported: new Date().toISOString(),
      results: questionnaireResults,
    }, null, 2))
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  const date = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="opuscule-vault-${date}.zip"`)
  res.send(buffer)
})

module.exports = router
