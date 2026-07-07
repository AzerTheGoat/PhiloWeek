import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/useApp'
import * as api from '../api'
import Icon from './Icons'

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
}

export default function KnowledgeGraph() {
  const { dispatch, openFile, toast } = useApp()
  const [graph, setGraph] = useState({ nodes: [], edges: [] })
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [references, setReferences] = useState(null)
  const [query, setQuery] = useState('')
  const [depth, setDepth] = useState(1)
  const [prompt, setPrompt] = useState('none')
  const [copying, setCopying] = useState(false)
  const [viewBox, setViewBox] = useState({ x: -650, y: -420, w: 1300, h: 840 })
  const dragRef = useRef(null)

  useEffect(() => {
    let ignore = false
    async function load() {
      setLoading(true)
      try {
        const data = await api.getKnowledgeGraph()
        if (ignore) return
        setGraph(data)
        setSelectedId(data.nodes[0]?.id || null)
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

  const positioned = useMemo(() => layoutGraph(graph.nodes, graph.edges), [graph])
  const visibleIds = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return new Set(positioned.nodes.map(node => node.id))
    return new Set(positioned.nodes
      .filter(node => `${node.title} ${node.name} ${node.path} ${(node.tags || []).join(' ')}`.toLowerCase().includes(q))
      .map(node => node.id))
  }, [positioned.nodes, query])

  const selected = positioned.nodes.find(node => node.id === selectedId) || positioned.nodes[0]
  const connectedIds = useMemo(() => {
    if (!selected) return new Set()
    const ids = new Set([selected.id])
    graph.edges.forEach(edge => {
      if (edge.source === selected.id) ids.add(edge.target)
      if (edge.target === selected.id) ids.add(edge.source)
    })
    return ids
  }, [graph.edges, selected])

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
    const factor = event.deltaY > 0 ? 1.12 : 0.88
    setViewBox(prev => {
      const nextW = clamp(prev.w * factor, 360, 2600)
      const nextH = clamp(prev.h * factor, 240, 1800)
      return {
        x: prev.x + (prev.w - nextW) / 2,
        y: prev.y + (prev.h - nextH) / 2,
        w: nextW,
        h: nextH,
      }
    })
  }

  const startPan = (event) => {
    if (event.target.closest?.('[data-node-id]')) return
    dragRef.current = { x: event.clientX, y: event.clientY, viewBox }
  }

  const pan = (event) => {
    if (!dragRef.current) return
    const rect = event.currentTarget.getBoundingClientRect()
    const dx = ((event.clientX - dragRef.current.x) / rect.width) * dragRef.current.viewBox.w
    const dy = ((event.clientY - dragRef.current.y) / rect.height) * dragRef.current.viewBox.h
    setViewBox({
      ...dragRef.current.viewBox,
      x: dragRef.current.viewBox.x - dx,
      y: dragRef.current.viewBox.y - dy,
    })
  }

  return (
    <div className="knowledge-graph-view">
      <header className="kg-toolbar">
        <div className="kg-title">
          <button className="icon-btn" onClick={() => dispatch({ type: 'SET_VIEW', payload: 'editor' })} title="Retour">
            <Icon name="back" />
          </button>
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
          <button className="btn-ghost" onClick={() => setViewBox({ x: -650, y: -420, w: 1300, h: 840 })}>
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
              className="kg-canvas"
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
              onWheel={handleWheel}
              onPointerDown={startPan}
              onPointerMove={pan}
              onPointerUp={() => { dragRef.current = null }}
              onPointerLeave={() => { dragRef.current = null }}
            >
              <g>
                {graph.edges.map((edge, index) => {
                  const source = positioned.byId.get(edge.source)
                  const target = positioned.byId.get(edge.target)
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
                {positioned.nodes.map(node => {
                  const visible = visibleIds.has(node.id)
                  const active = selected?.id === node.id
                  const connected = connectedIds.has(node.id)
                  return (
                    <g
                      key={node.id}
                      data-node-id={node.id}
                      className={`kg-node kg-node-${node.kind} ${active ? 'active' : ''} ${connected ? 'connected' : ''} ${visible ? '' : 'dim'}`}
                      transform={`translate(${node.x} ${node.y})`}
                      onClick={() => setSelectedId(node.id)}
                      onDoubleClick={() => openFile(node.id)}
                    >
                      <circle r={node.radius} />
                      <text y="-4" textAnchor="middle">{shorten(node.title || node.name, 18)}</text>
                      <text y="13" textAnchor="middle" className="kg-node-kind">{KIND_LABELS[node.kind] || 'Note'}</text>
                    </g>
                  )
                })}
              </g>
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
            <div className="kg-empty">Selectionne un noeud.</div>
          )}
        </aside>
      </div>
    </div>
  )
}

function layoutGraph(nodes, edges) {
  const degree = new Map(nodes.map(node => [node.id, 0]))
  edges.forEach(edge => {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1)
  })

  const sorted = [...nodes].sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0) || a.name.localeCompare(b.name))
  const count = Math.max(sorted.length, 1)
  const rings = Math.ceil(Math.sqrt(count))
  const positionedNodes = sorted.map((node, index) => {
    const ring = Math.floor(Math.sqrt(index))
    const start = ring * ring
    const slots = Math.max(1, (ring + 1) * (ring + 1) - start)
    const angle = ((index - start) / slots) * Math.PI * 2 + ring * 0.55
    const radius = ring === 0 ? 0 : 145 + ring * (560 / Math.max(rings, 2))
    const nodeRadius = clamp(18 + (degree.get(node.id) || 0) * 2.4, 20, 42)
    return {
      ...node,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      radius: nodeRadius,
    }
  })

  return {
    nodes: positionedNodes,
    byId: new Map(positionedNodes.map(node => [node.id, node])),
  }
}

function shorten(value, max) {
  const text = String(value || '')
  return text.length > max ? `${text.slice(0, max - 1)}...` : text
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}
