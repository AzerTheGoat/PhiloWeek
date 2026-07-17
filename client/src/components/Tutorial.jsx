import Icon from './Icons'

const SECTIONS = [
  {
    title: 'Explorateur de fichiers',
    items: [
      {
        icon: 'folder',
        title: 'Arborescence & recherche',
        text: "Dossiers et notes s'organisent librement, comme sur un disque. La barre de recherche (en haut de la sidebar) cherche dans les titres ET le contenu des notes.",
      },
      {
        icon: 'edit',
        title: 'Glisser-déposer, renommer',
        text: 'Fais glisser un fichier sur un dossier pour le déplacer. Double-clique sur un nom (ou "Renommer" au clic droit) pour le modifier.',
      },
      {
        icon: 'plus',
        title: 'Clic droit = menu contextuel',
        text: "Clic droit sur un dossier/fichier : nouveau fichier, graphe ou questionnaire ici, renommer, verrouiller, supprimer. Clic droit sur une zone vide : créer à la racine, importer ou exporter.",
      },
      {
        icon: 'close',
        title: 'Dossier verrouillé',
        text: "Protège un dossier avec un mot de passe. Le contenu est chiffré (AES-256) côté serveur — illisible sans le mot de passe, même dans la base de données.",
      },
    ],
  },
  {
    title: "Éditeur de note",
    items: [
      {
        icon: 'pen',
        title: 'Écrire au stylo',
        text: "En mode Éditer, ouvre Stylo pour écrire au stylet ou au doigt. Tu peux gommer, annuler, faire reconnaître le français localement puis corriger le texte avant de l'insérer à l'emplacement du curseur. Le moteur est gratuit, privé et ne contacte aucune API.",
      },
      {
        icon: 'edit',
        title: 'Trois vues : Éditer / Split / Aperçu',
        text: "Bascule entre écriture pure, vue partagée, ou aperçu Markdown rendu. Le mode par défaut à l'ouverture est l'Aperçu.",
      },
      {
        icon: 'graph',
        title: 'Liens [[wiki]] et #tags',
        text: "Tape [[ dans une note pour lier une autre note (autocomplete). Les #tags dans le texte ou le frontmatter YAML sont indexés automatiquement.",
      },
      {
        icon: 'download',
        title: 'Sauvegarde automatique',
        text: "Chaque modification est enregistrée ~800ms après la dernière frappe. Ctrl+S force une sauvegarde immédiate.",
      },
      {
        icon: 'upload',
        title: 'Coller une image',
        text: 'Colle une image directement dans le texte (Ctrl+V) : elle est compressée en WebP et intégrée en base64 dans la note.',
      },
    ],
  },
  {
    title: 'Graphe visuel',
    items: [
      {
        icon: 'graph',
        title: 'Graphe de la base',
        text: "Le bouton Base affiche tous les fichiers, questionnaires et graphes comme un reseau navigable. Clique un noeud pour voir les fichiers qui l'appellent, avec le paragraphe de contexte.",
      },
      {
        icon: 'copy',
        title: "Copier autour d'un noeud",
        text: "Depuis le graphe de la base, choisis une profondeur et un preprompt pour copier le fichier selectionne avec tout ce qui lui est lie.",
      },
      {
        icon: 'graph',
        title: 'Cartes & liens typés',
        text: "Crée des cartes (Idée, Objectif, Question, Ressource), avec ou sans contenu Markdown sous le titre, puis relie-les avec des liens typés. La surface garde une grande marge autour des cartes pour pouvoir respirer et déplacer librement.",
      },
      {
        icon: 'graph',
        title: 'Flèches & texte sur les liens',
        text: "Choisis le style de chaque lien (flèche simple, flèche double, ou sans flèche), cherche la carte cible par son titre ou son contenu, puis ajoute un texte optionnel le long du trait.",
      },
      {
        icon: 'copy',
        title: 'Sélection multiple',
        text: 'Shift+clic ajoute une carte à la sélection. Un cliqué-glissé sur le fond dessine un rectangle qui sélectionne toutes les cartes à l\'intérieur.',
      },
      {
        icon: 'close',
        title: 'Dupliquer / Supprimer / Détacher',
        text: "Touche Suppr pour effacer la sélection. Clic droit sur une carte : dupliquer, détacher ses liens, ou supprimer — agit sur tout le groupe si plusieurs cartes sont sélectionnées.",
      },
      {
        icon: 'graph',
        title: 'Vue mémorisée & création dans le champ',
        text: "Chaque graphe retient ton zoom et ta position de vue : en le rouvrant, tu reviens exactement où tu l'avais laissé. Et un nouveau bloc apparaît au centre de la zone visible (avec un léger décalage pour ne pas empiler), plus jamais à une position fixe hors écran.",
      },
    ],
  },
  {
    title: 'Questionnaires & révision',
    items: [
      {
        icon: 'question',
        title: 'Créer un questionnaire',
        text: "Un questionnaire est un fichier JSON de questions (ouvertes ou à choix multiples) avec réponses et explications. Il s'ouvre directement en Aperçu pour réviser sans bruit.",
      },
      {
        icon: 'thought',
        title: 'Lier des notes sources',
        text: "Dans l'éditeur de questionnaire, le panneau \"Fichiers liés\" associe chaque question à la note dont elle provient — utile pour cibler tes révisions plus tard.",
      },
      {
        icon: 'play',
        title: 'Réviser',
        text: "Sélectionne des notes sources, choisis un nombre de questions, et lance une session : les questions liées sont piochées au hasard, tes réponses sont notées et gardées en historique.",
      },
    ],
  },
  {
    title: 'Journal & Timer',
    items: [
      {
        icon: 'journal',
        title: 'Journal quotidien',
        text: "Le bouton \"Journal d'aujourd'hui\" crée (à la demande, pas par défaut) le dossier Journal et l'entrée du jour. Le calendrier permet de naviguer et revenir sur d'anciennes entrées.",
      },
      {
        icon: 'timer',
        title: 'Timer de travail',
        text: 'Chronomètre tes sessions par activité (lecture, visionnage, écriture, réflexion) et consulte tes totaux du jour et l\'historique complet.',
      },
      {
        icon: 'listCheck',
        title: 'Taches, Agenda, Vie perso',
        text: "Les taches, les habitudes quotidiennes et la grille de vie sont separees. L'Agenda permet de cocher, renommer, archiver ou supprimer tes habitudes.",
      },
    ],
  },
  {
    title: 'Nid à idées & Vie intérieure',
    items: [
      {
        icon: 'idea',
        title: 'Ressources & idées rapides',
        text: "Capture une URL à lire/voir plus tard (avec statut), ou une idée/question au vol avec des #tags — sans avoir à créer un fichier.",
      },
      {
        icon: 'life',
        title: 'Citations',
        text: "Vie intérieure garde tes citations favorites avec auteur, source, notes personnelles et tags.",
      },
      {
        icon: 'quote',
        title: "Citation à l'accueil",
        text: "À chaque ouverture de l'écran d'accueil, une de tes citations s'affiche. Le tirage parcourt toute ta collection sans répétition avant de recommencer un cycle (jamais deux fois la même d'affilée). Le bouton ↻ en tire une autre.",
      },
      {
        icon: 'alert',
        title: 'Fact Check',
        text: "Note une idée reçue que tu n'as pas encore vérifiée, avec sa source. Change son statut (à vérifier / vrai / faux / partiellement vrai) le jour où tu prends le temps de creuser.",
      },
    ],
  },
  {
    title: 'Frise historique',
    items: [
      {
        icon: 'timeline',
        title: 'Repères sur une frise',
        text: "Place des dates et périodes sur une frise pannable. Filtre par thème (#tags), zoome, et relie un repère à un article du journal public.",
      },
      {
        icon: 'upload',
        title: 'Importer un JSON',
        text: "Ajoute des repères en masse depuis un JSON : « Import JSON » depuis un fichier, ou « Coller JSON » pour coller le texte directement (ex : sortie d'un LLM via le bouton Prompt JSON). Tu confirmes chaque repère avant l'ajout.",
      },
      {
        icon: 'link',
        title: 'Image : fichier ou lien',
        text: "Pour l'image d'un repère (comme pour la couverture d'un article), choisis un fichier local OU « Coller un lien » pour utiliser directement l'URL d'une image trouvée sur internet.",
      },
    ],
  },
  {
    title: 'Journal public',
    items: [
      {
        icon: 'newspaper',
        title: 'Accès rapide',
        text: "Le journal public rassemble les articles publiés par tous les comptes. Ouvre-le d'un clic via l'icône journal en haut de la barre latérale, ou dans Fonctions › Vues.",
      },
      {
        icon: 'edit',
        title: 'Écrire un article',
        text: "Rédige en Markdown, ajoute une accroche, des tags, une image de couverture et un lien vers une carte de la frise. Publie-le ou garde-le en brouillon. « Copier le lien » génère une URL publique, lisible même sans compte.",
      },
      {
        icon: 'eye',
        title: 'Lu / non lu & lecteurs',
        text: "Un point bleu marque les articles que tu n'as pas encore lus, un « Lu » ceux que tu as parcourus. Chaque article affiche son nombre de lecteurs uniques — une lecture est comptée après un vrai temps de lecture (pas un simple clic), y compris les visiteurs anonymes du lien public.",
      },
    ],
  },
  {
    title: 'Partage & sauvegarde',
    items: [
      {
        icon: 'copy',
        title: 'Copier plusieurs notes',
        text: "Sélectionne des notes et copie leur contenu combiné dans le presse-papiers, avec un prompt prêt à coller ailleurs (ex : générer un questionnaire JSON).",
      },
      {
        icon: 'copy',
        title: 'Récap de période',
        text: "Dans Copier, utilise Dernière semaine ou une période personnalisée pour copier les notes modifiées avec un preprompt de récapitulatif.",
      },
      {
        icon: 'download',
        title: 'Export Obsidian (.zip)',
        text: 'Télécharge toutes tes notes en ZIP, compatible Obsidian, avec frontmatter YAML. C\'est ton filet de sécurité manuel.',
      },
      {
        icon: 'upload',
        title: 'Import (.zip)',
        text: 'Réintègre un export précédent (ou un vault Obsidian) : les fichiers, dossiers et liens [[wiki]] sont reconstruits.',
      },
    ],
  },
  {
    title: 'Compte',
    items: [
      {
        icon: 'close',
        title: 'Ton espace est privé',
        text: "Chaque compte a son propre coffre : notes, journal, timer, notes vocales, idées et citations ne sont visibles que par toi.",
      },
      {
        icon: 'edit',
        title: 'Changer de mot de passe',
        text: "Depuis le bouton Compte de la barre latérale, renseigne ton mot de passe actuel puis le nouveau. Il n'y a pas de récupération par e-mail : garde-le en lieu sûr.",
      },
    ],
  },
]

export default function Tutorial() {
  return (
    <div className="tutorial-view">
      <div className="tutorial-header">
        <h2>Découvrir Opuscule</h2>
      </div>

      <p className="tutorial-intro">
        Survole (ou touche) une fonctionnalité pour voir à quoi elle sert.
      </p>

      {SECTIONS.map(section => (
        <div key={section.title} className="tutorial-section">
          <h3>{section.title}</h3>
          <div className="tutorial-grid">
            {section.items.map(item => (
              <TutorialCard key={item.title} {...item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function TutorialCard({ icon, title, text }) {
  return (
    <div className="tutorial-card" tabIndex={0}>
      <div className="tutorial-card-head">
        <span className="tutorial-card-icon"><Icon name={icon} size={18} /></span>
        <strong>{title}</strong>
      </div>
      <p className="tutorial-card-text">{text}</p>
    </div>
  )
}
