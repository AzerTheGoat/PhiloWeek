# PhiloWeek v2 — Instructions pour Claude

## Stack technique

- **Backend** : Node.js/Express + SQLite (via `better-sqlite3`, API **synchrone** : `db.prepare(...).get()/.run()/.all()`, pas de `await` sur ces appels)
- **Frontend** : React 18 + Vite (vanilla CSS, pas de framework UI)
- **IA** : Anthropic API, modèle `claude-sonnet-4-6`
- **Config** : clé API dans `.env` → `ANTHROPIC_API_KEY`
- **Lancement dev** : `.\run-v2.ps1` (lance le serveur Node sur :3001 + Vite dev sur :5173)
- **Lancement prod** : `cd client && npm run build` puis `cd server && node index.js`

## Architecture

```
PhiloWeek/
├── server/
│   ├── index.js        ← Express app (port 3001)
│   ├── paths.js        ← Résolution du dossier de données persistant (DB, recordings, backups)
│   ├── db.js           ← SQLite (getDb, initDb, migrations, backupDb, updateTags/Links)
│   ├── scripts/
│   │   └── restore-backup.js  ← Restauration manuelle d'une sauvegarde SQLite
│   ├── routes/
│   │   ├── files.js    ← CRUD fichiers + lock/unlock
│   │   ├── ai.js       ← Claude AI (generate + active mode)
│   │   ├── export.js   ← Export ZIP Obsidian
│   │   ├── import.js   ← Import ZIP Obsidian
│   │   ├── voice.js    ← Notes vocales
│   │   └── timer.js    ← Sessions de travail
│   ├── philoweek_v2.db ← Base SQLite
│   ├── recordings/     ← Fichiers audio
│   └── public/         ← Build React (généré par `npm run build` dans client/)
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js      ← Toutes les fonctions fetch vers /api/*
│   │   ├── context/AppContext.jsx  ← État global (useReducer)
│   │   ├── components/
│   │   │   ├── Sidebar.jsx     ← Sidebar avec recherche + boutons footer
│   │   │   ├── FileTree.jsx    ← Arbre récursif, rename inline, unlock
│   │   │   ├── Editor.jsx      ← Split-pane Markdown, autosave, [[links]]
│   │   │   ├── EditorToolbar.jsx
│   │   │   ├── Preview.jsx     ← Rendu marked.js + [[wiki-links]] cliquables
│   │   │   ├── AIPanel.jsx     ← 4 modes + "Insérer dans la note"
│   │   │   ├── Journal.jsx     ← Calendrier + navigation jours
│   │   │   ├── Timer.jsx       ← Chronomètre + sessions
│   │   │   ├── ContextMenu.jsx
│   │   │   ├── Toast.jsx
│   │   │   └── Modals.jsx      ← new-file, new-folder, lock-folder
│   │   └── index.css   ← Tout le CSS (dark/light via data-theme)
│   └── vite.config.js  ← Proxy /api → :3001, build → server/public/
└── run-v2.ps1          ← Script de lancement (installe les deps si besoin)
```

## Base de données (tables)

```sql
files        — id, parent_id, name, type, content, password_hash, encrypted_content, sort_order
file_links   — source_id, target_id, link_text  (relations [[wiki-links]])
file_tags    — file_id, tag                      (tags #hashtag + frontmatter)
timer_sessions — id, file_id, duration_seconds, activity_type, notes
voice_notes  — id, file_id, filename, duration_seconds, title
```

## Règle absolue : toute nouvelle feature doit être ajoutée au tutoriel

Cette app n'a plus de tour interactif intégré. Documente toute nouvelle feature ici dans CLAUDE.md.

## Règle absolue : ZÉRO perte de données au déploiement (Railway)

Voir **`RAILWAY.md`** pour la procédure complète. Points clés :

- **Le disque Railway est éphémère** : sans volume persistant, la base et les
  audios sont effacés à chaque `git push`. La base + les enregistrements +
  les sauvegardes doivent vivre sur un **Volume Railway** (mount `/data`).
- `server/paths.js` résout le dossier de données dans cet ordre :
  `DATA_DIR` → `RAILWAY_VOLUME_MOUNT_PATH` → `server/` (fallback dev local).
  **Ne jamais** recoder en dur un chemin `path.join(__dirname, 'philoweek_v2.db')`
  ou `.../recordings` : passe toujours par `paths.js` (`DB_PATH`,
  `RECORDINGS_DIR`, `BACKUPS_DIR`).
- Au démarrage, `initDb()` **sauvegarde** la base (`<data>/backups/`, 30 max)
  **avant** toute migration, puis applique les migrations.

### Migrations sûres (changement de schéma sans rien perdre)

- Le schéma est versionné via `PRAGMA user_version`. Le tableau `MIGRATIONS`
  dans `server/db.js` contient une fonction par palier de version.
- **Additif uniquement** : `CREATE TABLE IF NOT EXISTS`, ou
  `addColumnIfMissing(db, table, col, def)`. **Jamais** de `DROP`/`ALTER … DROP`.
- Pour changer le schéma : **ajoute** une entrée à la fin de `MIGRATIONS`, ne
  modifie jamais une migration déjà livrée. Elle ne tournera qu'une fois, sur
  bases existantes comme neuves.

## Filet de sécurité manuel : export/import Obsidian

L'export ZIP Obsidian (`GET /api/export/obsidian`) reste le backup manuel /
mécanisme de compatibilité entre versions. Chaque `.md` a un frontmatter YAML
géré par `gray-matter`.

### Quand tu ajoutes une table ou un champ

1. Ajoute une **migration** additive dans `server/db.js` → `MIGRATIONS`
2. Inclure dans l'export (`server/routes/export.js`)
3. Gérer à l'import (`server/routes/import.js`)

## Modèle de fichier `.md`

```markdown
---
title: Titre
tags: [philosophie, ethique]
created: 2025-01-15T10:30:00Z
modified: 2025-01-15T14:22:00Z
---

Contenu Markdown avec [[liens-wiki]] et #tags inline...
```

## Dossier Journal

- N'est **plus** créé automatiquement à l'init (retiré de `server/db.js` → `initDb()`). Le dossier racine `Journal` est un dossier utilisateur comme un autre : renommable, déplaçable, supprimable, sans protection côté `routes/files.js`.
- Il est créé **à la demande**, la première fois que l'utilisateur clique sur "Journal d'aujourd'hui" (`openJournalToday` dans `AppContext.jsx`) ou sur un jour du calendrier (`Journal.jsx` → `openDay`) : ces deux fonctions créent le dossier racine `Journal` s'il n'existe pas encore, puis l'entrée du jour dedans.
- Entrées : `YYYY-MM-DD.md`

## Panneau IA ("Penseur")

- Contrôlé par la constante `AI_PANEL_OPEN_BY_DEFAULT` en haut de `client/src/context/AppContext.jsx` (actuellement `false`). Elle détermine si le panneau IA s'ouvre automatiquement au chargement de l'app (desktop uniquement, jamais sur mobile).

## Éditeur de note (`Editor.jsx`)

- Vue par défaut à l'ouverture d'un fichier : **Aperçu** (`preview`) sur desktop, **Édition** (`edit`) sur mobile (voir `initialMode()`). Le split n'est plus le mode par défaut ; l'utilisateur peut toujours basculer manuellement via les boutons Éditer/Split/Aperçu.

## Graphe (`GraphEditor.jsx`)

- Sélection multiple de cartes : clic+glisser sur le canvas vide dessine un rectangle de sélection (marquee) ; Shift+clic sur une carte l'ajoute/retire de la sélection. Le panneau latéral bascule sur une vue "N cartes sélectionnées" (couleur groupée, dupliquer, supprimer) quand plus d'une carte est sélectionnée.
- Touche **Suppr/Retour arrière** : supprime la sélection courante (ignoré si le focus est dans un champ texte de l'inspecteur).
- Clic droit sur une carte : menu contextuel **Dupliquer**, **Détacher les liens**, **Supprimer** (agit sur toute la sélection si la carte cliquée en fait partie).

## Menu contextuel de l'explorateur de fichiers

- Clic droit sur une zone vide de la liste de fichiers (`Sidebar.jsx` → `.sidebar-content`) : menu **Nouveau fichier / Nouveau graphe / Nouveau dossier / Importer (.zip) / Exporter**. Le clic droit sur un fichier/dossier garde son propre menu (`FileTree.jsx`).

## Thème

- Dark/light via `document.documentElement.setAttribute('data-theme', ...)`
- CSS variables dans `:root` et `[data-theme="light"]` dans `index.css`
- Persisté dans `localStorage` sous la clé `pw-theme`

## Notes importantes pour Claude

- Les handlers Express sont déclarés `(req, res) => {...}` mais les appels DB (`better-sqlite3`) sont **synchrones**, pas besoin de `await` dessus
- La DB est initialisée au démarrage via `initDb()` (sauvegarde auto + migrations `user_version`) ; chemins de données via `server/paths.js`, jamais en dur
- Persistance en prod = **Volume Railway** obligatoire (`RAILWAY.md`), sinon perte de données à chaque deploy
- Le dossier `Journal` n'est plus protégé ni auto-créé (voir section "Dossier Journal" plus haut)
- Les dossiers verrouillés (`locked_folder`) : contenu chiffré AES-256 côté serveur
- `insertRef` dans AppContext : ref vers la fonction "insérer dans la note" de l'éditeur
