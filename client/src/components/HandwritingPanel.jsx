import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import * as api from '../api'

const PEN_SIZE = 6
const ERASER_SIZE = 28
const LANGUAGE_STORAGE_KEY = 'pw-handwriting-language'
const LANGUAGES = [
  { id: 'fr', label: 'Français', model: 'fr_FR', direction: 'ltr' },
  { id: 'en', label: 'English', model: 'en_US', direction: 'ltr' },
  { id: 'ar', label: 'العربية', model: 'ar', direction: 'rtl' },
]

export default function HandwritingPanel({ onClose, onInsert }) {
  const canvasRef = useRef(null)
  const strokesRef = useRef([])
  const currentStrokeRef = useRef(null)
  const eraserSnapshotRef = useRef(null)
  const activePointerRef = useRef(null)
  const activePointerTypeRef = useRef(null)
  const pastRef = useRef([])
  const futureRef = useRef([])
  const penDetectedRef = useRef(false)
  const mountedRef = useRef(true)
  const progressTimerRef = useRef(null)
  const [tool, setTool] = useState('pen')
  const [strokeCount, setStrokeCount] = useState(0)
  const [historyState, setHistoryState] = useState({ past: 0, future: 0 })
  const [phase, setPhase] = useState('draw')
  const [recognizedText, setRecognizedText] = useState('')
  const [progress, setProgress] = useState({ label: '', progress: 0 })
  const [error, setError] = useState('')
  const [serviceStatus, setServiceStatus] = useState('checking')
  const [languageId, setLanguageId] = useState(() => {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    return LANGUAGES.some(language => language.id === saved) ? saved : 'fr'
  })
  const language = LANGUAGES.find(item => item.id === languageId) || LANGUAGES[0]

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
    if (currentStrokeRef.current?.tool === 'pen') drawStroke(context, currentStrokeRef.current, width, height)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const observer = new ResizeObserver(redraw)
    observer.observe(canvas)
    redraw()
    api.getHandwritingStatus()
      .then(status => {
        if (mountedRef.current) setServiceStatus(status.configured ? 'ready' : 'missing')
      })
      .catch(() => {
        if (mountedRef.current) setServiceStatus('unavailable')
      })
    return () => {
      mountedRef.current = false
      observer.disconnect()
      clearInterval(progressTimerRef.current)
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
  })

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
    const stroke = {
      tool,
      size: tool === 'eraser' ? ERASER_SIZE : PEN_SIZE,
      points: [pointFromEvent(event, event.currentTarget)],
    }
    currentStrokeRef.current = stroke
    if (tool === 'eraser') {
      eraserSnapshotRef.current = strokesRef.current
      eraseTouchedStrokes(stroke.points, event.currentTarget)
    }
    redraw()
  }

  const continueStroke = event => {
    if (!currentStrokeRef.current || activePointerRef.current !== event.pointerId) return
    event.preventDefault()
    const events = event.getCoalescedEvents?.() || [event]
    for (const pointerEvent of events) currentStrokeRef.current.points.push(pointFromEvent(pointerEvent, event.currentTarget))
    if (currentStrokeRef.current.tool === 'eraser') eraseTouchedStrokes(currentStrokeRef.current.points, event.currentTarget)
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
    if (Math.abs(finalPoint.x - previousPoint.x) > 0.0001 || Math.abs(finalPoint.y - previousPoint.y) > 0.0001) stroke.points.push(finalPoint)

    if (stroke.tool === 'eraser') {
      eraseTouchedStrokes(stroke.points, event.currentTarget)
      const original = eraserSnapshotRef.current || []
      eraserSnapshotRef.current = null
      if (original.length !== strokesRef.current.length) {
        pastRef.current.push(original)
        futureRef.current = []
      }
      syncHistoryState()
      redraw()
      return
    }

    if (stroke.points.length === 1) {
      const point = stroke.points[0]
      stroke.points.push({ ...point, x: point.x + 0.0001, t: point.t + 1 })
    }
    commit([...strokesRef.current, stroke])
    redraw()
  }

  const eraseTouchedStrokes = (eraserPoints, canvas) => {
    const original = eraserSnapshotRef.current || strokesRef.current
    const rect = canvas.getBoundingClientRect()
    const radius = ERASER_SIZE * Math.min(rect.width, rect.height) / 620 / 2
    strokesRef.current = original.filter(stroke => !stroke.points.some(point => eraserPoints.some(eraserPoint => {
      const dx = (point.x - eraserPoint.x) * rect.width
      const dy = (point.y - eraserPoint.y) * rect.height
      return dx * dx + dy * dy <= radius * radius
    })))
    setStrokeCount(strokesRef.current.length)
  }

  const clearCanvas = () => {
    if (!strokesRef.current.length) return
    commit([])
    setPhase('draw')
    setRecognizedText('')
    setError('')
    requestAnimationFrame(redraw)
  }

  const selectLanguage = nextLanguage => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage.id)
    setLanguageId(nextLanguage.id)
    setPhase('draw')
    setRecognizedText('')
    setError('')
    requestAnimationFrame(redraw)
  }

  const recognize = async () => {
    if (!strokesRef.current.length || phase === 'recognizing' || serviceStatus !== 'ready') return
    const rect = canvasRef.current.getBoundingClientRect()
    setPhase('recognizing')
    setError('')
    setProgress({ label: `Analyse cursive en ${language.label}`, progress: 0.08 })
    clearInterval(progressTimerRef.current)
    progressTimerRef.current = setInterval(() => {
      setProgress(current => ({ ...current, progress: Math.min(0.86, current.progress + (0.86 - current.progress) * 0.12) }))
    }, 180)
    try {
      const result = await api.recognizeHandwriting({
        language: language.id,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        strokes: serializeStrokes(strokesRef.current, rect.width, rect.height),
      })
      if (!mountedRef.current) return
      clearInterval(progressTimerRef.current)
      setProgress({ label: 'Texte reconnu', progress: 1 })
      setRecognizedText(result.text)
      setPhase('review')
    } catch (recognitionError) {
      console.error('handwriting recognition:', recognitionError)
      if (!mountedRef.current) return
      clearInterval(progressTimerRef.current)
      setPhase('draw')
      setError(recognitionError.message || 'La reconnaissance manuscrite a échoué. Réessaie.')
      if (recognitionError.code === 'handwriting_not_configured') setServiceStatus('missing')
    }
  }

  const selectTool = nextTool => {
    setTool(nextTool)
    setPhase('draw')
    setError('')
    requestAnimationFrame(redraw)
  }

  const morphWords = recognizedText.split(/(\s+)/).filter(Boolean)
  const unavailable = serviceStatus !== 'ready'

  return (
    <div className="handwriting-backdrop" data-local-history role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="handwriting-panel" role="dialog" aria-modal="true" aria-labelledby="handwriting-title">
        <header className="handwriting-header">
          <div className="handwriting-heading">
            <span className="handwriting-heading-icon"><Icon name="pen" size={19} /></span>
            <div>
              <h3 id="handwriting-title">Écriture au stylo</h3>
              <p>Reconnaissance cursive MyScript · modèle {language.model}</p>
            </div>
          </div>
          <button type="button" className="icon-btn handwriting-close" onClick={onClose} aria-label="Fermer"><Icon name="close" size={19} /></button>
        </header>

        <div className="handwriting-language-bar" aria-label="Langue de reconnaissance">
          <span>J’écris en</span>
          <div className="handwriting-languages">
            {LANGUAGES.map(item => (
              <button type="button" key={item.id} className={item.id === language.id ? 'active' : ''} aria-pressed={item.id === language.id} onClick={() => selectLanguage(item)} dir={item.direction}>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {serviceStatus === 'missing' && (
          <div className="handwriting-setup" role="status">
            <Icon name="ai" size={17} />
            <span>Ajoute <code>MYSCRIPT_APPLICATION_KEY</code> et <code>MYSCRIPT_HMAC_KEY</code> dans le fichier <code>.env</code> du serveur pour activer la reconnaissance.</span>
          </div>
        )}
        {serviceStatus === 'unavailable' && (
          <div className="handwriting-setup is-error" role="alert"><Icon name="ai" size={17} /><span>Impossible de vérifier le service manuscrit. Vérifie la connexion au serveur.</span></div>
        )}

        <div className="handwriting-tools" aria-label="Outils de dessin">
          <div className="handwriting-tool-group">
            <button type="button" className={tool === 'pen' ? 'active' : ''} onClick={() => selectTool('pen')}><Icon name="pen" size={17} /> Stylo</button>
            <button type="button" className={tool === 'eraser' ? 'active' : ''} onClick={() => selectTool('eraser')}><Icon name="eraser" size={17} /> Gomme</button>
          </div>
          <div className="handwriting-tool-group handwriting-history-tools">
            <button type="button" onClick={undo} disabled={!historyState.past} title="Annuler (Ctrl+Z)"><Icon name="undo" size={17} /> <span>Annuler</span></button>
            <button type="button" onClick={redo} disabled={!historyState.future} title="Rétablir (Ctrl+Maj+Z)"><Icon name="redo" size={17} /> <span>Rétablir</span></button>
            <button type="button" onClick={clearCanvas} disabled={!strokeCount} className="handwriting-clear">Tout effacer</button>
          </div>
        </div>

        <div className={`handwriting-paper ${phase === 'review' ? 'is-transforming' : ''} ${language.direction === 'rtl' ? 'is-rtl' : ''}`}>
          <canvas ref={canvasRef} className="handwriting-canvas" onPointerDown={beginStroke} onPointerMove={continueStroke} onPointerUp={endStroke} onPointerCancel={endStroke} aria-label={`Zone d’écriture manuscrite en ${language.label}`} />

          {phase === 'recognizing' && (
            <div className="handwriting-recognizing" aria-live="polite">
              <span className="handwriting-scan-line" /><span className="handwriting-loader"><Icon name="ai" size={22} /></span>
              <strong>{progress.label}</strong>
              <div className="handwriting-progress"><span style={{ width: `${Math.max(4, progress.progress * 100)}%` }} /></div>
              <small>{Math.round(progress.progress * 100)} %</small>
            </div>
          )}

          {phase === 'review' && (
            <div className="handwriting-morph-text" dir={language.direction} aria-hidden="true">
              {morphWords.map((word, index) => <span key={`${word}-${index}`} style={{ animationDelay: `${280 + Math.min(index, 18) * 34}ms` }}>{word}</span>)}
            </div>
          )}

          {phase === 'draw' && !strokeCount && (
            <div className="handwriting-empty" aria-hidden="true" dir={language.direction}>
              <Icon name="pen" size={25} />
              <strong>{language.id === 'ar' ? 'اكتب بشكل طبيعي هنا' : 'Écris naturellement ici'}</strong>
              <span>{language.id === 'ar' ? 'سطر أو سطران في كل مرة يعطيان نتيجة أفضل.' : 'Une ou deux lignes à la fois donnent le meilleur résultat.'}</span>
            </div>
          )}
        </div>

        {error && <p className="handwriting-error" role="alert">{error}</p>}

        {phase === 'review' && (
          <div className="handwriting-result">
            <div className="handwriting-result-head"><label htmlFor="handwriting-result-text">Texte reconnu</label><span>Tu peux le corriger avant de l’insérer.</span></div>
            <textarea id="handwriting-result-text" value={recognizedText} onChange={event => setRecognizedText(event.target.value)} autoFocus spellCheck dir={language.direction} />
          </div>
        )}

        <footer className="handwriting-footer">
          <span className="handwriting-tip"><Icon name="ai" size={15} /> Les traits sont envoyés à MyScript ; le contenu de la note ne l’est pas.</span>
          <div className="handwriting-actions">
            {phase === 'review' && <button type="button" className="btn-ghost" onClick={() => setPhase('draw')}>Reprendre le stylo</button>}
            {phase !== 'review' ? (
              <button type="button" className="btn-primary handwriting-convert" onClick={recognize} disabled={!strokeCount || phase === 'recognizing' || unavailable}>
                <Icon name="ai" size={17} /> {phase === 'recognizing' ? 'Conversion…' : serviceStatus === 'checking' ? 'Vérification…' : 'Transformer en texte'}
              </button>
            ) : (
              <button type="button" className="btn-primary handwriting-insert" onClick={() => recognizedText.trim() && onInsert(recognizedText.trim())} disabled={!recognizedText.trim()}><Icon name="check" size={17} /> Insérer dans la note</button>
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
    t: Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now(),
  }
}

function serializeStrokes(strokes, width, height) {
  const firstTime = Math.min(...strokes.flatMap(stroke => stroke.points.map(point => point.t)))
  return strokes.map(stroke => ({
    x: stroke.points.map(point => roundCoordinate(point.x * width, width)),
    y: stroke.points.map(point => roundCoordinate(point.y * height, height)),
    t: stroke.points.map(point => Math.max(0, Math.round(point.t - firstTime))),
    p: stroke.points.map(point => Math.min(0.99, Math.max(0.01, Number(point.pressure) || 0.5))),
  }))
}

function roundCoordinate(value, maximum) {
  return Math.min(maximum, Math.max(0, Math.round(value * 100) / 100))
}

function drawStrokes(context, strokes, width, height) {
  for (const stroke of strokes) drawStroke(context, stroke, width, height)
}

function drawStroke(context, stroke, width, height) {
  const points = stroke.points
  if (!points?.length) return
  const scale = Math.min(width, height) / 620
  context.save()
  context.strokeStyle = '#172033'
  context.fillStyle = '#172033'
  context.lineCap = 'round'
  context.lineJoin = 'round'
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const pressure = Math.max(0.72, (previous.pressure + current.pressure) / 2)
    context.lineWidth = stroke.size * scale * pressure
    context.beginPath()
    context.moveTo(previous.x * width, previous.y * height)
    context.lineTo(current.x * width, current.y * height)
    context.stroke()
  }
  context.restore()
}
