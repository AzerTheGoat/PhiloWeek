require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const express = require('express')
const cors = require('cors')
const path = require('path')
const helmet = require('helmet')
const cookieParser = require('cookie-parser')
const { initDb } = require('./db')
const { requireAuth } = require('./auth/middleware')
const { pruneExpiredSessions } = require('./auth/session')

const app = express()
const PORT = process.env.PORT || 3001

// Railway est derrière un reverse proxy : sans ceci, express-rate-limit et
// req.ip voient l'IP du proxy pour toutes les requêtes (rate limit cassé),
// et le flag Secure des cookies peut se tromper.
app.set('trust proxy', 1)

app.use(helmet({
  // CSP strict = amélioration future à faire avec un audit complet des
  // sources chargées ; désactivé pour ne rien casser silencieusement.
  contentSecurityPolicy: false,
}))
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3001'], credentials: true }))
app.use(cookieParser())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Routes d'auth : non protégées (ce sont les points d'entrée), montées
// AVANT le garde requireAuth ci-dessous.
app.use('/api/auth', require('./routes/auth'))

// Tout le reste de /api/* exige une session valide.
app.use('/api', requireAuth)

app.use('/api/files', require('./routes/files'))
app.use('/api/export', require('./routes/export'))
app.use('/api/import', require('./routes/import'))
app.use('/api/voice', require('./routes/voice'))
app.use('/api/timer', require('./routes/timer'))
app.use('/api/inbox', require('./routes/inbox'))
app.use('/api/life', require('./routes/life'))
app.use('/api/todos', require('./routes/todos'))
app.use('/api/questionnaires', require('./routes/questionnaires'))
app.use('/api/knowledge-graph', require('./routes/knowledgeGraph'))

// Serve built React app
const clientBuild = path.join(__dirname, 'public')
app.use(express.static(clientBuild))
app.get('*', (req, res) => {
  const fs = require('fs')
  const idx = path.join(clientBuild, 'index.html')
  if (fs.existsSync(idx)) res.sendFile(idx)
  else res.status(404).send('Run `npm run build` in client/ first, or start with run-v2.ps1')
})

// Init DB then start
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n  Opuscule v2 ✦  http://localhost:${PORT}\n`)
  })
  // Purge des sessions expirées toutes les heures (en plus de la
  // suppression paresseuse au moment de la résolution d'un token).
  setInterval(pruneExpiredSessions, 60 * 60 * 1000).unref()
}).catch(err => {
  console.error('DB init failed:', err)
  process.exit(1)
})
