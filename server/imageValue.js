const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|webp|gif);base64,/i

function normalizeImageValue(value) {
  const text = String(value || '').trim()
  if (!text) return null
  if (DATA_IMAGE_RE.test(text)) return text
  if (text.length > 2048) return null

  try {
    const url = new URL(text)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return url.href
  } catch (_) {
    return null
  }
}

module.exports = { normalizeImageValue }
