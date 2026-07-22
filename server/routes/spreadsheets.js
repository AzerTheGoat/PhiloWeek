const express = require('express')
const multer = require('multer')
const { v4: uuidv4 } = require('uuid')
const { getDb } = require('../db')
const { decorateFileAccess, getFileAccess, requireFileAccess } = require('../fileAccess')
const { parseSpreadsheetContent, spreadsheetToXlsxBuffer, xlsxBufferToSpreadsheetContent } = require('../spreadsheetXlsx')
const { encryptCurrentFileContent, encryptRevisionContent, isFolderOpen, materializeFile } = require('../vaultCrypto')
const { assertUserStorageQuota, costlyOperationLimiter } = require('../securityControls')

const router = express.Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, /\.xlsx$/i.test(file.originalname || '')),
})

router.get('/:id/export', costlyOperationLimiter, async (req, res) => {
  const db = getDb()
  const accessCheck = requireFileAccess(db, req.params.id, req.user.id, 'read')
  if (accessCheck.error) return res.status(accessCheck.status).json({ error: accessCheck.error })
  let file
  try { file = materializeFile(db, accessCheck.access.file, req.user.session_id) }
  catch (error) { return res.status(error.status || 423).json({ error: error.message, code: error.code }) }
  if (file.type !== 'file' || !/\.xlsx$/i.test(file.name || '')) return res.status(400).json({ error: 'Ce fichier n’est pas un classeur Excel' })
  try {
    const buffer = await spreadsheetToXlsxBuffer(file.content)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeFilename(file.name))}`)
    res.send(buffer)
  } catch (err) {
    res.status(422).json({ error: err.message || 'Le classeur ne peut pas être exporté' })
  }
})

router.post('/import', costlyOperationLimiter, upload.single('workbook'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choisis un fichier .xlsx valide' })
  const db = getDb()
  try { assertUserStorageQuota(db, req.user.id, req.file.size) }
  catch (error) { return res.status(error.status || 413).json({ error: error.message, code: error.code }) }
  const parentId = req.body.parent_id || null
  const parentCheck = writableParent(db, parentId, req.user.id, req.user.session_id)
  if (parentCheck.error) return res.status(parentCheck.status).json({ error: parentCheck.error })
  const ownerId = parentCheck.ownerId || req.user.id
  const requestedName = safeFilename(req.file.originalname || 'Classeur.xlsx')
  const name = uniqueSiblingName(db, parentId, ownerId, requestedName)
  try {
    const content = await xlsxBufferToSpreadsheetContent(req.file.buffer, name.replace(/\.xlsx$/i, ''))
    parseSpreadsheetContent(content)
    const id = uuidv4()
    const now = new Date().toISOString()
    const encryptedFolderId = parentCheck.encryptedFolderId || null
    const encryptedContent = encryptedFolderId
      ? encryptCurrentFileContent(id, content, encryptedFolderId, req.user.session_id)
      : null
    const encryptedRevision = encryptedFolderId
      ? encryptRevisionContent(id, 0, content, encryptedFolderId, req.user.session_id)
      : null
    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO files (
          id, parent_id, name, type, content, encrypted_content, encrypted_folder_id,
          user_id, last_edited_by, created_at, updated_at
        ) VALUES (?, ?, ?, 'file', ?, ?, ?, ?, ?, ?, ?)
      `).run(id, parentId, name, encryptedFolderId ? null : content, encryptedContent, encryptedFolderId, ownerId, req.user.id, now, now)
      db.prepare(`
        INSERT INTO file_revisions (
          file_id, user_id, actor_user_id, revision_no, content,
          encrypted_content, encrypted_folder_id, created_at
        ) VALUES (?, ?, ?, 0, ?, ?, ?, ?)
      `).run(id, ownerId, req.user.id, encryptedFolderId ? '' : content, encryptedRevision, encryptedFolderId, now)
    })
    transaction()
    const created = materializeFile(db, getFileAccess(db, id, req.user.id).file, req.user.session_id)
    res.status(201).json(decorateFileAccess({ ...getFileAccess(db, id, req.user.id), file: created }))
  } catch (err) {
    res.status(422).json({ error: err.message || 'Le fichier Excel est illisible' })
  }
})

router.use((err, _req, res, next) => {
  if (!(err instanceof multer.MulterError)) return next(err)
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Le fichier XLSX dépasse la limite de 25 Mo' })
  res.status(400).json({ error: 'Import XLSX invalide' })
})

function writableParent(db, parentId, userId, sessionId) {
  if (!parentId) return { ownerId: userId }
  const access = getFileAccess(db, parentId, userId)
  if (!access) return { status: 404, error: 'Dossier parent introuvable' }
  if (!access.canEdit) return { status: 403, error: 'Ce dossier est en lecture seule' }
  if (access.file.type !== 'folder') return { status: 400, error: 'Le parent doit être un dossier déverrouillé' }
  if (access.file.encrypted_folder_id && !isFolderOpen(sessionId, access.file.encrypted_folder_id)) {
    return { status: 423, error: 'Ouvre le dossier chiffré avant l’import' }
  }
  return { ownerId: access.file.user_id, encryptedFolderId: access.file.encrypted_folder_id || null }
}

function uniqueSiblingName(db, parentId, ownerId, requested) {
  const ext = '.xlsx'
  const base = requested.replace(/\.xlsx$/i, '') || 'Classeur'
  let name = `${base}${ext}`
  let suffix = 2
  while (db.prepare('SELECT 1 FROM files WHERE parent_id IS ? AND user_id = ? AND name = ? COLLATE NOCASE AND deleted_at IS NULL').get(parentId, ownerId, name)) {
    name = `${base} (${suffix++})${ext}`
  }
  return name
}

function safeFilename(value) {
  const cleaned = String(value || 'Classeur.xlsx').replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').trim().slice(0, 180)
  return /\.xlsx$/i.test(cleaned) ? cleaned : `${cleaned || 'Classeur'}.xlsx`
}

module.exports = router
