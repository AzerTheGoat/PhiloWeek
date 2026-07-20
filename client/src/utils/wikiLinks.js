const FILE_EXTENSION_RE = /\.(md|json|xlsx)$/i
const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

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
    const target = match[1].trim()
    const part = match[2]?.trim() || ''
    const key = `${target.toLocaleLowerCase()}|${part.toLocaleLowerCase()}`
    if (!target || seen.has(key)) continue
    seen.add(key)
    links.push({ target, part, label: part || target })
  }
  return links
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
