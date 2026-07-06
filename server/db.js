const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')
const { DB_PATH, BACKUPS_DIR } = require('./paths')

const MAX_BACKUPS = 30
let _db = null

function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
  }
  return _db
}

// ————————————————————————————————————————————————————————————————
// MIGRATIONS — additives et idempotentes UNIQUEMENT.
//
// Chaque entrée fait passer la base de la version i à i+1. On ne
// SUPPRIME jamais une table/colonne : que du CREATE IF NOT EXISTS et
// du ADD COLUMN (via addColumnIfMissing). Le numéro de version est
// stocké dans `PRAGMA user_version`, donc chaque migration ne tourne
// qu'une seule fois, sur toutes les bases existantes comme neuves.
//
// Pour changer le schéma plus tard : AJOUTE une fonction à la fin du
// tableau. Ne modifie jamais une migration déjà livrée.
// ————————————————————————————————————————————————————————————————
const MIGRATIONS = [
  // v0 → v1 : schéma de base
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        parent_id TEXT REFERENCES files(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('file', 'folder', 'locked_folder')),
        content TEXT,
        password_hash TEXT,
        encrypted_content TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        sort_order INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS file_links (
        source_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        link_text TEXT,
        PRIMARY KEY (source_id, target_id)
      );

      CREATE TABLE IF NOT EXISTS file_tags (
        file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        PRIMARY KEY (file_id, tag)
      );

      CREATE TABLE IF NOT EXISTS timer_sessions (
        id TEXT PRIMARY KEY,
        file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
        duration_seconds INTEGER NOT NULL,
        activity_type TEXT DEFAULT 'thinking',
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS voice_notes (
        id TEXT PRIMARY KEY,
        file_id TEXT REFERENCES files(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        duration_seconds INTEGER DEFAULT 0,
        title TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS inbox_resources (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT,
        type TEXT NOT NULL DEFAULT 'article',
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'todo',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS inbox_ideas (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        tags TEXT DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS quotes (
        id TEXT PRIMARY KEY,
        quote TEXT NOT NULL,
        author TEXT,
        source TEXT,
        notes TEXT,
        tags TEXT DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
  },
  // v1 → v2 : exemple à copier pour un futur changement de schéma.
  //   (db) => {
  //     addColumnIfMissing(db, 'files', 'archived', "INTEGER NOT NULL DEFAULT 0")
  //   },
]

// Ajoute une colonne seulement si elle n'existe pas déjà (SQLite ne
// connaît pas ADD COLUMN IF NOT EXISTS). Sûr : ne touche pas aux données.
function addColumnIfMissing(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all()
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

// Copie de sauvegarde de la base AVANT toute migration. Utilise le
// backup en ligne de better-sqlite3 (cohérent même en mode WAL).
async function backupDb() {
  if (!fs.existsSync(DB_PATH)) return // base neuve : rien à sauvegarder
  try {
    const db = getDb()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const dest = path.join(BACKUPS_DIR, `philoweek_v2-${stamp}.db`)
    await db.backup(dest)
    pruneBackups()
    console.log(`  🛟 Sauvegarde créée : ${path.basename(dest)}`)
  } catch (err) {
    // Une sauvegarde ratée ne doit pas empêcher le démarrage, mais on le signale fort.
    console.error('  ⚠️  Échec de la sauvegarde avant migration :', err.message)
  }
}

function pruneBackups() {
  const files = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith('philoweek_v2-') && f.endsWith('.db'))
    .sort() // horodatage ISO trié = ordre chronologique
  while (files.length > MAX_BACKUPS) {
    const oldest = files.shift()
    try { fs.unlinkSync(path.join(BACKUPS_DIR, oldest)) } catch (_) {}
  }
}

function runMigrations(db) {
  const current = db.pragma('user_version', { simple: true })
  if (current >= MIGRATIONS.length) return 0
  let applied = 0
  for (let v = current; v < MIGRATIONS.length; v++) {
    const tx = db.transaction(() => {
      MIGRATIONS[v](db)
      db.pragma(`user_version = ${v + 1}`)
    })
    tx()
    applied++
  }
  return applied
}

async function initDb() {
  // Existait-elle AVANT qu'on l'ouvre ? (getDb crée le fichier si absent)
  const existedBefore = fs.existsSync(DB_PATH)
  const db = getDb()
  const before = db.pragma('user_version', { simple: true })

  // Sauvegarde seulement si des migrations vont s'appliquer ET que la base
  // préexistait (donc contient potentiellement des données à protéger).
  // Inutile de sauvegarder une base neuve et vide.
  if (before < MIGRATIONS.length && existedBefore) await backupDb()

  const applied = runMigrations(db)
  const after = db.pragma('user_version', { simple: true })
  if (applied > 0) {
    console.log(`  🗄️  Schéma migré : v${before} → v${after} (${applied} migration(s))`)
  } else {
    console.log(`  🗄️  Schéma à jour : v${after}`)
  }
}

function updateTags(db, fileId, content) {
  const tags = new Set()
  const tagRegex = /#([a-zA-Z0-9_À-ɏ-]+)/g
  let m
  while ((m = tagRegex.exec(content)) !== null) tags.add(m[1])

  try {
    const matter = require('gray-matter')
    const parsed = matter(content)
    if (parsed.data.tags) {
      const t = parsed.data.tags
      ;(Array.isArray(t) ? t : [t]).forEach(tag => tags.add(String(tag)))
    }
  } catch (_) {}

  db.prepare('DELETE FROM file_tags WHERE file_id = ?').run(fileId)
  const insertTag = db.prepare('INSERT OR IGNORE INTO file_tags (file_id, tag) VALUES (?, ?)')
  for (const tag of tags) insertTag.run(fileId, tag)
}

function updateLinks(db, fileId, content) {
  const linkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
  const linkTexts = new Set()
  let m
  while ((m = linkRegex.exec(content)) !== null) linkTexts.add(m[1].trim())

  db.prepare('DELETE FROM file_links WHERE source_id = ?').run(fileId)
  const insertLink = db.prepare(
    'INSERT OR IGNORE INTO file_links (source_id, target_id, link_text) VALUES (?, ?, ?)'
  )

  for (const linkText of linkTexts) {
    const nameWithExt = linkText.endsWith('.md') ? linkText : linkText + '.md'
    const target = db.prepare(
      'SELECT id FROM files WHERE name = ? OR name = ? LIMIT 1'
    ).get(nameWithExt, linkText)
    if (target) insertLink.run(fileId, target.id, linkText)
  }
}

function updateAllLinks(db) {
  const files = db.prepare("SELECT id, content FROM files WHERE type = 'file'").all()
  const tx = db.transaction(() => {
    for (const file of files) updateLinks(db, file.id, file.content || '')
  })
  tx()
}

module.exports = { getDb, initDb, updateTags, updateLinks, updateAllLinks, addColumnIfMissing, backupDb }
