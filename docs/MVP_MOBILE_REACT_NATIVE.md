# PhiloWeek Mobile — MVP React Native

## Objectif

Créer une **vraie application iPhone native** pour PhiloWeek, distribuée d'abord
via TestFlight. Ce projet ne sera pas une PWA et ne réutilisera pas l'interface
web dans une WebView.

Le serveur existant reste la source de vérité :

```text
Application React Native (iPhone)
          │ HTTPS / API JSON
          ▼
https://philoweek-production.up.railway.app
          │
          ▼
Node / Express + SQLite
```

Le client web actuel continue d'exister. L'application mobile est un nouveau
client, dans un dossier `mobile/`, qui utilise les mêmes données et le même
compte utilisateur.

## Décisions techniques

| Sujet | Choix MVP |
| --- | --- |
| Technologie | React Native + Expo + TypeScript |
| Navigation | Expo Router : onglets natifs et écrans empilés |
| Build iOS | EAS Build, puis TestFlight |
| API | Backend Railway existant, via HTTPS |
| Session | Jeton de session opaque envoyé en `Authorization: Bearer ...` |
| Stockage sensible | `expo-secure-store` uniquement, jamais `AsyncStorage` |
| Données de lecture | Cache local, avec synchronisation au retour réseau |
| État réseau | TanStack Query / React Query |
| Design | Composants React Native, optimisés iPhone 14 et safe areas |

### Authentification native

Le site web utilise aujourd'hui une session par cookie HTTP-only. Une app native
ne doit pas dépendre de ce cookie de navigateur.

Le backend devra accepter une session opaque dans l'en-tête `Authorization` pour
les routes mobiles. À la connexion, l'app reçoit ce jeton, le stocke dans le
trousseau iOS avec `SecureStore`, puis l'envoie à chaque requête API.

Règles :

- ne jamais stocker le mot de passe ;
- ne jamais exposer un jeton dans les logs ou les messages d'erreur ;
- réutiliser les expirations et la révocation de sessions existantes ;
- déconnexion = suppression locale du jeton + révocation serveur.

## Périmètre du premier MVP

### Inclus

1. **Connexion et compte**
   - inscription, connexion, déconnexion ;
   - session persistante et sécurisée ;
   - affichage de l'utilisateur connecté.

2. **Notes**
   - arbre simple de dossiers et de fichiers Markdown ;
   - lecture d'une note ;
   - création, renommage et suppression d'une note ;
   - édition Markdown simple avec sauvegarde automatique ;
   - recherche de fichiers et de texte.

3. **Organisation quotidienne**
   - Journal du jour ;
   - tâches : consulter, créer, cocher, modifier ;
   - Focus : lancer/arrêter le chronomètre et consulter les sessions récentes ;
   - capture rapide d'idée depuis un bouton central.

4. **Articles**
   - fil d'articles publiés ;
   - lecture confortable plein écran ;
   - likes, commentaires et réponses directes ;
   - consultation des articles personnels.

5. **Qualité iPhone**
   - navigation basse native : Notes, Aujourd'hui, Capturer, Articles, Compte ;
   - zones tactiles d'au moins 44 px ;
   - gestion du clavier, des encoches et de la safe area ;
   - thèmes sombre et clair ;
   - états chargement, erreur et absence de réseau compréhensibles.

### Hors MVP

Ces fonctions restent sur le web au lancement mobile :

- graphes d'idées et réseaux d'acteurs ;
- tableurs Excel ;
- import/export Obsidian ZIP ;
- dossiers chiffrés et gestion complète du coffre ;
- frise historique, carnet de voyage et outils de création complexes ;
- édition avancée de questionnaires et de définitions ;
- synchronisation complète hors ligne et résolution de conflits ;
- notifications push.

Le hors-ligne MVP se limite à garder les dernières données déjà lues. Les
modifications demandent une connexion réseau et affichent clairement un échec
de synchronisation.

## Parcours utilisateur MVP

```text
Ouverture
  ├─ Pas de session → Connexion / Inscription
  └─ Session valide → Onglet « Aujourd'hui »
                         ├─ Journal du jour
                         ├─ Tâches du jour
                         └─ Focus

Onglet « Notes » → dossier → note → lire / modifier
Onglet « Capturer » → écrire une idée → enregistrer dans la Boîte à idées
Onglet « Articles » → lire → aimer / commenter / répondre
Onglet « Compte » → thème, session, déconnexion
```

## Écrans à produire

| Écran | Priorité | Fonction principale |
| --- | --- | --- |
| Splash + session | P0 | Restaurer la session en sécurité |
| Connexion / inscription | P0 | Accéder au compte PhiloWeek |
| Aujourd'hui | P0 | Journal, tâches et focus en un coup d'œil |
| Notes | P0 | Parcourir et rechercher les fichiers |
| Lecteur / éditeur de note | P0 | Lire et modifier une note Markdown |
| Capture rapide | P0 | Créer une idée sans quitter le contexte |
| Articles | P1 | Consulter les publications |
| Article | P1 | Lire, liker, commenter, répondre |
| Compte | P1 | Thème et déconnexion |

## API à préparer

Les routes métier existantes restent préférées. Les adaptations nécessaires sont
concentrées sur l'accès natif :

- une authentification mobile qui délivre un jeton de session opaque ;
- le middleware d'authentification accepte `Authorization: Bearer <token>` en
  plus du cookie web actuel ;
- une route de déconnexion/révocation mobile ;
- vérifier toutes les réponses JSON pour l'usage mobile (erreurs cohérentes,
  booléens réels, pagination quand les listes deviennent longues).

Les routes existantes pour fichiers, tâches, focus et articles serviront de
base. Aucune donnée ne sera dupliquée dans un second backend.

## Structure proposée

```text
PhiloWeek/
├── client/                 # Client web React existant
├── server/                 # API Express existante
└── mobile/                 # Nouveau projet Expo React Native
    ├── app/                # Routes / écrans Expo Router
    ├── components/         # Composants natifs réutilisables
    ├── features/           # notes, today, articles, auth
    ├── services/api.ts     # Client HTTP Railway
    ├── stores/             # Session et préférences locales
    └── app.json            # Nom, icône, bundle iOS
```

Variables d'environnement de l'app :

```text
EXPO_PUBLIC_API_URL=https://philoweek-production.up.railway.app/api
```

## Jalons

### Jalon 1 — Fondations

- créer le projet Expo TypeScript ;
- configurer l'URL Railway et le client API ;
- adapter l'authentification pour la session native ;
- créer les thèmes et la navigation à cinq onglets ;
- installer une première build de développement sur l'iPhone 14.

**Validation :** connexion possible sur téléphone réel, fermeture/réouverture
de l'app sans reconnexion, déconnexion effective.

### Jalon 2 — Notes et quotidien

- liste/arbre des notes, recherche, lecture et édition ;
- capture rapide ;
- journal, tâches et focus.

**Validation :** créer et modifier une note depuis l'iPhone, puis constater
immédiatement le changement sur le site web.

### Jalon 3 — Articles et finition MVP

- fil, article, lecture focalisée, likes et conversation ;
- retours visuels de chargement/erreur ;
- tests iPhone 14 (portrait, clavier, thème sombre et clair).

**Validation :** parcours complet de lecture et commentaire sans interface web.

### Jalon 4 — TestFlight

- icône, écran de lancement, nom et identifiant iOS uniques ;
- build de production EAS ;
- distribution TestFlight privée ;
- checklist de confidentialité et description de la bêta.

## Installation sur l'iPhone 14

Pour une application durable et indépendante :

1. créer un compte Apple Developer (nécessaire pour TestFlight) ;
2. créer la build iOS avec EAS Build ;
3. envoyer la build dans App Store Connect ;
4. inviter le compte Apple utilisé sur l'iPhone via TestFlight ;
5. installer l'application TestFlight, puis PhiloWeek.

Pendant le développement, une build de développement Expo peut être installée
sur l'iPhone. La version de test finale sera toutefois distribuée par TestFlight,
pas par Expo Go et pas comme PWA.

## Critères de sortie MVP

- l'app s'installe sur un iPhone 14 via TestFlight ;
- elle ne charge aucun écran dans une WebView ;
- le même compte affiche les mêmes notes, tâches et articles sur mobile et web ;
- les sessions et données privées ne sont jamais stockées en clair ;
- les parcours P0 fonctionnent en portrait avec le clavier iOS ;
- une erreur réseau ne provoque pas de perte silencieuse d'une modification.
