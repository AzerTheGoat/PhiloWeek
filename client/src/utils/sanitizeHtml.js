import DOMPurify from 'dompurify'

// Politique unique pour tous les rendus Markdown injectés avec
// dangerouslySetInnerHTML. DOMPurify assure la sécurité XSS; la seconde passe
// bloque par défaut les images distantes. Le journal public peut les autoriser
// explicitement, uniquement en HTTPS et sans envoyer le referrer.
export function sanitizeHtml(html, { allowRemoteImages = false } = {}) {
  const clean = DOMPurify.sanitize(String(html || ''), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['form', 'iframe', 'object', 'embed', 'link', 'meta', 'base'],
    FORBID_ATTR: ['style', 'srcdoc'],
    ALLOW_DATA_ATTR: true,
  })

  if (typeof document === 'undefined') return clean
  const template = document.createElement('template')
  template.innerHTML = clean
  template.content.querySelectorAll('img[src]').forEach(image => {
    const source = String(image.getAttribute('src') || '').trim()
    const isLocal = source.startsWith('data:image/') || source.startsWith('blob:') || source.startsWith('/')
    const isAllowedRemote = allowRemoteImages && /^https:\/\//i.test(source)
    if (!isLocal && !isAllowedRemote) {
      image.replaceWith(document.createTextNode('[image distante bloquée]'))
    } else if (isAllowedRemote) {
      image.setAttribute('referrerpolicy', 'no-referrer')
      image.setAttribute('loading', 'lazy')
      image.setAttribute('decoding', 'async')
    }
  })
  template.content.querySelectorAll('a[target="_blank"]').forEach(link => {
    link.setAttribute('rel', 'noopener noreferrer')
  })
  return template.innerHTML
}
