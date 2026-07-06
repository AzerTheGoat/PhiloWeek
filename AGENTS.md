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
quotes       — id, quote, author, source, notes, tags, created_at, updated_at
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

## Graphes d'idees

- La sidebar permet de creer un `Graphe` en plus d'un fichier `.md` classique.
- Un graphe reste un fichier Markdown standard avec `philoweek_type: graph` dans le frontmatter et un bloc fenced `philoweek-graph` contenant le JSON du graphe.
- Le composant `GraphEditor.jsx` remplace l'editeur Markdown quand le fichier ouvert est un graphe.
- Le graphe permet d'ajouter des cartes `Idee`, `Objectif`, `Question` et `Ressource`, de les deplacer, de modifier leurs details et de creer des liens orientes entre elles.
- L'export Obsidian inclut les graphes comme fichiers `.md`; l'import les recree automatiquement comme fichiers, sans table dediee.
- Ne pas convertir les graphes en table SQLite sans mettre a jour export/import. Le format Markdown est le format de compatibilite.

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

## Déplacement des fichiers et dossiers

- Dans la sidebar, un fichier ou un dossier peut être déplacé par glisser-déposer vers un autre dossier.
- Le dossier `Journal` racine ne doit pas être déplaçable.
- Le backend `PUT /api/files/:id/move` doit refuser les cycles : impossible de déplacer un dossier dans lui-même ou dans un de ses descendants.
- Les dossiers verrouillés ne peuvent pas recevoir de nouveaux fichiers tant qu'ils ne sont pas déverrouillés.

## Vie intérieure : citations et rapport IA

- La vue `Vie` contient une bibliothèque de citations et un générateur de rapport IA par période.
- Les citations sont stockées dans la table `quotes` avec auteur, source, notes et tags.
- Le rapport IA (`POST /api/life/report`) agrège les notes modifiées, citations, idées, ressources, sessions timer et notes vocales sur la durée choisie.
- Le rapport doit rester prudent : hypothèses sur l'état mental, pas de diagnostic médical.
- L'export Obsidian ajoute les citations dans `_PhiloWeek/Citations.md` avec `philoweek_type: quotes`; l'import recrée les citations depuis ce fichier.

## Graphes d'idées

- Les fichiers graphes sont des fichiers `.md` avec `philoweek_type: graph` et un bloc JSON `philoweek-graph`.
- Chaque bloc du graphe peut contenir du Markdown visible directement dans la carte.
- La couleur configurable d'un bloc concerne uniquement son contour, pas son fond.
- La largeur et la hauteur des blocs sont configurables depuis l'inspecteur du graphe.
- Ces réglages sont stockés dans le JSON du fichier graphe pour rester compatibles avec l'export/import Obsidian.

## Questionnaires JSON

- La sidebar permet de creer un `Quiz`, stocke comme fichier `.json`.
- Un questionnaire JSON utilise `philoweek_type: questionnaire`, `version`, `id`, `title`, `description`, `tags` et un tableau `questions`.
- Une question supporte au minimum `id`, `type`, `prompt`, `answer`, `explanation` et `tags`; `type` peut etre `open`, `mcq` ou `true_false`.
- `QuestionnaireEditor.jsx` remplace l'editeur Markdown quand un fichier `.json` est reconnu comme questionnaire.
- L'editeur questionnaire propose les modes `Editer`, `Split` et `Apercu`, plus un bouton de revision random.
- Les resultats de revision sont stockes dans la table `questionnaire_results` avec date, reponse utilisateur, correction attendue et statut juste/faux.
- Le moteur de revision augmente le poids des questions ratees ou peu maitrisees, dans l'esprit d'Anki.
- L'export Obsidian inclut les questionnaires `.json` tels quels et ajoute `_PhiloWeek/QuestionnaireResults.json` pour l'historique; l'import recree les deux.
- Le panneau `Copier` peut ajouter un prompt structure au debut du presse-papier, dont un prompt de creation de questionnaire JSON.

## Experience mobile

- Sous `768px`, l'app doit etre pensee comme une app mobile : barre de navigation fixe en bas, grandes zones tactiles, panneaux Fichiers/IA en tiroirs plein ecran.
- Sur mobile, la sidebar et le panneau IA ne sont pas ouverts par defaut. Ouvrir une note referme automatiquement la sidebar.
- Quand un tiroir mobile est ouvert, ouvrir l'autre le referme pour eviter les superpositions.
- Les vues Editeur, Journal, Timer, Inbox et Vie doivent garder un espace bas compatible avec la barre mobile et les safe areas iOS/Android.
- Les ajustements mobile doivent rester confines aux media queries ou a des conditions `isMobileViewport()` pour ne pas modifier l'UX ordinateur.
