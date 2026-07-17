# Déploiement Railway — Persistance des données (ZÉRO perte)

> **Le problème historique** : à chaque `git push`, Railway reconstruit un
> conteneur neuf avec un **disque éphémère**. La base SQLite
> (`philoweek_v2.db`) et les enregistrements audio vivaient sur ce disque →
> **tout était effacé à chaque déploiement**.
>
> **La solution** : stocker la base + les audios sur un **Volume Railway**
> (disque persistant qui survit aux déploiements). Le code s'y branche
> automatiquement via la variable `RAILWAY_VOLUME_MOUNT_PATH`.

---

## ⚙️ Configuration à faire UNE FOIS dans Railway

### 1. Créer un volume et l'attacher au service

**Via le dashboard** (le plus simple) :
1. Ouvre ton projet → clique sur le service **PhiloWeek**.
2. Onglet **Variables** / bouton **+ New** → **Volume** (ou onglet **Settings → Volumes**).
3. **Mount path** : `/data`
4. Valide. Railway injecte alors automatiquement `RAILWAY_VOLUME_MOUNT_PATH=/data`.

**Via la CLI** (équivalent) :
```bash
railway volume add --mount-path /data
```

> Le code lit `RAILWAY_VOLUME_MOUNT_PATH` en priorité. Si tu préfères un
> autre point de montage, mets-le où tu veux : le code suit. Tu peux aussi
> forcer un chemin avec la variable d'env `DATA_DIR`.

### 2. (Recommandé) Vérifier au démarrage

Dans les logs de déploiement Railway tu dois voir :
```
📦 Données persistées dans : /data
```
Si à la place tu vois :
```
⚠️  AUCUN VOLUME PERSISTANT DÉTECTÉ SUR RAILWAY.
```
→ le volume n'est pas attaché : recommence l'étape 1. **Ne pousse pas de
données tant que ce warning apparaît.**

---

## 🚚 Migration de tes données actuelles (à faire au 1er passage)

Comme le volume démarre vide, il faut y réinjecter tes données existantes
**une seule fois** :

1. **AVANT** de déployer cette version : dans l'app actuelle, clique sur
   **Export** (barre latérale) → tu télécharges un `.zip` Obsidian avec
   toutes tes notes.
2. Crée le volume (étape 1 ci-dessus) puis **déploie** (`git push`).
3. Ouvre l'app (elle sera vide) → **Import** → sélectionne le `.zip`.
4. C'est réinjecté sur le volume. **À partir de maintenant, chaque `git push`
   conserve tout.**

> Les notes vocales (audios) ne sont pas dans l'export ZIP. S'il y en a que
> tu tiens à garder, télécharge-les manuellement avant la bascule. Après la
> bascule elles vivent sur le volume et persistent.

---

## 🛟 Sécurités automatiques (déjà en place dans le code)

- **Sauvegarde avant migration** : à chaque démarrage, si le schéma doit
  changer, le serveur copie d'abord la base dans `<volume>/backups/`
  (30 dernières conservées). Un changement de structure ne peut donc pas
  détruire les données.
- **Migrations additives uniquement** : voir `server/db.js` → `MIGRATIONS`.
  On ne fait jamais de `DROP`. `PRAGMA user_version` garantit que chaque
  migration ne tourne qu'une fois.
- **Restauration manuelle** si besoin :
  ```bash
  # lister les sauvegardes
  railway run node server/scripts/restore-backup.js
  # restaurer la plus récente
  railway run node server/scripts/restore-backup.js latest
  ```

---

## 🧠 Comment changer le schéma plus tard SANS rien perdre

Dans `server/db.js`, **ajoute** une fonction à la fin du tableau
`MIGRATIONS` (n'en modifie jamais une déjà livrée) :

```js
const MIGRATIONS = [
  (db) => { /* v0 → v1 : schéma de base (déjà là) */ },
  (db) => {
    // v1 → v2 : ajouter une colonne, une table, un index...
    addColumnIfMissing(db, 'files', 'archived', "INTEGER NOT NULL DEFAULT 0")
    db.exec(`CREATE TABLE IF NOT EXISTS nouvelle_table (...)`)
  },
]
```

Au prochain déploiement : sauvegarde auto → migration v1→v2 → données
conservées. Rien à faire manuellement.

---

## Reconnaissance de l'écriture manuscrite

La conversion des traits manuscrits utilise MyScript. Ajoute ces deux variables
dans **Railway > Variables** :

```text
MYSCRIPT_APPLICATION_KEY=...
MYSCRIPT_HMAC_KEY=...
```

En local, place les mêmes variables dans le fichier `.env` à la racine du
projet. Ne mets jamais leurs valeurs dans Git : elles sont lues uniquement par
le serveur. Sans ces variables, le canvas reste utilisable mais le bouton de
conversion est désactivé avec une explication dans l'interface.
