import Icon from './Icons'

const SECTIONS = [
  {
    title: 'Explorateur de fichiers',
    items: [
      {
        icon: 'folder',
        title: 'Arborescence & recherche',
        text: "Dossiers et notes s'organisent librement, comme sur un disque. La barre de recherche cherche dans les titres ET le contenu. Sur mobile, la barre basse garde quatre accès : Fichiers, Fonctions, Articles et Réviser.",
      },
      {
        icon: 'edit',
        title: 'Glisser-déposer, renommer',
        text: 'Fais glisser un fichier sur un dossier pour le déplacer. Double-clique sur un nom (ou "Renommer" au clic droit) pour le modifier.',
      },
      {
        icon: 'plus',
        title: 'Clic droit = menu contextuel',
        text: "Clic droit sur un dossier/fichier : nouvelle note, graphe d’idées, réseau d’acteurs, questionnaire, définitions ou tableur Excel ici, puis partager, renommer, chiffrer ou supprimer. Clic droit sur une zone vide : créer à la racine, importer ou exporter.",
      },
      {
        icon: 'close',
        title: 'Chiffrement et verrouillage',
        text: "« Chiffrer » protège récursivement le dossier, ses fichiers et leur historique dans SQLite. Le petit bouclier reste visible même quand le dossier est ouvert. « Verrouiller maintenant » ferme seulement l'accès dans ta session : les données, elles, ne cessent jamais d'être chiffrées. Sans le mot de passe du coffre, elles sont irrécupérables.",
      },
    ],
  },
  {
    title: "Éditeur de note",
    items: [
      {
        icon: 'edit',
        title: 'Trois vues : Éditer / Split / Aperçu',
        text: "Les fichiers existants s'ouvrent en aperçu Markdown. Les nouvelles notes s'ouvrent en Split pour écrire et voir le rendu en même temps.",
      },
      {
        icon: 'file',
        title: 'Reprendre où tu étais',
        text: "Chaque onglet mémorise sa position de lecture et d'édition. Quand tu reviens sur un fichier, il se replace automatiquement à la ligne quittée.",
      },
      {
        icon: 'compass',
        title: 'Fichiers et pages Fonction',
        text: "Les pages ouvertes depuis Fonctions ont aussi leur onglet. L'onglet réellement affiché est le seul marqué actif; ferme une page ou reviens à un fichier depuis la même barre.",
      },
      {
        icon: 'graph',
        title: 'Liens [[wiki]] et #tags',
        text: "Tape [[ dans une note pour lier une autre note (autocomplete). Utilise [[Fichier#Section|Libellé]] pour pointer précisément une section tout en choisissant le texte affiché. Dans l’aperçu, survole le lien pour lire la définition ou l’extrait lié sans quitter la note. Les #tags hors des liens restent indexés automatiquement.",
      },
      {
        icon: 'download',
        title: 'Sauvegarde automatique',
        text: "Chaque modification est enregistrée ~800ms après la dernière frappe. Ctrl+S force une sauvegarde immédiate.",
      },
      {
        icon: 'undo',
        title: 'Annuler & rétablir',
        text: "Les notes, graphes, questionnaires, définitions et tableurs gardent un historique logique. Utilise les boutons du fichier, Ctrl+Z pour annuler et Ctrl+Shift+Z ou Ctrl+Y pour rétablir.",
      },
      {
        icon: 'upload',
        title: 'Coller une image',
        text: 'Colle une image directement dans le texte (Ctrl+V) : elle est compressée en WebP et intégrée en base64 dans la note.',
      },
      {
        icon: 'graph',
        title: 'Diagrammes Mermaid',
        text: 'Écris un bloc de code balisé mermaid dans une note ou un article pour afficher automatiquement un organigramme, une séquence, une chronologie, un Gantt ou un autre diagramme Mermaid. Un diagramme invalide reste visible sous forme de code avec son erreur.',
      },
    ],
  },
  {
    title: 'Tableur Excel',
    items: [
      {
        icon: 'spreadsheet',
        title: 'Créer ou importer un classeur',
        text: "Depuis Fonctions > Créer ou le clic droit, crée un tableur vide ou importe un vrai fichier .xlsx. Le bouton XLSX de l’éditeur télécharge une version ouvrable dans Excel, LibreOffice ou Google Sheets.",
      },
      {
        icon: 'spreadsheet',
        title: 'Une grille proche de Google Sheets',
        text: "Les menus Fichier, Édition, Affichage, Insertion, Format et Données regroupent les actions. Sélectionne une ligne, une colonne ou toute la feuille depuis les en-têtes; redimensionne par glisser-déposer et double-clique une lettre pour ajuster sa largeur.",
      },
      {
        icon: 'edit',
        title: 'Édition, données et présentation',
        text: "Copie, coupe, colle les valeurs seules, recopie une plage, fusionne des cellules, ajoute notes et listes déroulantes. Tu peux trier, filtrer, rechercher/remplacer, appliquer des bordures, du renvoi à la ligne et des règles de couleur conditionnelles.",
      },
      {
        icon: 'graph',
        title: 'Graphiques, feuilles et CSV',
        text: "Crée un graphique en barres, en courbes ou circulaire depuis une plage avec en-têtes. Les feuilles peuvent être ajoutées, renommées, dupliquées, supprimées ou réordonnées; chaque feuille s’importe et s’exporte aussi en CSV.",
      },
      {
        icon: 'edit',
        title: 'Formules et navigation clavier',
        text: "Saisis =A1+B1, =SOMME(A1:A10), SI, NB.SI, SOMME.SI, texte, maths ou dates. Les références absolues avec $ et entre feuilles sont conservées lors des copies. Tab, Entrée, les flèches et Ctrl/Cmd+Z pilotent la grille.",
      },
      {
        icon: 'cloud',
        title: 'Cloud, historique et conflits',
        text: "Les tableurs utilisent le même autosave, la même corbeille de 30 jours, le même partage lecture/modification et la même protection contre les écrasements concurrents que les autres fichiers.",
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
    title: 'Réseau d’acteurs temporel',
    items: [
      {
        icon: 'graph',
        title: 'Personnes, organisations et postes',
        text: "Crée un Réseau d’acteurs depuis Fonctions ou le clic droit. Chaque fichier JSON garde ses personnes, organisations et postes avec texte, dates clés, plusieurs images et relations causales.",
      },
      {
        icon: 'timeline',
        title: 'Le réseau change selon l’année',
        text: "Déplace le curseur d’année : les acteurs et relations hors période disparaissent. Un nœud Poste affiche automatiquement le titulaire correspondant à l’année grâce à ses mandats datés; naissance ou décès restent séparés de la période de pertinence dans le graphe.",
      },
      {
        icon: 'image',
        title: 'Apprendre les visages',
        text: "Ajoute plusieurs portraits pris à des époques ou sous des angles différents, avec légende, crédit, licence et source. Mémoriser masque l’identité, alterne les images, révèle le rôle et les dates, puis propose À revoir ou Je savais.",
      },
      {
        icon: 'upload',
        title: 'Prompt et import contrôlé',
        text: "Prompt JSON copie le contrat complet sans appeler d’IA. Importe ensuite un fichier ou colle le JSON : chaque nœud est confirmé et corrigé séparément, puis chaque relation et sa cause sont vérifiées avant fusion.",
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
        icon: 'copy',
        title: 'Générer depuis une note',
        text: "Dans une note Markdown, « Créer quiz » sauvegarde la note, crée son questionnaire dans le dossier miroir Quiz générés et copie un prompt pédagogique complet. Colle ce prompt dans le LLM de ton choix, puis colle uniquement son JSON dans le quiz déjà ouvert. Chaque question générée commence par un court contexte qui rappelle la situation et ses prémisses, puis pose la question sans livrer la conclusion : elle reste ainsi compréhensible lors d'une révision aléatoire bien plus tard. Le quiz suit automatiquement les renommages et déplacements de la note.",
      },
      {
        icon: 'thought',
        title: 'Lier des notes sources',
        text: "Dans l'éditeur de questionnaire, le panneau \"Fichiers liés\" associe chaque question à la note dont elle provient — utile pour cibler tes révisions plus tard.",
      },
      {
        icon: 'play',
        title: 'Réviser',
        text: "Dans un fichier Quiz, les actions restent compactes : Lier des notes ouvre la sélection et Commencer une révision lance directement les cartes. Sur mobile, seul le texte de la carte défile : Afficher la solution, puis À revoir et Je savais, restent accessibles en bas. Ton auto-évaluation est gardée en historique.",
      },
      {
        icon: 'timer',
        title: 'Reprendre un quiz en cours',
        text: "Tu peux changer d'onglet ou ouvrir une Fonction puis revenir : chaque fichier retrouve sa série, la question en cours, ta réponse saisie et la correction affichée pendant la session de l'application.",
      },
      {
        icon: 'abc',
        title: 'Relier notes et définitions',
        text: "Utilise [[Nom du fichier#Terme|Libellé]] dans une définition ou une note : # indique la définition ou le titre à viser, et | le texte visible. [[#Titre|Voir ici]] pointe dans la note actuelle. L’ancien format [[Fichier|Partie]] reste compatible. Survole le lien pour afficher le contenu associé, puis clique pour l’ouvrir.",
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
        text: "Chronomètre tes sessions par activité (lecture, visionnage, écriture, réflexion). Focus mesure aussi automatiquement le temps où l'application reste visible et active. Son tableau de bord affiche aujourd'hui, la semaine, le mois, le total et une courbe commutable sur 30 jours ou 12 mois, avec les historiques quotidiens et mensuels. Une journée va de 03:00 à 02:59.",
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
        title: 'Images locales ou HTTPS',
        text: "Pour l'image d'un repère ou la couverture d'un article, utilise un fichier local ou une URL HTTPS. Opuscule masque l'adresse de la page au serveur d'image, mais celui-ci reçoit toujours l'adresse IP du lecteur : privilégie un fichier local pour la confidentialité.",
      },
    ],
  },
  {
    title: 'Carnet de voyage',
    items: [
      {
        icon: 'map',
        title: 'Une carte belle et perso',
        text: "Le bouton Carnet de voyage ouvre une carte plein écran (fond Couleur / Clair / Sombre). Chaque road trip a un tag, une couleur, un statut Réalisé ou Prévu, et sa carte t'appartient — personne d'autre ne la voit.",
      },
      {
        icon: 'pin',
        title: 'Villes reliées en tracé',
        text: "Cherche les villes que tu as traversées : elles s'ajoutent comme étapes numérotées et se relient automatiquement par un tracé en ligne droite (plein pour un voyage réalisé, pointillé pour un projet). La distance à vol d'oiseau se calcule toute seule, ou tu saisis les kilomètres réels et le dénivelé.",
      },
      {
        icon: 'copy',
        title: 'Faire conseiller un trajet',
        text: "Le bouton Prompt IA lance un dialogue en trois phases. Le LLM demande d'abord départ et arrivée avec dates et heures, budget, nombre de personnes, de vélos et bagages. Il compare ensuite plusieurs transports avec leur prix total; choisis celui qui te convient avant qu'il génère le JSON. Opuscule n'envoie aucune donnée à une IA.",
      },
      {
        icon: 'upload',
        title: 'Importer le plan JSON',
        text: "Le bouton Importer accepte le fichier .json ou le texte final du LLM. Un aperçu vérifie les étapes, segments, jours, lieux utiles et sources avant confirmation. Repas, eau, ravitaillement, couchage, santé, visites et vigilances deviennent des notes filtrables sur la carte.",
      },
      {
        icon: 'route',
        title: 'Plan, lieux et modification',
        text: "Un trajet conseillé s'ouvre sur une feuille de route lisible : résumé, statistiques, journées, segments, conseils pratiques et checklist. L'onglet Lieux regroupe les adresses et ravitaillements par catégorie; Modifier garde les réglages du voyage à part.",
      },
      {
        icon: 'image',
        title: 'Photos & souvenirs',
        text: "Ajoute des photos (compressées avant l'envoi — tu choisis la qualité), écris une légende et désigne une couverture. Un récit libre accompagne le voyage.",
      },
      {
        icon: 'pin',
        title: 'Photos & notes sur la carte',
        text: "Place une photo OU une note de texte à un endroit précis en cliquant sur la carte (ou épingle une photo à une ville). Les photos apparaissent en vignette, les notes en marqueur : clique dessus pour lire le souvenir dans une bulle, directement sur la carte.",
      },
      {
        icon: 'eye',
        title: 'Carte postale à partager',
        text: "Le mode Carte postale met en page couverture, statistiques (km, dénivelé, étapes), mini-carte du tracé et galerie — prêt pour une capture d'écran instagramable. Export JSON (photos incluses) ou GeoJSON pour réutiliser tes tracés ailleurs.",
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
        icon: 'cloud',
        title: 'Partager avec un utilisateur',
        text: "Au clic droit sur un fichier ou dossier, choisis Partager puis saisis l’identifiant exact du compte. Accorde la lecture seule ou la modification; un dossier partage automatiquement tout son contenu.",
      },
      {
        icon: 'alert',
        title: 'Conflits sans écrasement',
        text: "Chaque sauvegarde vérifie la version cloud. Si quelqu’un a modifié le fichier entre-temps, Opuscule bloque l’écrasement et te laisse choisir la version à conserver; une nouvelle concurrence est vérifiée à nouveau.",
      },
      {
        icon: 'trash',
        title: 'Corbeille 30 jours',
        text: "Supprimer un fichier ou un dossier le place dans la Corbeille. Tu peux le restaurer pendant 30 jours, le supprimer définitivement ou vider toute la corbeille.",
      },
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
        text: "Télécharge toutes tes notes en ZIP compatible Obsidian. Si des dossiers sont chiffrés, leur mot de passe est redemandé. Attention : pour rester lisible par Obsidian, le ZIP contient alors ces notes en clair; conserve-le dans un emplacement lui-même chiffré.",
      },
      {
        icon: 'upload',
        title: 'Import (.zip)',
        text: "Réintègre un export précédent (ou un vault Obsidian) : fichiers, dossiers et liens [[wiki]] sont reconstruits. Le manifeste restaure les dossiers chiffrés et redemande le mot de passe du coffre avant de les rechiffrer en base. Le dossier technique _Opuscule apparaît aussi dans l’arbre en lecture seule pour consulter les métadonnées restaurées.",
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
        title: 'Répondre aux commentaires',
        text: "Sous un article, utilise Répondre pour ouvrir une réponse sous le commentaire concerné. Les réponses restent regroupées avec leur message parent; tu peux supprimer tes propres messages, et l’auteur de l’article peut modérer toute la conversation.",
      },
      {
        icon: 'expand',
        title: 'Lecture agrandie',
        text: 'Dans un article, Agrandir masque la navigation et le fil pour une lecture plus confortable. Utilise Quitter la lecture pour revenir au journal.',
      },
      {
        icon: 'shield',
        title: 'Comprendre la sécurité',
        text: "Ouvre Fonctions → Sécurité pour découvrir les protections actives, le fonctionnement des dossiers chiffrés, les limites à connaître et les bons réflexes de sauvegarde.",
      },
      {
        icon: 'edit',
        title: 'Changer de mot de passe',
        text: "Depuis Compte, change séparément le mot de passe de connexion et celui du coffre chiffré. Changer le mot de passe de connexion révoque les autres sessions. Il n'y a pas de récupération par e-mail : garde ces secrets en lieu sûr.",
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
