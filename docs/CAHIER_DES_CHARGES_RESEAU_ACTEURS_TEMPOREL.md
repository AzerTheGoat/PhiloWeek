# Cahier des charges — Réseau d’acteurs temporel

## 1. Finalité

Créer un type de fichier Opuscule autonome, lisible et sauvegardable comme un JSON standard, pour :

- apprendre à reconnaître des personnes à partir de plusieurs portraits ;
- représenter aussi des organisations avec une image non nécessairement faciale ;
- comprendre les relations entre acteurs, avec une cause ou un mécanisme explicite ;
- consulter le même réseau à différentes années ;
- représenter les postes dont le titulaire change, sans dupliquer artificiellement le poste ;
- importer des données préparées ailleurs tout en gardant une validation humaine nœud par nœud.

Le type retenu est `actor_network`, dans un fichier `.json`. Il ne crée aucune table SQLite dédiée et reste donc compatible avec l’export/import Obsidian, l’historique, la corbeille, le partage et le chiffrement existants.

## 2. Enseignements de la recherche

### Reconnaissance des visages

La reconnaissance d’un visage inconnu généralise mal à partir d’un seul portrait. Les travaux sur la variabilité intra-personne montrent qu’un apprentissage avec plusieurs images prises lors de jours ou contextes différents améliore la reconnaissance de nouvelles images. La quantité seule ne suffit pas : la variation utile porte sur l’âge, la lumière, l’angle, la coiffure, l’expression et le contexte.

Décision produit : un acteur accepte plusieurs images, chacune datable, et le mode de mémorisation alterne ces images au lieu de répéter toujours le portrait principal.

Sources :

- [Multiple images captured from a single encounter do not promote face learning](https://pmc.ncbi.nlm.nih.gov/articles/PMC11088208/)
- [Understanding face identification through within-person variability](https://pmc.ncbi.nlm.nih.gov/articles/PMC7675770/)
- [Exemplar Variance Supports Robust Learning of Facial Identity](https://pmc.ncbi.nlm.nih.gov/articles/PMC4445380/)
- [Search templates that incorporate within-face variation improve visual search for faces](https://pmc.ncbi.nlm.nih.gov/articles/PMC6156691/)

Les tests d’association visage–nom utilisent une phase d’encodage puis une restitution à partir du visage. Le produit reprend cette logique sous forme de carte : visage seul, révélation de l’identité, puis auto-évaluation.

- [The Face-Name Associative Memory Test](https://pmc.ncbi.nlm.nih.gov/articles/PMC6102474/)

### Temps et changement de titulaire

Un fait ponctuel et un intervalle ne sont pas la même chose. Le modèle sépare :

- les dates biographiques (`birth_year`, `death_year`, `founded_year`, `dissolved_year`) ;
- la présence pertinente dans le graphe (`active_from`, `active_to`) ;
- la validité d’un mandat ou d’une relation (`from_year`, `to_year`).

Cette séparation suit la distinction instant/intervalle et bornes ouvertes décrite par OWL-Time.

- [W3C — Time Ontology in OWL](https://www.w3.org/TR/owl-time/)

Décision produit : un poste est un nœud stable `position`. Ses `assignments` associent un acteur au poste sur un intervalle inclusif. En changeant l’année, la carte du poste affiche automatiquement le titulaire correspondant.

### JSON, images et provenance

Le format est versionné et normalisé dans l’application. Le prompt demande exclusivement du JSON et interdit le base64 généré à l’extérieur. Les fichiers locaux sont compressés côté navigateur en WebP. Les URL doivent être HTTPS et peuvent conserver crédit, licence et page source.

- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)
- [MediaWiki API — Imageinfo](https://www.mediawiki.org/wiki/API:Imageinfo)
- [MediaWiki CommonsMetadata](https://www.mediawiki.org/wiki/Extension:CommonsMetadata/en)

## 3. Périmètre fonctionnel

### Création et navigation

- Création depuis `Fonctions > Créer`, clic droit sur une zone vide, un dossier ou un fichier.
- Extension `.json`, type racine `philoweek_type: actor_network`, `version: 1`.
- Ouverture dans un éditeur dédié et dans un onglet de fichier normal.
- Modes `Graphe` et `JSON` de secours.
- Autosave, annuler/rétablir, corbeille, partage et chiffrement hérités des fichiers.

### Nœuds

Types :

- `person` : nom, rôle, résumé, texte long, naissance/décès, images, dates clés ;
- `organization` : nom, nature, résumé, texte long, fondation/dissolution, images, dates clés ;
- `position` : intitulé stable et liste de titulaires datés.

Tous les nœuds ont une couleur de contour, une position libre sur le canvas et un intervalle de visibilité propre au sujet du fichier.

### Images

- Plusieurs images par nœud.
- Fichier local compressé ou URL HTTPS.
- Texte alternatif, légende, crédit, licence, URL source et période facultative.
- Affichage `object-fit: cover` dans le graphe et `contain` pendant la mémorisation.
- `referrerPolicy="no-referrer"` pour les images distantes.
- Une organisation peut utiliser un logo, un bâtiment, une scène ou un objet représentatif.

### Relations

- Relation orientée `from` → `to`.
- Libellé court obligatoire dans l’interface.
- Cause ou mécanisme explicatif obligatoire à la création et à la confirmation d’import.
- Intervalle facultatif et inclusif.
- Source HTTPS facultative.
- La relation n’est affichée que lorsque ses deux extrémités et son intervalle sont actifs.

### Temps

- Curseur, saisie numérique et bornes configurables.
- Les années négatives sont acceptées et affichées « av. J.-C. ».
- Option `Tout afficher` pour inspecter les nœuds hors période.
- Une personne décédée n’est pas automatiquement masquée : décès et pertinence historique sont deux informations différentes.
- Un poste sans titulaire connu reste identifiable comme tel.

### Mémorisation

- Session de 12 cartes maximum parmi les acteurs visibles pour l’année.
- Seuls les acteurs ayant une image participent.
- Image présentée sans nom, puis révélation de l’identité, du rôle, du résumé, du texte et des dates clés.
- Auto-évaluation `À revoir` / `Je savais`.
- Rotation des images d’un même acteur entre les passages.
- Progression exportable dans `learning.progress` avec nombre de vues, réussites, oublis, dernière révision et prochaine échéance.
- Intervalles de rappel : 1, 3, 7 jours puis multiplication progressive jusqu’à 60 jours ; un oubli revient à 1 jour.

### Prompt et import

- Le bouton `Prompt JSON` copie le format complet, les règles temporelles, l’obligation de cause et les règles de provenance des images.
- Import par fichier `.json` ou collage.
- Formats racine acceptés : réseau direct, propriété `network` ou `actor_network`.
- Revue séquentielle nœud par nœud : inclusion, type, nom, texte, période et images modifiables.
- Ajout d’une image locale ou distante pendant la confirmation.
- Étape finale de revue des relations ; une cause manquante bloque l’import de la relation retenue.
- Les relations dont une extrémité a été écartée sont ignorées.
- Les collisions d’identifiants sont remappées sans casser les mandats et relations.

## 4. Contrat JSON

```json
{
  "philoweek_type": "actor_network",
  "version": 1,
  "id": "reseau-stable",
  "title": "Titre",
  "description": "Périmètre",
  "tags": [],
  "created": "2026-07-22T00:00:00.000Z",
  "modified": "2026-07-22T00:00:00.000Z",
  "settings": {
    "min_year": 2010,
    "max_year": 2026,
    "default_year": 2026,
    "show_inactive": false
  },
  "nodes": [],
  "edges": [],
  "learning": { "progress": {} }
}
```

Les détails exhaustifs et un exemple de chaque type sont fournis par le bouton `Prompt JSON` dans l’application. Le normaliseur conserve les champs supplémentaires pour permettre des extensions futures, mais réécrit les champs connus dans une forme sûre et cohérente.

## 5. Exigences non fonctionnelles

- Aucun appel IA ou fournisseur depuis l’interface.
- Aucune nouvelle clé de configuration.
- Pas de téléchargement automatique d’images tierces.
- Import sans exécution de HTML ou de code.
- Limite d’image locale : 15 Mo avant compression, côté client.
- Canvas utilisable à la souris, au tactile et avec zoom ; panneau d’édition adapté au mobile.
- Les actions de révision restent fixes en bas sur mobile.
- Build React sans erreur et aucun changement de schéma SQLite.

## 6. Critères d’acceptation

1. Un fichier `actor_network` créé depuis chaque surface de création s’ouvre dans l’éditeur dédié.
2. Changer l’année 2016 → 2020 peut changer le titulaire affiché d’un même nœud `position`.
3. Une relation limitée à 2020–2022 est invisible en 2019 et visible en 2021.
4. Une personne accepte plusieurs portraits, avec provenance et période propres.
5. Le mode Mémoriser masque le nom, varie les images et sauvegarde l’auto-évaluation.
6. Un JSON importé passe par chaque nœud puis par les relations avant fusion.
7. Une relation retenue sans cause ne peut pas être importée.
8. Un export Obsidian contient le fichier JSON tel quel et le réimporte sans table spéciale.
9. L’éditeur reste utilisable sous 768 px et ne modifie pas l’UX desktop des autres vues.

## 7. Fichiers d’implémentation

- `client/src/utils/actorNetworkFile.js` : contrat, normalisation, prompt, import et résolution temporelle.
- `client/src/components/ActorNetworkEditor.jsx` : graphe, inspecteur, import et mémorisation.
- `client/src/index.css` : rendu desktop/mobile.
- `client/src/components/Editor.jsx`, `Sidebar.jsx`, `FileTree.jsx`, `Modals.jsx` : intégration au produit.
