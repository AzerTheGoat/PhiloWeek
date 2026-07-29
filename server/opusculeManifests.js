const matter = require('gray-matter')
const { v4: uuidv4 } = require('uuid')

function listOpusculeManifests(db, userId) {
  const exported = new Date().toISOString()
  const files = db.prepare(`
    SELECT id, parent_id, name, type, content, created_at, updated_at,
      history_revision, content_version
    FROM files
    WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY type DESC, sort_order ASC, name ASC
  `).all(userId)
  const pathMap = buildPathMap(files)
  const json = (philoweekType, payload) => JSON.stringify({
    philoweek_type: philoweekType,
    exported,
    ...payload,
  }, null, 2)
  const manifests = []
  const add = (name, content) => manifests.push({
    name,
    type: 'file',
    content,
  })

  const encryptedFolders = db.prepare(
    'SELECT folder_id FROM encrypted_folders WHERE user_id = ?'
  ).all(userId)
  add('EncryptedFolders.json', json('encrypted_folders', {
    version: 1,
    folders: encryptedFolders
      .map(({ folder_id }) => pathMap[folder_id])
      .filter(Boolean)
      .map(folderPath => ({ path: folderPath })),
  }))

  const spreadsheetFiles = files.filter(file => file.type === 'file' && /\.xlsx$/i.test(file.name || ''))
  add('SpreadsheetMetadata.json', json('spreadsheet_metadata', {
    workbooks: spreadsheetFiles.map(file => ({
      path: pathMap[file.id] || file.name,
      content: file.content || '',
    })),
  }))

  const quotes = db.prepare('SELECT * FROM quotes WHERE user_id = ? ORDER BY created_at DESC').all(userId)
  const quotesBody = quotes.map(quote => {
    const meta = [
      quote.author ? `Auteur: ${quote.author}` : null,
      quote.source ? `Source: ${quote.source}` : null,
      quote.tags ? `Tags: ${quote.tags}` : null,
      `Ajoute: ${quote.created_at}`,
    ].filter(Boolean).join('\n')
    return `> ${String(quote.quote || '').replace(/\n/g, '\n> ')}\n\n${meta}${quote.notes ? `\n\nNotes:\n${quote.notes}` : ''}`
  }).join('\n\n---\n\n')
  add('Citations.md', matter.stringify(quotesBody, {
    title: 'Citations',
    philoweek_type: 'quotes',
    exported,
  }))

  const factChecks = db.prepare('SELECT * FROM fact_checks WHERE user_id = ? ORDER BY created_at DESC').all(userId)
  const statusLabel = { to_check: 'A verifier', true: 'Vrai', false: 'Faux', partial: 'Partiellement vrai' }
  const factChecksBody = factChecks.map(factCheck => {
    const meta = [
      `Statut: ${statusLabel[factCheck.status] || factCheck.status}`,
      factCheck.source ? `Source: ${factCheck.source}` : null,
      factCheck.tags ? `Tags: ${factCheck.tags}` : null,
      `Ajoute: ${factCheck.created_at}`,
    ].filter(Boolean).join('\n')
    return `> ${String(factCheck.claim || '').replace(/\n/g, '\n> ')}\n\n${meta}${factCheck.notes ? `\n\nNotes:\n${factCheck.notes}` : ''}`
  }).join('\n\n---\n\n')
  add('FactChecks.md', matter.stringify(factChecksBody, {
    title: 'Fact Check',
    philoweek_type: 'fact_checks',
    exported,
  }))

  add('Todos.json', json('todos', {
    todos: db.prepare(
      'SELECT * FROM todos WHERE user_id = ? ORDER BY status ASC, due_at ASC, created_at DESC'
    ).all(userId),
  }))

  add('Dashboard.json', json('dashboard', {
    practices: db.prepare(
      'SELECT * FROM agenda_practices WHERE user_id = ? ORDER BY created_at ASC'
    ).all(userId),
    checks: db.prepare(
      'SELECT * FROM agenda_checks WHERE user_id = ? ORDER BY entry_date ASC'
    ).all(userId),
    life_profile: db.prepare('SELECT * FROM life_profiles WHERE user_id = ?').get(userId) || null,
  }))

  add('QuestionnaireResults.json', json('questionnaire_results', {
    results: db.prepare(
      'SELECT * FROM questionnaire_results WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId),
  }))

  const generatedQuizzes = db.prepare(`
    SELECT source_file_id, quiz_file_id, created_at, updated_at
    FROM generated_quizzes
    WHERE user_id = ?
    ORDER BY created_at ASC
  `).all(userId)
  const inferredGeneratedQuizzes = inferGeneratedQuizLinks(files, pathMap, generatedQuizzes)
  add('GeneratedQuizzes.json', json('generated_quizzes', {
    links: [...generatedQuizzes, ...inferredGeneratedQuizzes]
      .filter(link => pathMap[link.source_file_id] && pathMap[link.quiz_file_id])
      .map(link => ({
        source_path: pathMap[link.source_file_id],
        quiz_path: pathMap[link.quiz_file_id],
        created_at: link.created_at,
        updated_at: link.updated_at,
      })),
  }))

  add('AppUsage.json', json('app_usage', {
    day_boundary_hour: 3,
    days: db.prepare(`
      SELECT entry_date, duration_seconds, updated_at
      FROM app_usage_daily
      WHERE user_id = ?
      ORDER BY entry_date ASC
    `).all(userId),
  }))

  add('HistoricalTimeline.json', json('historical_timeline', {
    events: db.prepare(`
      SELECT * FROM historical_events
      WHERE user_id = ?
      ORDER BY start_year ASC, COALESCE(start_month, 0) ASC, COALESCE(start_day, 0) ASC
    `).all(userId),
  }))

  add('SocialJournal.json', json('social_journal', {
    articles: db.prepare(
      'SELECT * FROM articles WHERE user_id = ? ORDER BY COALESCE(published_at, updated_at) DESC'
    ).all(userId),
    comments: db.prepare(
      'SELECT * FROM article_comments WHERE user_id = ? ORDER BY created_at ASC'
    ).all(userId),
    reactions: db.prepare(
      'SELECT * FROM article_reactions WHERE user_id = ? ORDER BY created_at ASC'
    ).all(userId),
    reads: db.prepare(
      'SELECT * FROM article_reads WHERE user_id = ? ORDER BY created_at ASC'
    ).all(userId),
  }))

  const activeRevisions = db.prepare(`
    SELECT r.revision_no, r.file_id, r.content, r.created_at, actor.username AS actor_username
    FROM file_revisions r
    JOIN files f ON f.id = r.file_id
    LEFT JOIN users actor ON actor.id = r.actor_user_id
    WHERE r.user_id = ? AND f.deleted_at IS NULL AND r.encrypted_content IS NULL
    ORDER BY r.file_id, r.revision_no
  `).all(userId)
  add('FileHistory.json', json('file_history', {
    files: files
      .filter(file => file.type === 'file' && !isInsideOpuscule(file.id, files))
      .map(file => ({
        path: pathMap[file.id] || file.name,
        current_revision: Number(file.history_revision || 0),
        content_version: Number(file.content_version || 0),
        revisions: activeRevisions
          .filter(revision => revision.file_id === file.id)
          .map(({ revision_no, content, created_at, actor_username }) => ({
            revision_no,
            content,
            created_at,
            actor_username,
          })),
      })),
  }))

  const trashedFiles = db.prepare(`
    SELECT id, parent_id, name, type, content, created_at, updated_at, sort_order,
      deleted_at, history_revision, content_version
    FROM files
    WHERE user_id = ? AND deleted_at IS NOT NULL
    ORDER BY deleted_at ASC, type DESC, name ASC
  `).all(userId)
  add('Trash.json', json('trash', {
    active_parents: Object.fromEntries(files.map(file => [file.id, pathMap[file.id] || file.name])),
    files: trashedFiles,
    revisions: [],
  }))

  const shares = db.prepare(`
    SELECT s.file_id, s.permission, s.created_at, s.updated_at, recipient.username
    FROM file_shares s
    JOIN users recipient ON recipient.id = s.shared_with_user_id
    JOIN files f ON f.id = s.file_id
    WHERE s.owner_id = ? AND f.deleted_at IS NULL
    ORDER BY s.created_at ASC
  `).all(userId)
  add('Shares.json', json('file_shares', {
    shares: shares.map(share => ({
      path: pathMap[share.file_id],
      username: share.username,
      permission: share.permission,
      created_at: share.created_at,
      updated_at: share.updated_at,
    })),
  }))

  add('RoadTrips.json', json('road_trips', {
    version: 2,
    trips: db.prepare(
      'SELECT * FROM road_trips WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC'
    ).all(userId),
    photos: db.prepare(
      'SELECT * FROM road_trip_photos WHERE user_id = ? ORDER BY trip_id, sort_order ASC'
    ).all(userId),
    notes: db.prepare(
      'SELECT * FROM road_trip_notes WHERE user_id = ? ORDER BY trip_id, sort_order ASC'
    ).all(userId),
  }))

  return manifests
}

function inferGeneratedQuizLinks(files, pathMap, storedLinks) {
  const normalize = value => String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLocaleLowerCase()
  const idByPath = new Map(Object.entries(pathMap).map(([id, filePath]) => [normalize(filePath), id]))
  const linkedQuizIds = new Set(storedLinks.map(link => String(link.quiz_file_id)))
  const inferred = []

  for (const quiz of files) {
    const quizPath = pathMap[quiz.id] || ''
    if (
      quiz.type !== 'file' ||
      !/^quiz générés\//i.test(quizPath) ||
      !/\.json$/i.test(quiz.name || '') ||
      linkedQuizIds.has(String(quiz.id))
    ) continue

    let parsed
    try { parsed = JSON.parse(quiz.content || '{}') } catch (_) { continue }
    const sourcePaths = Array.isArray(parsed.source_paths)
      ? parsed.source_paths
      : (typeof parsed.generated_from === 'string' ? [parsed.generated_from] : [])
    const sourceId = sourcePaths
      .map(sourcePath => idByPath.get(normalize(sourcePath)))
      .find(Boolean)
    if (!sourceId || sourceId === quiz.id) continue

    inferred.push({
      source_file_id: sourceId,
      quiz_file_id: quiz.id,
      created_at: quiz.created_at,
      updated_at: quiz.updated_at,
    })
    linkedQuizIds.add(String(quiz.id))
  }
  return inferred
}

function ensureOpusculeManifestFiles(db, userId, rootId) {
  const manifests = listOpusculeManifests(db, userId)
  const existingNames = new Set(db.prepare(`
    SELECT lower(name) AS name
    FROM files
    WHERE parent_id = ? AND user_id = ? AND type = 'file' AND deleted_at IS NULL
  `).all(rootId, userId).map(row => row.name))
  const insertFile = db.prepare(`
    INSERT INTO files (
      id, parent_id, name, type, content, user_id, last_edited_by, created_at, updated_at
    ) VALUES (?, ?, ?, 'file', ?, ?, ?, ?, ?)
  `)
  const insertRevision = db.prepare(`
    INSERT INTO file_revisions (
      file_id, user_id, revision_no, content, created_at, actor_user_id
    ) VALUES (?, ?, 0, ?, ?, ?)
  `)
  const now = new Date().toISOString()
  const createMissing = db.transaction(() => {
    for (const manifest of manifests) {
      if (existingNames.has(manifest.name.toLocaleLowerCase())) continue
      const id = uuidv4()
      insertFile.run(id, rootId, manifest.name, manifest.content, userId, userId, now, now)
      insertRevision.run(id, userId, manifest.content, now, userId)
    }
  })
  createMissing()
}

function applyGeneratedQuizzesManifest(db, userId, content) {
  let parsed
  try { parsed = JSON.parse(content) } catch (_) {
    throw manifestError('GeneratedQuizzes.json doit contenir un JSON valide')
  }
  if (parsed?.philoweek_type !== 'generated_quizzes' || !Array.isArray(parsed.links)) {
    throw manifestError('Le manifeste doit contenir philoweek_type = generated_quizzes et un tableau links')
  }
  if (parsed.links.length > 1000) throw manifestError('Le manifeste est limité à 1000 liaisons')

  const files = db.prepare(`
    SELECT id, parent_id, name, type
    FROM files
    WHERE user_id = ? AND deleted_at IS NULL
  `).all(userId)
  const pathMap = buildPathMap(files)
  const normalize = value => String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLocaleLowerCase()
  const idByPath = new Map(Object.entries(pathMap).map(([id, filePath]) => [normalize(filePath), id]))
  const resolved = parsed.links.map((link, index) => {
    const sourceId = idByPath.get(normalize(link?.source_path))
    const quizId = idByPath.get(normalize(link?.quiz_path))
    if (!sourceId || !quizId || sourceId === quizId) {
      throw manifestError(`Liaison ${index + 1} introuvable : vérifie source_path et quiz_path`)
    }
    return {
      sourceId,
      quizId,
      createdAt: validIsoDate(link?.created_at) || new Date().toISOString(),
      updatedAt: validIsoDate(link?.updated_at) || new Date().toISOString(),
    }
  })
  const uniqueSources = new Set(resolved.map(link => link.sourceId))
  const uniqueQuizzes = new Set(resolved.map(link => link.quizId))
  if (uniqueSources.size !== resolved.length || uniqueQuizzes.size !== resolved.length) {
    throw manifestError('Chaque note source et chaque quiz ne peut apparaître qu’une seule fois')
  }

  const replaceLinks = db.transaction(() => {
    db.prepare('DELETE FROM generated_quizzes WHERE user_id = ?').run(userId)
    const insert = db.prepare(`
      INSERT INTO generated_quizzes (
        source_file_id, quiz_file_id, user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)
    `)
    for (const link of resolved) {
      insert.run(link.sourceId, link.quizId, userId, link.createdAt, link.updatedAt)
    }
  })
  replaceLinks()
  return resolved.length
}

function manifestError(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

function validIsoDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function buildPathMap(files) {
  const byId = new Map(files.map(file => [file.id, file]))
  const pathMap = {}
  const getPath = id => {
    if (pathMap[id] !== undefined) return pathMap[id]
    const file = byId.get(id)
    if (!file) return ''
    pathMap[id] = file.parent_id ? `${getPath(file.parent_id)}/${file.name}` : file.name
    return pathMap[id]
  }
  files.forEach(file => getPath(file.id))
  return pathMap
}

function isInsideOpuscule(id, files) {
  const byId = new Map(files.map(file => [file.id, file]))
  let current = byId.get(id)
  while (current) {
    if (!current.parent_id && String(current.name).toLocaleLowerCase() === '_opuscule') return true
    current = current.parent_id ? byId.get(current.parent_id) : null
  }
  return false
}

module.exports = {
  applyGeneratedQuizzesManifest,
  ensureOpusculeManifestFiles,
  listOpusculeManifests,
}
