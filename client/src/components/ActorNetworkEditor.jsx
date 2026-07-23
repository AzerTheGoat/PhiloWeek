import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/useApp'
import FileHistoryControls, { useFileHistoryActions } from './FileHistoryControls'
import Icon from './Icons'
import { promptImageUrl } from '../utils/imageInput'
import {
  ACTOR_NODE_TYPES,
  buildActorNetworkPrompt,
  isActiveAtYear,
  makeActorId,
  mergeActorNetwork,
  normalizeActorNetwork,
  parseActorNetworkImport,
  parseActorNetworkJson,
  pickActorImage,
  resolveActorNode,
  stringifyActorNetwork,
} from '../utils/actorNetworkFile'

const AUTOSAVE_DELAY = 650
const CANVAS_PADDING = 500
const BASE_CANVAS_WIDTH = 3000
const BASE_CANVAS_HEIGHT = 2200
const NODE_WIDTH = 230
const NODE_HEIGHT = 226
const MIN_ZOOM = 0.1
const MAX_ZOOM = 1.6
const MAX_FIT_ZOOM = 0.78
const FIT_MARGIN = 84
const CURRENT_YEAR = new Date().getFullYear()
const LARGE_NETWORK_THRESHOLD = 20

export default function ActorNetworkEditor() {
  const { currentFile, openFileId, saveFile, toast } = useApp()
  const [network, setNetwork] = useState(() => safeParse(currentFile))
  const [year, setYear] = useState(() => safeParse(currentFile).settings.default_year)
  const [allDates, setAllDates] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [mode, setMode] = useState('graph')
  const [zoom, setZoom] = useState(0.9)
  const [layoutRunning, setLayoutRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [rawJson, setRawJson] = useState(currentFile?.content || '')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [importDraft, setImportDraft] = useState(null)
  const [study, setStudy] = useState(null)
  const stageRef = useRef(null)
  const viewportRef = useRef(null)
  const dragRef = useRef(null)
  const saveTimerRef = useRef(null)
  const layoutFrameRef = useRef(null)
  const layoutRunRef = useRef(0)
  const networkRef = useRef(network)
  const dirtyRef = useRef(dirty)
  const importInputRef = useRef(null)
  const previousFileIdRef = useRef(openFileId)
  networkRef.current = network
  dirtyRef.current = dirty

  useEffect(() => {
    const previousId = previousFileIdRef.current
    if (previousId && previousId !== openFileId && dirtyRef.current) {
      clearTimeout(saveTimerRef.current)
      saveFile(previousId, stringifyActorNetwork(networkRef.current)).catch(() => {})
    }
    previousFileIdRef.current = openFileId
    const next = safeParse(currentFile)
    setNetwork(next)
    setYear(next.settings.default_year)
    setAllDates(false)
    setLayoutRunning(false)
    layoutRunRef.current += 1
    cancelAnimationFrame(layoutFrameRef.current)
    setSelectedId(null)
    setMode('graph')
    setRawJson(currentFile?.content || '')
    setDirty(false)
    clearTimeout(saveTimerRef.current)
    const frame = requestAnimationFrame(() => {
      const stage = stageRef.current
      if (!stage) return
      const minX = next.nodes.length ? Math.min(...next.nodes.map(node => node.x)) : 0
      const minY = next.nodes.length ? Math.min(...next.nodes.map(node => node.y)) : 0
      let initialZoom = zoom
      if (next.nodes.length >= LARGE_NETWORK_THRESHOLD) {
        const bounds = getNodeBounds(next.nodes)
        initialZoom = clamp(
          Math.min(
            Math.max(120, stage.clientWidth - FIT_MARGIN * 2) / bounds.width,
            Math.max(120, stage.clientHeight - FIT_MARGIN * 2) / bounds.height,
          ),
          MIN_ZOOM,
          MAX_FIT_ZOOM,
        )
        setZoom(initialZoom)
      }
      stage.scrollLeft = Math.max(0, (minX + CANVAS_PADDING) * initialZoom - FIT_MARGIN)
      stage.scrollTop = Math.max(0, (minY + CANVAS_PADDING) * initialZoom - FIT_MARGIN)
    })
    return () => cancelAnimationFrame(frame)
  }, [currentFile]) // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback((next) => {
    clearTimeout(saveTimerRef.current)
    setDirty(true)
    saveTimerRef.current = setTimeout(async () => {
      if (!openFileId) return
      setSaving(true)
      try {
        const content = stringifyActorNetwork(next)
        await saveFile(openFileId, content)
        setRawJson(content)
        setDirty(false)
      } catch (_) {
        // Le contexte affiche l’erreur et l’état local reste intact.
      } finally {
        setSaving(false)
      }
    }, AUTOSAVE_DELAY)
  }, [openFileId, saveFile])

  const updateNetwork = useCallback((updater, { normalize = false } = {}) => {
    setNetwork(previous => {
      let next = typeof updater === 'function' ? updater(previous) : updater
      if (normalize) next = normalizeActorNetwork(next)
      persist(next)
      return next
    })
  }, [persist])

  useEffect(() => () => {
    clearTimeout(saveTimerRef.current)
    cancelAnimationFrame(layoutFrameRef.current)
    layoutRunRef.current += 1
  }, [])

  const visibleNodes = useMemo(() => network.nodes.filter(node => (
    allDates || network.settings.show_inactive || isActiveAtYear(node, year)
  )), [allDates, network.nodes, network.settings.show_inactive, year])
  const visibleIds = useMemo(() => new Set(visibleNodes.map(node => node.id)), [visibleNodes])
  const visibleEdges = useMemo(() => network.edges.filter(edge => (
    visibleIds.has(edge.from) && visibleIds.has(edge.to) && (allDates || isActiveAtYear(edge, year, 'from_year', 'to_year'))
  )), [allDates, network.edges, visibleIds, year])
  const nodeMap = useMemo(() => new Map(network.nodes.map(node => [node.id, node])), [network.nodes])
  const selectedNode = nodeMap.get(selectedId) || null
  const displayYear = allDates ? CURRENT_YEAR : year
  const canvasSize = useMemo(() => getCanvasSize(network.nodes), [network.nodes])
  const showAllEdgeLabels = visibleEdges.length <= 24

  const updateNode = useCallback((id, patch) => {
    updateNetwork(previous => ({
      ...previous,
      nodes: previous.nodes.map(node => node.id === id ? { ...node, ...patch } : node),
    }))
  }, [updateNetwork])

  const fitNetwork = useCallback((nodes = networkRef.current.nodes) => {
    const stage = stageRef.current
    if (!stage || !nodes.length) return
    const bounds = getNodeBounds(nodes)
    const nextZoom = clamp(
      Math.min(
        Math.max(120, stage.clientWidth - FIT_MARGIN * 2) / bounds.width,
        Math.max(120, stage.clientHeight - FIT_MARGIN * 2) / bounds.height,
      ),
      MIN_ZOOM,
      MAX_FIT_ZOOM,
    )
    setZoom(nextZoom)
    requestAnimationFrame(() => {
      stage.scrollLeft = Math.max(0, (bounds.minX + CANVAS_PADDING) * nextZoom - FIT_MARGIN)
      stage.scrollTop = Math.max(0, (bounds.minY + CANVAS_PADDING) * nextZoom - FIT_MARGIN)
    })
  }, [])

  const stopDynamicLayout = useCallback(() => {
    layoutRunRef.current += 1
    cancelAnimationFrame(layoutFrameRef.current)
    setLayoutRunning(false)
    persist(networkRef.current)
  }, [persist])

  const runDynamicLayout = useCallback((source = networkRef.current) => {
    if (!source.nodes.length) return
    layoutRunRef.current += 1
    cancelAnimationFrame(layoutFrameRef.current)
    const runId = layoutRunRef.current
    const area = getLayoutArea(source.nodes.length)
    const edges = source.edges.filter(edge => source.nodes.some(node => node.id === edge.from) && source.nodes.some(node => node.id === edge.to))
    const degree = new Map(source.nodes.map(node => [node.id, 0]))
    edges.forEach(edge => {
      degree.set(edge.from, (degree.get(edge.from) || 0) + 1)
      degree.set(edge.to, (degree.get(edge.to) || 0) + 1)
    })
    const sourceBounds = getRawNodeBounds(source.nodes)
    let simulationNodes = source.nodes.map((node, index) => {
      const normalizedX = sourceBounds.width > 1
        ? ((node.x - sourceBounds.minX) / sourceBounds.width) * (area.width - NODE_WIDTH)
        : area.width / 2 - NODE_WIDTH / 2
      const normalizedY = sourceBounds.height > 1
        ? ((node.y - sourceBounds.minY) / sourceBounds.height) * (area.height - NODE_HEIGHT)
        : area.height / 2 - NODE_HEIGHT / 2
      const angle = index * 2.399963229728653
      return {
        ...node,
        x: clamp(normalizedX + Math.cos(angle) * 18, 0, area.width - NODE_WIDTH),
        y: clamp(normalizedY + Math.sin(angle) * 18, 0, area.height - NODE_HEIGHT),
        vx: 0,
        vy: 0,
      }
    })
    const edgePairs = edges.map(edge => [edge.from, edge.to])
    const maxFrames = source.nodes.length > 90 ? 190 : 230
    let frame = 0

    setSelectedId(null)
    setLayoutRunning(true)
    setDirty(true)
    const initialNetwork = { ...source, nodes: simulationNodes.map(stripVelocity) }
    networkRef.current = initialNetwork
    setNetwork(initialNetwork)
    requestAnimationFrame(() => fitNetwork(initialNetwork.nodes))

    const tick = () => {
      if (layoutRunRef.current !== runId) return
      frame += 1
      const alpha = Math.max(0.05, 1 - frame / maxFrames)
      const byId = new Map(simulationNodes.map(node => [node.id, node]))

      for (let i = 0; i < simulationNodes.length; i += 1) {
        const a = simulationNodes[i]
        const acx = a.x + NODE_WIDTH / 2
        const acy = a.y + NODE_HEIGHT / 2
        for (let j = i + 1; j < simulationNodes.length; j += 1) {
          const b = simulationNodes[j]
          let dx = acx - (b.x + NODE_WIDTH / 2)
          let dy = acy - (b.y + NODE_HEIGHT / 2)
          if (dx === 0 && dy === 0) {
            dx = ((i * 17 + j * 11) % 9) - 4 || 1
            dy = ((i * 7 + j * 19) % 9) - 4 || -1
          }
          const distanceSquared = Math.max(2500, dx * dx + dy * dy)
          const distance = Math.sqrt(distanceSquared)
          const charge = Math.min(1.7, (42000 / distanceSquared) * alpha)
          const chargeX = (dx / distance) * charge
          const chargeY = (dy / distance) * charge
          a.vx += chargeX
          a.vy += chargeY
          b.vx -= chargeX
          b.vy -= chargeY

          const overlapX = NODE_WIDTH + 112 - Math.abs(dx)
          const overlapY = NODE_HEIGHT + 104 - Math.abs(dy)
          if (overlapX > 0 && overlapY > 0) {
            if (overlapX < overlapY) {
              const push = Math.sign(dx) * overlapX * 0.045 * alpha
              a.vx += push
              b.vx -= push
            } else {
              const push = Math.sign(dy) * overlapY * 0.045 * alpha
              a.vy += push
              b.vy -= push
            }
          }
        }
      }

      edgePairs.forEach(([fromId, toId]) => {
        const from = byId.get(fromId)
        const to = byId.get(toId)
        if (!from || !to) return
        const dx = (to.x + NODE_WIDTH / 2) - (from.x + NODE_WIDTH / 2)
        const dy = (to.y + NODE_HEIGHT / 2) - (from.y + NODE_HEIGHT / 2)
        const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy))
        const desired = 460
        const force = (distance - desired) * 0.0038 * alpha
        const fx = (dx / distance) * force
        const fy = (dy / distance) * force
        from.vx += fx
        from.vy += fy
        to.vx -= fx
        to.vy -= fy
      })

      const centerX = area.width / 2 - NODE_WIDTH / 2
      const centerY = area.height / 2 - NODE_HEIGHT / 2
      simulationNodes.forEach(node => {
        const centrality = 1 + Math.min(5, degree.get(node.id) || 0) * 0.08
        node.vx += (centerX - node.x) * 0.00028 * alpha * centrality
        node.vy += (centerY - node.y) * 0.00028 * alpha * centrality
        node.vx = clamp(node.vx * 0.84, -16, 16)
        node.vy = clamp(node.vy * 0.84, -16, 16)
        node.x = clamp(node.x + node.vx, 0, area.width - NODE_WIDTH)
        node.y = clamp(node.y + node.vy, 0, area.height - NODE_HEIGHT)
      })

      const nextNetwork = { ...source, nodes: simulationNodes.map(stripVelocity) }
      networkRef.current = nextNetwork
      setNetwork(nextNetwork)
      if (frame < maxFrames) {
        layoutFrameRef.current = requestAnimationFrame(tick)
      } else {
        setLayoutRunning(false)
        persist(nextNetwork)
        fitNetwork(nextNetwork.nodes)
      }
    }

    layoutFrameRef.current = requestAnimationFrame(tick)
  }, [fitNetwork, persist])

  const addNode = useCallback((type) => {
    const id = makeActorId(type === 'organization' ? 'org' : type === 'position' ? 'poste' : 'personne')
    const meta = ACTOR_NODE_TYPES.find(item => item.value === type) || ACTOR_NODE_TYPES[0]
    const center = getViewCenter(stageRef.current, zoom)
    updateNetwork(previous => ({
      ...previous,
      nodes: [...previous.nodes, {
        id,
        type,
        name: meta.label,
        subtitle: '',
        summary: '',
        details: '',
        active_from: year,
        active_to: null,
        birth_year: null,
        death_year: null,
        founded_year: null,
        dissolved_year: null,
        color: meta.color,
        x: center?.x ?? 140 + (previous.nodes.length % 4) * 270,
        y: center?.y ?? 120 + Math.floor(previous.nodes.length / 4) * 250,
        images: [],
        dates: [],
        assignments: [],
      }],
    }))
    setSelectedId(id)
  }, [updateNetwork, year, zoom])

  const deleteNode = useCallback((node) => {
    if (!window.confirm(`Supprimer « ${node.name} » et toutes ses relations ?`)) return
    updateNetwork(previous => ({
      ...previous,
      nodes: previous.nodes.filter(item => item.id !== node.id).map(item => ({
        ...item,
        assignments: (item.assignments || []).filter(assignment => assignment.entity_id !== node.id),
      })),
      edges: previous.edges.filter(edge => edge.from !== node.id && edge.to !== node.id),
    }))
    setSelectedId(null)
  }, [updateNetwork])

  const handlePointerDown = useCallback((event, node) => {
    if (event.button !== 0 || layoutRunning) return
    event.preventDefault()
    event.stopPropagation()
    setSelectedId(node.id)
    dragRef.current = {
      id: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.x,
      originY: node.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [layoutRunning])

  const handlePointerMove = useCallback((event) => {
    const drag = dragRef.current
    if (!drag) return
    const x = drag.originX + (event.clientX - drag.startX) / zoom
    const y = drag.originY + (event.clientY - drag.startY) / zoom
    setNetwork(previous => ({
      ...previous,
      nodes: previous.nodes.map(node => node.id === drag.id ? { ...node, x, y } : node),
    }))
  }, [zoom])

  const handlePointerUp = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    persist(networkRef.current)
  }, [persist])

  const copyPrompt = useCallback(async () => {
    const copied = await copyText(buildActorNetworkPrompt(network.title))
    toast(copied ? 'Prompt JSON copié' : 'Presse-papiers indisponible', copied ? 'success' : 'error')
  }, [network.title, toast])

  const loadImport = useCallback((text, sourceName) => {
    try {
      const parsed = parseActorNetworkImport(text)
      setImportDraft({
        sourceName,
        network: parsed,
        selected: Object.fromEntries(parsed.nodes.map(node => [node.id, true])),
        edgeSelected: Object.fromEntries(parsed.edges.map(edge => [edge.id, true])),
        index: 0,
      })
      setPasteOpen(false)
      setPasteText('')
    } catch (error) {
      toast(error.message, 'error')
    }
  }, [toast])

  const handleImportFile = useCallback(async (file) => {
    if (!file) return
    if (file.size > 25 * 1024 * 1024) {
      toast('Le JSON dépasse la limite de 25 Mo.', 'error')
      if (importInputRef.current) importInputRef.current.value = ''
      return
    }
    try { loadImport(await file.text(), file.name) }
    catch (error) { toast(error.message || 'Fichier illisible', 'error') }
    finally { if (importInputRef.current) importInputRef.current.value = '' }
  }, [loadImport, toast])

  const confirmImport = useCallback(() => {
    if (!importDraft) return
    const selected = new Set(Object.entries(importDraft.selected).filter(([, value]) => value).map(([id]) => id))
    if (!selected.size) { toast('Aucun nœud sélectionné', 'error'); return }
    const reviewedImport = {
      ...importDraft.network,
      edges: importDraft.network.edges.filter(edge => importDraft.edgeSelected?.[edge.id] !== false),
    }
    const next = mergeActorNetwork(networkRef.current, reviewedImport, selected)
    setNetwork(next)
    setYear(Math.max(next.settings.min_year, Math.min(next.settings.max_year, year)))
    setImportDraft(null)
    if (next.nodes.length >= LARGE_NETWORK_THRESHOLD) {
      requestAnimationFrame(() => runDynamicLayout(next))
      toast(`${selected.size} nœud${selected.size > 1 ? 's' : ''} importé${selected.size > 1 ? 's' : ''} · disposition en cours`)
    } else {
      persist(next)
      requestAnimationFrame(() => fitNetwork(next.nodes))
      toast(`${selected.size} nœud${selected.size > 1 ? 's' : ''} importé${selected.size > 1 ? 's' : ''}`)
    }
  }, [fitNetwork, importDraft, persist, runDynamicLayout, toast, year])

  const applyRawJson = useCallback(() => {
    try {
      const next = parseActorNetworkJson(rawJson)
      setNetwork(next)
      setYear(Math.max(next.settings.min_year, Math.min(next.settings.max_year, year)))
      persist(next)
      setMode('graph')
      toast('JSON appliqué')
    } catch (error) {
      toast(error.message || 'JSON invalide', 'error')
    }
  }, [persist, rawJson, toast, year])

  const flushPending = useCallback(async () => {
    if (!dirtyRef.current || !openFileId) return null
    clearTimeout(saveTimerRef.current)
    setSaving(true)
    try {
      const content = stringifyActorNetwork(networkRef.current)
      const result = await saveFile(openFileId, content)
      setRawJson(content)
      setDirty(false)
      return result
    } finally {
      setSaving(false)
    }
  }, [openFileId, saveFile])

  const applyHistoryContent = useCallback((value) => {
    const next = parseActorNetworkJson(value)
    setNetwork(next)
    setRawJson(value)
    setYear(next.settings.default_year)
    setSelectedId(null)
    setDirty(false)
  }, [])
  const history = useFileHistoryActions({ flushPending, applyContent: applyHistoryContent, hasPending: dirty })

  const startStudy = useCallback(() => {
    const cards = buildStudyCards(visibleNodes, network.nodes, displayYear, network.learning?.progress || {})
    if (!cards.length) {
      toast('Ajoute au moins une image à une personne, un poste ou une organisation visible.', 'error')
      return
    }
    setStudy({ cards: cards.slice(0, 12), index: 0, revealed: false, known: 0, forgotten: 0 })
  }, [displayYear, network.learning?.progress, network.nodes, toast, visibleNodes])

  const gradeStudy = useCallback((known) => {
    const card = study?.cards[study.index]
    if (!card) return
    const current = networkRef.current.learning?.progress?.[card.key] || {}
    const interval = known ? nextInterval(current.interval_days) : 1
    const reviewed = new Date()
    const due = new Date(reviewed)
    due.setDate(due.getDate() + interval)
    const nextNetwork = {
      ...networkRef.current,
      learning: {
        progress: {
          ...(networkRef.current.learning?.progress || {}),
          [card.key]: {
            seen: Number(current.seen || 0) + 1,
            known: Number(current.known || 0) + (known ? 1 : 0),
            forgotten: Number(current.forgotten || 0) + (known ? 0 : 1),
            interval_days: interval,
            last_reviewed: reviewed.toISOString(),
            next_review: due.toISOString(),
          },
        },
      },
    }
    setNetwork(nextNetwork)
    persist(nextNetwork)
    setStudy(previous => ({
      ...previous,
      index: previous.index + 1,
      revealed: false,
      known: previous.known + (known ? 1 : 0),
      forgotten: previous.forgotten + (known ? 0 : 1),
    }))
  }, [persist, study])

  return (
    <div className={`actor-network-editor ${layoutRunning ? 'layout-running' : ''}`}>
      <header className="actor-network-titlebar">
        <div className="actor-network-heading">
          <h2 className="editor-filename">{currentFile.name.replace(/\.json$/i, '')}</h2>
          <span className={`save-status ${dirty ? 'dirty' : ''}`}>
            {saving ? 'Enregistrement…' : dirty ? 'non sauvegardé' : 'sauvegardé'}
          </span>
        </div>
        <div className="actor-network-toolbar">
          <FileHistoryControls history={history} />
          <button type="button" className="btn-ghost" onClick={startStudy}><Icon name="play" size={15} /> Mémoriser</button>
          <button type="button" className="btn-ghost" onClick={copyPrompt}><Icon name="copy" size={15} /> Prompt JSON</button>
          <button type="button" className="btn-ghost" onClick={() => setPasteOpen(true)}>Coller JSON</button>
          <button type="button" className="btn-ghost" onClick={() => importInputRef.current?.click()}><Icon name="upload" size={15} /> Importer</button>
          <input ref={importInputRef} hidden type="file" accept=".json,application/json" onChange={event => handleImportFile(event.target.files?.[0])} />
          <div className="view-toggle">
            <button className={mode === 'graph' ? 'active' : ''} onClick={() => setMode('graph')}>Graphe</button>
            <button className={mode === 'json' ? 'active' : ''} onClick={() => { setRawJson(stringifyActorNetwork(network)); setMode('json') }}>JSON</button>
          </div>
        </div>
      </header>

      {mode === 'json' ? (
        <div className="actor-network-json-mode">
          <textarea value={rawJson} onChange={event => setRawJson(event.target.value)} spellCheck={false} />
          <div className="actor-network-json-actions">
            <span>Mode de secours : le graphe n’est modifié qu’après validation.</span>
            <button type="button" className="btn-primary" onClick={applyRawJson}>Valider le JSON</button>
          </div>
        </div>
      ) : (
        <>
          <div className="actor-network-timebar">
            <div className="actor-network-year-readout">
              <span>{allDates ? 'Période' : 'Année'}</span>
              <strong>{allDates ? 'Toutes' : formatYear(year)}</strong>
            </div>
            <button
              type="button"
              className={`actor-network-all-dates ${allDates ? 'active' : ''}`}
              aria-pressed={allDates}
              title={`Ignorer les périodes et afficher le titulaire actif en ${CURRENT_YEAR} pour chaque poste`}
              onClick={() => setAllDates(value => !value)}
            >
              Toutes les dates
            </button>
            <input
              aria-label="Année affichée"
              type="range"
              min={network.settings.min_year}
              max={network.settings.max_year}
              value={year}
              disabled={allDates}
              onChange={event => setYear(Number(event.target.value))}
            />
            <input
              className="actor-network-year-input"
              aria-label="Saisir une année"
              type="number"
              min={network.settings.min_year}
              max={network.settings.max_year}
              value={year}
              disabled={allDates}
              onChange={event => setYear(clampYear(event.target.value, network.settings))}
            />
            <div className="actor-network-range-fields">
              <label>Début <input type="number" value={network.settings.min_year} onChange={event => updateNetwork(previous => ({ ...previous, settings: { ...previous.settings, min_year: Number(event.target.value) } }), { normalize: true })} /></label>
              <label>Fin <input type="number" value={network.settings.max_year} onChange={event => updateNetwork(previous => ({ ...previous, settings: { ...previous.settings, max_year: Number(event.target.value) } }), { normalize: true })} /></label>
            </div>
            <label className="actor-network-inactive-toggle"><input type="checkbox" checked={network.settings.show_inactive} disabled={allDates} onChange={event => updateNetwork(previous => ({ ...previous, settings: { ...previous.settings, show_inactive: event.target.checked } }))} /> Inactifs de l’année</label>
            <div className="actor-network-layout-actions">
              <button type="button" className={layoutRunning ? 'active' : ''} onClick={layoutRunning ? stopDynamicLayout : () => runDynamicLayout()}>
                <Icon name="graph" size={14} /> {layoutRunning ? 'Arrêter' : 'Organiser'}
              </button>
              <button type="button" onClick={() => fitNetwork(visibleNodes)} title="Afficher tous les nœuds visibles dans le cadre">
                <Icon name="expand" size={14} /> Cadrer
              </button>
            </div>
            <div className="actor-network-zoom">
              <button type="button" onClick={() => setZoom(value => Math.max(MIN_ZOOM, value - 0.1))}>−</button>
              <button type="button" onClick={() => setZoom(0.9)}>{Math.round(zoom * 100)}%</button>
              <button type="button" onClick={() => setZoom(value => Math.min(MAX_ZOOM, value + 0.1))}>+</button>
            </div>
            <div className="actor-network-adds">
              {ACTOR_NODE_TYPES.map(type => (
                <button type="button" key={type.value} onClick={() => addNode(type.value)} style={{ '--actor-color': type.color }}>
                  <span /> {type.label}
                </button>
              ))}
            </div>
          </div>

          <div className="actor-network-workspace">
            <div
              ref={stageRef}
              className="actor-network-stage"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onClick={() => setSelectedId(null)}
            >
              <div className="actor-network-canvas" style={{ width: canvasSize.width * zoom, height: canvasSize.height * zoom }}>
                <div ref={viewportRef} className="actor-network-viewport" style={{ width: canvasSize.width, height: canvasSize.height, transform: `scale(${zoom})` }}>
                  <svg className="actor-network-lines" width={canvasSize.width} height={canvasSize.height}>
                    <defs>
                      <marker id="actor-network-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                        <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
                      </marker>
                    </defs>
                    {visibleEdges.map(edge => {
                      const from = nodeMap.get(edge.from)
                      const to = nodeMap.get(edge.to)
                      if (!from || !to) return null
                      const { start, end } = edgePoints(from, to)
                      const labelX = (start.x + end.x) / 2
                      const labelY = (start.y + end.y) / 2
                      const highlighted = selectedId && (edge.from === selectedId || edge.to === selectedId)
                      const dimmed = selectedId && !highlighted
                      return (
                        <g key={edge.id} className={`actor-network-edge-group ${highlighted ? 'highlighted' : ''} ${dimmed ? 'dimmed' : ''}`}>
                          <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={edge.color} markerEnd="url(#actor-network-arrow)" />
                          {(showAllEdgeLabels || highlighted) && (
                            <g transform={`translate(${labelX} ${labelY})`}>
                              <rect x="-66" y="-13" width="132" height="26" rx="8" />
                              <text textAnchor="middle" dominantBaseline="middle">{edge.label}</text>
                            </g>
                          )}
                        </g>
                      )
                    })}
                  </svg>
                  {visibleNodes.map(node => (
                    <ActorCard
                      key={node.id}
                      node={node}
                      nodes={network.nodes}
                      year={displayYear}
                      selected={selectedId === node.id}
                      onPointerDown={event => handlePointerDown(event, node)}
                      onClick={event => { event.stopPropagation(); setSelectedId(node.id) }}
                    />
                  ))}
                  {!visibleNodes.length && (
                    <div className="actor-network-empty-year">
                      <Icon name="timeline" size={34} />
                      <strong>Aucun acteur visible en {formatYear(year)}</strong>
                      <span>Change l’année, active « Toutes les dates » ou ajoute un acteur.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <ActorInspector
              node={selectedNode}
              nodes={network.nodes}
              edges={network.edges}
              year={displayYear}
              onUpdate={patch => updateNode(selectedNode.id, patch)}
              onUpdateNode={updateNode}
              onUpdateNetwork={updateNetwork}
              onDelete={() => deleteNode(selectedNode)}
              toast={toast}
            />
          </div>
        </>
      )}

      {pasteOpen && (
        <div className="actor-network-overlay" role="dialog" aria-modal="true">
          <section className="actor-network-paste-panel">
            <header><div><h3>Coller un réseau JSON</h3><p>Le contenu sera contrôlé nœud par nœud avant import.</p></div><button className="icon-btn" onClick={() => setPasteOpen(false)}>×</button></header>
            <textarea autoFocus value={pasteText} onChange={event => setPasteText(event.target.value)} placeholder="{ ... }" spellCheck={false} />
            <footer><button className="btn-ghost" onClick={copyPrompt}><Icon name="copy" size={15} /> Copier le prompt</button><button className="btn-primary" disabled={!pasteText.trim()} onClick={() => loadImport(pasteText, 'JSON collé')}>Analyser</button></footer>
          </section>
        </div>
      )}

      {importDraft && (
        <ActorImportReview
          draft={importDraft}
          setDraft={setImportDraft}
          onClose={() => setImportDraft(null)}
          onConfirm={confirmImport}
          toast={toast}
        />
      )}

      {study && (
        <ActorStudy
          study={study}
          year={displayYear}
          allDates={allDates}
          onReveal={() => setStudy(previous => ({ ...previous, revealed: true }))}
          onGrade={gradeStudy}
          onClose={() => setStudy(null)}
        />
      )}
    </div>
  )
}

function ActorCard({ node, nodes, year, selected, onPointerDown, onClick }) {
  const resolved = resolveActorNode(node, nodes, year)
  const image = pickActorImage(resolved.entity, year, year)
  const typeLabel = ACTOR_NODE_TYPES.find(item => item.value === node.type)?.label || 'Acteur'
  return (
    <article
      className={`actor-network-card ${selected ? 'selected' : ''} type-${node.type}`}
      style={{ left: node.x + CANVAS_PADDING, top: node.y + CANVAS_PADDING, '--actor-color': node.color }}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <div className="actor-network-card-image">
        {image ? <img src={image.src} alt={image.alt || resolved.displayName} draggable="false" referrerPolicy="no-referrer" /> : <Icon name={node.type === 'organization' ? 'database' : node.type === 'position' ? 'compass' : 'image'} size={36} />}
        <span>{typeLabel}</span>
      </div>
      <div className="actor-network-card-copy">
        <strong>{resolved.displayName}</strong>
        {node.type === 'position' && <span className="actor-network-position-name">{node.name}</span>}
        {node.type !== 'position' && node.subtitle && <span>{node.subtitle}</span>}
        {node.type === 'position' && resolved.assignment && <small>{formatRange(resolved.assignment.from_year, resolved.assignment.to_year)}</small>}
        <p>{node.summary || resolved.entity?.summary || 'Aucun résumé.'}</p>
      </div>
    </article>
  )
}

function ActorInspector({ node, nodes, edges, year, onUpdate, onUpdateNode, onUpdateNetwork, onDelete, toast }) {
  const [targetId, setTargetId] = useState('')
  const [edgeLabel, setEdgeLabel] = useState('')
  const [edgeCause, setEdgeCause] = useState('')

  useEffect(() => { setTargetId(''); setEdgeLabel(''); setEdgeCause('') }, [node?.id])

  if (!node) {
    return (
      <aside className="actor-network-inspector empty">
        <Icon name="graph" size={38} />
        <strong>Sélectionne un nœud</strong>
        <p>Le panneau permet d’ajouter son texte, plusieurs images, ses dates, ses titulaires et la cause de ses relations.</p>
      </aside>
    )
  }

  const patchImage = (id, patch) => onUpdate({ images: node.images.map(image => image.id === id ? { ...image, ...patch } : image) })
  const removeImage = id => onUpdate({ images: node.images.filter(image => image.id !== id) })
  const addImageFile = async file => {
    if (!file) return
    try {
      const src = await fileToWebpDataUrl(file)
      onUpdate({ images: [...node.images, { id: makeActorId('img'), src, alt: `Image de ${node.name}`, caption: '', credit: '', license: '', source_url: '', from_year: null, to_year: null }] })
    } catch (error) { toast(error.message, 'error') }
  }
  const addImageUrl = () => {
    try {
      const src = promptImageUrl()
      if (src) onUpdate({ images: [...node.images, { id: makeActorId('img'), src, alt: `Image de ${node.name}`, caption: '', credit: '', license: '', source_url: src, from_year: null, to_year: null }] })
    } catch (error) { toast(error.message, 'error') }
  }
  const addDate = () => onUpdate({ dates: [...node.dates, { id: makeActorId('date'), year, label: 'Date clé', description: '' }] })
  const updateDate = (id, patch) => onUpdate({ dates: node.dates.map(item => item.id === id ? { ...item, ...patch } : item) })
  const addAssignment = () => {
    const entity = nodes.find(item => item.type !== 'position')
    if (!entity) { toast('Ajoute d’abord une personne ou une organisation.', 'error'); return }
    onUpdate({ assignments: [...node.assignments, { id: makeActorId('mandat'), entity_id: entity.id, from_year: year, to_year: null, label: 'Titulaire', notes: '', source_url: '' }] })
  }
  const updateAssignment = (id, patch) => onUpdate({ assignments: node.assignments.map(item => item.id === id ? { ...item, ...patch } : item) })

  const addEdge = () => {
    if (!targetId || !edgeLabel.trim() || !edgeCause.trim()) {
      toast('Choisis une cible, un lien et sa cause.', 'error')
      return
    }
    onUpdateNetwork(previous => ({
      ...previous,
      edges: [...previous.edges, { id: makeActorId('e'), from: node.id, to: targetId, label: edgeLabel.trim(), cause: edgeCause.trim(), from_year: year, to_year: null, source_url: '', color: '#7f8da5' }],
    }))
    setTargetId(''); setEdgeLabel(''); setEdgeCause('')
  }
  const updateEdge = (id, patch) => onUpdateNetwork(previous => ({ ...previous, edges: previous.edges.map(edge => edge.id === id ? { ...edge, ...patch } : edge) }))
  const deleteEdge = id => onUpdateNetwork(previous => ({ ...previous, edges: previous.edges.filter(edge => edge.id !== id) }))

  return (
    <aside className="actor-network-inspector">
      <div className="actor-network-inspector-head"><div><span>{ACTOR_NODE_TYPES.find(item => item.value === node.type)?.label}</span><strong>{node.name}</strong></div><button className="icon-btn" title="Supprimer" onClick={onDelete}><Icon name="trash" size={17} /></button></div>

      <Section title="Identité et texte">
        <label>Type<select value={node.type} onChange={event => onUpdateNode(node.id, { type: event.target.value, assignments: event.target.value === 'position' ? node.assignments : [] })}>{ACTOR_NODE_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
        <label>Nom<input value={node.name} onChange={event => onUpdate({ name: event.target.value })} /></label>
        <label>Sous-titre<input value={node.subtitle} onChange={event => onUpdate({ subtitle: event.target.value })} placeholder="Fonction, parti, nature…" /></label>
        <label>Résumé<textarea value={node.summary} onChange={event => onUpdate({ summary: event.target.value })} placeholder="Deux phrases mémorisables" /></label>
        <label>Texte détaillé<textarea className="tall" value={node.details} onChange={event => onUpdate({ details: event.target.value })} /></label>
        <label>Couleur<input type="color" value={node.color} onChange={event => onUpdate({ color: event.target.value })} /></label>
      </Section>

      <Section title="Périodes">
        <div className="actor-network-grid-2">
          <YearField label="Visible dès" value={node.active_from} onChange={value => onUpdate({ active_from: value })} />
          <YearField label="Visible jusqu’à" value={node.active_to} onChange={value => onUpdate({ active_to: value })} />
          {node.type === 'person' && <><YearField label="Naissance" value={node.birth_year} onChange={value => onUpdate({ birth_year: value })} /><YearField label="Décès" value={node.death_year} onChange={value => onUpdate({ death_year: value })} /></>}
          {node.type === 'organization' && <><YearField label="Fondation" value={node.founded_year} onChange={value => onUpdate({ founded_year: value })} /><YearField label="Dissolution" value={node.dissolved_year} onChange={value => onUpdate({ dissolved_year: value })} /></>}
        </div>
        <p className="actor-network-hint">Les dates biographiques n’effacent pas automatiquement un acteur : la visibilité du graphe utilise uniquement « Visible dès/jusqu’à ».</p>
      </Section>

      <Section title={`Images (${node.images.length})`} actions={<><label className="btn-ghost compact">Fichier<input hidden type="file" accept="image/*" onChange={event => addImageFile(event.target.files?.[0])} /></label><button className="btn-ghost compact" onClick={addImageUrl}>URL</button></>}>
        {!node.images.length && <p className="actor-network-hint">Pour apprendre un visage, ajoute idéalement plusieurs photos prises à des moments ou sous des angles différents.</p>}
        {node.images.map(image => (
          <div className="actor-network-image-editor" key={image.id}>
            <img src={image.src} alt="" referrerPolicy="no-referrer" />
            <div>
              <input value={image.alt} onChange={event => patchImage(image.id, { alt: event.target.value })} placeholder="Texte alternatif" />
              <input value={image.caption} onChange={event => patchImage(image.id, { caption: event.target.value })} placeholder="Contexte / époque" />
              <div className="actor-network-grid-2"><input value={image.credit} onChange={event => patchImage(image.id, { credit: event.target.value })} placeholder="Crédit" /><input value={image.license} onChange={event => patchImage(image.id, { license: event.target.value })} placeholder="Licence" /></div>
              <input value={image.source_url} onChange={event => patchImage(image.id, { source_url: event.target.value })} placeholder="URL de la source" />
              <div className="actor-network-grid-2"><YearField label="Dès" value={image.from_year} onChange={value => patchImage(image.id, { from_year: value })} /><YearField label="Jusqu’à" value={image.to_year} onChange={value => patchImage(image.id, { to_year: value })} /></div>
              <button className="actor-network-text-danger" onClick={() => removeImage(image.id)}>Retirer l’image</button>
            </div>
          </div>
        ))}
      </Section>

      <Section title={`Dates clés (${node.dates.length})`} actions={<button className="btn-ghost compact" onClick={addDate}>+ Date</button>}>
        {node.dates.map(item => <div className="actor-network-date-row" key={item.id}><YearField label="Année" value={item.year} onChange={value => updateDate(item.id, { year: value })} /><input value={item.label} onChange={event => updateDate(item.id, { label: event.target.value })} placeholder="Événement" /><textarea value={item.description} onChange={event => updateDate(item.id, { description: event.target.value })} placeholder="Pourquoi cette date compte" /><button onClick={() => onUpdate({ dates: node.dates.filter(date => date.id !== item.id) })}>Retirer</button></div>)}
      </Section>

      {node.type === 'position' && (
        <Section title={`Titulaires (${node.assignments.length})`} actions={<button className="btn-ghost compact" onClick={addAssignment}>+ Titulaire</button>}>
          {node.assignments.map(item => <div className="actor-network-assignment" key={item.id}><select value={item.entity_id} onChange={event => updateAssignment(item.id, { entity_id: event.target.value })}>{nodes.filter(candidate => candidate.type !== 'position').map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><div className="actor-network-grid-2"><YearField label="De" value={item.from_year} onChange={value => updateAssignment(item.id, { from_year: value })} /><YearField label="À" value={item.to_year} onChange={value => updateAssignment(item.id, { to_year: value })} /></div><input value={item.label} onChange={event => updateAssignment(item.id, { label: event.target.value })} placeholder="Libellé" /><textarea value={item.notes} onChange={event => updateAssignment(item.id, { notes: event.target.value })} placeholder="Contexte du mandat" /><input value={item.source_url} onChange={event => updateAssignment(item.id, { source_url: event.target.value })} placeholder="Source HTTPS" /><button className="actor-network-text-danger" onClick={() => onUpdate({ assignments: node.assignments.filter(assignment => assignment.id !== item.id) })}>Retirer</button></div>)}
        </Section>
      )}

      <Section title="Nouvelle relation">
        <label>Cible<select value={targetId} onChange={event => setTargetId(event.target.value)}><option value="">Choisir…</option>{nodes.filter(candidate => candidate.id !== node.id).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
        <label>Lien<input value={edgeLabel} onChange={event => setEdgeLabel(event.target.value)} placeholder="nomme, finance, influence…" /></label>
        <label>Cause<textarea value={edgeCause} onChange={event => setEdgeCause(event.target.value)} placeholder="Pourquoi ou par quel mécanisme les deux nœuds sont-ils liés ?" /></label>
        <button className="btn-primary" onClick={addEdge}>Créer la relation dès {formatYear(year)}</button>
      </Section>

      <Section title="Relations">
        {edges.filter(edge => edge.from === node.id || edge.to === node.id).map(edge => {
          const outgoing = edge.from === node.id
          const other = nodes.find(candidate => candidate.id === (outgoing ? edge.to : edge.from))
          return <div className="actor-network-edge-editor" key={edge.id}><div><span>{outgoing ? '→' : '←'} {other?.name}</span><button onClick={() => deleteEdge(edge.id)}>Retirer</button></div><input value={edge.label} onChange={event => updateEdge(edge.id, { label: event.target.value })} /><textarea value={edge.cause} onChange={event => updateEdge(edge.id, { cause: event.target.value })} placeholder="Cause" /><div className="actor-network-grid-2"><YearField label="De" value={edge.from_year} onChange={value => updateEdge(edge.id, { from_year: value })} /><YearField label="À" value={edge.to_year} onChange={value => updateEdge(edge.id, { to_year: value })} /></div><input value={edge.source_url} onChange={event => updateEdge(edge.id, { source_url: event.target.value })} placeholder="Source HTTPS" /></div>
        })}
      </Section>
    </aside>
  )
}

function ActorImportReview({ draft, setDraft, onClose, onConfirm, toast }) {
  const node = draft.network.nodes[draft.index]
  const selectedCount = Object.values(draft.selected).filter(Boolean).length
  if (!node) {
    const updateEdge = (id, patch) => setDraft(previous => ({
      ...previous,
      network: { ...previous.network, edges: previous.network.edges.map(edge => edge.id === id ? { ...edge, ...patch } : edge) },
    }))
    return (
      <div className="actor-network-overlay" role="dialog" aria-modal="true">
        <section className="actor-network-import-panel">
          <header><div><span>Import · {draft.sourceName}</span><h3>Vérifier les relations</h3></div><button className="icon-btn" onClick={onClose}>×</button></header>
          <div className="actor-network-import-progress"><i style={{ width: '100%' }} /></div>
          <div className="actor-network-import-body">
            <p className="actor-network-hint">Chaque relation retenue doit expliquer sa cause. Une relation vers un nœud écarté sera ignorée.</p>
            {draft.network.edges.length === 0 && <div className="actor-network-import-no-edge">Aucune relation dans cet import.</div>}
            {draft.network.edges.map(edge => {
              const from = draft.network.nodes.find(item => item.id === edge.from)
              const to = draft.network.nodes.find(item => item.id === edge.to)
              const endpointsSelected = draft.selected[edge.from] && draft.selected[edge.to]
              return (
                <article key={edge.id} className={`actor-network-import-edge ${endpointsSelected ? '' : 'muted'}`}>
                  <label className="actor-network-import-select"><input type="checkbox" disabled={!endpointsSelected} checked={endpointsSelected && draft.edgeSelected?.[edge.id] !== false} onChange={event => setDraft(previous => ({ ...previous, edgeSelected: { ...previous.edgeSelected, [edge.id]: event.target.checked } }))} /> {from?.name} → {to?.name}</label>
                  <label>Lien<input value={edge.label} onChange={event => updateEdge(edge.id, { label: event.target.value })} /></label>
                  <label>Cause<textarea value={edge.cause} className={!edge.cause.trim() ? 'invalid' : ''} onChange={event => updateEdge(edge.id, { cause: event.target.value })} placeholder="Cause ou mécanisme obligatoire" /></label>
                  <div className="actor-network-grid-2"><YearField label="De" value={edge.from_year} onChange={value => updateEdge(edge.id, { from_year: value })} /><YearField label="À" value={edge.to_year} onChange={value => updateEdge(edge.id, { to_year: value })} /></div>
                  <label>Source<input value={edge.source_url} onChange={event => updateEdge(edge.id, { source_url: event.target.value })} placeholder="https://…" /></label>
                </article>
              )
            })}
          </div>
          <footer><span>{selectedCount} nœud{selectedCount > 1 ? 's' : ''} retenu{selectedCount > 1 ? 's' : ''}</span><div><button className="btn-ghost" onClick={() => setDraft(previous => ({ ...previous, index: previous.network.nodes.length - 1 }))}>Précédent</button><button className="btn-primary" disabled={draft.network.edges.some(edge => draft.edgeSelected?.[edge.id] !== false && draft.selected[edge.from] && draft.selected[edge.to] && !edge.cause.trim())} onClick={onConfirm}>Importer le réseau</button></div></footer>
        </section>
      </div>
    )
  }
  const updateNode = patch => setDraft(previous => ({
    ...previous,
    network: { ...previous.network, nodes: previous.network.nodes.map(item => item.id === node.id ? { ...item, ...patch } : item) },
  }))
  const addImage = async file => {
    if (!file) return
    try {
      const src = await fileToWebpDataUrl(file)
      updateNode({ images: [...node.images, { id: makeActorId('img'), src, alt: `Image de ${node.name}`, caption: '', credit: '', license: '', source_url: '', from_year: null, to_year: null }] })
    } catch (error) { toast(error.message, 'error') }
  }
  const addUrl = () => {
    try {
      const src = promptImageUrl()
      if (src) updateNode({ images: [...node.images, { id: makeActorId('img'), src, alt: `Image de ${node.name}`, caption: '', credit: '', license: '', source_url: src, from_year: null, to_year: null }] })
    } catch (error) { toast(error.message, 'error') }
  }
  return (
    <div className="actor-network-overlay" role="dialog" aria-modal="true">
      <section className="actor-network-import-panel">
        <header><div><span>Import · {draft.sourceName}</span><h3>Nœud {draft.index + 1} sur {draft.network.nodes.length}</h3></div><button className="icon-btn" onClick={onClose}>×</button></header>
        <div className="actor-network-import-progress"><i style={{ width: `${((draft.index + 1) / draft.network.nodes.length) * 100}%` }} /></div>
        <div className="actor-network-import-body">
          <label className="actor-network-import-select"><input type="checkbox" checked={Boolean(draft.selected[node.id])} onChange={event => setDraft(previous => ({ ...previous, selected: { ...previous.selected, [node.id]: event.target.checked } }))} /> Importer ce nœud</label>
          <div className="actor-network-import-preview">
            {node.images[0] ? <img src={node.images[0].src} alt="" referrerPolicy="no-referrer" /> : <div><Icon name="image" size={36} /><span>Aucune image</span></div>}
            <div><strong>{node.name}</strong><span>{ACTOR_NODE_TYPES.find(type => type.value === node.type)?.label}</span><p>{node.summary || 'Sans résumé'}</p></div>
          </div>
          <div className="actor-network-import-form">
            <label>Type<select value={node.type} onChange={event => updateNode({ type: event.target.value })}>{ACTOR_NODE_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
            <label>Nom<input value={node.name} onChange={event => updateNode({ name: event.target.value })} /></label>
            <label>Sous-titre<input value={node.subtitle} onChange={event => updateNode({ subtitle: event.target.value })} /></label>
            <label>Résumé<textarea value={node.summary} onChange={event => updateNode({ summary: event.target.value })} /></label>
            <label>Texte<textarea className="tall" value={node.details} onChange={event => updateNode({ details: event.target.value })} /></label>
            <div className="actor-network-grid-2"><YearField label="Visible dès" value={node.active_from} onChange={value => updateNode({ active_from: value })} /><YearField label="Visible jusqu’à" value={node.active_to} onChange={value => updateNode({ active_to: value })} /></div>
            <div className="actor-network-import-image-actions"><label className="btn-ghost">Ajouter un fichier<input hidden type="file" accept="image/*" onChange={event => addImage(event.target.files?.[0])} /></label><button className="btn-ghost" onClick={addUrl}>Ajouter une URL</button></div>
            {node.images.map((image, index) => <div key={image.id} className="actor-network-import-image-row"><img src={image.src} alt="" referrerPolicy="no-referrer" /><input value={image.caption} onChange={event => updateNode({ images: node.images.map(item => item.id === image.id ? { ...item, caption: event.target.value } : item) })} placeholder={`Légende image ${index + 1}`} /><button onClick={() => updateNode({ images: node.images.filter(item => item.id !== image.id) })}>×</button></div>)}
          </div>
        </div>
        <footer><span>{selectedCount} nœud{selectedCount > 1 ? 's' : ''} retenu{selectedCount > 1 ? 's' : ''} · les relations dont une extrémité est écartée seront ignorées.</span><div><button className="btn-ghost" disabled={draft.index === 0} onClick={() => setDraft(previous => ({ ...previous, index: previous.index - 1 }))}>Précédent</button><button className="btn-primary" onClick={() => setDraft(previous => ({ ...previous, index: previous.index + 1 }))}>{draft.index < draft.network.nodes.length - 1 ? 'Suivant' : 'Vérifier les relations'}</button></div></footer>
      </section>
    </div>
  )
}

function ActorStudy({ study, year, allDates, onReveal, onGrade, onClose }) {
  const card = study.cards[study.index]
  if (!card) {
    return <div className="actor-network-overlay" role="dialog" aria-modal="true"><section className="actor-study-panel done"><Icon name="check" size={42} /><h3>Session terminée</h3><p>{study.known} su · {study.forgotten} à revoir</p><button className="btn-primary" onClick={onClose}>Fermer</button></section></div>
  }
  return (
    <div className="actor-network-overlay" role="dialog" aria-modal="true">
      <section className="actor-study-panel">
        <header><div><span>Mémorisation · {allDates ? 'toutes les dates' : formatYear(year)}</span><strong>{study.index + 1} / {study.cards.length}</strong></div><button className="icon-btn" onClick={onClose}>×</button></header>
        <div className="actor-study-image"><img src={card.image.src} alt={study.revealed ? card.image.alt : ''} referrerPolicy="no-referrer" /></div>
        <div className="actor-study-question">
          {!study.revealed ? <><span>{card.type === 'organization' ? 'Quelle organisation est-ce ?' : 'Qui est cette personne ?'}</span><strong>Essaie de retrouver son nom et son rôle.</strong></> : <><span>{card.subtitle}</span><h3>{card.name}</h3>{card.summary && <p>{card.summary}</p>}{card.details && <details><summary>Voir le texte détaillé</summary><p>{card.details}</p></details>}{card.dates.length > 0 && <ul>{card.dates.slice(0, 4).map(item => <li key={item.id}><strong>{formatYear(item.year)}</strong> {item.label}</li>)}</ul>}</>}
        </div>
        <footer>{!study.revealed ? <button className="btn-primary" onClick={onReveal}>Afficher l’identité</button> : <><button className="btn-ghost danger" onClick={() => onGrade(false)}>À revoir</button><button className="btn-primary" onClick={() => onGrade(true)}>Je savais</button></>}</footer>
      </section>
    </div>
  )
}

function Section({ title, actions, children }) {
  return <section className="actor-network-section"><header><strong>{title}</strong>{actions && <div>{actions}</div>}</header><div className="actor-network-section-body">{children}</div></section>
}

function YearField({ label, value, onChange }) {
  return <label>{label}<input type="number" value={value ?? ''} onChange={event => onChange(event.target.value === '' ? null : Number(event.target.value))} placeholder="—" /></label>
}

function safeParse(file) {
  try { return parseActorNetworkJson(file?.content || '{}') }
  catch (_) { return parseActorNetworkJson(JSON.stringify({ philoweek_type: 'actor_network', version: 1, title: file?.name?.replace(/\.json$/i, '') || 'Réseau d’acteurs', nodes: [], edges: [] })) }
}

function getCanvasSize(nodes) {
  if (!nodes.length) return { width: BASE_CANVAS_WIDTH, height: BASE_CANVAS_HEIGHT }
  const maxX = Math.max(0, ...nodes.map(node => Number(node.x) || 0))
  const maxY = Math.max(0, ...nodes.map(node => Number(node.y) || 0))
  return {
    width: Math.max(BASE_CANVAS_WIDTH, Math.ceil(maxX + NODE_WIDTH + CANVAS_PADDING * 2)),
    height: Math.max(BASE_CANVAS_HEIGHT, Math.ceil(maxY + NODE_HEIGHT + CANVAS_PADDING * 2)),
  }
}

function getRawNodeBounds(nodes) {
  if (!nodes.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
  const xs = nodes.map(node => Number(node.x) || 0)
  const ys = nodes.map(node => Number(node.y) || 0)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

function getNodeBounds(nodes) {
  const raw = getRawNodeBounds(nodes)
  return {
    ...raw,
    width: Math.max(NODE_WIDTH, raw.maxX - raw.minX + NODE_WIDTH),
    height: Math.max(NODE_HEIGHT, raw.maxY - raw.minY + NODE_HEIGHT),
  }
}

function getLayoutArea(count) {
  const columns = Math.max(2, Math.ceil(Math.sqrt(count * 1.35)))
  const rows = Math.ceil(count / columns)
  return {
    width: Math.max(1800, columns * (NODE_WIDTH + 142)),
    height: Math.max(1250, rows * (NODE_HEIGHT + 132)),
  }
}

function stripVelocity(node) {
  const { vx, vy, ...clean } = node
  return clean
}

function getViewCenter(stage, zoom) {
  if (!stage) return null
  return {
    x: (stage.scrollLeft + stage.clientWidth / 2) / zoom - CANVAS_PADDING - NODE_WIDTH / 2,
    y: (stage.scrollTop + stage.clientHeight / 2) / zoom - CANVAS_PADDING - NODE_HEIGHT / 2,
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function nodeCenter(node) {
  return { x: node.x + CANVAS_PADDING + NODE_WIDTH / 2, y: node.y + CANVAS_PADDING + NODE_HEIGHT / 2 }
}

function edgePoints(from, to) {
  const fromCenter = nodeCenter(from)
  const toCenter = nodeCenter(to)
  const dx = toCenter.x - fromCenter.x
  const dy = toCenter.y - fromCenter.y
  const border = (center, directionX, directionY) => {
    const scaleX = directionX === 0 ? Infinity : (NODE_WIDTH / 2 + 3) / Math.abs(directionX)
    const scaleY = directionY === 0 ? Infinity : (NODE_HEIGHT / 2 + 3) / Math.abs(directionY)
    const scale = Math.min(scaleX, scaleY)
    return { x: center.x + directionX * scale, y: center.y + directionY * scale }
  }
  return {
    start: border(fromCenter, dx, dy),
    end: border(toCenter, -dx, -dy),
  }
}

function buildStudyCards(visibleNodes, allNodes, year, progress) {
  const now = Date.now()
  const cards = visibleNodes.map((node, index) => {
    const resolved = resolveActorNode(node, allNodes, year)
    const entity = resolved.entity
    const key = node.type === 'position' ? `${node.id}:${resolved.assignment?.id || 'vacant'}` : node.id
    const stats = progress[key] || {}
    const image = pickActorImage(entity, year, Number(stats.seen || 0) + index)
    if (!entity || !image) return null
    return {
      key,
      type: entity.type,
      name: resolved.displayName,
      subtitle: node.type === 'position' ? node.name : entity.subtitle,
      summary: node.summary || entity.summary,
      details: node.details || entity.details,
      dates: entity.dates || [],
      image,
      due: stats.next_review ? new Date(stats.next_review).getTime() : 0,
      seen: Number(stats.seen || 0),
    }
  }).filter(Boolean)
  return cards.sort((a, b) => (a.due > now) - (b.due > now) || a.due - b.due || a.seen - b.seen)
}

function nextInterval(previous) {
  const value = Number(previous || 0)
  if (value < 1) return 1
  if (value === 1) return 3
  if (value < 7) return 7
  return Math.min(60, Math.round(value * 1.8))
}

async function fileToWebpDataUrl(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Choisis un fichier image.')
  if (file.size > 15 * 1024 * 1024) throw new Error('Image trop lourde (15 Mo maximum).')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const max = 1100
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  return canvas.toDataURL('image/webp', 0.82)
}

async function copyText(value) {
  try { await navigator.clipboard.writeText(value); return true }
  catch (_) {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    textarea.remove()
    return copied
  }
}

function clampYear(value, settings) {
  const number = Number(value)
  if (!Number.isFinite(number)) return settings.default_year
  return Math.max(settings.min_year, Math.min(settings.max_year, Math.round(number)))
}

function formatRange(from, to) {
  if (from == null && to == null) return 'Période ouverte'
  return `${from == null ? '…' : formatYear(from)} – ${to == null ? 'aujourd’hui' : formatYear(to)}`
}

function formatYear(value) {
  const year = Number(value)
  return year < 0 ? `${Math.abs(year)} av. J.-C.` : String(year)
}
