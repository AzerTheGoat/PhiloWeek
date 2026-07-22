const crypto = require('crypto')
const { boundedScrypt } = require('./auth/password')
const VAULT_KEY_TTL_MS = 15 * 60 * 1000
const KDF_PARAMS = Object.freeze({ N: 131072, r: 8, p: 1, keyLength: 32 })
const openFolderKeys = new Map()

class VaultLockedError extends Error {
  constructor(folderId) {
    super('Ce dossier chiffré est verrouillé pour cette session')
    this.name = 'VaultLockedError'
    this.status = 423
    this.code = 'ENCRYPTED_FOLDER_LOCKED'
    this.folderId = folderId
  }
}

function scryptOptions(params = KDF_PARAMS) {
  return {
    N: Number(params.N),
    r: Number(params.r),
    p: Number(params.p),
    maxmem: Math.max(256 * 1024 * 1024, 256 * Number(params.N) * Number(params.r)),
  }
}

async function deriveVaultKek(password, salt, params = KDF_PARAMS) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) {
    const error = new Error('Le mot de passe du coffre doit contenir au moins 12 caractères')
    error.status = 400
    throw error
  }
  return boundedScrypt(password.normalize('NFKC'), salt, Number(params.keyLength || 32), scryptOptions(params))
}

function encryptAead(plaintext, key, aad) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ciphertext.toString('base64'),
  }
}

function decryptAead(envelope, key, aad) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'))
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final(),
  ])
}

function wrapKey(key, wrappingKey, aad) {
  return JSON.stringify({ v: 1, alg: 'A256GCM', ...encryptAead(key, wrappingKey, aad) })
}

function unwrapKey(value, wrappingKey, aad) {
  const envelope = parseEnvelope(value)
  if (envelope.v !== 1 || envelope.alg !== 'A256GCM') throw new Error('Version cryptographique non supportée')
  return decryptAead(envelope, wrappingKey, aad)
}

function encryptText(plaintext, folderKey, aad) {
  const dataKey = crypto.randomBytes(32)
  try {
    const wrapped = encryptAead(dataKey, folderKey, `dek:${aad}`)
    const content = encryptAead(Buffer.from(String(plaintext ?? ''), 'utf8'), dataKey, `content:${aad}`)
    return JSON.stringify({
      v: 2,
      alg: 'A256GCM',
      aad,
      key: wrapped,
      content,
    })
  } finally {
    dataKey.fill(0)
  }
}

function decryptText(value, folderKey, expectedAad) {
  const envelope = parseEnvelope(value)
  if (envelope.v !== 2 || envelope.alg !== 'A256GCM' || envelope.aad !== expectedAad) {
    throw new Error('Enveloppe de contenu invalide')
  }
  const dataKey = decryptAead(envelope.key, folderKey, `dek:${expectedAad}`)
  try {
    return decryptAead(envelope.content, dataKey, `content:${expectedAad}`).toString('utf8')
  } finally {
    dataKey.fill(0)
  }
}

function parseEnvelope(value) {
  try {
    const parsed = JSON.parse(String(value || ''))
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid')
    return parsed
  } catch (_) {
    throw new Error('Donnée chiffrée invalide ou altérée')
  }
}

async function ensureUserVault(db, userId, password) {
  let vault = db.prepare('SELECT * FROM user_vaults WHERE user_id = ?').get(userId)
  if (!vault) {
    const salt = crypto.randomBytes(16)
    const kek = await deriveVaultKek(password, salt)
    const verifier = encryptAead(Buffer.from('opuscule-vault-v1'), kek, `vault:${userId}`)
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO user_vaults (user_id, kdf_name, kdf_salt, kdf_params_json, password_verifier, key_version, created_at, updated_at)
      VALUES (?, 'scrypt', ?, ?, ?, 1, ?, ?)
    `).run(userId, salt, JSON.stringify(KDF_PARAMS), JSON.stringify(verifier), now, now)
    vault = db.prepare('SELECT * FROM user_vaults WHERE user_id = ?').get(userId)
    return { vault, kek }
  }
  return { vault, kek: await authenticateUserVault(vault, userId, password) }
}

async function authenticateUserVault(vault, userId, password) {
  if (!vault || vault.kdf_name !== 'scrypt') throw new Error('Configuration du coffre non supportée')
  const params = JSON.parse(vault.kdf_params_json || '{}')
  const kek = await deriveVaultKek(password, Buffer.from(vault.kdf_salt), params)
  try {
    const verifier = JSON.parse(vault.password_verifier)
    const plain = decryptAead(verifier, kek, `vault:${userId}`).toString('utf8')
    if (plain !== 'opuscule-vault-v1') throw new Error('invalid')
    return kek
  } catch (_) {
    kek.fill(0)
    const error = new Error('Mot de passe du coffre incorrect')
    error.status = 401
    throw error
  }
}

async function createEncryptedFolder(db, folderId, userId, sessionId, password) {
  const { kek } = await ensureUserVault(db, userId, password)
  const folderKey = crypto.randomBytes(32)
  try {
    const wrapped = wrapKey(folderKey, kek, `folder:${userId}:${folderId}`)
    db.prepare(`
      INSERT INTO encrypted_folders (folder_id, user_id, wrapped_folder_key, crypto_version, created_at, updated_at)
      VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(folderId, userId, wrapped)
    cacheFolderKey(sessionId, userId, folderId, folderKey)
    return Buffer.from(folderKey)
  } finally {
    kek.fill(0)
    folderKey.fill(0)
  }
}

async function openEncryptedFolder(db, folderId, userId, sessionId, password) {
  const vault = db.prepare('SELECT * FROM user_vaults WHERE user_id = ?').get(userId)
  const folder = db.prepare('SELECT * FROM encrypted_folders WHERE folder_id = ? AND user_id = ?').get(folderId, userId)
  if (!vault || !folder) {
    const error = new Error('Dossier chiffré introuvable')
    error.status = 404
    throw error
  }
  const kek = await authenticateUserVault(vault, userId, password)
  try {
    const folderKey = unwrapKey(folder.wrapped_folder_key, kek, `folder:${userId}:${folderId}`)
    cacheFolderKey(sessionId, userId, folderId, folderKey)
    folderKey.fill(0)
  } finally {
    kek.fill(0)
  }
}

// Déverrouille plusieurs FDK pour une opération ponctuelle (export) sans
// ouvrir les dossiers dans la session de navigation.
async function loadFolderKeysForOperation(db, userId, password, folderIds) {
  const vault = db.prepare('SELECT * FROM user_vaults WHERE user_id = ?').get(userId)
  if (!vault) {
    const error = new Error('Coffre chiffré introuvable')
    error.status = 404
    throw error
  }
  const kek = await authenticateUserVault(vault, userId, password)
  const keys = new Map()
  try {
    const selectFolder = db.prepare('SELECT * FROM encrypted_folders WHERE folder_id = ? AND user_id = ?')
    for (const folderId of folderIds) {
      const folder = selectFolder.get(folderId, userId)
      if (!folder) throw new Error('Dossier chiffré introuvable')
      keys.set(folderId, unwrapKey(folder.wrapped_folder_key, kek, `folder:${userId}:${folderId}`))
    }
    return keys
  } catch (error) {
    for (const key of keys.values()) key.fill(0)
    throw error
  } finally {
    kek.fill(0)
  }
}

async function changeVaultPassword(db, userId, oldPassword, newPassword) {
  const vault = db.prepare('SELECT * FROM user_vaults WHERE user_id = ?').get(userId)
  if (!vault) {
    const error = new Error('Aucun coffre configuré')
    error.status = 404
    throw error
  }
  const oldKek = await authenticateUserVault(vault, userId, oldPassword)
  const newSalt = crypto.randomBytes(16)
  const newKek = await deriveVaultKek(newPassword, newSalt)
  try {
    const folders = db.prepare('SELECT * FROM encrypted_folders WHERE user_id = ?').all(userId)
    const rewrapped = folders.map(folder => {
      const key = unwrapKey(folder.wrapped_folder_key, oldKek, `folder:${userId}:${folder.folder_id}`)
      try { return [wrapKey(key, newKek, `folder:${userId}:${folder.folder_id}`), folder.folder_id] }
      finally { key.fill(0) }
    })
    const verifier = encryptAead(Buffer.from('opuscule-vault-v1'), newKek, `vault:${userId}`)
    db.transaction(() => {
      const update = db.prepare('UPDATE encrypted_folders SET wrapped_folder_key = ?, updated_at = datetime(\'now\') WHERE folder_id = ?')
      for (const args of rewrapped) update.run(...args)
      db.prepare(`
        UPDATE user_vaults SET kdf_salt = ?, kdf_params_json = ?, password_verifier = ?,
          key_version = key_version + 1, updated_at = datetime('now') WHERE user_id = ?
      `).run(newSalt, JSON.stringify(KDF_PARAMS), JSON.stringify(verifier), userId)
    })()
    clearUserFolderKeys(userId)
  } finally {
    oldKek.fill(0)
    newKek.fill(0)
  }
}

function cacheKeyId(sessionId, folderId) {
  return `${sessionId}:${folderId}`
}

function cacheFolderKey(sessionId, userId, folderId, key) {
  if (!sessionId) throw new Error('Session de coffre indisponible')
  evictFolderKey(sessionId, folderId)
  openFolderKeys.set(cacheKeyId(sessionId, folderId), {
    userId,
    folderId,
    key: Buffer.from(key),
    expiresAt: Date.now() + VAULT_KEY_TTL_MS,
  })
}

function getFolderKey(sessionId, folderId) {
  const id = cacheKeyId(sessionId, folderId)
  const entry = openFolderKeys.get(id)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    entry.key.fill(0)
    openFolderKeys.delete(id)
    return null
  }
  entry.expiresAt = Date.now() + VAULT_KEY_TTL_MS
  return entry.key
}

function requireFolderKey(sessionId, folderId) {
  const key = getFolderKey(sessionId, folderId)
  if (!key) throw new VaultLockedError(folderId)
  return key
}

function evictFolderKey(sessionId, folderId) {
  const id = cacheKeyId(sessionId, folderId)
  const entry = openFolderKeys.get(id)
  if (entry) entry.key.fill(0)
  openFolderKeys.delete(id)
}

function clearSessionFolderKeys(sessionId) {
  for (const [id, entry] of openFolderKeys) {
    if (id.startsWith(`${sessionId}:`)) {
      entry.key.fill(0)
      openFolderKeys.delete(id)
    }
  }
}

function clearUserFolderKeys(userId) {
  for (const [id, entry] of openFolderKeys) {
    if (entry.userId === userId) {
      entry.key.fill(0)
      openFolderKeys.delete(id)
    }
  }
}

function getEncryptionRootId(db, fileOrId) {
  if (fileOrId && typeof fileOrId === 'object' && fileOrId.encrypted_folder_id) return fileOrId.encrypted_folder_id
  const id = typeof fileOrId === 'object' ? fileOrId.id : fileOrId
  return db.prepare('SELECT encrypted_folder_id FROM files WHERE id = ?').get(id)?.encrypted_folder_id || null
}

function materializeFile(db, file, sessionId, explicitKeys = null) {
  if (!file?.encrypted_folder_id) return file
  const key = explicitKeys?.get(file.encrypted_folder_id) || requireFolderKey(sessionId, file.encrypted_folder_id)
  if (file.type !== 'file') return file
  return {
    ...file,
    content: decryptText(file.encrypted_content, key, `file:${file.id}`),
  }
}

function materializeRevision(revision, sessionId, folderId, explicitKeys = null) {
  if (!folderId) return revision
  const key = explicitKeys?.get(folderId) || requireFolderKey(sessionId, folderId)
  return {
    ...revision,
    content: decryptText(revision.encrypted_content, key, `revision:${revision.file_id}:${revision.revision_no}`),
  }
}

function encryptCurrentFileContent(fileId, content, folderId, sessionId) {
  const key = requireFolderKey(sessionId, folderId)
  return encryptText(content, key, `file:${fileId}`)
}

function encryptRevisionContent(fileId, revisionNo, content, folderId, sessionId) {
  const key = requireFolderKey(sessionId, folderId)
  return encryptText(content, key, `revision:${fileId}:${revisionNo}`)
}

function isFolderOpen(sessionId, folderId) {
  return Boolean(getFolderKey(sessionId, folderId))
}

function pruneExpiredFolderKeys() {
  for (const [id, entry] of openFolderKeys) {
    if (entry.expiresAt <= Date.now()) {
      entry.key.fill(0)
      openFolderKeys.delete(id)
    }
  }
}

module.exports = {
  VaultLockedError,
  VAULT_KEY_TTL_MS,
  changeVaultPassword,
  clearSessionFolderKeys,
  clearUserFolderKeys,
  createEncryptedFolder,
  decryptText,
  encryptCurrentFileContent,
  encryptRevisionContent,
  encryptText,
  evictFolderKey,
  getEncryptionRootId,
  isFolderOpen,
  loadFolderKeysForOperation,
  materializeFile,
  materializeRevision,
  openEncryptedFolder,
  pruneExpiredFolderKeys,
  requireFolderKey,
}
