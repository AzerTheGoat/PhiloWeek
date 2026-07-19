# Opuscule v2 (PhiloWeek) — Instructions pour Claude

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
files        — id, parent_id, name, type, content, password_hash, encrypted_content, sort_order, user_id
file_links   — source_id, target_id, link_text  (relations [[wiki-links]])
file_tags    — file_id, tag                      (tags #hashtag + frontmatter)
timer_sessions — id, file_id, duration_seconds, activity_type, notes, user_id
voice_notes  — id, file_id, filename, duration_seconds, title, user_id
users        — id, username (unique, insensible à la casse), password_hash
sessions     — id, user_id, token_hash, expires_at, user_agent
fact_checks  — id, claim, status (to_check/true/false/partial), notes, source, tags, user_id
road_trips   — id, user_id, title, description, status (done/planned), tag, color, points_json (villes ordonnées [{id,name,lat,lng,note}]), distance_km, distance_manual, elevation_m, start_date, end_date, cover_photo_id, sort_order
road_trip_photos — id, trip_id, user_id, filename (sur disque, jamais en base), caption, point_id, lat, lng, width, height, bytes, sort_order
road_trip_notes — id, trip_id, user_id, lat, lng, title, body, color, sort_order (note de texte géolocalisée, marqueur cliquable sur la carte)
```

Toutes les tables de contenu (`files`, `timer_sessions`, `voice_notes`, `quotes`,
`inbox_resources`, `inbox_ideas`, `questionnaire_results`, `fact_checks`,
`road_trips`, `road_trip_photos`, `road_trip_notes`) ont une
colonne `user_id` : chaque requête dans `server/routes/*.js` doit filtrer dessus
(`WHERE user_id = ?` / `AND user_id = ?`) — voir la section authentification
plus bas.

## Règle absolue : toute nouvelle feature doit être ajoutée au tutoriel

Il existe un didacticiel intégré (`client/src/components/Tutorial.jsx`, vue
`tutorial`) : une page de cartes groupées par thème (Explorateur, Éditeur,
Graphe, Questionnaires, IA, Journal/Timer, Inbox/Vie, Export/Import…), chaque
carte affichant sa description au survol (`:hover`) ou au focus/tap
(`:focus`, `:focus-within` — fonctionne donc aussi sur mobile sans JS
supplémentaire). Accessible via le bouton "Découvrir les fonctionnalités"
sur l'écran d'accueil, ou l'icône dédiée dans le header de la sidebar.

**Quand tu ajoutes une feature visible par l'utilisateur** : ajoute une
carte correspondante dans le tableau `SECTIONS` de `Tutorial.jsx` (icône +
titre + description courte), en plus de documenter ici dans CLAUDE.md.

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

## Authentification et isolation multi-utilisateurs

- Chaque compte (`users`) a son propre coffre : toutes les tables de contenu
  ont une colonne `user_id`, et **chaque requête** dans `server/routes/*.js`
  doit filtrer dessus (`req.user.id`, posé par le middleware `requireAuth`
  dans `server/auth/middleware.js`, monté dans `server/index.js` avant tous
  les routers sauf `/api/auth`).
- Sessions : token aléatoire côté client dans un cookie `HttpOnly` +
  `Secure` (via `paths.js` → `isRailway`) + `SameSite=Strict` ; seul son hash
  SHA-256 est stocké côté serveur (`server/auth/session.js`, table
  `sessions`) — jamais le token brut. Le logout supprime la ligne, donc la
  révocation est immédiate (contrairement à un JWT).
- Mots de passe des comptes : `server/auth/password.js` (scrypt renforcé,
  format versionné `scrypt$2$...`). **Ne jamais confondre** avec
  `hashPassword`/`verifyPassword` dans `server/routes/files.js`, qui
  protègent les dossiers verrouillés (`locked_folder`) avec un format et des
  paramètres différents — les deux doivent rester indépendants.
- Nouvelle table de contenu = colonne `user_id` obligatoire dès la création
  (pas besoin du pattern "nullable + script de rattachement" utilisé pour la
  migration initiale de l'auth, qui ne concernait que les données
  pré-existantes).

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

## Carnet de voyage (road trips)

- Vue `roadtrips` (`client/src/components/RoadTrips.jsx`) : carte Leaflet plein
  écran, une carte **par utilisateur**. Tout le rendu carto est **côté client**.
- **Carte gratuite sans clé API** : Leaflet (`npm i leaflet`, bundlé par Vite,
  jamais de CDN à cause de la CSP `script-src 'self'`) + tuiles **CARTO**
  (`voyager`/`light`/`dark`, chargées comme `<img>` donc couvertes par
  `imgSrc https:`). **Aucune tuile ne doit passer par `fetch`** (bloqué par
  `connectSrc 'self'`).
- **Géocodage** : proxy backend `GET /api/roadtrips/geocode?q=` → Nominatim
  (OpenStreetMap, gratuit, `User-Agent` obligatoire). Le client n'appelle
  jamais Nominatim directement (CSP). L'utilisateur cherche une ville → un
  point est ajouté ; les points sont **reliés en lignes droites** (pas de suivi
  de route réelle).
- **Tracés** : plein = voyage `done`, pointillé = `planned`. La distance se
  calcule en **haversine** (somme des segments) côté serveur ET client
  (`distance_auto_km`), sauf si `distance_manual` (km réels saisis). Le
  dénivelé (`elevation_m`) est **toujours manuel** (pas d'API payante).
- **Photos** : compressées **dans le navigateur** avant upload
  (`client/src/utils/photoCompress.js`, canvas → JPEG, 4 presets de qualité
  proposés dans une modale). Stockées **sur disque** via multer dans
  `paths.ROADTRIP_PHOTOS_DIR` (= `<data>/roadtrip_photos/`, volume Railway),
  **jamais en base** — seul `filename` est stocké. Servies par
  `GET /api/roadtrips/photos/:filename` (vérifie `user_id`). Une photo peut être
  épinglée sur la carte (`lat`/`lng`) et/ou désignée couverture.
- **Placer photos & notes sur la carte** : un **mode placement** (état
  `placement` dans `RoadTrips.jsx`, passé à `MapCanvas` + `TripEditor`) capture
  le prochain clic carte pour poser une **note** (`road_trip_notes`, texte
  géolocalisé affiché en marqueur cliquable → bulle Leaflet), déplacer une note
  (`note-move`), ou placer une **photo** (`photo`). Le clic est capté une seule
  fois via `map.on('click')` + un ref vers le handler courant. Les photos
  restent épinglables à une ville via le menu. Toujours filtrer les popups par
  `escapeHtml` (contenu utilisateur injecté en HTML). Routes :
  `POST /:id/notes`, `PUT /notes/:noteId`, `DELETE /notes/:noteId`.
- **Mode « Carte postale »** (`StoryView`) : mise en page instagramable
  (couverture, stats km/dénivelé/étapes, mini-carte du tracé, galerie) prête
  pour une capture d'écran.
- **Export** : `GET /api/roadtrips/export` (JSON complet, `?photos=embed` pour
  inclure les photos en base64) et `GET /api/roadtrips/:id/geojson` (GeoJSON
  standard). Inclus aussi dans l'export/import Obsidian
  (`_Opuscule/RoadTrips.json` — trips + photos + notes — et binaires sous
  `_Opuscule/roadtrip-photos/`) : à l'import, voyages, photos et notes sont
  recréés avec de **nouveaux ids et noms de fichiers** (la couverture est
  remappée ; le voyage est inséré **avant** ses photos/notes à cause des FK
  `road_trip_photos.trip_id` / `road_trip_notes.trip_id`).

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
