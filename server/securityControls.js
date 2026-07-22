const rateLimit = require('express-rate-limit')
const fs = require('fs')
const path = require('path')
const { RECORDINGS_DIR } = require('./paths')

const DEFAULT_USER_QUOTA_BYTES = Number(process.env.USER_STORAGE_QUOTA_BYTES) || 1024 * 1024 * 1024

function createUserLimiter({ windowMs, limit, prefix }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req => `${prefix}:${req.user?.id || 'anonymous'}:${rateLimit.ipKeyGenerator(req.ip)}`,
    handler: (req, res) => {
      securityLog('rate_limit.exceeded', req, { limiter: prefix })
      res.status(429).json({ error: 'Trop de requêtes. Réessaie plus tard.', code: 'RATE_LIMITED' })
    },
  })
}

function assertUserStorageQuota(db, userId, additionalBytes = 0) {
  const totals = db.prepare(`
    SELECT
      COALESCE((SELECT SUM(LENGTH(COALESCE(content, '')) + LENGTH(COALESCE(encrypted_content, ''))) FROM files WHERE user_id = ?), 0) +
      COALESCE((SELECT SUM(LENGTH(COALESCE(content, '')) + LENGTH(COALESCE(encrypted_content, ''))) FROM file_revisions WHERE user_id = ?), 0) +
      COALESCE((SELECT SUM(COALESCE(bytes, 0)) FROM road_trip_photos WHERE user_id = ?), 0) +
      COALESCE((SELECT SUM(LENGTH(COALESCE(content, '')) + LENGTH(COALESCE(cover_image_data, '')) + LENGTH(COALESCE(excerpt, ''))) FROM articles WHERE user_id = ?), 0) +
      COALESCE((SELECT SUM(LENGTH(COALESCE(description, '')) + LENGTH(COALESCE(image_data, ''))) FROM historical_events WHERE user_id = ?), 0) +
      COALESCE((SELECT SUM(LENGTH(COALESCE(content, '')) + LENGTH(COALESCE(tags, ''))) FROM inbox_ideas WHERE user_id = ?), 0) +
      COALESCE((SELECT SUM(LENGTH(COALESCE(url, '')) + LENGTH(COALESCE(notes, ''))) FROM inbox_resources WHERE user_id = ?), 0) +
      COALESCE((SELECT SUM(LENGTH(COALESCE(description, '')) + LENGTH(COALESCE(points_json, '')) + LENGTH(COALESCE(plan_json, ''))) FROM road_trips WHERE user_id = ?), 0) +
      COALESCE((SELECT SUM(LENGTH(COALESCE(body, '')) + LENGTH(COALESCE(details_json, ''))) FROM road_trip_notes WHERE user_id = ?), 0) +
      COALESCE((SELECT SUM(LENGTH(COALESCE(quote, '')) + LENGTH(COALESCE(notes, ''))) FROM quotes WHERE user_id = ?), 0) +
      COALESCE((SELECT SUM(LENGTH(COALESCE(claim, '')) + LENGTH(COALESCE(notes, ''))) FROM fact_checks WHERE user_id = ?), 0) +
      COALESCE((SELECT SUM(LENGTH(COALESCE(title, '')) + LENGTH(COALESCE(notes, ''))) FROM todos WHERE user_id = ?), 0)
      AS bytes
  `).get(userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId)
  const recordings = db.prepare('SELECT filename FROM voice_notes WHERE user_id = ?').all(userId)
  const recordingBytes = recordings.reduce((total, recording) => {
    const safeName = path.basename(String(recording.filename || ''))
    if (!safeName || safeName !== recording.filename) return total
    try { return total + fs.statSync(path.join(RECORDINGS_DIR, safeName)).size } catch (_) { return total }
  }, 0)
  const current = Number(totals?.bytes || 0) + recordingBytes
  if (current + Math.max(0, Number(additionalBytes || 0)) > DEFAULT_USER_QUOTA_BYTES) {
    const error = new Error('Quota de stockage utilisateur dépassé')
    error.status = 413
    error.code = 'USER_STORAGE_QUOTA_EXCEEDED'
    throw error
  }
  return { current, limit: DEFAULT_USER_QUOTA_BYTES }
}

function storageQuotaGuard(req, res, next) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next()
  const pathName = String(req.originalUrl || '').split('?')[0]
  if (
    pathName.startsWith('/api/export/') ||
    pathName === '/api/files' ||
    /^\/api\/files\/[^/]+$/.test(pathName) ||
    pathName === '/api/import/obsidian' ||
    pathName === '/api/spreadsheets/import' ||
    pathName === '/api/voice' ||
    /^\/api\/roadtrips\/[^/]+\/photos$/.test(pathName) ||
    /^\/api\/files\/[^/]+\/(?:unlock|encryption\/(?:open|lock))$/.test(pathName) ||
    pathName === '/api/files/vault/password'
  ) return next()
  try {
    assertUserStorageQuota(require('./db').getDb(), req.user.id)
    next()
  } catch (error) {
    res.status(error.status || 413).json({ error: error.message, code: error.code })
  }
}

function requestIdMiddleware(req, res, next) {
  const incoming = String(req.get('x-request-id') || '')
  req.requestId = /^[a-zA-Z0-9_-]{8,80}$/.test(incoming)
    ? incoming
    : require('crypto').randomUUID()
  res.setHeader('X-Request-Id', req.requestId)
  next()
}

function securityLog(event, req, details = {}, level = 'warn') {
  const entry = {
    level,
    event,
    at: new Date().toISOString(),
    request_id: req?.requestId || null,
    user_id: req?.user?.id || null,
    session_id: req?.user?.session_id || null,
    ip: normalizeIp(req?.ip),
    method: req?.method,
    path: req?.originalUrl?.split('?')[0],
    ...details,
  }
  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else if (level === 'info') console.info(line)
  else console.warn(line)
}

function normalizeIp(value) {
  return String(value || '').replace(/^::ffff:/, '').slice(0, 80)
}

const costlyOperationLimiter = createUserLimiter({ windowMs: 15 * 60 * 1000, limit: 20, prefix: 'costly' })
const unlockLimiter = createUserLimiter({ windowMs: 15 * 60 * 1000, limit: 10, prefix: 'vault-unlock' })
const publicReadLimiter = createUserLimiter({ windowMs: 60 * 1000, limit: 30, prefix: 'public-read' })

module.exports = {
  assertUserStorageQuota,
  costlyOperationLimiter,
  publicReadLimiter,
  requestIdMiddleware,
  securityLog,
  storageQuotaGuard,
  unlockLimiter,
}
