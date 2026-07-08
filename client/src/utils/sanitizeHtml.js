// Nettoyage du HTML issu de `marked()` avant injection via
// dangerouslySetInnerHTML. Utilisé par l'aperçu des notes (Preview.jsx) et
// par les cartes du graphe (GraphEditor.jsx) — même politique partout.
//
// On retire les balises exécutables/embarquantes, tous les attributs
// événementiels (on*), et on neutralise les URL dangereuses
// (javascript:, data: hors images) dans href/src/xlink:href.

const DANGEROUS_TAGS = 'script, style, iframe, object, embed, link, meta, base, form'
const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction']

export function sanitizeHtml(html) {
  if (typeof document === 'undefined') return html
  const template = document.createElement('template')
  template.innerHTML = String(html || '')

  template.content.querySelectorAll(DANGEROUS_TAGS).forEach(el => el.remove())

  template.content.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim()
      const lowered = value.toLowerCase()

      // Attributs événementiels : onerror, onclick, onload, etc.
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name)
        return
      }

      // URL potentiellement exécutables. On laisse passer data:image/* qui
      // sert légitimement aux images embarquées (base64).
      if (URL_ATTRS.includes(name)) {
        const isJs = lowered.startsWith('javascript:') || lowered.startsWith('vbscript:')
        const isBadData = lowered.startsWith('data:') && !/^data:image\//i.test(value)
        if (isJs || isBadData) el.removeAttribute(attr.name)
      }
    })
  })

  return template.innerHTML
}
