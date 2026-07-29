const express = require('express')
const router = express.Router()
const crypto = require('crypto')
const { promisify } = require('util')
const { getDb, updateTags, updateLinks, updateAllLinks } = require('../db')
const { v4: uuidv4 } = require('uuid')
const { verifyPassword: verifyPasswordStrong } = require('../auth/password')
const { decorateFileAccess, getAccessibleFileRows, getFileAccess, getSharedTreeRoots, requireFileAccess } = require('../fileAccess')
const { isGeneratedQuizStructure, isManagedGeneratedQuiz, syncGeneratedQuizzes } = require('../generatedQuizzes')
const {
  changeVaultPassword,
  createEncryptedFolder,
  decryptText,
  encryptCurrentFileContent,
  encryptRevisionContent,
  encryptText,
  evictFolderKey,
  isFolderOpen,
  materializeFile,
  materializeRevision,
  openEncryptedFolder,
  requireFolderKey,
} = require('../vaultCrypto')
const { assertUserStorageQuota, securityLog, unlockLimiter } = require('../securityControls')
const { findOpusculeManifest, listOpusculeManifestHeaders } = require('../opusculeManifests')

// Ancien sel statique — conservé UNIQUEMENT pour déchiffrer les dossiers
// verrouillés avant la migration vers le format GCM (sel aléatoire).
const LEGACY_KEY_SALT = 'philoweek-salt-v2'
const MAX_FILE_REVISIONS = 100
const scryptAsync = promisify(crypto.scrypt)

// GET /api/files — full tree
router.get('/', (req, res) => {
  const db = getDb()
  purgeExpiredTrash(db, req.user.id)
  const opusculeRootId = ensureOpusculeRoot(db, req.user.id)
  const tree = buildAccessibleTree(db, req.user.id, req.user.session_id)
  const opusculeRoot = tree.find(node => node.id === opusculeRootId)
  if (opusculeRoot) {
    const virtualChildren = listOpusculeManifestHeaders().map(manifest => ({
      id: manifest.id,
      parent_id: opusculeRootId,
      name: manifest.name,
      type: 'file',
      sort_order: 0,
      is_owner: true,
      can_edit: false,
      can_share: false,
      is_system: true,
      children: [],
    }))
    const virtualNames = new Set(virtualChildren.map(child => child.name.toLocaleLowerCase()))
    opusculeRoot.children = [
      ...(opusculeRoot.children || []).filter(child => !virtualNames.has(String(child.name).toLocaleLowerCase())),
      ...virtualChildren,
    ]
  }
  res.json(tree)
})

// GET /api/files/search?q=
router.get('/search', (req, res) => {
  const db = getDb()
  const { q } = req.query
  if (!q || q.length < 2) return res.json([])
  const needle = String(q).toLocaleLowerCase()
  const results = getAccessibleFileRows(db, req.user.id, { filesOnly: true })
    .map(file => {
      try { return materializeFile(db, file, req.user.session_id) }
      catch (_) { return null }
    })
    .filter(Boolean)
    .filter(file => String(file.name || '').toLocaleLowerCase().includes(needle) || String(file.content || '').toLocaleLowerCase().includes(needle))
    .slice(0, 20)
    .map(file => {
      const content = String(file.content || '')
      const index = content.toLocaleLowerCase().indexOf(needle)
      const access = getFileAccess(db, file.id, req.user.id)
      return {
        id: file.id,
        name: file.name,
        type: file.type,
        parent_id: file.parent_id,
        excerpt: index >= 0 ? content.slice(Math.max(0, index - 60), index + 100) : '',
        owner_username: file.owner_username,
        can_edit: Boolean(access?.canEdit),
      }
    })
  res.json(results)
})

// GET /api/files/names — for [[link]] autocomplete
router.get('/names', (req, res) => {
  const db = getDb()
  const names = getAccessibleFileRows(db, req.user.id, { filesOnly: true })
    .filter(file => !file.encrypted_folder_id || isFolderOpen(req.user.session_id, file.encrypted_folder_id))
    .map(file => ({ id: file.id, name: file.name, parent_id: file.parent_id, owner_username: file.owner_username }))
    .sort((a, b) => a.name.localeCompare(b.name))
  res.json(names)
})

router.patch('/vault/password', unlockLimiter, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  await changeVaultPassword(getDb(), req.user.id, currentPassword, newPassword)
  res.json({ ok: true, folders_locked: true })
})

// GET /api/files/trash — éléments racine de la corbeille.
router.get('/trash', (req, res) => {
  const db = getDb()
  purgeExpiredTrash(db, req.user.id)
  const rows = db.prepare(`
    SELECT f.id, f.parent_id, f.name, f.type, f.deleted_at, f.created_at, f.updated_at,
      (WITH RECURSIVE descendants(id) AS (
        SELECT id FROM files WHERE parent_id = f.id AND user_id = f.user_id AND deleted_at IS NOT NULL
        UNION ALL
        SELECT child.id FROM files child JOIN descendants d ON child.parent_id = d.id
        WHERE child.user_id = f.user_id AND child.deleted_at IS NOT NULL
      ) SELECT COUNT(*) FROM descendants) AS descendant_count
    FROM files f
    LEFT JOIN files parent ON parent.id = f.parent_id AND parent.user_id = f.user_id
    WHERE f.user_id = ? AND f.deleted_at IS NOT NULL
      AND (f.parent_id IS NULL OR parent.deleted_at IS NULL)
    ORDER BY f.deleted_at DESC, f.name ASC
  `).all(req.user.id)
  res.json(rows)
})

// POST /api/files/trash/:id/restore
router.post('/trash/:id/restore', (req, res) => {
  const db = getDb()
  const file = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL').get(req.params.id, req.user.id)
  if (!file) return res.status(404).json({ error: 'Element introuvable dans la corbeille' })
  const parent = file.parent_id
    ? db.prepare('SELECT id, deleted_at FROM files WHERE id = ? AND user_id = ?').get(file.parent_id, req.user.id)
    : null
  if (parent?.deleted_at) return res.status(409).json({ error: 'Restaure d’abord le dossier parent' })

  let restoredName = file.name
  if (findSiblingByName(db, file.parent_id, restoredName, file.id, req.user.id)) {
    restoredName = makeRestoredName(db, file.parent_id, restoredName, req.user.id)
  }
  const tx = db.transaction(() => {
    db.prepare('UPDATE files SET name = ?, updated_at = ? WHERE id = ?').run(restoredName, new Date().toISOString(), file.id)
    db.prepare(`
      WITH RECURSIVE subtree(id) AS (
        SELECT id FROM files WHERE id = ? AND user_id = ?
        UNION ALL
        SELECT child.id FROM files child JOIN subtree s ON child.parent_id = s.id WHERE child.user_id = ?
      )
      UPDATE files SET deleted_at = NULL WHERE id IN (SELECT id FROM subtree)
    `).run(file.id, req.user.id, req.user.id)
  })
  tx()
  updateAllLinks(db, req.user.id)
  res.json({ ok: true, id: file.id, name: restoredName })
})

// DELETE /api/files/trash/:id — suppression définitive d’un élément.
router.delete('/trash/:id', (req, res) => {
  const db = getDb()
  const file = db.prepare('SELECT id FROM files WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL').get(req.params.id, req.user.id)
  if (!file) return res.status(404).json({ error: 'Element introuvable dans la corbeille' })
  db.prepare('DELETE FROM files WHERE id = ? AND user_id = ?').run(file.id, req.user.id)
  res.json({ ok: true })
})

// DELETE /api/files/trash — vider toute la corbeille du compte.
router.delete('/trash', (req, res) => {
  const db = getDb()
  const result = db.prepare('DELETE FROM files WHERE user_id = ? AND deleted_at IS NOT NULL').run(req.user.id)
  res.json({ ok: true, deleted: result.changes })
})

// GET /api/files/:id
router.get('/:id', (req, res) => {
  const db = getDb()
  const systemManifest = findOpusculeManifest(db, req.user.id, req.params.id)
  if (systemManifest) {
    const parentId = ensureOpusculeRoot(db, req.user.id)
    return res.json({
      ...systemManifest,
      parent_id: parentId,
      content_version: 0,
      history_revision: 0,
      access: {
        permission: 'owner',
        is_owner: true,
        can_edit: false,
        is_system: true,
        owner_username: req.user.username || null,
        shared_root_id: null,
      },
      tags: [],
      links: [],
      backlinks: [],
      can_undo: false,
      can_redo: false,
    })
  }
  const access = getFileAccess(db, req.params.id, req.user.id)
  if (!access) return res.status(404).json({ error: 'Not found' })
  let file = access.file

  if (file.type === 'locked_folder') {
    return res.json({
      id: file.id,
      name: file.name,
      type: file.type,
      parent_id: file.parent_id,
      locked: true,
      access: decorateFileAccess(access).access,
    })
  }

  if (file.is_encrypted && !isFolderOpen(req.user.session_id, file.id)) {
    return res.json({
      id: file.id,
      name: file.name,
      type: file.type,
      parent_id: file.parent_id,
      is_encrypted: true,
      is_locked: true,
      access: decorateFileAccess(access).access,
    })
  }

  try {
    file = materializeFile(db, file, req.user.session_id)
  } catch (error) {
    return res.status(error.status || 423).json({ error: error.message, code: error.code, encrypted_folder_id: error.folderId })
  }

  const tags = db.prepare('SELECT tag FROM file_tags WHERE file_id = ?').all(file.id).map(r => r.tag)
  const links = db.prepare(
    `SELECT f.id, f.name FROM file_links fl JOIN files f ON f.id = fl.target_id WHERE fl.source_id = ? AND f.deleted_at IS NULL`
  ).all(file.id)
  const backlinks = db.prepare(
    `SELECT f.id, f.name FROM file_links fl JOIN files f ON f.id = fl.source_id WHERE fl.target_id = ? AND f.deleted_at IS NULL`
  ).all(file.id)
  const readableLinks = links.filter(link => getFileAccess(db, link.id, req.user.id))
  const readableBacklinks = backlinks.filter(link => getFileAccess(db, link.id, req.user.id))
  res.json({ ...decorateFileAccess({ ...access, file }), tags, links: readableLinks, backlinks: readableBacklinks, ...historyAvailability(db, file) })
})

// POST /api/files
router.post('/', (req, res) => {
  const db = getDb()
  const { parent_id, name, type, content } = req.body
  if (!name || !type) return res.status(400).json({ error: 'name and type required' })
  if (!['file', 'folder'].includes(type)) return res.status(400).json({ error: 'Type de fichier invalide' })
  const safeName = validateFileName(name)
  if (!safeName) return res.status(400).json({ error: 'Nom invalide (180 caractères maximum, sans séparateur de chemin)' })
  if (content !== undefined && typeof content !== 'string') return res.status(400).json({ error: 'Le contenu doit être du texte' })
  const parentId = parent_id || null
  const parentCheck = validateWritableParent(db, parentId, req.user.id, req.user.session_id)
  if (parentCheck.error) return res.status(parentCheck.status).json({ error: parentCheck.error })
  if (parentId && isGeneratedQuizStructure(db, parentId, req.user.id)) {
    return res.status(409).json({ error: 'Le dossier Quiz générés est géré automatiquement' })
  }
  const ownerId = parentCheck.ownerId || req.user.id
  const duplicate = findSiblingByName(db, parentId, safeName, null, ownerId)
  if (duplicate) return res.status(409).json({ error: 'A file or folder with this name already exists here' })

  const id = uuidv4()
  const now = new Date().toISOString()
  const encryptedFolderId = parentCheck.encryptedFolderId || null
  const plainContent = content || ''
  if (type === 'file') {
    const storedBytes = estimateStoredContentBytes(plainContent, Boolean(encryptedFolderId))
    assertUserStorageQuota(db, ownerId, storedBytes * 2) // contenu courant + révision initiale
  }
  const encryptedContent = type === 'file' && encryptedFolderId
    ? encryptCurrentFileContent(id, plainContent, encryptedFolderId, req.user.session_id)
    : null
  db.prepare(`
    INSERT INTO files (
      id, parent_id, name, type, content, encrypted_content, encrypted_folder_id,
      user_id, last_edited_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, parentId, safeName, type,
    type === 'file' && encryptedFolderId ? null : (content || null),
    encryptedContent, encryptedFolderId, ownerId, req.user.id, now, now
  )

  if (type === 'file') {
    const encryptedRevision = encryptedFolderId
      ? encryptRevisionContent(id, 0, plainContent, encryptedFolderId, req.user.session_id)
      : null
    db.prepare(`
      INSERT OR IGNORE INTO file_revisions (
        file_id, user_id, revision_no, content, encrypted_content, encrypted_folder_id, created_at
      ) VALUES (?, ?, 0, ?, ?, ?, ?)
    `).run(id, ownerId, encryptedFolderId ? '' : plainContent, encryptedRevision, encryptedFolderId, now)
    db.prepare('UPDATE file_revisions SET actor_user_id = ? WHERE file_id = ? AND revision_no = 0')
      .run(req.user.id, id)
  }

  if (content && !encryptedFolderId) {
    updateTags(db, id, content)
    updateLinks(db, id, content, ownerId)
  }
  if (type === 'file') updateAllLinks(db, ownerId)

  const created = materializeFile(db, db.prepare('SELECT * FROM files WHERE id = ?').get(id), req.user.session_id)
  res.status(201).json({ ...decorateFileAccess({ ...getFileAccess(db, id, req.user.id), file: created }), ...historyAvailability(db, created) })
})

// PUT /api/files/:id
router.put('/:id', (req, res) => {
  const db = getDb()
  const accessCheck = requireFileAccess(db, req.params.id, req.user.id, 'edit')
  if (accessCheck.error) return res.status(accessCheck.status).json({ error: accessCheck.error })
  const access = accessCheck.access
  let file
  try { file = materializeFile(db, access.file, req.user.session_id) }
  catch (error) { return res.status(error.status || 423).json({ error: error.message, code: error.code }) }

  const { name, content, parent_id, sort_order, base_version } = req.body
  const safeName = name === undefined ? undefined : validateFileName(name)
  if (name !== undefined && !safeName) return res.status(400).json({ error: 'Nom invalide (180 caractères maximum, sans séparateur de chemin)' })
  if (content !== undefined && typeof content !== 'string') return res.status(400).json({ error: 'Le contenu doit être du texte' })
  if (!access.isOwner && (name !== undefined || parent_id !== undefined || sort_order !== undefined)) {
    return res.status(403).json({ error: 'Seul le proprietaire peut renommer ou deplacer cet element' })
  }
  if ((name !== undefined || parent_id !== undefined) && isManagedGeneratedQuiz(db, file.id, req.user.id)) {
    return res.status(409).json({ error: 'Ce quiz suit automatiquement sa note source et ne peut pas etre renomme ou deplace manuellement' })
  }
  if ((name !== undefined || parent_id !== undefined) && isGeneratedQuizStructure(db, file.id, req.user.id)) {
    return res.status(409).json({ error: 'Cette arborescence de quiz est geree automatiquement' })
  }
  if (parent_id && isGeneratedQuizStructure(db, parent_id, req.user.id)) {
    return res.status(409).json({ error: 'Le dossier Quiz générés est réservé aux quiz automatiques' })
  }
  const nextParentId = parent_id !== undefined ? (parent_id || null) : file.parent_id
  const nextName = name !== undefined ? safeName : file.name
  if (name !== undefined || parent_id !== undefined) {
    const parentCheck = validateParent(db, nextParentId, req.user.id, req.user.session_id)
    if (parentCheck) return res.status(parentCheck.status).json({ error: parentCheck.error })
    const targetEncryptedFolderId = getParentEncryptionRoot(db, nextParentId)
    if (parent_id !== undefined && (file.encrypted_folder_id || null) !== (targetEncryptedFolderId || null)) {
      return res.status(409).json({ error: 'Désactive d’abord le chiffrement avant de déplacer cet élément hors de son dossier chiffré' })
    }
    const duplicate = findSiblingByName(db, nextParentId, nextName, req.params.id, req.user.id)
    if (duplicate) return res.status(409).json({ error: 'A file or folder with this name already exists here' })
  }
  const now = new Date().toISOString()
  const sets = []
  const vals = []

  if (name !== undefined) { sets.push('name = ?'); vals.push(safeName) }
  const contentChanged = content !== undefined && content !== (file.content || '')
  if (contentChanged) {
    const rawStoredBytes = Buffer.byteLength(String(access.file.content || ''), 'utf8') + Buffer.byteLength(String(access.file.encrypted_content || ''), 'utf8')
    const nextStoredBytes = estimateStoredContentBytes(content, Boolean(file.encrypted_folder_id))
    assertUserStorageQuota(db, file.user_id, nextStoredBytes + Math.max(0, nextStoredBytes - rawStoredBytes))
    const expectedVersion = Number(base_version)
    if (!Number.isInteger(expectedVersion) || expectedVersion !== Number(file.content_version || 0)) {
      return sendVersionConflict(res, db, file, req.user.id, req.user.session_id)
    }
    if (file.encrypted_folder_id) {
      sets.push('content = NULL', 'encrypted_content = ?', 'history_revision = ?', 'content_version = content_version + 1', 'last_edited_by = ?')
      vals.push(
        encryptCurrentFileContent(file.id, content, file.encrypted_folder_id, req.user.session_id),
        Number(file.history_revision || 0) + 1,
        req.user.id
      )
    } else {
      sets.push('content = ?', 'history_revision = ?', 'content_version = content_version + 1', 'last_edited_by = ?')
      vals.push(content, Number(file.history_revision || 0) + 1, req.user.id)
    }
  }
  if (parent_id !== undefined) { sets.push('parent_id = ?'); vals.push(parent_id || null) }
  if (sort_order !== undefined) { sets.push('sort_order = ?'); vals.push(sort_order) }

  if (sets.length === 0) return res.json({ ...file, ...historyAvailability(db, file) })

  sets.push('updated_at = ?')
  vals.push(now, req.params.id)
  const updateTx = db.transaction(() => {
    if (contentChanged) {
      ensureCurrentRevision(db, file, file.user_id, req.user.id, req.user.session_id)
      db.prepare('DELETE FROM file_revisions WHERE file_id = ? AND revision_no > ?').run(file.id, Number(file.history_revision || 0))
      const nextRevision = Number(file.history_revision || 0) + 1
      const encryptedRevision = file.encrypted_folder_id
        ? encryptRevisionContent(file.id, nextRevision, content, file.encrypted_folder_id, req.user.session_id)
        : null
      db.prepare(`
        INSERT INTO file_revisions (
          file_id, user_id, revision_no, content, encrypted_content, encrypted_folder_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        file.id, file.user_id, nextRevision,
        file.encrypted_folder_id ? '' : content,
        encryptedRevision, file.encrypted_folder_id || null, now
      )
      db.prepare('UPDATE file_revisions SET actor_user_id = ? WHERE file_id = ? AND revision_no = ?')
        .run(req.user.id, file.id, Number(file.history_revision || 0) + 1)
    }
    db.prepare(`UPDATE files SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    if (contentChanged) pruneFileRevisions(db, file.id)
    if (name !== undefined || parent_id !== undefined) syncGeneratedQuizzes(db, file.user_id)
  })
  try {
    updateTx()
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Mise a jour impossible' })
  }

  if (content !== undefined && !file.encrypted_folder_id) {
    updateTags(db, req.params.id, content)
    updateLinks(db, req.params.id, content, file.user_id)
  }
  if (name !== undefined) updateAllLinks(db, file.user_id)

  const updated = materializeFile(db, db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id), req.user.session_id)
  res.json({ ...decorateFileAccess({ ...getFileAccess(db, updated.id, req.user.id), file: updated }), ...historyAvailability(db, updated) })
})

router.post('/:id/history/undo', (req, res) => applyHistoryStep(req, res, 'undo'))
router.post('/:id/history/redo', (req, res) => applyHistoryStep(req, res, 'redo'))

// POST /api/files/batch-trash — déplace plusieurs éléments à la corbeille.
// Les descendants explicitement sélectionnés sont couverts par leur parent.
router.post('/batch-trash', (req, res) => {
  const requestedIds = [...new Set(Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [])]
  if (!requestedIds.length) return res.status(400).json({ error: 'Sélectionne au moins un élément' })
  if (requestedIds.length > 200) return res.status(400).json({ error: 'La sélection est limitée à 200 éléments' })
  if (req.body?.confirm_children !== true) return res.status(400).json({ error: 'Confirmation de la suppression groupée requise' })

  const db = getDb()
  const selected = []
  for (const id of requestedIds) {
    const accessCheck = requireFileAccess(db, id, req.user.id, 'owner')
    if (accessCheck.error) return res.status(accessCheck.status).json({ error: accessCheck.error })
    let file
    try { file = materializeFile(db, accessCheck.access.file, req.user.session_id) }
    catch (error) { return res.status(error.status || 423).json({ error: error.message, code: error.code }) }
    if (!file.parent_id && file.name === 'Journal' && file.type !== 'file') {
      return res.status(403).json({ error: 'Le dossier Journal est protege' })
    }
    if (isGeneratedQuizStructure(db, file.id, req.user.id)) {
      return res.status(409).json({ error: 'Cette arborescence de quiz est geree automatiquement' })
    }
    selected.push(file)
  }

  const selectedIds = new Set(selected.map(file => file.id))
  const roots = selected.filter(file => {
    let parentId = file.parent_id
    while (parentId) {
      if (selectedIds.has(parentId)) return false
      const parent = db.prepare('SELECT parent_id FROM files WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(parentId, req.user.id)
      parentId = parent?.parent_id || null
    }
    return true
  })
  const deletedAt = new Date().toISOString()
  const trashRoots = db.transaction(() => {
    const trashSubtree = db.prepare(`
      WITH RECURSIVE subtree(id) AS (
        SELECT id FROM files WHERE id = ? AND user_id = ?
        UNION ALL
        SELECT child.id FROM files child JOIN subtree s ON child.parent_id = s.id WHERE child.user_id = ?
      )
      UPDATE files SET deleted_at = ?, updated_at = ? WHERE id IN (SELECT id FROM subtree)
    `)
    for (const file of roots) trashSubtree.run(file.id, req.user.id, req.user.id, deletedAt, deletedAt)
  })
  trashRoots()
  res.json({ ok: true, trashed: roots.length, selected: selected.length, purge_at: new Date(Date.now() + 30 * 86400000).toISOString() })
})

// DELETE /api/files/:id
router.delete('/:id', (req, res) => {
  const db = getDb()
  const accessCheck = requireFileAccess(db, req.params.id, req.user.id, 'owner')
  if (accessCheck.error) return res.status(accessCheck.status).json({ error: accessCheck.error })
  let file
  try { file = materializeFile(db, accessCheck.access.file, req.user.session_id) }
  catch (error) { return res.status(error.status || 423).json({ error: error.message, code: error.code }) }
  if (isGeneratedQuizStructure(db, file.id, req.user.id)) {
    return res.status(409).json({ error: 'Cette arborescence de quiz est geree automatiquement' })
  }
  if (file.type === 'folder' || file.type === 'locked_folder') {
    const descendantCount = countDescendants(db, file.id, req.user.id)
    if (descendantCount > 0 && req.query.confirm_children !== '1') {
      return res.status(409).json({
        error: `Ce dossier contient ${descendantCount} élément(s). Confirme la suppression du dossier et de tout son contenu.`,
        requires_child_confirm: true,
        child_count: descendantCount,
      })
    }
  }
  if (!file.parent_id && file.name === 'Journal' && file.type !== 'file') {
    return res.status(403).json({ error: 'Le dossier Journal est protege' })
  }
  const deletedAt = new Date().toISOString()
  db.prepare(`
    WITH RECURSIVE subtree(id) AS (
      SELECT id FROM files WHERE id = ? AND user_id = ?
      UNION ALL
      SELECT child.id FROM files child JOIN subtree s ON child.parent_id = s.id WHERE child.user_id = ?
    )
    UPDATE files SET deleted_at = ?, updated_at = ? WHERE id IN (SELECT id FROM subtree)
  `).run(file.id, req.user.id, req.user.id, deletedAt, deletedAt)
  res.json({ ok: true, trashed: true, purge_at: new Date(Date.now() + 30 * 86400000).toISOString() })
})

// PUT /api/files/:id/move
router.put('/:id/move', (req, res) => {
  const db = getDb()
  const { parent_id, sort_order } = req.body
  const accessCheck = requireFileAccess(db, req.params.id, req.user.id, 'owner')
  if (accessCheck.error) return res.status(accessCheck.status).json({ error: accessCheck.error })
  const file = accessCheck.access.file

  if (isManagedGeneratedQuiz(db, file.id, req.user.id)) {
    return res.status(409).json({ error: 'Ce quiz suit automatiquement sa note source et ne peut pas etre deplace manuellement' })
  }
  if (isGeneratedQuizStructure(db, file.id, req.user.id)) {
    return res.status(409).json({ error: 'Cette arborescence de quiz est geree automatiquement' })
  }

  const nextParentId = parent_id || null
  const sourceEncryptedFolderId = file.encrypted_folder_id || null
  const targetEncryptedFolderId = getParentEncryptionRoot(db, nextParentId)
  if (sourceEncryptedFolderId && !isFolderOpen(req.user.session_id, sourceEncryptedFolderId)) {
    return res.status(423).json({ error: 'Ouvre le dossier chiffré avant de déplacer cet élément' })
  }
  if (targetEncryptedFolderId && !isFolderOpen(req.user.session_id, targetEncryptedFolderId)) {
    return res.status(423).json({ error: 'Ouvre le dossier chiffré de destination' })
  }
  if (sourceEncryptedFolderId !== targetEncryptedFolderId) {
    return res.status(409).json({ error: 'Désactive d’abord le chiffrement avant de déplacer un élément entre deux espaces de chiffrement' })
  }
  if (nextParentId && isGeneratedQuizStructure(db, nextParentId, req.user.id)) {
    return res.status(409).json({ error: 'Le dossier Quiz générés est réservé aux quiz automatiques' })
  }
  const duplicate = findSiblingByName(db, nextParentId, file.name, req.params.id, req.user.id)
  if (duplicate) return res.status(409).json({ error: 'A file or folder with this name already exists here' })
  if (nextParentId) {
    if (nextParentId === req.params.id) {
      return res.status(400).json({ error: 'Cannot move a folder into itself' })
    }

    const parent = db.prepare('SELECT id, parent_id, type, encrypted_folder_id FROM files WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(nextParentId, req.user.id)
    if (!parent) return res.status(404).json({ error: 'Target folder not found' })
    if (parent.type === 'locked_folder') {
      return res.status(403).json({ error: 'Unlock the folder before moving files into it' })
    }
    if (parent.type !== 'folder') {
      return res.status(400).json({ error: 'Target must be a folder' })
    }

    let cursor = parent
    while (cursor) {
      if (cursor.id === req.params.id) {
        return res.status(400).json({ error: 'Cannot move a folder into one of its children' })
      }
      cursor = cursor.parent_id
        ? db.prepare('SELECT id, parent_id FROM files WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(cursor.parent_id, req.user.id)
        : null
    }
  }

  try {
    db.transaction(() => {
      db.prepare(
        "UPDATE files SET parent_id = ?, sort_order = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(nextParentId, sort_order ?? 0, req.params.id)
      syncGeneratedQuizzes(db, req.user.id)
    })()
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Deplacement impossible' })
  }
  res.json({ ok: true })
})

// Active le chiffrement persistant du sous-arbre. Le dossier reste ouvert
// pour la session courante, mais aucun contenu en clair ne reste dans SQLite.
router.post('/:id/encryption/enable', unlockLimiter, async (req, res) => {
  const db = getDb()
  const check = requireFileAccess(db, req.params.id, req.user.id, 'owner')
  if (check.error) return res.status(check.status).json({ error: check.error })
  const folder = check.access.file
  if (folder.type !== 'folder') return res.status(400).json({ error: 'Seul un dossier normal peut être chiffré' })
  if (folder.is_encrypted || folder.encrypted_folder_id) return res.status(409).json({ error: 'Ce dossier est déjà dans un espace chiffré' })
  if (hasShareAffectingFolder(db, folder.id, req.user.id)) {
    return res.status(409).json({ error: 'Retire les partages de ce sous-arbre avant d’activer le chiffrement' })
  }
  const initialRows = getOwnedSubtree(db, folder.id, req.user.id)
  if (initialRows.some(row => row.type === 'locked_folder')) {
    return res.status(409).json({ error: 'Ce sous-arbre contient un ancien dossier verrouillé. Déverrouille-le d’abord pour le migrer.' })
  }
  if (initialRows.some(row => row.id !== folder.id && (row.is_encrypted || row.encrypted_folder_id))) {
    return res.status(409).json({ error: 'Ce sous-arbre contient déjà un dossier chiffré. Désactive d’abord son chiffrement.' })
  }

  let folderKey
  let encryptedFileCount = 0
  let committed = false
  try {
    folderKey = await createEncryptedFolder(db, folder.id, req.user.id, req.user.session_id, req.body?.password)
    const rows = getOwnedSubtree(db, folder.id, req.user.id)
    if (rows.some(row => row.type === 'locked_folder' || row.is_encrypted || row.encrypted_folder_id)) {
      const error = new Error('Le sous-arbre a changé pendant l’activation du chiffrement; recommence après avoir fermé les dossiers imbriqués')
      error.status = 409
      throw error
    }
    if (hasShareAffectingFolder(db, folder.id, req.user.id)) {
      const error = new Error('Un partage a été créé pendant l’activation; retire-le avant de recommencer')
      error.status = 409
      throw error
    }
    const files = rows.filter(row => row.type === 'file')
    encryptedFileCount = files.length
    db.transaction(() => {
      const updateFile = db.prepare(`
        UPDATE files SET content = NULL, encrypted_content = ?, encrypted_folder_id = ?,
          content_version = content_version + 1, updated_at = ? WHERE id = ?
      `)
      const updateFolder = db.prepare('UPDATE files SET encrypted_folder_id = ?, updated_at = ? WHERE id = ?')
      const updateRevision = db.prepare(`
        UPDATE file_revisions SET content = '', encrypted_content = ?, encrypted_folder_id = ? WHERE id = ?
      `)
      const now = new Date().toISOString()
      for (const row of rows) {
        if (row.type !== 'file') {
          updateFolder.run(folder.id, now, row.id)
          continue
        }
        updateFile.run(encryptText(row.content || '', folderKey, `file:${row.id}`), folder.id, now, row.id)
        const revisions = db.prepare('SELECT * FROM file_revisions WHERE file_id = ?').all(row.id)
        for (const revision of revisions) {
          updateRevision.run(
            encryptText(revision.content || '', folderKey, `revision:${row.id}:${revision.revision_no}`),
            folder.id,
            revision.id
          )
        }
        db.prepare('DELETE FROM file_tags WHERE file_id = ?').run(row.id)
        db.prepare('DELETE FROM file_links WHERE source_id = ? OR target_id = ?').run(row.id, row.id)
      }
      db.prepare(`
        UPDATE files SET is_encrypted = 1, encrypted_folder_id = ?, updated_at = ? WHERE id = ?
      `).run(folder.id, now, folder.id)
    })()
    committed = true
  } catch (error) {
    if (!committed && folderKey) {
      db.prepare('DELETE FROM encrypted_folders WHERE folder_id = ? AND user_id = ?').run(folder.id, req.user.id)
      evictFolderKey(req.user.session_id, folder.id)
    }
    return res.status(error.status || 500).json({ error: error.message || 'Chiffrement impossible' })
  } finally {
    folderKey?.fill(0)
  }

  // Le WAL et les pages libres peuvent contenir d'anciennes versions en clair.
  // secure_delete + checkpoint + VACUUM réduisent ce résidu dans la base active.
  // Les sauvegardes externes déjà créées restent à protéger/faire tourner.
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.exec('VACUUM')
  } catch (error) {
    securityLog('vault.plaintext_cleanup.failed', req, { error_name: error.name }, 'error')
  }
  securityLog('vault.encryption.enabled', req, { folder_id: folder.id, encrypted_files: encryptedFileCount }, 'info')
  res.json({ ok: true, folder_id: folder.id, is_encrypted: true, is_locked: false, encrypted_files: encryptedFileCount })
})

// Ouvre uniquement ce dossier pour cette session. Les lignes SQLite restent
// chiffrées; la clé de dossier est conservée temporairement en mémoire.
router.post('/:id/encryption/open', unlockLimiter, async (req, res) => {
  const db = getDb()
  const check = requireFileAccess(db, req.params.id, req.user.id, 'owner')
  if (check.error) return res.status(check.status).json({ error: check.error })
  if (!check.access.file.is_encrypted) return res.status(400).json({ error: 'Ce dossier n’est pas chiffré' })
  await openEncryptedFolder(db, req.params.id, req.user.id, req.user.session_id, req.body?.password)
  securityLog('vault.folder.opened', req, { folder_id: req.params.id }, 'info')
  res.json({ ok: true, folder_id: req.params.id, is_encrypted: true, is_locked: false })
})

// Verrouille la session sans toucher au ciphertext persistant.
router.post('/:id/encryption/lock', (req, res) => {
  const db = getDb()
  const check = requireFileAccess(db, req.params.id, req.user.id, 'owner')
  if (check.error) return res.status(check.status).json({ error: check.error })
  if (!check.access.file.is_encrypted) return res.status(400).json({ error: 'Ce dossier n’est pas chiffré' })
  evictFolderKey(req.user.session_id, req.params.id)
  securityLog('vault.folder.locked', req, { folder_id: req.params.id }, 'info')
  res.json({ ok: true, folder_id: req.params.id, is_encrypted: true, is_locked: true })
})

// Désactive explicitement le chiffrement et réécrit le sous-arbre en clair.
router.delete('/:id/encryption', unlockLimiter, async (req, res) => {
  const db = getDb()
  const check = requireFileAccess(db, req.params.id, req.user.id, 'owner')
  if (check.error) return res.status(check.status).json({ error: check.error })
  const folder = check.access.file
  if (!folder.is_encrypted) return res.status(400).json({ error: 'Ce dossier n’est pas chiffré' })

  await openEncryptedFolder(db, folder.id, req.user.id, req.user.session_id, req.body?.password)
  const folderKey = requireFolderKey(req.user.session_id, folder.id)
  const rows = getOwnedSubtree(db, folder.id, req.user.id)
  const restored = []
  try {
    db.transaction(() => {
      const updateFile = db.prepare(`
        UPDATE files SET content = ?, encrypted_content = NULL, encrypted_folder_id = NULL,
          content_version = content_version + 1, updated_at = ? WHERE id = ?
      `)
      const updateFolder = db.prepare('UPDATE files SET encrypted_folder_id = NULL, updated_at = ? WHERE id = ?')
      const updateRevision = db.prepare(`
        UPDATE file_revisions SET content = ?, encrypted_content = NULL, encrypted_folder_id = NULL WHERE id = ?
      `)
      const now = new Date().toISOString()
      for (const row of rows) {
        if (row.type !== 'file') {
          updateFolder.run(now, row.id)
          continue
        }
        const content = decryptText(row.encrypted_content, folderKey, `file:${row.id}`)
        restored.push({ id: row.id, content })
        updateFile.run(content, now, row.id)
        const revisions = db.prepare('SELECT * FROM file_revisions WHERE file_id = ?').all(row.id)
        for (const revision of revisions) {
          updateRevision.run(
            decryptText(revision.encrypted_content, folderKey, `revision:${row.id}:${revision.revision_no}`),
            revision.id
          )
        }
      }
      db.prepare('UPDATE files SET is_encrypted = 0 WHERE id = ?').run(folder.id)
      db.prepare('DELETE FROM encrypted_folders WHERE folder_id = ? AND user_id = ?').run(folder.id, req.user.id)
    })()
    for (const file of restored) {
      updateTags(db, file.id, file.content)
      updateLinks(db, file.id, file.content, req.user.id)
    }
    updateAllLinks(db, req.user.id)
    evictFolderKey(req.user.session_id, folder.id)
    securityLog('vault.encryption.disabled', req, { folder_id: folder.id, restored_files: restored.length }, 'info')
    res.json({ ok: true, folder_id: folder.id, is_encrypted: false, restored_files: restored.length })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Désactivation du chiffrement impossible' })
  }
})

// POST /api/files/:id/unlock
router.post('/:id/unlock', unlockLimiter, async (req, res) => {
  const db = getDb()
  const { password } = req.body

  const accessCheck = requireFileAccess(db, req.params.id, req.user.id, 'owner')
  if (accessCheck.error) return res.status(accessCheck.status).json({ error: accessCheck.error })

  const folder = db.prepare(
    "SELECT * FROM files WHERE id = ? AND type = 'locked_folder' AND user_id = ? AND deleted_at IS NULL"
  ).get(req.params.id, req.user.id)
  if (!folder) return res.status(404).json({ error: 'Not found' })

  const valid = await verifyFolderPassword(password, folder.password_hash)
  if (!valid) return res.status(401).json({ error: 'Wrong password' })

  const children = db.prepare('SELECT * FROM files WHERE parent_id = ? AND user_id = ? AND deleted_at IS NULL').all(req.params.id, req.user.id)

  let decrypted
  try {
    decrypted = await Promise.all(children.map(async child => {
      if (!child.encrypted_content) return child
      try {
        const plain = await decryptLegacyContent(child.encrypted_content, password)
        return { ...child, content: plain, encrypted_content: null }
      } catch {
        throw new Error(`Could not decrypt "${child.name}"`)
      }
    }))
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unlock failed' })
  }

  const unlockTx = db.transaction(() => {
    db.prepare(
      "UPDATE files SET type = 'folder', password_hash = NULL, updated_at = ? WHERE id = ?"
    ).run(new Date().toISOString(), req.params.id)

    const updateChild = db.prepare(
      'UPDATE files SET content = ?, encrypted_content = NULL, content_version = content_version + 1, last_edited_by = ?, updated_at = ? WHERE id = ?'
    )
    for (const child of decrypted) {
      if (child.content === undefined || child.content === null) continue
      updateChild.run(child.content, req.user.id, new Date().toISOString(), child.id)
      db.prepare(
        'INSERT OR IGNORE INTO file_revisions (file_id, user_id, revision_no, content, created_at) VALUES (?, ?, 0, ?, ?)'
      ).run(child.id, req.user.id, child.content, new Date().toISOString())
      db.prepare('UPDATE file_revisions SET actor_user_id = ? WHERE file_id = ? AND revision_no = 0')
        .run(req.user.id, child.id)
      updateTags(db, child.id, child.content)
      updateLinks(db, child.id, child.content, req.user.id)
    }
    updateAllLinks(db, req.user.id)
  })

  try {
    unlockTx()
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unlock failed' })
  }

  res.json({ ok: true, children: decrypted })
})

// POST /api/files/:id/lock
router.post('/:id/lock', async (req, res) => {
  res.status(410).json({
    error: 'Cet ancien endpoint est retiré. Utilise le chiffrement persistant du dossier.',
    code: 'LEGACY_LOCK_RETIRED',
  })
})

function countDescendants(db, folderId, userId) {
  let total = 0
  const children = db.prepare('SELECT id FROM files WHERE parent_id = ? AND user_id = ? AND deleted_at IS NULL').all(folderId, userId)
  for (const child of children) {
    total += 1 + countDescendants(db, child.id, userId)
  }
  return total
}

function applyHistoryStep(req, res, direction) {
  const db = getDb()
  const accessCheck = requireFileAccess(db, req.params.id, req.user.id, 'edit')
  if (accessCheck.error) return res.status(accessCheck.status).json({ error: accessCheck.error })
  const file = accessCheck.access.file
  if (file.type !== 'file') return res.status(400).json({ error: 'Cet element ne possede pas d’historique de contenu' })
  const expectedVersion = Number(req.body?.base_version)
  if (!Number.isInteger(expectedVersion) || expectedVersion !== Number(file.content_version || 0)) {
    return sendVersionConflict(res, db, file, req.user.id, req.user.session_id)
  }

  ensureCurrentRevision(db, file, file.user_id, req.user.id, req.user.session_id)
  const operator = direction === 'undo' ? '<' : '>'
  const order = direction === 'undo' ? 'DESC' : 'ASC'
  const target = db.prepare(
    `SELECT * FROM file_revisions
     WHERE file_id = ? AND revision_no ${operator} ?
     ORDER BY revision_no ${order} LIMIT 1`
  ).get(file.id, Number(file.history_revision || 0))
  if (!target) {
    return res.status(409).json({ error: direction === 'undo' ? 'Rien a annuler' : 'Rien a retablir' })
  }

  const targetContent = materializeRevision(target, req.user.session_id, file.encrypted_folder_id).content
  const now = new Date().toISOString()
  if (file.encrypted_folder_id) {
    db.prepare(`
      UPDATE files SET content = NULL, encrypted_content = ?, history_revision = ?,
        content_version = content_version + 1, last_edited_by = ?, updated_at = ? WHERE id = ?
    `).run(
      encryptCurrentFileContent(file.id, targetContent, file.encrypted_folder_id, req.user.session_id),
      target.revision_no, req.user.id, now, file.id
    )
  } else {
    db.prepare(
      'UPDATE files SET content = ?, history_revision = ?, content_version = content_version + 1, last_edited_by = ?, updated_at = ? WHERE id = ?'
    ).run(targetContent, target.revision_no, req.user.id, now, file.id)
    updateTags(db, file.id, targetContent)
    updateLinks(db, file.id, targetContent, file.user_id)
  }
  const updated = materializeFile(db, db.prepare('SELECT * FROM files WHERE id = ?').get(file.id), req.user.session_id)
  res.json({ ...decorateFileAccess({ ...getFileAccess(db, updated.id, req.user.id), file: updated }), ...historyAvailability(db, updated) })
}

function ensureCurrentRevision(db, file, ownerId, actorUserId = ownerId, sessionId = null) {
  if (file.type !== 'file' || file.content === null) return
  const revisionNo = Number(file.history_revision || 0)
  const encrypted = file.encrypted_folder_id
    ? encryptRevisionContent(file.id, revisionNo, file.content || '', file.encrypted_folder_id, sessionId)
    : null
  db.prepare(`
    INSERT OR IGNORE INTO file_revisions (
      file_id, user_id, revision_no, content, encrypted_content, encrypted_folder_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    file.id, ownerId, revisionNo, file.encrypted_folder_id ? '' : (file.content || ''),
    encrypted, file.encrypted_folder_id || null, file.updated_at || new Date().toISOString()
  )
  db.prepare('UPDATE file_revisions SET actor_user_id = COALESCE(actor_user_id, ?) WHERE file_id = ? AND revision_no = ?')
    .run(actorUserId, file.id, Number(file.history_revision || 0))
}

function historyAvailability(db, file) {
  if (!file || file.type !== 'file' || (file.content === null && !file.encrypted_content)) return { can_undo: false, can_redo: false }
  const revision = Number(file.history_revision || 0)
  return {
    can_undo: Boolean(db.prepare('SELECT 1 FROM file_revisions WHERE file_id = ? AND revision_no < ? LIMIT 1').get(file.id, revision)),
    can_redo: Boolean(db.prepare('SELECT 1 FROM file_revisions WHERE file_id = ? AND revision_no > ? LIMIT 1').get(file.id, revision)),
  }
}

function pruneFileRevisions(db, fileId) {
  db.prepare(`
    DELETE FROM file_revisions
    WHERE id IN (
      SELECT id FROM file_revisions WHERE file_id = ?
      ORDER BY revision_no DESC LIMIT -1 OFFSET ?
    )
  `).run(fileId, MAX_FILE_REVISIONS)
}

function purgeExpiredTrash(db, userId) {
  db.prepare(
    "DELETE FROM files WHERE user_id = ? AND deleted_at IS NOT NULL AND datetime(deleted_at) <= datetime('now', '-30 days')"
  ).run(userId)
}

function makeRestoredName(db, parentId, name, userId) {
  const match = String(name).match(/^(.*?)(\.[^.]+)?$/)
  const base = match?.[1] || String(name)
  const extension = match?.[2] || ''
  let index = 1
  let candidate
  do {
    candidate = `${base} (restaure${index > 1 ? ` ${index}` : ''})${extension}`
    index++
  } while (findSiblingByName(db, parentId, candidate, null, userId))
  return candidate
}

function sendVersionConflict(res, db, file, userId, sessionId) {
  let latest = db.prepare('SELECT * FROM files WHERE id = ? AND deleted_at IS NULL').get(file.id)
  try { latest = materializeFile(db, latest, sessionId) } catch (_) {}
  const access = getFileAccess(db, file.id, userId)
  return res.status(409).json({
    error: 'Ce fichier a ete modifie par un autre utilisateur. Choisis la version a conserver.',
    code: 'FILE_VERSION_CONFLICT',
    current_file: {
      ...decorateFileAccess({ ...access, file: latest }),
      ...historyAvailability(db, latest),
    },
  })
}

function validateFileName(value) {
  const name = String(value || '').trim()
  if (!name || name.length > 180 || name === '.' || name === '..' || /[\\/\0]/.test(name)) return null
  return name
}

function ensureOpusculeRoot(db, userId) {
  const existing = db.prepare(`
    SELECT id FROM files
    WHERE parent_id IS NULL AND lower(name) = lower('_Opuscule')
      AND type = 'folder' AND user_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(userId)
  if (existing) return existing.id

  const id = uuidv4()
  db.prepare(`
    INSERT INTO files (id, parent_id, name, type, sort_order, user_id, created_at, updated_at)
    VALUES (?, NULL, '_Opuscule', 'folder', 0, ?, datetime('now'), datetime('now'))
  `).run(id, userId)
  return id
}

function estimateStoredContentBytes(content, encrypted) {
  const bytes = Buffer.byteLength(String(content || ''), 'utf8')
  return encrypted ? (bytes * 2) + 1024 : bytes
}

function validateWritableParent(db, parentId, userId, sessionId) {
  if (!parentId) return { ownerId: userId }
  const check = requireFileAccess(db, parentId, userId, 'edit')
  if (check.error) return { status: check.status, error: check.error }
  const parent = check.access.file
  if (parent.type === 'locked_folder') return { status: 403, error: 'Deverrouille le dossier avant d’ajouter un element' }
  if (parent.type !== 'folder') return { status: 400, error: 'Le parent doit etre un dossier' }
  if (parent.encrypted_folder_id && !isFolderOpen(sessionId, parent.encrypted_folder_id)) {
    return { status: 423, error: 'Ouvre le dossier chiffré avant d’ajouter un élément' }
  }
  return { ownerId: parent.user_id, encryptedFolderId: parent.encrypted_folder_id || null }
}

function buildAccessibleTree(db, userId, sessionId) {
  const rawOwnedRows = db.prepare(`
    SELECT id, parent_id, name, type, sort_order, created_at, updated_at, content_version,
      is_encrypted, encrypted_folder_id
    FROM files
    WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY type DESC, sort_order ASC, name ASC
  `).all(userId)
  const lockedEncryptedRoots = new Set(rawOwnedRows
    .filter(row => row.is_encrypted && !isFolderOpen(sessionId, row.id))
    .map(row => row.id))
  const ownedRows = rawOwnedRows
    .filter(row => !row.encrypted_folder_id || row.id === row.encrypted_folder_id || !lockedEncryptedRoots.has(row.encrypted_folder_id))
    .map(row => ({
    ...row,
    is_encrypted: Boolean(row.is_encrypted),
    is_locked: Boolean(row.is_encrypted && lockedEncryptedRoots.has(row.id)),
    is_owner: true,
    can_edit: true,
    can_share: true,
    shared: false,
  }))
  const roots = assembleTree(ownedRows)

  for (const shareRoot of getSharedTreeRoots(db, userId)) {
    const rows = db.prepare(`
      WITH RECURSIVE subtree(id) AS (
        SELECT id FROM files WHERE id = ? AND deleted_at IS NULL
        UNION ALL
        SELECT child.id FROM files child JOIN subtree parent ON child.parent_id = parent.id
        WHERE child.deleted_at IS NULL AND child.user_id = ?
      )
      SELECT id, parent_id, name, type, sort_order, created_at, updated_at, content_version,
        is_encrypted, encrypted_folder_id
      FROM files WHERE id IN (SELECT id FROM subtree) AND encrypted_folder_id IS NULL
      ORDER BY type DESC, sort_order ASC, name ASC
    `).all(shareRoot.file_id, shareRoot.owner_id)
    const decorated = rows.map(row => {
      const access = getFileAccess(db, row.id, userId)
      return {
        ...row,
        is_owner: false,
        can_edit: Boolean(access?.canEdit),
        can_share: false,
        shared: true,
        owner_username: shareRoot.owner_username,
        permission: access?.permission || 'view',
      }
    })
    const sharedRoots = assembleTree(decorated, shareRoot.file_id)
    if (sharedRoots[0]) {
      sharedRoots[0].actual_parent_id = sharedRoots[0].parent_id
      sharedRoots[0].parent_id = null
      sharedRoots[0].shared_root = true
      roots.push(sharedRoots[0])
    }
  }
  return roots
}

function assembleTree(rows, forcedRootId = null) {
  const map = new Map(rows.map(row => [row.id, { ...row, children: [] }]))
  const roots = []
  for (const row of rows) {
    const node = map.get(row.id)
    if (row.id === forcedRootId) {
      roots.push(node)
    } else if (row.parent_id && map.has(row.parent_id)) {
      map.get(row.parent_id).children.push(node)
    } else if (!forcedRootId && !row.parent_id) {
      roots.push(node)
    }
  }
  return roots
}

module.exports = router

function findSiblingByName(db, parentId, name, excludeId = null, userId) {
  return db.prepare(
    `SELECT id FROM files
     WHERE parent_id IS ? AND user_id = ? AND deleted_at IS NULL AND lower(name) = lower(?) AND (? IS NULL OR id != ?)
     LIMIT 1`
  ).get(parentId || null, userId, name, excludeId, excludeId)
}

function validateParent(db, parentId, userId, sessionId) {
  if (!parentId) return null
  const parent = db.prepare('SELECT id, type, encrypted_folder_id FROM files WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(parentId, userId)
  if (!parent) return { status: 404, error: 'Parent folder not found' }
  if (parent.type === 'locked_folder') return { status: 403, error: 'Unlock the folder before adding files into it' }
  if (parent.type !== 'folder') return { status: 400, error: 'Parent must be a folder' }
  if (parent.encrypted_folder_id && !isFolderOpen(sessionId, parent.encrypted_folder_id)) {
    return { status: 423, error: 'Ouvre le dossier chiffré avant de le modifier' }
  }
  return null
}

function getParentEncryptionRoot(db, parentId) {
  if (!parentId) return null
  return db.prepare('SELECT encrypted_folder_id FROM files WHERE id = ? AND deleted_at IS NULL').get(parentId)?.encrypted_folder_id || null
}

function getOwnedSubtree(db, folderId, userId) {
  return db.prepare(`
    WITH RECURSIVE subtree(id) AS (
      SELECT id FROM files WHERE id = ? AND user_id = ?
      UNION ALL
      SELECT child.id FROM files child JOIN subtree parent ON child.parent_id = parent.id
      WHERE child.user_id = ?
    )
    SELECT * FROM files WHERE id IN (SELECT id FROM subtree)
    ORDER BY CASE type WHEN 'file' THEN 1 ELSE 0 END, id
  `).all(folderId, userId, userId)
}

function hasShareAffectingFolder(db, folderId, userId) {
  return Boolean(db.prepare(`
    WITH RECURSIVE subtree(id) AS (
      SELECT id FROM files WHERE id = ? AND user_id = ?
      UNION ALL
      SELECT child.id FROM files child JOIN subtree parent ON child.parent_id = parent.id
      WHERE child.user_id = ?
    ), ancestors(id, parent_id) AS (
      SELECT id, parent_id FROM files WHERE id = ? AND user_id = ?
      UNION ALL
      SELECT parent.id, parent.parent_id FROM files parent JOIN ancestors child ON parent.id = child.parent_id
      WHERE parent.user_id = ?
    )
    SELECT 1 FROM file_shares
    WHERE owner_id = ? AND (file_id IN (SELECT id FROM subtree) OR file_id IN (SELECT id FROM ancestors))
    LIMIT 1
  `).get(folderId, userId, userId, folderId, userId, userId, userId))
}

// Vérifie le mot de passe d'un dossier verrouillé. Accepte les DEUX formats :
//   - scrypt$2$... : nouveau hash fort (auth/password.js), utilisé aux
//     nouveaux verrouillages
//   - scrypt$1$...  : ancien hash hérité, conservé pour les dossiers
//     verrouillés avant la migration
async function verifyFolderPassword(password, storedHash) {
  if (await verifyPasswordStrong(password, storedHash)) return true
  return verifyLegacyFolderPassword(password, storedHash)
}

async function verifyLegacyFolderPassword(password, storedHash) {
  if (!storedHash) return false
  const parts = String(storedHash).split('$')
  if (parts[0] !== 'scrypt' || parts[1] !== '1' || parts.length !== 4) return false
  const [, , salt, expected] = parts
  const actual = await scryptAsync(password, salt, 64)
  const expectedBuffer = Buffer.from(expected, 'hex')
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(expectedBuffer, actual)
}

async function decryptLegacyContent(blob, password) {
  if (typeof blob === 'string' && blob.startsWith('gcm$')) {
    const [, , saltHex, ivHex, tagHex, ciphertext] = blob.split('$')
    const key = await scryptAsync(password, Buffer.from(saltHex, 'hex'), 32)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    let plain = decipher.update(ciphertext, 'hex', 'utf8')
    plain += decipher.final('utf8')
    return plain
  }
  // Ancien format : AES-256-CBC, sel statique, iv = 32 premiers caractères hex.
  const key = await scryptAsync(password, LEGACY_KEY_SALT, 32)
  const iv = Buffer.from(blob.slice(0, 32), 'hex')
  const ciphertext = blob.slice(32)
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  let plain = decipher.update(ciphertext, 'hex', 'utf8')
  plain += decipher.final('utf8')
  return plain
}
