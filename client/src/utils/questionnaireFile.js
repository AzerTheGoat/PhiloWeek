export function isQuestionnaireFile(file) {
  if (!file) return false
  if (/\.json$/i.test(file.name || '')) {
    try {
      const parsed = JSON.parse(file.content || '')
      return parsed?.philoweek_type === 'questionnaire' || Array.isArray(parsed?.questions)
    } catch (_) {
      return true
    }
  }
  return false
}

export function createQuestionnaireJson(title) {
  const now = new Date().toISOString()
  const slug = slugify(title)
  return JSON.stringify({
    philoweek_type: 'questionnaire',
    version: 1,
    id: slug,
    title,
    description: '',
    tags: [],
    source_paths: [],
    created: now,
    modified: now,
    questions: [
      {
        id: 'q1',
        type: 'open',
        prompt: 'Quelle idee principale dois-je retenir ?',
        answer: 'Reponse attendue, nuance ou correction.',
        explanation: '',
        tags: [],
      },
      {
        id: 'q2',
        type: 'mcq',
        prompt: 'Quelle proposition correspond le mieux au texte ?',
        choices: ['Option A', 'Option B', 'Option C'],
        answer: 'Option A',
        explanation: '',
        tags: [],
      },
      {
        id: 'q3',
        type: 'true_false',
        prompt: 'Cette affirmation est-elle correcte ?',
        answer: 'Vrai',
        explanation: '',
        tags: [],
      },
    ],
  }, null, 2)
}

export function parseQuestionnaireJson(content) {
  const parsed = JSON.parse(content || '{}')
  return {
    ...parsed,
    questions: Array.isArray(parsed.questions) ? parsed.questions : [],
  }
}

export function removeQuestionFromQuestionnaire(content, question) {
  const parsed = parseQuestionnaireJson(content)
  const questions = parsed.questions.slice()
  const expectedId = String(question?.question_id || '')
  let index = Number.isInteger(question?.index) ? question.index : -1
  if (expectedId) {
    const byId = questions.findIndex(item => String(item?.id || '') === expectedId)
    if (byId >= 0) index = byId
  }
  if (index < 0 || index >= questions.length) {
    throw new Error('Question introuvable dans le fichier JSON.')
  }
  questions.splice(index, 1)
  return JSON.stringify({
    ...parsed,
    questions,
    modified: new Date().toISOString(),
  }, null, 2)
}

export function setReviewItemRequireChange(content, question, required = true) {
  const parsed = JSON.parse(content || '{}')
  const rows = question.review_kind === 'definition'
    ? parsed.definitions
    : question.review_kind === 'actor'
      ? parsed.nodes
      : parsed.questions
  if (!Array.isArray(rows)) throw new Error('Élément de révision introuvable.')
  const expectedId = String(question.actor_key || question.question_id || '')
  let index = expectedId ? rows.findIndex(item => String(item?.id || '') === expectedId) : -1
  if (index < 0) index = Number(question.index)
  if (!rows[index]) throw new Error('Élément de révision introuvable.')
  if (required) rows[index].require_change = true
  else delete rows[index].require_change
  parsed.modified = new Date().toISOString()
  return JSON.stringify(parsed, null, 2)
}

export function recordActorReview(content, question, known) {
  const parsed = JSON.parse(content || '{}')
  if (parsed?.philoweek_type !== 'actor_network' || !question?.actor_key) {
    throw new Error('Réseau d’acteurs introuvable.')
  }
  const progress = parsed.learning?.progress || {}
  const current = progress[question.actor_key] || {}
  const previous = Number(current.interval_days || 0)
  const interval = known
    ? previous < 1 ? 1 : previous === 1 ? 3 : previous < 7 ? 7 : Math.min(60, Math.round(previous * 1.8))
    : 1
  const reviewed = new Date()
  const due = new Date(reviewed)
  due.setDate(due.getDate() + interval)
  return JSON.stringify({
    ...parsed,
    modified: reviewed.toISOString(),
    learning: {
      ...(parsed.learning || {}),
      progress: {
        ...progress,
        [question.actor_key]: {
          ...current,
          seen: Number(current.seen || 0) + 1,
          known: Number(current.known || 0) + (known ? 1 : 0),
          forgotten: Number(current.forgotten || 0) + (known ? 0 : 1),
          interval_days: interval,
          last_reviewed: reviewed.toISOString(),
          next_review: due.toISOString(),
        },
      },
    },
  }, null, 2)
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
