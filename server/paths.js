const path = require('path')
const fs = require('fs')

// ————————————————————————————————————————————————————————————————
// Résolution du dossier de données (survit aux déploiements)
//
// Ordre de priorité :
//   1. DATA_DIR                        → override manuel
//   2. RAILWAY_VOLUME_MOUNT_PATH       → injecté par Railway quand un
//                                        volume persistant est attaché
//   3. __dirname (= server/)           → fallback dev local (Windows)
//
// TOUT ce qui doit persister (base SQLite, enregistrements audio,
// sauvegardes) vit sous ce dossier. En prod Railway, pointe-le vers un
// VOLUME, sinon les données sont perdues à chaque deploy.
// ————————————————————————————————————————————————————————————————
const DATA_DIR =
  process.env.DATA_DIR ||
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  __dirname

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

ensureDir(DATA_DIR)

const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'philoweek_v2.db')
const RECORDINGS_DIR = ensureDir(path.join(DATA_DIR, 'recordings'))
const BACKUPS_DIR = ensureDir(path.join(DATA_DIR, 'backups'))

// Détecte un déploiement Railway sans volume persistant : dans ce cas on
// écrit sur un disque éphémère et les données seront perdues au prochain push.
const isRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
  process.env.RAILWAY_ENVIRONMENT_NAME ||
  process.env.RAILWAY_PROJECT_ID
)
const hasPersistentVolume = Boolean(
  process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH
)

if (isRailway && !hasPersistentVolume) {
  console.warn(
    '\n⚠️  ————————————————————————————————————————————————————————\n' +
    '⚠️  AUCUN VOLUME PERSISTANT DÉTECTÉ SUR RAILWAY.\n' +
    '⚠️  Les données seront PERDUES au prochain déploiement.\n' +
    '⚠️  Attache un volume et laisse RAILWAY_VOLUME_MOUNT_PATH pointer dessus.\n' +
    '⚠️  Voir RAILWAY.md à la racine du projet.\n' +
    '⚠️  ————————————————————————————————————————————————————————\n'
  )
} else {
  console.log(`  📦 Données persistées dans : ${DATA_DIR}`)
}

module.exports = { DATA_DIR, DB_PATH, RECORDINGS_DIR, BACKUPS_DIR, ensureDir, isRailway, hasPersistentVolume }
