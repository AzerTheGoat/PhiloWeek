const test = require('node:test')
const assert = require('node:assert/strict')

const { buildQuizGenerationPrompt } = require('../quizPrompt')

test('le prompt de generation exige des questions autonomes pour la revision aleatoire', () => {
  const prompt = buildQuizGenerationPrompt({
    source: {
      id: 'note-1',
      name: 'Gen-Z Achachi.md',
      content: '---\ntitle: Gen-Z Achachi\ntags: [politique]\n---\n\nContenu de la note.',
    },
    sourcePath: 'Veille/Politique/Gen-Z Achachi.md',
    quizPath: 'Quiz generes/Veille/Politique/Gen-Z Achachi.json',
  })

  assert.match(prompt, /plusieurs jours ou plusieurs mois plus tard/)
  assert.match(prompt, /Chaque prompt doit donc etre entierement comprehensible tout seul/)
  assert.match(prompt, /N'utilise jamais seul des renvois vagues/)
  assert.match(prompt, /d'abord "Contexte :" avec 1 a 3 phrases factuelles, puis "Question :"/)
  assert.match(prompt, /Mentionner seulement le titre de la note, le nom d'une notion ou l'existence d'un exemple ne suffit pas/)
  assert.match(prompt, /une personne qui n'a aucun souvenir recent de la note/)
  assert.match(prompt, /Je veux reformer la sante/)
  assert.match(prompt, /ne doit pas enoncer la conclusion, la distinction, la cause ou la definition exacte/)
  assert.match(prompt, /Chemin : Veille\/Politique\/Gen-Z Achachi\.md/)
})
