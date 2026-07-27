const express = require('express')

const router = express.Router()

router.get('/:language/:word', async (req, res) => {
  const language = req.params.language === 'en' ? 'en' : req.params.language === 'fr' ? 'fr' : null
  const word = String(req.params.word || '').normalize('NFC').trim()
  if (!language) return res.status(400).json({ error: 'Langue non prise en charge.' })
  if (!word || word.length > 80 || /[\r\n/\\]/.test(word)) {
    return res.status(400).json({ error: 'Mot invalide.' })
  }
  try {
    const result = language === 'en'
      ? await lookupEnglish(word)
      : await lookupFrench(word)
    if (!result.definitions.length) return res.status(404).json({ error: `Aucune définition trouvée pour « ${word} ».` })
    res.json(result)
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: `Aucune définition trouvée pour « ${word} ».` })
    res.status(502).json({ error: 'Le dictionnaire gratuit est momentanément indisponible.' })
  }
})

async function lookupEnglish(word) {
  const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw Object.assign(new Error('not found'), { status: response.status })
  const entries = await response.json()
  const definitions = []
  for (const entry of entries.slice(0, 3)) {
    for (const meaning of (entry.meanings || []).slice(0, 4)) {
      for (const item of (meaning.definitions || []).slice(0, 3)) {
        if (item.definition) definitions.push({
          part_of_speech: meaning.partOfSpeech || '',
          definition: String(item.definition),
          example: item.example ? String(item.example) : '',
        })
      }
    }
  }
  return {
    word: entries[0]?.word || word,
    language: 'en',
    phonetic: entries[0]?.phonetic || '',
    definitions: definitions.slice(0, 8),
    source: 'Free Dictionary API',
    source_url: entries[0]?.sourceUrls?.[0] || 'https://dictionaryapi.dev/',
  }
}

async function lookupFrench(word) {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'extracts',
    explaintext: '1',
    redirects: '1',
    titles: word,
    format: 'json',
    formatversion: '2',
    origin: '*',
  })
  const response = await fetch(`https://fr.wiktionary.org/w/api.php?${params}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Opuscule/2.0 dictionary lookup' },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error('wiktionary unavailable')
  const page = (await response.json())?.query?.pages?.[0]
  if (!page || page.missing || !page.extract) throw Object.assign(new Error('not found'), { status: 404 })
  const definitions = extractFrenchDefinitions(page.extract)
  return {
    word: page.title || word,
    language: 'fr',
    phonetic: '',
    definitions,
    source: 'Wiktionnaire',
    source_url: `https://fr.wiktionary.org/wiki/${encodeURIComponent(page.title || word)}`,
  }
}

function extractFrenchDefinitions(extract) {
  const lines = String(extract).split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const ignored = /^(français|étymologie|prononciation|traductions|synonymes|antonymes|dérivés|voir aussi|références|anagrammes)$/i
  const definitions = []
  let part = ''
  for (const line of lines) {
    if (ignored.test(line) || line.length < 3) continue
    if (/\\[^\\]{1,80}\\/.test(line)) continue
    if (/^(nom|verbe|adjectif|adverbe|interjection|préposition|pronom|conjonction)(\s|$)/i.test(line)) {
      part = line.slice(0, 50)
      continue
    }
    if (line.length >= 12 && line.length <= 500) {
      definitions.push({ part_of_speech: part, definition: line, example: '' })
    }
    if (definitions.length >= 8) break
  }
  return definitions
}

module.exports = router
