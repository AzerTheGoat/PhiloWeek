const express = require('express')
const rateLimit = require('express-rate-limit')
const crypto = require('crypto')

const router = express.Router()

const MYSCRIPT_ENDPOINT = 'https://cloud.myscript.com/api/v4.0/iink/recognize/'
const LANGUAGE_MODELS = {
  fr: { code: 'fr_FR', label: 'Français' },
  en: { code: 'en_US', label: 'English' },
  ar: { code: 'ar', label: 'العربية' },
}
const MAX_STROKES = 1000
const MAX_POINTS = 30000

const recognitionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de reconnaissances. Réessaie dans quelques minutes.', code: 'handwriting_rate_limited' },
})

router.get('/status', (_req, res) => {
  res.json({
    configured: hasCredentials(),
    provider: 'MyScript',
    languages: Object.entries(LANGUAGE_MODELS).map(([id, model]) => ({ id, label: model.label })),
  })
})

router.post('/recognize', recognitionLimiter, async (req, res) => {
  if (!hasCredentials()) {
    return res.status(503).json({
      error: 'MyScript doit être configuré sur le serveur avant la première reconnaissance.',
      code: 'handwriting_not_configured',
    })
  }

  const parsed = parseInk(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error, code: 'invalid_handwriting' })

  const requestBody = JSON.stringify({
    contentType: 'Text',
    scaleX: 25.4 / 96,
    scaleY: 25.4 / 96,
    configuration: {
      lang: parsed.model.code,
      export: {
        jiix: {
          strokes: false,
          'bounding-box': false,
        },
      },
    },
    strokes: parsed.strokes,
  })

  const applicationKey = process.env.MYSCRIPT_APPLICATION_KEY.trim()
  const hmacKey = process.env.MYSCRIPT_HMAC_KEY.trim()
  const hmac = crypto
    .createHmac('sha512', applicationKey + hmacKey)
    .update(requestBody, 'utf8')
    .digest('hex')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25000)

  try {
    const response = await fetch(MYSCRIPT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/vnd.myscript.jiix,application/json',
        applicationKey,
        hmac,
      },
      body: requestBody,
      signal: controller.signal,
    })

    const raw = await response.text()
    let result = null
    try { result = raw ? JSON.parse(raw) : null } catch (_) {}

    if (!response.ok) {
      return sendProviderError(res, response.status, result)
    }

    const text = extractRecognizedText(result)
    if (!text) {
      return res.status(422).json({
        error: `Aucun texte ${parsed.model.label} n’a été reconnu.`,
        code: 'handwriting_empty_result',
      })
    }

    res.json({
      text,
      language: parsed.language,
      provider: 'MyScript',
      candidates: extractCandidates(result),
    })
  } catch (error) {
    const timedOut = error?.name === 'AbortError'
    res.status(502).json({
      error: timedOut
        ? 'La reconnaissance manuscrite a pris trop de temps. Réessaie.'
        : 'Impossible de joindre le moteur de reconnaissance manuscrite.',
      code: timedOut ? 'handwriting_timeout' : 'handwriting_unavailable',
    })
  } finally {
    clearTimeout(timeout)
  }
})

function hasCredentials() {
  return Boolean(
    typeof process.env.MYSCRIPT_APPLICATION_KEY === 'string' && process.env.MYSCRIPT_APPLICATION_KEY.trim() &&
    typeof process.env.MYSCRIPT_HMAC_KEY === 'string' && process.env.MYSCRIPT_HMAC_KEY.trim()
  )
}

function parseInk(body) {
  const language = typeof body?.language === 'string' ? body.language : ''
  const model = LANGUAGE_MODELS[language]
  if (!model) return { error: 'Langue de reconnaissance invalide.' }

  const width = Number(body?.width)
  const height = Number(body?.height)
  if (!Number.isFinite(width) || width < 100 || width > 5000 || !Number.isFinite(height) || height < 100 || height > 5000) {
    return { error: 'Dimensions de la surface d’écriture invalides.' }
  }

  if (!Array.isArray(body?.strokes) || body.strokes.length === 0 || body.strokes.length > MAX_STROKES) {
    return { error: 'Les traits manuscrits sont absents ou trop nombreux.' }
  }

  let pointCount = 0
  const strokes = []
  for (const stroke of body.strokes) {
    const size = Array.isArray(stroke?.x) ? stroke.x.length : 0
    if (size < 2 || size > 5000 || !Array.isArray(stroke.y) || stroke.y.length !== size) {
      return { error: 'Un trait manuscrit est invalide.' }
    }
    pointCount += size
    if (pointCount > MAX_POINTS) return { error: 'L’écriture contient trop de points.' }

    const x = stroke.x.map(Number)
    const y = stroke.y.map(Number)
    const t = Array.isArray(stroke.t) && stroke.t.length === size ? stroke.t.map(Number) : null
    const p = Array.isArray(stroke.p) && stroke.p.length === size ? stroke.p.map(Number) : null
    if (
      x.some(value => !Number.isFinite(value) || value < 0 || value > width) ||
      y.some(value => !Number.isFinite(value) || value < 0 || value > height) ||
      t?.some(value => !Number.isFinite(value) || value < 0) ||
      p?.some(value => !Number.isFinite(value) || value <= 0 || value >= 1)
    ) {
      return { error: 'Les coordonnées d’un trait sont invalides.' }
    }

    const cleanStroke = { x, y }
    if (t) cleanStroke.t = t
    if (p) cleanStroke.p = p
    strokes.push(cleanStroke)
  }

  return { language, model, strokes }
}

function extractRecognizedText(result) {
  if (typeof result?.label === 'string' && result.label.trim()) return result.label.trim()
  if (!Array.isArray(result?.words)) return ''
  return result.words.map(word => word?.label || '').join('').trim()
}

function extractCandidates(result) {
  if (!Array.isArray(result?.words)) return []
  return result.words
    .filter(word => Array.isArray(word?.candidates) && word.candidates.length > 1)
    .slice(0, 30)
    .map(word => ({
      text: String(word.label || ''),
      alternatives: word.candidates.slice(0, 5).map(String),
    }))
}

function sendProviderError(res, status, payload) {
  const providerCode = String(payload?.code || payload?.error || '')
  if (status === 401) {
    return res.status(502).json({
      error: 'Les identifiants MyScript configurés sont invalides.',
      code: 'handwriting_bad_credentials',
    })
  }
  if (status === 403 && /counter|quota|threshold|empty/i.test(providerCode)) {
    return res.status(429).json({
      error: 'Le quota gratuit MyScript est épuisé.',
      code: 'handwriting_quota_exhausted',
    })
  }
  return res.status(502).json({
    error: 'Le moteur manuscrit a refusé la reconnaissance demandée.',
    code: 'handwriting_provider_error',
  })
}

module.exports = router
