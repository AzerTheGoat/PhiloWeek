require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const express = require('express')
const cors = require('cors')
const path = require('path')
const helmet = require('helmet')
const cookieParser = require('cookie-parser')
const { initDb } = require('./db')
const { requireAuth } = require('./auth/middleware')
const { pruneExpiredSessions } = require('./auth/session')
const { isRailway } = require('./paths')
const { costlyOperationLimiter, requestIdMiddleware, securityLog, storageQuotaGuard } = require('./securityControls')
const { pruneExpiredFolderKeys } = require('./vaultCrypto')

const app = express()
const PORT = process.env.PORT || 3001

// Railway est derrière un reverse proxy : sans ceci, express-rate-limit et
// req.ip voient l'IP du proxy pour toutes les requêtes (rate limit cassé),
// et le flag Secure des cookies peut se tromper.
app.set('trust proxy', isRailway ? 1 : false)

app.use(requestIdMiddleware)

app.use(helmet({
  // CSP : le build Vite ne charge que des scripts EXTERNES (/assets/*.js),
  // donc `script-src 'self'` suffit et bloque tout script inline / handler
  // on* / URL javascript: injecté via une note Markdown (défense en
  // profondeur en plus du nettoyage HTML côté client).
  // Les images HTTPS restent autorisées pour le journal public. Le rendu
  // d'article supprime le referrer et le sanitizer continue de bloquer les
  // images distantes dans les notes privées. Une CSP ne pouvant pas varier
  // par composant, `https:` doit néanmoins figurer ici.
  //   - images locales et images base64 (data:) de la frise
  //   - favicon data: dans index.html
  //   - lecture audio des notes vocales (blob:)
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      mediaSrc: ["'self'", 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: null,
    },
  },
}))
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3001'], credentials: true }))
app.use(cookieParser())
// 12 Mo : large pour des notes avec quelques images base64, mais coupe
// l'abus mémoire des anciens 50 Mo. L'import de coffre (.zip) a sa propre
// limite via multer et n'est pas concerné.
app.use(express.json({ limit: '12mb' }))
app.use(express.urlencoded({ extended: true, limit: '12mb' }))

// Routes d'auth : non protégées (ce sont les points d'entrée), montées
// AVANT le garde requireAuth ci-dessous.
app.use('/api/auth', require('./routes/auth'))
app.use('/api/public/social-journal', require('./routes/publicSocialJournal'))

// Tout le reste de /api/* exige une session valide.
app.use('/api', requireAuth)
app.use('/api', storageQuotaGuard)

app.use('/api/files', require('./routes/files'))
app.use('/api/shares', require('./routes/shares'))
app.use('/api/spreadsheets', require('./routes/spreadsheets'))
app.use('/api/export', costlyOperationLimiter, require('./routes/export'))
app.use('/api/import', costlyOperationLimiter, require('./routes/import'))
app.use('/api/voice', require('./routes/voice'))
app.use('/api/timer', require('./routes/timer'))
app.use('/api/inbox', require('./routes/inbox'))
app.use('/api/life', require('./routes/life'))
app.use('/api/todos', require('./routes/todos'))
app.use('/api/questionnaires', require('./routes/questionnaires'))
  app.use('/api/dictionary', require('./routes/dictionary'))
  app.use('/api/markdown', require('./routes/markdown'))
app.use('/api/knowledge-graph', require('./routes/knowledgeGraph'))
app.use('/api/historical-timeline', require('./routes/historicalTimeline'))
app.use('/api/roadtrips', require('./routes/roadtrips'))
app.use('/api/social-journal', require('./routes/socialJournal'))

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint introuvable' }))

app.use((err, req, res, _next) => {
  securityLog('http.unhandled_error', req, {
    error_name: err?.name,
    error_code: err?.code,
    status: Number(err?.status) || 500,
  }, 'error')
  const status = Number(err?.status) || (err?.type === 'entity.too.large' ? 413 : 500)
  res.status(status).json({
    error: status < 500 ? (err.message || 'Requête invalide') : 'Erreur interne',
    code: err?.code,
    request_id: req.requestId,
  })
})

// Serve built React app
const clientBuild = path.join(__dirname, 'public')
app.use(express.static(clientBuild))
app.get('/{*splat}', (req, res) => {
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
  setInterval(pruneExpiredFolderKeys, 60 * 1000).unref()
}).catch(err => {
  console.error('DB init failed:', err)
  process.exit(1)
})
