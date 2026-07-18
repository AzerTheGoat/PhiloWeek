const express = require('express')
const matter = require('gray-matter')
const router = express.Router()
const { getDb } = require('../db')
const { getAccessibleFileRows, getFileAccess } = require('../fileAccess')

const COPY_PROMPTS = {
  none: '',
  questionnaire: `Tu vas creer un questionnaire Opuscule a partir des notes ci-dessous.

Retourne uniquement un JSON valide, sans Markdown autour, au format Opuscule avec philoweek_type, version, id, title, description, tags et questions.`,
  socratique: 'Analyse les notes ci-dessous avec une methode socratique : clarifie les theses, questionne les presupposes, fais apparaitre les tensions, puis propose des questions qui obligent a preciser la pensee.',
  critique: 'Analyse les notes ci-dessous de maniere critique : repere les faiblesses, objections possibles, concepts flous, sauts logiques et contre-exemples. Termine par une liste de revisions prioritaires.',
  explorateur: 'Explore les notes ci-dessous : propose des pistes nouvelles, rapprochements, analogies, auteurs ou problemes connexes. Priorise les idees qui peuvent ouvrir un vrai travail.',
  synthese: 'Fais une synthese structuree des notes ci-dessous : theses, arguments, exemples, objections, concepts cles, puis une conclusion concise.',
}

router.get('/', (req, res) => {
  const db = getDb()
  const files = getReadableFiles(db, req.user.id)
  const paths = buildPaths(db, req.user.id)
  const nodes = files.map(file => {
    const parsed = parseFile(file)
    return {
      id: file.id,
      name: file.name,
      title: parsed.title,
      path: paths[file.id] || file.name,
      kind: getFileKind(file, parsed),
      tags: parsed.tags,
      updated_at: file.updated_at,
    }
  })

  res.json({ nodes, edges: buildEdges(db, files, paths, req.user.id) })
})

router.get('/:id/references', (req, res) => {
  const db = getDb()
  const targetAccess = getFileAccess(db, req.params.id, req.user.id)
  const target = targetAccess?.file
  if (!target) return res.status(404).json({ error: 'Not found' })

  const paths = buildPaths(db, req.user.id)
  const references = [
    ...getWikiReferences(db, target, paths, req.user.id),
    ...getQuestionnaireReferences(db, target, paths, req.user.id),
  ].sort((a, b) => String(a.source_name).localeCompare(String(b.source_name)))

  res.json({
    node: {
      id: target.id,
      name: target.name,
      path: paths[target.id] || target.name,
      kind: getFileKind(target, parseFile(target)),
    },
    references,
  })
})

router.post('/copy', (req, res) => {
  const db = getDb()
  const { file_id: fileId, depth = 1, prompt = 'none' } = req.body || {}
  if (!fileId) return res.status(400).json({ error: 'file_id required' })

  const files = getReadableFiles(db, req.user.id)
  const fileById = new Map(files.map(file => [file.id, file]))
  if (!fileById.has(fileId)) return res.status(404).json({ error: 'Not found' })

  const paths = buildPaths(db, req.user.id)
  const ids = collectNeighborhood(fileId, Number(depth) || 0, buildEdges(db, files, paths, req.user.id))
  const ordered = files
    .filter(file => ids.has(file.id))
    .sort((a, b) => (paths[a.id] || a.name).localeCompare(paths[b.id] || b.name))

  const parts = ordered.map(file => {
    const parsed = parseFile(file)
    const body = parsed.body.trim()
    const title = parsed.title || file.name.replace(/\.(md|json)$/i, '')
    const path = paths[file.id] || file.name
    const modDate = new Date(file.updated_at || file.created_at).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    return `# ${title}\n> Chemin : /${path} - Modifie le ${modDate}\n\n${body}`
  })

  const notes = parts.join('\n\n---\n\n')
  const preprompt = COPY_PROMPTS[prompt] || ''
  res.json({
    count: ordered.length,
    file_ids: ordered.map(file => file.id),
    text: preprompt ? `${preprompt}\n\n--- NOTES LIEES ---\n\n${notes}` : notes,
  })
})

module.exports = router

function getReadableFiles(db, userId) {
  return getAccessibleFileRows(db, userId, { filesOnly: true })
    .filter(file => file.content !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

function buildEdges(db, files, paths, userId) {
  const fileByPath = new Map()
  const fileById = new Map(files.map(file => [file.id, file]))
  for (const file of files) {
    fileByPath.set(normalizePath(paths[file.id] || file.name), file)
    fileByPath.set(normalizePath(file.name), file)
    fileByPath.set(normalizePath(file.name.replace(/\.md$/i, '')), file)
  }

  const edges = []
  const seen = new Set()
  const wikiLinks = db.prepare(`
    SELECT fl.source_id, fl.target_id, fl.link_text
    FROM file_links fl
    JOIN files s ON s.id = fl.source_id
    JOIN files t ON t.id = fl.target_id
    WHERE s.type = 'file' AND t.type = 'file'
      AND s.deleted_at IS NULL AND t.deleted_at IS NULL
  `).all().filter(link => fileById.has(link.source_id) && fileById.has(link.target_id))

  for (const link of wikiLinks) {
    addEdge(edges, seen, {
      source: link.source_id,
      target: link.target_id,
      type: 'wiki',
      label: link.link_text || 'wiki',
    })
  }

  for (const file of files) {
    const parsed = parseQuestionnaire(file.content)
    if (!parsed) continue
    for (const sourcePath of parsed.source_paths || []) {
      const target = fileByPath.get(normalizePath(sourcePath))
      if (!target || !fileById.has(target.id)) continue
      addEdge(edges, seen, {
        source: file.id,
        target: target.id,
        type: 'questionnaire',
        label: 'questionnaire',
      })
    }
  }

  return edges
}

function addEdge(edges, seen, edge) {
  if (!edge.source || !edge.target || edge.source === edge.target) return
  const key = `${edge.source}|${edge.target}|${edge.type}`
  if (seen.has(key)) return
  seen.add(key)
  edges.push(edge)
}

function getWikiReferences(db, target, paths, userId) {
  const rows = db.prepare(`
    SELECT f.id, f.name, f.content, fl.link_text
    FROM file_links fl
    JOIN files f ON f.id = fl.source_id
    WHERE fl.target_id = ? AND f.type = 'file' AND f.content IS NOT NULL AND f.deleted_at IS NULL
  `).all(target.id).filter(file => getFileAccess(db, file.id, userId))

  return rows.flatMap(row => {
    const snippets = findWikiSnippets(row.content || '', row.link_text || target.name)
    return snippets.map(snippet => ({
      type: 'wiki',
      source_id: row.id,
      source_name: row.name,
      source_path: paths[row.id] || row.name,
      excerpt: snippet,
    }))
  })
}

function getQuestionnaireReferences(db, target, paths, userId) {
  const files = getReadableFiles(db, userId)
  const targetPath = normalizePath(paths[target.id] || target.name)
  const refs = []

  for (const file of files) {
    const parsed = parseQuestionnaire(file.content)
    if (!parsed) continue
    const sourcePaths = (parsed.source_paths || []).map(normalizePath)
    if (
      !sourcePaths.includes(targetPath) &&
      !sourcePaths.includes(normalizePath(target.name)) &&
      !sourcePaths.includes(normalizePath(target.name.replace(/\.md$/i, '')))
    ) continue
    refs.push({
      type: 'questionnaire',
      source_id: file.id,
      source_name: file.name,
      source_path: paths[file.id] || file.name,
      excerpt: `${parsed.title || file.name} lie ce fichier comme source (${parsed.questions_count} question(s)).`,
    })
  }

  return refs
}

function findWikiSnippets(content, linkText) {
  const body = stripFrontmatter(content)
  const aliases = new Set([linkText, linkText.replace(/\.md$/i, '')])
  const patterns = [...aliases].map(alias => new RegExp(`\\[\\[${escapeRegExp(alias)}(?:\\|[^\\]]+)?\\]\\]`, 'i'))
  const blocks = body
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)

  const snippets = blocks.filter(block => patterns.some(pattern => pattern.test(block)))
  return (snippets.length ? snippets : blocks.filter(block => block.toLowerCase().includes(String(linkText).toLowerCase())))
    .slice(0, 5)
    .map(block => block.length > 520 ? `${block.slice(0, 520).trim()}...` : block)
}

function collectNeighborhood(startId, depth, edges) {
  const selected = new Set([startId])
  const frontier = [startId]
  const adjacency = new Map()
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set())
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set())
    adjacency.get(edge.source).add(edge.target)
    adjacency.get(edge.target).add(edge.source)
  }

  for (let level = 0; level < depth; level++) {
    const size = frontier.length
    for (let i = 0; i < size; i++) {
      const current = frontier.shift()
      for (const next of adjacency.get(current) || []) {
        if (selected.has(next)) continue
        selected.add(next)
        frontier.push(next)
      }
    }
  }
  return selected
}

function buildPaths(db, userId) {
  const rows = getAccessibleFileRows(db, userId).map(({ id, parent_id, name }) => ({ id, parent_id, name }))
  const byId = new Map(rows.map(row => [row.id, row]))
  const cache = {}
  function pathFor(id) {
    if (cache[id]) return cache[id]
    const row = byId.get(id)
    if (!row) return ''
    const parent = row.parent_id ? pathFor(row.parent_id) : ''
    cache[id] = parent ? `${parent}/${row.name}` : row.name
    return cache[id]
  }
  rows.forEach(row => pathFor(row.id))
  return cache
}

function parseFile(file) {
  const content = file.content || ''
  if (/\.json$/i.test(file.name || '')) {
    const q = parseQuestionnaire(content)
    return {
      title: q?.title || file.name.replace(/\.json$/i, ''),
      tags: q?.tags || [],
      body: formatJsonBody(content),
    }
  }

  try {
    const parsed = matter(content)
    return {
      title: parsed.data?.title || file.name.replace(/\.md$/i, ''),
      tags: normalizeTags(parsed.data?.tags),
      body: parsed.content || '',
    }
  } catch (_) {
    return {
      title: file.name.replace(/\.md$/i, ''),
      tags: [],
      body: stripFrontmatter(content),
    }
  }
}

function getFileKind(file, parsed) {
  if (/\.json$/i.test(file.name || '')) return 'questionnaire'
  try {
    const data = matter(file.content || '').data
    if (data?.philoweek_type === 'graph') return 'idea_graph'
  } catch (_) {}
  if ((parsed.tags || []).includes('journal') || /^\d{4}-\d{2}-\d{2}\.md$/i.test(file.name || '')) return 'journal'
  return 'note'
}

function parseQuestionnaire(content) {
  try {
    const parsed = JSON.parse(content || '{}')
    const questions = Array.isArray(parsed.questions) ? parsed.questions : []
    if (parsed.philoweek_type !== 'questionnaire' && questions.length === 0) return null
    return {
      title: parsed.title || '',
      tags: normalizeTags(parsed.tags),
      source_paths: Array.isArray(parsed.source_paths) ? parsed.source_paths.map(String) : [],
      questions_count: questions.length,
    }
  } catch (_) {
    return null
  }
}

function formatJsonBody(content) {
  try {
    return JSON.stringify(JSON.parse(content || '{}'), null, 2)
  } catch (_) {
    return content || ''
  }
}

function stripFrontmatter(content) {
  return String(content || '').replace(/^---[\s\S]*?---\n?/, '')
}

function normalizeTags(tags) {
  if (!tags) return []
  return (Array.isArray(tags) ? tags : [tags]).map(tag => String(tag))
}

function normalizePath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim()
    .toLowerCase()
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
