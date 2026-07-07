const express = require('express')
const router = express.Router()
const JSZip = require('jszip')
const matter = require('gray-matter')
const { getDb } = require('../db')

router.get('/obsidian', async (req, res) => {
  try {
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
      let parsedMatter = true
      try { parsed = matter(rawContent) }
      catch (_) {
        parsedMatter = false
        parsed = { data: {}, content: rawContent }
      }

      const tags = db.prepare('SELECT tag FROM file_tags WHERE file_id = ?').all(file.id).map(r => r.tag)

      const frontmatter = {
        ...parsed.data,
        title: parsed.data.title || file.name.replace(/\.md$/i, ''),
        tags: tags.length > 0 ? tags : (parsed.data.tags || []),
        created: file.created_at,
        modified: file.updated_at
      }

      const finalContent = parsedMatter
        ? safeMatterStringify(parsed.content, frontmatter)
        : rawContent
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

    zip.file('_Opuscule/Citations.md', safeMatterStringify(body, {
      title: 'Citations',
      philoweek_type: 'quotes',
      exported: new Date().toISOString(),
    }))
  }

  const factChecks = db.prepare('SELECT * FROM fact_checks WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)
  if (factChecks.length > 0) {
    const statusLabel = { to_check: 'A verifier', true: 'Vrai', false: 'Faux', partial: 'Partiellement vrai' }
    const body = factChecks.map(f => {
      const meta = [
        `Statut: ${statusLabel[f.status] || f.status}`,
        f.source ? `Source: ${f.source}` : null,
        f.tags ? `Tags: ${f.tags}` : null,
        `Ajoute: ${f.created_at}`,
      ].filter(Boolean).join('\n')
      return `> ${f.claim.replace(/\n/g, '\n> ')}\n\n${meta}${f.notes ? `\n\nNotes:\n${f.notes}` : ''}`
    }).join('\n\n---\n\n')

    zip.file('_Opuscule/FactChecks.md', safeMatterStringify(body, {
      title: 'Fact Check',
      philoweek_type: 'fact_checks',
      exported: new Date().toISOString(),
    }))
  }

  const todos = db.prepare('SELECT * FROM todos WHERE user_id = ? ORDER BY status ASC, due_at ASC, created_at DESC').all(req.user.id)
  if (todos.length > 0) {
    zip.file('_Opuscule/Todos.json', JSON.stringify({
      philoweek_type: 'todos',
      exported: new Date().toISOString(),
      todos,
    }, null, 2))
  }

  const practices = db.prepare('SELECT * FROM agenda_practices WHERE user_id = ? ORDER BY created_at ASC').all(req.user.id)
  const agendaChecks = db.prepare('SELECT * FROM agenda_checks WHERE user_id = ? ORDER BY entry_date ASC').all(req.user.id)
  const lifeProfile = db.prepare('SELECT * FROM life_profiles WHERE user_id = ?').get(req.user.id)
  if (practices.length > 0 || agendaChecks.length > 0 || lifeProfile) {
    zip.file('_Opuscule/Dashboard.json', JSON.stringify({
      philoweek_type: 'dashboard',
      exported: new Date().toISOString(),
      practices,
      checks: agendaChecks,
      life_profile: lifeProfile || null,
    }, null, 2))
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
  } catch (err) {
    console.error('Export Obsidian error:', err)
    if (res.headersSent) return res.end()
    res.status(500).json({ error: "Export impossible. Un fichier n'a pas pu etre prepare." })
  }
})

function safeMatterStringify(content, frontmatter) {
  try {
    return matter.stringify(content, frontmatter)
  } catch (_) {
    return `${manualFrontmatter(frontmatter)}\n\n${String(content || '')}`
  }
}

function manualFrontmatter(data) {
  const lines = Object.entries(data).map(([key, value]) => {
    if (Array.isArray(value)) return `${key}: [${value.map(yamlScalar).join(', ')}]`
    return `${key}: ${yamlScalar(value)}`
  })
  return `---\n${lines.join('\n')}\n---`
}

function yamlScalar(value) {
  if (value === null || value === undefined) return '""'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(String(value))
}

module.exports = router
