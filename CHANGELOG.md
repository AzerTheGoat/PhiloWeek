# Journal des changements — PhiloWeek v2

> Récap des travaux pour ne rien perdre. Le plus récent en haut.

---

## 2026-07-06 — Persistance des données (ZÉRO perte au déploiement)

**Commit :** `Persist data across deploys: Railway volume, safe migrations, auto-backup`

### Le problème résolu
Railway utilise un **disque éphémère** : à chaque `git push`, le conteneur est
reconstruit à neuf → la base SQLite (`philoweek_v2.db`) et les notes vocales
(`recordings/`) étaient **effacées à chaque déploiement**. Ce n'était pas un bug
de code mais un problème de stockage.

### La solution (3 couches)

1. **Volume persistant Railway** — un disque qui survit aux déploiements.
   - `server/paths.js` (NOUVEAU) résout le dossier de données dans l'ordre :
     `DATA_DIR` → `RAILWAY_VOLUME_MOUNT_PATH` → `server/` (fallback dev local).
   - Base, `recordings/` et `backups/` vivent tous sous ce dossier.
   - Avertissement bruyant dans les logs si on tourne sur Railway **sans** volume.

2. **Sauvegarde automatique avant migration** — `server/db.js`
   - À chaque démarrage, si une migration doit s'appliquer sur une base
     existante, copie d'abord la base dans `<data>/backups/` (30 dernières gardées).
   - Utilise le backup en ligne de better-sqlite3 (cohérent même en mode WAL).

3. **Migrations additives versionnées** — `server/db.js`
   - Schéma versionné par `PRAGMA user_version`. Tableau `MIGRATIONS` : une
     fonction par palier. **Additif uniquement** (`CREATE TABLE IF NOT EXISTS`,
     `addColumnIfMissing`). **Jamais** de `DROP`. Chaque migration ne tourne qu'une fois.

### Fichiers
- **NOUVEAU** `server/paths.js` — résolution du dossier de données persistant
- **NOUVEAU** `server/scripts/restore-backup.js` — restauration manuelle d'une sauvegarde
- **NOUVEAU** `RAILWAY.md` — procédure de déploiement + volume + seeding des données
- `server/db.js` — migrations `user_version` + `backupDb()` + `addColumnIfMissing()`
- `server/index.js`, `server/routes/voice.js` — chemins via `paths.js`
- `.gitignore` — exclut `backups/`, `*.pre-restore-*`

### ⚠️ À faire UNE FOIS sur Railway (voir RAILWAY.md)
1. Export ZIP Obsidian depuis l'app **en ligne actuelle** (avant de déployer).
2. Railway → service → **Settings → Volumes** → mount path **`/data`**.
3. Déployer (`git push`).
4. Vérifier les logs : `📦 Données persistées dans : /data`.
5. Dans l'app (vide), **Import** du ZIP → réinjecte les données sur le volume.
6. Fini : chaque push conserve désormais tout.

### Restauration d'une sauvegarde (si besoin)
```bash
node server/scripts/restore-backup.js          # liste
node server/scripts/restore-backup.js latest   # restaure la plus récente
# sur Railway : railway run node server/scripts/restore-backup.js latest
```

### Changer le schéma plus tard SANS rien perdre
Dans `server/db.js`, **ajoute** une fonction à la fin de `MIGRATIONS` (n'en
modifie jamais une déjà livrée) :
```js
const MIGRATIONS = [
  (db) => { /* v0 → v1 : schéma de base (déjà là) */ },
  (db) => {
    // v1 → v2
    addColumnIfMissing(db, 'files', 'archived', "INTEGER NOT NULL DEFAULT 0")
  },
]
```
Au déploiement : sauvegarde auto → migration → données conservées.

---

## 2026-07-06 — UX : graphe multi-sélection, sidebar, journal, éditeur

**Commit :** `Graph multi-select, sidebar fixes, and Journal/AI panel behavior changes`

### Graphe (`client/src/components/GraphEditor.jsx`)
- **Sélection multiple** : clic+glisser sur le canvas vide dessine un rectangle
  (marquee) ; Shift+clic ajoute/retire une carte. Panneau latéral "N cartes
  sélectionnées" (couleur groupée, dupliquer, supprimer) au-delà d'une carte.
- **Touche Suppr/Retour arrière** : supprime la sélection (ignoré si le focus
  est dans un champ texte de l'inspecteur).
- **Clic droit sur une carte** : menu **Dupliquer / Détacher les liens /
  Supprimer** (agit sur toute la sélection si la carte cliquée en fait partie).

### Panneau IA "Penseur" (`client/src/context/AppContext.jsx`)
- Ne s'ouvre plus automatiquement au démarrage. Contrôlé par la constante
  `AI_PANEL_OPEN_BY_DEFAULT` (actuellement `false`).

### Dossier Journal (`server/db.js`, `server/routes/files.js`, `FileTree.jsx`)
- **Plus créé automatiquement** à l'init et **plus protégé** : c'est un dossier
  utilisateur comme un autre (renommable, déplaçable, supprimable).
- Créé **à la demande** au 1er clic sur "Journal d'aujourd'hui" ou un jour du
  calendrier.

### Explorateur de fichiers (`client/src/components/Sidebar.jsx`)
- **Clic droit sur zone vide** → menu **Nouveau fichier / graphe / dossier /
  Importer (.zip) / Exporter**.
- **Bug corrigé** : le bouton pour rouvrir la sidebar rétractée était masqué
  (clippé par `overflow: hidden` une fois la sidebar à 0 de large). Passé en
  `position: fixed`, il reste accessible ; le chevron bascule ‹/›.

### Éditeur de note (`client/src/components/Editor.jsx`)
- Vue par défaut à l'ouverture d'un fichier : **Aperçu** (au lieu de Split) sur
  desktop, **Édition** sur mobile.
