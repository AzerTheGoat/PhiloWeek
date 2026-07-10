const express = require('express')
const router = express.Router()
const rateLimit = require('express-rate-limit')
const { v4: uuidv4 } = require('uuid')
const { getDb } = require('../db')
const { hashPassword, verifyPassword } = require('../auth/password')
const { createSession, destroySession, resolveSession, SESSION_TTL_MS } = require('../auth/session')
const { SESSION_COOKIE } = require('../auth/middleware')
const { isRailway } = require('../paths')

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/
// Secure sur Railway (HTTPS) et sur toute prod (NODE_ENV=production).
// En dev local HTTP, reste non-Secure pour que le cookie parte quand même.
const SECURE_COOKIES = isRailway || process.env.NODE_ENV === 'production'
const COOKIE_OPTS = { httpOnly: true, secure: SECURE_COOKIES, sameSite: 'strict', path: '/' }

// Hash factice précalculé une fois au démarrage : sert à faire une
// comparaison scrypt même quand l'utilisateur n'existe pas, pour qu'un
// login avec un username inconnu prenne le même temps qu'un mauvais mot
// de passe (empêche de déduire l'existence d'un compte par timing).
const DUMMY_HASH = hashPassword('dummy-timing-safety-not-a-real-account')

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false })
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false })

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 10) return 'Le mot de passe doit contenir au moins 10 caractères'
  return null
}

router.post('/register', registerLimiter, (req, res) => {
  const { username, password } = req.body || {}
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: "Nom d'utilisateur invalide (3-32 caractères, lettres/chiffres/_/-)" })
  }
  const pwError = validatePassword(password, username)
  if (pwError) return res.status(400).json({ error: pwError })

  const db = getDb()
  if (db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username)) {
    return res.status(409).json({ error: "Ce nom d'utilisateur est déjà pris" })
  }

  const id = uuidv4()
  const now = new Date().toISOString()
  try {
    db.prepare('INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, username, hashPassword(password), now, now)
  } catch (err) {
    // Filet si deux inscriptions concurrentes passent le check ci-dessus
    // en même temps : la contrainte UNIQUE SQLite tranche ici.
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: "Ce nom d'utilisateur est déjà pris" })
    throw err
  }

  const token = createSession(id, req.headers['user-agent'])
  res.cookie(SESSION_COOKIE, token, { ...COOKIE_OPTS, maxAge: SESSION_TTL_MS })
  res.status(201).json({ id, username })
})

router.post('/login', loginLimiter, (req, res) => {
  const GENERIC_ERROR = { error: 'Identifiants invalides' }
  const { username, password } = req.body || {}
  if (typeof username !== 'string' || typeof password !== 'string') return res.status(401).json(GENERIC_ERROR)

  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username)
  let validPassword = false
  if (user) {
    validPassword = verifyPassword(password, user.password_hash)
  } else {
    verifyPassword(password, DUMMY_HASH) // temps constant même si le compte n'existe pas
  }
  if (!user || !validPassword) return res.status(401).json(GENERIC_ERROR)

  const token = createSession(user.id, req.headers['user-agent'])
  res.cookie(SESSION_COOKIE, token, { ...COOKIE_OPTS, maxAge: SESSION_TTL_MS })
  res.json({ id: user.id, username: user.username })
})

router.post('/logout', (req, res) => {
  destroySession(req.cookies?.[SESSION_COOKIE])
  res.clearCookie(SESSION_COOKIE, COOKIE_OPTS)
  res.json({ ok: true })
})

router.get('/me', (req, res) => {
  const user = resolveSession(req.cookies?.[SESSION_COOKIE])
  if (!user) return res.status(401).json({ error: 'Non authentifié' })
  res.json(user)
})

router.patch('/password', (req, res) => {
  const authed = resolveSession(req.cookies?.[SESSION_COOKIE])
  if (!authed) return res.status(401).json({ error: 'Non authentifié' })

  const { currentPassword, newPassword } = req.body || {}
  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(authed.id)
  if (!verifyPassword(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' })
  }
  const pwError = validatePassword(newPassword, user.username)
  if (pwError) return res.status(400).json({ error: pwError })

  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(hashPassword(newPassword), new Date().toISOString(), user.id)
  res.json({ ok: true })
})

module.exports = router
