const test = require('node:test')
const assert = require('node:assert/strict')
const questionnaireRouter = require('../routes/questionnaires')

const normalizeReviewQuestion = questionnaireRouter.normalizeReviewQuestion
const questionnaire = { id: 'quiz', title: 'Quiz' }
const file = { id: 'file-1', name: 'Quiz.json' }

test('normalizes zero-based MCQ correct_index and derives the answer', () => {
  const result = normalizeReviewQuestion({
    id: 'q2',
    type: 'mcq',
    prompt: 'Quelle est cette formule ?',
    choices: ['Le vrai sujet', 'Tu as raison', 'Ce n’est pas moi'],
    correct_index: 0,
  }, 0, questionnaire, file)

  assert.equal(result.correct_index, 0)
  assert.equal(result.answer, 'Le vrai sujet')
  assert.deepEqual(result.choices, ['Le vrai sujet', 'Tu as raison', 'Ce n’est pas moi'])
})

test('accepts numeric string indexes and answer-based MCQ fallbacks', () => {
  const indexed = normalizeReviewQuestion({
    type: 'mcq',
    prompt: 'Index texte',
    choices: ['A', 'B', 'C'],
    correct_index: '2',
  }, 0, questionnaire, file)
  const answered = normalizeReviewQuestion({
    type: 'mcq',
    prompt: 'Réponse textuelle',
    choices: ['A', 'B', 'C'],
    answer: ' b ',
  }, 1, questionnaire, file)

  assert.equal(indexed.correct_index, 2)
  assert.equal(indexed.answer, 'C')
  assert.equal(answered.correct_index, 1)
  assert.equal(answered.answer, 'B')
})

test('keeps an invalid MCQ correction unresolved instead of inventing an answer', () => {
  const result = normalizeReviewQuestion({
    type: 'mcq',
    prompt: 'Correction absente',
    choices: ['A', 'B'],
    correct_index: 5,
  }, 0, questionnaire, file)

  assert.equal(result.correct_index, null)
  assert.equal(result.answer, '')
})
