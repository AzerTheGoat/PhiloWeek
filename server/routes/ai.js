const express = require('express')
const router = express.Router()
const Anthropic = require('@anthropic-ai/sdk')
const { getDb } = require('../db')

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPTS = {
  socratic: `Tu es un interlocuteur socratique exigeant intégré dans une app de notes philosophiques.
L'utilisateur t'envoie le contenu de sa note. Génère exactement 3 questions qui exposent les présupposés cachés,
les contradictions internes, ou les angles morts du raisonnement.
Pour chaque question, ajoute en italique une phrase expliquant pourquoi cette question est dérangeante.
Format : **Question ?** *Pourquoi ça dérange.*
Pas d'introduction ni de conclusion. Juste les 3 questions.`,

  critique: `Tu es un philosophe analytique direct et sans complaisance.
Lis la note et identifie les problèmes logiques réels : sophismes, raisonnements circulaires, généralisations abusives,
termes flottants utilisés comme s'ils étaient définis, sauts logiques non justifiés.
Sois direct : "Ce raisonnement est circulaire parce que..." "Cette affirmation généralise à partir de...".
Pas de flatterie. Commence directement par le problème le plus sérieux.`,

  explorer: `Tu es un guide intellectuel précis. À partir de la note de l'utilisateur, propose :
**Penseurs** (3 noms + 1 phrase sur la connexion exacte avec la note)
**Textes** (3 titres spécifiques + auteur + pourquoi ce texte précisément)
**Cadres alternatifs** (2 approches philosophiques non encore explorées dans la note)
Sois ciblé. Pas de recommandations génériques. Commence directement.`,

  synthesis: `Tu es un synthétiseur philosophique. En ~150 mots :
Synthétise les idées clés de la note. Identifie la tension centrale ou l'insight qui émerge.
Note ce qui reste ouvert ou non résolu.
Ton : réflexif et précis. Termine par une phrase qui nomme l'insight le plus important.`,

  profile: `Tu es un analyste philosophique. Tu as reçu l'ensemble des notes d'un utilisateur.
Génère un portrait philosophique complet :
- **Positions récurrentes** (ce que l'auteur défend implicitement)
- **Valeurs dominantes**
- **Tensions internes** (contradictions, hésitations)
- **Questions obsessionnelles** (les 3 thèmes qui reviennent le plus)
- **Évolution notable** si discernable
Cite des extraits précis. Sois analytique. Longueur : 300-400 mots.`
}

router.post('/generate', async (req, res) => {
  const { file_id, mode } = req.body
  if (!SYSTEM_PROMPTS[mode]) return res.status(400).json({ error: `Unknown mode: ${mode}` })

  const db = getDb()
  let userContent = ''

  if (mode === 'profile') {
    const allFiles = db.prepare(
      "SELECT name, content FROM files WHERE type = 'file' AND content IS NOT NULL AND length(content) > 50"
    ).all()
    userContent = allFiles.map(f => `=== ${f.name} ===\n${f.content}`).join('\n\n---\n\n')
    if (!userContent) {
      return res.json({ text: "Aucune note trouvée. Commence à écrire des notes pour que je puisse analyser ta philosophie." })
    }
  } else if (file_id) {
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(file_id)
    if (file) {
      userContent = `# ${file.name}\n\n${file.content || ''}`
      const linked = db.prepare(
        `SELECT f.name, f.content FROM file_links fl JOIN files f ON f.id = fl.target_id WHERE fl.source_id = ?`
      ).all(file_id)
      if (linked.length > 0) {
        userContent += '\n\n---\n*Notes liées :*\n'
        linked.forEach(l => { userContent += `\n## ${l.name}\n${(l.content || '').slice(0, 800)}\n` })
      }
    }
  }

  if (!userContent.trim()) {
    return res.json({ text: "La note est vide. Commence à écrire quelque chose !" })
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: SYSTEM_PROMPTS[mode],
      messages: [{ role: 'user', content: userContent }]
    })
    res.json({ text: response.content[0].text })
  } catch (err) {
    console.error('AI error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

router.post('/active', async (req, res) => {
  const { paragraph } = req.body
  if (!paragraph || paragraph.trim().length < 30) return res.json({ text: null })

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      system: `Tu lis un fragment d'une note philosophique. Génère UNE seule réaction courte (1-2 phrases max) :
soit une question qui pousse l'auteur à préciser sa pensée, soit une tension que tu détectes dans ce paragraphe.
Sois direct et stimulant. Pas d'introduction.`,
      messages: [{ role: 'user', content: paragraph }]
    })
    res.json({ text: response.content[0].text })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
