const express = require('express')

const router = express.Router()

const MAX_MERMAID_SOURCE = 50_000
const MAX_RENDER_BYTES = 5 * 1024 * 1024

router.post('/mermaid', async (req, res) => {
  const source = String(req.body?.source || '').trim()
  if (!source) return res.status(400).json({ error: 'Le diagramme Mermaid est vide.' })
  if (source.length > MAX_MERMAID_SOURCE) {
    return res.status(413).json({ error: 'Le diagramme Mermaid est trop volumineux.' })
  }
  const renderSource = req.body?.dark && !/^%%\{init:/i.test(source)
    ? `%%{init: {'theme':'dark'}}%%\n${source}`
    : source

  try {
    const response = await fetch('https://kroki.io/mermaid/png', {
      method: 'POST',
      headers: {
        Accept: 'image/png',
        'Content-Type': 'text/plain; charset=utf-8',
        'User-Agent': 'Opuscule/2.0 Mermaid renderer',
      },
      body: renderSource,
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      return res.status(422).json({ error: 'Ce diagramme Mermaid est invalide ou non pris en charge.' })
    }
    const declaredSize = Number(response.headers.get('content-length') || 0)
    if (declaredSize > MAX_RENDER_BYTES) {
      return res.status(413).json({ error: 'Le diagramme généré est trop volumineux.' })
    }
    const image = Buffer.from(await response.arrayBuffer())
    if (!image.length || image.length > MAX_RENDER_BYTES) {
      return res.status(502).json({ error: 'Le service de diagrammes a renvoyé une image invalide.' })
    }
    res.set('Cache-Control', 'private, max-age=86400')
    res.type('png').send(image)
  } catch (_) {
    res.status(502).json({ error: 'Le rendu Mermaid est momentanément indisponible.' })
  }
})

module.exports = router
