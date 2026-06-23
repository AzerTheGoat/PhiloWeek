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

## Stack technique

- **Backend** : Python FastAPI + SQLite3 (`main.py`, `database.py`, `ai.py`, `export.py`)
- **Frontend** : Vanilla HTML/CSS/JS — pas de framework (`static/`)
- **IA** : Anthropic API, modèle `claude-sonnet-4-6`
- **Config** : clé API dans `.env` → `ANTHROPIC_API_KEY`
- **Lancement** : `.\run.ps1` (Windows) depuis la racine du projet
