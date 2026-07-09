import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/useApp'
import Icon from './Icons'
import * as api from '../api'

const COLORS = ['#6ba3e8', '#7c64f0', '#4caf7d', '#e0a84f', '#e05555', '#59b6a9']
const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aout', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_LABELS_SHORT = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

const EMPTY_FORM = {
  title: '',
  start_year: '',
  start_month: '',
  start_day: '',
  end_year: '',
  end_month: '',
  end_day: '',
  category: '',
  color: COLORS[0],
  description: '',
  image_data: '',
  image_caption: '',
  tags: '',
}

export default function HistoricalTimeline() {
  const { toast, dispatch } = useApp()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [focusId, setFocusId] = useState(null)
  const [zoom, setZoom] = useState(72)
  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState([])
  const railRef = useRef(null)
  const dragRef = useRef(null)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await api.getHistoricalEvents()
      setEvents(rows)
      setFocusId(current => current || rows[0]?.id || null)
    } catch (err) {
      toast(err.message || 'Frise impossible a charger', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { loadEvents() }, [loadEvents])

  const allTags = useMemo(() => {
    const counts = new Map()
    events.forEach(event => {
      parseTags(event.tags).forEach(tag => counts.set(tag, (counts.get(tag) || 0) + 1))
    })
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag, count]) => ({ tag, count }))
  }, [events])

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase()
    const selected = new Set(activeTags)
    const rows = events.filter(event => {
      const eventTags = parseTags(event.tags)
      if (selected.size > 0 && !eventTags.some(tag => selected.has(tag))) return false
      if (!q) return true
      return [
          event.title,
          event.description,
          event.category,
          event.tags,
          event.start_label,
          event.end_label,
        ].some(value => String(value || '').toLowerCase().includes(q))
    })
    return rows.slice().sort(compareEvents)
  }, [activeTags, events, query])

  const layout = useMemo(() => buildLayout(filteredEvents, zoom), [filteredEvents, zoom])
  const focused = filteredEvents.find(event => event.id === focusId) || filteredEvents[0] || null

  useEffect(() => {
    if (!filteredEvents.length) setFocusId(null)
    else if (!focused) setFocusId(filteredEvents[0].id)
  }, [filteredEvents, focused])

  const focusEvent = useCallback((event) => {
    if (!event) return
    setFocusId(event.id)
    requestAnimationFrame(() => {
      const rail = railRef.current
      const node = rail?.querySelector(`[data-event-id="${event.id}"]`)
      if (!rail || !node) return
      const railRect = rail.getBoundingClientRect()
      const nodeRect = node.getBoundingClientRect()
      const delta = nodeRect.left - railRect.left - railRect.width * 0.42
      rail.scrollTo({ left: rail.scrollLeft + delta, behavior: 'smooth' })
    })
  }, [])

  const jump = (direction) => {
    if (!filteredEvents.length) return
    const index = Math.max(0, filteredEvents.findIndex(event => event.id === focused?.id))
    const next = filteredEvents[Math.min(filteredEvents.length - 1, Math.max(0, index + direction))]
    focusEvent(next)
  }

  const toggleTag = (tag) => {
    setActiveTags(current => current.includes(tag)
      ? current.filter(item => item !== tag)
      : [...current, tag])
  }

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  const editEvent = (event) => {
    if (!event.can_edit) {
      toast('Tu peux modifier seulement tes cartes.', 'error')
      return
    }
    setEditingId(event.id)
    const start = splitDateLabel(event.start_label)
    const end = splitDateLabel(event.end_label)
    setForm({
      title: event.title || '',
      start_year: start.year,
      start_month: start.month,
      start_day: start.day,
      end_year: end.year,
      end_month: end.month,
      end_day: end.day,
      category: event.category || '',
      color: event.color || COLORS[0],
      description: event.description || '',
      image_data: event.image_data || '',
      image_caption: event.image_caption || '',
      tags: parseTags(event.tags).join(', '),
    })
  }

  const submit = async (event) => {
    event.preventDefault()
    const payload = {
      ...form,
      start: joinDateParts(form.start_year, form.start_month, form.start_day),
      end: joinDateParts(form.end_year, form.end_month, form.end_day),
      tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
    }
    try {
      const saved = editingId
        ? await api.updateHistoricalEvent(editingId, payload)
        : await api.createHistoricalEvent(payload)
      await loadEvents()
      setFocusId(saved.id)
      resetForm()
      toast(editingId ? 'Date modifiee' : 'Date ajoutee')
    } catch (err) {
      toast(err.message || 'Date invalide', 'error')
    }
  }

  const removeEvent = async (event) => {
    if (!event.can_edit) {
      toast('Tu peux supprimer seulement tes cartes.', 'error')
      return
    }
    if (!window.confirm(`Supprimer "${event.title}" ?`)) return
    try {
      await api.deleteHistoricalEvent(event.id)
      await loadEvents()
      toast('Date supprimee')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const handleImage = async (file) => {
    if (!file) return
    try {
      const imageData = await fileToWebpDataUrl(file)
      setForm(current => ({ ...current, image_data: imageData }))
    } catch (_) {
      toast('Image impossible a lire', 'error')
    }
  }

  const beginPan = (event) => {
    if (!railRef.current) return
    dragRef.current = {
      x: event.clientX,
      left: railRef.current.scrollLeft,
    }
    railRef.current.classList.add('is-panning')
  }

  const movePan = (event) => {
    if (!dragRef.current || !railRef.current) return
    railRef.current.scrollLeft = dragRef.current.left - (event.clientX - dragRef.current.x)
  }

  const endPan = () => {
    dragRef.current = null
    railRef.current?.classList.remove('is-panning')
  }

  const openLinkedArticle = (articleId) => {
    window.sessionStorage.setItem('pw-open-article', articleId)
    dispatch({ type: 'SET_VIEW', payload: 'social-journal' })
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('philoweek:open-article', { detail: { articleId } }))
    }, 50)
  }

  return (
    <div className="timeline-page">
      <header className="timeline-header">
        <div>
          <span className="timeline-kicker">Frise memoire</span>
          <h1>Dates historiques</h1>
        </div>
        <div className="timeline-actions">
          <input
            className="timeline-search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Rechercher une date, un theme..."
          />
        </div>
      </header>

      <section className="timeline-focus">
        <button type="button" className="timeline-jump" onClick={() => jump(-1)} disabled={!focused}>
          ‹
        </button>
        <div className="timeline-focus-card">
          {focused ? (
            <>
              {focused.image_data && <img src={focused.image_data} alt="" />}
              <div>
                <span>{formatSpan(focused)}</span>
                <h2>{focused.title}</h2>
                {focused.owner_username && <small className="timeline-owner">par {focused.owner_username}</small>}
                {focused.description && <p>{focused.description}</p>}
                <TagRow tags={parseTags(focused.tags)} activeTags={activeTags} onToggle={toggleTag} />
                <LinkedArticles articles={focused.linked_articles} onOpen={openLinkedArticle} />
              </div>
            </>
          ) : (
            <div>
              <span>Aucune date</span>
              <h2>Ajoute ton premier repere</h2>
            </div>
          )}
        </div>
        <button type="button" className="timeline-jump next" onClick={() => jump(1)} disabled={!focused}>
          ›
        </button>
      </section>

      <div className="timeline-workspace">
        <section className="timeline-stage">
          <div className="timeline-stage-toolbar">
            <span>{filteredEvents.length} repere{filteredEvents.length > 1 ? 's' : ''}</span>
            <label>
              Zoom
              <input
                type="range"
                min="24"
                max="540"
                value={zoom}
                onChange={event => setZoom(Number(event.target.value))}
              />
            </label>
          </div>
          <div className="timeline-tag-filter">
            <button
              type="button"
              className={activeTags.length === 0 ? 'active' : ''}
              onClick={() => setActiveTags([])}
            >
              Tous
            </button>
            {allTags.map(({ tag, count }) => (
              <button
                key={tag}
                type="button"
                className={activeTags.includes(tag) ? 'active' : ''}
                onClick={() => toggleTag(tag)}
              >
                #{tag} <span>{count}</span>
              </button>
            ))}
          </div>

          <div
            ref={railRef}
            className="timeline-rail"
            onMouseDown={beginPan}
            onMouseMove={movePan}
            onMouseUp={endPan}
            onMouseLeave={endPan}
          >
            <div className="timeline-canvas" style={{ width: layout.width, height: layout.height }}>
              <div className="timeline-axis" style={{ top: layout.axisTop }}>
                {layout.ticks.map(tick => (
                  <span key={tick.id} className={tick.kind} style={{ left: tick.x }}>{tick.label}</span>
                ))}
              </div>
              {layout.items.map(item => (
                <article
                  key={item.event.id}
                  data-event-id={item.event.id}
                  className={`timeline-card ${item.event.image_data ? 'has-image' : 'no-image'} ${item.event.id === focused?.id ? 'active' : ''}`}
                  style={{
                    left: item.x,
                    top: item.y,
                    width: item.width,
                    zIndex: item.event.id === focused?.id ? 1000 : item.zIndex,
                    borderColor: item.event.color || COLORS[0],
                  }}
                  onClick={() => focusEvent(item.event)}
                >
                  {item.stackCount > 1 && item.stackIndex === item.stackCount - 1 && (
                    <span className="timeline-stack-badge">{item.stackCount}</span>
                  )}
                  {item.event.end_year !== null && (
                    <div className="timeline-duration" style={{ background: item.event.color || COLORS[0] }} />
                  )}
                  {item.event.image_data && <img src={item.event.image_data} alt="" />}
                  {item.event.linked_articles?.length > 0 && (
                    <span className="timeline-article-badge">{item.event.linked_articles.length} article{item.event.linked_articles.length > 1 ? 's' : ''}</span>
                  )}
                  <div className="timeline-card-body">
                    <span>{formatSpan(item.event)}</span>
                    <strong>{item.event.title}</strong>
                    {item.event.owner_username && <small className="timeline-owner">par {item.event.owner_username}</small>}
                    {item.event.category && <em>{item.event.category}</em>}
                    <TagRow tags={parseTags(item.event.tags)} compact activeTags={activeTags} onToggle={toggleTag} />
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="timeline-minimap">
            {layout.items.map(item => (
              <button
                key={item.event.id}
                type="button"
                className={item.event.id === focused?.id ? 'active' : ''}
                style={{ left: `${item.minimapLeft}%`, background: item.event.color || COLORS[0] }}
                title={item.event.title}
                onClick={() => focusEvent(item.event)}
              />
            ))}
          </div>
        </section>

        <aside className="timeline-editor-panel">
          <h2>{editingId ? 'Modifier' : 'Ajouter'}</h2>
          <form onSubmit={submit} className="timeline-form">
            <input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Titre" />
            <div className="timeline-date-fields">
              <span>Debut</span>
              <input value={form.start_year} onChange={event => setForm({ ...form, start_year: event.target.value })} placeholder="Annee" inputMode="numeric" />
              <select value={form.start_month} onChange={event => setForm({ ...form, start_month: event.target.value, start_day: event.target.value ? form.start_day : '' })}>
                <option value="">Mois</option>
                {MONTH_LABELS.map((month, index) => <option key={month} value={String(index + 1).padStart(2, '0')}>{month}</option>)}
              </select>
              <input value={form.start_day} onChange={event => setForm({ ...form, start_day: event.target.value })} placeholder="Jour" inputMode="numeric" disabled={!form.start_month} />
            </div>
            <div className="timeline-date-fields">
              <span>Fin</span>
              <input value={form.end_year} onChange={event => setForm({ ...form, end_year: event.target.value })} placeholder="Annee" inputMode="numeric" />
              <select value={form.end_month} onChange={event => setForm({ ...form, end_month: event.target.value, end_day: event.target.value ? form.end_day : '' })} disabled={!form.end_year.trim()}>
                <option value="">Mois</option>
                {MONTH_LABELS.map((month, index) => <option key={month} value={String(index + 1).padStart(2, '0')}>{month}</option>)}
              </select>
              <input value={form.end_day} onChange={event => setForm({ ...form, end_day: event.target.value })} placeholder="Jour" inputMode="numeric" disabled={!form.end_month} />
            </div>
            <input value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} placeholder="Theme: Rome, Revolution..." />
            <textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Ce qu'il faut retenir" />
            <input value={form.tags} onChange={event => setForm({ ...form, tags: event.target.value })} placeholder="Tags separes par virgules" />
            <div className="timeline-colors">
              {COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  className={form.color === color ? 'active' : ''}
                  style={{ background: color }}
                  onClick={() => setForm({ ...form, color })}
                  title={color}
                />
              ))}
            </div>
            <label className="timeline-image-picker">
              <Icon name="upload" size={16} />
              Ajouter une photo
              <input type="file" accept="image/*" hidden onChange={event => handleImage(event.target.files?.[0])} />
            </label>
            {form.image_data && (
              <div className="timeline-image-preview">
                <img src={form.image_data} alt="" />
                <button type="button" className="icon-btn" onClick={() => setForm({ ...form, image_data: '' })}>
                  <Icon name="close" size={14} />
                </button>
              </div>
            )}
            <input value={form.image_caption} onChange={event => setForm({ ...form, image_caption: event.target.value })} placeholder="Legende photo" />
            <div className="timeline-form-actions">
              <button type="submit" className="btn-primary" disabled={!form.title.trim() || !form.start_year.trim()}>
                {editingId ? 'Enregistrer' : 'Ajouter'}
              </button>
              {editingId && <button type="button" className="btn-ghost" onClick={resetForm}>Annuler</button>}
            </div>
          </form>

          <div className="timeline-event-list">
            {loading && <p>Chargement...</p>}
            {!loading && filteredEvents.map(event => (
              <article key={event.id} onClick={() => focusEvent(event)} className={event.id === focused?.id ? 'active' : ''}>
                <span>{formatSpan(event)}</span>
                <strong>{event.title}</strong>
                {event.owner_username && <span className="timeline-owner">par {event.owner_username}</span>}
                <LinkedArticles articles={event.linked_articles} compact onOpen={openLinkedArticle} />
                <TagRow tags={parseTags(event.tags)} compact activeTags={activeTags} onToggle={toggleTag} />
                {Boolean(event.can_edit) && (
                  <small>
                    <span onClick={(e) => { e.stopPropagation(); editEvent(event) }}>Modifier</span>
                    <span onClick={(e) => { e.stopPropagation(); removeEvent(event) }}>Supprimer</span>
                  </small>
                )}
              </article>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}

function LinkedArticles({ articles = [], compact = false, onOpen }) {
  if (!articles.length) return null
  const visible = compact ? articles.slice(0, 2) : articles.slice(0, 4)
  return (
    <div className={`timeline-linked-articles ${compact ? 'compact' : ''}`}>
      {visible.map(article => (
        <button
          key={article.id}
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onOpen?.(article.id)
          }}
        >
          <Icon name="newspaper" size={14} />
          <span>{article.title}</span>
        </button>
      ))}
    </div>
  )
}

function TagRow({ tags, compact = false, activeTags = [], onToggle }) {
  if (!tags.length) return null
  return (
    <div className={`timeline-tags ${compact ? 'compact' : ''}`}>
      {tags.map(tag => (
        <button
          key={tag}
          type="button"
          className={activeTags.includes(tag) ? 'active' : ''}
          onClick={(event) => {
            event.stopPropagation()
            onToggle?.(tag)
          }}
        >
          #{tag}
        </button>
      ))}
    </div>
  )
}

function buildLayout(events, zoom) {
  if (!events.length) {
    return { width: 900, height: 360, axisTop: 180, items: [], ticks: [] }
  }
  const values = events.flatMap(event => [dateValue(event), endValue(event)])
  const min = Math.floor(Math.min(...values) - 1)
  const max = Math.ceil(Math.max(...values) + 1)
  const leftPad = 90
  const width = Math.max(900, (max - min) * zoom + leftPad * 2)
  const cardWidth = zoom > 260 ? 250 : zoom > 120 ? 224 : 206
  const cardHeight = 190
  const stackGap = Math.max(90, Math.min(178, cardWidth * 0.72))
  const rawItems = events.slice().sort(compareEvents).map(event => {
    const start = dateValue(event)
    const end = Math.max(start, endValue(event))
    const x = leftPad + (start - min) * zoom
    const endX = leftPad + (end - min) * zoom
    return {
      event,
      start,
      end,
      x,
      endX,
      width: event.end_year !== null ? Math.min(340, Math.max(cardWidth, endX - x + cardWidth)) : cardWidth,
      minimapLeft: ((start - min) / Math.max(1, max - min)) * 100,
    }
  })

  const clusters = []
  for (const item of rawItems) {
    const last = clusters[clusters.length - 1]
    if (last && item.x - last.lastX < stackGap) {
      last.items.push(item)
      last.lastX = item.x
      last.endX = Math.max(last.endX, item.endX)
      last.width = Math.max(last.width, item.width)
    } else {
      clusters.push({ items: [item], x: item.x, lastX: item.x, endX: item.endX, width: item.width })
    }
  }

  const lanes = []
  const items = []
  clusters.forEach(cluster => {
    const stackWidth = Math.min(76, Math.max(0, cluster.items.length - 1) * 16)
    const clusterRight = cluster.x + Math.max(cluster.width, cardWidth) + stackWidth
    let lane = lanes.findIndex(right => cluster.x > right + 18)
    if (lane < 0) {
      lane = lanes.length
      lanes.push(clusterRight)
    } else {
      lanes[lane] = clusterRight
    }
    cluster.items.forEach((item, index) => {
      const offset = Math.min(index, 5)
      items.push({
        ...item,
        x: cluster.x + offset * 16,
        y: 30 + lane * cardHeight + offset * 10,
        width: item.width,
        stackIndex: index,
        stackCount: cluster.items.length,
        zIndex: 10 + index,
      })
    })
  })
  const height = Math.max(420, 100 + lanes.length * cardHeight)
  return {
    width,
    height,
    axisTop: height - 48,
    items,
    ticks: buildTicks(min, max, zoom, leftPad),
  }
}

function buildTicks(min, max, zoom, leftPad) {
  const span = max - min
  if (zoom >= 180 && span <= 40) {
    const ticks = []
    for (let year = min; year <= max; year++) {
      ticks.push({
        id: `year-${year}`,
        kind: 'year',
        year,
        label: formatYear(year),
        x: leftPad + (year - min) * zoom,
      })
      const monthStep = zoom >= 360 ? 1 : 3
      for (let month = monthStep; month < 12; month += monthStep) {
        const value = year + month / 12
        if (value <= min || value >= max) continue
        ticks.push({
          id: `month-${year}-${month}`,
          kind: 'month',
          year,
          month,
          label: zoom >= 360 ? MONTH_LABELS[month] : MONTH_LABELS_SHORT[month],
          x: leftPad + (value - min) * zoom,
        })
      }
    }
    return ticks
  }
  const step = span > 800 ? 200 : span > 300 ? 100 : span > 120 ? 50 : span > 40 ? 10 : span > 15 ? 5 : 1
  const first = Math.ceil(min / step) * step
  const ticks = []
  for (let year = first; year <= max; year += step) {
    ticks.push({ id: `year-${year}`, kind: 'year', year, label: formatYear(year), x: leftPad + (year - min) * zoom })
  }
  return ticks
}

function compareEvents(a, b) {
  return dateValue(a) - dateValue(b) || String(a.title).localeCompare(String(b.title))
}

function dateValue(event) {
  return Number(event.start_year) + ((Number(event.start_month) || 1) - 1) / 12 + ((Number(event.start_day) || 1) - 1) / 372
}

function endValue(event) {
  if (event.end_year === null || event.end_year === undefined || event.end_year === '') return dateValue(event)
  return Number(event.end_year) + ((Number(event.end_month) || 1) - 1) / 12 + ((Number(event.end_day) || 1) - 1) / 372
}

function formatSpan(event) {
  return event.end_label ? `${event.start_label} - ${event.end_label}` : event.start_label
}

function formatYear(year) {
  if (year < 0) return `${Math.abs(year)} av.`
  return String(year)
}

function parseTags(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'))
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch (_) {
    return []
  }
}

function splitDateLabel(value) {
  const parts = String(value || '').trim().match(/^(-?\d{1,6})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/)
  if (!parts) return { year: '', month: '', day: '' }
  return {
    year: parts[1] || '',
    month: parts[2] ? parts[2].padStart(2, '0') : '',
    day: parts[3] ? parts[3].padStart(2, '0') : '',
  }
}

function joinDateParts(year, month, day) {
  const y = String(year || '').trim()
  if (!y) return ''
  const m = String(month || '').trim()
  const d = String(day || '').trim()
  if (!m) return y
  return d ? `${y}-${m}-${d.padStart(2, '0')}` : `${y}-${m}`
}

async function fileToWebpDataUrl(file) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  const max = 1100
  const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  canvas.width = Math.round(bitmap.width * ratio)
  canvas.height = Math.round(bitmap.height * ratio)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/webp', 0.82)
}
