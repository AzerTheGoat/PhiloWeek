# Opuscule Android — Architecture UX de la V1 finale

Date : 24 juillet 2026

Ce document traduit le brief et le périmètre validé en parcours exécutables. Il
doit être maintenu avec l’application Android.

## Navigation principale

Une barre basse à cinq destinations stables :

1. **Accueil** — bienvenue, reprise et raccourcis utiles ;
2. **Fichiers** — arbre complet, recherche et création de note ;
3. **Réviser** — lancement immédiat ou sélection du périmètre ;
4. **Organiser** — idées, citations, fact checks, tâches, agenda, habitudes, vie
   et statistiques ;
5. **Articles** — fil, lecture et interactions.

Les réglages s’ouvrent depuis l’avatar de l’accueil. Les écrans de détail
recouvrent la barre basse et possèdent un retour système prévisible. La sélection
d’un onglet déjà actif revient à sa racine.

## Accueil

Objectif : permettre de choisir sans imposer une activité.

```text
┌─────────────────────────────────────┐
│ Opuscule                         (H) │
│                                     │
│        [icône Opuscule]             │
│       Bienvenue, Hamza              │
│  Que veux-tu faire aujourd’hui ?    │
│                                     │
│  Réviser maintenant              →  │
│  Ouvrir mes fichiers             →  │
│  Lire les articles               →  │
│ ─────────────────────────────────── │
│ Capture rapide                     │
│ [Idée] [Citation] [Fact] [Tâche]   │
└─────────────────────────────────────┘
```

États : chargement discret, première utilisation, erreur réseau non bloquante.

## Fichiers

```text
┌─────────────────────────────────────┐
│ Fichiers                        [+]  │
│ [ Rechercher dans mes fichiers   ]  │
│                                     │
│ ▾ Philosophie                       │
│   Note.md                       →   │
│   Définitions.json             →   │
│ ▸ Dossier chiffré              🔒   │
└─────────────────────────────────────┘
```

- Les dossiers se déplient sur place.
- Un dossier chiffré demande le mot de passe dans une feuille basse puis recharge
  son contenu.
- Chaque format possède un lecteur identifié, jamais un écran JSON brut.
- Markdown : mode lecture par défaut, bouton Modifier, sauvegarde explicite.
- Formats spécialisés : lecture structurée; questionnaire autorise la
  modification de ses questions.

## Réviser

Écran racine :

```text
┌─────────────────────────────────────┐
│ Réviser                             │
│                                     │
│ Tout revoir                         │
│ Quiz · Définitions · Personnes      │
│ [ Commencer une série ]             │
│                                     │
│ [ Choisir fichiers et dossiers ]    │
│                                     │
│ Dernières sessions / maîtrise       │
└─────────────────────────────────────┘
```

Le sélecteur présente l’arbre avec cases à cocher et trois filtres de famille.
Un dossier inclut récursivement son contenu. La validation annonce le nombre de
sources sélectionnées.

Carte :

```text
┌─────────────────────────────────────┐
│ ← Quitter            3 / 12      ⋯  │
│ Questionnaire · Politique           │
│                                     │
│          Question / portrait        │
│                                     │
│─────────────────────────────────────│
│ [ Voir le fichier source ]          │
│ [ Afficher la réponse ]             │
└─────────────────────────────────────┘
```

Après révélation, le bouton principal devient une paire `Je ne connais pas` /
`Je connais`. Le menu `⋯` contient Modifier et Supprimer. La consultation de la
source s’empile au-dessus de la session : Retour restitue exactement la carte et
son état. La fin affiche le score, les cartes ratées et permet une nouvelle
série.

## Organiser

L’écran racine est une liste aérée, pas une grille :

```text
Capturer
  Idées                                      →
  Citations                                  →
  Fact checks                                →

Planifier
  Tâches                                     →
  Agenda & habitudes                         →

Prendre du recul
  Vie en semaines                            →
  Statistiques                               →
```

Chaque destination possède son propre écran. La création utilise une feuille
basse courte. Agenda combine calendrier, détail du jour et habitudes. Les
statistiques utilisent des chiffres lisibles et des graphiques sobres.

## Articles

Le fil utilise une mise en page éditoriale blanche, séparée par des traits fins.
La fiche article privilégie la lecture. Les réactions et commentaires viennent
après le texte. Le menu permet de partager le lien public et, pour l’auteur, de
supprimer l’article.

## Design system

- Fond `#FFFFFF`, surfaces secondaires `#F7F7F8`.
- Texte `#111113`, secondaire `#6F6F75`, séparateur `#E8E8EC`.
- Violet Opuscule `#6750D8`, utilisé avec parcimonie.
- Destruction `#D92D3A`, réussite `#1E7A4D`.
- Rayons : 14 dp pour champs et boutons, 20 dp pour feuilles et grands blocs.
- Espacement de base : 4 dp; marges d’écran : 20 dp.
- Icônes cohérentes, dessin linéaire, libellé obligatoire dans la navigation.
- Transitions : fondu + déplacement de 8 à 16 dp, 180–260 ms.
- Retour haptique léger sur validation, changement de carte et coche.
- Aucune ombre décorative permanente.

## Qualité et acceptation

- États chargement, vide, erreur et hors connexion pour chaque écran réseau.
- Cibles tactiles d’au moins 48 dp.
- Aucun bouton essentiel masqué par le clavier ou la barre système.
- Défilement testé sur Pixel 9a.
- Retour Android testé dans chaque détail et pendant une session.
- Une erreur serveur reste lisible et permet de réessayer.
- Les actions destructives demandent confirmation.
