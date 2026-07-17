const { v4: uuidv4 } = require('uuid')
const { getDb, updateAllLinks } = require('./db')

const ONE_SECOND = 1000
const ONE_MINUTE = 60 * ONE_SECOND
const FIVE_MINUTES = 5 * ONE_MINUTE
const ONE_HOUR = 60 * ONE_MINUTE
const ONE_DAY = 24 * ONE_HOUR

const USER_TABLES = [
  'files',
  'timer_sessions',
  'voice_notes',
  'inbox_resources',
  'inbox_ideas',
  'quotes',
  'fact_checks',
  'todos',
  'agenda_practices',
  'agenda_checks',
  'life_profiles',
  'questionnaire_results',
  'historical_events',
  'articles',
  'article_comments',
  'article_reactions',
  'article_reads',
]

const RELATION_TABLES = [
  {
    name: 'file_links',
    sql: `SELECT fl.*
      FROM file_links fl
      JOIN files f ON f.id = fl.source_id
      WHERE f.user_id = ?
      ORDER BY fl.source_id, fl.target_id`,
  },
  {
    name: 'file_tags',
    sql: `SELECT ft.*
      FROM file_tags ft
      JOIN files f ON f.id = ft.file_id
      WHERE f.user_id = ?
      ORDER BY ft.file_id, ft.tag`,
  },
]

const DELETE_ORDER = [
  'file_links',
  'file_tags',
  'voice_notes',
  'timer_sessions',
  'questionnaire_results',
  'historical_events',
  'article_reads',
  'article_reactions',
  'article_comments',
  'articles',
  'agenda_checks',
  'agenda_practices',
  'life_profiles',
  'todos',
  'fact_checks',
  'quotes',
  'inbox_ideas',
  'inbox_resources',
  'files',
]

const INSERT_ORDER = [
  'files',
  'file_links',
  'file_tags',
  'timer_sessions',
  'voice_notes',
  'inbox_resources',
  'inbox_ideas',
  'quotes',
  'fact_checks',
  'todos',
  'agenda_practices',
  'agenda_checks',
  'life_profiles',
  'questionnaire_results',
  'historical_events',
  'articles',
  'article_comments',
  'article_reactions',
  'article_reads',
]

function historyCaptureMiddleware(req, res, next) {
  if (!req.user?.id || !shouldCaptureRequest(req)) return next()
  const db = getDb()
  const userId = req.user.id
  const reason = `${req.method} ${req.originalUrl}`
  let before
  try {
    before = collectSnapshot(db, userId)
  } catch (err) {
    console.error('History snapshot failed:', err.message)
    return next()
  }

  res.once('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 400) return
    try {
      recordMutationSnapshot(db, userId, reason, before)
    } catch (err) {
      console.error('History snapshot failed:', err.message)
    }
  })
  next()
}

function shouldCaptureRequest(req) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return false
  if (req.path.startsWith('/history')) return false
  if (req.path.startsWith('/auth')) return false
  if (req.path.startsWith('/handwriting')) return false
  return true
}

function maybeCreateSnapshot(db, userId, reason = 'mutation') {
  const data = collectSnapshot(db, userId)
  return insertSnapshot(db, userId, reason, data, 'undo', { clearRedo: true })
}

function recordMutationSnapshot(db, userId, reason, before) {
  const current = collectSnapshot(db, userId)
  if (stableJson(current) === stableJson(before)) return null
  return insertSnapshot(db, userId, reason, before, 'undo', { clearRedo: true })
}

function insertSnapshot(db, userId, reason, data, stack, { clearRedo = false } = {}) {
  const now = Date.now()
  const id = uuidv4()
  const createdAt = new Date(now).toISOString()
  if (clearRedo) {
    db.prepare("DELETE FROM app_snapshots WHERE user_id = ? AND stack = 'redo'").run(userId)
  }
  db.prepare(`
    INSERT INTO app_snapshots (id, user_id, created_at, reason, data_json, stack)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, createdAt, reason, JSON.stringify(data), stack)
  pruneSnapshots(db, userId, now)
  return { id, created_at: createdAt }
}

function restoreLatestSnapshot(db, userId, direction, { confirm = false } = {}) {
  const sourceStack = direction === 'redo' ? 'redo' : 'undo'
  const destinationStack = direction === 'redo' ? 'undo' : 'redo'
  const row = db.prepare(`
    SELECT * FROM app_snapshots
    WHERE user_id = ? AND stack = ?
    ORDER BY created_at DESC, rowid DESC
    LIMIT 1
  `).get(userId, sourceStack)
  if (!row) {
    return {
      ok: false,
      status: 404,
      error: direction === 'redo' ? 'Aucune action a retablir.' : 'Aucune action a annuler.',
    }
  }

  const target = parseSnapshot(row.data_json)
  const current = collectSnapshot(db, userId)
  const fileChange = describeFileChange(current, target)
  if (fileChange.requiresConfirmation && !confirm) {
    return {
      ok: false,
      status: 409,
      requiresConfirmation: true,
      restored_at: row.created_at,
      focus_file_id: fileChange.focusFileId,
      error: 'Ce retour en arriere va restaurer ou deplacer un fichier.',
    }
  }

  const tx = db.transaction(() => {
    insertSnapshot(db, userId, row.reason || direction, current, destinationStack)
    restoreSnapshot(db, userId, target)
    db.prepare('DELETE FROM app_snapshots WHERE id = ? AND user_id = ?').run(row.id, userId)
  })
  tx()

  return {
    ok: true,
    direction,
    restored_at: row.created_at,
    files_changed: fileChange.changed,
    focus_file_id: fileChange.focusFileId,
    requires_confirmation: fileChange.requiresConfirmation,
  }
}

function rollbackLatestSnapshot(db, userId, options = {}) {
  return restoreLatestSnapshot(db, userId, 'undo', options)
}

function redoLatestSnapshot(db, userId, options = {}) {
  return restoreLatestSnapshot(db, userId, 'redo', options)
}

function collectSnapshot(db, userId) {
  const data = {}
  for (const table of USER_TABLES) {
    data[table] = db.prepare(`SELECT * FROM ${table} WHERE user_id = ? ORDER BY rowid`).all(userId)
  }
  for (const relation of RELATION_TABLES) {
    data[relation.name] = db.prepare(relation.sql).all(userId)
  }
  return data
}

function restoreSnapshot(db, userId, data) {
  deleteUserData(db, userId)
  for (const table of INSERT_ORDER) {
    insertRows(db, table, Array.isArray(data[table]) ? data[table] : [], userId)
  }
  updateAllLinks(db, userId)
}

function deleteUserData(db, userId) {
  for (const table of DELETE_ORDER) {
    if (table === 'file_links') {
      db.prepare(`
        DELETE FROM file_links
        WHERE source_id IN (SELECT id FROM files WHERE user_id = ?)
      `).run(userId)
    } else if (table === 'file_tags') {
      db.prepare(`
        DELETE FROM file_tags
        WHERE file_id IN (SELECT id FROM files WHERE user_id = ?)
      `).run(userId)
    } else {
      db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId)
    }
  }
}

function insertRows(db, table, rows, userId) {
  if (!rows.length) return
  const columns = getColumns(db, table)
  const insertableRows = rows.map(row => {
    const next = {}
    for (const column of columns) {
      if (Object.prototype.hasOwnProperty.call(row, column)) next[column] = row[column]
    }
    if (columns.includes('user_id')) next.user_id = userId
    return next
  }).filter(row => Object.keys(row).length > 0)
  if (!insertableRows.length) return

  const names = Object.keys(insertableRows[0])
  const placeholders = names.map(() => '?').join(', ')
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO ${table} (${names.join(', ')})
    VALUES (${placeholders})
  `)
  for (const row of insertableRows) {
    stmt.run(...names.map(name => row[name]))
  }
}

function getColumns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map(col => col.name)
}

function pruneSnapshots(db, userId, now = Date.now()) {
  const rows = db.prepare(`
    SELECT id, created_at FROM app_snapshots
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId)

  const keep = new Set()
  const buckets = new Set()
  for (const row of rows) {
    const time = Date.parse(row.created_at)
    if (!Number.isFinite(time) || now - time > ONE_DAY) continue
    const age = now - time
    if (age <= FIVE_MINUTES) {
      keep.add(row.id)
    } else if (age <= ONE_HOUR) {
      keepBucket(row, time, ONE_MINUTE, buckets, keep)
    } else {
      keepBucket(row, time, FIVE_MINUTES, buckets, keep)
    }
  }

  const deleteStmt = db.prepare('DELETE FROM app_snapshots WHERE id = ?')
  for (const row of rows) {
    if (!keep.has(row.id)) deleteStmt.run(row.id)
  }
}

function keepBucket(row, time, size, buckets, keep) {
  const bucket = Math.floor(time / size)
  if (buckets.has(bucket)) return
  buckets.add(bucket)
  keep.add(row.id)
}

function parseSnapshot(raw) {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (_) {
    return {}
  }
}

function stableJson(value) {
  return JSON.stringify(value)
}

function describeFileChange(current, target) {
  const currentFiles = Array.isArray(current.files) ? current.files : []
  const targetFiles = Array.isArray(target.files) ? target.files : []
  const currentById = new Map(currentFiles.map(file => [file.id, file]))
  const targetById = new Map(targetFiles.map(file => [file.id, file]))

  const restored = targetFiles.find(file => !currentById.has(file.id))
  const moved = targetFiles.find(file => {
    const currentFile = currentById.get(file.id)
    return currentFile && (currentFile.parent_id || null) !== (file.parent_id || null)
  })

  const contentChanged = targetFiles.find(file => {
    if (file.type !== 'file') return false
    const currentFile = currentById.get(file.id)
    return currentFile && stableJson(normalizeFileContent(currentFile)) !== stableJson(normalizeFileContent(file))
  })

  const deletedByRollback = currentFiles.find(file => !targetById.has(file.id))
  const relationChanged = stableJson({
    file_links: current.file_links || [],
    file_tags: current.file_tags || [],
  }) !== stableJson({
    file_links: target.file_links || [],
    file_tags: target.file_tags || [],
  })

  const focusFileId =
    firstFocusableFileId(restored, targetFiles) ||
    firstFocusableFileId(moved, targetFiles) ||
    firstFocusableFileId(contentChanged, targetFiles) ||
    firstFocusableFileId(deletedByRollback, targetFiles)

  return {
    changed: Boolean(restored || moved || contentChanged || deletedByRollback || relationChanged),
    requiresConfirmation: Boolean(restored || moved),
    focusFileId,
  }
}

function normalizeFileContent(file) {
  return {
    name: file.name,
    type: file.type,
    content: file.content,
    password_hash: file.password_hash,
    encrypted_content: file.encrypted_content,
    sort_order: file.sort_order,
  }
}

function firstFocusableFileId(file, allTargetFiles) {
  if (!file) return null
  if (file.type === 'file') return file.id
  const child = allTargetFiles.find(candidate => candidate.type === 'file' && candidate.parent_id === file.id)
  return child ? child.id : null
}

module.exports = {
  historyCaptureMiddleware,
  maybeCreateSnapshot,
  rollbackLatestSnapshot,
  redoLatestSnapshot,
  collectSnapshot,
}
