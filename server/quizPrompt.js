const matter = require('gray-matter')

function buildQuizGenerationPrompt({ source, sourcePath, quizPath }) {
  const parsed = safeMatter(source.content || '')
  const title = String(parsed.data?.title || source.name.replace(/\.md$/i, '')).trim()
  const tags = normalizeTags(parsed.data?.tags)
  const course = String(parsed.content || source.content || '').trim()

  return `Tu es un concepteur pedagogique rigoureux. Transforme la note Markdown fournie en un questionnaire de revision actif, fidele au contenu et directement importable dans Opuscule.

OBJECTIF
- Produire un quiz qui aide a retenir, comprendre, appliquer, analyser et evaluer le cours, pas un simple inventaire de details.
- Adapter les questions a la nature de la note : cours structure, fiche de lecture, concepts, chronologie, argumentation, politique, histoire ou actualite.
- Ne jamais inventer une information absente de la note. La note est la seule source de verite pour ce travail, meme si elle semble incomplete ou contestable.

METHODE DE CONCEPTION
1. Identifie silencieusement les 5 a 12 idees essentielles, les notions, relations, dates, acteurs, arguments, exemples et nuances.
2. Avant de rediger les questions, classe chaque idee cle identifiee en deux categories :
   (a) CONCEPT/MECANISME : une notion, un raisonnement, une definition, une structure de cause a effet qui reste valable et transferable en dehors du cas precis traite par la note.
   (b) FAIT ISOLE : une date, un nom propre, un chiffre, un evenement qui n'a de valeur que pour ce cas precis et n'illustre aucun mecanisme reutilisable.

   Priorise fortement (a). Pour (b), ne genere une question que si ce fait sert d'illustration a un mecanisme generalisable - dans ce cas, la question doit porter sur le mecanisme (le "comment" ou le "pourquoi" generalisable), et le fait precis de la note doit apparaitre dans la REPONSE comme illustration concrete, pas dans l'intitule de la question.

   Limite les questions de pure trivia factuelle (sans aucune portee conceptuelle) a 1 question maximum sur l'ensemble du quiz, reservee aux faits qu'il est reellement utile de memoriser tels quels (ex: un chiffre legal precis, une definition normative).
3. Cree entre 8 et 20 questions selon la richesse reelle de la note. Couvre les idees importantes sans doublon.
4. Repartis approximativement les questions ainsi :
   - 25 % rappel precis (notions, reperes, definitions utiles) ;
   - 35 % comprehension et reformulation ;
   - 25 % application, comparaison ou analyse d'un cas ;
   - 15 % evaluation d'un argument, d'une preuve, d'une limite ou d'une nuance.
5. Privilegie les questions ouvertes pour le rappel actif. Utilise aussi des QCM et vrai/faux lorsque ces formats sont reellement pertinents.
6. Chaque correction doit etre autonome, concise et assez precise pour servir de feedback apres une erreur. L'explication indique pourquoi la reponse est juste et, si utile, pourquoi une confusion est tentante.

CONTEXTE POUR UNE REVISION ALEATOIRE ET DIFFEREE
- Le questionnaire sera utilise plusieurs jours ou plusieurs mois plus tard. Ses questions pourront etre tirees au hasard et melangees avec celles d'autres notes.
- Chaque prompt doit donc etre entierement comprehensible tout seul, sans avoir relu la note juste avant et sans dependre du titre du questionnaire affiche par l'interface.
- Chaque prompt doit contenir deux parties dans la meme chaine : d'abord "Contexte :" avec 1 a 3 phrases factuelles, puis "Question :" avec la tache de rappel ou de raisonnement. N'ajoute pas de champ JSON context separe.
- Le contexte doit rappeler la situation concrete, les premisses de l'argument, la comparaison, la citation ou l'exemple necessaire pour reconstruire le probleme. Mentionner seulement le titre de la note, le nom d'une notion ou l'existence d'un exemple ne suffit pas.
- Donne assez d'elements pour qu'une personne qui n'a aucun souvenir recent de la note comprenne ce dont il est question. Privilegie l'intelligibilite plutot qu'un contexte artificiellement court.
- Le contexte peut fournir les donnees et indices necessaires au raisonnement, mais il ne doit pas enoncer la conclusion, la distinction, la cause ou la definition exacte que la question demande de retrouver.
- Le champ "Contexte" doit poser un cadre conceptuel ou un mecanisme, pas empiler des details factuels dont il suffirait de completer un seul pour repondre : evite l'effet "complete le blanc" qui pousse mecaniquement vers la trivia.
- N'utilise jamais seul des renvois vagues comme "selon le texte", "dans la note", "l'auteur", "cette idee", "ce passage", "la section 7" ou "ci-dessus". Nomme toujours explicitement leur referent dans la meme question.
- Teste mentalement chaque prompt en masquant answer, explanation, le titre du quiz et le reste du JSON : un utilisateur qui le decouvre au hasard doit comprendre la situation et savoir exactement quel raisonnement ou souvenir est demande. Si ce test echoue, reecris la question ou choisis un autre angle.

EXEMPLE DE CONTEXTUALISATION ATTENDUE
- Insuffisant : "Quelle difference la note etablit-elle entre desir et volonte, a partir de l'exemple 'Je veux reformer la sante' ?" Nommer l'exemple ne rappelle pas son raisonnement et laisse l'utilisateur perdu.
- Attendu : "Contexte : une personne affirme 'Je veux reformer la sante', mais ne precise encore ni priorites, ni moyens, ni calendrier. La note rapproche cette formule de l'envie d'acheter une montre sans avoir choisi de modele, de budget ou de caracteristiques. Question : quelle difference entre desir et volonte cette comparaison permet-elle de comprendre ?"
- Dans l'exemple attendu, les faits utiles sont presents, mais la conclusion a rappeler n'est pas formulee a la place de l'utilisateur.

Autre exemple (note factuelle/politique), pour eviter la trivia pure :
- Insuffisant : "Qui a fonde le RNI et quel est son lien avec Hassan II ?" Pure trivia, aucun concept transferable, question sans interet hors du contexte immediat.
- Attendu : "Contexte : un chef de gouvernement peut cumuler des fonctions executives et la direction, via des liens familiaux, d'un empire economique actif dans un secteur qu'il regule par ailleurs. Question : quel type de risque structurel un tel cumul cree-t-il, independamment du cas precis ?"
- Reponse attendue (avec le detail de la note en illustration) : "Un conflit d'interets structurel entre decision publique et interet prive. Exemple tire de la note : Aziz Akhannouch, chef du gouvernement marocain, dirige par ailleurs Akwa Group (hydrocarbures) via des liens familiaux, ce qui a suscite des accusations lors de l'attribution de marches publics dans ce secteur."

REGLES DE QUALITE
- Une seule competence ou idee principale par question.
- Formulation claire, sans double negation, sans piege lexical, sans "toutes les reponses" ni "aucune des reponses".
- Pour un QCM : exactement 3 choix, une seule meilleure reponse, deux distracteurs plausibles issus de confusions possibles dans la note, choix de longueur comparable, position de la bonne reponse variee.
- Pour un vrai/faux : l'affirmation doit etre sans ambiguite ; la reponse vaut exactement "Vrai" ou "Faux" et l'explication corrige la proposition si elle est fausse.
- Pour une question ouverte : la reponse attendue contient les elements indispensables permettant une auto-evaluation Juste/Faux ; accepte implicitement les reformulations equivalentes.
- Ne pose pas de question sur la mise en page, le nom du fichier ou une information triviale sans valeur d'apprentissage.
- Les tags des questions doivent etre courts et reutiliser en priorite les notions de la note.
- Chaque question doit rester pertinente et interessante meme sans connaitre le cas precis de la note : un lecteur doit pouvoir se demander "comment est-ce que ca marche en general ?" avant de se souvenir du cas particulier. Les details factuels propres a la note (noms, dates, chiffres) doivent etre places dans la reponse, comme illustration ou preuve, jamais comme unique objet de la question, sauf l'exception de trivia listee au point (b) de la methode de conception.

REGLES SPECIALES POUR POLITIQUE, HISTOIRE ET SUJETS CONTROVERSES
- Distingue explicitement : fait verifiable, affirmation normative, interpretation, comparaison et lien causal.
- N'erige jamais une opinion, une hypothese causale ou la position d'un auteur en fait etabli.
- Attribue les positions a leur auteur, courant, institution ou source lorsque la note le permet.
- Conserve les dates, le contexte, les conditions et les limites qui changent le sens d'une affirmation.
- Quand plusieurs perspectives figurent dans la note, represente-les equitablement et demande de comparer leurs arguments ou leurs preuves.
- Si une affirmation de la note est incertaine, non sourcee ou potentiellement evolutive, interroge sur ce statut ou cette limite ; ne la transforme pas en certitude.
- Pour evaluer un argument, demande quelle preuve le soutient, quelle hypothese il suppose, quel contre-argument est possible ou quelle information manquerait.

FORMAT DE SORTIE OBLIGATOIRE
- Reponds uniquement avec un objet JSON valide, sans balises Markdown, sans commentaire et sans texte avant ou apres.
- Utilise exactement cette structure generale :
{
  "philoweek_type": "questionnaire",
  "version": 1,
  "id": "${slugify(title)}",
  "title": ${JSON.stringify(`Quiz - ${title}`)},
  "description": "Une phrase decrivant les objectifs de revision.",
  "tags": ${JSON.stringify(tags)},
  "source_paths": [${JSON.stringify(sourcePath)}],
  "source_file_ids": [${JSON.stringify(String(source.id))}],
  "generated_from": { "source_path": ${JSON.stringify(sourcePath)}, "quiz_path": ${JSON.stringify(quizPath)} },
  "questions": [
    {
      "id": "q1",
      "type": "open",
      "prompt": "Contexte : 1 a 3 phrases rappelant la situation et les premisses utiles sans donner la conclusion. Question : tache precise de rappel ou de raisonnement ?",
      "answer": "Elements indispensables de la reponse attendue.",
      "explanation": "Feedback explicatif et nuance utile.",
      "tags": ["notion"]
    },
    {
      "id": "q2",
      "type": "mcq",
      "prompt": "Contexte : situation autonome et donnees utiles. Question : question contextualisee avec une seule meilleure reponse ?",
      "choices": ["Choix A", "Choix B", "Choix C"],
      "answer": "Le texte exact d'un des trois choix",
      "explanation": "Justification et correction des confusions.",
      "tags": ["notion"]
    },
    {
      "id": "q3",
      "type": "true_false",
      "prompt": "Contexte : cadre factuel necessaire. Question : affirmation precise a juger, sans ambiguite.",
      "answer": "Vrai",
      "explanation": "Justification ou rectification precise.",
      "tags": ["notion"]
    }
  ]
}
- Les identifiants de questions sont uniques et sequentiels : q1, q2, q3, etc.
- Echappe correctement les guillemets et retours a la ligne pour que JSON.parse accepte la reponse.
- Ne modifie jamais source_paths, source_file_ids ni generated_from.

NOTE SOURCE
Chemin : ${sourcePath}
Titre : ${title}
Tags : ${tags.join(', ') || 'aucun'}

--- DEBUT DE LA NOTE ---
${course}
--- FIN DE LA NOTE ---`
}

function buildEmptyGeneratedQuiz({ source, sourcePath, quizPath }) {
  const parsed = safeMatter(source.content || '')
  const title = String(parsed.data?.title || source.name.replace(/\.md$/i, '')).trim()
  const now = new Date().toISOString()
  return JSON.stringify({
    philoweek_type: 'questionnaire',
    version: 1,
    id: slugify(title),
    title: `Quiz - ${title}`,
    description: 'Colle ici le JSON produit a partir du prompt copie.',
    tags: normalizeTags(parsed.data?.tags),
    source_paths: [sourcePath],
    source_file_ids: [String(source.id)],
    generated_from: { source_path: sourcePath, quiz_path: quizPath },
    created: now,
    modified: now,
    questions: [],
  }, null, 2)
}

function safeMatter(content) {
  try { return matter(content) } catch (_) { return { data: {}, content } }
}

function normalizeTags(value) {
  if (!value) return []
  return (Array.isArray(value) ? value : [value]).map(String).map(tag => tag.trim()).filter(Boolean)
}

function slugify(value) {
  return String(value || 'questionnaire')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'questionnaire'
}

module.exports = { buildQuizGenerationPrompt, buildEmptyGeneratedQuiz }
