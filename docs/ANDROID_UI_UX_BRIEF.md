# Opuscule Android — Brief produit UI/UX

Dernière mise à jour : 24 juillet 2026

Ce document est la référence produit pour toute évolution du client Android
Kotlin situé dans `android-native/`. L’interface ne doit plus être développée
écran par écran sans avoir d’abord défini le parcours complet de l’utilisateur.

## 1. Vision

Opuscule doit donner l’impression d’une application grand public mature qui
pourrait être éditée par Meta :

- minimaliste, sobre et sûre de son rôle ;
- immédiatement compréhensible ;
- construite autour des parcours utilisateur avant les composants visuels ;
- cohérente jusque dans les transitions et les petits états intermédiaires ;
- suffisamment désirable et fluide pour donner envie de rester dans
  l’application.

La rétention doit venir de la valeur du produit, de la continuité des parcours et
de la réduction des frictions. Ne pas utiliser de dark patterns, de notifications
artificielles ou d’obstacles à la sortie.

## 2. Direction visuelle

La référence de qualité est celle des applications iPhone :

- thème clair par défaut ;
- beaucoup de blanc et d’espace respirant ;
- noir pour la typographie et la structure ;
- violet comme accent identitaire ponctuel ;
- ne jamais reprendre le violet générique ou l’esthétique Material Android par
  défaut ;
- séparateurs fins pour structurer les groupes ;
- angles arrondis maîtrisés ;
- peu de cartes encadrées : préférer des surfaces ouvertes, des groupes et des
  séparateurs ;
- ombres rares et discrètes ;
- aucun écran visuellement chargé.

Le violet doit être défini comme une couleur de marque propre à Opuscule. Son
usage doit rester limité aux actions principales, à la sélection et à quelques
signaux d’identité. Le fond principal reste blanc.

## 3. Typographie

La typographie doit être choisie pour une application de lecture, de notes et de
mémorisation :

- sans-serif moderne, très lisible et neutre pour l’interface ;
- hiérarchie nette entre grand titre, titre de section, corps et métadonnées ;
- corps confortable pour la lecture prolongée ;
- graisse plutôt que couleur pour créer la hiérarchie ;
- taille et contraste suffisants sans rendre l’interface massive ;
- largeur de ligne maîtrisée sur les contenus longs.

Le choix final de police doit privilégier la lisibilité, la rapidité de rendu et
la cohérence Android. Une police de marque pourra être introduite uniquement si
elle améliore réellement l’identité sans dégrader les performances.

## 4. Mouvement et qualité perçue

Les transitions sont une partie centrale de l’identité, pas une décoration
ajoutée à la fin :

- transitions courtes, naturelles et cohérentes entre les écrans ;
- continuité visuelle entre une ligne sélectionnée et son écran de détail ;
- changement d’état animé pour afficher une réponse, valider une action ou
  cocher un élément ;
- retours tactiles légers sur les actions importantes ;
- apparition progressive du contenu, sans effets spectaculaires ;
- aucun saut brutal de mise en page ;
- respect du réglage système de réduction des animations ;
- animations rapides qui ne ralentissent jamais le travail.

Chaque écran doit définir avant développement ses états : chargement, vide,
erreur, hors connexion, succès, confirmation et retour arrière.

## 5. Architecture et navigation

La navigation définitive reste ouverte, car de nouvelles fonctionnalités seront
ajoutées. Elle doit donc être conçue comme un système évolutif plutôt que figée
autour des quatre fonctionnalités actuelles.

Principes :

- au lancement après authentification, afficher un accueil Opuscule ;
- l’accueil présente clairement « Bienvenue sur Opuscule », l’icône de
  l’application et les destinations disponibles ;
- l’utilisateur choisit lui-même où aller ;
- distinguer les destinations principales des actions de capture rapide ;
- rendre le retour à l’accueil immédiat et prévisible ;
- ne pas multiplier les niveaux de navigation ;
- conserver le contexte lorsqu’un utilisateur ouvre une source puis revient ;
- prévoir la croissance future sans transformer l’accueil en grille surchargée.

La forme exacte de la navigation — barre inférieure, accueil, menu complémentaire
ou combinaison — doit être décidée après cartographie des fonctionnalités
présentes et futures.

## 6. Parcours de révision

La révision doit être un parcours focalisé, sans distraction. Une carte de quiz
doit permettre :

1. de lire la question ;
2. d’afficher la réponse ;
3. d’indiquer `Je connais` ou `Je ne connais pas` ;
4. d’ouvrir le fichier qui décrit ou source la question ;
5. de modifier la question ;
6. de supprimer la question après confirmation.

Règles d’interface :

- `Afficher la réponse` est l’action principale avant révélation ;
- après révélation, `Je connais` et `Je ne connais pas` deviennent les deux
  actions principales ;
- l’évaluation doit être formulée exactement autour de la connaissance, et non
  avec un vocabulaire ambigu ;
- `Modifier`, `Supprimer` et `Voir le fichier source` restent accessibles sans
  concurrencer les actions de mémorisation ;
- la suppression est destructive, confirmée et visuellement distincte ;
- la carte conserve sa position et son état si l’utilisateur consulte la source
  puis revient ;
- la transition de révélation et le passage à la question suivante doivent être
  particulièrement soignés ;
- la correction peut défiler, mais les actions essentielles restent accessibles.

## 7. Méthode obligatoire avant développement

Avant de coder ou refaire un écran Android :

1. formuler le besoin utilisateur de l’écran ;
2. définir son point d’entrée et sa sortie ;
3. dessiner le parcours nominal ;
4. prévoir tous les états intermédiaires et les erreurs ;
5. définir la hiérarchie des actions ;
6. produire un wireframe ;
7. vérifier la cohérence avec les autres parcours ;
8. seulement ensuite développer l’interface ;
9. tester sur le téléphone réel, notamment les transitions, le clavier, le
   défilement et le retour Android.

Une interface techniquement fonctionnelle mais dont le workflow n’a pas été
validé ne doit pas être considérée comme terminée.

## 8. Objectifs de rétention

Opuscule doit donner une raison claire de revenir :

- reprendre facilement une lecture, une note ou une série commencée ;
- réduire au minimum le nombre d’actions avant d’obtenir de la valeur ;
- montrer une progression utile sans gamification forcée ;
- proposer la prochaine action logique au bon moment ;
- préserver le contexte entre une question et sa source ;
- rendre la capture instantanée et la consultation agréable ;
- utiliser des états vides qui expliquent l’intérêt de la fonctionnalité ;
- privilégier la confiance, la maîtrise et la continuité.

## 9. Points encore à décider

Ces décisions nécessitent une prochaine phase de questions ou de wireframes :

- teinte exacte du violet Opuscule ;
- icône définitive ;
- liste et priorité des fonctionnalités futures ;
- architecture finale de navigation ;
- composition précise de la page d’accueil ;
- style éditorial des articles et des notes ;
- niveau de présence des gestes et retours haptiques ;
- comportement hors connexion ;
- informations de progression à montrer sur l’accueil et en fin de révision.
