# Opuscule Android natif

Client Android ciblé, écrit en Kotlin avec Jetpack Compose. Il n'utilise ni Expo,
ni React Native, ni WebView. Il se connecte au backend Railway existant avec les
routes mobiles et conserve le jeton de session chiffré par Android Keystore.

## Ce que contient la V1 finale

- `Accueil` : bienvenue Opuscule, accès directs, capture rapide et réglages.
- `Fichiers` : arbre et recherche, notes Markdown lisibles et modifiables,
  création rapide, dossiers chiffrés et lecteurs adaptés à tous les formats
  Opuscule.
- `Réviser` : série globale immédiate ou sélection récursive de fichiers et
  dossiers; questionnaires, définitions et personnes; tirage pondéré, source,
  édition et suppression d'une question, correction et bilan.
- `Organiser` : idées, citations, fact checks, tâches, agenda, habitudes, vie en
  semaines ou mois et statistiques d'utilisation.
- `Articles` : fil publié, lecture, réactions, commentaires et réponses, partage
  public, suppression de ses propres articles et commentaires.
- Thème clair permanent, navigation à cinq racines, détails immersifs, icônes
  cohérentes et jeton de session chiffré par Android Keystore.

## Ouvrir le projet

1. Installer Android Studio.
2. Dans le premier assistant, installer `Android SDK Platform 35`,
   `Android SDK Build-Tools` et `Android SDK Platform-Tools`.
3. Ouvrir le dossier `android-native` dans Android Studio.
4. Attendre la synchronisation Gradle, puis lancer `app` sur un téléphone ou un
   émulateur.

Le serveur utilisé est défini par `API_BASE_URL` dans `app/build.gradle.kts`.
La valeur par défaut pointe vers le backend Railway de production.

## Générer l'APK

Dans PowerShell, depuis ce dossier :

```powershell
powershell -ExecutionPolicy Bypass -File .\build-debug.ps1
```

L'APK est généré ici :

```text
app\build\outputs\apk\debug\app-debug.apk
```

## Installer sur un téléphone USB

Sur le téléphone, activer `Options pour les développeurs` puis `Débogage USB`,
le brancher et accepter la clé RSA. Ensuite :

```powershell
powershell -ExecutionPolicy Bypass -File .\install-debug.ps1
```

Pour une installation sans câble, transférer `app-debug.apk` sur le téléphone,
l'ouvrir depuis l'application Fichiers et autoriser ponctuellement
`Installer des applications inconnues` pour cette application.

Le build `debug` sert aux essais personnels. Une diffusion Play Store doit
utiliser un bundle `release` signé avec une clé privée conservée hors du dépôt.
