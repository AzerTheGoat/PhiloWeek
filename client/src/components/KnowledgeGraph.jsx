import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/useApp'
import * as api from '../api'

const PROMPTS = [
  { key: 'none', label: 'Sans prompt' },
  { key: 'questionnaire', label: 'Questionnaire JSON' },
  { key: 'socratique', label: 'Analyse socratique' },
  { key: 'critique', label: 'Critique' },
  { key: 'explorateur', label: 'Explorateur' },
  { key: 'synthese', label: 'Synthese' },
]

const KIND_LABELS = {
  note: 'Note',
  questionnaire: 'Quiz',
  idea_graph: 'Graphe',
  journal: 'Journal',
  spreadsheet: 'Tableur',
}

export default function KnowledgeGraph() {
  const { openFile, toast } = useApp()
  const [graph, setGraph] = useState({ nodes: [], edges: [] })
  const [simNodes, setSimNodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [hoveredId, setHoveredId] = useState(null)
  const [references, setReferences] = useState(null)
  const [query, setQuery] = useState('')
  const [depth, setDepth] = useState(1)
  const [prompt, setPrompt] = useState('none')
  const [copying, setCopying] = useState(false)
  const [viewBox, setViewBox] = useState({ x: -650, y: -420, w: 1300, h: 840 })
  const svgRef = useRef(null)
  const dragRef = useRef(null)
  const nodesRef = useRef([])
  const graphRef = useRef({ nodes: [], edges: [] })
  const velocitiesRef = useRef(new Map())
  const pinnedRef = useRef(new Map())
  const alphaRef = useRef(1)

  useEffect(() => {
    let ignore = false
    async function load() {
      setLoading(true)
      try {
        const data = await api.getKnowledgeGraph()
        if (ignore) return
        setGraph(data)
        setSelectedId(null)
      } catch (err) {
        toast(err.message, 'error')
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    load()
    return () => { ignore = true }
  }, [toast])

  useEffect(() => {
    if (!selectedId) {
      setReferences(null)
      return
    }
    let ignore = false
    api.getKnowledgeGraphReferences(selectedId)
      .then(data => { if (!ignore) setReferences(data) })
      .catch(err => toast(err.message, 'error'))
    return () => { ignore = true }
  }, [selectedId, toast])

  useEffect(() => {
    const degree = getDegree(graph.nodes, graph.edges)
    const count = Math.max(graph.nodes.length, 1)
    const next = graph.nodes.map((node, index) => {
      const angle = (index / count) * Math.PI * 2
      const spread = 110 + Math.sqrt(count) * 58
      return {
        ...node,
        x: Math.cos(angle) * spread + Math.cos(index * 2.1) * 35,
        y: Math.sin(angle) * spread + Math.sin(index * 1.7) * 35,
        radius: clamp(5.5 + (degree.get(node.id) || 0) * 1.1, 6, 13),
      }
    })
    velocitiesRef.current = new Map(next.map(node => [node.id, { vx: 0, vy: 0 }]))
    pinnedRef.current = new Map()
    nodesRef.current = next
    graphRef.current = graph
    alphaRef.current = 1
    setSimNodes(next)
  }, [graph])

  useEffect(() => {
    let frame
    function tick() {
      stepSimulation()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const byId = useMemo(() => new Map(simNodes.map(node => [node.id, node])), [simNodes])
  const visibleIds = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return new Set(simNodes.map(node => node.id))
    return new Set(simNodes
      .filter(node => `${node.title} ${node.name} ${node.path} ${(node.tags || []).join(' ')}`.toLowerCase().includes(q))
      .map(node => node.id))
  }, [simNodes, query])

  const selected = selectedId ? byId.get(selectedId) : null
  const connectedIds = useMemo(() => {
    if (!selected) return new Set()
    const ids = new Set([selected.id])
    graph.edges.forEach(edge => {
      if (edge.source === selected.id) ids.add(edge.target)
      if (edge.target === selected.id) ids.add(edge.source)
    })
    return ids
  }, [graph.edges, selected])

  const labeledNode = hoveredId ? byId.get(hoveredId) : null

  const handleCopy = async () => {
    if (!selected) return
    setCopying(true)
    try {
      const result = await api.copyKnowledgeGraphBundle({
        file_id: selected.id,
        depth,
        prompt,
      })
      await navigator.clipboard.writeText(result.text)
      toast(`${result.count} fichier(s) lie(s) copie(s)`)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setCopying(false)
    }
  }

  const handleWheel = (event) => {
    event.preventDefault()
    const factor = event.deltaY > 0 ? 1.1 : 0.9
    setViewBox(prev => {
      const point = clientPointToSvg(event)
      const nextW = clamp(prev.w * factor, 260, 3200)
      const nextH = clamp(prev.h * factor, 180, 2200)
      const rx = point ? (point.x - prev.x) / prev.w : 0.5
      const ry = point ? (point.y - prev.y) / prev.h : 0.5
      return {
        x: point ? point.x - nextW * rx : prev.x + (prev.w - nextW) / 2,
        y: point ? point.y - nextH * ry : prev.y + (prev.h - nextH) / 2,
        w: nextW,
        h: nextH,
      }
    })
  }

  const startPan = (event) => {
    if (event.target.closest?.('[data-node-id]')) return
    setSelectedId(null)
    dragRef.current = { type: 'pan', x: event.clientX, y: event.clientY, viewBox }
  }

  const startNodeDrag = (event, node) => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const point = clientPointToSvg(event)
    dragRef.current = {
      type: 'node',
      id: node.id,
      moved: false,
      dx: point ? node.x - point.x : 0,
      dy: point ? node.y - point.y : 0,
    }
    setSelectedId(node.id)
    pinnedRef.current.set(node.id, true)
    alphaRef.current = 0.9
  }

  const handlePointerMove = (event) => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.type === 'pan') {
      const rect = event.currentTarget.getBoundingClientRect()
      const dx = ((event.clientX - drag.x) / rect.width) * drag.viewBox.w
      const dy = ((event.clientY - drag.y) / rect.height) * drag.viewBox.h
      setViewBox({
        ...drag.viewBox,
        x: drag.viewBox.x - dx,
        y: drag.viewBox.y - dy,
      })
      return
    }

    const point = clientPointToSvg(event)
    if (!point) return
    drag.moved = true
    const nextNodes = nodesRef.current.map(node => {
      if (node.id !== drag.id) return node
      return { ...node, x: point.x + drag.dx, y: point.y + drag.dy }
    })
    nodesRef.current = nextNodes
    velocitiesRef.current.set(drag.id, { vx: 0, vy: 0 })
    setSimNodes(nextNodes)
  }

  const endDrag = () => {
    dragRef.current = null
  }

  const resetLayout = () => {
    const degree = getDegree(graph.nodes, graph.edges)
    const count = Math.max(graph.nodes.length, 1)
    const next = graph.nodes.map((node, index) => {
      const angle = (index / count) * Math.PI * 2
      const spread = 110 + Math.sqrt(count) * 58
      return {
        ...node,
        x: Math.cos(angle) * spread,
        y: Math.sin(angle) * spread,
        radius: clamp(5.5 + (degree.get(node.id) || 0) * 1.1, 6, 13),
      }
    })
    pinnedRef.current = new Map()
    velocitiesRef.current = new Map(next.map(node => [node.id, { vx: 0, vy: 0 }]))
    nodesRef.current = next
    alphaRef.current = 1
    setSimNodes(next)
    setViewBox({ x: -650, y: -420, w: 1300, h: 840 })
  }

  function clientPointToSvg(event) {
    const svg = svgRef.current
    if (!svg) return null
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    return point.matrixTransform(svg.getScreenCTM().inverse())
  }

  function stepSimulation() {
    const current = nodesRef.current
    const edges = graphRef.current.edges
    if (current.length === 0) return

    const alpha = alphaRef.current
    const byNodeId = new Map(current.map(node => [node.id, node]))
    const velocities = velocitiesRef.current
    const next = current.map(node => ({ ...node }))

    for (let i = 0; i < next.length; i++) {
      const a = next[i]
      const av = velocities.get(a.id) || { vx: 0, vy: 0 }
      for (let j = i + 1; j < next.length; j++) {
        const b = next[j]
        const bv = velocities.get(b.id) || { vx: 0, vy: 0 }
        const dx = a.x - b.x
        const dy = a.y - b.y
        const dist2 = Math.max(dx * dx + dy * dy, 80)
        const force = (1800 / dist2) * alpha
        const dist = Math.sqrt(dist2)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        av.vx += fx
        av.vy += fy
        bv.vx -= fx
        bv.vy -= fy
        velocities.set(b.id, bv)
      }
      av.vx += -a.x * 0.0017 * alpha
      av.vy += -a.y * 0.0017 * alpha
      velocities.set(a.id, av)
    }

    for (const edge of edges) {
      const source = byNodeId.get(edge.source)
      const target = byNodeId.get(edge.target)
      if (!source || !target) continue
      const sv = velocities.get(source.id) || { vx: 0, vy: 0 }
      const tv = velocities.get(target.id) || { vx: 0, vy: 0 }
      const dx = target.x - source.x
      const dy = target.y - source.y
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy))
      const desired = edge.type === 'questionnaire' ? 165 : 125
      const force = (dist - desired) * 0.006 * alpha
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      sv.vx += fx
      sv.vy += fy
      tv.vx -= fx
      tv.vy -= fy
      velocities.set(source.id, sv)
      velocities.set(target.id, tv)
    }

    let energy = 0
    for (const node of next) {
      const velocity = velocities.get(node.id) || { vx: 0, vy: 0 }
      if (!pinnedRef.current.has(node.id)) {
        node.x += velocity.vx
        node.y += velocity.vy
      }
      velocity.vx *= 0.82
      velocity.vy *= 0.82
      energy += Math.abs(velocity.vx) + Math.abs(velocity.vy)
      velocities.set(node.id, velocity)
    }

    alphaRef.current = Math.max(0.08, alpha * 0.985)
    if (energy > 0.01 || alpha > 0.09) {
      nodesRef.current = next
      setSimNodes(next)
    }
  }

  graphRef.current = graph

  return (
    <div className="knowledge-graph-view">
      <header className="kg-toolbar">
        <div className="kg-title">
          <div>
            <h2>Graphe de la base</h2>
            <span>{graph.nodes.length} noeud(s), {graph.edges.length} lien(s)</span>
          </div>
        </div>
        <div className="kg-tools">
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Filtrer..."
            className="kg-search"
          />
          <button className="btn-ghost" onClick={resetLayout}>
            Recentrer
          </button>
        </div>
      </header>

      <div className="kg-body">
        <section className="kg-canvas-wrap">
          {loading ? (
            <div className="kg-empty">Chargement du graphe...</div>
          ) : graph.nodes.length === 0 ? (
            <div className="kg-empty">Aucun fichier lisible pour le moment.</div>
          ) : (
            <svg
              ref={svgRef}
              className="kg-canvas"
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
              onWheel={handleWheel}
              onPointerDown={startPan}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrag}
              onPointerLeave={endDrag}
            >
              <g>
                {graph.edges.map((edge, index) => {
                  const source = byId.get(edge.source)
                  const target = byId.get(edge.target)
                  if (!source || !target) return null
                  const dim = !visibleIds.has(source.id) || !visibleIds.has(target.id)
                  const active = selected && (edge.source === selected.id || edge.target === selected.id)
                  return (
                    <line
                      key={`${edge.source}-${edge.target}-${edge.type}-${index}`}
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      className={`kg-edge kg-edge-${edge.type} ${active ? 'active' : ''} ${dim ? 'dim' : ''}`}
                    />
                  )
                })}
              </g>

              <g>
                {simNodes.map(node => {
                  const visible = visibleIds.has(node.id)
                  const active = selected?.id === node.id
                  const connected = connectedIds.has(node.id)
                  return (
                    <g
                      key={node.id}
                      data-node-id={node.id}
                      className={`kg-node kg-node-${node.kind} ${active ? 'active' : ''} ${connected ? 'connected' : ''} ${visible ? '' : 'dim'}`}
                      transform={`translate(${node.x} ${node.y})`}
                      onPointerDown={event => startNodeDrag(event, node)}
                      onPointerEnter={() => setHoveredId(node.id)}
                      onPointerLeave={() => setHoveredId(current => current === node.id ? null : current)}
                      onDoubleClick={() => openFile(node.id)}
                    >
                      <circle r={node.radius} />
                    </g>
                  )
                })}
              </g>

              {labeledNode && (
                <g className="kg-node-label" transform={`translate(${labeledNode.x} ${labeledNode.y + labeledNode.radius + 22})`}>
                  <rect x="-95" y="-15" width="190" height="30" rx="6" />
                  <text textAnchor="middle" y="5">{shorten(labeledNode.title || labeledNode.name, 28)}</text>
                </g>
              )}
            </svg>
          )}
        </section>

        <aside className="kg-side">
          {selected ? (
            <>
              <div className="kg-node-card">
                <span className={`kg-pill kg-pill-${selected.kind}`}>{KIND_LABELS[selected.kind] || 'Note'}</span>
                <h3>{selected.title || selected.name}</h3>
                <p>/{selected.path}</p>
                <div className="kg-card-actions">
                  <button className="btn-primary" onClick={() => openFile(selected.id)}>Ouvrir</button>
                  <button className="btn-ghost" onClick={handleCopy} disabled={copying}>
                    {copying ? 'Copie...' : 'Copier lies'}
                  </button>
                </div>
              </div>

              <div className="kg-copy-box">
                <label>
                  Profondeur
                  <input
                    type="range"
                    min="0"
                    max="4"
                    value={depth}
                    onChange={event => setDepth(Number(event.target.value))}
                  />
                  <strong>{depth}</strong>
                </label>
                <label>
                  Preprompt
                  <select value={prompt} onChange={event => setPrompt(event.target.value)}>
                    {PROMPTS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="kg-references">
                <h3>Appels entrants</h3>
                {!references ? (
                  <p className="kg-muted">Recherche des contextes...</p>
                ) : references.references.length === 0 ? (
                  <p className="kg-muted">Aucun fichier ne semble appeler ce noeud.</p>
                ) : (
                  references.references.map((ref, index) => (
                    <article key={`${ref.source_id}-${index}`} className="kg-reference">
                      <button onClick={() => openFile(ref.source_id)}>
                        {ref.source_name}
                        <span>{ref.type === 'questionnaire' ? 'Quiz lie' : 'Lien wiki'}</span>
                      </button>
                      <p>{ref.excerpt}</p>
                    </article>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="kg-side-empty">
              <h3>Aucun noeud selectionne</h3>
              <p>{graph.nodes.length} noeud(s), {graph.edges.length} lien(s)</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function getDegree(nodes, edges) {
  const degree = new Map(nodes.map(node => [node.id, 0]))
  edges.forEach(edge => {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1)
  })
  return degree
}

function shorten(value, max) {
  const text = String(value || '')
  return text.length > max ? `${text.slice(0, max - 1)}...` : text
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}
