# Opuscule Android — Périmètre fonctionnel retenu

Dernière mise à jour : 24 juillet 2026

Ce document complète `ANDROID_UI_UX_BRIEF.md`. Il définit les fonctionnalités à
conserver pour la refonte du client Android Kotlin. La sélection vient du
propriétaire du produit et remplace le périmètre arbitraire du premier MVP.

## 1. Fondations et navigation

- Compte utilisateur : inscription, connexion, déconnexion et session sécurisée.
- Accueil Opuscule : écran de bienvenue avec l’icône et choix explicite de la
  destination.
- Réglages et apparence : préférences du compte et thème clair par défaut.
- La navigation finale doit être conçue à partir de ce périmètre complet avant
  d’être développée. Ne pas reconduire automatiquement la barre à quatre onglets
  du premier prototype.

## 2. Fichiers et notes

- Afficher l’arbre complet des fichiers et dossiers.
- Lire, modifier et créer rapidement des notes Markdown.
- Rendre le Markdown enrichi.
- Gérer l’ouverture des dossiers chiffrés.
- Afficher tous les types de fichiers Opuscule :
  - note Markdown ;
  - graphe d’idées ;
  - réseau d’acteurs ;
  - questionnaire JSON ;
  - définitions JSON ;
  - tableur Excel interne ;
  - autres fichiers JSON Opuscule reconnus.

Le terme « afficher » garantit une consultation mobile adaptée. Les notes et les
questions restent modifiables; les graphes, réseaux, définitions et tableurs sont
présentés par des lecteurs dédiés sans exposer leur JSON brut comme interface
principale. Leur édition structurelle complète reste réservée au web.

## 3. Révision et questionnaires

Le bouton principal `Réviser` lance par défaut une série construite à partir de
tous les fichiers compatibles du compte.

Un parcours secondaire permet de sélectionner précisément :

- un ou plusieurs fichiers ;
- un ou plusieurs dossiers ;
- le contenu de tous les sous-dossiers sélectionnés ;
- les familles à inclure : questionnaires, définitions et personnes des réseaux.

Le passage d’un quiz comprend l’ensemble cohérent suivant :

- révision d’un questionnaire précis ;
- révision depuis une note liée ;
- révision globale ;
- mémorisation des personnes des réseaux d’acteurs ;
- révision des définitions ;
- tirage pondéré selon l’historique ;
- affichage de la réponse ;
- actions `Je connais` et `Je ne connais pas` ;
- ouverture du fichier source ;
- modification d’une question ;
- suppression d’une question après confirmation ;
- résultat de fin de session ;
- score, erreurs et questions à revoir ;
- conservation du contexte lorsqu’on consulte une source puis revient au quiz.

La conception de ce workflow précède obligatoirement celle de la carte visuelle.

## 4. Capture et organisation personnelle

- Boîte à idées.
- Citations avec auteur, source, notes et tags.
- Fact checks avec source, notes et statut.
- Tâches avec échéance et état.
- Agenda mensuel.
- Habitudes quotidiennes.
- Statistiques, séries et grille d’activité des habitudes.
- Vue de la vie en semaines ou en mois.

Ces fonctions doivent être regroupées dans une architecture simple sans
transformer l’accueil en grille surchargée. Une capture rapide contextuelle reste
à étudier pendant les wireframes.

## 5. Statistiques

- Afficher les statistiques d’utilisation existantes : jour, semaine, mois,
  historique et graphiques.

Le temps durant lequel le client Android est réellement au premier plan est
comptabilisé et envoyé au serveur dans les statistiques d’utilisation existantes.

## 6. Articles et communauté

- Fil des articles publiés.
- Lecture des articles.
- Commentaires et réponses.
- Réactions aux articles.
- Ouverture et partage du lien public d’un article.

L’auteur connecté peut supprimer son propre article après confirmation. La
création et la modification d’un article restent réservées au web.

## 7. Fonctionnalités explicitement hors périmètre actuel

Tout ce qui n’est pas cité ci-dessus est écarté de la première refonte mobile,
notamment :

- partage et collaboration sur les fichiers ;
- historique et corbeille ;
- import/export Obsidian ;
- édition mobile complète des graphes et tableurs ;
- journal quotidien ;
- Focus et chronomètre ;
- frise historique ;
- carnet de voyage ;
- notes vocales ;
- prompts à copier et récapitulatifs de période ;
- publication d’articles ;
- tutoriel et page Sécurité dédiés.

Une fonctionnalité hors périmètre peut rester supportée par le backend et par le
web. Elle ne doit pas encombrer la navigation Android.

## 8. Règle de réalisation

Avant toute refonte de code :

1. établir l’architecture de navigation ;
2. définir les parcours principaux ;
3. produire les wireframes ;
4. valider les états vides, chargements, erreurs et retours ;
5. définir les transitions ;
6. seulement ensuite développer et tester sur téléphone réel.
