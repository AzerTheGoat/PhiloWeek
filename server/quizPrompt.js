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
2. Cree entre 8 et 20 questions selon la richesse reelle de la note. Couvre les idees importantes sans doublon.
3. Repartis approximativement les questions ainsi :
   - 25 % rappel precis (notions, reperes, definitions utiles) ;
   - 35 % comprehension et reformulation ;
   - 25 % application, comparaison ou analyse d'un cas ;
   - 15 % evaluation d'un argument, d'une preuve, d'une limite ou d'une nuance.
4. Privilegie les questions ouvertes pour le rappel actif. Utilise aussi des QCM et vrai/faux lorsque ces formats sont reellement pertinents.
5. Chaque correction doit etre autonome, concise et assez precise pour servir de feedback apres une erreur. L'explication indique pourquoi la reponse est juste et, si utile, pourquoi une confusion est tentante.

REGLES DE QUALITE
- Une seule competence ou idee principale par question.
- Formulation claire, sans double negation, sans piege lexical, sans "toutes les reponses" ni "aucune des reponses".
- Pour un QCM : exactement 3 choix, une seule meilleure reponse, deux distracteurs plausibles issus de confusions possibles dans la note, choix de longueur comparable, position de la bonne reponse variee.
- Pour un vrai/faux : l'affirmation doit etre sans ambiguite ; la reponse vaut exactement "Vrai" ou "Faux" et l'explication corrige la proposition si elle est fausse.
- Pour une question ouverte : la reponse attendue contient les elements indispensables permettant une auto-evaluation Juste/Faux ; accepte implicitement les reformulations equivalentes.
- Ne pose pas de question sur la mise en page, le nom du fichier ou une information triviale sans valeur d'apprentissage.
- Les tags des questions doivent etre courts et reutiliser en priorite les notions de la note.

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
      "prompt": "Question claire ?",
      "answer": "Elements indispensables de la reponse attendue.",
      "explanation": "Feedback explicatif et nuance utile.",
      "tags": ["notion"]
    },
    {
      "id": "q2",
      "type": "mcq",
      "prompt": "Question avec une seule meilleure reponse ?",
      "choices": ["Choix A", "Choix B", "Choix C"],
      "answer": "Le texte exact d'un des trois choix",
      "explanation": "Justification et correction des confusions.",
      "tags": ["notion"]
    },
    {
      "id": "q3",
      "type": "true_false",
      "prompt": "Affirmation sans ambiguite.",
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
