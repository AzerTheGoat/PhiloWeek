const express = require('express')
const router = express.Router()
const JSZip = require('jszip')
const matter = require('gray-matter')
const fs = require('fs')
const path = require('path')
const { getDb } = require('../db')
const { ROADTRIP_PHOTOS_DIR } = require('../paths')
const { spreadsheetToXlsxBuffer } = require('../spreadsheetXlsx')

router.get('/obsidian', async (req, res) => {
  try {
    const db = getDb()
    const zip = new JSZip()
    const allFiles = db.prepare('SELECT * FROM files WHERE user_id = ? AND deleted_at IS NULL ORDER BY type DESC, sort_order, name').all(req.user.id)

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
    } else if (/\.xlsx$/i.test(file.name)) {
      zip.file(originalPath, await spreadsheetToXlsxBuffer(rawContent))
    } else {
      zip.file(originalPath, rawContent)
    }
  }

  const spreadsheetFiles = allFiles.filter(file => file.type === 'file' && /\.xlsx$/i.test(file.name || ''))
  if (spreadsheetFiles.length > 0) {
    zip.file('_Opuscule/SpreadsheetMetadata.json', JSON.stringify({
      philoweek_type: 'spreadsheet_metadata',
      exported: new Date().toISOString(),
      workbooks: spreadsheetFiles.map(file => ({ path: pathMap[file.id] || file.name, content: file.content || '' })),
    }, null, 2))
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

  const historicalEvents = db.prepare(`
    SELECT * FROM historical_events
    WHERE user_id = ?
    ORDER BY start_year ASC, COALESCE(start_month, 0) ASC, COALESCE(start_day, 0) ASC
  `).all(req.user.id)
  if (historicalEvents.length > 0) {
    zip.file('_Opuscule/HistoricalTimeline.json', JSON.stringify({
      philoweek_type: 'historical_timeline',
      exported: new Date().toISOString(),
      events: historicalEvents,
    }, null, 2))
  }

  const articles = db.prepare(`
    SELECT * FROM articles
    WHERE user_id = ?
    ORDER BY COALESCE(published_at, updated_at) DESC
  `).all(req.user.id)
  const articleComments = db.prepare(`
    SELECT article_comments.*
    FROM article_comments
    WHERE article_comments.user_id = ?
    ORDER BY article_comments.created_at ASC
  `).all(req.user.id)
  const articleReactions = db.prepare(`
    SELECT * FROM article_reactions
    WHERE user_id = ?
    ORDER BY created_at ASC
  `).all(req.user.id)
  const articleReads = db.prepare(`
    SELECT * FROM article_reads
    WHERE user_id = ?
    ORDER BY created_at ASC
  `).all(req.user.id)
  if (articles.length > 0 || articleComments.length > 0 || articleReactions.length > 0 || articleReads.length > 0) {
    zip.file('_Opuscule/SocialJournal.json', JSON.stringify({
      philoweek_type: 'social_journal',
      exported: new Date().toISOString(),
      articles,
      comments: articleComments,
      reactions: articleReactions,
      reads: articleReads,
    }, null, 2))
  }

  const activeRevisions = db.prepare(`
    SELECT r.file_id, r.revision_no, r.content, r.created_at, actor.username AS actor_username
    FROM file_revisions r
    JOIN files f ON f.id = r.file_id
    LEFT JOIN users actor ON actor.id = r.actor_user_id
    WHERE r.user_id = ? AND f.deleted_at IS NULL
    ORDER BY r.file_id, r.revision_no
  `).all(req.user.id)
  if (activeRevisions.length > 0) {
    zip.file('_Opuscule/FileHistory.json', JSON.stringify({
      philoweek_type: 'file_history',
      exported: new Date().toISOString(),
      files: allFiles
        .filter(file => file.type === 'file')
        .map(file => ({
          path: pathMap[file.id] || file.name,
          current_revision: Number(file.history_revision || 0),
          content_version: Number(file.content_version || 0),
          revisions: activeRevisions
            .filter(revision => revision.file_id === file.id)
            .map(({ revision_no, content, created_at, actor_username }) => ({ revision_no, content, created_at, actor_username })),
        })),
    }, null, 2))
  }

  const trashedFiles = db.prepare(`
    SELECT f.id, f.parent_id, f.name, f.type, f.content, f.password_hash, f.encrypted_content,
      f.created_at, f.updated_at, f.sort_order, f.deleted_at, f.history_revision, f.content_version,
      editor.username AS last_edited_by_username
    FROM files f
    LEFT JOIN users editor ON editor.id = f.last_edited_by
    WHERE f.user_id = ? AND f.deleted_at IS NOT NULL
    ORDER BY f.deleted_at ASC, f.type DESC, f.name ASC
  `).all(req.user.id)
  if (trashedFiles.length > 0) {
    const trashedIds = new Set(trashedFiles.map(file => file.id))
    const revisions = db.prepare(`
      SELECT r.file_id, r.revision_no, r.content, r.created_at, actor.username AS actor_username
      FROM file_revisions r
      LEFT JOIN users actor ON actor.id = r.actor_user_id
      WHERE r.user_id = ? ORDER BY r.file_id, r.revision_no
    `).all(req.user.id).filter(revision => trashedIds.has(revision.file_id))
    zip.file('_Opuscule/Trash.json', JSON.stringify({
      philoweek_type: 'trash',
      exported: new Date().toISOString(),
      active_parents: Object.fromEntries(allFiles.map(file => [file.id, pathMap[file.id] || file.name])),
      files: trashedFiles,
      revisions,
    }, null, 2))
  }

  const shares = db.prepare(`
    SELECT s.file_id, s.permission, s.created_at, s.updated_at, recipient.username
    FROM file_shares s
    JOIN users recipient ON recipient.id = s.shared_with_user_id
    JOIN files f ON f.id = s.file_id
    WHERE s.owner_id = ? AND f.deleted_at IS NULL
    ORDER BY s.created_at ASC
  `).all(req.user.id)
  if (shares.length > 0) {
    zip.file('_Opuscule/Shares.json', JSON.stringify({
      philoweek_type: 'file_shares',
      exported: new Date().toISOString(),
      shares: shares.map(share => ({
        path: pathMap[share.file_id],
        username: share.username,
        permission: share.permission,
        created_at: share.created_at,
        updated_at: share.updated_at,
      })),
    }, null, 2))
  }

  const roadTrips = db.prepare('SELECT * FROM road_trips WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').all(req.user.id)
  if (roadTrips.length > 0) {
    const roadTripPhotos = db.prepare('SELECT * FROM road_trip_photos WHERE user_id = ? ORDER BY trip_id, sort_order ASC').all(req.user.id)
    // Les binaires des photos sont ajoutés au ZIP sous _Opuscule/roadtrip-photos/
    // pour que la sauvegarde manuelle soit complète (photos incluses).
    for (const photo of roadTripPhotos) {
      try {
        const filePath = path.join(ROADTRIP_PHOTOS_DIR, photo.filename)
        if (fs.existsSync(filePath)) zip.file(`_Opuscule/roadtrip-photos/${photo.filename}`, fs.readFileSync(filePath))
      } catch (_) {}
    }
    zip.file('_Opuscule/RoadTrips.json', JSON.stringify({
      philoweek_type: 'road_trips',
      exported: new Date().toISOString(),
      trips: roadTrips,
      photos: roadTripPhotos,
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
