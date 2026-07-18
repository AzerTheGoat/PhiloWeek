const express = require('express')
const router = express.Router()
const crypto = require('crypto')
const { getDb, updateTags, updateLinks, updateAllLinks } = require('../db')
const { v4: uuidv4 } = require('uuid')
const { hashPassword: hashPasswordStrong, verifyPassword: verifyPasswordStrong } = require('../auth/password')
const { decorateFileAccess, getAccessibleFileRows, getFileAccess, getSharedTreeRoots, requireFileAccess } = require('../fileAccess')

// Ancien sel statique — conservé UNIQUEMENT pour déchiffrer les dossiers
// verrouillés avant la migration vers le format GCM (sel aléatoire).
const LEGACY_KEY_SALT = 'philoweek-salt-v2'
const MAX_FILE_REVISIONS = 100

// GET /api/files — full tree
router.get('/', (req, res) => {
  const db = getDb()
  purgeExpiredTrash(db, req.user.id)
  res.json(buildAccessibleTree(db, req.user.id))
})

// GET /api/files/search?q=
router.get('/search', (req, res) => {
  const db = getDb()
  const { q } = req.query
  if (!q || q.length < 2) return res.json([])
  const needle = String(q).toLocaleLowerCase()
  const results = getAccessibleFileRows(db, req.user.id, { filesOnly: true })
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
    .map(file => ({ id: file.id, name: file.name, parent_id: file.parent_id, owner_username: file.owner_username }))
    .sort((a, b) => a.name.localeCompare(b.name))
  res.json(names)
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
  const access = getFileAccess(db, req.params.id, req.user.id)
  if (!access) return res.status(404).json({ error: 'Not found' })
  const file = access.file

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

  const tags = db.prepare('SELECT tag FROM file_tags WHERE file_id = ?').all(file.id).map(r => r.tag)
  const links = db.prepare(
    `SELECT f.id, f.name FROM file_links fl JOIN files f ON f.id = fl.target_id WHERE fl.source_id = ? AND f.deleted_at IS NULL`
  ).all(file.id)
  const backlinks = db.prepare(
    `SELECT f.id, f.name FROM file_links fl JOIN files f ON f.id = fl.source_id WHERE fl.target_id = ? AND f.deleted_at IS NULL`
  ).all(file.id)
  const readableLinks = links.filter(link => getFileAccess(db, link.id, req.user.id))
  const readableBacklinks = backlinks.filter(link => getFileAccess(db, link.id, req.user.id))
  res.json({ ...decorateFileAccess(access), tags, links: readableLinks, backlinks: readableBacklinks, ...historyAvailability(db, file) })
})

// POST /api/files
router.post('/', (req, res) => {
  const db = getDb()
  const { parent_id, name, type, content } = req.body
  if (!name || !type) return res.status(400).json({ error: 'name and type required' })
  const parentId = parent_id || null
  const parentCheck = validateWritableParent(db, parentId, req.user.id)
  if (parentCheck.error) return res.status(parentCheck.status).json({ error: parentCheck.error })
  const ownerId = parentCheck.ownerId || req.user.id
  const duplicate = findSiblingByName(db, parentId, name, null, ownerId)
  if (duplicate) return res.status(409).json({ error: 'A file or folder with this name already exists here' })

  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO files (id, parent_id, name, type, content, user_id, last_edited_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, parentId, name, type, content || null, ownerId, req.user.id, now, now)

  if (type === 'file') {
    db.prepare(
      'INSERT OR IGNORE INTO file_revisions (file_id, user_id, revision_no, content, created_at) VALUES (?, ?, 0, ?, ?)'
    ).run(id, ownerId, content || '', now)
    db.prepare('UPDATE file_revisions SET actor_user_id = ? WHERE file_id = ? AND revision_no = 0')
      .run(req.user.id, id)
  }

  if (content) {
    updateTags(db, id, content)
    updateLinks(db, id, content, ownerId)
  }
  if (type === 'file') updateAllLinks(db, ownerId)

  const created = db.prepare('SELECT * FROM files WHERE id = ?').get(id)
  res.status(201).json({ ...decorateFileAccess(getFileAccess(db, id, req.user.id)), ...historyAvailability(db, created) })
})

// PUT /api/files/:id
router.put('/:id', (req, res) => {
  const db = getDb()
  const accessCheck = requireFileAccess(db, req.params.id, req.user.id, 'edit')
  if (accessCheck.error) return res.status(accessCheck.status).json({ error: accessCheck.error })
  const access = accessCheck.access
  const file = access.file

  const { name, content, parent_id, sort_order, base_version } = req.body
  if (!access.isOwner && (name !== undefined || parent_id !== undefined || sort_order !== undefined)) {
    return res.status(403).json({ error: 'Seul le proprietaire peut renommer ou deplacer cet element' })
  }
  const nextParentId = parent_id !== undefined ? (parent_id || null) : file.parent_id
  const nextName = name !== undefined ? name : file.name
  if (name !== undefined || parent_id !== undefined) {
    const parentCheck = validateParent(db, nextParentId, req.user.id)
    if (parentCheck) return res.status(parentCheck.status).json({ error: parentCheck.error })
    const duplicate = findSiblingByName(db, nextParentId, nextName, req.params.id, req.user.id)
    if (duplicate) return res.status(409).json({ error: 'A file or folder with this name already exists here' })
  }
  const now = new Date().toISOString()
  const sets = []
  const vals = []

  if (name !== undefined) { sets.push('name = ?'); vals.push(name) }
  const contentChanged = content !== undefined && content !== (file.content || '')
  if (contentChanged) {
    const expectedVersion = Number(base_version)
    if (!Number.isInteger(expectedVersion) || expectedVersion !== Number(file.content_version || 0)) {
      return sendVersionConflict(res, db, file, req.user.id)
    }
    sets.push('content = ?', 'history_revision = ?', 'content_version = content_version + 1', 'last_edited_by = ?')
    vals.push(content, Number(file.history_revision || 0) + 1, req.user.id)
  }
  if (parent_id !== undefined) { sets.push('parent_id = ?'); vals.push(parent_id || null) }
  if (sort_order !== undefined) { sets.push('sort_order = ?'); vals.push(sort_order) }

  if (sets.length === 0) return res.json({ ...file, ...historyAvailability(db, file) })

  sets.push('updated_at = ?')
  vals.push(now, req.params.id)
  const updateTx = db.transaction(() => {
    if (contentChanged) {
      ensureCurrentRevision(db, file, file.user_id, req.user.id)
      db.prepare('DELETE FROM file_revisions WHERE file_id = ? AND revision_no > ?').run(file.id, Number(file.history_revision || 0))
      db.prepare(
        'INSERT INTO file_revisions (file_id, user_id, revision_no, content, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(file.id, file.user_id, Number(file.history_revision || 0) + 1, content, now)
      db.prepare('UPDATE file_revisions SET actor_user_id = ? WHERE file_id = ? AND revision_no = ?')
        .run(req.user.id, file.id, Number(file.history_revision || 0) + 1)
    }
    db.prepare(`UPDATE files SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    if (contentChanged) pruneFileRevisions(db, file.id)
  })
  updateTx()

  if (content !== undefined) {
    updateTags(db, req.params.id, content)
    updateLinks(db, req.params.id, content, file.user_id)
  }
  if (name !== undefined) updateAllLinks(db, file.user_id)

  const updated = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id)
  res.json({ ...decorateFileAccess(getFileAccess(db, updated.id, req.user.id)), ...historyAvailability(db, updated) })
})

router.post('/:id/history/undo', (req, res) => applyHistoryStep(req, res, 'undo'))
router.post('/:id/history/redo', (req, res) => applyHistoryStep(req, res, 'redo'))

// DELETE /api/files/:id
router.delete('/:id', (req, res) => {
  const db = getDb()
  const accessCheck = requireFileAccess(db, req.params.id, req.user.id, 'owner')
  if (accessCheck.error) return res.status(accessCheck.status).json({ error: accessCheck.error })
  const file = accessCheck.access.file
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

  const nextParentId = parent_id || null
  const duplicate = findSiblingByName(db, nextParentId, file.name, req.params.id, req.user.id)
  if (duplicate) return res.status(409).json({ error: 'A file or folder with this name already exists here' })
  if (nextParentId) {
    if (nextParentId === req.params.id) {
      return res.status(400).json({ error: 'Cannot move a folder into itself' })
    }

    const parent = db.prepare('SELECT id, parent_id, type FROM files WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(nextParentId, req.user.id)
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

  db.prepare(
    "UPDATE files SET parent_id = ?, sort_order = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(nextParentId, sort_order ?? 0, req.params.id)
  res.json({ ok: true })
})

// POST /api/files/:id/unlock
router.post('/:id/unlock', async (req, res) => {
  const db = getDb()
  const { password } = req.body

  const accessCheck = requireFileAccess(db, req.params.id, req.user.id, 'owner')
  if (accessCheck.error) return res.status(accessCheck.status).json({ error: accessCheck.error })

  const folder = db.prepare(
    "SELECT * FROM files WHERE id = ? AND type = 'locked_folder' AND user_id = ? AND deleted_at IS NULL"
  ).get(req.params.id, req.user.id)
  if (!folder) return res.status(404).json({ error: 'Not found' })

  const valid = verifyFolderPassword(password, folder.password_hash)
  if (!valid) return res.status(401).json({ error: 'Wrong password' })

  const children = db.prepare('SELECT * FROM files WHERE parent_id = ? AND user_id = ? AND deleted_at IS NULL').all(req.params.id, req.user.id)

  let decrypted
  try {
    decrypted = children.map(child => {
      if (!child.encrypted_content) return child
      try {
        const plain = decryptContent(child.encrypted_content, password)
        return { ...child, content: plain, encrypted_content: null }
      } catch {
        throw new Error(`Could not decrypt "${child.name}"`)
      }
    })
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
  const db = getDb()
  const { password } = req.body
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }

  const accessCheck = requireFileAccess(db, req.params.id, req.user.id, 'owner')
  if (accessCheck.error) return res.status(accessCheck.status).json({ error: accessCheck.error })

  const folder = db.prepare('SELECT id FROM files WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(req.params.id, req.user.id)
  if (!folder) return res.status(404).json({ error: 'Not found' })

  // Sel aléatoire par opération de verrouillage : une clé différente à chaque
  // fois, plus de sel statique partagé entre tous les comptes.
  const salt = crypto.randomBytes(16)
  const key = crypto.scryptSync(password, salt, 32)
  const hash = hashPasswordStrong(password)

  db.prepare("UPDATE files SET type = 'locked_folder', password_hash = ? WHERE id = ?").run(hash, req.params.id)

  const children = db.prepare('SELECT * FROM files WHERE parent_id = ? AND user_id = ? AND deleted_at IS NULL').all(req.params.id, req.user.id)
  const updateEnc = db.prepare('UPDATE files SET encrypted_content = ?, content = NULL, content_version = content_version + 1, last_edited_by = ? WHERE id = ?')
  for (const child of children) {
    if (!child.content) continue
    updateEnc.run(encryptContent(child.content, key, salt), req.user.id, child.id)
    // Un historique en clair annulerait la protection apportée par le dossier.
    db.prepare('DELETE FROM file_revisions WHERE file_id = ?').run(child.id)
    db.prepare('UPDATE files SET history_revision = 0 WHERE id = ?').run(child.id)
  }

  res.json({ ok: true })
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
    return sendVersionConflict(res, db, file, req.user.id)
  }

  ensureCurrentRevision(db, file, file.user_id, req.user.id)
  const operator = direction === 'undo' ? '<' : '>'
  const order = direction === 'undo' ? 'DESC' : 'ASC'
  const target = db.prepare(
    `SELECT revision_no, content FROM file_revisions
     WHERE file_id = ? AND revision_no ${operator} ?
     ORDER BY revision_no ${order} LIMIT 1`
  ).get(file.id, Number(file.history_revision || 0))
  if (!target) {
    return res.status(409).json({ error: direction === 'undo' ? 'Rien a annuler' : 'Rien a retablir' })
  }

  const now = new Date().toISOString()
  db.prepare(
    'UPDATE files SET content = ?, history_revision = ?, content_version = content_version + 1, last_edited_by = ?, updated_at = ? WHERE id = ?'
  ).run(target.content, target.revision_no, req.user.id, now, file.id)
  updateTags(db, file.id, target.content)
  updateLinks(db, file.id, target.content, file.user_id)
  const updated = db.prepare('SELECT * FROM files WHERE id = ?').get(file.id)
  res.json({ ...decorateFileAccess(getFileAccess(db, updated.id, req.user.id)), ...historyAvailability(db, updated) })
}

function ensureCurrentRevision(db, file, ownerId, actorUserId = ownerId) {
  if (file.type !== 'file' || file.content === null) return
  db.prepare(
    'INSERT OR IGNORE INTO file_revisions (file_id, user_id, revision_no, content, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(file.id, ownerId, Number(file.history_revision || 0), file.content || '', file.updated_at || new Date().toISOString())
  db.prepare('UPDATE file_revisions SET actor_user_id = COALESCE(actor_user_id, ?) WHERE file_id = ? AND revision_no = ?')
    .run(actorUserId, file.id, Number(file.history_revision || 0))
}

function historyAvailability(db, file) {
  if (!file || file.type !== 'file' || file.content === null) return { can_undo: false, can_redo: false }
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

function sendVersionConflict(res, db, file, userId) {
  const latest = db.prepare('SELECT * FROM files WHERE id = ? AND deleted_at IS NULL').get(file.id)
  return res.status(409).json({
    error: 'Ce fichier a ete modifie par un autre utilisateur. Choisis la version a conserver.',
    code: 'FILE_VERSION_CONFLICT',
    current_file: {
      ...decorateFileAccess(getFileAccess(db, file.id, userId)),
      ...historyAvailability(db, latest),
    },
  })
}

function validateWritableParent(db, parentId, userId) {
  if (!parentId) return { ownerId: userId }
  const check = requireFileAccess(db, parentId, userId, 'edit')
  if (check.error) return { status: check.status, error: check.error }
  const parent = check.access.file
  if (parent.type === 'locked_folder') return { status: 403, error: 'Deverrouille le dossier avant d’ajouter un element' }
  if (parent.type !== 'folder') return { status: 400, error: 'Le parent doit etre un dossier' }
  return { ownerId: parent.user_id }
}

function buildAccessibleTree(db, userId) {
  const ownedRows = db.prepare(`
    SELECT id, parent_id, name, type, sort_order, created_at, updated_at, content_version
    FROM files
    WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY type DESC, sort_order ASC, name ASC
  `).all(userId).map(row => ({
    ...row,
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
      SELECT id, parent_id, name, type, sort_order, created_at, updated_at, content_version
      FROM files WHERE id IN (SELECT id FROM subtree)
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

function validateParent(db, parentId, userId) {
  if (!parentId) return null
  const parent = db.prepare('SELECT id, type FROM files WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(parentId, userId)
  if (!parent) return { status: 404, error: 'Parent folder not found' }
  if (parent.type === 'locked_folder') return { status: 403, error: 'Unlock the folder before adding files into it' }
  if (parent.type !== 'folder') return { status: 400, error: 'Parent must be a folder' }
  return null
}

// Vérifie le mot de passe d'un dossier verrouillé. Accepte les DEUX formats :
//   - scrypt$2$... : nouveau hash fort (auth/password.js), utilisé aux
//     nouveaux verrouillages
//   - scrypt$1$...  : ancien hash hérité, conservé pour les dossiers
//     verrouillés avant la migration
function verifyFolderPassword(password, storedHash) {
  if (verifyPasswordStrong(password, storedHash)) return true
  return verifyLegacyFolderPassword(password, storedHash)
}

function verifyLegacyFolderPassword(password, storedHash) {
  if (!storedHash) return false
  const parts = String(storedHash).split('$')
  if (parts[0] !== 'scrypt' || parts[1] !== '1' || parts.length !== 4) return false
  const [, , salt, expected] = parts
  const actual = crypto.scryptSync(password, salt, 64)
  const expectedBuffer = Buffer.from(expected, 'hex')
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(expectedBuffer, actual)
}

// Nouveau format authentifié : `gcm$v1$<sel>$<iv>$<tag>$<ciphertext>` (hex).
// AES-256-GCM garantit l'intégrité (déchiffrement échoue si altéré).
function encryptContent(plaintext, key, salt) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  let enc = cipher.update(plaintext, 'utf8', 'hex')
  enc += cipher.final('hex')
  const tag = cipher.getAuthTag().toString('hex')
  return `gcm$v1$${salt.toString('hex')}$${iv.toString('hex')}$${tag}$${enc}`
}

function decryptContent(blob, password) {
  if (typeof blob === 'string' && blob.startsWith('gcm$')) {
    const [, , saltHex, ivHex, tagHex, ciphertext] = blob.split('$')
    const key = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 32)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    let plain = decipher.update(ciphertext, 'hex', 'utf8')
    plain += decipher.final('utf8')
    return plain
  }
  // Ancien format : AES-256-CBC, sel statique, iv = 32 premiers caractères hex.
  const key = crypto.scryptSync(password, LEGACY_KEY_SALT, 32)
  const iv = Buffer.from(blob.slice(0, 32), 'hex')
  const ciphertext = blob.slice(32)
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  let plain = decipher.update(ciphertext, 'hex', 'utf8')
  plain += decipher.final('utf8')
  return plain
}
