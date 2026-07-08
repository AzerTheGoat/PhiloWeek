const express = require('express')
const router = express.Router()
const crypto = require('crypto')
const { getDb, updateTags, updateLinks, updateAllLinks } = require('../db')
const { v4: uuidv4 } = require('uuid')
const { hashPassword: hashPasswordStrong, verifyPassword: verifyPasswordStrong } = require('../auth/password')

// Ancien sel statique — conservé UNIQUEMENT pour déchiffrer les dossiers
// verrouillés avant la migration vers le format GCM (sel aléatoire).
const LEGACY_KEY_SALT = 'philoweek-salt-v2'

// GET /api/files — full tree
router.get('/', (req, res) => {
  const db = getDb()
  const rows = db.prepare(
    'SELECT id, parent_id, name, type, sort_order, created_at, updated_at FROM files WHERE user_id = ? ORDER BY type DESC, sort_order ASC, name ASC'
  ).all(req.user.id)
  const map = {}
  rows.forEach(r => (map[r.id] = { ...r, children: [] }))
  const roots = []
  rows.forEach(r => {
    if (r.parent_id && map[r.parent_id]) map[r.parent_id].children.push(map[r.id])
    else if (!r.parent_id) roots.push(map[r.id])
  })
  res.json(roots)
})

// GET /api/files/search?q=
router.get('/search', (req, res) => {
  const db = getDb()
  const { q } = req.query
  if (!q || q.length < 2) return res.json([])
  const results = db.prepare(
    `SELECT id, name, type, parent_id,
      substr(content, max(1, instr(lower(content), lower(?)) - 60), 160) as excerpt
     FROM files WHERE type = 'file' AND user_id = ? AND (lower(name) LIKE lower(?) OR lower(content) LIKE lower(?))
     LIMIT 20`
  ).all(q, req.user.id, `%${q}%`, `%${q}%`)
  res.json(results)
})

// GET /api/files/names — for [[link]] autocomplete
router.get('/names', (req, res) => {
  const db = getDb()
  res.json(db.prepare("SELECT id, name, parent_id FROM files WHERE type = 'file' AND user_id = ? ORDER BY name").all(req.user.id))
})

// GET /api/files/:id
router.get('/:id', (req, res) => {
  const db = getDb()
  const file = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!file) return res.status(404).json({ error: 'Not found' })

  if (file.type === 'locked_folder') {
    return res.json({ id: file.id, name: file.name, type: file.type, parent_id: file.parent_id, locked: true })
  }

  const tags = db.prepare('SELECT tag FROM file_tags WHERE file_id = ?').all(file.id).map(r => r.tag)
  const links = db.prepare(
    `SELECT f.id, f.name FROM file_links fl JOIN files f ON f.id = fl.target_id WHERE fl.source_id = ?`
  ).all(file.id)
  const backlinks = db.prepare(
    `SELECT f.id, f.name FROM file_links fl JOIN files f ON f.id = fl.source_id WHERE fl.target_id = ?`
  ).all(file.id)
  res.json({ ...file, tags, links, backlinks })
})

// POST /api/files
router.post('/', (req, res) => {
  const db = getDb()
  const { parent_id, name, type, content } = req.body
  if (!name || !type) return res.status(400).json({ error: 'name and type required' })
  const parentId = parent_id || null
  const parentCheck = validateParent(db, parentId, req.user.id)
  if (parentCheck) return res.status(parentCheck.status).json({ error: parentCheck.error })
  const duplicate = findSiblingByName(db, parentId, name, null, req.user.id)
  if (duplicate) return res.status(409).json({ error: 'A file or folder with this name already exists here' })

  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO files (id, parent_id, name, type, content, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, parentId, name, type, content || null, req.user.id, now, now)

  if (content) {
    updateTags(db, id, content)
    updateLinks(db, id, content, req.user.id)
  }
  if (type === 'file') updateAllLinks(db, req.user.id)

  res.status(201).json(db.prepare('SELECT * FROM files WHERE id = ?').get(id))
})

// PUT /api/files/:id
router.put('/:id', (req, res) => {
  const db = getDb()
  const file = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!file) return res.status(404).json({ error: 'Not found' })

  const { name, content, parent_id, sort_order } = req.body
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
  if (content !== undefined) { sets.push('content = ?'); vals.push(content) }
  if (parent_id !== undefined) { sets.push('parent_id = ?'); vals.push(parent_id || null) }
  if (sort_order !== undefined) { sets.push('sort_order = ?'); vals.push(sort_order) }

  if (sets.length === 0) return res.json(file)

  sets.push('updated_at = ?')
  vals.push(now, req.params.id)
  db.prepare(`UPDATE files SET ${sets.join(', ')} WHERE id = ?`).run(...vals)

  if (content !== undefined) {
    updateTags(db, req.params.id, content)
    updateLinks(db, req.params.id, content, req.user.id)
  }
  if (name !== undefined) updateAllLinks(db, req.user.id)

  res.json(db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id))
})

// DELETE /api/files/:id
router.delete('/:id', (req, res) => {
  const db = getDb()
  const file = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!file) return res.status(404).json({ error: 'Not found' })
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
  db.prepare('DELETE FROM files WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// PUT /api/files/:id/move
router.put('/:id/move', (req, res) => {
  const db = getDb()
  const { parent_id, sort_order } = req.body
  const file = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!file) return res.status(404).json({ error: 'Not found' })

  const nextParentId = parent_id || null
  const duplicate = findSiblingByName(db, nextParentId, file.name, req.params.id, req.user.id)
  if (duplicate) return res.status(409).json({ error: 'A file or folder with this name already exists here' })
  if (nextParentId) {
    if (nextParentId === req.params.id) {
      return res.status(400).json({ error: 'Cannot move a folder into itself' })
    }

    const parent = db.prepare('SELECT id, parent_id, type FROM files WHERE id = ? AND user_id = ?').get(nextParentId, req.user.id)
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
        ? db.prepare('SELECT id, parent_id FROM files WHERE id = ? AND user_id = ?').get(cursor.parent_id, req.user.id)
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

  const folder = db.prepare(
    "SELECT * FROM files WHERE id = ? AND type = 'locked_folder' AND user_id = ?"
  ).get(req.params.id, req.user.id)
  if (!folder) return res.status(404).json({ error: 'Not found' })

  const valid = verifyFolderPassword(password, folder.password_hash)
  if (!valid) return res.status(401).json({ error: 'Wrong password' })

  const children = db.prepare('SELECT * FROM files WHERE parent_id = ? AND user_id = ?').all(req.params.id, req.user.id)

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
      'UPDATE files SET content = ?, encrypted_content = NULL, updated_at = ? WHERE id = ?'
    )
    for (const child of decrypted) {
      if (child.content === undefined || child.content === null) continue
      updateChild.run(child.content, new Date().toISOString(), child.id)
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

  const folder = db.prepare('SELECT id FROM files WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!folder) return res.status(404).json({ error: 'Not found' })

  // Sel aléatoire par opération de verrouillage : une clé différente à chaque
  // fois, plus de sel statique partagé entre tous les comptes.
  const salt = crypto.randomBytes(16)
  const key = crypto.scryptSync(password, salt, 32)
  const hash = hashPasswordStrong(password)

  db.prepare("UPDATE files SET type = 'locked_folder', password_hash = ? WHERE id = ?").run(hash, req.params.id)

  const children = db.prepare('SELECT * FROM files WHERE parent_id = ? AND user_id = ?').all(req.params.id, req.user.id)
  const updateEnc = db.prepare('UPDATE files SET encrypted_content = ?, content = NULL WHERE id = ?')
  for (const child of children) {
    if (!child.content) continue
    updateEnc.run(encryptContent(child.content, key, salt), child.id)
  }

  res.json({ ok: true })
})

function countDescendants(db, folderId, userId) {
  let total = 0
  const children = db.prepare('SELECT id FROM files WHERE parent_id = ? AND user_id = ?').all(folderId, userId)
  for (const child of children) {
    total += 1 + countDescendants(db, child.id, userId)
  }
  return total
}

module.exports = router

function findSiblingByName(db, parentId, name, excludeId = null, userId) {
  return db.prepare(
    `SELECT id FROM files
     WHERE parent_id IS ? AND user_id = ? AND lower(name) = lower(?) AND (? IS NULL OR id != ?)
     LIMIT 1`
  ).get(parentId || null, userId, name, excludeId, excludeId)
}

function validateParent(db, parentId, userId) {
  if (!parentId) return null
  const parent = db.prepare('SELECT id, type FROM files WHERE id = ? AND user_id = ?').get(parentId, userId)
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
