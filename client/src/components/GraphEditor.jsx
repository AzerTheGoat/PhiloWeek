import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/useApp'
import Icon from './Icons'

const AUTOSAVE_DELAY = 650
const CANVAS_WIDTH = 1400
const CANVAS_HEIGHT = 900
const MIN_ZOOM = 0.4
const MAX_ZOOM = 2
const ZOOM_STEP = 0.1

const NODE_TYPES = [
  { value: 'idea', label: 'Idee', color: '#6ba3e8' },
  { value: 'objective', label: 'Objectif', color: '#4caf7d' },
  { value: 'question', label: 'Question', color: '#d69d55' },
  { value: 'resource', label: 'Ressource', color: '#a08be0' },
]

const EDGE_TYPES = [
  { value: 'relates', label: 'relie' },
  { value: 'supports', label: 'soutient' },
  { value: 'blocks', label: 'bloque' },
  { value: 'leads_to', label: 'mene vers' },
]

export default function GraphEditor() {
  const { currentFile, openFileId, saveFile, toast } = useApp()
  const [graph, setGraph] = useState(() => parseGraph(currentFile?.content, currentFile?.name))
  const [selectedId, setSelectedId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [linkTarget, setLinkTarget] = useState('')
  const [edgeKind, setEdgeKind] = useState('relates')
  const [zoom, setZoom] = useState(1)
  const saveTimerRef = useRef(null)
  const dragRef = useRef(null)
  const stageRef = useRef(null)

  useEffect(() => {
    setGraph(parseGraph(currentFile?.content, currentFile?.name))
    setSelectedId(null)
    setLinkTarget('')
    setDirty(false)
    clearTimeout(saveTimerRef.current)
  }, [currentFile?.id])

  const selectedNode = useMemo(
    () => graph.nodes.find(node => node.id === selectedId) || null,
    [graph.nodes, selectedId]
  )

  const linkedTargets = useMemo(() => {
    if (!selectedId) return new Set()
    return new Set(graph.edges.filter(edge => edge.from === selectedId).map(edge => edge.to))
  }, [graph.edges, selectedId])

  const persist = useCallback((nextGraph) => {
    clearTimeout(saveTimerRef.current)
    setDirty(true)
    saveTimerRef.current = setTimeout(async () => {
      if (!openFileId) return
      setSaving(true)
      try {
        await saveFile(openFileId, serializeGraph(currentFile, nextGraph))
        setDirty(false)
      } finally {
        setSaving(false)
      }
    }, AUTOSAVE_DELAY)
  }, [currentFile, openFileId, saveFile])

  const updateGraph = useCallback((updater) => {
    setGraph(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      persist(next)
      return next
    })
  }, [persist])

  useEffect(() => {
    return () => clearTimeout(saveTimerRef.current)
  }, [])

  const addNode = useCallback((type = 'idea') => {
    const meta = NODE_TYPES.find(item => item.value === type) || NODE_TYPES[0]
    const id = makeId()
    updateGraph(prev => ({
      ...prev,
      nodes: [
        ...prev.nodes,
        {
          id,
          type,
          title: meta.label,
          body: '',
          x: 140 + (prev.nodes.length % 3) * 180,
          y: 120 + Math.floor(prev.nodes.length / 3) * 150,
        },
      ],
    }))
    setSelectedId(id)
  }, [updateGraph])

  const updateNode = useCallback((id, patch) => {
    updateGraph(prev => ({
      ...prev,
      nodes: prev.nodes.map(node => node.id === id ? { ...node, ...patch } : node),
    }))
  }, [updateGraph])

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    updateGraph(prev => ({
      ...prev,
      nodes: prev.nodes.filter(node => node.id !== selectedId),
      edges: prev.edges.filter(edge => edge.from !== selectedId && edge.to !== selectedId),
    }))
    setSelectedId(null)
  }, [selectedId, updateGraph])

  const addEdge = useCallback(() => {
    if (!selectedId || !linkTarget || selectedId === linkTarget || linkedTargets.has(linkTarget)) return
    updateGraph(prev => ({
      ...prev,
      edges: [...prev.edges, { id: makeId(), from: selectedId, to: linkTarget, type: edgeKind }],
    }))
    setLinkTarget('')
  }, [edgeKind, linkTarget, linkedTargets, selectedId, updateGraph])

  const deleteEdge = useCallback((edgeId) => {
    updateGraph(prev => ({ ...prev, edges: prev.edges.filter(edge => edge.id !== edgeId) }))
  }, [updateGraph])

  const setClampedZoom = useCallback((nextZoom) => {
    setZoom(prev => {
      const value = typeof nextZoom === 'function' ? nextZoom(prev) : nextZoom
      return clampZoom(value)
    })
  }, [])

  const zoomIn = useCallback(() => setClampedZoom(value => value + ZOOM_STEP), [setClampedZoom])
  const zoomOut = useCallback(() => setClampedZoom(value => value - ZOOM_STEP), [setClampedZoom])
  const resetZoom = useCallback(() => setClampedZoom(1), [setClampedZoom])

  const handleWheel = useCallback((event) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    setClampedZoom(value => value + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP))
  }, [setClampedZoom])

  const handlePointerDown = useCallback((event, node) => {
    if (event.button !== 0) return
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return
    setSelectedId(node.id)
    dragRef.current = {
      id: node.id,
      startX: event.clientX,
      startY: event.clientY,
      nodeX: node.x,
      nodeY: node.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const handlePointerMove = useCallback((event) => {
    const drag = dragRef.current
    if (!drag) return
    const nextX = Math.max(20, drag.nodeX + (event.clientX - drag.startX) / zoom)
    const nextY = Math.max(20, drag.nodeY + (event.clientY - drag.startY) / zoom)
    setGraph(prev => ({
      ...prev,
      nodes: prev.nodes.map(node => node.id === drag.id ? { ...node, x: nextX, y: nextY } : node),
    }))
  }, [zoom])

  const handlePointerUp = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    persist(graph)
  }, [graph, persist])

  const nodeMap = useMemo(() => {
    const map = new Map()
    graph.nodes.forEach(node => map.set(node.id, node))
    return map
  }, [graph.nodes])

  return (
    <div className="graph-editor">
      <div className="graph-titlebar">
        <div>
          <h2 className="editor-filename">{currentFile.name.replace(/\.md$/i, '')}</h2>
          <span className={`save-status ${dirty ? 'dirty' : ''}`}>
            {saving ? 'Enregistrement...' : dirty ? 'non sauvegarde' : 'sauvegarde'}
          </span>
        </div>
        <div className="graph-toolbar">
          <div className="graph-zoom-controls" aria-label="Zoom du graphe">
            <button type="button" className="graph-zoom-btn" onClick={zoomOut} title="Dézoomer">-</button>
            <button type="button" className="graph-zoom-value" onClick={resetZoom} title="Réinitialiser le zoom">
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" className="graph-zoom-btn" onClick={zoomIn} title="Zoomer">+</button>
          </div>
          {NODE_TYPES.map(type => (
            <button key={type.value} type="button" className="btn-ghost graph-add-btn" onClick={() => addNode(type.value)}>
              <span style={{ background: type.color }} />
              {type.label}
            </button>
          ))}
        </div>
      </div>

      <div className="graph-workspace">
        <div
          className="graph-stage"
          ref={stageRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onClick={() => setSelectedId(null)}
          onWheel={handleWheel}
        >
          <div
            className="graph-canvas"
            style={{ width: CANVAS_WIDTH * zoom, height: CANVAS_HEIGHT * zoom }}
          >
            <div
              className="graph-viewport"
              style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${zoom})` }}
            >
              <svg className="graph-lines" width={CANVAS_WIDTH} height={CANVAS_HEIGHT}>
                <defs>
                  <marker id="graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
                  </marker>
                </defs>
                {graph.edges.map(edge => {
                  const from = nodeMap.get(edge.from)
                  const to = nodeMap.get(edge.to)
                  if (!from || !to) return null
                  const x1 = from.x + 130
                  const y1 = from.y + 54
                  const x2 = to.x + 18
                  const y2 = to.y + 54
                  const mid = Math.max(40, Math.abs(x2 - x1) / 2)
                  return (
                    <path
                      key={edge.id}
                      d={`M ${x1} ${y1} C ${x1 + mid} ${y1}, ${x2 - mid} ${y2}, ${x2} ${y2}`}
                      className={`graph-edge graph-edge-${edge.type || 'relates'}`}
                      markerEnd="url(#graph-arrow)"
                    />
                  )
                })}
              </svg>

              {graph.nodes.map(node => {
                const meta = NODE_TYPES.find(item => item.value === node.type) || NODE_TYPES[0]
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={`graph-node ${selectedId === node.id ? 'selected' : ''}`}
                    style={{ left: node.x, top: node.y, '--node-color': meta.color }}
                    onPointerDown={event => handlePointerDown(event, node)}
                    onClick={event => { event.stopPropagation(); setSelectedId(node.id) }}
                  >
                    <span className="graph-node-type">{meta.label}</span>
                    <strong>{node.title || 'Sans titre'}</strong>
                    {node.body && <small>{node.body}</small>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <aside className="graph-inspector">
          {selectedNode ? (
            <>
              <div className="graph-inspector-head">
                <strong>Carte</strong>
                <button type="button" className="icon-btn" title="Supprimer" onClick={deleteSelected}>
                  <Icon name="close" size={18} />
                </button>
              </div>
              <label className="graph-field">
                Type
                <select value={selectedNode.type} onChange={event => updateNode(selectedNode.id, { type: event.target.value })}>
                  {NODE_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
              <label className="graph-field">
                Titre
                <input value={selectedNode.title || ''} onChange={event => updateNode(selectedNode.id, { title: event.target.value })} />
              </label>
              <label className="graph-field">
                Details
                <textarea value={selectedNode.body || ''} onChange={event => updateNode(selectedNode.id, { body: event.target.value })} />
              </label>

              <div className="graph-link-box">
                <strong>Lien sortant</strong>
                <select value={edgeKind} onChange={event => setEdgeKind(event.target.value)}>
                  {EDGE_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
                <select value={linkTarget} onChange={event => setLinkTarget(event.target.value)}>
                  <option value="">Choisir une carte</option>
                  {graph.nodes
                    .filter(node => node.id !== selectedNode.id && !linkedTargets.has(node.id))
                    .map(node => <option key={node.id} value={node.id}>{node.title || 'Sans titre'}</option>)}
                </select>
                <button type="button" className="btn-primary" disabled={!linkTarget} onClick={addEdge}>Relier</button>
              </div>

              <div className="graph-edge-list">
                {graph.edges.filter(edge => edge.from === selectedNode.id || edge.to === selectedNode.id).map(edge => {
                  const other = nodeMap.get(edge.from === selectedNode.id ? edge.to : edge.from)
                  const label = EDGE_TYPES.find(type => type.value === edge.type)?.label || 'relie'
                  return (
                    <div key={edge.id} className="graph-edge-row">
                      <span>{edge.from === selectedNode.id ? label : 'vient de'} {other?.title || 'Carte'}</span>
                      <button type="button" onClick={() => deleteEdge(edge.id)}>Retirer</button>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="graph-empty-panel">
              <Icon name="graph" size={34} />
              <strong>Selectionne une carte</strong>
              <span>Ajoute des idees, objectifs, questions ou ressources, puis relie-les.</span>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function parseGraph(content, name) {
  const match = String(content || '').match(/```philoweek-graph\s*\n([\s\S]*?)```/i)
  if (match) {
    try {
      const parsed = JSON.parse(match[1])
      return normalizeGraph(parsed)
    } catch (_) {}
  }
  return normalizeGraph({
    version: 1,
    nodes: [{ id: makeId(), type: 'idea', title: name?.replace(/\.md$/i, '') || 'Graphe', body: '', x: 160, y: 130 }],
    edges: [],
  })
}

function serializeGraph(file, graph) {
  const raw = file?.content || ''
  const parsed = parseFrontmatter(raw)
  const title = parsed.data.title || file?.name?.replace(/\.md$/i, '') || 'Graphe'
  const frontmatter = {
    ...parsed.data,
    title,
    tags: parsed.data.tags || ['graphe'],
    philoweek_type: 'graph',
    modified: new Date().toISOString(),
  }
  const body = parsed.body
    .replace(/```philoweek-graph\s*\n[\s\S]*?```/i, '')
    .trim() || `# ${title}`
  return `${stringifyFrontmatter(frontmatter)}\n\n${body}\n\n\`\`\`philoweek-graph\n${JSON.stringify(normalizeGraph(graph), null, 2)}\n\`\`\`\n`
}

function normalizeGraph(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : []
  const edges = Array.isArray(graph?.edges) ? graph.edges : []
  return {
    version: 1,
    nodes: nodes.map((node, index) => ({
      id: String(node.id || makeId()),
      type: NODE_TYPES.some(type => type.value === node.type) ? node.type : 'idea',
      title: String(node.title || `Carte ${index + 1}`),
      body: String(node.body || ''),
      x: Number.isFinite(Number(node.x)) ? Number(node.x) : 100 + index * 40,
      y: Number.isFinite(Number(node.y)) ? Number(node.y) : 100 + index * 40,
    })),
    edges: edges
      .filter(edge => edge?.from && edge?.to)
      .map(edge => ({
        id: String(edge.id || makeId()),
        from: String(edge.from),
        to: String(edge.to),
        type: EDGE_TYPES.some(type => type.value === edge.type) ? edge.type : 'relates',
      })),
  }
}

function parseFrontmatter(raw) {
  const match = String(raw || '').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { data: {}, body: String(raw || '') }
  const data = {}
  match[1].split('\n').forEach(line => {
    const idx = line.indexOf(':')
    if (idx === -1) return
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value.slice(1, -1).split(',').map(item => item.trim()).filter(Boolean)
    } else {
      data[key] = value
    }
  })
  return { data, body: match[2] || '' }
}

function stringifyFrontmatter(data) {
  const lines = Object.entries(data).map(([key, value]) => {
    if (Array.isArray(value)) return `${key}: [${value.join(', ')}]`
    return `${key}: ${value}`
  })
  return `---\n${lines.join('\n')}\n---`
}

function makeId() {
  return Math.random().toString(36).slice(2, 10)
}

function clampZoom(value) {
  const next = Number(value)
  if (!Number.isFinite(next)) return 1
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(next * 10) / 10))
}
