const VIEW_SLUGS = {
  timer: 'focus',
  journal: 'journal',
  inbox: 'idees',
  life: 'citations',
  todos: 'taches',
  agenda: 'agenda',
  'life-grid': 'vie',
  'knowledge-graph': 'liens',
  timeline: 'frise',
  elocution: 'elocution',
  roadtrips: 'voyages',
  'social-journal': 'articles',
  tutorial: 'aide',
  security: 'securite',
  'required-changes': 'a-modifier',
  'mobile-capture': 'capturer',
  trash: 'corbeille',
}

const VIEWS_BY_SLUG = Object.fromEntries(
  Object.entries(VIEW_SLUGS).map(([view, slug]) => [slug, view]),
)

export function appPathForState(view, fileId) {
  if (view !== 'editor' && VIEW_SLUGS[view]) {
    return `/app/views/${VIEW_SLUGS[view]}`
  }
  if (fileId) return `/app/files/${encodeURIComponent(fileId)}`
  return '/app'
}

export function parseAppPath(pathname) {
  const cleanPath = String(pathname || '/').replace(/\/+$/, '') || '/'
  const fileMatch = cleanPath.match(/^\/app\/files\/([^/]+)$/)
  if (fileMatch) {
    try {
      const fileId = decodeURIComponent(fileMatch[1])
      return fileId
        ? { kind: 'file', fileId, path: `/app/files/${encodeURIComponent(fileId)}` }
        : { kind: 'root', path: '/app' }
    } catch {
      return { kind: 'root', path: '/app' }
    }
  }

  const viewMatch = cleanPath.match(/^\/app\/views\/([^/]+)$/)
  if (viewMatch) {
    const slug = viewMatch[1].toLowerCase()
    const view = VIEWS_BY_SLUG[slug]
    if (view) return { kind: 'view', view, path: `/app/views/${VIEW_SLUGS[view]}` }
  }

  return { kind: 'root', path: '/app' }
}
