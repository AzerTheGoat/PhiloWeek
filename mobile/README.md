# PhiloWeek Mobile

Client iPhone natif en React Native / Expo. Il utilise le backend Railway
existant et ne charge aucune interface WebView.

## Developpement local

Utilise Node 20.19+, 22.13+ ou 24.3+ (les versions impaires de Node ne sont
pas prises en charge par la chaine React Native actuelle).

```powershell
cd mobile
Copy-Item .env.example .env
npm install
npm start
```

La valeur par defaut de `EXPO_PUBLIC_API_URL` pointe deja vers Railway.

## Installer sur un iPhone

Une Apple Developer Program membership et un compte Expo sont necessaires pour
une build iOS durable. Une fois connecte avec `eas login` :

```powershell
npm install --global eas-cli
eas build:configure
eas device:create
eas build --platform ios --profile development
```

Ouvre le lien de la build sur l'iPhone, installe-la puis active le Mode
developpeur iOS si le telephone le demande. La distribution TestFlight utilisera
ensuite le profil `production`.

## Securite

L'app appelle `POST /api/auth/mobile/login` ou `register`. Le serveur renvoie
un jeton de session opaque ; il est conserve uniquement dans `expo-secure-store`
et toutes les routes protegees recoivent `Authorization: Bearer <token>`.
