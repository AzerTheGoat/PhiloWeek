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
│   │   ├── timer.js    ← Sessions de travail
│   │   └── spreadsheets.js ← Import/export XLSX
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
files        — id, parent_id, name, type, content, encrypted_content, is_encrypted, encrypted_folder_id, sort_order, user_id
file_links   — source_id, target_id, link_text  (relations [[wiki-links]])
file_tags    — file_id, tag                      (tags #hashtag + frontmatter)
file_revisions — id, file_id, user_id (proprietaire), actor_user_id, revision_no, content, created_at
file_shares  — id, file_id, owner_id, shared_with_user_id, permission (view/edit), created_at, updated_at
generated_quizzes — source_file_id, quiz_file_id, user_id, created_at, updated_at
timer_sessions — id, file_id, duration_seconds, activity_type, notes, user_id
app_usage_daily — user_id, entry_date, duration_seconds, updated_at
voice_notes  — id, file_id, filename, duration_seconds, title, user_id
quotes       — id, quote, author, source, notes, tags, user_id, created_at, updated_at
fact_checks  — id, claim, status (to_check/true/false/partial), notes, source, tags, user_id
todos        — id, title, notes, status (open/done), due_at, user_id, created_at, updated_at, completed_at
agenda_practices — id, title, color, active, user_id, created_at, updated_at, archived_at
agenda_checks — practice_id, entry_date, done, user_id, updated_at
life_profiles — user_id, birth_date, life_expectancy_years, updated_at
historical_events — id, title, start_label/year/month/day, end_label/year/month/day, description, category, color, image_data, image_caption, tags, user_id
articles     — id, title, excerpt, content, status (draft/published), published_on, published_at, cover_image_data, tags, event_id, user_id, created_at, updated_at
article_comments — id, article_id, body, user_id, created_at, updated_at
article_reactions — article_id, user_id, reaction (like), created_at
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
- Le panneau `Fonctions` reste ouvert quand une action est lancee, pour permettre d'enchainer plusieurs vues ou outils sans le rouvrir.
- Le panneau `Fonctions` regroupe `Creer`, `Vues` et `Outils` avec des libelles explicites : Note, Graphe d'idees, Reseau d'acteurs, Questionnaire, Definitions, Tableur Excel, Journal, Boite a idees, Citations, Taches, Agenda, Vie perso, Focus, Base de liens, Frise historique, Securite, Aide, revision, copie, import/export, theme et compte.
- Le clic droit dans la zone Fichiers, sur un dossier ou sur un fichier, doit proposer tous les types creatables : note, graphe d'idees, reseau d'acteurs, questionnaire, definitions, tableur Excel et dossier quand le contexte le permet.
- Les vues principales ne doivent pas afficher de bouton retour de page dans leur header; la navigation se fait par `Fonctions`, les onglets de fichiers et la navigation mobile.

## Graphes d'idees

- La sidebar permet de creer un `Graphe` en plus d'un fichier `.md` classique.
- Un graphe reste un fichier Markdown standard avec `philoweek_type: graph` dans le frontmatter et un bloc fenced `philoweek-graph` contenant le JSON du graphe.
- Le composant `GraphEditor.jsx` remplace l'editeur Markdown quand le fichier ouvert est un graphe.
- Le graphe permet d'ajouter des cartes `Idee`, `Objectif`, `Question` et `Ressource`, de les deplacer, de modifier leurs details et de creer des liens orientes entre elles.
- L'export Obsidian inclut les graphes comme fichiers `.md`; l'import les recree automatiquement comme fichiers, sans table dediee.
- Ne pas convertir les graphes en table SQLite sans mettre a jour export/import. Le format Markdown est le format de compatibilite.

## Rendu Markdown et Mermaid

- Les blocs fenced `mermaid` des notes Markdown, apercus d'articles, articles publies et liens publics sont rendus en diagrammes par `MarkdownHtml.jsx`.
- Mermaid est charge dynamiquement uniquement lorsqu'un bloc `mermaid` existe. Le rendu utilise `securityLevel: strict`, des limites de taille et de nombre de diagrammes, et suit le theme clair/sombre.
- Un diagramme invalide ne doit jamais casser tout l'apercu : afficher une erreur locale et conserver son code source lisible.
- Le rendu Markdown passe toujours par `sanitizeHtml` avant Mermaid; ne jamais activer `securityLevel: loose` ou autoriser du HTML Mermaid interactif.

## Dossier Journal

- Créé automatiquement à l'init (`/Journal/`)
- Entrées : `YYYY-MM-DD.md`
- Protégé contre la suppression dans `routes/files.js`

## Focus et temps d'utilisation

- La vue `Focus` conserve le chronometre manuel existant et affiche aussi le temps passe dans l'application.
- Le temps d'utilisation est compte automatiquement uniquement lorsque la page est visible et que sa fenetre a le focus; un bail local evite de compter plusieurs onglets du meme navigateur en double.
- Une journee d'utilisation va de 03:00 a 02:59 dans le fuseau local du navigateur. Les cumuls sont stockes par utilisateur et date logique dans `app_usage_daily`.
- Focus affiche un tableau de bord avec aujourd'hui, la semaine en cours, le mois en cours, la moyenne quotidienne du mois, la moyenne hebdomadaire depuis le premier jour suivi et le total. Une courbe bascule entre les 30 derniers jours et les 12 derniers mois; les historiques restent consultables jour par jour et mois par mois.
- L'export Obsidian ajoute `_Opuscule/AppUsage.json` avec `philoweek_type: app_usage`; l'import restaure les cumuls quotidiens sans doubler un historique deja present.

## Thème

- Dark/light via `document.documentElement.setAttribute('data-theme', ...)`
- CSS variables dans `:root` et `[data-theme="light"]` dans `index.css`
- Persisté dans `localStorage` sous la clé `pw-theme`

## Page Sécurité

- La vue `security`, accessible depuis `Fonctions` sous le libelle `Securite`, est rendue par `client/src/components/SecurityPage.jsx` et s'ouvre dans un onglet de vue fermable.
- Elle explique en termes accessibles l'isolation serveur des comptes, les sessions opaques, le nettoyage des contenus, les limites d'import et les protections contre les abus.
- Elle distingue explicitement chiffrement persistant et verrouillage de session : un dossier chiffre reste chiffre dans SQLite meme lorsqu'il est ouvert.
- Elle expose honnetement les limites : metadonnees visibles, ZIP Obsidian en clair, audio et photos hors chiffrement de dossier, absence de recuperation du mot de passe du coffre et risque residuel si le serveur ou une session ouverte sont compromis.
- Toute evolution importante du modele de securite doit etre repercutee dans cette page; ne jamais y promettre une securite absolue ou l'absence de faille.

## Notes importantes pour Codex

- Toutes les routes Express sont **async/await** (db sqlite est asynchrone)
- La DB est initialisée au démarrage via `initDb()`, pas besoin de migrations manuelles
- Le dossier `Journal` est protégé (ne pas supprimer, ne pas renommer)
- `locked_folder` est un ancien format maintenu uniquement pour permettre sa migration; ne pas créer de nouveau dossier dans ce format.
- `insertRef` dans AppContext : ref vers la fonction "insérer dans la note" de l'éditeur

## Fonctionnalites IA

- Les fonctionnalites IA ont ete retirees de l'interface.
- Ne pas ajouter de nouveau panneau IA, appel fournisseur, estimation de cout ou generation automatique sans demande explicite.
- Le recap de semaine/periode passe par le panneau `Copier`, qui met un preprompt dans le presse-papier sans appeler de fournisseur IA.

## Déplacement des fichiers et dossiers

- Dans la sidebar, un fichier ou un dossier peut être déplacé par glisser-déposer vers un autre dossier.
- Supprimer un dossier non vide doit demander une confirmation explicite indiquant que tous ses enfants seront supprimes; le backend refuse aussi la suppression sans `confirm_children=1`.
- Le dossier `Journal` racine ne doit pas être déplaçable.
- Le backend `PUT /api/files/:id/move` doit refuser les cycles : impossible de déplacer un dossier dans lui-même ou dans un de ses descendants.
- Un dossier chiffré fermé dans la session ne peut recevoir aucun nouveau fichier tant qu'il n'est pas ouvert.

## Dossiers chiffrés et verrouillage de session

- Le chiffrement persistant et le verrouillage temporaire sont deux états indépendants. `files.is_encrypted` marque uniquement la racine chiffrée; tous ses descendants portent `encrypted_folder_id`.
- Activer le chiffrement parcourt tout le sous-arbre, y compris la corbeille et `file_revisions`. Le contenu en clair est remplacé par une enveloppe AES-256-GCM; les tags et liens dérivés sont retirés tant que le sous-arbre est chiffré.
- Le compte utilise un seul mot de passe de coffre, distinct du mot de passe de connexion. Il dérive une KEK avec scrypt; chaque dossier possède une FDK aléatoire distincte et chaque contenu une DEK aléatoire distincte.
- Ouvrir un dossier conserve sa FDK uniquement en mémoire pour le couple session+dossier pendant 15 minutes renouvelables. Cela ne réécrit jamais le contenu en clair dans SQLite.
- « Verrouiller maintenant » retire seulement la FDK de la session. « Désactiver le chiffrement » est une autre action qui redemande le mot de passe et réécrit explicitement le sous-arbre en clair.
- L'interface affiche toujours un petit bouclier sur un dossier chiffré; un cadenas fermé indique en plus que le dossier est fermé dans la session.
- Les partages et les déplacements à travers la frontière d'un dossier chiffré sont refusés. Il faut désactiver le chiffrement avant de partager ou de sortir le sous-arbre.
- Changer le mot de passe du coffre réenveloppe les FDK sans rechiffrer toutes les notes, puis ferme tous les dossiers chiffrés du compte.
- L'export Obsidian redemande le mot de passe si nécessaire et produit un ZIP en clair, avec `_Opuscule/EncryptedFolders.json` pour restaurer l'état. L'import redemande le mot de passe et rechiffre ces chemins immédiatement.
- Perdre le mot de passe du coffre rend les dossiers chiffrés irrécupérables. Aucun mot de passe ni clé en clair ne doit être journalisé, stocké en cookie ou dans `localStorage`.

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

- Les vues `Taches`, `Agenda` et `Vie perso` sont trois sections separees dans le panneau `Fonctions`.
- Les tâches sont stockées dans la table `todos` avec titre, notes optionnelles, statut `open/done`, date de création et date limite max `due_at`.
- La section `Agenda` est un vrai calendrier mensuel : chaque jour affiche ses taches dues, ses habitudes du jour et un detail de la journee selectionnee.
- L'Agenda permet aussi de creer des habitudes quotidiennes, de les cocher par jour, de les renommer, de les archiver/reprendre, de les supprimer avec leur historique, et affiche un resume du jour, une moyenne sur 28 jours, une serie actuelle et une grille de rythme type GitHub : les jours n'affichent leurs details qu'au survol, et la couleur fonce selon la part d'habitudes accomplies. L'interface ne propose pas de choix manuel de couleur pour les habitudes.
- Le rappel quotidien des taches s'affiche au plus une fois par jour pour les taches dues aujourd'hui ou en retard, puis ouvre la section `Agenda`.
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

## Réseaux d'acteurs temporels

- La sidebar permet de créer un `Réseau d'acteurs`, stocké comme fichier `.json` avec `philoweek_type: actor_network` et `version: 1`.
- Le fichier contient des nœuds `person`, `organization` et `position`. Les personnes et organisations portent texte, dates clés et plusieurs images; une image peut être un fichier local WebP ou une URL HTTPS avec texte alternatif, légende, crédit, licence, source et intervalle facultatif.
- Les dates biographiques (naissance, décès, fondation, dissolution) restent indépendantes de `active_from/active_to`, qui décrivent seulement la présence pertinente dans le graphe.
- Un nœud `position` reste stable et utilise des `assignments` datés pour afficher automatiquement son titulaire selon l'année sélectionnée.
- Chaque relation orientée contient un libellé, une cause explicative, un intervalle facultatif et une source facultative. Elle s'affiche uniquement si sa période et ses deux extrémités sont actives.
- `ActorNetworkEditor.jsx` fournit un canvas zoomable avec déplacement des cartes, un inspecteur complet, un curseur annuel, un mode JSON de secours et l'historique standard des fichiers.
- Le bouton `Prompt JSON` copie un contrat strict pour un LLM externe sans effectuer aucun appel fournisseur. L'import par fichier ou collage passe par une confirmation séquentielle de chaque nœud, puis par la vérification des relations; une relation retenue sans cause bloque la confirmation.
- Le mode `Mémoriser` présente l'image sans l'identité, varie les portraits, révèle le texte et les dates, puis enregistre `À revoir/Je savais` dans `learning.progress` avec des intervalles de rappel progressifs.
- Les réseaux restent des fichiers JSON standards : aucune table SQLite dédiée ne doit être créée. L'export/import Obsidian les transporte tels quels; ne pas extraire leurs données vers une table sans mettre à jour les deux parcours.
- Sur mobile, l'inspecteur devient un panneau bas et la carte de mémorisation garde ses actions fixes; les changements restent confinés aux media queries sous 768 px.

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
- Dans l'apercu d'un questionnaire, la liaison des notes et le lancement de la revision restent deux boutons compacts, sans cartes de configuration permanentes. `Lier des notes` ouvre la modal de selection; `Commencer une revision` tire directement jusqu'a 12 questions du fichier courant.
- Sous `768px`, tous les parcours de revision (questionnaire, definitions, quiz lie a une note et revision globale) utilisent une carte memoire plein format : la saisie libre est masquee, l'utilisateur reflechit mentalement, affiche la solution, puis choisit `A revoir` ou `Je savais`. Ces deux choix alimentent exactement le meme historique juste/faux et la meme ponderation que sur ordinateur.
- Sur mobile, seule la zone de contenu de la carte de revision defile; `Afficher la solution`, puis `A revoir` et `Je savais`, restent fixes en bas de la carte. La typographie des questions et corrections est compacte pour les ecrans de type iPhone 14.
- Un questionnaire peut etre lie a des notes Markdown avec `source_paths`; ces chemins sont preferes aux IDs pour rester compatibles avec export/import.
- La liaison des fichiers d'un questionnaire se fait via une modal de selection avec recherche, arbre de dossiers, recapitulatif et validation explicite.
- `QuestionnaireEditor.jsx` remplace l'editeur Markdown quand un fichier `.json` est reconnu comme questionnaire.
- L'editeur questionnaire propose les modes `Editer`, `Split` et `Apercu`, plus le bouton compact `Commencer une revision`; il s'ouvre par defaut en `Apercu`.
- Une note Markdown affiche un bouton `Quiz` quand au moins un questionnaire est lie a cette note.
- La sidebar contient un bouton global `Reviser` qui ouvre un panneau de selection de notes Markdown et lance les questions des questionnaires lies a ces notes, independamment du fichier ouvert.
- Pendant une revision globale, le footer affiche seulement `Stop`; l'arret ou la fin de session affiche un score, un mini-rapport et les questions ratees a revoir.
- Une session de quiz lancee depuis un questionnaire ou depuis une note conserve en memoire, par fichier, la serie tiree, la question courante, la reponse saisie et l'etat de correction quand l'utilisateur change d'onglet ou ouvre une vue Fonction; cette memoire est videe a la deconnexion ou au rechargement de l'application.
- Les resultats de revision sont stockes dans la table `questionnaire_results` avec date, reponse utilisateur, correction attendue et statut juste/faux.
- Le moteur de revision augmente le poids des questions ratees ou peu maitrisees, dans l'esprit d'Anki.
- L'export Obsidian inclut les questionnaires `.json` tels quels et ajoute `_Opuscule/QuestionnaireResults.json` pour l'historique; l'import recree les deux.
- Le panneau `Copier` peut ajouter un prompt structure au debut du presse-papier, dont un prompt de creation de questionnaire JSON.
- Le panneau `Copier` contient aussi un bloc `Recap de periode` avec `Copier la derniere semaine` et une periode personnalisable; il copie les notes modifiees dans la periode avec un preprompt de synthese prudent.

## Quiz generes depuis une note Markdown

- Le header de chaque note Markdown editable contient `Creer quiz`; l'action sauvegarde d'abord la note, cree ou retrouve son questionnaire miroir, copie un prompt complet pour un LLM externe et ouvre le fichier JSON cible.
- Le prompt ne fait aucun appel fournisseur. Il exige un JSON Opuscule strict, fonde uniquement sur la note, avec rappel actif, niveaux cognitifs varies, feedback explicatif et distracteurs plausibles. Pour les sujets politiques ou controverses, il distingue faits, jugements normatifs, interpretations et causalites, conserve les attributions et n'invente pas de certitude.
- Chaque question generee doit rester comprehensible seule lors d'un tirage aleatoire plusieurs jours ou mois plus tard. Son `prompt` contient `Contexte :` avec 1 a 3 phrases rappelant la situation concrete et les premisses utiles, puis `Question :`; nommer seulement la source, la notion ou l'exemple ne suffit pas. Le contexte donne assez d'indices pour reconstruire le probleme sans formuler la conclusion demandee et evite les renvois vagues comme `selon le texte`.
- Les quiz automatiques vivent sous le dossier racine `Quiz générés`. Une note `Cours/Politique/Institutions.md` correspond a `Quiz générés/Cours/Politique/Institutions.json`.
- La table `generated_quizzes` conserve le lien stable entre la note et le quiz. Renommer ou deplacer la note, ou l'un de ses dossiers parents, reconstruit le chemin miroir, met a jour `source_paths`, `source_file_ids` et `generated_from`, puis supprime les anciens dossiers miroirs devenus vides.
- Un quiz automatique reste editable dans son contenu mais ne peut pas etre renomme ou deplace manuellement, car son emplacement appartient a la note source.
- L'export Obsidian ajoute `_Opuscule/GeneratedQuizzes.json` avec les chemins source/quiz; l'import remappe les identifiants et reactive la synchronisation des chemins.

## Definitions JSON

- La sidebar permet de creer un fichier `Definitions`, stocke comme `.json` avec `philoweek_type: definitions`.
- Un fichier de definitions contient `title`, `description`, `tags` et un tableau `definitions` avec `term`, `definition`, `example` et `tags`.
- `DefinitionsEditor.jsx` remplace l'editeur Markdown quand un fichier `.json` est reconnu comme fiche de definitions.
- L'editeur permet d'ajouter, modifier et supprimer les mots sans ecrire le JSON a la main, tout en gardant un mode JSON de secours.
- Les definitions passent dans le moteur de revision existant : le mot devient la question, la definition la correction, et l'exemple l'explication.
- Une revision de definitions en cours conserve elle aussi sa progression par fichier pendant la session de l'application.
- Dans le panneau global `Reviser`, selectionner directement un fichier Definitions lance la revision de ses mots; les resultats sont stockes dans `questionnaire_results` comme les quiz.
- Les champs `definition` et `example` acceptent les liens wiki `[[Nom du fichier#Partie|Libelle]]`; `#` choisit la definition ou le titre Markdown cible et `|` choisit le texte affiche. Les liens locaux `[[#Partie|Libelle]]` restent dans le fichier courant. L'ancien format `[[Nom du fichier|Partie]]` reste compatible.
- Une note Markdown peut cibler une definition precise avec `[[Nom de la fiche#Terme|Libelle]]`; la fiche JSON s'ouvre et centre la carte dont le mot correspond a `Terme`.
- La resolution des liens sans extension couvre les fichiers `.md`, `.json` et `.xlsx`. Dans le format explicite, la partie apres `#` est la destination interne et la partie apres `|` est seulement le libelle visible.
- L'export/import Obsidian inclut les fichiers Definitions tels quels, puisqu'ils restent des fichiers `.json` standards.

## Onglets de fichiers

- La zone principale affiche une barre d'onglets pour les fichiers ouverts.
- Ouvrir un fichier depuis la sidebar, la recherche ou une autre vue ajoute/active un onglet, sans dupliquer l'onglet si le fichier est deja ouvert.
- Les onglets supportent les formats affiches par l'editeur central : Markdown, graphes d'idees, reseaux d'acteurs temporels, questionnaires JSON, definitions JSON et tableurs Excel.
- Chaque onglet a un bouton de fermeture; le bouton `...` de la barre propose `Tout fermer`.
- Les onglets ne stockent pas de contenu propre : ils pointent vers l'id du fichier et rechargent le contenu actif via l'API, pour eviter les etats divergents.
- La position de defilement est memorisee en memoire par fichier et par panneau pendant la session : edition, apercu Markdown, questionnaires, definitions, tableurs et lecture seule reprennent a l'endroit quitte lors d'un changement d'onglet. Les graphes gardent leur propre vue persistante.
- Les vues ouvertes depuis le panneau `Fonctions` possedent aussi des onglets fermables dans la meme barre. Quand une vue Fonction est affichee, aucun onglet de fichier ne doit rester marque actif; cliquer un onglet de fichier revient a l'editeur.

## Frise historique

- La vue `Frise` est accessible depuis la sidebar et la navigation mobile.
- Elle est commune a tous les comptes : chaque utilisateur voit tous les reperes de `historical_events`, mais ne peut modifier ou supprimer que ses propres cartes (`can_edit` renvoye par l'API).
- Elle stocke les reperes historiques dans `historical_events`, avec dates ponctuelles ou periodes (`start_*` et `end_*`), description, categorie, couleur, tags et photo optionnelle en data URL.
- Les tags sont visibles sur les cartes et servent de filtres : selectionner un ou plusieurs tags affiche les reperes qui correspondent a au moins l'un des tags actifs.
- Les dates acceptent au minimum une annee (`1789`, `-44`) et peuvent inclure mois/jour (`1789-07-14`).
- Le formulaire de frise saisit les dates avec champs separes annee/mois/jour pour eviter de forcer l'utilisateur a taper le format ISO.
- L'interface affiche une frise horizontale zoomable avec navigation par focus, mini-carte et placement automatique en lignes pour gerer les periodes qui se superposent.
- A fort zoom, l'axe affiche une granularite mensuelle; les evenements proches sont empiles a faible zoom et se depilent automatiquement quand le zoom les espace assez.
- Les photos locales sont compressees cote client avant stockage. Une carte accepte aussi une URL HTTPS directe, normalisee comme les images d'article et rendue avec `referrerPolicy: no-referrer`; l'hote distant voit encore l'IP du lecteur.
- La frise peut importer un JSON de reperes depuis l'interface : le fichier peut etre un tableau ou un objet avec `events`, `historical_events` ou `timeline`; `image_data` venant du JSON est ignore, puis chaque repere passe par une interface de confirmation ou l'utilisateur peut corriger les champs, decocher un repere et ajouter une image avant creation.
- La frise propose aussi un bouton de copie de prompt JSON; le prompt doit demander tous les champs utiles (`title`, `start`, `end`, `category`, `color`, `description`, `image_caption`, `tags`) sans texte long, et jamais `image_data`.
- L'export Obsidian ajoute `_Opuscule/HistoricalTimeline.json` avec `philoweek_type: historical_timeline`; l'import recree les reperes.

## Journal public et articles sociaux

- La vue `Journal public` est accessible depuis le panneau `Fonctions` et la navigation mobile sous `Articles`.
- Les articles sont stockes dans `articles` avec un statut `draft` ou `published`; seuls les articles publies sont lisibles par tous les comptes.
- Un brouillon reste visible seulement par son auteur dans l'onglet `Mes articles`.
- Chaque article affiche son auteur (`users.username`), sa date de journal (`published_on`), ses tags, son accroche, son contenu Markdown et une image de couverture optionnelle.
- Les couvertures et images Markdown d'article peuvent utiliser une URL HTTPS. Le rendu ajoute `referrerPolicy: no-referrer`, mais l'hote de l'image voit encore l'IP du lecteur; le tutoriel et la page Securite doivent recommander un fichier local pour les contenus sensibles.
- Chaque article publie dispose d'un lien public `/articles/:id` copiable depuis l'interface; ce lien est lisible sans compte mais ne permet aucune action (pas de like, commentaire, edition ou suppression) et ne donne jamais acces aux brouillons.
- Un article peut etre lie a une carte de la frise via `articles.event_id`; la frise affiche alors les articles publies associes au repere et permet de les ouvrir dans le journal public.
- Le journal public propose un onglet `Aujourd hui` pour l'article du jour, un `Fil` commun et `Mes articles` pour retrouver ses publications et brouillons.
- Les interactions sociales sont stockees dans `article_reactions` (like par utilisateur) et `article_comments`; un auteur peut supprimer les commentaires sous ses articles, et chaque utilisateur peut supprimer ses propres commentaires.
- Les routes du journal public sont regroupees dans `server/routes/socialJournal.js`; elles doivent garder la lecture publique des articles publies mais filtrer toute modification par `req.user.id`.
- L'export Obsidian ajoute `_Opuscule/SocialJournal.json` avec `philoweek_type: social_journal`; l'import recrée les articles du compte courant, ses commentaires, ses likes et conserve les liens vers la frise quand le repere existe.

## Experience mobile

- Sous `768px`, l'app doit etre pensee comme une app mobile : barre de navigation fixe en bas, grandes zones tactiles, panneaux Fichiers en tiroirs plein ecran.
- La barre de navigation mobile contient uniquement quatre acces : `Fichiers`, `Fonctions`, `Articles` et `Reviser`. `Fichiers` ouvre l'arbre; `Fonctions` ouvre directement le panneau des fonctionnalites.
- Sur mobile, la sidebar n'est pas ouverte par defaut. Ouvrir une note referme automatiquement la sidebar.
- Quand un tiroir mobile est ouvert, ouvrir l'autre le referme pour eviter les superpositions.
- Les vues Editeur, Journal, Timer, Inbox, Todo et Vie doivent garder un espace bas compatible avec la barre mobile et les safe areas iOS/Android.
- Les ajustements mobile doivent rester confines aux media queries ou a des conditions `isMobileViewport()` pour ne pas modifier l'UX ordinateur.
- Toute carte de revision mobile doit faire defiler verticalement sa zone de contenu lorsque la question, la correction ou l'explication depasse la hauteur disponible; les actions restent fixes et ne doivent jamais etre coupees.

## Historique des fichiers et corbeille

- Chaque fichier edite par l'application (note Markdown, graphe d'idees, reseau d'acteurs temporel, questionnaire JSON, definitions JSON et tableur Excel) garde un historique persistant de ses sauvegardes logiques.
- Les boutons Annuler/Retablir sont disponibles dans le header de chaque editeur; les raccourcis sont `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` et `Ctrl/Cmd+Y`.
- Une nouvelle modification apres une annulation efface la branche de retablissement; les 100 versions les plus recentes sont conservees par fichier.
- Activer le chiffrement chiffre aussi toutes les revisions existantes et futures; ouvrir ou verrouiller la session ne supprime pas cet historique.
- Supprimer un fichier ou un dossier le place dans la corbeille avec tout son sous-arbre. Les elements restent restaurables pendant 30 jours, puis sont purges automatiquement.
- La vue `Corbeille` permet de restaurer, supprimer definitivement un element ou vider toute la corbeille apres confirmation explicite.
- L'export Obsidian ajoute `_Opuscule/FileHistory.json` et `_Opuscule/Trash.json`; l'import restaure l'historique et la corbeille en remappant les identifiants de fichiers.

## Partage cloud entre utilisateurs

- Un fichier ou dossier appartient toujours a un proprietaire (`files.user_id`). Le partage donne acces a la meme donnee, sans creer de copie.
- Le partage se fait avec le `username` exact d'un compte existant et un droit `view` (lecture seule) ou `edit` (modification du contenu).
- Partager un dossier partage tout son sous-arbre actuel et futur. Les droits sont herites; en cas de partages imbriques, le droit le plus permissif s'applique.
- Un collaborateur `edit` peut modifier les fichiers et creer dans un dossier partage. Seul le proprietaire peut renommer, deplacer, supprimer, chiffrer ou repartager.
- Les fichiers partages apparaissent comme racines dediees dans l'arbre avec le nom du proprietaire et un badge cloud. Un retrait de partage les fait disparaitre au prochain rafraichissement cloud.
- `files.content_version` est un verrou optimiste obligatoire pour toute sauvegarde de contenu et tout undo/redo. Une version obsolete renvoie `FILE_VERSION_CONFLICT`; le client propose explicitement de charger le cloud ou de conserver sa version.
- Meme apres le choix de conserver la version locale, le serveur revérifie la version courante : une troisieme modification concurrente provoque un nouveau conflit au lieu d'etre ecrasee.
- La presence collaborative est un heartbeat ephemere de 45 secondes; elle n'accorde aucun droit et ne remplace jamais les controles d'acces serveur.
- L'export Obsidian ajoute `_Opuscule/Shares.json` avec les usernames et permissions. A l'import, seuls les comptes qui existent deja sur l'instance sont reconnectes.

## Carnet de voyage et import de traces conseilles

- Le Carnet de voyage permet de copier un prompt complet, de definir un trajet avec un LLM externe, puis d'importer sa reponse; l'application ne fait aucun appel IA et ne transmet aucune donnee a un fournisseur.
- Le prompt impose trois phases : collecte du depart et de l'arrivee avec dates/heures, voyageurs, velos, bagages et budget; comparaison de 3 a 5 transports avec prix du groupe et conditions velo; puis generation du JSON uniquement apres le choix explicite de l'utilisateur.
- Le JSON v2 peut conserver `departure`, `arrival`, `transport_options` et `selected_transport` dans `road_trips.plan_json`; aucun champ SQLite supplementaire n'est necessaire. L'affichage du plan montre l'horaire et le transport retenu, tandis que les alternatives restent consultables.
- Le format importe utilise `philoweek_type: road_trip_plan`, `version: 1` et un objet `trip`; il separe les etapes (`points`), la geometrie detaillee optionnelle (`track`), les segments, les jours, les lieux utiles, les informations pratiques, la checklist, les sources et les hypotheses.
- L'import se fait en deux temps : `POST /api/roadtrips/import-plan/preview` valide et resume sans ecrire, puis `POST /api/roadtrips/import-plan` cree le voyage et ses lieux en une transaction.
- `road_trips.plan_json` conserve le plan structure. `road_trip_notes.category` et `road_trip_notes.details_json` conservent les lieux utiles et leurs metadonnees (adresse, horaires, prix, source, date de verification, confiance, avertissements, ravitaillement).
- Les categories supportees sont `food`, `water`, `supplies`, `fuel`, `charging`, `sleep`, `medical`, `parking`, `transport`, `visit`, `activity`, `viewpoint`, `warning`, `practical` et `other`; elles servent au filtrage dans la fiche du voyage.
- Un voyage conseille separe son affichage en trois onglets : `Plan` (feuille de route, jours, segments, conseils et checklist), `Lieux` (adresses et points pratiques categorises) et `Modifier` (champs d'edition, etapes, photos et recit). `Plan` est l'onglet initial d'un trajet prevu importe.
- Une information volatile sans `source_url` ou `verified_on` doit etre signalee dans l'apercu. Le prompt demande au LLM de laisser `null` plutot que d'inventer et rappelle que securite, meteo, frontieres, fermetures et horaires doivent etre verifies avant le depart.
- Si `track` contient au moins deux coordonnees, il dessine la route et alimente le GeoJSON; sinon la carte relie les etapes par des lignes droites.
- L'export Obsidian `_Opuscule/RoadTrips.json` conserve `plan_json`, `category` et `details_json`; l'import les restaure et reste compatible avec les sauvegardes v1 sans ces champs.

## Tableurs Excel

- La sidebar et tous les menus contextuels permettent de creer un `Tableur Excel`; son nom visible se termine par `.xlsx`.
- Dans SQLite et dans l'historique logique, le contenu reste un JSON texte avec `philoweek_type: spreadsheet`, `version`, `title`, `locale` et un tableau `sheets`. Chaque feuille garde ses dimensions, cellules, styles, largeurs/hauteurs, volets figes, fusions, filtres, validations, regles conditionnelles et graphiques.
- `SpreadsheetEditor.jsx` remplace l'editeur Markdown pour ces fichiers. Son interface est organisee comme Google Sheets avec les menus Fichier, Edition, Affichage, Insertion, Format, Donnees, Feuille et Aide, plus une barre de mise en forme rapide.
- La grille gere la selection de cellules, lignes, colonnes ou de toute la feuille, le redimensionnement par glisser-deposer, l'ajustement automatique des colonnes, le zoom, le quadrillage, les volets figes, le couper/copier/coller, le collage des valeurs seules et la recopie de plages avec traduction des references relatives/absolues.
- La mise en forme couvre gras, italique, souligne, barre, taille, alignements horizontal/vertical, renvoi a la ligne, couleurs, bordures, fusions et formats nombre/euro/pourcentage/date. Les cellules peuvent garder une note et une validation sous forme de liste deroulante.
- Les outils de donnees comprennent recherche/remplacement, tri selon la colonne active, filtres multi-colonnes, mise en forme conditionnelle et statistiques de selection. Les graphiques en barres, courbes ou secteurs sont calcules depuis une plage avec en-tetes et stockes dans le classeur.
- Les feuilles peuvent etre ajoutees, renommees, dupliquees, supprimees et reordonnees. La feuille active peut etre importee/exportee en CSV, en plus du classeur XLSX complet.
- Le moteur de formules cote client est un parseur sans `eval`. En plus des references/plages et operateurs, il couvre les familles somme/moyenne/min/max/comptage, logique, arrondi/maths, concatenation/texte, date du jour et criteres `COUNTIF/NB.SI` et `SUMIF/SOMME.SI`.
- Les cycles et erreurs de references sont affiches comme erreurs de formule; une plage de formule est limitee a 10 000 cellules. Un classeur est limite a 20 feuilles, 2 000 lignes, 200 colonnes et 100 000 cellules renseignees cote serveur.
- La creation peut importer un vrai fichier `.xlsx`. `server/routes/spreadsheets.js` convertit ce binaire vers le JSON interne avec une limite de 25 Mo et conserve valeurs, formules, feuilles, dimensions, styles, fusions, notes, validations et filtre automatique.
- Le bouton `XLSX` reconvertit le JSON en classeur Office Open XML. L'export ZIP Obsidian place egalement un vrai binaire `.xlsx` et ajoute `_Opuscule/SpreadsheetMetadata.json` pour restaurer les fonctions internes que le format XLSX ne preserve pas via ExcelJS, notamment graphiques et regles de filtre/format conditionnel.
- Les tableurs passent par le meme `saveFile`, `content_version`, historique undo/redo, partage view/edit, presence cloud, chiffrement de dossier et corbeille que les autres fichiers; aucune route tableur ne contourne `requireFileAccess`.

## Apercu au survol des liens wiki

- Dans l'apercu Markdown et dans les liens affiches par l'editeur de definitions, survoler un lien wiki resolu affiche une carte pres du pointeur sans ouvrir le fichier.
- Pour `[[Fiche de definitions#Terme|Libelle]]`, la carte affiche le terme, sa definition et son exemple ou sa nuance. Pour `[[Note#Titre|Libelle]]`, elle affiche le contenu de la section Markdown visee; sans partie, elle montre un extrait du fichier.
- La syntaxe suit `[[Fichier#Partie|Libelle]]` : `#` determine la destination interne et `|` seulement l'affichage quand `#` est present. `[[#Partie|Libelle]]` vise le fichier courant. L'ancien `[[Fichier|Partie]]` conserve son comportement historique de destination et de libelle.
- Les questionnaires, reseaux d'acteurs et tableurs affichent un resume adapte a leur format. Un lien non resolu ne declenche aucune requete ni carte.
- Le contenu est charge uniquement a la demande via la route de fichier deja protegee par les droits d'acces, puis garde dans un cache client court. La carte rend uniquement du texte, jamais le HTML brut du fichier.
- Le clic conserve son comportement d'ouverture et de centrage. Les liens de l'apercu Markdown sont aussi accessibles au clavier avec Tab puis Entree ou Espace.
