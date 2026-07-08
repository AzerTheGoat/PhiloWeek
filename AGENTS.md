# Opuscule v2 (PhiloWeek) — Instructions pour Codex

## Stack technique

- **Backend** : Node.js/Express + SQLite (via `sqlite` + `sqlite3`)
- **Frontend** : React 18 + Vite (vanilla CSS, pas de framework UI)
- **IA** : aucune fonctionnalite IA active dans l'interface
- **Config** : pas de cle IA requise pour les fonctionnalites actuelles
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
quotes       — id, quote, author, source, notes, tags, user_id, created_at, updated_at
fact_checks  — id, claim, status (to_check/true/false/partial), notes, source, tags, user_id
todos        — id, title, notes, status (open/done), due_at, user_id, created_at, updated_at, completed_at
agenda_practices — id, title, color, active, user_id, created_at, updated_at, archived_at
agenda_checks — practice_id, entry_date, done, user_id, updated_at
life_profiles — user_id, birth_date, life_expectancy_years, updated_at
app_snapshots — id, user_id, created_at, reason, data_json
historical_events — id, title, start_label/year/month/day, end_label/year/month/day, description, category, color, image_data, image_caption, tags, user_id
users        — id, username (unique, insensible à la casse), password_hash
sessions     — id, user_id, token_hash, expires_at, user_agent
```

Toutes les tables de contenu ont une colonne `user_id` : chaque requête dans
`server/routes/*.js` doit filtrer dessus (middleware `requireAuth` pose
`req.user.id`, voir `server/auth/`).

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

## Navigation et panneau Fonctionnalites

- La sidebar garde l'arbre de fichiers comme surface principale.
- Les actions permanentes de gauche sont regroupees dans le panneau `Fonctions`, ouvert depuis le bouton du header de la sidebar.
- Le panneau `Fonctions` regroupe `Creer`, `Vues` et `Outils` : creation de fichiers/graphes/quiz/dossiers, navigation Journal/Idees/Vie/Todo/Timer/Base/Frise/Guide, revision, copie, import/export, theme et compte.

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

## Fonctionnalites IA

- Les fonctionnalites IA ont ete retirees de l'interface.
- Ne pas ajouter de nouveau panneau IA, appel fournisseur, estimation de cout ou generation automatique sans demande explicite.
- Le recap de semaine/periode passe par le panneau `Copier`, qui met un preprompt dans le presse-papier sans appeler de fournisseur IA.

## Déplacement des fichiers et dossiers

- Dans la sidebar, un fichier ou un dossier peut être déplacé par glisser-déposer vers un autre dossier.
- Le dossier `Journal` racine ne doit pas être déplaçable.
- Le backend `PUT /api/files/:id/move` doit refuser les cycles : impossible de déplacer un dossier dans lui-même ou dans un de ses descendants.
- Les dossiers verrouillés ne peuvent pas recevoir de nouveaux fichiers tant qu'ils ne sont pas déverrouillés.

## Vie intérieure : citations

- La vue `Vie` contient une bibliothèque de citations.
- Les citations sont stockées dans la table `quotes` avec auteur, source, notes et tags.
- L'export Obsidian ajoute les citations dans `_Opuscule/Citations.md` avec `philoweek_type: quotes`; l'import recrée les citations depuis ce fichier.

## Vie intérieure : Fact Check

- Deuxième section de la vue `Vie`, à côté des citations (`client/src/components/LifePage.jsx`).
- Sert à noter une idée reçue pas encore vérifiée (`claim`), avec une source optionnelle, des notes et des tags — sans bloquer sur la vérification immédiate.
- Stockées dans la table `fact_checks` avec un `status` : `to_check` (par défaut), `true`, `false`, `partial`. Le statut se change directement depuis la carte (select inline), pas besoin de rouvrir un formulaire.
- L'export Obsidian ajoute les entrées dans `_Opuscule/FactChecks.md` avec `philoweek_type: fact_checks` (même format bloc-quote que les citations, plus une ligne `Statut:`); l'import recrée les entrées et remappe le libellé du statut vers sa valeur (`A verifier` → `to_check`, etc.).

## Todo

- Les vues `Todo`, `Agenda` et `Vie perso` sont trois sections separees dans le panneau `Fonctions`.
- Les tâches sont stockées dans la table `todos` avec titre, notes optionnelles, statut `open/done`, date de création et date limite max `due_at`.
- La section `Agenda` permet de creer des pratiques quotidiennes, de les cocher par jour, de les archiver/reprendre, et affiche un resume du jour, une moyenne sur 28 jours, une serie actuelle et une grille de rythme.
- La section `Vie perso` stocke la date de naissance et l'horizon de vie dans `life_profiles`, puis affiche une grille en semaines ou en mois avec les points deja vecus.
- À l'entrée dans l'application, `TodoReminder.jsx` affiche au maximum une fois par jour les tâches ouvertes avec leurs dates limites; l'état quotidien est gardé dans `localStorage`.
- L'export Obsidian ajoute `_Opuscule/Todos.json` avec `philoweek_type: todos`; l'import recrée les tâches depuis ce fichier.
- L'export Obsidian ajoute aussi `_Opuscule/Dashboard.json` avec `philoweek_type: dashboard` pour les pratiques, coches d'agenda et le profil de vie; l'import recrée ces données.

## Graphes d'idées

- Les fichiers graphes sont des fichiers `.md` avec `philoweek_type: graph` et un bloc JSON `philoweek-graph`.
- Chaque bloc du graphe peut contenir du Markdown visible directement dans la carte.
- Un bloc du graphe peut aussi rester sans contenu Markdown : dans ce cas la carte affiche seulement son titre, sans placeholder.
- Le canvas du graphe ajoute une grande marge visuelle autour des cartes pour permettre de naviguer et de deplacer les blocs au-dela de leur groupe initial.
- La couleur configurable d'un bloc concerne uniquement son contour, pas son fond.
- La largeur et la hauteur des blocs sont configurables depuis l'inspecteur du graphe.
- La creation d'un lien sortant se fait via une recherche textuelle de la carte cible, pas via une liste complete de tous les titres.
- Ces réglages sont stockés dans le JSON du fichier graphe pour rester compatibles avec l'export/import Obsidian.

## Graphe de la base

- La vue `Graphe de la base` est accessible depuis la sidebar avec le bouton `Base` et affiche tous les fichiers lisibles comme noeuds.
- Les liens affiches viennent des `[[wiki-links]]` stockes dans `file_links` et des questionnaires JSON via `source_paths`.
- Cette vue ne cree pas de table dediee : elle reconstruit le reseau depuis les fichiers existants pour rester compatible avec l'export/import Obsidian.
- Cliquer sur un noeud ouvre un inspecteur avec les appels entrants : fichiers qui contiennent le lien wiki vers ce noeud, plus questionnaires qui l'utilisent comme source.
- Les appels wiki affichent le paragraphe de contexte ou le lien apparait; les appels questionnaire affichent le questionnaire source.
- L'inspecteur permet d'ouvrir le fichier selectionne et de copier tout ce qui est lie au noeud jusqu'a une profondeur choisie, avec les memes familles de preprompts que le panneau `Copier`.

## Questionnaires JSON

- La sidebar permet de creer un `Quiz`, stocke comme fichier `.json`.
- Un questionnaire JSON utilise `philoweek_type: questionnaire`, `version`, `id`, `title`, `description`, `tags` et un tableau `questions`.
- Une question supporte au minimum `id`, `type`, `prompt`, `answer`, `explanation` et `tags`; `type` peut etre `open`, `mcq` ou `true_false`.
- Les revisions restent auto-evaluees par l'utilisateur en `Juste/Faux`; le poids de tirage privilegie les questions avec historique faible, dernier score faux ou erreurs repetees.
- Un questionnaire peut etre lie a des notes Markdown avec `source_paths`; ces chemins sont preferes aux IDs pour rester compatibles avec export/import.
- La liaison des fichiers d'un questionnaire se fait via une modal de selection avec recherche, arbre de dossiers, recapitulatif et validation explicite.
- `QuestionnaireEditor.jsx` remplace l'editeur Markdown quand un fichier `.json` est reconnu comme questionnaire.
- L'editeur questionnaire propose les modes `Editer`, `Split` et `Apercu`, plus un bouton de revision random; il s'ouvre par defaut en `Apercu`.
- Une note Markdown affiche un bouton `Quiz` quand au moins un questionnaire est lie a cette note.
- La sidebar contient un bouton global `Reviser` qui ouvre un panneau de selection de notes Markdown et lance les questions des questionnaires lies a ces notes, independamment du fichier ouvert.
- Pendant une revision globale, le footer affiche seulement `Stop`; l'arret ou la fin de session affiche un score, un mini-rapport et les questions ratees a revoir.
- Les resultats de revision sont stockes dans la table `questionnaire_results` avec date, reponse utilisateur, correction attendue et statut juste/faux.
- Le moteur de revision augmente le poids des questions ratees ou peu maitrisees, dans l'esprit d'Anki.
- L'export Obsidian inclut les questionnaires `.json` tels quels et ajoute `_Opuscule/QuestionnaireResults.json` pour l'historique; l'import recree les deux.
- Le panneau `Copier` peut ajouter un prompt structure au debut du presse-papier, dont un prompt de creation de questionnaire JSON.
- Le panneau `Copier` contient aussi un bloc `Recap de periode` avec `Copier la derniere semaine` et une periode personnalisable; il copie les notes modifiees dans la periode avec un preprompt de synthese prudent.

## Retour en arriere global

- L'application capture des instantanes globaux dans `app_snapshots` pour l'utilisateur connecte.
- La retention garde au plus un instantane par seconde sur les 5 dernieres minutes, puis un par minute jusqu'a 1 heure, puis un par tranche de 5 minutes jusqu'a 24 heures.
- `Ctrl+Z` / `Cmd+Z` est intercepte globalement dans l'app et appelle `POST /api/history/rollback`.
- Si le rollback restaure un fichier supprime ou change l'emplacement d'un fichier/dossier, l'interface demande confirmation; les simples modifications de contenu s'appliquent directement et ouvrent le fichier concerne.
- La restauration remplace les donnees de contenu de l'utilisateur connecte dans une transaction SQLite, sans restaurer les comptes ni les sessions.
- L'export Obsidian ajoute `_Opuscule/History.json` avec `philoweek_type: history`; l'import recree les instantanes disponibles.

## Onglets de fichiers

- La zone principale affiche une barre d'onglets pour les fichiers ouverts.
- Ouvrir un fichier depuis la sidebar, la recherche ou une autre vue ajoute/active un onglet, sans dupliquer l'onglet si le fichier est deja ouvert.
- Les onglets supportent les formats affiches par l'editeur central : Markdown, graphes d'idees et questionnaires JSON.
- Chaque onglet a un bouton de fermeture; le bouton `...` de la barre propose `Tout fermer`.
- Les onglets ne stockent pas de contenu propre : ils pointent vers l'id du fichier et rechargent le contenu actif via l'API, pour eviter les etats divergents.

## Frise historique

- La vue `Frise` est accessible depuis la sidebar et la navigation mobile.
- Elle est commune a tous les comptes : chaque utilisateur voit tous les reperes de `historical_events`, mais ne peut modifier ou supprimer que ses propres cartes (`can_edit` renvoye par l'API).
- Elle stocke les reperes historiques dans `historical_events`, avec dates ponctuelles ou periodes (`start_*` et `end_*`), description, categorie, couleur, tags et photo optionnelle en data URL.
- Les tags sont visibles sur les cartes et servent de filtres : selectionner un ou plusieurs tags affiche les reperes qui correspondent a au moins l'un des tags actifs.
- Les dates acceptent au minimum une annee (`1789`, `-44`) et peuvent inclure mois/jour (`1789-07-14`).
- Le formulaire de frise saisit les dates avec champs separes annee/mois/jour pour eviter de forcer l'utilisateur a taper le format ISO.
- L'interface affiche une frise horizontale zoomable avec navigation par focus, mini-carte et placement automatique en lignes pour gerer les periodes qui se superposent.
- A fort zoom, l'axe affiche une granularite mensuelle; les evenements proches sont empiles a faible zoom et se depilent automatiquement quand le zoom les espace assez.
- Les photos sont compressees cote client avant stockage pour rester exportables avec le reste des donnees.
- L'export Obsidian ajoute `_Opuscule/HistoricalTimeline.json` avec `philoweek_type: historical_timeline`; l'import recree les reperes.

## Experience mobile

- Sous `768px`, l'app doit etre pensee comme une app mobile : barre de navigation fixe en bas, grandes zones tactiles, panneaux Fichiers en tiroirs plein ecran.
- Sur mobile, la sidebar n'est pas ouverte par defaut. Ouvrir une note referme automatiquement la sidebar.
- Quand un tiroir mobile est ouvert, ouvrir l'autre le referme pour eviter les superpositions.
- Les vues Editeur, Journal, Timer, Inbox, Todo et Vie doivent garder un espace bas compatible avec la barre mobile et les safe areas iOS/Android.
- Les ajustements mobile doivent rester confines aux media queries ou a des conditions `isMobileViewport()` pour ne pas modifier l'UX ordinateur.
