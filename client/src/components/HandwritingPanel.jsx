import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { recognizeHandwriting } from '../utils/handwritingOcr'

const PEN_SIZE = 6
const ERASER_SIZE = 28

export default function HandwritingPanel({ onClose, onInsert }) {
  const canvasRef = useRef(null)
  const strokesRef = useRef([])
  const currentStrokeRef = useRef(null)
  const activePointerRef = useRef(null)
  const activePointerTypeRef = useRef(null)
  const pastRef = useRef([])
  const futureRef = useRef([])
  const penDetectedRef = useRef(false)
  const mountedRef = useRef(true)
  const [tool, setTool] = useState('pen')
  const [strokeCount, setStrokeCount] = useState(0)
  const [historyState, setHistoryState] = useState({ past: 0, future: 0 })
  const [phase, setPhase] = useState('draw')
  const [recognizedText, setRecognizedText] = useState('')
  const [progress, setProgress] = useState({ label: '', progress: 0 })
  const [error, setError] = useState('')

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.round(rect.width * ratio)
    const height = Math.round(rect.height * ratio)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    const context = canvas.getContext('2d')
    context.clearRect(0, 0, width, height)
    drawStrokes(context, strokesRef.current, width, height)
    if (currentStrokeRef.current) drawStroke(context, currentStrokeRef.current, width, height)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const observer = new ResizeObserver(redraw)
    observer.observe(canvas)
    redraw()
    return () => {
      mountedRef.current = false
      observer.disconnect()
    }
  }, [redraw])

  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === 'Escape') onClose()
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, redraw])

  const syncHistoryState = () => {
    setHistoryState({ past: pastRef.current.length, future: futureRef.current.length })
    setStrokeCount(strokesRef.current.length)
  }

  const commit = nextStrokes => {
    pastRef.current.push(strokesRef.current)
    futureRef.current = []
    strokesRef.current = nextStrokes
    syncHistoryState()
  }

  function undo() {
    const previous = pastRef.current.pop()
    if (!previous) return
    futureRef.current.push(strokesRef.current)
    strokesRef.current = previous
    currentStrokeRef.current = null
    setPhase('draw')
    syncHistoryState()
    requestAnimationFrame(redraw)
  }

  function redo() {
    const next = futureRef.current.pop()
    if (!next) return
    pastRef.current.push(strokesRef.current)
    strokesRef.current = next
    currentStrokeRef.current = null
    setPhase('draw')
    syncHistoryState()
    requestAnimationFrame(redraw)
  }

  const beginStroke = event => {
    if (phase === 'recognizing') return
    if (event.pointerType === 'pen') {
      penDetectedRef.current = true
      if (activePointerTypeRef.current === 'touch') {
        currentStrokeRef.current = null
        activePointerRef.current = null
        activePointerTypeRef.current = null
      }
    }
    if (event.pointerType === 'touch' && penDetectedRef.current) return
    if (event.pointerType === 'touch' && !event.isPrimary) return
    if (event.pointerType === 'touch' && Math.max(event.width || 0, event.height || 0) > 32) return
    event.preventDefault()
    activePointerRef.current = event.pointerId
    activePointerTypeRef.current = event.pointerType
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch (_) {}
    setPhase('draw')
    setError('')
    currentStrokeRef.current = {
      tool,
      size: tool === 'eraser' ? ERASER_SIZE : PEN_SIZE,
      points: [pointFromEvent(event, event.currentTarget)],
    }
    redraw()
  }

  const continueStroke = event => {
    if (!currentStrokeRef.current || activePointerRef.current !== event.pointerId) return
    event.preventDefault()
    const events = event.getCoalescedEvents?.() || [event]
    for (const pointerEvent of events) {
      currentStrokeRef.current.points.push(pointFromEvent(pointerEvent, event.currentTarget))
    }
    redraw()
  }

  const endStroke = event => {
    if (!currentStrokeRef.current || activePointerRef.current !== event.pointerId) return
    event.preventDefault()
    const stroke = currentStrokeRef.current
    currentStrokeRef.current = null
    activePointerRef.current = null
    activePointerTypeRef.current = null
    const finalPoint = pointFromEvent(event, event.currentTarget)
    const previousPoint = stroke.points[stroke.points.length - 1]
    if (Math.abs(finalPoint.x - previousPoint.x) > 0.0001 || Math.abs(finalPoint.y - previousPoint.y) > 0.0001) {
      stroke.points.push(finalPoint)
    }
    if (stroke.points.length === 1) {
      const point = stroke.points[0]
      stroke.points.push({ ...point, x: point.x + 0.0001 })
    }
    commit([...strokesRef.current, stroke])
    redraw()
  }

  const clearCanvas = () => {
    if (!strokesRef.current.length) return
    commit([])
    setPhase('draw')
    setRecognizedText('')
    setError('')
    requestAnimationFrame(redraw)
  }

  const recognize = async () => {
    if (!strokesRef.current.length || phase === 'recognizing') return
    setPhase('recognizing')
    setError('')
    setProgress({ label: 'Pr\u00e9paration de l\u2019\u00e9criture', progress: 0.04 })
    try {
      const image = exportInk(canvasRef.current, strokesRef.current)
      const text = await recognizeHandwriting(image, update => {
        if (mountedRef.current) setProgress(update)
      })
      if (!mountedRef.current) return
      if (!text) {
        setPhase('draw')
        setError('Aucun texte reconnu. Essaie d\u2019\u00e9crire plus grand et de bien s\u00e9parer les mots.')
        return
      }
      setRecognizedText(text)
      setPhase('review')
    } catch (recognitionError) {
      console.error('handwriting recognition:', recognitionError)
      if (!mountedRef.current) return
      setPhase('draw')
      setError('La reconnaissance locale n\u2019a pas pu d\u00e9marrer. Recharge la page puis r\u00e9essaie.')
    }
  }

  const insert = () => {
    const text = recognizedText.trim()
    if (!text) return
    onInsert(text)
  }

  const selectTool = nextTool => {
    setTool(nextTool)
    setPhase('draw')
    setError('')
    requestAnimationFrame(redraw)
  }

  const morphWords = recognizedText.split(/(\s+)/).filter(Boolean)

  return (
    <div className="handwriting-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="handwriting-panel" role="dialog" aria-modal="true" aria-labelledby="handwriting-title">
        <header className="handwriting-header">
          <div className="handwriting-heading">
            <span className="handwriting-heading-icon"><Icon name="pen" size={19} /></span>
            <div>
              <h3 id="handwriting-title">Écriture au stylo</h3>
              <p>Reconnaissance locale, gratuite et privée</p>
            </div>
          </div>
          <button type="button" className="icon-btn handwriting-close" onClick={onClose} aria-label="Fermer">
            <Icon name="close" size={19} />
          </button>
        </header>

        <div className="handwriting-tools" aria-label="Outils de dessin">
          <div className="handwriting-tool-group">
            <button type="button" className={tool === 'pen' ? 'active' : ''} onClick={() => selectTool('pen')}>
              <Icon name="pen" size={17} /> Stylo
            </button>
            <button type="button" className={tool === 'eraser' ? 'active' : ''} onClick={() => selectTool('eraser')}>
              <Icon name="eraser" size={17} /> Gomme
            </button>
          </div>
          <div className="handwriting-tool-group handwriting-history-tools">
            <button type="button" onClick={undo} disabled={!historyState.past} title="Annuler (Ctrl+Z)">
              <Icon name="undo" size={17} /> <span>Annuler</span>
            </button>
            <button type="button" onClick={redo} disabled={!historyState.future} title="Rétablir (Ctrl+Maj+Z)">
              <Icon name="redo" size={17} /> <span>Rétablir</span>
            </button>
            <button type="button" onClick={clearCanvas} disabled={!strokeCount} className="handwriting-clear">
              Tout effacer
            </button>
          </div>
        </div>

        <div className={`handwriting-paper ${phase === 'review' ? 'is-transforming' : ''}`}>
          <canvas
            ref={canvasRef}
            className="handwriting-canvas"
            onPointerDown={beginStroke}
            onPointerMove={continueStroke}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            aria-label="Zone d’écriture manuscrite"
          />

          {phase === 'recognizing' && (
            <div className="handwriting-recognizing" aria-live="polite">
              <span className="handwriting-scan-line" />
              <span className="handwriting-loader"><Icon name="ai" size={22} /></span>
              <strong>{progress.label}</strong>
              <div className="handwriting-progress"><span style={{ width: `${Math.max(4, progress.progress * 100)}%` }} /></div>
              <small>{Math.round(progress.progress * 100)} %</small>
            </div>
          )}

          {phase === 'review' && (
            <div className="handwriting-morph-text" aria-hidden="true">
              {morphWords.map((word, index) => (
                <span key={`${word}-${index}`} style={{ animationDelay: `${280 + Math.min(index, 18) * 34}ms` }}>{word}</span>
              ))}
            </div>
          )}

          {phase === 'draw' && !strokeCount && (
            <div className="handwriting-empty" aria-hidden="true">
              <Icon name="pen" size={25} />
              <strong>Écris naturellement ici</strong>
              <span>Une ou deux lignes à la fois donnent le meilleur résultat.</span>
            </div>
          )}
        </div>

        {error && <p className="handwriting-error" role="alert">{error}</p>}

        {phase === 'review' && (
          <div className="handwriting-result">
            <div className="handwriting-result-head">
              <label htmlFor="handwriting-result-text">Texte reconnu</label>
              <span>Tu peux le corriger avant de l’insérer.</span>
            </div>
            <textarea
              id="handwriting-result-text"
              value={recognizedText}
              onChange={event => setRecognizedText(event.target.value)}
              autoFocus
              spellCheck
            />
          </div>
        )}

        <footer className="handwriting-footer">
          <span className="handwriting-tip">
            <Icon name="check" size={15} /> Traits foncés, lettres assez grandes, peu de lignes
          </span>
          <div className="handwriting-actions">
            {phase === 'review' && (
              <button type="button" className="btn-ghost" onClick={() => setPhase('draw')}>Reprendre le stylo</button>
            )}
            {phase !== 'review' ? (
              <button type="button" className="btn-primary handwriting-convert" onClick={recognize} disabled={!strokeCount || phase === 'recognizing'}>
                <Icon name="ai" size={17} /> {phase === 'recognizing' ? 'Conversion\u2026' : 'Transformer en texte'}
              </button>
            ) : (
              <button type="button" className="btn-primary handwriting-insert" onClick={insert} disabled={!recognizedText.trim()}>
                <Icon name="check" size={17} /> Insérer dans la note
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  )
}

function pointFromEvent(event, element) {
  const rect = element.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    pressure: event.pressure > 0 ? event.pressure : 0.5,
  }
}

function drawStrokes(context, strokes, width, height) {
  for (const stroke of strokes) drawStroke(context, stroke, width, height)
}

function drawStroke(context, stroke, width, height) {
  const points = stroke.points
  if (!points?.length) return
  const scale = Math.min(width, height) / 620
  context.save()
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
  context.strokeStyle = '#172033'
  context.fillStyle = '#172033'
  context.lineCap = 'round'
  context.lineJoin = 'round'
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const pressure = stroke.tool === 'eraser' ? 1 : Math.max(0.72, (previous.pressure + current.pressure) / 2)
    context.lineWidth = stroke.size * scale * pressure
    context.beginPath()
    context.moveTo(previous.x * width, previous.y * height)
    context.lineTo(current.x * width, current.y * height)
    context.stroke()
  }
  context.restore()
}

function exportInk(canvas, strokes) {
  const rect = canvas.getBoundingClientRect()
  const width = Math.round(Math.min(2200, Math.max(1200, rect.width * 2.4)))
  const height = Math.round(width * (rect.height / Math.max(rect.width, 1)))
  const inkCanvas = document.createElement('canvas')
  inkCanvas.width = width
  inkCanvas.height = height
  const inkContext = inkCanvas.getContext('2d', { willReadFrequently: true })
  inkContext.clearRect(0, 0, width, height)
  drawStrokes(inkContext, strokes, width, height)

  const pixels = inkContext.getImageData(0, 0, width, height).data
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] > 24) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (minX > maxX || minY > maxY) throw new Error('empty handwriting')

  const padding = 56
  const cropWidth = maxX - minX + 1
  const cropHeight = maxY - minY + 1
  const output = document.createElement('canvas')
  output.width = cropWidth + padding * 2
  output.height = cropHeight + padding * 2
  const outputContext = output.getContext('2d')
  outputContext.fillStyle = '#ffffff'
  outputContext.fillRect(0, 0, output.width, output.height)
  // Les traits de stylet peuvent etre tres fins. Quelques decalages opaques
  // les epaississent uniquement pour l'OCR, sans modifier le dessin affiche.
  for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
    for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
      outputContext.drawImage(
        inkCanvas,
        minX,
        minY,
        cropWidth,
        cropHeight,
        padding + offsetX,
        padding + offsetY,
        cropWidth,
        cropHeight,
      )
    }
  }
  return output.toDataURL('image/png')
}
