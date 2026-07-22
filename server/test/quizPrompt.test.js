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
  assert.match(prompt, /nom de la note ou de l'oeuvre/)
  assert.match(prompt, /il ne doit pas reveler la reponse/)
  assert.match(prompt, /Chemin : Veille\/Politique\/Gen-Z Achachi\.md/)
})
