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
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS questionnaire_results (
        id TEXT PRIMARY KEY,
        question_key TEXT NOT NULL,
        questionnaire_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
        questionnaire_title TEXT,
        question_id TEXT,
        question_text TEXT NOT NULL,
        answer_text TEXT,
        expected_answer TEXT,
        correct INTEGER NOT NULL DEFAULT 0,
        score REAL,
        response_ms INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_questionnaire_results_question_key
        ON questionnaire_results(question_key);

      CREATE INDEX IF NOT EXISTS idx_questionnaire_results_created_at
        ON questionnaire_results(created_at);
    `)
  },
  // v2 → v3 : authentification (users, sessions) + isolation multi-utilisateur
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Unicité insensible à la casse au niveau SQLite (ferme la race
      -- condition TOCTOU entre le check applicatif et l'INSERT).
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase
        ON users(username COLLATE NOCASE);

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        user_agent TEXT,
        last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    `)

    // user_id nullable partout : les données créées avant l'auth restent
    // orphelines (NULL) jusqu'au rattachement manuel via
    // server/scripts/claim-legacy-data.js — jamais d'attribution automatique
    // au premier compte inscrit (risque réel puisque l'inscription est ouverte).
    addColumnIfMissing(db, 'files', 'user_id', "TEXT REFERENCES users(id) ON DELETE CASCADE")
    addColumnIfMissing(db, 'timer_sessions', 'user_id', "TEXT REFERENCES users(id) ON DELETE CASCADE")
    addColumnIfMissing(db, 'voice_notes', 'user_id', "TEXT REFERENCES users(id) ON DELETE CASCADE")
    addColumnIfMissing(db, 'inbox_resources', 'user_id', "TEXT REFERENCES users(id) ON DELETE CASCADE")
    addColumnIfMissing(db, 'inbox_ideas', 'user_id', "TEXT REFERENCES users(id) ON DELETE CASCADE")
    addColumnIfMissing(db, 'quotes', 'user_id', "TEXT REFERENCES users(id) ON DELETE CASCADE")
    addColumnIfMissing(db, 'questionnaire_results', 'user_id', "TEXT REFERENCES users(id) ON DELETE CASCADE")

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
      CREATE INDEX IF NOT EXISTS idx_timer_sessions_user_id ON timer_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_voice_notes_user_id ON voice_notes(user_id);
      CREATE INDEX IF NOT EXISTS idx_inbox_resources_user_id ON inbox_resources(user_id);
      CREATE INDEX IF NOT EXISTS idx_inbox_ideas_user_id ON inbox_ideas(user_id);
      CREATE INDEX IF NOT EXISTS idx_quotes_user_id ON quotes(user_id);
      CREATE INDEX IF NOT EXISTS idx_questionnaire_results_user_id ON questionnaire_results(user_id);
    `)
  },
  // v3 → v4 : rubrique Fact Check (idees recues a verifier plus tard)
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS fact_checks (
        id TEXT PRIMARY KEY,
        claim TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'to_check' CHECK(status IN ('to_check', 'true', 'false', 'partial')),
        notes TEXT,
        source TEXT,
        tags TEXT DEFAULT '[]',
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_fact_checks_user_id ON fact_checks(user_id);
      CREATE INDEX IF NOT EXISTS idx_fact_checks_status ON fact_checks(status);
    `)
  },
  // v4 -> v5 : section Todo avec date limite et rappel quotidien côté app
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'done')),
        due_at TEXT NOT NULL,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_todos_user_status_due
        ON todos(user_id, status, due_at);
    `)
  },
  // v5 -> v6 : dashboard quotidien, pratiques evolutives et grille de vie
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agenda_practices (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#6ba3e8',
        active INTEGER NOT NULL DEFAULT 1,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        archived_at TEXT
      );

      CREATE TABLE IF NOT EXISTS agenda_checks (
        practice_id TEXT NOT NULL REFERENCES agenda_practices(id) ON DELETE CASCADE,
        entry_date TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, practice_id, entry_date)
      );

      CREATE TABLE IF NOT EXISTS life_profiles (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        birth_date TEXT,
        life_expectancy_years INTEGER NOT NULL DEFAULT 85,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_agenda_practices_user_active
        ON agenda_practices(user_id, active, created_at);
      CREATE INDEX IF NOT EXISTS idx_agenda_checks_user_date
        ON agenda_checks(user_id, entry_date);
    `)
  },
  // v6 -> v7 : ancienne table conservee pour compatibilite des bases existantes
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_snapshots (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        reason TEXT,
        data_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_app_snapshots_user_created
        ON app_snapshots(user_id, created_at);
    `)
  },
  // v7 -> v8 : frise historique personnelle
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS historical_events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        start_label TEXT NOT NULL,
        start_year INTEGER NOT NULL,
        start_month INTEGER,
        start_day INTEGER,
        end_label TEXT,
        end_year INTEGER,
        end_month INTEGER,
        end_day INTEGER,
        description TEXT,
        category TEXT,
        color TEXT NOT NULL DEFAULT '#6ba3e8',
        image_data TEXT,
        image_caption TEXT,
        tags TEXT DEFAULT '[]',
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_historical_events_user_start
        ON historical_events(user_id, start_year, start_month, start_day);
    `)
  },
  // v8 -> v9 : journal public, articles sociaux et liens vers la frise
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        excerpt TEXT,
        content TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published')),
        published_on TEXT,
        published_at TEXT,
        cover_image_data TEXT,
        tags TEXT DEFAULT '[]',
        event_id TEXT REFERENCES historical_events(id) ON DELETE SET NULL,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS article_comments (
        id TEXT PRIMARY KEY,
        article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS article_reactions (
        article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        reaction TEXT NOT NULL DEFAULT 'like' CHECK(reaction IN ('like')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (article_id, user_id, reaction)
      );

      CREATE INDEX IF NOT EXISTS idx_articles_status_date
        ON articles(status, published_on, published_at);
      CREATE INDEX IF NOT EXISTS idx_articles_user_updated
        ON articles(user_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_articles_event
        ON articles(event_id);
      CREATE INDEX IF NOT EXISTS idx_article_comments_article
        ON article_comments(article_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_article_comments_user
        ON article_comments(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_article_reactions_user
        ON article_reactions(user_id, created_at);
    `)
  },
  // v9 -> v10 : suivi des lectures d'articles (lu/pas lu + lecteurs uniques,
  // y compris les visiteurs anonymes qui ouvrent le lien public).
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS article_reads (
        id TEXT PRIMARY KEY,
        article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        anon_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Un lecteur = une ligne : dédup par compte (user_id) OU par appareil
      -- anonyme (anon_id). Les index uniques partiels garantissent l'unicité
      -- sans bloquer l'autre cas (l'un des deux est toujours NULL).
      CREATE UNIQUE INDEX IF NOT EXISTS idx_article_reads_user
        ON article_reads(article_id, user_id) WHERE user_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_article_reads_anon
        ON article_reads(article_id, anon_id) WHERE anon_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_article_reads_article
        ON article_reads(article_id);
    `)
  },
  // v10 -> v11 : ancien champ conserve pour compatibilite des bases existantes
  (db) => {
    addColumnIfMissing(db, 'app_snapshots', 'stack', "TEXT NOT NULL DEFAULT 'undo' CHECK(stack IN ('undo', 'redo'))")
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_app_snapshots_user_stack_created
        ON app_snapshots(user_id, stack, created_at);
    `)
  },
  // v11 -> v12 : corbeille 30 jours et historique persistant par fichier.
  (db) => {
    addColumnIfMissing(db, 'files', 'deleted_at', 'TEXT')
    addColumnIfMissing(db, 'files', 'history_revision', 'INTEGER NOT NULL DEFAULT 0')
    db.exec(`
      CREATE TABLE IF NOT EXISTS file_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        revision_no INTEGER NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(file_id, revision_no)
      );

      CREATE INDEX IF NOT EXISTS idx_files_user_deleted
        ON files(user_id, deleted_at);
      CREATE INDEX IF NOT EXISTS idx_file_revisions_file_revision
        ON file_revisions(file_id, revision_no);

      INSERT OR IGNORE INTO file_revisions (file_id, user_id, revision_no, content, created_at)
      SELECT id, user_id, 0, COALESCE(content, ''), COALESCE(updated_at, datetime('now'))
      FROM files
      WHERE type = 'file' AND user_id IS NOT NULL AND content IS NOT NULL;
    `)
  },
  // v12 -> v13 : partage par identifiant et controle de concurrence cloud.
  (db) => {
    addColumnIfMissing(db, 'files', 'content_version', 'INTEGER NOT NULL DEFAULT 0')
    addColumnIfMissing(db, 'files', 'last_edited_by', 'TEXT REFERENCES users(id) ON DELETE SET NULL')
    addColumnIfMissing(db, 'file_revisions', 'actor_user_id', 'TEXT REFERENCES users(id) ON DELETE SET NULL')
    db.exec(`
      CREATE TABLE IF NOT EXISTS file_shares (
        id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        shared_with_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        permission TEXT NOT NULL DEFAULT 'view' CHECK(permission IN ('view', 'edit')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(file_id, shared_with_user_id),
        CHECK(owner_id != shared_with_user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_file_shares_recipient
        ON file_shares(shared_with_user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_file_shares_owner
        ON file_shares(owner_id, file_id);
    `)
  },
  // v13 -> v14 : carnet de voyage (road trips) avec tracés et photos géolocalisées.
  //   - road_trips : un voyage = un titre, un statut (réalisé/prévu), un tag, une
  //     couleur, la liste ordonnée des villes (points_json), distance et dénivelé.
  //   - road_trip_photos : photos stockées sur disque (volume Railway, via
  //     paths.ROADTRIP_PHOTOS_DIR), jamais en base ; référencées par filename.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS road_trips (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'done' CHECK(status IN ('done', 'planned')),
        tag TEXT,
        color TEXT NOT NULL DEFAULT '#e8663f',
        points_json TEXT NOT NULL DEFAULT '[]',
        distance_km REAL,
        distance_manual INTEGER NOT NULL DEFAULT 0,
        elevation_m INTEGER,
        start_date TEXT,
        end_date TEXT,
        cover_photo_id TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS road_trip_photos (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES road_trips(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        caption TEXT,
        point_id TEXT,
        lat REAL,
        lng REAL,
        width INTEGER,
        height INTEGER,
        bytes INTEGER,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_road_trips_user
        ON road_trips(user_id, sort_order, created_at);
      CREATE INDEX IF NOT EXISTS idx_road_trip_photos_trip
        ON road_trip_photos(trip_id, sort_order);
      CREATE INDEX IF NOT EXISTS idx_road_trip_photos_user
        ON road_trip_photos(user_id);
    `)
  },
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

function updateLinks(db, fileId, content, userId) {
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
    // Filtré par user_id : un lien [[Nom]] ne doit jamais se résoudre vers
    // le fichier d'un autre compte, même en cas d'homonymie.
    const target = db.prepare(
      'SELECT id FROM files WHERE (name = ? OR name = ?) AND user_id IS ? AND deleted_at IS NULL LIMIT 1'
    ).get(nameWithExt, linkText, userId ?? null)
    if (target) insertLink.run(fileId, target.id, linkText)
  }
}

function updateAllLinks(db, userId) {
  const files = db.prepare("SELECT id, content FROM files WHERE type = 'file' AND user_id IS ? AND deleted_at IS NULL").all(userId ?? null)
  const tx = db.transaction(() => {
    for (const file of files) updateLinks(db, file.id, file.content || '', userId)
  })
  tx()
}

module.exports = { getDb, initDb, updateTags, updateLinks, updateAllLinks, addColumnIfMissing, backupDb }
