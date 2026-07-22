import DOMPurify from 'dompurify'

// Politique unique pour tous les rendus Markdown injectés avec
// dangerouslySetInnerHTML. DOMPurify assure la sécurité XSS; la seconde passe
// retire uniquement les images distantes afin d'éviter les pixels de suivi.
export function sanitizeHtml(html) {
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
    if (!source.startsWith('data:image/') && !source.startsWith('blob:') && !source.startsWith('/')) {
      image.replaceWith(document.createTextNode('[image distante bloquée]'))
    }
  })
  template.content.querySelectorAll('a[target="_blank"]').forEach(link => {
    link.setAttribute('rel', 'noopener noreferrer')
  })
  return template.innerHTML
}
