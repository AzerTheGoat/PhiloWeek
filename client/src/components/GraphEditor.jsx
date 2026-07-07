import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import { useApp } from '../context/useApp'
import Icon from './Icons'

const AUTOSAVE_DELAY = 650
const CANVAS_WIDTH = 1400
const CANVAS_HEIGHT = 900
const MIN_ZOOM = 0.4
const MAX_ZOOM = 2
const ZOOM_STEP = 0.1
const MIN_NODE_WIDTH = 180
const MAX_NODE_WIDTH = 420
const MIN_NODE_HEIGHT = 120
const MAX_NODE_HEIGHT = 360
const DEFAULT_NODE_WIDTH = 240
const DEFAULT_NODE_HEIGHT = 170

marked.setOptions({ breaks: true, gfm: true })

const NODE_TYPES = [
  { value: 'idea', label: 'Idee', color: '#6ba3e8' },
  { value: 'objective', label: 'Objectif', color: '#4caf7d' },
  { value: 'question', label: 'Question', color: '#d69d55' },
  { value: 'resource', label: 'Ressource', color: '#a08be0' },
  { value: 'action', label: 'Action', color: '#e05555' },
  // Bloc neutre : pas de badge de categorie affiche sur la carte (voir `blank`).
  { value: 'blank', label: 'Bloc', color: '#d8d8d8', blank: true },
]

const BORDER_COLORS = [
  '#6ba3e8',
  '#4caf7d',
  '#d69d55',
  '#a08be0',
  '#e05555',
  '#d8d8d8',
]

const EDGE_TYPES = [
  { value: 'relates', label: 'relie' },
  { value: 'supports', label: 'soutient' },
  { value: 'blocks', label: 'bloque' },
  { value: 'leads_to', label: 'mene vers' },
]

const ARROW_STYLES = [
  { value: 'end', label: 'Fleche simple' },
  { value: 'both', label: 'Fleche double' },
  { value: 'none', label: 'Sans fleche' },
]

export default function GraphEditor() {
  const { currentFile, openFileId, saveFile, toast, showContextMenu } = useApp()
  const [graph, setGraph] = useState(() => parseGraph(currentFile?.content, currentFile?.name))
  const [selectedId, setSelectedId] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [marqueeRect, setMarqueeRect] = useState(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [linkTarget, setLinkTarget] = useState('')
  const [edgeKind, setEdgeKind] = useState('relates')
  const [edgeArrowStyle, setEdgeArrowStyle] = useState('end')
  const [edgeLabel, setEdgeLabel] = useState('')
  const [zoom, setZoom] = useState(1)
  const saveTimerRef = useRef(null)
  const dragRef = useRef(null)
  const marqueeRef = useRef(null)
  const stageRef = useRef(null)
  const viewportRef = useRef(null)

  useEffect(() => {
    setGraph(parseGraph(currentFile?.content, currentFile?.name))
    setSelectedId(null)
    setSelectedIds(new Set())
    setLinkTarget('')
    setEdgeLabel('')
    setEdgeArrowStyle('end')
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
          color: meta.color,
          width: DEFAULT_NODE_WIDTH,
          height: DEFAULT_NODE_HEIGHT,
          x: 140 + (prev.nodes.length % 3) * 180,
          y: 120 + Math.floor(prev.nodes.length / 3) * 150,
        },
      ],
    }))
    setSelectedId(id)
    setSelectedIds(new Set([id]))
  }, [updateGraph])

  const updateNode = useCallback((id, patch) => {
    updateGraph(prev => ({
      ...prev,
      nodes: prev.nodes.map(node => node.id === id ? { ...node, ...patch } : node),
    }))
  }, [updateGraph])

  const deleteNodes = useCallback((ids) => {
    const idSet = new Set(ids)
    if (idSet.size === 0) return
    updateGraph(prev => ({
      ...prev,
      nodes: prev.nodes.filter(node => !idSet.has(node.id)),
      edges: prev.edges.filter(edge => !idSet.has(edge.from) && !idSet.has(edge.to)),
    }))
    setSelectedId(null)
    setSelectedIds(new Set())
  }, [updateGraph])

  const duplicateNodes = useCallback((ids) => {
    const idList = Array.from(ids)
    if (idList.length === 0) return
    const idMap = new Map(idList.map(id => [id, makeId()]))
    updateGraph(prev => {
      const idSet = new Set(idList)
      const newNodes = prev.nodes
        .filter(node => idSet.has(node.id))
        .map(node => ({ ...node, id: idMap.get(node.id), x: node.x + 30, y: node.y + 30 }))
      const newEdges = prev.edges
        .filter(edge => idSet.has(edge.from) && idSet.has(edge.to))
        .map(edge => ({ id: makeId(), from: idMap.get(edge.from), to: idMap.get(edge.to), type: edge.type, arrow: edge.arrow, label: edge.label }))
      return { ...prev, nodes: [...prev.nodes, ...newNodes], edges: [...prev.edges, ...newEdges] }
    })
    const newIds = new Set(idMap.values())
    setSelectedIds(newIds)
    setSelectedId(idList.length === 1 ? idMap.get(idList[0]) : Array.from(newIds)[newIds.size - 1])
  }, [updateGraph])

  const detachEdges = useCallback((ids) => {
    const idSet = new Set(ids)
    updateGraph(prev => ({
      ...prev,
      edges: prev.edges.filter(edge => !idSet.has(edge.from) && !idSet.has(edge.to)),
    }))
  }, [updateGraph])

  const addEdge = useCallback(() => {
    if (!selectedId || !linkTarget || selectedId === linkTarget || linkedTargets.has(linkTarget)) return
    updateGraph(prev => ({
      ...prev,
      edges: [...prev.edges, { id: makeId(), from: selectedId, to: linkTarget, type: edgeKind, arrow: edgeArrowStyle, label: edgeLabel.trim() }],
    }))
    setLinkTarget('')
    setEdgeLabel('')
  }, [edgeArrowStyle, edgeKind, edgeLabel, linkTarget, linkedTargets, selectedId, updateGraph])

  const deleteEdge = useCallback((edgeId) => {
    updateGraph(prev => ({ ...prev, edges: prev.edges.filter(edge => edge.id !== edgeId) }))
  }, [updateGraph])

  const updateEdge = useCallback((edgeId, patch) => {
    updateGraph(prev => ({
      ...prev,
      edges: prev.edges.map(edge => edge.id === edgeId ? { ...edge, ...patch } : edge),
    }))
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
    event.stopPropagation()

    let nextSelected
    if (event.shiftKey) {
      nextSelected = new Set(selectedIds)
      if (nextSelected.has(node.id)) nextSelected.delete(node.id)
      else nextSelected.add(node.id)
    } else if (selectedIds.has(node.id) && selectedIds.size > 1) {
      nextSelected = selectedIds
    } else {
      nextSelected = new Set([node.id])
    }
    setSelectedIds(nextSelected)
    setSelectedId(node.id)

    if (!nextSelected.has(node.id)) {
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }

    const dragIds = Array.from(nextSelected)
    const origin = {}
    graph.nodes.forEach(n => { if (dragIds.includes(n.id)) origin[n.id] = { x: n.x, y: n.y } })
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origin,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [graph.nodes, selectedIds])

  const handleStagePointerDown = useCallback((event) => {
    if (event.button !== 0) return
    if (event.target.closest('.graph-node')) return
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = (event.clientX - rect.left) / zoom
    const y = (event.clientY - rect.top) / zoom
    const base = event.shiftKey ? new Set(selectedIds) : new Set()
    marqueeRef.current = { startX: x, startY: y, base }
    setMarqueeRect({ x, y, w: 0, h: 0 })
    // Applique immédiatement la base (vide si pas de shift) : un simple clic
    // sur le canvas vide désélectionne tout, même sans glisser la souris.
    setSelectedIds(base)
    setSelectedId(base.size ? Array.from(base)[base.size - 1] : null)
  }, [zoom, selectedIds])

  const handlePointerMove = useCallback((event) => {
    const drag = dragRef.current
    if (drag) {
      const dx = (event.clientX - drag.startX) / zoom
      const dy = (event.clientY - drag.startY) / zoom
      setGraph(prev => ({
        ...prev,
        nodes: prev.nodes.map(node => {
          const o = drag.origin[node.id]
          if (!o) return node
          return { ...node, x: Math.max(20, o.x + dx), y: Math.max(20, o.y + dy) }
        }),
      }))
      return
    }

    const marquee = marqueeRef.current
    if (marquee) {
      const rect = viewportRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = (event.clientX - rect.left) / zoom
      const y = (event.clientY - rect.top) / zoom
      const rx = Math.min(marquee.startX, x)
      const ry = Math.min(marquee.startY, y)
      const rw = Math.abs(x - marquee.startX)
      const rh = Math.abs(y - marquee.startY)
      setMarqueeRect({ x: rx, y: ry, w: rw, h: rh })
      const hit = graph.nodes.filter(node => rectsIntersect(
        rx, ry, rw, rh, node.x, node.y, getNodeWidth(node), getNodeHeight(node)
      ))
      const next = new Set(marquee.base)
      hit.forEach(node => next.add(node.id))
      setSelectedIds(next)
    }
  }, [graph.nodes, zoom])

  const handlePointerUp = useCallback(() => {
    if (dragRef.current) {
      dragRef.current = null
      persist(graph)
      return
    }
    if (marqueeRef.current) {
      marqueeRef.current = null
      setMarqueeRect(null)
      setSelectedIds(prev => {
        const arr = Array.from(prev)
        setSelectedId(arr.length ? arr[arr.length - 1] : null)
        return prev
      })
    }
  }, [graph, persist])

  const handleNodeContextMenu = useCallback((event, node) => {
    event.preventDefault()
    event.stopPropagation()
    const inGroup = selectedIds.has(node.id) && selectedIds.size > 1
    const targetIds = inGroup ? Array.from(selectedIds) : [node.id]
    if (!inGroup) {
      setSelectedIds(new Set([node.id]))
      setSelectedId(node.id)
    }
    const count = targetIds.length
    showContextMenu(event.clientX, event.clientY, [
      { icon: '⧉', label: count > 1 ? `Dupliquer (${count})` : 'Dupliquer', action: () => duplicateNodes(targetIds) },
      { icon: '⛓', label: 'Détacher les liens', action: () => detachEdges(targetIds) },
      { separator: true },
      { icon: '🗑', label: count > 1 ? `Supprimer (${count})` : 'Supprimer', danger: true, action: () => deleteNodes(targetIds) },
    ])
  }, [selectedIds, showContextMenu, duplicateNodes, detachEdges, deleteNodes])

  // Supprimer la sélection avec la touche Suppr / Retour arrière
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (selectedIds.size === 0) return
      event.preventDefault()
      deleteNodes(Array.from(selectedIds))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedIds, deleteNodes])

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
          onPointerDown={handleStagePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
        >
          <div
            className="graph-canvas"
            style={{ width: CANVAS_WIDTH * zoom, height: CANVAS_HEIGHT * zoom }}
          >
            <div
              ref={viewportRef}
              className="graph-viewport"
              style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${zoom})` }}
            >
              {marqueeRect && (
                <div
                  className="graph-marquee"
                  style={{ left: marqueeRect.x, top: marqueeRect.y, width: marqueeRect.w, height: marqueeRect.h }}
                />
              )}
              <svg className="graph-lines" width={CANVAS_WIDTH} height={CANVAS_HEIGHT}>
                <defs>
                  <marker id="graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse">
                    <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
                  </marker>
                </defs>
                {graph.edges.map(edge => {
                  const from = nodeMap.get(edge.from)
                  const to = nodeMap.get(edge.to)
                  if (!from || !to) return null
                  const fromW = getNodeWidth(from)
                  const fromH = getNodeHeight(from)
                  const toW = getNodeWidth(to)
                  const toH = getNodeHeight(to)
                  const fromCenter = { x: from.x + fromW / 2, y: from.y + fromH / 2 }
                  const toCenter = { x: to.x + toW / 2, y: to.y + toH / 2 }
                  const p1 = getBorderPoint(from, fromW, fromH, toCenter.x, toCenter.y)
                  const p2 = getBorderPoint(to, toW, toH, fromCenter.x, fromCenter.y)
                  const arrow = edge.arrow || 'end'
                  const label = edge.label || ''
                  const labelPos = label ? edgeLabelTransform(p1.x, p1.y, p2.x, p2.y) : null
                  const labelWidth = label ? Math.max(28, label.length * 6.2 + 12) : 0
                  return (
                    <g key={edge.id}>
                      <path
                        d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`}
                        className={`graph-edge graph-edge-${edge.type || 'relates'}`}
                        markerEnd={arrow !== 'none' ? 'url(#graph-arrow)' : undefined}
                        markerStart={arrow === 'both' ? 'url(#graph-arrow)' : undefined}
                      />
                      {label && labelPos && (
                        <g transform={`translate(${labelPos.mx}, ${labelPos.my}) rotate(${labelPos.angle})`}>
                          <rect
                            x={-labelWidth / 2}
                            y={-9}
                            width={labelWidth}
                            height={18}
                            rx={4}
                            className="graph-edge-label-bg"
                          />
                          <text textAnchor="middle" dy="4" className="graph-edge-label-text">{label}</text>
                        </g>
                      )}
                    </g>
                  )
                })}
              </svg>

              {graph.nodes.map(node => {
                const meta = NODE_TYPES.find(item => item.value === node.type) || NODE_TYPES[0]
                const borderColor = normalizeColor(node.color, meta.color)
                const width = getNodeWidth(node)
                const height = getNodeHeight(node)
                const markdown = renderNodeMarkdown(node.body)
                return (
                  <div
                    key={node.id}
                    role="button"
                    tabIndex={0}
                    className={`graph-node ${selectedIds.has(node.id) ? 'selected' : ''}`}
                    style={{
                      left: node.x,
                      top: node.y,
                      width,
                      height,
                      '--node-color': borderColor,
                    }}
                    onPointerDown={event => handlePointerDown(event, node)}
                    onClick={event => event.stopPropagation()}
                    onContextMenu={event => handleNodeContextMenu(event, node)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelectedIds(new Set([node.id]))
                        setSelectedId(node.id)
                      }
                    }}
                  >
                    {!meta.blank && <span className="graph-node-type">{meta.label}</span>}
                    <strong>{node.title || 'Sans titre'}</strong>
                    {node.body ? (
                      <div
                        className="graph-node-markdown"
                        dangerouslySetInnerHTML={{ __html: markdown }}
                      />
                    ) : (
                      <span className="graph-node-placeholder">Markdown...</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <aside className="graph-inspector">
          {selectedIds.size > 1 ? (
            <>
              <div className="graph-inspector-head">
                <strong>{selectedIds.size} cartes sélectionnées</strong>
              </div>
              <label className="graph-field">
                Couleur du contour
                <div className="graph-color-row">
                  {BORDER_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      className="graph-color-swatch"
                      style={{ '--swatch-color': color }}
                      title={color}
                      onClick={() => selectedIds.forEach(id => updateNode(id, { color }))}
                    />
                  ))}
                </div>
              </label>
              <div className="graph-bulk-actions">
                <button type="button" className="btn-ghost" onClick={() => duplicateNodes(selectedIds)}>
                  <Icon name="copy" size={16} /> Dupliquer
                </button>
                <button type="button" className="btn-ghost danger" onClick={() => deleteNodes(selectedIds)}>
                  <Icon name="close" size={16} /> Supprimer
                </button>
              </div>
            </>
          ) : selectedNode ? (
            <>
              <div className="graph-inspector-head">
                <strong>Carte</strong>
                <div className="graph-inspector-actions">
                  <button type="button" className="icon-btn" title="Dupliquer" onClick={() => duplicateNodes([selectedNode.id])}>
                    <Icon name="copy" size={16} />
                  </button>
                  <button type="button" className="icon-btn" title="Supprimer" onClick={() => deleteNodes([selectedNode.id])}>
                    <Icon name="close" size={18} />
                  </button>
                </div>
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
                Markdown
                <textarea value={selectedNode.body || ''} onChange={event => updateNode(selectedNode.id, { body: event.target.value })} />
              </label>
              <label className="graph-field">
                Couleur du contour
                <div className="graph-color-row">
                  {BORDER_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      className={`graph-color-swatch ${normalizeColor(selectedNode.color, NODE_TYPES.find(type => type.value === selectedNode.type)?.color) === color ? 'active' : ''}`}
                      style={{ '--swatch-color': color }}
                      title={color}
                      onClick={() => updateNode(selectedNode.id, { color })}
                    />
                  ))}
                  <input
                    type="color"
                    value={normalizeColor(selectedNode.color, NODE_TYPES.find(type => type.value === selectedNode.type)?.color)}
                    onChange={event => updateNode(selectedNode.id, { color: event.target.value })}
                    title="Couleur personnalisee"
                  />
                </div>
              </label>
              <div className="graph-size-grid">
                <label className="graph-field">
                  Largeur
                  <input
                    type="range"
                    min={MIN_NODE_WIDTH}
                    max={MAX_NODE_WIDTH}
                    step="10"
                    value={getNodeWidth(selectedNode)}
                    onChange={event => updateNode(selectedNode.id, { width: Number(event.target.value) })}
                  />
                  <span>{getNodeWidth(selectedNode)} px</span>
                </label>
                <label className="graph-field">
                  Hauteur
                  <input
                    type="range"
                    min={MIN_NODE_HEIGHT}
                    max={MAX_NODE_HEIGHT}
                    step="10"
                    value={getNodeHeight(selectedNode)}
                    onChange={event => updateNode(selectedNode.id, { height: Number(event.target.value) })}
                  />
                  <span>{getNodeHeight(selectedNode)} px</span>
                </label>
              </div>

              <div className="graph-link-box">
                <strong>Lien sortant</strong>
                <select value={edgeKind} onChange={event => setEdgeKind(event.target.value)}>
                  {EDGE_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
                <select value={edgeArrowStyle} onChange={event => setEdgeArrowStyle(event.target.value)}>
                  {ARROW_STYLES.map(style => <option key={style.value} value={style.value}>{style.label}</option>)}
                </select>
                <input
                  type="text"
                  placeholder="Texte affiche sur le lien (optionnel)"
                  value={edgeLabel}
                  onChange={event => setEdgeLabel(event.target.value)}
                />
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
                      <div className="graph-edge-row-top">
                        <span>{edge.from === selectedNode.id ? label : 'vient de'} {other?.title || 'Carte'}</span>
                        <button type="button" onClick={() => deleteEdge(edge.id)}>Retirer</button>
                      </div>
                      <div className="graph-edge-row-controls">
                        <select value={edge.arrow || 'end'} onChange={event => updateEdge(edge.id, { arrow: event.target.value })}>
                          {ARROW_STYLES.map(style => <option key={style.value} value={style.value}>{style.label}</option>)}
                        </select>
                        <input
                          type="text"
                          placeholder="Texte du lien"
                          value={edge.label || ''}
                          onChange={event => updateEdge(edge.id, { label: event.target.value })}
                        />
                      </div>
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
      color: normalizeColor(node.color, NODE_TYPES.find(type => type.value === node.type)?.color || NODE_TYPES[0].color),
      width: clampNumber(node.width, MIN_NODE_WIDTH, MAX_NODE_WIDTH, DEFAULT_NODE_WIDTH),
      height: clampNumber(node.height, MIN_NODE_HEIGHT, MAX_NODE_HEIGHT, DEFAULT_NODE_HEIGHT),
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
        arrow: ARROW_STYLES.some(style => style.value === edge.arrow) ? edge.arrow : 'end',
        label: String(edge.label || ''),
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

function rectsIntersect(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

// Point d'intersection entre le rectangle du noeud et le segment reliant
// son centre a un point cible : donne le point du bord le plus proche de
// l'autre extremite du lien, quelle que soit la position relative des noeuds.
function getBorderPoint(node, width, height, targetX, targetY) {
  const cx = node.x + width / 2
  const cy = node.y + height / 2
  const dx = targetX - cx
  const dy = targetY - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const halfW = width / 2
  const halfH = height / 2
  const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Infinity
  const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Infinity
  const scale = Math.min(scaleX, scaleY)
  return { x: cx + dx * scale, y: cy + dy * scale }
}

function edgeLabelTransform(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  let angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI)
  if (angle > 90 || angle < -90) angle += 180
  return { mx, my, angle }
}

function clampZoom(value) {
  const next = Number(value)
  if (!Number.isFinite(next)) return 1
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(next * 10) / 10))
}

function getNodeWidth(node) {
  return clampNumber(node?.width, MIN_NODE_WIDTH, MAX_NODE_WIDTH, DEFAULT_NODE_WIDTH)
}

function getNodeHeight(node) {
  return clampNumber(node?.height, MIN_NODE_HEIGHT, MAX_NODE_HEIGHT, DEFAULT_NODE_HEIGHT)
}

function clampNumber(value, min, max, fallback) {
  const next = Number(value)
  if (!Number.isFinite(next)) return fallback
  return Math.min(max, Math.max(min, Math.round(next)))
}

function normalizeColor(value, fallback = NODE_TYPES[0].color) {
  const color = String(value || '').trim()
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback
}

function renderNodeMarkdown(markdown) {
  return sanitizeNodeHtml(marked(String(markdown || '')))
}

function sanitizeNodeHtml(html) {
  if (typeof document === 'undefined') return html
  const template = document.createElement('template')
  template.innerHTML = html
  template.content.querySelectorAll('script, style, iframe, object, embed').forEach(element => element.remove())
  template.content.querySelectorAll('*').forEach(element => {
    Array.from(element.attributes).forEach(attribute => {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim().toLowerCase()
      if (name.startsWith('on') || value.startsWith('javascript:')) {
        element.removeAttribute(attribute.name)
      }
    })
  })
  return template.innerHTML
}
