const FILE_EXTENSION_RE = /\.(md|json|xlsx)$/i
const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g

export function buildFileNameIndex(files = []) {
  const index = new Map()
  files.forEach(file => {
    const name = String(file?.name || '').trim()
    if (!name || !file?.id) return
    index.set(name.toLocaleLowerCase(), file.id)
    const baseName = name.replace(FILE_EXTENSION_RE, '')
    if (!index.has(baseName.toLocaleLowerCase())) index.set(baseName.toLocaleLowerCase(), file.id)
  })
  return index
}

export function resolveWikiTarget(index, target) {
  return index.get(String(target || '').trim().toLocaleLowerCase()) || null
}

export function parseWikiLinks(value) {
  const links = []
  const seen = new Set()
  const text = String(value || '')
  WIKI_LINK_RE.lastIndex = 0
  let match
  while ((match = WIKI_LINK_RE.exec(text)) !== null) {
    const parsed = parseWikiLinkExpression(match[1])
    if (!parsed) continue
    const { target, part, label } = parsed
    const key = `${target.toLocaleLowerCase()}#${part.toLocaleLowerCase()}|${label.toLocaleLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    links.push(parsed)
  }
  return links
}

export function parseWikiLinkExpression(value) {
  const raw = String(value || '').trim()
  if (!raw) return null

  const pipeIndex = raw.indexOf('|')
  const destination = (pipeIndex >= 0 ? raw.slice(0, pipeIndex) : raw).trim()
  const alias = (pipeIndex >= 0 ? raw.slice(pipeIndex + 1) : '').trim()
  const hashIndex = destination.indexOf('#')
  const target = (hashIndex >= 0 ? destination.slice(0, hashIndex) : destination).trim()
  const explicitPart = (hashIndex >= 0 ? destination.slice(hashIndex + 1) : '').trim()

  // Compatibilite avec l'ancien format Opuscule [[Fichier|Partie]] :
  // sans # explicite, le texte apres | reste aussi une destination interne.
  const part = explicitPart || (hashIndex < 0 && alias ? alias : '')
  if (!target && !part) return null

  return {
    target,
    part,
    label: alias || explicitPart || target,
    explicitPart: Boolean(explicitPart),
  }
}

export function normalizeWikiPart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
