const { resolveSession } = require('./session')

const SESSION_COOKIE = 'pw_session'

function requireAuth(req, res, next) {
  const user = resolveSession(req.cookies?.[SESSION_COOKIE])
  if (!user) return res.status(401).json({ error: 'Non authentifié' })
  req.user = user
  next()
}

module.exports = { requireAuth, SESSION_COOKIE }
