function getFileAccess(db, fileId, userId, { includeDeleted = false } = {}) {
  const file = db.prepare(`
    SELECT f.*, u.username AS owner_username, editor.username AS last_editor_username
    FROM files f
    LEFT JOIN users u ON u.id = f.user_id
    LEFT JOIN users editor ON editor.id = f.last_edited_by
    WHERE f.id = ? ${includeDeleted ? '' : 'AND f.deleted_at IS NULL'}
  `).get(fileId)
  if (!file) return null

  const lockedAncestor = db.prepare(`
    WITH RECURSIVE ancestors(id, parent_id, type) AS (
      SELECT id, parent_id, type FROM files WHERE id = ?
      UNION ALL
      SELECT parent.id, parent.parent_id, parent.type
      FROM files parent JOIN ancestors child ON parent.id = child.parent_id
    )
    SELECT 1 FROM ancestors WHERE id != ? AND type = 'locked_folder' LIMIT 1
  `).get(fileId, fileId)
  if (lockedAncestor) return null

  if (file.user_id === userId) {
    return {
      file,
      permission: 'owner',
      isOwner: true,
      canEdit: true,
      sharedRootId: null,
    }
  }

  const share = db.prepare(`
    WITH RECURSIVE ancestors(id, parent_id, depth) AS (
      SELECT id, parent_id, 0 FROM files WHERE id = ?
      UNION ALL
      SELECT parent.id, parent.parent_id, ancestors.depth + 1
      FROM files parent
      JOIN ancestors ON parent.id = ancestors.parent_id
    )
    SELECT s.*, ancestors.depth
    FROM ancestors
    JOIN file_shares s ON s.file_id = ancestors.id
    WHERE s.shared_with_user_id = ? AND s.owner_id = ?
    ORDER BY CASE s.permission WHEN 'edit' THEN 0 ELSE 1 END, ancestors.depth ASC
    LIMIT 1
  `).get(fileId, userId, file.user_id)
  if (!share) return null

  return {
    file,
    permission: share.permission,
    isOwner: false,
    canEdit: share.permission === 'edit',
    sharedRootId: share.file_id,
    shareId: share.id,
  }
}

function decorateFileAccess(access) {
  if (!access) return null
  return {
    ...access.file,
    access: {
      permission: access.permission,
      is_owner: access.isOwner,
      can_edit: access.canEdit,
      owner_username: access.file.owner_username || null,
      shared_root_id: access.sharedRootId,
    },
  }
}

function getAccessibleFileRows(db, userId, { filesOnly = false } = {}) {
  return db.prepare(`
    WITH RECURSIVE shared_tree(id, owner_id) AS (
      SELECT s.file_id, s.owner_id
      FROM file_shares s
      JOIN files root ON root.id = s.file_id
      WHERE s.shared_with_user_id = ? AND root.deleted_at IS NULL
      UNION
      SELECT child.id, tree.owner_id
      FROM files child
      JOIN shared_tree tree ON child.parent_id = tree.id
      WHERE child.deleted_at IS NULL AND child.user_id = tree.owner_id
    )
    SELECT DISTINCT f.*, u.username AS owner_username
    FROM files f
    LEFT JOIN users u ON u.id = f.user_id
    WHERE f.deleted_at IS NULL
      AND (f.user_id = ? OR f.id IN (SELECT id FROM shared_tree))
      ${filesOnly ? "AND f.type = 'file'" : ''}
  `).all(userId, userId)
}

function getSharedTreeRoots(db, userId) {
  const shares = db.prepare(`
    SELECT s.*, f.parent_id, f.user_id AS file_owner_id, u.username AS owner_username
    FROM file_shares s
    JOIN files f ON f.id = s.file_id AND f.deleted_at IS NULL
    JOIN users u ON u.id = s.owner_id
    WHERE s.shared_with_user_id = ?
    ORDER BY s.created_at ASC
  `).all(userId)
  const sharedIds = new Set(shares.map(share => share.file_id))
  return shares.filter(share => {
    let parentId = share.parent_id
    while (parentId) {
      if (sharedIds.has(parentId)) return false
      const parent = db.prepare('SELECT parent_id FROM files WHERE id = ? AND deleted_at IS NULL').get(parentId)
      parentId = parent?.parent_id || null
    }
    return true
  })
}

function requireFileAccess(db, fileId, userId, mode = 'read') {
  const access = getFileAccess(db, fileId, userId)
  if (!access) return { status: 404, error: 'Fichier introuvable' }
  if (mode === 'edit' && !access.canEdit) return { status: 403, error: 'Acces en lecture seule' }
  if (mode === 'owner' && !access.isOwner) return { status: 403, error: 'Action reservee au proprietaire' }
  return { access }
}

module.exports = {
  decorateFileAccess,
  getAccessibleFileRows,
  getFileAccess,
  getSharedTreeRoots,
  requireFileAccess,
}
