# PhiloWeek v2 — Instructions pour Codex

## Stack technique

- **Backend** : Node.js/Express + SQLite (via `sqlite` + `sqlite3`)
- **Frontend** : React 18 + Vite (vanilla CSS, pas de framework UI)
- **IA** : Anthropic API, modèle `Codex-sonnet-4-6`
- **Config** : clé API dans `.env` → `ANTHROPIC_API_KEY`
- **Lancement dev** : `.\run-v2.ps1` (lance le serveur Node sur :3001 + Vite dev sur :5173)
- **Lancement prod** : `cd client && npm run build` puis `cd server && node index.js`

## Architecture

```
PhiloWeek/
├── server/
│   ├── index.js        ← Express app (port 3001)
│   ├── db.js           ← SQLite async (getDb, initDb, updateTags, updateLinks)
│   ├── routes/
│   │   ├── files.js    ← CRUD fichiers + lock/unlock
│   │   ├── ai.js       ← Codex AI (generate + active mode)
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

Cette app n'a plus de tour interactif intégré. Documente toute nouvelle feature ici dans AGENTS.md.

## Règle absolue : compatibilité entre versions via export/import Obsidian

L'export ZIP Obsidian (`GET /api/export/obsidian`) est le seul mécanisme de backup.
Chaque fichier `.md` a un frontmatter YAML géré par `gray-matter`.

### Quand tu ajoutes une table ou un champ

1. Ajoute la création dans `server/db.js` → `initDb()`
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

- Créé automatiquement à l'init (`/Journal/`)
- Entrées : `YYYY-MM-DD.md`
- Protégé contre la suppression dans `routes/files.js`

## Thème

- Dark/light via `document.documentElement.setAttribute('data-theme', ...)`
- CSS variables dans `:root` et `[data-theme="light"]` dans `index.css`
- Persisté dans `localStorage` sous la clé `pw-theme`

## Notes importantes pour Codex

- Toutes les routes Express sont **async/await** (db sqlite est asynchrone)
- La DB est initialisée au démarrage via `initDb()`, pas besoin de migrations manuelles
- Le dossier `Journal` est protégé (ne pas supprimer, ne pas renommer)
- Les dossiers verrouillés (`locked_folder`) : contenu chiffré AES-256 côté serveur
- `insertRef` dans AppContext : ref vers la fonction "insérer dans la note" de l'éditeur

## Fonctionnalité IA multi-fournisseur

- Le panneau IA permet de choisir le fournisseur (`Claude` ou `OpenAI`), le modèle et le nombre de tokens de sortie prédits.
- Les clés attendues dans `.env` sont `ANTHROPIC_API_KEY` pour Claude et `OPENAI_API_KEY` pour OpenAI.
- Le backend expose `GET /api/ai/models` pour la liste des modèles/prix, `POST /api/ai/estimate` pour l'estimation, et `POST /api/ai/generate` pour l'appel réel.
- L'estimation de coût est calculée avec les tokens d'entrée estimés côté serveur et les tokens de sortie prédits par l'utilisateur. Après génération, le coût affiché utilise les tokens réels si le fournisseur les renvoie.
- Les prix sont stockés dans `server/routes/ai.js` en USD par million de tokens input/output. Les mettre à jour quand OpenAI ou Anthropic changent leurs tarifs.
