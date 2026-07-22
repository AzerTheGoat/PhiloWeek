const NODE_TYPES = new Set(['person', 'organization', 'position'])

export const ACTOR_NODE_TYPES = [
  { value: 'person', label: 'Personne', color: '#6ba3e8' },
  { value: 'organization', label: 'Organisation', color: '#a08be0' },
  { value: 'position', label: 'Poste', color: '#d69d55' },
]

export function isActorNetworkFile(file) {
  if (!file || !/\.json$/i.test(file.name || '')) return false
  try {
    return JSON.parse(file.content || '{}')?.philoweek_type === 'actor_network'
  } catch (_) {
    return false
  }
}

export function createActorNetworkJson(title) {
  const now = new Date().toISOString()
  const currentYear = new Date().getFullYear()
  return stringifyActorNetwork({
    philoweek_type: 'actor_network',
    version: 1,
    id: slugify(title),
    title,
    description: '',
    tags: [],
    created: now,
    modified: now,
    settings: {
      min_year: currentYear - 10,
      max_year: currentYear,
      default_year: currentYear,
      show_inactive: false,
    },
    nodes: [],
    edges: [],
    learning: { progress: {} },
  })
}

export function parseActorNetworkJson(content) {
  const parsed = typeof content === 'string' ? JSON.parse(content || '{}') : content
  if (parsed?.philoweek_type !== 'actor_network') {
    throw new Error('Ce JSON n’est pas un réseau d’acteurs Opuscule.')
  }
  return normalizeActorNetwork(parsed)
}

export function stringifyActorNetwork(network) {
  return JSON.stringify(normalizeActorNetwork({
    ...network,
    philoweek_type: 'actor_network',
    version: 1,
    modified: new Date().toISOString(),
  }), null, 2)
}

export function normalizeActorNetwork(value) {
  const source = value && typeof value === 'object' ? value : {}
  const nodes = Array.isArray(source.nodes) ? source.nodes.map(normalizeNode) : []
  const ids = new Set(nodes.map(node => node.id))
  const edges = (Array.isArray(source.edges) ? source.edges : [])
    .map(normalizeEdge)
    .filter(edge => ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to)
  const range = deriveYearRange({ ...source, nodes, edges })
  const settings = source.settings && typeof source.settings === 'object' ? source.settings : {}
  const minYear = toYear(settings.min_year) ?? range.min
  const maxYear = Math.max(minYear, toYear(settings.max_year) ?? range.max)
  return {
    ...source,
    philoweek_type: 'actor_network',
    version: 1,
    id: cleanText(source.id, 100) || slugify(source.title || 'reseau-acteurs'),
    title: cleanText(source.title, 180) || 'Réseau d’acteurs',
    description: cleanText(source.description, 5000),
    tags: normalizeTags(source.tags),
    created: cleanText(source.created, 80) || new Date().toISOString(),
    modified: cleanText(source.modified, 80) || new Date().toISOString(),
    settings: {
      min_year: minYear,
      max_year: maxYear,
      default_year: clamp(toYear(settings.default_year) ?? maxYear, minYear, maxYear),
      show_inactive: Boolean(settings.show_inactive),
    },
    nodes,
    edges,
    learning: {
      progress: source.learning?.progress && typeof source.learning.progress === 'object'
        ? source.learning.progress
        : {},
    },
  }
}

export function normalizeNode(value, index = 0) {
  const source = value && typeof value === 'object' ? value : {}
  const type = NODE_TYPES.has(source.type) ? source.type : 'person'
  const defaultColor = ACTOR_NODE_TYPES.find(item => item.value === type)?.color || '#6ba3e8'
  return {
    ...source,
    id: cleanId(source.id) || makeActorId('n'),
    type,
    name: cleanText(source.name || source.title, 180) || `Acteur ${index + 1}`,
    subtitle: cleanText(source.subtitle || source.role, 240),
    summary: cleanText(source.summary, 1200),
    details: cleanText(source.details || source.description, 12000),
    active_from: toYear(source.active_from),
    active_to: toYear(source.active_to),
    birth_year: toYear(source.birth_year),
    death_year: toYear(source.death_year),
    founded_year: toYear(source.founded_year),
    dissolved_year: toYear(source.dissolved_year),
    color: normalizeColor(source.color, defaultColor),
    x: finiteNumber(source.x, 120 + (index % 4) * 270),
    y: finiteNumber(source.y, 100 + Math.floor(index / 4) * 260),
    images: (Array.isArray(source.images) ? source.images : source.image ? [{ src: source.image }] : [])
      .map(normalizeImage)
      .filter(image => image.src),
    dates: (Array.isArray(source.dates) ? source.dates : [])
      .map(normalizeDate)
      .filter(item => item.year !== null && item.label),
    assignments: type === 'position'
      ? (Array.isArray(source.assignments) ? source.assignments : []).map(normalizeAssignment).filter(item => item.entity_id)
      : [],
  }
}

export function normalizeEdge(value) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    ...source,
    id: cleanId(source.id) || makeActorId('e'),
    from: cleanId(source.from),
    to: cleanId(source.to),
    label: cleanText(source.label || source.type, 140) || 'est lié à',
    cause: cleanText(source.cause || source.explanation || source.description, 4000),
    from_year: toYear(source.from_year ?? source.valid_from),
    to_year: toYear(source.to_year ?? source.valid_to),
    source_url: safeHttps(source.source_url || source.source),
    color: normalizeColor(source.color, '#7f8da5'),
  }
}

export function deriveYearRange(network) {
  const years = []
  const push = value => {
    const year = toYear(value)
    if (year !== null) years.push(year)
  }
  ;(network?.nodes || []).forEach(node => {
    ;['active_from', 'active_to', 'birth_year', 'death_year', 'founded_year', 'dissolved_year'].forEach(key => push(node[key]))
    ;(node.dates || []).forEach(item => push(item.year))
    ;(node.images || []).forEach(item => { push(item.from_year); push(item.to_year) })
    ;(node.assignments || []).forEach(item => { push(item.from_year); push(item.to_year) })
  })
  ;(network?.edges || []).forEach(edge => { push(edge.from_year); push(edge.to_year) })
  const current = new Date().getFullYear()
  return years.length
    ? { min: Math.min(...years), max: Math.max(...years) }
    : { min: current - 10, max: current }
}

export function isActiveAtYear(item, year, fromKey = 'active_from', toKey = 'active_to') {
  const from = toYear(item?.[fromKey])
  const to = toYear(item?.[toKey])
  return (from === null || year >= from) && (to === null || year <= to)
}

export function resolveActorNode(node, nodes, year) {
  if (!node) return null
  if (node.type !== 'position') {
    return { node, entity: node, assignment: null, displayName: node.name, displaySubtitle: node.subtitle }
  }
  const assignment = (node.assignments || []).find(item => isActiveAtYear(item, year, 'from_year', 'to_year')) || null
  const entity = assignment ? nodes.find(item => item.id === assignment.entity_id) || null : null
  return {
    node,
    entity,
    assignment,
    displayName: entity?.name || 'Titulaire non renseigné',
    displaySubtitle: node.name,
  }
}

export function pickActorImage(entity, year, seed = 0) {
  const images = (entity?.images || []).filter(image => isActiveAtYear(image, year, 'from_year', 'to_year'))
  const pool = images.length ? images : (entity?.images || [])
  if (!pool.length) return null
  return pool[Math.abs(Number(seed) || 0) % pool.length]
}

export function parseActorNetworkImport(text) {
  let parsed
  try { parsed = JSON.parse(text) } catch (_) { throw new Error('JSON invalide.') }
  const source = parsed?.actor_network || parsed?.network || parsed
  if (!source || !Array.isArray(source.nodes)) {
    throw new Error('Le JSON doit contenir un tableau nodes.')
  }
  const normalized = normalizeActorNetwork({
    philoweek_type: 'actor_network',
    version: 1,
    title: source.title || 'Import',
    description: source.description || '',
    tags: source.tags || [],
    settings: source.settings || {},
    nodes: source.nodes,
    edges: source.edges || source.relations || [],
  })
  if (!normalized.nodes.length) throw new Error('Le JSON ne contient aucun nœud exploitable.')
  return normalized
}

export function mergeActorNetwork(base, imported, selectedIds = null) {
  const chosen = selectedIds ? new Set(selectedIds) : new Set(imported.nodes.map(node => node.id))
  const used = new Set(base.nodes.map(node => node.id))
  const idMap = new Map()
  const nodes = imported.nodes.filter(node => chosen.has(node.id)).map(node => {
    let id = node.id
    while (used.has(id)) id = makeActorId(node.type === 'position' ? 'poste' : 'acteur')
    used.add(id)
    idMap.set(node.id, id)
    return { ...node, id }
  })
  const mergedNodes = nodes.map(node => ({
    ...node,
    assignments: node.assignments
      .filter(item => idMap.has(item.entity_id) || used.has(item.entity_id))
      .map(item => ({ ...item, entity_id: idMap.get(item.entity_id) || item.entity_id })),
  }))
  const edges = imported.edges
    .filter(edge => chosen.has(edge.from) && chosen.has(edge.to))
    .map(edge => ({ ...edge, id: makeActorId('e'), from: idMap.get(edge.from), to: idMap.get(edge.to) }))
  return normalizeActorNetwork({
    ...base,
    nodes: [...base.nodes, ...mergedNodes],
    edges: [...base.edges, ...edges],
    settings: {
      ...base.settings,
      min_year: Math.min(base.settings.min_year, imported.settings.min_year),
      max_year: Math.max(base.settings.max_year, imported.settings.max_year),
    },
  })
}

export function buildActorNetworkPrompt(title = 'Réseau d’acteurs') {
  return `Crée un fichier JSON Opuscule de type actor_network sur le sujet « ${title} ».

Retourne UNIQUEMENT du JSON valide, sans bloc Markdown ni commentaire. Utilise exactement cette structure :
{
  "philoweek_type": "actor_network",
  "version": 1,
  "title": "Titre précis",
  "description": "Périmètre et angle du réseau",
  "tags": ["tag"],
  "settings": { "min_year": 2010, "max_year": 2026, "default_year": 2026, "show_inactive": false },
  "nodes": [
    {
      "id": "personne-identifiant-stable",
      "type": "person",
      "name": "Nom complet",
      "subtitle": "Fonction ou élément distinctif",
      "summary": "Deux phrases mémorisables",
      "details": "Texte factuel plus développé",
      "birth_year": 1970,
      "death_year": null,
      "active_from": 2012,
      "active_to": null,
      "color": "#6ba3e8",
      "x": 120,
      "y": 100,
      "images": [{ "src": "https://...", "alt": "Portrait de ...", "caption": "Contexte ou époque", "credit": "Auteur", "license": "Licence", "source_url": "https://...", "from_year": 2020, "to_year": null }],
      "dates": [{ "id": "date-1", "year": 2020, "label": "Événement clé", "description": "Pourquoi cette date compte" }],
      "assignments": []
    },
    {
      "id": "organisation-identifiant-stable",
      "type": "organization",
      "name": "Organisation",
      "subtitle": "Nature de l’organisation",
      "summary": "Rôle dans le réseau",
      "details": "Description factuelle",
      "founded_year": 1945,
      "dissolved_year": null,
      "active_from": 1945,
      "active_to": null,
      "color": "#a08be0",
      "x": 430,
      "y": 100,
      "images": [],
      "dates": [],
      "assignments": []
    },
    {
      "id": "poste-ministre-sante",
      "type": "position",
      "name": "Ministre de la Santé",
      "subtitle": "Poste institutionnel",
      "summary": "Responsabilité du poste",
      "details": "Périmètre exact",
      "active_from": 1958,
      "active_to": null,
      "color": "#d69d55",
      "x": 270,
      "y": 380,
      "images": [],
      "dates": [],
      "assignments": [{ "id": "mandat-1", "entity_id": "personne-identifiant-stable", "from_year": 2020, "to_year": 2022, "label": "Titulaire", "notes": "Contexte du mandat", "source_url": "https://..." }]
    }
  ],
  "edges": [{ "id": "relation-1", "from": "personne-identifiant-stable", "to": "organisation-identifiant-stable", "label": "nomme", "cause": "Cause ou mécanisme précis de la relation", "from_year": 2020, "to_year": 2022, "source_url": "https://...", "color": "#7f8da5" }]
}

Règles obligatoires :
- type vaut person, organization ou position. Un poste qui change de titulaire au fil des années est un nœud position avec assignments pointant vers des nœuds person ou organization.
- Chaque relation doit relier deux id existants, contenir un label court ET une cause explicative; indique from_year/to_year quand elle n’est pas permanente.
- birth_year/death_year et founded_year/dissolved_year sont biographiques. active_from/active_to indiquent seulement la présence pertinente dans CE graphe : ne les confonds pas.
- Ajoute plusieurs images d’une personne quand c’est possible, prises à des époques, angles ou contextes différents. Les portraits historiques et personnes décédées sont acceptés.
- Pour une organisation, l’image peut être un logo, un bâtiment, un objet ou une scène représentative.
- Les images doivent être des URL HTTPS directes et vérifiables. Renseigne source_url, credit et license si connus; sinon laisse src vide. N’invente jamais une URL, une licence, une date, une relation ou une causalité.
- N’utilise jamais data:, image_data ou du base64. L’utilisateur ajoutera les fichiers locaux lors de la confirmation dans Opuscule.
- Les périodes sont inclusives. null signifie borne inconnue ou ouverte. Les années négatives sont autorisées pour l’Antiquité.
- Résume les désaccords ou incertitudes dans details/cause et cite une source HTTPS quand elle est disponible.
- Donne des positions x/y espacées sur une grille lisible (environ 250 px entre nœuds).`
}

export function makeActorId(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizeImage(value) {
  const source = value && typeof value === 'object' ? value : {}
  const rawSrc = cleanText(source.src || source.url, 2_000_000)
  const src = /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(rawSrc) ? rawSrc : safeHttps(rawSrc)
  return {
    ...source,
    id: cleanId(source.id) || makeActorId('img'),
    src,
    alt: cleanText(source.alt, 240),
    caption: cleanText(source.caption, 500),
    credit: cleanText(source.credit, 300),
    license: cleanText(source.license, 160),
    source_url: safeHttps(source.source_url || source.source),
    from_year: toYear(source.from_year),
    to_year: toYear(source.to_year),
  }
}

function normalizeDate(value) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    ...source,
    id: cleanId(source.id) || makeActorId('date'),
    year: toYear(source.year),
    label: cleanText(source.label || source.title, 200),
    description: cleanText(source.description, 1200),
  }
}

function normalizeAssignment(value) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    ...source,
    id: cleanId(source.id) || makeActorId('mandat'),
    entity_id: cleanId(source.entity_id || source.actor_id),
    from_year: toYear(source.from_year ?? source.valid_from),
    to_year: toYear(source.to_year ?? source.valid_to),
    label: cleanText(source.label, 180) || 'Titulaire',
    notes: cleanText(source.notes, 1500),
    source_url: safeHttps(source.source_url || source.source),
  }
}

function normalizeTags(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',')
  return [...new Set(values.map(item => cleanText(item, 80)).filter(Boolean))].slice(0, 50)
}

function cleanId(value) {
  return cleanText(value, 120).replace(/[^a-zA-Z0-9_.:-]/g, '-')
}

function cleanText(value, maxLength) {
  if (value === null || value === undefined) return ''
  return String(value).trim().slice(0, maxLength)
}

function safeHttps(value) {
  const text = cleanText(value, 2048)
  return /^https:\/\/\S+$/i.test(text) ? text : ''
}

function toYear(value) {
  if (value === null || value === undefined || value === '') return null
  const year = Number(value)
  if (!Number.isInteger(year) || year < -9999 || year > 9999) return null
  return year
}

function finiteNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function slugify(value) {
  return String(value || 'reseau-acteurs')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'reseau-acteurs'
}
