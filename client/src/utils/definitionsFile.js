export function isDefinitionsFile(file) {
  if (!file || !/\.json$/i.test(file.name || '')) return false
  try {
    const parsed = JSON.parse(file.content || '{}')
    return parsed?.philoweek_type === 'definitions' || Array.isArray(parsed?.definitions)
  } catch (_) {
    return false
  }
}

export function createDefinitionsJson(title) {
  const now = new Date().toISOString()
  const slug = slugify(title)
  return JSON.stringify({
    philoweek_type: 'definitions',
    version: 1,
    id: slug,
    title,
    description: '',
    tags: [],
    created: now,
    modified: now,
    definitions: [
      {
        id: 'd1',
        term: 'Concept',
        definition: 'Definition courte et precise.',
        example: '',
        tags: [],
      },
    ],
  }, null, 2)
}

export function parseDefinitionsJson(content) {
  const parsed = JSON.parse(content || '{}')
  return {
    ...parsed,
    definitions: Array.isArray(parsed.definitions) ? parsed.definitions : [],
  }
}

export function normalizeTagsInput(value) {
  return String(value || '')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
}

function slugify(value) {
  return String(value || 'definitions')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'definitions'
}
