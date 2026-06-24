# PhiloWeek — Instructions pour Claude

## Règle absolue : toute nouvelle feature doit être ajoutée au tutoriel

Quand tu implémentes une nouvelle fonctionnalité dans cette application, tu **dois** l'ajouter dans le tableau `Tour.steps` du fichier `static/app.js`.

### Comment ajouter une étape au tutoriel

Le tableau `Tour.steps` se trouve dans `static/app.js`. Chaque étape suit ce format :

```js
{
  target: '#id-ou-selecteur-css', // null si écran centré sans spotlight
  position: 'right',              // 'right' | 'left' | 'bottom' | 'top' | 'center'
  emoji: '🆕',
  title: 'Nom de la feature',
  body: 'Explication claire de ce que fait cette feature et comment l\'utiliser.',
},
```

**Règles de placement :**
- Insère la nouvelle étape **avant l'étape finale** (celle avec `emoji: '🚀'` et `title: 'Vous êtes prêt'`)
- Choisis `position` selon où se trouve l'élément : sidebar → `right`, panneau IA → `left`, header/tabs → `bottom`
- Si l'élément n'existe pas encore au moment du tour (tab caché, etc.), cible le bouton/tab qui y donne accès

### Exemple concret

Si tu ajoutes un onglet "Mindmap" avec l'id `#tab-mindmap` :

```js
// À insérer avant l'étape 🚀
{
  target: '[data-tab="mindmap"]',
  position: 'bottom',
  emoji: '🗺️',
  title: 'Carte mentale',
  body: 'Visualisez les connexions entre vos idées sous forme de carte mentale. Cliquez sur un nœud pour l\'éditer, glissez pour réorganiser.',
},
```

## Règle absolue : compatibilité entre versions via export/import

L'application évoluera (schéma BDD, nouvelles tables, nouveaux champs). La stratégie de migration entre versions repose **uniquement** sur un export/import JSON complet — pas de scripts de migration SQL.

### Contrat

- Il doit **toujours** exister un bouton "Exporter tout" qui sérialise l'intégralité des données utilisateur en un seul fichier `.json`.
- Il doit **toujours** exister un bouton "Importer" qui recharge ce fichier dans la BDD courante.
- Le format d'export doit être **versionné** : inclure un champ `"version"` (ex. `"1.0"`) à la racine du JSON pour que l'import sache comment interpréter la structure.

### Règles pour chaque nouvelle feature

Quand tu ajoutes une table ou un champ :
1. **Inclure dans l'export** : ajoute les nouvelles données dans la route `/export-all` (ou son équivalent).
2. **Gérer à l'import** : dans la route `/import-all`, lis le champ `version` et adapte le mapping si la structure a changé (champ absent → valeur par défaut, table inexistante → créer à la volée).
3. **Ne jamais casser l'import d'un fichier d'une version antérieure** : tout champ manquant doit avoir un fallback explicite, pas un crash.

### Format minimal attendu

```json
{
  "version": "1.0",
  "sujets": [...],
  "notes": [...],
  "citations": [...],
  "...": "toute nouvelle entité ajoutée ici"
}
```

> **Pourquoi ?** L'utilisateur met à jour l'appli localement (git pull). Son ancienne BDD SQLite reste sur disque avec l'ancien schéma. Le seul filet de sécurité universel est : exporter avant, réinstaller, réimporter.

---

## Stack technique

- **Backend** : Python FastAPI + SQLite3 (`main.py`, `database.py`, `ai.py`, `export.py`)
- **Frontend** : Vanilla HTML/CSS/JS — pas de framework (`static/`)
- **IA** : Anthropic API, modèle `claude-sonnet-4-6`
- **Config** : clé API dans `.env` → `ANTHROPIC_API_KEY`
- **Lancement** : `.\run.ps1` (Windows) depuis la racine du projet
