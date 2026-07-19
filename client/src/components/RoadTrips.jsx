import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useApp } from '../context/useApp'
import * as api from '../api'
import Icon from './Icons'
import { compressPhoto, PHOTO_QUALITY_PRESETS } from '../utils/photoCompress'

// ————————————————————————————————————————————————————————————————
// Carnet de voyage — carte belle et complète des road trips.
// Tout le rendu carto est côté client (Leaflet + tuiles CARTO gratuites,
// sans clé API). Les tracés relient les villes en lignes droites.
// ————————————————————————————————————————————————————————————————

const TILE_STYLES = {
  voyager: {
    label: 'Couleur',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
    labels: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
  },
  light: {
    label: 'Clair',
    url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
    labels: 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png',
  },
  dark: {
    label: 'Sombre',
    url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
    labels: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
  },
}

const CARTO_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

const TRIP_COLORS = ['#e8663f', '#e0a020', '#4caf7d', '#6ba3e8', '#7c64f0', '#d0518f', '#2fb0a8', '#8a6d3b']

// Icône SVG (blanche) au centre du marqueur de note.
const noteMarkerIcon = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4.5h9L18 7.5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z"/><path d="M8 10h7M8 13.5h5"/></svg>'

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function haversineKm(a, b) {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180)
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

function autoDistance(points) {
  let t = 0
  for (let i = 1; i < points.length; i++) t += haversineKm(points[i - 1], points[i])
  return Math.round(t * 10) / 10
}

function fmtKm(km) {
  if (km == null) return '—'
  return km >= 100 ? `${Math.round(km).toLocaleString('fr-FR')} km` : `${km} km`
}

function fmtDateRange(start, end) {
  const f = (d) => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  if (start && end && start !== end) return `${f(start)} → ${f(end)}`
  if (start) return f(start)
  if (end) return f(end)
  return null
}

export default function RoadTrips() {
  const { toast } = useApp()
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState(null)
  const [story, setStory] = useState(false)
  const [lightbox, setLightbox] = useState(null) // { photos, index }
  const [placement, setPlacement] = useState(null) // null | { type:'note' } | { type:'photo', photoId }

  const load = useCallback(async (keepSelection = true) => {
    try {
      const rows = await api.getRoadTrips()
      setTrips(rows)
      setSelectedId(prev => (keepSelection && rows.some(t => t.id === prev)) ? prev : (rows[0]?.id || null))
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  useEffect(() => { setPlacement(null) }, [selectedId, story])

  const allTags = useMemo(() => {
    const set = new Set()
    trips.forEach(t => { if (t.tag) set.add(t.tag) })
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [trips])

  const visibleTrips = useMemo(() => trips.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    if (tagFilter && t.tag !== tagFilter) return false
    return true
  }), [trips, statusFilter, tagFilter])

  const selected = trips.find(t => t.id === selectedId) || null

  const createTrip = useCallback(async () => {
    try {
      const color = TRIP_COLORS[trips.length % TRIP_COLORS.length]
      const trip = await api.createRoadTrip({ title: 'Nouveau road trip', status: statusFilter === 'planned' ? 'planned' : 'done', color })
      setTrips(prev => [...prev, trip])
      setSelectedId(trip.id)
      setStory(false)
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [trips.length, statusFilter, toast])

  // Applique un patch au voyage sélectionné (optimiste + réponse serveur).
  const patchTrip = useCallback(async (id, patch) => {
    setTrips(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
    try {
      const updated = await api.updateRoadTrip(id, patch)
      setTrips(prev => prev.map(t => t.id === id ? updated : t))
      return updated
    } catch (err) {
      toast(err.message, 'error')
      load()
      return null
    }
  }, [toast, load])

  // Clic sur la carte en mode placement : dépose une note ou place une photo.
  const handleMapClick = useCallback(async (latlng) => {
    if (!placement || !selectedId) return
    const tripId = selectedId
    setPlacement(null)
    try {
      if (placement.type === 'note') {
        await api.createRoadTripNote(tripId, { lat: latlng.lat, lng: latlng.lng, title: '', body: '' })
        await load()
        toast('Note posée sur la carte — écris-la dans le panneau')
      } else if (placement.type === 'note-move') {
        await api.updateRoadTripNote(placement.noteId, { lat: latlng.lat, lng: latlng.lng })
        await load()
        toast('Note déplacée')
      } else if (placement.type === 'photo') {
        await api.updateRoadTripPhoto(placement.photoId, { lat: latlng.lat, lng: latlng.lng })
        await load()
        toast('Photo placée sur la carte')
      }
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [placement, selectedId, load, toast])

  const removeTrip = useCallback(async (id) => {
    if (!window.confirm('Supprimer ce road trip et ses photos ?')) return
    try {
      await api.deleteRoadTrip(id)
      setTrips(prev => prev.filter(t => t.id !== id))
      setSelectedId(prev => prev === id ? null : prev)
      toast('Road trip supprimé')
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [toast])

  if (loading) {
    return <div className="roadtrips-view"><div className="roadtrips-empty">Chargement…</div></div>
  }

  if (story && selected) {
    return (
      <StoryView
        trip={selected}
        onClose={() => setStory(false)}
        onOpenPhoto={(photos, index) => setLightbox({ photos, index })}
      />
    )
  }

  return (
    <div className="roadtrips-view">
      <header className="roadtrips-header">
        <div className="roadtrips-title">
          <Icon name="map" size={20} />
          <h2>Carnet de voyage</h2>
        </div>
        <div className="roadtrips-header-actions">
          <div className="roadtrips-filters">
            {[['all', 'Tous'], ['done', 'Réalisés'], ['planned', 'Prévus']].map(([key, label]) => (
              <button key={key} className={`rt-chip ${statusFilter === key ? 'active' : ''}`} onClick={() => setStatusFilter(key)}>{label}</button>
            ))}
          </div>
          <button className="rt-btn" onClick={() => api.exportRoadTripsJson(true)} title="Exporter tous les voyages en JSON (photos incluses)">
            <Icon name="download" size={15} /> JSON
          </button>
          <button className="rt-btn primary" onClick={createTrip}>
            <Icon name="plus" size={15} /> Nouveau
          </button>
        </div>
      </header>

      {allTags.length > 0 && (
        <div className="roadtrips-tagbar">
          <button className={`rt-tag ${!tagFilter ? 'active' : ''}`} onClick={() => setTagFilter(null)}>Tous les tags</button>
          {allTags.map(tag => (
            <button key={tag} className={`rt-tag ${tagFilter === tag ? 'active' : ''}`} onClick={() => setTagFilter(tag)}>#{tag}</button>
          ))}
        </div>
      )}

      <div className="roadtrips-body">
        <aside className="roadtrips-list">
          {visibleTrips.length === 0 && (
            <div className="roadtrips-empty-list">
              Aucun voyage {statusFilter === 'planned' ? 'prévu' : statusFilter === 'done' ? 'réalisé' : ''}.<br />
              <button className="rt-btn primary" onClick={createTrip}><Icon name="plus" size={14} /> Créer un road trip</button>
            </div>
          )}
          {visibleTrips.map(trip => (
            <TripCard
              key={trip.id}
              trip={trip}
              active={trip.id === selectedId}
              onSelect={() => { setSelectedId(trip.id); setStory(false) }}
            />
          ))}
        </aside>

        <div className="roadtrips-map-wrap">
          <MapCanvas
            trips={visibleTrips}
            selected={selected}
            placement={placement}
            onSelectTrip={(id) => setSelectedId(id)}
            onOpenPhoto={(photos, index) => setLightbox({ photos, index })}
            onMapClick={handleMapClick}
            onCancelPlacement={() => setPlacement(null)}
          />
        </div>

        {selected && (
          <TripEditor
            key={selected.id}
            trip={selected}
            placement={placement}
            onPatch={patchTrip}
            onDelete={() => removeTrip(selected.id)}
            onReload={load}
            onStory={() => setStory(true)}
            onOpenPhoto={(photos, index) => setLightbox({ photos, index })}
            onPlace={(p) => setPlacement(p)}
          />
        )}
      </div>

      {lightbox && (
        <Lightbox
          photos={lightbox.photos}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onIndex={(i) => setLightbox(lb => ({ ...lb, index: i }))}
        />
      )}
    </div>
  )
}

// ————————————————————————————————————— Carte de la liste (rail gauche)

function TripCard({ trip, active, onSelect }) {
  const cover = trip.photos.find(p => p.id === trip.cover_photo_id) || trip.photos[0]
  const range = fmtDateRange(trip.start_date, trip.end_date)
  return (
    <button className={`rt-card ${active ? 'active' : ''}`} onClick={onSelect}>
      <div className="rt-card-thumb" style={{ background: cover ? undefined : `linear-gradient(135deg, ${trip.color}, ${trip.color}55)` }}>
        {cover
          ? <img src={cover.url} alt="" loading="lazy" />
          : <span style={{ color: '#fff' }}><Icon name="map" size={22} /></span>}
        <span className={`rt-card-status ${trip.status}`}>{trip.status === 'planned' ? 'Prévu' : 'Réalisé'}</span>
      </div>
      <div className="rt-card-body">
        <strong className="rt-card-title" style={{ borderColor: trip.color }}>{trip.title}</strong>
        <div className="rt-card-meta">
          {trip.tag && <span className="rt-card-tag">#{trip.tag}</span>}
          <span><Icon name="route" size={12} /> {fmtKm(trip.distance_km)}</span>
          {trip.points.length > 0 && <span><Icon name="pin" size={12} /> {trip.points.length}</span>}
        </div>
        {range && <div className="rt-card-date">{range}</div>}
      </div>
    </button>
  )
}

// ————————————————————————————————————— Carte Leaflet

function MapCanvas({ trips, selected, placement, onSelectTrip, onOpenPhoto, onMapClick, onCancelPlacement }) {
  const { theme } = useApp()
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const tileRef = useRef(null)
  const labelRef = useRef(null)
  const fitSigRef = useRef('')
  const clickRef = useRef(null)
  const [tileStyle, setTileStyle] = useState(theme === 'light' ? 'light' : 'voyager')

  // Garde la dernière version du handler de clic (évite de ré-enregistrer l'événement).
  clickRef.current = (e) => { if (placement && onMapClick) onMapClick(e.latlng) }

  // Init une seule fois.
  useEffect(() => {
    if (mapRef.current || !mapEl.current) return
    const map = L.map(mapEl.current, { zoomControl: true, attributionControl: true, worldCopyJump: true })
      .setView([46.6, 2.4], 5)
    map.attributionControl.setPrefix('')
    layerRef.current = L.layerGroup().addTo(map)
    map.on('click', (e) => clickRef.current && clickRef.current(e))
    mapRef.current = map
    // Nécessaire car le conteneur est monté dans un flex/grid (taille tardive).
    setTimeout(() => map.invalidateSize(), 60)
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Fond de carte (tuiles) selon le style choisi.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const style = TILE_STYLES[tileStyle]
    if (tileRef.current) tileRef.current.remove()
    if (labelRef.current) labelRef.current.remove()
    tileRef.current = L.tileLayer(style.url, { subdomains: 'abcd', maxZoom: 20, attribution: CARTO_ATTR }).addTo(map)
    labelRef.current = L.tileLayer(style.labels, { subdomains: 'abcd', maxZoom: 20, pane: 'shadowPane' }).addTo(map)
  }, [tileStyle])

  // Rendu des tracés + marqueurs.
  useEffect(() => {
    const map = mapRef.current
    const group = layerRef.current
    if (!map || !group) return
    group.clearLayers()
    const allBounds = []

    const focus = selected && trips.some(t => t.id === selected.id)

    for (const trip of trips) {
      const isSel = selected && trip.id === selected.id
      const dim = focus && !isSel
      const latlngs = trip.points.map(p => [p.lat, p.lng])

      if (latlngs.length >= 2) {
        L.polyline(latlngs, {
          color: trip.color,
          weight: isSel ? 4 : 3,
          opacity: dim ? 0.25 : 0.95,
          dashArray: trip.status === 'planned' ? '2 9' : null,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(group).on('click', () => onSelectTrip(trip.id))
      }

      trip.points.forEach((p, i) => {
        const marker = L.marker([p.lat, p.lng], {
          icon: L.divIcon({
            className: 'rt-marker-wrap',
            html: `<span class="rt-marker ${dim ? 'dim' : ''}" style="--c:${trip.color}">${i + 1}</span>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
          zIndexOffset: isSel ? 500 : 0,
        }).addTo(group)
        marker.bindTooltip(p.name, { direction: 'top', offset: [0, -10] })
        marker.on('click', () => onSelectTrip(trip.id))
        if (!dim) allBounds.push([p.lat, p.lng])
      })

      // Photos géolocalisées : vignette épinglée.
      if (!dim) {
        trip.photos.filter(ph => ph.lat != null && ph.lng != null).forEach(ph => {
          const marker = L.marker([ph.lat, ph.lng], {
            icon: L.divIcon({
              className: 'rt-photo-marker-wrap',
              html: `<span class="rt-photo-marker" style="--c:${trip.color}"><img src="${ph.url}" alt=""/></span>`,
              iconSize: [46, 46],
              iconAnchor: [23, 46],
            }),
            zIndexOffset: 600,
          }).addTo(group)
          marker.on('click', () => onOpenPhoto(trip.photos, trip.photos.indexOf(ph)))
          allBounds.push([ph.lat, ph.lng])
        })

        // Notes géolocalisées : marqueur cliquable ouvrant une bulle de texte.
        trip.notes.forEach(note => {
          const marker = L.marker([note.lat, note.lng], {
            icon: L.divIcon({
              className: 'rt-note-marker-wrap',
              html: `<span class="rt-note-marker" style="--c:${note.color || trip.color}">${noteMarkerIcon}</span>`,
              iconSize: [30, 34],
              iconAnchor: [15, 32],
            }),
            zIndexOffset: 550,
          }).addTo(group)
          const title = note.title ? `<strong>${escapeHtml(note.title)}</strong>` : ''
          const body = note.body ? `<p>${escapeHtml(note.body).replace(/\n/g, '<br>')}</p>` : ''
          marker.bindPopup(`<div class="rt-note-popup">${title}${body || (title ? '' : '<em>Note vide</em>')}</div>`, { maxWidth: 260 })
          marker.on('click', () => onSelectTrip(trip.id))
          allBounds.push([note.lat, note.lng])
        })
      }
    }

    // Ne recadre que si les coordonnées visibles (ou la sélection) ont changé,
    // pour ne pas faire sauter la carte à chaque édition de titre/tag.
    const sig = (selected?.id || '') + '|' + allBounds.map(b => b.join(',')).join(';')
    if (sig !== fitSigRef.current) {
      fitSigRef.current = sig
      if (allBounds.length === 1) {
        map.setView(allBounds[0], Math.max(map.getZoom(), 9))
      } else if (allBounds.length > 1) {
        map.fitBounds(allBounds, { padding: [60, 60], maxZoom: 13 })
      }
    }
  }, [trips, selected, onSelectTrip, onOpenPhoto])

  return (
    <div className={`rt-map-container ${placement ? 'placing' : ''}`}>
      <div ref={mapEl} className="rt-map" />
      <div className="rt-map-styles">
        {Object.entries(TILE_STYLES).map(([key, s]) => (
          <button key={key} className={`rt-style-btn ${tileStyle === key ? 'active' : ''}`} onClick={() => setTileStyle(key)}>{s.label}</button>
        ))}
      </div>
      {placement && (
        <div className="rt-place-banner">
          <span><Icon name="pin" size={14} /> Clique sur la carte pour {placement.type === 'photo' ? 'placer la photo' : placement.type === 'note-move' ? 'déplacer la note' : 'poser la note'}</span>
          <button onClick={onCancelPlacement}>Annuler</button>
        </div>
      )}
    </div>
  )
}

// ————————————————————————————————————— Éditeur du voyage sélectionné

function TripEditor({ trip, placement, onPatch, onDelete, onReload, onStory, onOpenPhoto, onPlace }) {
  const { toast } = useApp()
  const [title, setTitle] = useState(trip.title)
  const [description, setDescription] = useState(trip.description || '')
  const [tag, setTag] = useState(trip.tag || '')
  const [elevation, setElevation] = useState(trip.elevation_m ?? '')
  const [distanceManual, setDistanceManual] = useState(trip.distance_manual)
  const [manualKm, setManualKm] = useState(trip.distance_km ?? '')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pendingFiles, setPendingFiles] = useState(null)
  const [placingPhoto, setPlacingPhoto] = useState(null)
  const fileInputRef = useRef(null)
  const searchTimer = useRef(null)

  const livePoints = trip.points
  const liveAuto = autoDistance(livePoints)

  // Sauvegarde des champs texte après une pause. Les patches en attente sont
  // fusionnés : éditer titre puis description en < 600ms n'écrase pas l'un l'autre.
  const pendingPatch = useRef({})
  const debouncedPatch = useMemo(() => {
    let timer
    return (patch) => {
      pendingPatch.current = { ...pendingPatch.current, ...patch }
      clearTimeout(timer)
      timer = setTimeout(() => {
        const merged = pendingPatch.current
        pendingPatch.current = {}
        onPatch(trip.id, merged)
      }, 600)
    }
  }, [trip.id, onPatch])

  const setPoints = useCallback((points) => onPatch(trip.id, { points }), [trip.id, onPatch])

  // Recherche de villes (géocodage via le backend).
  useEffect(() => {
    if (search.trim().length < 2) { setResults([]); return }
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      try { setResults(await api.geocodePlace(search.trim())) }
      catch { setResults([]) }
      finally { setSearching(false) }
    }, 350)
    return () => clearTimeout(searchTimer.current)
  }, [search])

  const addPoint = (place) => {
    const point = { id: crypto.randomUUID(), name: place.name, lat: place.lat, lng: place.lng, note: '' }
    setPoints([...livePoints, point])
    setSearch('')
    setResults([])
  }

  const removePoint = (id) => setPoints(livePoints.filter(p => p.id !== id))
  const renamePoint = (id, name) => setPoints(livePoints.map(p => p.id === id ? { ...p, name } : p))
  const movePoint = (index, dir) => {
    const next = [...livePoints]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    setPoints(next)
  }

  const onFilesChosen = (e) => {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (files.length) setPendingFiles(files)
  }

  const uploadPhotos = async (presetKey) => {
    const files = pendingFiles
    setPendingFiles(null)
    if (!files) return
    setBusy(true)
    let ok = 0
    for (const file of files) {
      try {
        const { blob, width, height, filename } = await compressPhoto(file, presetKey)
        await api.uploadRoadTripPhoto(trip.id, blob, { width, height, filename, caption: '' })
        ok++
      } catch (err) {
        toast(`Échec: ${file.name}`, 'error')
      }
    }
    await onReload()
    setBusy(false)
    if (ok) toast(`${ok} photo${ok > 1 ? 's' : ''} ajoutée${ok > 1 ? 's' : ''}`)
  }

  const setCover = async (photoId) => { await onPatch(trip.id, { cover_photo_id: photoId }); }
  const deletePhoto = async (photoId) => {
    try { await api.deleteRoadTripPhoto(photoId); await onReload() }
    catch (err) { toast(err.message, 'error') }
  }
  const captionPhoto = async (photoId, caption) => {
    try { await api.updateRoadTripPhoto(photoId, { caption }); await onReload() }
    catch (err) { toast(err.message, 'error') }
  }
  const pinPhoto = async (photo, point) => {
    try {
      await api.updateRoadTripPhoto(photo.id, { lat: point.lat, lng: point.lng })
      await onReload()
      toast(`Photo épinglée à ${point.name}`)
    } catch (err) { toast(err.message, 'error') }
  }
  const unpinPhoto = async (photo) => {
    try { await api.updateRoadTripPhoto(photo.id, { lat: '', lng: '' }); await onReload() }
    catch (err) { toast(err.message, 'error') }
  }

  const saveNote = async (noteId, patch) => {
    try { await api.updateRoadTripNote(noteId, patch); await onReload() }
    catch (err) { toast(err.message, 'error') }
  }
  const deleteNote = async (noteId) => {
    try { await api.deleteRoadTripNote(noteId); await onReload() }
    catch (err) { toast(err.message, 'error') }
  }

  return (
    <aside className="roadtrips-editor">
      <div className="rt-editor-scroll">
        <div className="rt-editor-top">
          <input
            className="rt-title-input"
            value={title}
            onChange={e => { setTitle(e.target.value); debouncedPatch({ title: e.target.value }) }}
            placeholder="Titre du voyage"
          />
          <button className="rt-icon-btn danger" title="Supprimer le voyage" onClick={onDelete}><Icon name="trash" size={16} /></button>
        </div>

        <div className="rt-row">
          <div className="rt-status-toggle">
            <button className={trip.status === 'done' ? 'active' : ''} onClick={() => onPatch(trip.id, { status: 'done' })}>Réalisé</button>
            <button className={trip.status === 'planned' ? 'active' : ''} onClick={() => onPatch(trip.id, { status: 'planned' })}>Prévu</button>
          </div>
        </div>

        <div className="rt-row rt-colors">
          {TRIP_COLORS.map(c => (
            <button key={c} className={`rt-color-dot ${trip.color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => onPatch(trip.id, { color: c })} aria-label={`Couleur ${c}`} />
          ))}
        </div>

        <div className="rt-field-grid">
          <label className="rt-field">
            <span>Tag</span>
            <input value={tag} onChange={e => { setTag(e.target.value); debouncedPatch({ tag: e.target.value }) }} placeholder="ex : alpes2024" />
          </label>
          <label className="rt-field">
            <span><Icon name="mountain" size={12} /> Dénivelé (m)</span>
            <input type="number" value={elevation} onChange={e => { setElevation(e.target.value); debouncedPatch({ elevation_m: e.target.value }) }} placeholder="—" />
          </label>
          <label className="rt-field">
            <span>Début</span>
            <input type="date" value={trip.start_date || ''} onChange={e => onPatch(trip.id, { start_date: e.target.value })} />
          </label>
          <label className="rt-field">
            <span>Fin</span>
            <input type="date" value={trip.end_date || ''} onChange={e => onPatch(trip.id, { end_date: e.target.value })} />
          </label>
        </div>

        <div className="rt-distance">
          <div className="rt-distance-head">
            <span><Icon name="route" size={13} /> Distance</span>
            <label className="rt-check">
              <input type="checkbox" checked={distanceManual} onChange={e => {
                setDistanceManual(e.target.checked)
                onPatch(trip.id, { distance_manual: e.target.checked, distance_km: e.target.checked ? (manualKm || liveAuto) : undefined })
              }} />
              Saisie manuelle
            </label>
          </div>
          {distanceManual ? (
            <input type="number" className="rt-distance-input" value={manualKm}
              onChange={e => { setManualKm(e.target.value); debouncedPatch({ distance_manual: true, distance_km: e.target.value }) }}
              placeholder="km réels" />
          ) : (
            <div className="rt-distance-auto">{fmtKm(liveAuto)} <span>(lignes droites entre villes)</span></div>
          )}
        </div>

        {/* Villes / étapes */}
        <div className="rt-section-title">Villes traversées</div>
        <div className="rt-citysearch">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une ville à ajouter…" />
          {(results.length > 0 || searching) && (
            <div className="rt-search-results">
              {searching && <div className="rt-search-loading">Recherche…</div>}
              {results.map((r, i) => (
                <button key={i} className="rt-search-item" onClick={() => addPoint(r)}>
                  <Icon name="pin" size={13} />
                  <span><strong>{r.name}</strong><em>{r.full_name}</em></span>
                </button>
              ))}
            </div>
          )}
        </div>

        <ol className="rt-points">
          {livePoints.length === 0 && <li className="rt-points-empty">Ajoute des villes : elles seront reliées par un tracé.</li>}
          {livePoints.map((p, i) => (
            <li key={p.id} className="rt-point">
              <span className="rt-point-num" style={{ background: trip.color }}>{i + 1}</span>
              <input className="rt-point-name" value={p.name} onChange={e => renamePoint(p.id, e.target.value)} />
              <div className="rt-point-actions">
                <button disabled={i === 0} onClick={() => movePoint(i, -1)} title="Monter">↑</button>
                <button disabled={i === livePoints.length - 1} onClick={() => movePoint(i, 1)} title="Descendre">↓</button>
                <button className="danger" onClick={() => removePoint(p.id)} title="Retirer"><Icon name="close" size={13} /></button>
              </div>
            </li>
          ))}
        </ol>

        {/* Photos */}
        <div className="rt-section-title">
          Photos
          <button className="rt-add-photos" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            <Icon name="image" size={14} /> {busy ? 'Ajout…' : 'Ajouter'}
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={onFilesChosen} />

        <div className="rt-photos-grid">
          {trip.photos.length === 0 && <div className="rt-photos-empty">Aucune photo. Grave tes souvenirs ✦</div>}
          {trip.photos.map((photo, idx) => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              isCover={photo.id === trip.cover_photo_id}
              points={livePoints}
              color={trip.color}
              onOpen={() => onOpenPhoto(trip.photos, idx)}
              onCover={() => setCover(photo.id)}
              onDelete={() => deletePhoto(photo.id)}
              onCaption={(c) => captionPhoto(photo.id, c)}
              onPin={(point) => pinPhoto(photo, point)}
              onUnpin={() => unpinPhoto(photo)}
              onPlaceOnMap={() => onPlace({ type: 'photo', photoId: photo.id })}
            />
          ))}
        </div>

        {/* Notes géolocalisées */}
        <div className="rt-section-title">
          Notes sur la carte
          <button
            className={`rt-add-photos ${placement?.type === 'note' ? 'placing' : ''}`}
            onClick={() => onPlace(placement?.type === 'note' ? null : { type: 'note' })}
          >
            <Icon name="pin" size={14} /> {placement?.type === 'note' ? 'Clique la carte…' : 'Poser une note'}
          </button>
        </div>
        <div className="rt-notes-list">
          {trip.notes.length === 0 && (
            <div className="rt-photos-empty">Pose une note à un endroit précis de la carte 📍</div>
          )}
          {trip.notes.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              color={trip.color}
              onSave={(patch) => saveNote(note.id, patch)}
              onDelete={() => deleteNote(note.id)}
              onReplace={() => onPlace({ type: 'note-move', noteId: note.id })}
            />
          ))}
        </div>

        <label className="rt-field rt-desc">
          <span>Récit / notes</span>
          <textarea value={description} onChange={e => { setDescription(e.target.value); debouncedPatch({ description: e.target.value }) }} rows={5} placeholder="Raconte ce road trip…" />
        </label>

        <div className="rt-editor-footer">
          <button className="rt-btn" onClick={onStory}><Icon name="eye" size={15} /> Carte postale</button>
          <button className="rt-btn" onClick={() => api.exportRoadTripGeoJson(trip.id)} title="Exporter ce voyage en GeoJSON"><Icon name="download" size={15} /> GeoJSON</button>
        </div>
      </div>

      {pendingFiles && (
        <PhotoQualityModal
          count={pendingFiles.length}
          onPick={uploadPhotos}
          onCancel={() => setPendingFiles(null)}
        />
      )}
    </aside>
  )
}

function PhotoTile({ photo, isCover, points, color, onOpen, onCover, onDelete, onCaption, onPin, onUnpin, onPlaceOnMap }) {
  const [caption, setCaption] = useState(photo.caption || '')
  const [menu, setMenu] = useState(false)
  return (
    <div className={`rt-photo ${isCover ? 'cover' : ''}`} style={{ '--c': color }}>
      <div className="rt-photo-img" onClick={onOpen}>
        <img src={photo.url} alt={photo.caption || ''} loading="lazy" />
        {isCover && <span className="rt-photo-cover-badge">Couverture</span>}
        {photo.lat != null && <span className="rt-photo-pinned" title="Épinglée sur la carte"><Icon name="pin" size={12} /></span>}
      </div>
      <input
        className="rt-photo-caption"
        value={caption}
        onChange={e => setCaption(e.target.value)}
        onBlur={() => { if (caption !== (photo.caption || '')) onCaption(caption) }}
        placeholder="Légende…"
      />
      <div className="rt-photo-tools">
        <button onClick={onCover} className={isCover ? 'active' : ''} title="Définir comme couverture"><Icon name="image" size={13} /></button>
        <div className="rt-photo-pinmenu">
          <button onClick={() => setMenu(m => !m)} title="Épingler sur la carte"><Icon name="pin" size={13} /></button>
          {menu && (
            <div className="rt-pin-dropdown" onMouseLeave={() => setMenu(false)}>
              <button className="rt-pin-click" onClick={() => { onPlaceOnMap(); setMenu(false) }}><Icon name="pin" size={12} /> Cliquer sur la carte</button>
              {points.length > 0 && <div className="rt-pin-sep">ou une ville :</div>}
              {points.map(p => (
                <button key={p.id} onClick={() => { onPin(p); setMenu(false) }}>{p.name}</button>
              ))}
              {photo.lat != null && <button className="danger" onClick={() => { onUnpin(); setMenu(false) }}>Retirer de la carte</button>}
            </div>
          )}
        </div>
        <button className="danger" onClick={onDelete} title="Supprimer"><Icon name="trash" size={13} /></button>
      </div>
    </div>
  )
}

function NoteCard({ note, color, onSave, onDelete, onReplace }) {
  const [title, setTitle] = useState(note.title || '')
  const [body, setBody] = useState(note.body || '')
  return (
    <div className="rt-note-card" style={{ '--c': note.color || color }}>
      <div className="rt-note-card-head">
        <span className="rt-note-dot" />
        <input
          className="rt-note-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => { if (title !== (note.title || '')) onSave({ title }) }}
          placeholder="Titre de la note"
        />
        <button className="rt-note-mini" title="Repositionner sur la carte" onClick={onReplace}><Icon name="pin" size={13} /></button>
        <button className="rt-note-mini danger" title="Supprimer" onClick={onDelete}><Icon name="trash" size={13} /></button>
      </div>
      <textarea
        className="rt-note-body"
        value={body}
        onChange={e => setBody(e.target.value)}
        onBlur={() => { if (body !== (note.body || '')) onSave({ body }) }}
        rows={2}
        placeholder="Écris ton souvenir, une anecdote…"
      />
    </div>
  )
}

function PhotoQualityModal({ count, onPick, onCancel }) {
  return (
    <div className="rt-modal-backdrop" onClick={onCancel}>
      <div className="rt-modal" onClick={e => e.stopPropagation()}>
        <h3>Qualité d'enregistrement</h3>
        <p>{count} photo{count > 1 ? 's' : ''} à ajouter. Choisis la qualité (les photos sont compressées avant l'envoi).</p>
        <div className="rt-quality-list">
          {PHOTO_QUALITY_PRESETS.map(preset => (
            <button key={preset.key} className="rt-quality-item" onClick={() => onPick(preset.key)}>
              <strong>{preset.label}</strong>
              <em>{preset.hint}</em>
            </button>
          ))}
        </div>
        <button className="rt-btn" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  )
}

// ————————————————————————————————————— Lightbox

function Lightbox({ photos, index, onClose, onIndex }) {
  const photo = photos[index]
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onIndex(Math.min(photos.length - 1, index + 1))
      if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, photos.length, onClose, onIndex])
  if (!photo) return null
  return (
    <div className="rt-lightbox" onClick={onClose}>
      <button className="rt-lightbox-close" onClick={onClose}><Icon name="close" size={22} /></button>
      {index > 0 && <button className="rt-lightbox-nav prev" onClick={e => { e.stopPropagation(); onIndex(index - 1) }}>‹</button>}
      <figure onClick={e => e.stopPropagation()}>
        <img src={photo.url} alt={photo.caption || ''} />
        {photo.caption && <figcaption>{photo.caption}</figcaption>}
      </figure>
      {index < photos.length - 1 && <button className="rt-lightbox-nav next" onClick={e => { e.stopPropagation(); onIndex(index + 1) }}>›</button>}
    </div>
  )
}

// ————————————————————————————————————— Vue "carte postale" (instagramable)

function StoryView({ trip, onClose, onOpenPhoto }) {
  const cover = trip.photos.find(p => p.id === trip.cover_photo_id) || trip.photos[0]
  const range = fmtDateRange(trip.start_date, trip.end_date)
  const storyMapEl = useRef(null)
  const storyMap = useRef(null)

  useEffect(() => {
    if (storyMap.current || !storyMapEl.current) return
    const map = L.map(storyMapEl.current, {
      zoomControl: false, attributionControl: false, dragging: false,
      scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false,
    }).setView([46.6, 2.4], 4)
    L.tileLayer(TILE_STYLES.voyager.url, { subdomains: 'abcd', maxZoom: 20 }).addTo(map)
    L.tileLayer(TILE_STYLES.voyager.labels, { subdomains: 'abcd', maxZoom: 20 }).addTo(map)
    const latlngs = trip.points.map(p => [p.lat, p.lng])
    if (latlngs.length >= 2) {
      L.polyline(latlngs, { color: trip.color, weight: 4, opacity: 0.95, dashArray: trip.status === 'planned' ? '2 9' : null, lineCap: 'round' }).addTo(map)
    }
    trip.points.forEach((p, i) => {
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: 'rt-marker-wrap', html: `<span class="rt-marker" style="--c:${trip.color}">${i + 1}</span>`, iconSize: [24, 24], iconAnchor: [12, 12] }),
      }).addTo(map)
    })
    trip.notes.forEach(note => {
      L.marker([note.lat, note.lng], {
        icon: L.divIcon({ className: 'rt-note-marker-wrap', html: `<span class="rt-note-marker" style="--c:${note.color || trip.color}">${noteMarkerIcon}</span>`, iconSize: [30, 34], iconAnchor: [15, 32] }),
      }).addTo(map)
    })
    const geoPhotos = trip.photos.filter(ph => ph.lat != null && ph.lng != null)
    geoPhotos.forEach(ph => {
      L.marker([ph.lat, ph.lng], {
        icon: L.divIcon({ className: 'rt-photo-marker-wrap', html: `<span class="rt-photo-marker" style="--c:${trip.color}"><img src="${ph.url}" alt=""/></span>`, iconSize: [40, 40], iconAnchor: [20, 40] }),
      }).addTo(map)
    })
    storyMap.current = map
    const allPts = [
      ...latlngs,
      ...trip.notes.map(n => [n.lat, n.lng]),
      ...geoPhotos.map(ph => [ph.lat, ph.lng]),
    ]
    setTimeout(() => {
      map.invalidateSize()
      if (allPts.length === 1) map.setView(allPts[0], 8)
      else if (allPts.length > 1) map.fitBounds(allPts, { padding: [40, 40], maxZoom: 12 })
    }, 80)
    return () => { map.remove(); storyMap.current = null }
  }, [trip])

  return (
    <div className="roadtrips-view rt-story-view">
      <div className="rt-story-topbar">
        <button className="rt-btn" onClick={onClose}><Icon name="back" size={15} /> Retour</button>
        <span className="rt-story-hint">Capture d'écran prête à partager ✦</span>
      </div>

      <div className="rt-story-scroll">
        <article className="rt-postcard" style={{ '--c': trip.color }}>
          <div className="rt-postcard-cover">
            {cover
              ? <img src={cover.url} alt="" />
              : <div className="rt-postcard-cover-empty" style={{ background: `linear-gradient(135deg, ${trip.color}, ${trip.color}66)` }} />}
            <div className="rt-postcard-overlay">
              <span className={`rt-postcard-badge ${trip.status}`}>{trip.status === 'planned' ? 'À venir' : 'Road trip'}</span>
              <h1>{trip.title}</h1>
              {range && <p className="rt-postcard-date">{range}</p>}
            </div>
          </div>

          <div className="rt-postcard-stats">
            <div><Icon name="route" size={16} /><strong>{fmtKm(trip.distance_km)}</strong><span>distance</span></div>
            <div><Icon name="mountain" size={16} /><strong>{trip.elevation_m != null ? `${trip.elevation_m} m` : '—'}</strong><span>dénivelé</span></div>
            <div><Icon name="pin" size={16} /><strong>{trip.points.length}</strong><span>étapes</span></div>
            {trip.tag && <div><Icon name="map" size={16} /><strong>#{trip.tag}</strong><span>tag</span></div>}
          </div>

          <div ref={storyMapEl} className="rt-postcard-map" />

          {trip.points.length > 0 && (
            <div className="rt-postcard-route">
              {trip.points.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && <em className="rt-route-arrow">→</em>}
                  <span className="rt-route-stop">{p.name}</span>
                </span>
              ))}
            </div>
          )}

          {trip.description && <p className="rt-postcard-desc">{trip.description}</p>}

          {trip.photos.length > 0 && (
            <div className="rt-postcard-gallery">
              {trip.photos.map((photo, idx) => (
                <figure key={photo.id} onClick={() => onOpenPhoto(trip.photos, idx)}>
                  <img src={photo.url} alt={photo.caption || ''} loading="lazy" />
                  {photo.caption && <figcaption>{photo.caption}</figcaption>}
                </figure>
              ))}
            </div>
          )}

          <div className="rt-postcard-foot">Opuscule · Carnet de voyage</div>
        </article>
      </div>
    </div>
  )
}
