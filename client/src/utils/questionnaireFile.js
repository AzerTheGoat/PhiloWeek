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

function slugify(value) {
  return String(value || 'questionnaire')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'questionnaire'
}
