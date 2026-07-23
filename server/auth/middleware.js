const { resolveSession } = require('./session')

const SESSION_COOKIE = 'pw_session'

function requestSessionToken(req) {
  const authorization = String(req.headers?.authorization || '')
  const bearer = authorization.match(/^Bearer ([a-f0-9]{64})$/i)?.[1]
  return bearer || req.cookies?.[SESSION_COOKIE] || null
}

function requireAuth(req, res, next) {
  const user = resolveSession(requestSessionToken(req))
  if (!user) return res.status(401).json({ error: 'Non authentifié' })
  req.user = user
  next()
}

module.exports = { requireAuth, SESSION_COOKIE, requestSessionToken }
