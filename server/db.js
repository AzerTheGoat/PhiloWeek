 const { open } = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const { v4: uuidv4 } = require('uuid')

const DB_PATH = path.join(__dirname, 'philoweek_v2.db')
let _db = null

async function getDb() {
  if (!_db) {
    _db = await open({ filename: DB_PATH, driver: sqlite3.Database })
    await _db.exec('PRAGMA journal_mode = WAL')
    await _db.exec('PRAGMA foreign_keys = ON')
  }
  return _db
}

async function initDb() {
  const db = await getDb()

  await db.exec(`
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
  `)

  // Create Journal folder if not exists
  const journalExists = await db.get(
    "SELECT id FROM files WHERE name = 'Journal' AND parent_id IS NULL AND type = 'folder'"
  )
  if (!journalExists) {
    await db.run(
      "INSERT INTO files (id, parent_id, name, type) VALUES (?, NULL, 'Journal', 'folder')",
      [uuidv4()]
    )
  }
}

async function updateTags(db, fileId, content) {
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

  await db.run('DELETE FROM file_tags WHERE file_id = ?', [fileId])
  for (const tag of tags) {
    await db.run('INSERT OR IGNORE INTO file_tags (file_id, tag) VALUES (?, ?)', [fileId, tag])
  }
}

async function updateLinks(db, fileId, content) {
  const linkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
  const linkTexts = new Set()
  let m
  while ((m = linkRegex.exec(content)) !== null) linkTexts.add(m[1].trim())

  await db.run('DELETE FROM file_links WHERE source_id = ?', [fileId])

  for (const linkText of linkTexts) {
    const nameWithExt = linkText.endsWith('.md') ? linkText : linkText + '.md'
    const target = await db.get(
      'SELECT id FROM files WHERE name = ? OR name = ? LIMIT 1',
      [nameWithExt, linkText]
    )
    if (target) {
      await db.run(
        'INSERT OR IGNORE INTO file_links (source_id, target_id, link_text) VALUES (?, ?, ?)',
        [fileId, target.id, linkText]
      )
    }
  }
}

module.exports = { getDb, initDb, updateTags, updateLinks }
