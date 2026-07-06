#!/usr/bin/env node
// Restaure une sauvegarde de la base SQLite.
//
// Usage :
//   node server/scripts/restore-backup.js            → liste les sauvegardes
//   node server/scripts/restore-backup.js <fichier>  → restaure ce fichier
//   node server/scripts/restore-backup.js latest      → restaure la plus récente
//
// La base actuelle est elle-même sauvegardée (suffixe .pre-restore) avant
// d'être écrasée, donc l'opération est réversible.

const fs = require('fs')
const path = require('path')
const { DB_PATH, BACKUPS_DIR } = require('../paths')

function listBackups() {
  if (!fs.existsSync(BACKUPS_DIR)) return []
  return fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith('philoweek_v2-') && f.endsWith('.db'))
    .sort()
}

const arg = process.argv[2]
const backups = listBackups()

if (!arg) {
  if (backups.length === 0) {
    console.log(`Aucune sauvegarde dans ${BACKUPS_DIR}`)
  } else {
    console.log(`Sauvegardes disponibles (${BACKUPS_DIR}) :\n`)
    backups.forEach(f => {
      const size = (fs.statSync(path.join(BACKUPS_DIR, f)).size / 1024).toFixed(0)
      console.log(`  ${f}  (${size} Ko)`)
    })
    console.log(`\nPour restaurer : node server/scripts/restore-backup.js <fichier>`)
    console.log(`Ou la plus récente : node server/scripts/restore-backup.js latest`)
  }
  process.exit(0)
}

const chosen = arg === 'latest' ? backups[backups.length - 1] : arg
if (!chosen) {
  console.error('Aucune sauvegarde à restaurer.')
  process.exit(1)
}

const src = path.isAbsolute(chosen) ? chosen : path.join(BACKUPS_DIR, chosen)
if (!fs.existsSync(src)) {
  console.error(`Introuvable : ${src}`)
  process.exit(1)
}

// Sauvegarde de sécurité de la base courante avant écrasement.
if (fs.existsSync(DB_PATH)) {
  const safety = `${DB_PATH}.pre-restore-${Date.now()}`
  fs.copyFileSync(DB_PATH, safety)
  console.log(`Base actuelle sauvegardée : ${path.basename(safety)}`)
}

// Supprime les fichiers WAL/SHM pour éviter un état incohérent.
for (const suffix of ['-wal', '-shm']) {
  const f = DB_PATH + suffix
  if (fs.existsSync(f)) fs.unlinkSync(f)
}

fs.copyFileSync(src, DB_PATH)
console.log(`✅ Restauré : ${path.basename(src)} → ${DB_PATH}`)
console.log('Redémarre le serveur pour prendre en compte la restauration.')
