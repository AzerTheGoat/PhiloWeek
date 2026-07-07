require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const express = require('express')
const cors = require('cors')
const path = require('path')
const { initDb } = require('./db')
const { RECORDINGS_DIR } = require('./paths')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3001'], credentials: true }))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))
app.use('/audio', express.static(RECORDINGS_DIR))

// Routes
app.use('/api/files', require('./routes/files'))
app.use('/api/ai', require('./routes/ai'))
app.use('/api/export', require('./routes/export'))
app.use('/api/import', require('./routes/import'))
app.use('/api/voice', require('./routes/voice'))
app.use('/api/timer', require('./routes/timer'))
app.use('/api/inbox', require('./routes/inbox'))
app.use('/api/life', require('./routes/life'))
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
    console.log(`\n  PhiloWeek v2 ✦  http://localhost:${PORT}\n`)
  })
}).catch(err => {
  console.error('DB init failed:', err)
  process.exit(1)
})
