const express = require('express')
const router = express.Router()
const Anthropic = require('@anthropic-ai/sdk')
const { getDb } = require('../db')

const TOKEN_CHARS = 4
const DEFAULT_PROVIDER = 'anthropic'
const DEFAULT_MODEL = 'claude-sonnet-4-6'
const DEFAULT_MAX_TOKENS = 1200

const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const AI_MODELS = {
  anthropic: {
    label: 'Claude',
    keyEnv: 'ANTHROPIC_API_KEY',
    models: [
      {
        id: 'claude-sonnet-4-6',
        label: 'Claude Sonnet 4.6',
        description: 'Equilibre qualite, vitesse et cout pour l analyse philosophique.',
        inputUsdPerMTok: 3,
        outputUsdPerMTok: 15,
        defaultOutputTokens: 1200,
      },
      {
        id: 'claude-haiku-4-5',
        label: 'Claude Haiku 4.5',
        description: 'Rapide et economique pour les syntheses courtes.',
        inputUsdPerMTok: 1,
        outputUsdPerMTok: 5,
        defaultOutputTokens: 900,
      },
      {
        id: 'claude-opus-4-8',
        label: 'Claude Opus 4.8',
        description: 'Plus fort pour les analyses longues, plus cher.',
        inputUsdPerMTok: 5,
        outputUsdPerMTok: 25,
        defaultOutputTokens: 1600,
      },
    ],
  },
  openai: {
    label: 'OpenAI',
    keyEnv: 'OPENAI_API_KEY',
    models: [
      {
        id: 'gpt-5.5',
        label: 'GPT-5.5',
        description: 'Modele OpenAI fort pour raisonnement et redaction.',
        inputUsdPerMTok: 2.5,
        outputUsdPerMTok: 15,
        defaultOutputTokens: 1200,
      },
      {
        id: 'gpt-5.4-mini',
        label: 'GPT-5.4 mini',
        description: 'Bon compromis cout/qualite pour usage courant.',
        inputUsdPerMTok: 0.375,
        outputUsdPerMTok: 2.25,
        defaultOutputTokens: 1000,
      },
      {
        id: 'gpt-4.1-mini',
        label: 'GPT-4.1 mini',
        description: 'Modele stable et economique avec grand contexte.',
        inputUsdPerMTok: 0.4,
        outputUsdPerMTok: 1.6,
        defaultOutputTokens: 1000,
      },
    ],
  },
}

const SYSTEM_PROMPTS = {
  socratic: `Tu es un interlocuteur socratique exigeant integre dans une app de notes philosophiques.
L'utilisateur t'envoie le contenu de sa note. Genere exactement 3 questions qui exposent les presupposes caches,
les contradictions internes, ou les angles morts du raisonnement.
Pour chaque question, ajoute en italique une phrase expliquant pourquoi cette question est derangeante.
Format : **Question ?** *Pourquoi ca derange.*
Pas d'introduction ni de conclusion. Juste les 3 questions.`,

  critique: `Tu es un philosophe analytique direct et sans complaisance.
Lis la note et identifie les problemes logiques reels : sophismes, raisonnements circulaires, generalisations abusives,
termes flottants utilises comme s'ils etaient definis, sauts logiques non justifies.
Sois direct : "Ce raisonnement est circulaire parce que..." "Cette affirmation generalise a partir de...".
Pas de flatterie. Commence directement par le probleme le plus serieux.`,

  explorer: `Tu es un guide intellectuel precis. A partir de la note de l'utilisateur, propose :
**Penseurs** (3 noms + 1 phrase sur la connexion exacte avec la note)
**Textes** (3 titres specifiques + auteur + pourquoi ce texte precisement)
**Cadres alternatifs** (2 approches philosophiques non encore explorees dans la note)
Sois cible. Pas de recommandations generiques. Commence directement.`,

  synthesis: `Tu es un synthetiseur philosophique. En ~150 mots :
Synthetise les idees cles de la note. Identifie la tension centrale ou l'insight qui emerge.
Note ce qui reste ouvert ou non resolu.
Ton : reflexif et precis. Termine par une phrase qui nomme l'insight le plus important.`,

  profile: `Tu es un analyste philosophique. Tu as recu l'ensemble des notes d'un utilisateur.
Genere un portrait philosophique complet :
- **Positions recurrentes** (ce que l'auteur defend implicitement)
- **Valeurs dominantes**
- **Tensions internes** (contradictions, hesitations)
- **Questions obsessionnelles** (les 3 themes qui reviennent le plus)
- **Evolution notable** si discernable
Cite des extraits precis. Sois analytique. Longueur : 300-400 mots.`
}

function getModel(provider = DEFAULT_PROVIDER, modelId) {
  const providerConfig = AI_MODELS[provider] || AI_MODELS[DEFAULT_PROVIDER]
  const model = providerConfig.models.find(m => m.id === modelId) || providerConfig.models[0]
  return { providerConfig, model, provider: AI_MODELS[provider] ? provider : DEFAULT_PROVIDER }
}

function clampOutputTokens(value, fallback = DEFAULT_MAX_TOKENS) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(100, Math.min(8000, Math.round(n)))
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || '').length / TOKEN_CHARS))
}

function priceFor(model, inputTokens, outputTokens) {
  const inputUsd = (inputTokens / 1_000_000) * model.inputUsdPerMTok
  const outputUsd = (outputTokens / 1_000_000) * model.outputUsdPerMTok
  return {
    inputUsd,
    outputUsd,
    totalUsd: inputUsd + outputUsd,
  }
}

function buildCost(provider, model, inputTokens, outputTokens, estimated = false) {
  return {
    provider,
    model: model.id,
    estimated,
    inputTokens,
    outputTokens,
    inputUsdPerMTok: model.inputUsdPerMTok,
    outputUsdPerMTok: model.outputUsdPerMTok,
    ...priceFor(model, inputTokens, outputTokens),
  }
}

function getUserContent(db, fileId, mode) {
  let userContent = ''

  if (mode === 'profile') {
    const allFiles = db.prepare(
      "SELECT name, content FROM files WHERE type = 'file' AND content IS NOT NULL AND length(content) > 50"
    ).all()
    userContent = allFiles.map(f => `=== ${f.name} ===\n${f.content}`).join('\n\n---\n\n')
  } else if (fileId) {
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId)
    if (file) {
      userContent = `# ${file.name}\n\n${file.content || ''}`
      const linked = db.prepare(
        `SELECT f.name, f.content FROM file_links fl JOIN files f ON f.id = fl.target_id WHERE fl.source_id = ?`
      ).all(fileId)
      if (linked.length > 0) {
        userContent += '\n\n---\n*Notes liees :*\n'
        linked.forEach(l => { userContent += `\n## ${l.name}\n${(l.content || '').slice(0, 800)}\n` })
      }
    }
  }

  return userContent
}

function estimateRequest({ file_id, mode, provider, model, max_tokens }) {
  if (!SYSTEM_PROMPTS[mode]) {
    const error = new Error(`Unknown mode: ${mode}`)
    error.status = 400
    throw error
  }

  const db = getDb()
  const userContent = getUserContent(db, file_id, mode)
  const selected = getModel(provider, model)
  const outputTokens = clampOutputTokens(max_tokens, selected.model.defaultOutputTokens || DEFAULT_MAX_TOKENS)
  const inputTokens = estimateTokens(`${SYSTEM_PROMPTS[mode]}\n\n${userContent}`)

  return {
    provider: selected.provider,
    model: selected.model,
    userContent,
    maxTokens: outputTokens,
    cost: buildCost(selected.provider, selected.model, inputTokens, outputTokens, true),
  }
}

async function callAnthropic({ model, system, userContent, maxTokens }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const error = new Error('ANTHROPIC_API_KEY manquante dans .env')
    error.status = 400
    throw error
  }

  const response = await anthropicClient.messages.create({
    model: model.id,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userContent }]
  })

  return {
    text: response.content?.[0]?.text || '',
    usage: {
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    },
  }
}

async function callOpenAI({ model, system, userContent, maxTokens }) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('OPENAI_API_KEY manquante dans .env')
    error.status = 400
    throw error
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model.id,
      instructions: system,
      input: userContent,
      max_output_tokens: maxTokens,
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = data?.error?.message || response.statusText || 'OpenAI request failed'
    const error = new Error(message)
    error.status = response.status
    throw error
  }

  return {
    text: data.output_text || extractOpenAIText(data),
    usage: {
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
    },
  }
}

function extractOpenAIText(data) {
  const parts = []
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) parts.push(content.text)
    }
  }
  return parts.join('\n')
}

router.get('/models', (req, res) => {
  res.json({
    defaultProvider: DEFAULT_PROVIDER,
    defaultModel: DEFAULT_MODEL,
    providers: AI_MODELS,
  })
})

router.post('/estimate', (req, res) => {
  try {
    const estimate = estimateRequest(req.body)
    res.json({
      cost: estimate.cost,
      max_tokens: estimate.maxTokens,
      hasContent: Boolean(estimate.userContent.trim()),
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/generate', async (req, res) => {
  const { file_id, mode, provider, model, max_tokens } = req.body

  let estimate
  try {
    estimate = estimateRequest({ file_id, mode, provider, model, max_tokens })
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message })
  }

  if (mode === 'profile' && !estimate.userContent.trim()) {
    return res.json({ text: "Aucune note trouvee. Commence a ecrire des notes pour que je puisse analyser ta philosophie.", cost: estimate.cost })
  }

  if (!estimate.userContent.trim()) {
    return res.json({ text: "La note est vide. Commence a ecrire quelque chose !", cost: estimate.cost })
  }

  try {
    const result = estimate.provider === 'openai'
      ? await callOpenAI({
          model: estimate.model,
          system: SYSTEM_PROMPTS[mode],
          userContent: estimate.userContent,
          maxTokens: estimate.maxTokens,
        })
      : await callAnthropic({
          model: estimate.model,
          system: SYSTEM_PROMPTS[mode],
          userContent: estimate.userContent,
          maxTokens: estimate.maxTokens,
        })

    const inputTokens = result.usage.inputTokens || estimate.cost.inputTokens
    const outputTokens = result.usage.outputTokens || estimate.cost.outputTokens

    res.json({
      text: result.text,
      cost: buildCost(estimate.provider, estimate.model, inputTokens, outputTokens, !result.usage.inputTokens || !result.usage.outputTokens),
    })
  } catch (err) {
    console.error('AI error:', err.message)
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/active', async (req, res) => {
  const { paragraph } = req.body
  if (!paragraph || paragraph.trim().length < 30) return res.json({ text: null })

  try {
    const { model } = getModel(DEFAULT_PROVIDER, DEFAULT_MODEL)
    const response = await callAnthropic({
      model,
      maxTokens: 200,
      system: `Tu lis un fragment d'une note philosophique. Genere UNE seule reaction courte (1-2 phrases max) :
soit une question qui pousse l'auteur a preciser sa pensee, soit une tension que tu detectes dans ce paragraphe.
Sois direct et stimulant. Pas d'introduction.`,
      userContent: paragraph,
    })
    res.json({ text: response.text })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

module.exports = router
