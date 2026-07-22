const { v4: uuidv4 } = require('uuid')
const { buildQuizGenerationPrompt, buildEmptyGeneratedQuiz } = require('./quizPrompt')
const { materializeFile } = require('./vaultCrypto')

const GENERATED_QUIZZES_ROOT = 'Quiz générés'

function createOrRefreshGeneratedQuiz(db, sourceFileId, userId, sessionId = null) {
  const storedSource = db.prepare(`
    SELECT * FROM files
    WHERE id = ? AND user_id = ? AND type = 'file' AND deleted_at IS NULL
  `).get(sourceFileId, userId)
  if (!storedSource) throw httpError(404, 'Note introuvable')
  const source = materializeFile(db, storedSource, sessionId)
  if (!/\.md$/i.test(source.name || '')) throw httpError(400, 'Cette action est reservee aux notes Markdown')
  if (/philoweek_type:\s*graph/i.test(source.content || '')) throw httpError(400, 'Un graphe ne peut pas servir de note source')

  const sourcePath = getOwnedFilePath(db, source.id, userId)
  if (normalizePath(sourcePath).startsWith(`${normalizePath(GENERATED_QUIZZES_ROOT)}/`)) {
    throw httpError(400, 'Impossible de generer un quiz depuis le dossier de quiz')
  }

  let created = false
  let link = db.prepare(`
    SELECT g.*, q.deleted_at AS quiz_deleted_at
    FROM generated_quizzes g
    LEFT JOIN files q ON q.id = g.quiz_file_id
    WHERE g.source_file_id = ? AND g.user_id = ?
  `).get(source.id, userId)
  if (link?.quiz_deleted_at) {
    db.prepare('DELETE FROM generated_quizzes WHERE source_file_id = ? AND user_id = ?').run(source.id, userId)
    link = null
  }

  if (!link) {
    const createdQuiz = createGeneratedQuiz(db, source, sourcePath, userId)
    link = { source_file_id: source.id, quiz_file_id: createdQuiz.id, user_id: userId }
    created = true
  }

  syncGeneratedQuizzes(db, userId)
  const quiz = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(link.quiz_file_id, userId)
  if (!quiz) throw httpError(409, 'Le fichier quiz lie est introuvable')
  const freshSourcePath = getOwnedFilePath(db, source.id, userId)
  const quizPath = getOwnedFilePath(db, quiz.id, userId)
  return {
    created,
    quiz,
    source_path: freshSourcePath,
    quiz_path: quizPath,
    prompt: buildQuizGenerationPrompt({ source, sourcePath: freshSourcePath, quizPath }),
  }
}

function createGeneratedQuiz(db, source, sourcePath, userId) {
  const now = new Date().toISOString()
  const parentId = ensureMirrorParent(db, source, userId)
  const quizName = source.name.replace(/\.md$/i, '') + '.json'
  const duplicate = db.prepare(`
    SELECT id FROM files WHERE parent_id IS ? AND lower(name) = lower(?) AND user_id = ? AND deleted_at IS NULL
  `).get(parentId, quizName, userId)
  if (duplicate) throw httpError(409, `Un fichier existe deja a l'emplacement ${mirrorPathForSource(db, source, userId)}`)

  const quizId = uuidv4()
  const quizPath = `${mirrorDirectoryPath(db, source, userId)}/${quizName}`
  const content = buildEmptyGeneratedQuiz({ source, sourcePath, quizPath })
  db.prepare(`
    INSERT INTO files (id, parent_id, name, type, content, user_id, last_edited_by, created_at, updated_at)
    VALUES (?, ?, ?, 'file', ?, ?, ?, ?, ?)
  `).run(quizId, parentId, quizName, content, userId, userId, now, now)
  db.prepare(`
    INSERT INTO file_revisions (file_id, user_id, revision_no, content, created_at, actor_user_id)
    VALUES (?, ?, 0, ?, ?, ?)
  `).run(quizId, userId, content, now, userId)
  db.prepare(`
    INSERT INTO generated_quizzes (source_file_id, quiz_file_id, user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(source.id, quizId, userId, now, now)
  return db.prepare('SELECT * FROM files WHERE id = ?').get(quizId)
}

function syncGeneratedQuizzes(db, userId) {
  const links = db.prepare(`
    SELECT g.source_file_id, g.quiz_file_id, s.name AS source_name
    FROM generated_quizzes g
    JOIN files s ON s.id = g.source_file_id AND s.deleted_at IS NULL
    JOIN files q ON q.id = g.quiz_file_id AND q.deleted_at IS NULL
    WHERE g.user_id = ? AND s.user_id = ? AND q.user_id = ?
  `).all(userId, userId, userId)

  for (const link of links) {
    const source = db.prepare('SELECT * FROM files WHERE id = ?').get(link.source_file_id)
    const quiz = db.prepare('SELECT * FROM files WHERE id = ?').get(link.quiz_file_id)
    if (!source || !quiz) continue
    const parentId = ensureMirrorParent(db, source, userId)
    const desiredName = source.name.replace(/\.md$/i, '') + '.json'
    const collision = db.prepare(`
      SELECT id FROM files
      WHERE parent_id IS ? AND lower(name) = lower(?) AND id != ? AND user_id = ? AND deleted_at IS NULL
    `).get(parentId, desiredName, quiz.id, userId)
    if (collision) throw httpError(409, `Le quiz miroir ne peut pas etre deplace : ${desiredName} existe deja`)

    const sourcePath = getOwnedFilePath(db, source.id, userId)
    const quizPath = `${mirrorDirectoryPath(db, source, userId)}/${desiredName}`
    const content = updateGeneratedMetadata(quiz.content, source, sourcePath, quizPath)
    const contentChanged = content !== (quiz.content || '')
    const locationChanged = quiz.parent_id !== parentId || quiz.name !== desiredName
    if (!contentChanged && !locationChanged) continue

    const now = new Date().toISOString()
    if (contentChanged) {
      const nextRevision = Number(quiz.history_revision || 0) + 1
      db.prepare('DELETE FROM file_revisions WHERE file_id = ? AND revision_no > ?').run(quiz.id, Number(quiz.history_revision || 0))
      db.prepare(`
        INSERT INTO file_revisions (file_id, user_id, revision_no, content, created_at, actor_user_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(quiz.id, userId, nextRevision, content, now, userId)
      db.prepare(`
        UPDATE files SET parent_id = ?, name = ?, content = ?, history_revision = ?,
          content_version = content_version + 1, last_edited_by = ?, updated_at = ?
        WHERE id = ?
      `).run(parentId, desiredName, content, nextRevision, userId, now, quiz.id)
      pruneRevisions(db, quiz.id)
    } else {
      db.prepare('UPDATE files SET parent_id = ?, name = ?, updated_at = ? WHERE id = ?')
        .run(parentId, desiredName, now, quiz.id)
    }
    db.prepare('UPDATE generated_quizzes SET updated_at = ? WHERE source_file_id = ?').run(now, source.id)
  }
  pruneEmptyMirrorFolders(db, userId)
}

function ensureMirrorParent(db, source, userId) {
  const root = ensureFolder(db, null, GENERATED_QUIZZES_ROOT, userId)
  const ancestors = getSourceFolderNames(db, source, userId)
  let parentId = root.id
  for (const name of ancestors) parentId = ensureFolder(db, parentId, name, userId).id
  return parentId
}

function ensureFolder(db, parentId, name, userId) {
  const existing = db.prepare(`
    SELECT * FROM files WHERE parent_id IS ? AND lower(name) = lower(?) AND user_id = ? AND deleted_at IS NULL
  `).get(parentId, name, userId)
  if (existing) {
    if (existing.type !== 'folder') throw httpError(409, `Impossible de creer le dossier miroir "${name}"`)
    return existing
  }
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO files (id, parent_id, name, type, user_id, created_at, updated_at)
    VALUES (?, ?, ?, 'folder', ?, ?, ?)
  `).run(id, parentId, name, userId, now, now)
  return db.prepare('SELECT * FROM files WHERE id = ?').get(id)
}

function getSourceFolderNames(db, source, userId) {
  const names = []
  let parentId = source.parent_id
  while (parentId) {
    const parent = db.prepare(`SELECT id, parent_id, name FROM files WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).get(parentId, userId)
    if (!parent) break
    names.unshift(parent.name)
    parentId = parent.parent_id
  }
  return names
}

function mirrorDirectoryPath(db, source, userId) {
  return [GENERATED_QUIZZES_ROOT, ...getSourceFolderNames(db, source, userId)].join('/')
}

function mirrorPathForSource(db, source, userId) {
  return `${mirrorDirectoryPath(db, source, userId)}/${source.name.replace(/\.md$/i, '')}.json`
}

function getOwnedFilePath(db, fileId, userId) {
  const parts = []
  let cursor = db.prepare('SELECT id, parent_id, name FROM files WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(fileId, userId)
  while (cursor) {
    parts.unshift(cursor.name)
    cursor = cursor.parent_id
      ? db.prepare('SELECT id, parent_id, name FROM files WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(cursor.parent_id, userId)
      : null
  }
  return parts.join('/')
}

function updateGeneratedMetadata(content, source, sourcePath, quizPath) {
  try {
    const parsed = JSON.parse(String(content || '{}'))
    if (!parsed || typeof parsed !== 'object' || parsed.philoweek_type !== 'questionnaire') return content || ''
    const currentSourcePaths = Array.isArray(parsed.source_paths) ? parsed.source_paths.map(String) : []
    const currentSourceIds = Array.isArray(parsed.source_file_ids) ? parsed.source_file_ids.map(String) : []
    if (
      currentSourcePaths.length === 1 && currentSourcePaths[0] === sourcePath &&
      currentSourceIds.length === 1 && currentSourceIds[0] === String(source.id) &&
      parsed.generated_from?.source_path === sourcePath &&
      parsed.generated_from?.quiz_path === quizPath
    ) return content || ''
    parsed.source_paths = [sourcePath]
    parsed.source_file_ids = [String(source.id)]
    parsed.generated_from = { ...(parsed.generated_from || {}), source_path: sourcePath, quiz_path: quizPath }
    parsed.modified = new Date().toISOString()
    return JSON.stringify(parsed, null, 2)
  } catch (_) {
    return content || ''
  }
}

function isManagedGeneratedQuiz(db, fileId, userId) {
  return Boolean(db.prepare('SELECT 1 FROM generated_quizzes WHERE quiz_file_id = ? AND user_id = ?').get(fileId, userId))
}

function isGeneratedQuizStructure(db, fileId, userId) {
  let cursor = db.prepare(`
    SELECT id, parent_id, name, type FROM files
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
  `).get(fileId, userId)
  if (!cursor || cursor.type === 'file') return false
  while (cursor) {
    if (!cursor.parent_id && cursor.type === 'folder' && cursor.name.toLocaleLowerCase() === GENERATED_QUIZZES_ROOT.toLocaleLowerCase()) return true
    cursor = cursor.parent_id
      ? db.prepare('SELECT id, parent_id, name, type FROM files WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(cursor.parent_id, userId)
      : null
  }
  return false
}

function pruneRevisions(db, fileId) {
  db.prepare(`
    DELETE FROM file_revisions WHERE file_id = ? AND revision_no NOT IN (
      SELECT revision_no FROM file_revisions WHERE file_id = ? ORDER BY revision_no DESC LIMIT 100
    )
  `).run(fileId, fileId)
}

function pruneEmptyMirrorFolders(db, userId) {
  const root = db.prepare(`
    SELECT id FROM files
    WHERE parent_id IS NULL AND lower(name) = lower(?) AND type = 'folder'
      AND user_id = ? AND deleted_at IS NULL
  `).get(GENERATED_QUIZZES_ROOT, userId)
  if (!root) return
  const folders = db.prepare(`
    WITH RECURSIVE subtree(id, depth) AS (
      SELECT id, 0 FROM files WHERE id = ?
      UNION ALL
      SELECT child.id, subtree.depth + 1
      FROM files child JOIN subtree ON child.parent_id = subtree.id
      WHERE child.user_id = ? AND child.type = 'folder' AND child.deleted_at IS NULL
    )
    SELECT id, depth FROM subtree WHERE id != ? ORDER BY depth DESC
  `).all(root.id, userId, root.id)
  for (const folder of folders) {
    const child = db.prepare('SELECT 1 FROM files WHERE parent_id = ? AND deleted_at IS NULL LIMIT 1').get(folder.id)
    if (!child) db.prepare('DELETE FROM files WHERE id = ? AND user_id = ?').run(folder.id, userId)
  }
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').trim().toLowerCase()
}

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

module.exports = {
  GENERATED_QUIZZES_ROOT,
  createOrRefreshGeneratedQuiz,
  syncGeneratedQuizzes,
  isManagedGeneratedQuiz,
  isGeneratedQuizStructure,
  getOwnedFilePath,
}
