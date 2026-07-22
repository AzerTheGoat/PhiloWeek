# Audit de sécurité AppSec — Opuscule v2 / PhiloWeek

**Date de l'audit :** 22 juillet 2026

**Révision examinée :** `a1f53f7` (`main`)

**Mode initial :** revue statique en lecture seule, inventaire des dépendances et `npm audit`
**Auditeur :** pré-filtrage AppSec automatisé assisté, spécialisé JavaScript/Node/React

> **Avertissement important** — Ce document est un pré-filtrage rapide fondé sur le code présent dans le dépôt et les dépendances installées au moment de l'audit. Il ne remplace pas un pentest professionnel : aucun test d'intrusion sur une instance de production, fuzzing authentifié, audit d'infrastructure, analyse du trafic TLS, revue des ACL du volume, test de charge ou validation dans Excel Desktop n'a été réalisé.

> **Suivi de remédiation — 22 juillet 2026.** Après la phase d'audit en lecture seule, le propriétaire a explicitement autorisé l'implémentation des corrections. Les constats et numéros de ligne détaillés ci-dessous décrivent donc l'état initial de `a1f53f7`; la table suivante décrit l'état du code corrigé dans l'arbre de travail.

## État de remédiation

| Constat | État | Contrôle implémenté |
|---|---|---|
| SEC-01 | Corrigé | Lecture ZIP séquentielle avec `yauzl`, limites par entrée/cumul/ratio/nombre et rejet des chemins dangereux. |
| SEC-02 | Corrigé | Coffre récursif AES-256-GCM par enveloppes, incluant fichiers, révisions et corbeille; `secure_delete`, checkpoint WAL et `VACUUM` à l'activation. |
| SEC-03 | Corrigé | Liste blanche de fonctions Excel; DDE, URL, liens externes et fonctions dangereuses sont exportés comme texte. |
| SEC-04 | Corrigé | `server/package-lock.json` versionnable et installations CI par `npm ci`. |
| SEC-05 | Corrigé | Quota par compte incluant contenus, historiques, photos et audio; rate limits sur opérations coûteuses et uploads bornés. |
| SEC-06 | Atténué | Identifiant de lecteur généré côté serveur dans un cookie HttpOnly signé et limitation par IP. Une ferme multi-instance nécessitera un store de rate limit partagé. |
| SEC-07 | Corrigé | Changement de mot de passe : révocation de toutes les sessions, puis émission d'une nouvelle session. |
| SEC-08 | Corrigé | Import des interactions sociales limité aux articles effectivement importés ou publiés et accessibles. |
| SEC-09 | Corrigé | Contrôle `requireFileAccess` sur les identifiants de fichiers des routes audio, timer et questionnaires. |
| SEC-10 | Corrigé | DOMPurify remplace le sanitizer artisanal; CSP renforcée et images distantes bloquées. |
| SEC-11 | Corrigé | scrypt asynchrone partagé dans une file de concurrence bornée, plus rate limit d'ouverture du coffre. |
| SEC-12 | Corrigé | `trust proxy` activé uniquement sur Railway. |
| SEC-13 | Corrigé | Dépendances runtime mises à niveau; `npm audit` courant ne signale aucun avis. |
| SEC-14 | Corrigé | Vite et son plugin mis à niveau; serveur dev lié à `127.0.0.1` avec port strict. |
| SEC-15 | Partiellement opérationnel | Événements de sécurité JSON et identifiants de requête ajoutés. La centralisation, rétention et alerte restent à configurer dans l'hébergement. |
| SEC-16 | Corrigé | 404 API et gestionnaire global d'erreurs sans fuite de stack, avec identifiant de corrélation. |
| SEC-17 | Corrigé | Les rendus HTML historiques dormants utilisent désormais du texte brut. |
| SEC-18 | Corrigé | Images HTTP(S) rejetées dans les contenus importés et bloquées par la CSP. |

### Validation après correction

- `npm audit` complet et `--omit=dev` : **0 vulnérabilité** sur le client et le serveur au 22 juillet 2026.
- `node --test` : chiffrement au repos, verrouillage/ouverture, export/import avec restauration du chiffrement, chemins ZIP et formules Excel malveillantes couverts.
- Build Vite de production : réussi.
- `eslint-plugin-security` : intégré; 75 avertissements heuristiques à trier, aucune erreur bloquante. Les chemins de fichiers internes et accès d'objets dynamiques expliquent la majorité des alertes.
- CI ajoutée : audits npm, lint sécurité, tests, build et CodeQL; jobs Snyk et SonarQube activables par variables/secrets de dépôt.

Le mot « corrigé » signifie ici que le correctif de code correspondant est présent et a passé les contrôles locaux indiqués. Il ne signifie pas « aucune faille possible » : un pentest authentifié, une revue d'infrastructure et des tests de charge restent nécessaires.

## 1. Résumé exécutif

L'application présente une base de sécurité plutôt saine sur plusieurs points : requêtes SQLite très majoritairement paramétrées, garde d'authentification global sur `/api`, contrôles d'accès centralisés pour les fichiers, cookies de session `HttpOnly`/`SameSite=Strict`, jetons aléatoires stockés sous forme de hash, mots de passe protégés par scrypt, en-têtes Helmet et CSP restrictive pour les scripts.

L'audit n'a identifié **aucune vulnérabilité critique** ni injection SQL directement exploitable dans les routes examinées. Il relève cependant **5 constats élevés**, principalement liés à la disponibilité, au chiffrement des dossiers, à la chaîne d'approvisionnement et aux exports Excel. Plusieurs constats moyens concernent les autorisations secondaires, la gestion des sessions, la sanitation HTML et l'absence de garde-fous globaux contre les abus.

### Répartition

| Sévérité | Nombre |
|---|---:|
| Critique | 0 |
| Élevée | 5 |
| Moyenne | 10 |
| Faible | 3 |

## 2. Périmètre et architecture observée

### Entrées et composants

- **Backend actif :** `server/index.js`, Express 4, SQLite via `better-sqlite3`.
- **Frontend actif :** React 18/Vite, entrée `client/src/main.jsx`, build dans `server/public/`.
- **Frontend historique :** `static/`, non servi par `server/index.js` dans la configuration actuelle.
- **Authentification :** session opaque en cookie, implémentée dans `server/auth/`.
- **Données sensibles :** fichiers et révisions, dossiers verrouillés, articles, partages, audio, photos, imports ZIP/XLSX.
- **Déploiement documenté :** Railway ou exécution Node directe ; `trust proxy = 1` est appliqué sans condition.

### Configuration observée

- Helmet est actif avec CSP ; `script-src 'self'`, `object-src 'none'`, `base-uri 'self'`.
- CORS autorise uniquement `http://localhost:5173` et `http://localhost:3001` avec credentials.
- Les cookies sont `HttpOnly`, `SameSite=Strict`, et `Secure` en production/Railway.
- Limite JSON/urlencoded globale : 12 Mo.
- Les routes d'authentification et le journal public sont les seules routes montées avant le garde `/api`.
- Le fichier `.env` local contient les noms `ANTHROPIC_API_KEY` et `OPENAI_API_KEY`, mais il est ignoré par Git et aucune référence active à ces clés n'a été trouvée dans le client ou le serveur actuel. Leur validité n'a pas été testée et leur valeur n'a pas été lue dans le rapport.

### Contrôles positifs vérifiés

- Pas de secret de type clé API détecté dans les sources ou le bundle par recherche de motifs usuels.
- `.env` n'est pas suivi par Git.
- Pas d'usage de `eval`, `new Function`, `child_process.exec` ou construction de commande shell depuis une entrée utilisateur dans l'application active.
- Aucune pollution de prototype directement exploitable n'a été identifiée ; le JSON libre des voyages exclut explicitement `__proto__`, `prototype` et `constructor`, et `npm audit` n'a remonté aucun avis de prototype pollution dans l'arbre installé.
- Les requêtes SQL utilisent des paramètres ; les rares fragments dynamiques identifiés sont construits à partir de constantes internes.
- Les partages de fichiers s'appuient sur `requireFileAccess()` et vérifient propriétaire/édition/lecture.
- Les noms binaires des uploads audio/photos sont générés côté serveur.
- Les XLSX disposent déjà de limites sur le nombre de feuilles, lignes, colonnes, cellules et taille décompressée.

## 3. Résultats de l'audit des dépendances

Commandes exécutées sans mise à jour ni installation :

```text
npm audit --json                  # client et serveur
npm audit --omit=dev --json       # client et serveur
npm outdated --json              # client et serveur
npm explain <package>             # traçage des dépendances concernées
```

### Résumé `npm audit`

| Arbre | Critique | Élevée | Modérée | Faible | Total |
|---|---:|---:|---:|---:|---:|
| Client complet | 0 | 1 | 1 | 0 | 2 |
| Client production (`--omit=dev`) | 0 | 0 | 0 | 0 | 0 |
| Serveur complet | 0 | 1 | 2 | 1 | 4 |
| Serveur production (`--omit=dev`) | 0 | 0 | 2 | 1 | 3 |

Avis observés :

- Vite : traversée de chemin/divulgation sur serveur de développement, dont [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff).
- esbuild : lecture de réponses du serveur de développement par un site tiers, [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99).
- `brace-expansion` via Nodemon : déni de service algorithmique, [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp).
- `body-parser` 1.20.5 via Express : cas de limite invalide désactivant la protection de taille, [GHSA-v422-hmwv-36x6](https://github.com/advisories/GHSA-v422-hmwv-36x6).
- `uuid` 8.3.2 embarqué par ExcelJS : contrôle de bornes manquant pour certaines API v3/v5/v6 avec buffer, [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

`npm outdated` signale par ailleurs plusieurs versions majeures plus récentes (notamment Vite, React, Marked, date-fns, Express, better-sqlite3, express-rate-limit et UUID). Une version majeure plus ancienne n'est pas automatiquement vulnérable ou non maintenue ; ces écarts doivent être traités dans une campagne de mise à niveau testée, séparée des correctifs CVE urgents. Aucun élément suffisant n'a permis de qualifier formellement un package direct de « non maintenu ».

## 4. Vulnérabilités détaillées

### SEC-01 — Décompression ZIP non bornée permettant un zip bomb

- **OWASP 2021 :** A04 — Insecure Design
- **Sévérité :** **Élevée**
- **Fichiers/lignes :** `server/routes/import.js:16`, `:26`, `:45-58`
- **Confiance :** élevée

**Risque et exploitation**

L'upload est limité à 100 Mo compressés, mais `JSZip.loadAsync()` charge l'archive en mémoire puis chaque entrée est entièrement décompressée via `entry.async('text'|'nodebuffer')`. Il n'existe aucune limite sur le nombre d'entrées, leur taille décompressée cumulée, leur ratio de compression ou leur profondeur. Comme l'inscription est ouverte, un attaquant peut créer un compte et envoyer une archive très compressée produisant plusieurs gigaoctets en mémoire. Le processus Node peut être bloqué ou tué par l'OOM, affectant tous les utilisateurs.

**Remédiation indicative**

- Utiliser une lecture ZIP en streaming (`yauzl` en mode lazy, par exemple).
- Refuser avant décompression : trop d'entrées, chemin trop profond, taille déclarée trop élevée ou ratio anormal.
- Imposer une limite cumulée décompressée et une limite par entrée.
- Traiter les entrées séquentiellement au lieu de conserver tout `decompressed` en mémoire.

```js
const MAX_ENTRIES = 2000
const MAX_ENTRY_BYTES = 25 * 1024 * 1024
const MAX_TOTAL_BYTES = 250 * 1024 * 1024
const MAX_RATIO = 100

let entries = 0
let total = 0
for await (const entry of streamZip(req.file.stream)) {
  if (++entries > MAX_ENTRIES) throw new UploadError('Archive trop complexe')
  if (entry.uncompressedSize > MAX_ENTRY_BYTES) throw new UploadError('Entrée trop grande')
  if (entry.uncompressedSize / Math.max(1, entry.compressedSize) > MAX_RATIO) throw new UploadError('Ratio suspect')
  total += entry.uncompressedSize
  if (total > MAX_TOTAL_BYTES) throw new UploadError('Archive décompressée trop grande')
  await processEntryStream(entry)
}
```

### SEC-02 — Le verrouillage ne chiffre que les enfants directs, pas tout le sous-arbre

- **OWASP 2021 :** A02 — Cryptographic Failures
- **Sévérité :** **Élevée**
- **Fichiers/lignes :** `server/routes/files.js:385`, `:453-461`, `:686-714`
- **Confiance :** élevée

**Risque et exploitation**

Le verrouillage sélectionne uniquement `WHERE parent_id = ?`. Une note placée dans un sous-dossier du dossier verrouillé conserve donc son contenu en clair dans `files.content` et ses révisions en clair. L'interface la masque grâce au contrôle d'ancêtre verrouillé, mais une fuite de la base, un accès au volume ou une sauvegarde révèle le contenu. Les index `file_tags`/`file_links`, les anciennes sauvegardes SQLite et potentiellement le WAL peuvent également conserver des métadonnées ou du texte antérieur.

Scénario : `Privé/Finances/2026.md` est imbriqué sous `Privé`. Le verrouillage de `Privé` chiffre un éventuel fichier direct, mais pas `2026.md`. L'utilisateur pense son sous-arbre protégé alors que la donnée reste lisible au repos.

**Remédiation indicative**

- Résoudre tous les descendants avec un CTE récursif.
- Chiffrer chaque fichier et supprimer toutes ses révisions, tags et liens dans **une transaction**.
- Ne basculer le type du dossier à `locked_folder` qu'après succès complet.
- Documenter que les sauvegardes/WAL antérieurs nécessitent une politique de rotation ou un chiffrement du volume ; le verrouillage applicatif ne constitue pas un effacement sécurisé.

```js
const descendants = db.prepare(`
  WITH RECURSIVE tree(id) AS (
    SELECT id FROM files WHERE parent_id = ? AND user_id = ?
    UNION ALL
    SELECT f.id FROM files f JOIN tree t ON f.parent_id = t.id
    WHERE f.user_id = ?
  )
  SELECT * FROM files WHERE id IN (SELECT id FROM tree) AND type = 'file'
`).all(folderId, userId, userId)

db.transaction(() => {
  for (const file of descendants) encryptAndClearPlaintext(file)
  db.prepare("UPDATE files SET type='locked_folder', password_hash=? WHERE id=?")
    .run(hash, folderId)
})()
```

### SEC-03 — Injection de formules dangereuses dans les exports XLSX

- **OWASP 2021 :** A03 — Injection
- **Sévérité :** **Élevée**
- **Fichier/ligne :** `server/spreadsheetXlsx.js:84`
- **Confiance :** élevée sur l'injection ; impact exact dépend des politiques Excel du poste

**Risque et exploitation**

Toute cellule dont `input` commence par `=` est transmise telle quelle à ExcelJS comme formule Excel. Le parseur client est volontairement limité et sans `eval`, mais cette liste sûre n'est pas appliquée au moment de l'export. Un collaborateur disposant du droit `edit`, ou un classeur importé, peut injecter une formule non supportée par l'application (`HYPERLINK`, `WEBSERVICE`, référence externe, ancienne charge DDE). À l'ouverture du `.xlsx` dans Excel, cela peut déclencher une connexion réseau, exfiltrer des données ou, sur des environnements anciens/mal configurés, lancer une commande après interaction de l'utilisateur.

**Remédiation indicative**

- Valider côté serveur les formules avec la même grammaire/allowlist que le moteur client.
- Refuser les références externes, URL, DDE, fonctions volatiles ou non prises en charge.
- Offrir un export « valeurs uniquement » et neutraliser toute formule inconnue en préfixant une apostrophe.

```js
if (typeof input === 'string' && input.startsWith('=')) {
  const formula = input.slice(1)
  if (!safeFormulaParser.accepts(formula) || /\[.*\]|https?:|WEBSERVICE|DDE/i.test(formula)) {
    cell.value = `'${input}` // texte, pas une formule exécutable
  } else {
    cell.value = { formula }
  }
}
```

### SEC-04 — Build serveur non reproductible : lockfile ignoré et `npm install` en production

- **OWASP 2021 :** A08 — Software and Data Integrity Failures
- **Sévérité :** **Élevée**
- **Fichiers/lignes :** `.gitignore:3`, `package.json:6`, `server/package.json:1-27`
- **Confiance :** élevée

**Risque et exploitation**

`server/package-lock.json` est explicitement ignoré. Le build racine exécute `npm install`, ce qui résout les plages `^` à chaque déploiement. Deux builds du même commit peuvent donc embarquer des versions transitives différentes, y compris une version compromise ou nouvellement vulnérable, sans revue de code. Cela empêche aussi `npm ci`, la vérification déterministe d'intégrité et les mises à jour contrôlées par PR.

**Remédiation indicative**

- Versionner les lockfiles client et serveur.
- Utiliser `npm ci --omit=dev` pour le runtime et un job de build séparé pour le client.
- Réviser les changements de lockfile et activer Dependabot/Renovate.
- Éviter les scripts d'installation non nécessaires et utiliser un registre verrouillé si le contexte le justifie.

```json
{
  "scripts": {
    "build": "npm ci --prefix server && npm ci --prefix client && npm run build --prefix client"
  }
}
```

### SEC-05 — Absence de quotas et de rate limiting sur les opérations coûteuses

- **OWASP 2021 :** A04 — Insecure Design
- **Sévérité :** **Élevée**
- **Fichiers/lignes :** `server/routes/import.js:16-18`, `server/routes/voice.js:16,42`, `server/routes/roadtrips.js:29-32,637`, `server/routes/spreadsheets.js:9-12,31`, `server/index.js:64-81`
- **Confiance :** élevée

**Risque et exploitation**

Seules les routes login/register sont limitées. Un compte gratuit peut répéter des imports ZIP de 100 Mo, uploads audio de 50 Mo, photos de 15 Mo, conversions XLSX et exports coûteux. Il n'existe pas de quota utilisateur, de limite de concurrence, de plafond global de stockage ni de rate limit distribué. Un attaquant peut remplir le volume, saturer CPU/mémoire et rendre le service indisponible.

**Remédiation indicative**

- Ajouter des quotas cumulés par utilisateur et type de ressource.
- Placer un rate limiter distribué (Redis) sur uploads, imports, exports, géocodage et génération de quiz.
- Limiter la concurrence des opérations CPU/mémoire et traiter les conversions dans une file de jobs isolée.
- Refuser l'upload avant écriture si le quota est dépassé et supprimer tout fichier temporaire en cas d'erreur DB.

```js
const uploadLimiter = rateLimit({
  store: new RedisStore({ sendCommand: (...args) => redis.sendCommand(args) }),
  windowMs: 15 * 60_000,
  limit: 20,
})

router.post('/', uploadLimiter, requireQuota('audio', 50 * MB), upload.single('audio'), handler)
```

### SEC-06 — Falsification et croissance non bornée des lectures publiques

- **OWASP 2021 :** A04 — Insecure Design
- **Sévérité :** **Moyenne**
- **Fichier/lignes :** `server/routes/publicSocialJournal.js:47-69,75-78`
- **Confiance :** élevée

**Risque et exploitation**

La route publique accepte un `anon_id` arbitraire conforme à une regex et insère une ligne par valeur unique, sans rate limit. Un client peut générer des millions d'identifiants, fausser les compteurs et faire croître la base sans authentification. Les sous-requêtes `COUNT(*)` rendent ensuite les lectures d'articles plus coûteuses.

**Remédiation indicative**

- Émettre côté serveur un identifiant de lecteur signé/HMAC dans un cookie limité.
- Limiter la route par IP/article et ignorer les rafales.
- Agréger les compteurs au lieu de conserver indéfiniment un identifiant par lecture, ou purger régulièrement.

```js
const publicReadLimiter = rateLimit({ windowMs: 60_000, limit: 30 })
router.post('/articles/:id/read', publicReadLimiter, (req, res) => {
  const readerId = verifySignedReaderCookie(req.cookies.reader)
  if (!readerId) return res.status(400).end()
  recordBoundedRead(req.params.id, readerId)
  res.status(204).end()
})
```

### SEC-07 — Le changement de mot de passe ne révoque pas les sessions existantes

- **OWASP 2021 :** A07 — Identification and Authentication Failures
- **Sévérité :** **Moyenne**
- **Fichiers/lignes :** `server/routes/auth.js:93-108`, `server/auth/session.js:14-50`
- **Confiance :** élevée

**Risque et exploitation**

Une session dure 30 jours. Après changement du mot de passe, toutes les anciennes sessions restent valides. Si un cookie a été volé, la victime ne peut pas expulser l'attaquant en changeant son mot de passe ; le cookie compromis reste utilisable jusqu'à expiration ou logout depuis cette session précise.

**Remédiation indicative**

- Après changement de mot de passe, supprimer toutes les sessions de l'utilisateur.
- Émettre une nouvelle session uniquement pour la requête courante, ou forcer une reconnexion.
- Ajouter une page de gestion/révocation des appareils et éventuellement une rotation glissante contrôlée.

```js
db.transaction(() => {
  updatePassword.run(newHash, now, user.id)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id)
})()
const token = createSession(user.id, req.get('user-agent'))
res.cookie(SESSION_COOKIE, token, COOKIE_OPTS).json({ ok: true })
```

### SEC-08 — L'import social peut écrire sur les articles d'autres comptes

- **OWASP 2021 :** A01 — Broken Access Control
- **Sévérité :** **Moyenne**
- **Fichier/lignes :** `server/routes/import.js:266-340`, en particulier `:302-336`
- **Confiance :** élevée

**Risque et exploitation**

Lors de l'import `social_journal`, l'existence d'un article est vérifiée uniquement par son ID. L'article n'a pas besoin d'avoir été importé dans l'opération, d'appartenir au compte courant ou même d'être publié. Un utilisateur peut fabriquer un ZIP ciblant l'ID public d'un article tiers et injecter des commentaires avec un horodatage choisi, likes et lectures en contournant les contrôles de `socialJournal.js`. Pour un brouillon dont l'ID aurait fuité, cela crée une interaction non autorisée avec une ressource privée.

**Remédiation indicative**

- N'accepter les interactions que pour les articles importés dans la transaction ou pour un article publié accessible via la fonction d'autorisation normale.
- Ne pas ajouter un ID à `importedArticleIds` si l'`INSERT OR IGNORE` n'a rien créé.
- Réutiliser une fonction centrale `canInteractWithArticle()`.

```js
const allowed = importedArticleIds.has(articleId) || db.prepare(`
  SELECT 1 FROM articles
  WHERE id = ? AND status = 'published'
`).get(articleId)
if (!allowed) continue
```

### SEC-09 — Références de fichiers non autorisées dans audio, timer et résultats de quiz

- **OWASP 2021 :** A01 — Broken Access Control
- **Sévérité :** **Moyenne**
- **Fichiers/lignes :** `server/routes/voice.js:44-50`, `server/routes/timer.js:89-96`, `server/routes/questionnaires.js:65-88`
- **Confiance :** élevée

**Risque et exploitation**

Les champs `file_id`/`questionnaire_file_id` sont insérés comme clés étrangères sans vérifier que le fichier appartient à l'utilisateur ou lui est accessible. En connaissant un UUID tiers, un utilisateur peut rattacher ses propres enregistrements à la ressource d'un autre compte. Une différence entre succès et erreur de contrainte peut aussi servir d'oracle d'existence. La confidentialité directe reste limitée car les lectures filtrent généralement `user_id`, mais l'intégrité inter-tenant et le modèle d'autorisation sont violés.

**Remédiation indicative**

```js
if (file_id) {
  const check = requireFileAccess(db, file_id, req.user.id, 'read')
  if (check.error) return res.status(404).json({ error: 'Fichier introuvable' })
}
```

Appliquer le contrôle avant toute écriture et normaliser les réponses pour éviter un oracle 404/500.

### SEC-10 — Sanitation HTML maison fragile devant `dangerouslySetInnerHTML`

- **OWASP 2021 :** A03 — Injection
- **Sévérité :** **Moyenne**
- **Fichiers/lignes :** `client/src/utils/sanitizeHtml.js:9-41`, `client/src/components/Preview.jsx:33,48`, `GraphEditor.jsx:671,1090`, `PublicArticle.jsx:103,129`, `SocialJournal.jsx:355,386,416,474`
- **Confiance :** moyenne ; la CSP actuelle réduit fortement l'impact

**Risque et exploitation**

Le sanitizer repose sur une blacklist de balises/attributs et sur des préfixes de chaînes pour les URL. Les parseurs HTML/URL comportent de nombreux cas limites (caractères de contrôle dans le schéma, namespaces SVG/MathML, nouveaux attributs, mutations DOM). Les articles sont publics et peuvent contenir du Markdown/HTML stocké. Une future modification de CSP ou un contournement du filtre peut donc devenir un XSS stocké. La CSP `script-src 'self'` sans `unsafe-inline` constitue aujourd'hui une défense importante, mais elle ne doit pas remplacer un sanitizer éprouvé.

**Remédiation indicative**

- Remplacer la logique maison par DOMPurify à jour avec une politique explicite.
- Désactiver SVG/MathML si inutiles et valider les URL via `new URL()`.
- Ajouter une suite de payloads XSS automatisée et conserver la CSP stricte.

```js
import DOMPurify from 'dompurify'

export function sanitizeHtml(html) {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['form', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style', 'srcdoc'],
    ALLOW_DATA_ATTR: true,
  })
}
```

### SEC-11 — scrypt synchrone sur les routes publiques et unlock non limité

- **OWASP 2021 :** A04 — Insecure Design / A07 — Identification and Authentication Failures
- **Sévérité :** **Moyenne**
- **Fichiers/lignes :** `server/auth/password.js:19,30`, `server/routes/auth.js:23-24,31,61`, `server/routes/files.js:370-383,434-451`
- **Confiance :** élevée

**Risque et exploitation**

`crypto.scryptSync` bloque l'unique event loop Node et utilise un coût mémoire important. Les limiteurs login/register réduisent l'abus par IP, mais une attaque distribuée — ou un contournement du proxy — peut maintenir l'event loop occupée. L'endpoint de déverrouillage ne dispose d'aucun rate limit spécifique, ce qui permet des essais illimités avec une session propriétaire compromise.

**Remédiation indicative**

- Utiliser `crypto.scrypt` asynchrone via Promise et une file de concurrence bornée.
- Ajouter un limiteur par compte + IP sur password/unlock, avec backoff et journalisation.
- Ne jamais réduire le coût cryptographique pour résoudre le problème de charge.

```js
const scrypt = promisify(crypto.scrypt)
const actual = await authKdfQueue.add(() => scrypt(password, salt, KEYLEN, options))
```

### SEC-12 — `trust proxy = 1` inconditionnel peut permettre de contourner les limites IP

- **OWASP 2021 :** A05 — Security Misconfiguration / A07
- **Sévérité :** **Moyenne**
- **Fichier/ligne :** `server/index.js:17`
- **Confiance :** moyenne, dépend de la topologie de production

**Risque et exploitation**

La configuration suppose exactement un proxy de confiance. Si le serveur devient directement accessible, ou si la chaîne de proxies diffère, un client peut contrôler `X-Forwarded-For` et faire varier `req.ip`, contournant les limiteurs login/register. À l'inverse, une mauvaise profondeur peut regrouper tous les utilisateurs sous une même IP et créer un déni de service.

**Remédiation indicative**

```js
if (isRailway) {
  app.set('trust proxy', 1) // confirmer la topologie Railway réelle
} else {
  app.set('trust proxy', false)
}
```

En environnement complexe, configurer les CIDR exacts des proxies et tester `req.ip` avec les en-têtes réellement reçus.

### SEC-13 — Dépendances de production avec avis de sécurité connus

- **OWASP 2021 :** A06 — Vulnerable and Outdated Components
- **Sévérité :** **Moyenne**
- **Fichiers :** `server/package.json:15-16`, arbre installé `server/node_modules`
- **Confiance :** élevée sur les versions ; exploitabilité applicative variable

**Risque et exploitation**

L'arbre de production contient `body-parser@1.20.5` (faible) et `exceljs/node_modules/uuid@8.3.2` (modérée). Le cas `body-parser` est partiellement atténué parce que l'application passe des limites valides constantes. L'avis UUID cible des variantes/API buffer qui ne sont pas manifestement appelées par le projet, mais le composant vulnérable reste livré en production.

**Remédiation indicative**

- Mettre à jour Express/body-parser vers une résolution incluant `body-parser >= 1.20.6`.
- Pour ExcelJS, ne pas appliquer aveuglément le downgrade proposé par `npm audit`; tester une version amont corrigée, une `override` compatible ou une alternative maintenue.
- Geler la résolution dans un lockfile et ajouter des tests XLSX.

```json
{
  "overrides": {
    "body-parser": ">=1.20.6"
  }
}
```

Une override ne doit être conservée qu'après validation de compatibilité.

### SEC-14 — Vulnérabilités connues dans l'outillage de développement

- **OWASP 2021 :** A06 — Vulnerable and Outdated Components
- **Sévérité :** **Moyenne**
- **Fichiers/lignes :** `client/package.json:18-19`, `server/package.json:25`
- **Confiance :** élevée

**Risque et exploitation**

Vite 5.4.21/esbuild 0.21.5 sont affectés par plusieurs avis visant le serveur de développement, dont une traversée de chemin Windows classée élevée. `brace-expansion@5.0.6`, apporté par Nodemon, est aussi signalé élevé pour DoS algorithmique. Ces composants sont absents du runtime client de production (`npm audit --omit=dev` retourne zéro vulnérabilité), mais un serveur Vite exposé sur un réseau non fiable peut divulguer des fichiers du poste développeur.

**Remédiation indicative**

- Mettre à niveau Vite/plugin React vers une branche corrigée après test du build.
- Mettre à jour Nodemon/minimatch/brace-expansion.
- Lier Vite à loopback et ne jamais exposer le serveur de développement à Internet.

```js
export default defineConfig({
  server: { host: '127.0.0.1', strictPort: true }
})
```

### SEC-15 — Pas de journalisation de sécurité exploitable

- **OWASP 2021 :** A09 — Security Logging and Monitoring Failures
- **Sévérité :** **Moyenne**
- **Fichiers/lignes :** `server/index.js:90-96`, ensemble de `server/routes/`
- **Confiance :** élevée

**Risque et exploitation**

Le serveur ne journalise pas de manière structurée les échecs d'authentification, changements de mot de passe, créations de partage, échecs de contrôle d'accès, imports volumineux ou dépassements de rate limit. Une compromission de compte, une exfiltration par export ou un abus de stockage serait difficile à détecter et à investiguer.

**Remédiation indicative**

```js
securityLogger.warn({
  event: 'auth.login.failed',
  ip: req.ip,
  username_hash: hashForLogs(username),
  request_id: req.id,
})
```

Centraliser les logs, définir une rétention, des alertes et une redaction stricte. Ne jamais journaliser mots de passe, cookies, contenu de notes ou clés API.

### SEC-16 — Absence de gestionnaire d'erreurs global durci

- **OWASP 2021 :** A05 — Security Misconfiguration
- **Sévérité :** **Faible**
- **Fichier/lignes :** `server/index.js:64-86`
- **Confiance :** moyenne ; dépend de `NODE_ENV`

**Risque et exploitation**

Aucun middleware d'erreur global n'est monté après les routes. Express utilise donc son gestionnaire par défaut ; en mode non-production, celui-ci peut inclure une stack trace et des chemins locaux. Certaines erreurs de contrainte ou erreurs asynchrones non interceptées peuvent ainsi divulguer des détails d'implémentation si `NODE_ENV=production` n'est pas correctement imposé.

**Remédiation indicative**

```js
app.use((err, req, res, _next) => {
  logger.error({ err, request_id: req.id })
  res.status(Number(err.status) || 500).json({
    error: Number(err.status) < 500 ? err.message : 'Erreur interne',
  })
})
```

### SEC-17 — Ancien frontend avec XSS DOM latent s'il est redéployé

- **OWASP 2021 :** A03 — Injection
- **Sévérité :** **Faible**
- **Fichiers/lignes :** `static/app.js:484`, `static/js/notes.js:80`
- **Confiance :** élevée sur le sink, faible sur l'exposition

**Risque et exploitation**

Le frontend historique affecte directement `marked.parse(md)` à `innerHTML` sans sanitation. Il n'est pas servi par le backend actuel, donc la vulnérabilité n'est pas exploitable dans le chemin de production observé. Si `static/` est publié par Railway, un CDN, un serveur web annexe ou réactivé lors d'un rollback, une note contenant du HTML malveillant devient un XSS stocké.

**Remédiation indicative**

- Supprimer/archiver ce frontend s'il est définitivement obsolète, ou appliquer le même rendu DOMPurify que le client React.
- Ajouter une règle CI interdisant `innerHTML = marked(...)`.

```js
preview.innerHTML = DOMPurify.sanitize(marked.parse(md))
```

### SEC-18 — Images distantes dans les articles : balises de suivi côté lecteur

- **OWASP 2021 :** A04 — Insecure Design
- **Sévérité :** **Faible**
- **Fichiers/lignes :** `server/routes/socialJournal.js:302-326`, `server/index.js:39`, `client/src/components/PublicArticle.jsx:103-129`
- **Confiance :** élevée

**Risque et exploitation**

Un auteur peut publier une image de couverture ou une image Markdown distante en HTTP(S). La CSP autorise ces origines. À l'ouverture de l'article public, le navigateur du lecteur contacte le serveur de l'auteur, révélant au minimum IP, user-agent et heure de lecture. Helmet réduit la fuite de referrer, mais pas le tracking réseau. Ce comportement peut être indésirable pour un journal social.

**Remédiation indicative**

- Proxifier et mettre en cache les images avec validation DNS/IP anti-SSRF, limites de taille et réencodage.
- Ou n'autoriser que les images téléversées/data URL bornées.
- Informer explicitement les utilisateurs si les ressources externes restent autorisées.

```js
// Le client ne charge que l'URL interne réencodée.
const safeSrc = `/api/media-proxy/${approvedMediaId}`
```

## 5. Tableau de synthèse

| Faille | Fichier principal | Sévérité |
|---|---|---|
| SEC-01 Zip bomb sur import Obsidian | `server/routes/import.js` | Élevée |
| SEC-02 Sous-arbres de dossiers non chiffrés | `server/routes/files.js` | Élevée |
| SEC-03 Injection de formules XLSX | `server/spreadsheetXlsx.js` | Élevée |
| SEC-04 Dépendances serveur non verrouillées | `.gitignore`, `package.json` | Élevée |
| SEC-05 Aucun quota/rate limit sur opérations coûteuses | routes upload/import | Élevée |
| SEC-06 Lectures publiques falsifiables/non bornées | `publicSocialJournal.js` | Moyenne |
| SEC-07 Sessions non révoquées après changement de mot de passe | `auth.js`, `session.js` | Moyenne |
| SEC-08 Import social sans autorisation par article | `import.js` | Moyenne |
| SEC-09 Références file_id sans contrôle d'accès | voice/timer/questionnaires | Moyenne |
| SEC-10 Sanitizer HTML maison fragile | `sanitizeHtml.js` | Moyenne |
| SEC-11 scrypt synchrone et unlock non limité | auth/files | Moyenne |
| SEC-12 Confiance proxy inconditionnelle | `server/index.js` | Moyenne |
| SEC-13 Composants runtime vulnérables | `server/package.json` | Moyenne |
| SEC-14 Outillage de développement vulnérable | `client/package.json` | Moyenne |
| SEC-15 Journalisation de sécurité absente | backend global | Moyenne |
| SEC-16 Gestionnaire d'erreur global absent | `server/index.js` | Faible |
| SEC-17 XSS latent dans l'ancien frontend | `static/` | Faible |
| SEC-18 Tracking par images distantes | journal public | Faible |

## 6. Plan d'actions priorisé

### Quick wins — à traiter en premier

1. Versionner `server/package-lock.json` et remplacer les `npm install` de CI/déploiement par `npm ci`.
2. Mettre à jour les dépendances signalées, en séparant runtime et dev ; ne pas appliquer de downgrade ExcelJS sans test.
3. Ajouter un rate limit à `/api/public/social-journal/*/read`, aux imports/uploads, à l'unlock et au géocodage.
4. Révoquer toutes les sessions lors d'un changement de mot de passe.
5. Vérifier `file_id` avec `requireFileAccess()` dans voice/timer/questionnaires.
6. Fermer l'écriture d'interactions sociales sur des articles non autorisés lors de l'import.
7. Ajouter un gestionnaire d'erreur global et forcer `NODE_ENV=production` au déploiement.
8. Confirmer la topologie proxy réelle et rendre `trust proxy` conditionnel.
9. Retirer ou neutraliser le frontend `static/` s'il est obsolète.

### Chantiers de fond

1. Réécrire l'import ZIP en streaming avec budgets de décompression et isolation des jobs.
2. Concevoir des quotas de stockage/CPU par utilisateur et une file de traitement pour ZIP/XLSX/images.
3. Corriger le chiffrement récursif et définir une vraie politique pour WAL, sauvegardes et rotation des données en clair.
4. Introduire DOMPurify et une suite de régression XSS.
5. Partager une grammaire de formules sûre entre client et serveur ; neutraliser les formules non supportées à l'export.
6. Mettre en place une journalisation de sécurité structurée, corrélée et alertée.
7. Ajouter une gestion des sessions/appareils, révocation globale et éventuellement MFA si l'exposition devient publique.
8. Définir une politique de ressources distantes pour le journal public.

## 7. Architecture du coffre chiffré par utilisateur

Cette section a servi de modèle à l'implémentation de remédiation et n'est pas une vulnérabilité supplémentaire comptabilisée dans le tableau de synthèse. L'objectif est de rendre illisibles les dossiers chiffrés si un attaquant obtient la base SQLite active, tout en conservant un mot de passe unique pour ouvrir les dossiers chiffrés d'un utilisateur. Les sauvegardes créées avant l'activation du chiffrement doivent être supprimées selon une politique maîtrisée ou conservées sur un volume lui-même chiffré.

Le **chiffrement** et le **verrouillage** sont deux notions indépendantes : le chiffrement est un état persistant du stockage, tandis que le verrouillage est un état temporaire d'accès dans une session. Ouvrir un dossier chiffré ne doit jamais réécrire son contenu en clair dans SQLite; le serveur le déchiffre à la lecture et rechiffre chaque modification avant l'écriture.

### Modèle implémenté : un mot de passe, mais des clés de dossier distinctes

Il est possible de présenter à l'utilisateur un seul « mot de passe du coffre ». En revanche, ce mot de passe ne doit pas devenir directement une clé identique utilisée pour chiffrer tous les dossiers. Une réutilisation directe augmenterait l'impact d'une erreur de nonce et couplerait tous les contenus. Le bon objectif produit est donc « un même mot de passe », pas « une même clé de données ».

La hiérarchie implémentée est la suivante :

1. Le mot de passe du coffre passe dans une fonction de dérivation résistante aux attaques hors ligne, idéalement Argon2id ou, avec les primitives Node déjà présentes, scrypt asynchrone avec sel aléatoire et paramètres versionnés. Le résultat est une clé d'enveloppe (`KEK`).
2. Chaque dossier auquel le chiffrement est activé reçoit une clé de dossier aléatoire distincte (`FDK`, Folder Data Key).
3. La même `KEK` peut envelopper toutes les `FDK` du compte. SQLite conserve le sel, les paramètres KDF, la version et chaque `FDK` chiffrée, jamais le mot de passe, la `KEK` ou une `FDK` en clair.
4. Chaque fichier, révision ou objet sensible reçoit sa propre clé aléatoire (`DEK`). Cette `DEK` chiffre le contenu avec un algorithme authentifié, puis elle est elle-même chiffrée par la `FDK` de son dossier chiffré racine.
5. L'AAD lie le type et l'identité stable de l'objet (`file_id`, ou `file_id` + numéro de révision). Les clés de dossier distinctes isolent les comptes et dossiers. Lier aussi une version monotone conservée hors du ciphertext renforcerait encore la résistance aux restaurations malveillantes d'une ancienne valeur.

```text
Mot de passe du coffre
        │ scrypt/Argon2id + sel unique
        ▼
       KEK
        │
        ├──── ouvre FDK dossier A ────► DEK fichier A ───► ciphertext
        │
        └──── ouvre FDK dossier B ────► DEK fichier B ───► ciphertext
```

Le changement du mot de passe du coffre ne nécessite alors que de réenvelopper les `FDK` avec la nouvelle `KEK`; il n'impose pas de rechiffrer toutes les notes. Cette séparation DEK/KEK et le stockage séparé des clés sont conformes au modèle d'envelope encryption recommandé par [OWASP Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html) et aux principes de cycle de vie des clés d'[OWASP Key Management](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html).

### Données implémentées

Le schéma v19 utilise :

```sql
CREATE TABLE user_vaults (
  user_id TEXT PRIMARY KEY,
  kdf_name TEXT NOT NULL,
  kdf_salt BLOB NOT NULL,
  kdf_params_json TEXT NOT NULL,
  password_verifier TEXT NOT NULL,
  key_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE encrypted_folders (
  folder_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  wrapped_folder_key TEXT NOT NULL,
  crypto_version INTEGER NOT NULL
);

ALTER TABLE files ADD COLUMN is_encrypted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE files ADD COLUMN encrypted_folder_id TEXT;
ALTER TABLE file_revisions ADD COLUMN encrypted_content TEXT;
ALTER TABLE file_revisions ADD COLUMN encrypted_folder_id TEXT;
```

`files.encrypted_content` existait déjà et contient maintenant l'enveloppe versionnée. Les révisions possèdent leur propre enveloppe. Les mots de passe de connexion continuent à être hachés et restent indépendants du mot de passe du coffre.

### Chiffrement, ouverture et verrouillage : états distincts

| Chiffré en base | Verrouillé dans la session | Signification et affichage |
|---|---|---|
| Non | Non | Dossier normal, sans icône cryptographique. |
| Oui | Non | Dossier ouvert et utilisable, mais toujours chiffré dans SQLite; petite icône de bouclier ou clé. |
| Oui | Oui | Contenu inaccessible tant que le mot de passe n'est pas fourni; icône de chiffrement accompagnée d'un cadenas fermé. |
| Non | Oui | Verrouillage d'interface seulement, sans protection contre une fuite de base; à éviter ou à présenter explicitement comme une protection faible. |

- **Activer le chiffrement** est une action explicite et relativement lourde. Elle crée la `FDK`, puis chiffre récursivement dans une transaction les contenus et historiques, y compris les descendants déjà placés dans la corbeille. Les tags et liens dérivés sont supprimés. Les binaires audio/photo stockés hors SQLite ne font pas encore partie de cette enveloppe et doivent rester sur un volume chiffré et correctement cloisonné.
- **Ouvrir** un dossier chiffré déchiffre uniquement sa `FDK` pour la session courante. Le dossier reste chiffré au repos et reçoit toujours la petite icône indiquant cet état.
- **Verrouiller maintenant** retire la `FDK` de la mémoire de cette session et bloque les lectures suivantes; cette action ne rechiffre pas les fichiers, puisqu'ils n'ont jamais cessé d'être chiffrés en base.
- **Désactiver le chiffrement** est une troisième action, distincte et sensible : après confirmation et nouvelle saisie du mot de passe, elle réécrit récursivement le sous-arbre en clair et retire l'indicateur de chiffrement. Un avertissement explicite est requis.
- Tous les dossiers chiffrés du compte s'ouvrent avec le même mot de passe du coffre, mais chacun garde sa `FDK` et chaque objet sa `DEK`.
- L'état ouvert/verrouillé doit être attaché au couple session+dossier, jamais au compte global : ouvrir un dossier sur un navigateur ne doit ouvrir ni ce dossier sur les autres appareils, ni automatiquement les autres dossiers chiffrés de la même session.
- Après saisie correcte, seule la `FDK` du dossier sélectionné peut être conservée en mémoire serveur dans un `Buffer`, associée à l'identifiant de session et au dossier, avec une expiration courte (par exemple 10 à 15 minutes renouvelables). Elle est supprimée au verrouillage, logout, changement de mot de passe, expiration ou arrêt du processus. L'effacement mémoire en JavaScript reste une mesure de réduction du risque, pas une garantie absolue.
- Aucun mot de passe, `KEK`, `FDK`, `DEK` ou contenu déchiffré ne doit entrer dans les logs, cookies, `localStorage`, caches HTTP ou messages d'erreur.
- Les endpoints continuent à exécuter `requireFileAccess()` avant toute opération cryptographique. Posséder une clé en mémoire ne remplace jamais l'autorisation.
- L'ouverture est protégée par un rate limit par compte et IP, une file KDF à concurrence bornée et une journalisation de sécurité.

Sur une instance Node unique, le cache mémoire par session est réalisable. Un déploiement multi-instance exige soit une affinité de session, soit un service de clés externe. Il ne faut pas placer les `FDK` en clair dans Redis ou dans un cookie pour résoudre ce problème.

### Export ZIP : deux modes à distinguer

Deux modes sont à distinguer, car « demander le mot de passe » et « produire un ZIP sûr » ne sont pas la même propriété :

1. **Sauvegarde chiffrée — évolution recommandée, non implémentée.** Les objets protégés resteraient chiffrés dans le ZIP avec leurs enveloppes et métadonnées cryptographiques. Le ZIP volé resterait inutilisable.
2. **Export Obsidian en clair — implémenté pour la compatibilité.** L'interface redemande le mot de passe, le serveur déchiffre les fichiers en mémoire et les place dans le ZIP Markdown. Un avertissement explicite indique que le ZIP résultant contient les notes en clair. Le manifeste `_Opuscule/EncryptedFolders.json` permet à l'import de rechiffrer immédiatement les mêmes chemins.

Si un export Obsidian à la fois compatible et chiffré est souhaité, il faut chiffrer l'archive entière avec un format moderne utilisant AES et authentification. Le chiffrement ZIP historique « ZipCrypto » ne doit pas être utilisé. Un ZIP chiffré n'est cependant pas directement lisible par toutes les versions ou extensions d'Obsidian; la compatibilité doit être testée et documentée.

Le format de sauvegarde chiffrée doit contenir `crypto_version`, algorithme, paramètres KDF, sel, nonces, tags et clé de coffre enveloppée. Il ne doit jamais contenir le mot de passe ou une clé en clair. Une restauration doit authentifier le ciphertext avant toute écriture en base.

### Mot de passe perdu et récupération

Sans mécanisme supplémentaire, perdre le mot de passe du coffre signifie perdre définitivement tous les dossiers protégés. Deux politiques sont possibles :

- **Confidentialité maximale :** aucune récupération; l'interface impose un avertissement et un test de sauvegarde.
- **Clé de secours :** générer un secret de récupération aléatoire affiché une seule fois. Une clé dérivée de ce secret enveloppe également chaque `FDK`. Le serveur ne conserve que ces secondes enveloppes; l'utilisateur garde le secret hors ligne. Le support ne peut pas récupérer les notes sans ce secret.

Une « question secrète », un envoi du mot de passe par courriel ou une copie des `FDK` en clair côté serveur annuleraient une grande partie de la protection.

### Partages, recherche et métadonnées

Dans cette première version, un dossier chiffré n'est pas partageable et l'activation est refusée si un partage touche le sous-arbre. Gérer le partage chiffré correctement demanderait d'envelopper les clés pour chaque destinataire et de prévoir rotation/révocation; cela constitue un chantier cryptographique distinct.

La structure des dossiers, leurs noms, tailles, dates, tags et liens peuvent encore révéler des informations si ces métadonnées restent en clair. Les chiffrer améliore la confidentialité, mais réduit la recherche globale, le graphe, les tags et les liens wiki quand le coffre est fermé. Le compromis recommandé est :

- chiffrer actuellement contenu, révisions et corbeille; étendre ultérieurement l'enveloppe aux pièces jointes si elles doivent suivre le dossier;
- supprimer ou rendre indisponibles tags et liens dérivés tant que le dossier reste chiffré;
- documenter clairement les métadonnées qui restent visibles dans SQLite.

### Migration et limites de la protection

La migration doit se faire par lots vérifiés, avec double lecture temporaire, sauvegarde préalable et possibilité de reprise. Après validation, supprimer le texte en clair ne suffit pas : d'anciennes pages SQLite, le WAL, les fichiers temporaires et les anciennes sauvegardes peuvent encore le contenir. Il faut effectuer un checkpoint contrôlé, reconstruire ou nettoyer la base, puis expirer les sauvegardes en clair.

Ce coffre protège principalement contre le vol isolé de la base active ou d'une sauvegarde créée après activation du chiffrement. Si l'attaquant compromet simultanément le processus Node pendant que le coffre est ouvert, la session utilisateur, le mot de passe saisi ou les clés en mémoire, il peut encore lire les données. Pour empêcher même le serveur de voir le texte, il faudrait un chiffrement de bout en bout dans React; ce modèle aurait un impact beaucoup plus important sur le partage, la recherche, les liens et la récupération.

### Tests de sécurité réalisés et compléments recommandés

- **Réalisé :** chiffrement/déchiffrement authentifié, stockage SQLite sans plaintext, sous-dossiers/révisions/corbeille, mauvaise ouverture, verrouillage puis réouverture.
- **Réalisé :** export Obsidian avec manifeste, import vers un autre compte et vérification que le contenu restauré est rechiffré en base.
- **Réalisé :** nonces et clés générés par `crypto.randomBytes`, formules XLSX dangereuses et chemins ZIP hostiles.
- **À compléter :** corruption ciblée de chaque champ d'enveloppe et rollback/crash injecté au milieu d'une transaction.
- **À compléter :** isolation dynamique de deux sessions simultanées du même compte et changement de mot de passe couvrant plusieurs FDK.
- **À compléter :** recherche forensique de plaintext dans chaque sauvegarde/WAL/fichier temporaire et tests de charge KDF/import.
- **À compléter :** pièces jointes audio/photo si le périmètre produit exige qu'elles héritent du chiffrement d'un dossier.

## 8. Outils recommandés en CI/CD

### Dépendances et chaîne d'approvisionnement

- `npm ci` obligatoire avec lockfiles versionnés.
- `npm audit --omit=dev --audit-level=moderate` comme gate runtime.
- `npm audit` complet en job informatif séparé pour l'outillage.
- **Snyk** ou **GitHub Dependabot** pour avis transitifs et PR de mise à jour.
- **Socket.dev** ou `npm-package-json-lint` en option pour signaux de supply chain/scripts suspects.
- Génération d'un SBOM CycloneDX : `npx @cyclonedx/cyclonedx-npm`.

### SAST et qualité

- ESLint avec `eslint-plugin-security`, `eslint-plugin-no-unsanitized` et règles React.
- **Semgrep** avec règles OWASP Node/Express/React et règles personnalisées pour :
  - `dangerouslySetInnerHTML` sans DOMPurify ;
  - `marked(...)` vers `innerHTML` ;
  - insertion de clé étrangère `file_id` sans `requireFileAccess` ;
  - `multer.memoryStorage()` sans budget de décompression.
- **SonarQube/SonarCloud** pour taint analysis, duplications et suivi des hotspots.
- **CodeQL** GitHub pour JavaScript/TypeScript.
- **Gitleaks** ou **TruffleHog** sur commits et historique Git.

### DAST et tests de sécurité

- OWASP ZAP contre une instance éphémère avec parcours authentifié.
- Tests d'intégration multi-utilisateur : IDOR, partage view/edit, imports et brouillons.
- Corpus XSS (OWASP/XSS Filter Evasion) contre tous les rendus Markdown.
- Corpus malveillant ZIP/XLSX et tests de charge/mémoire.
- Tests d'en-têtes avec Mozilla Observatory ou SecurityHeaders.com sur l'URL réelle.

Exemple minimal de jobs :

```yaml
- run: npm ci --prefix server
- run: npm ci --prefix client
- run: npm audit --omit=dev --audit-level=moderate --prefix server
- run: npm audit --omit=dev --audit-level=moderate --prefix client
- run: npx eslint client/src server --plugin security
- run: semgrep --config p/owasp-top-ten --config p/nodejs
```

## 9. Contexte manquant et limites explicites

Les points suivants peuvent modifier la sévérité ou l'exploitabilité :

- La topologie exacte Railway/reverse proxy, les CIDR de confiance et l'exposition directe éventuelle de Node ne sont pas connus.
- Il n'est pas confirmé que `NODE_ENV=production`, TLS/HSTS, les ACL du volume et les sauvegardes sont correctement configurés sur l'instance réelle.
- Il n'est pas confirmé que le dossier `static/` est absent de tout CDN, hébergement secondaire ou ancien environnement.
- Le caractère volontairement public de l'inscription et le nombre attendu d'utilisateurs ne sont pas précisés.
- Aucun compte de test ni URL de staging n'a été fourni ; les contrôles multi-utilisateur n'ont donc pas été exploités dynamiquement.
- La politique Excel Desktop (Protected View, DDE, connexions externes) des utilisateurs n'est pas connue.
- La validité, la rotation et l'usage hors dépôt des variables `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` locales ne sont pas connus. Elles ne sont pas utilisées par l'interface active d'après la revue.
- La CI locale au dépôt est maintenant définie, mais les secrets et comptes Snyk/SonarQube de l'organisation n'ont pas été fournis; leurs jobs restent conditionnels.
- La sécurité du système hôte, de SQLite/volume, du compte Railway, du domaine, du DNS et des dépendances natives n'a pas été testée.
- L'audit n'a pas inclus de revue exhaustive de l'historique Git à l'aide de Gitleaks/TruffleHog, ces outils n'étant pas installés dans l'environnement.

## Conclusion

Les correctifs prioritaires de code ont été appliqués : imports bornés, chiffrement récursif distinct du verrouillage de session, formules Excel neutralisées, chaîne npm figée, quotas/rate limits, contrôles d'accès secondaires et sanitation renforcés. Le coffre protège une fuite isolée de la base active lorsqu'il est fermé ou ouvert, car le plaintext n'est pas réécrit dans SQLite. Il ne protège pas contre un serveur compromis pendant l'utilisation, un vol du mot de passe, une sauvegarde historique en clair ou une compromission de l'hôte. Un pentest authentifié multi-utilisateur et des tests dynamiques sur staging restent nécessaires avant d'affirmer un niveau de sécurité de production.
