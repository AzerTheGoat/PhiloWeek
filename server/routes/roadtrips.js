const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { v4: uuidv4 } = require('uuid')
const { getDb } = require('../db')
const { ROADTRIP_PHOTOS_DIR } = require('../paths')
const { assertUserStorageQuota, costlyOperationLimiter } = require('../securityControls')

// ————————————————————————————————————————————————————————————————
// Carnet de voyage (road trips)
//
// Chaque voyage appartient à un utilisateur (isolation user_id sur toutes
// les requêtes). Les villes traversées sont stockées en JSON ordonné sur la
// ligne du voyage (points_json) ; le front les relie en lignes droites.
// Les photos sont des fichiers binaires sur le volume persistant
// (ROADTRIP_PHOTOS_DIR), jamais en base — seul le nom de fichier est stocké.
// ————————————————————————————————————————————————————————————————

if (!fs.existsSync(ROADTRIP_PHOTOS_DIR)) fs.mkdirSync(ROADTRIP_PHOTOS_DIR, { recursive: true })

const ALLOWED_PHOTO_EXT = { 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/png': '.png' }
const NOTE_CATEGORIES = new Set(['food', 'water', 'supplies', 'fuel', 'charging', 'sleep', 'medical', 'parking', 'transport', 'visit', 'activity', 'viewpoint', 'warning', 'practical', 'other'])

const storage = multer.diskStorage({
  destination: ROADTRIP_PHOTOS_DIR,
  filename: (req, file, cb) => cb(null, `${uuidv4()}${ALLOWED_PHOTO_EXT[file.mimetype] || '.jpg'}`),
})
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 Mo : large même pour une photo "haute qualité"
  fileFilter: (req, file, cb) => cb(null, Boolean(ALLOWED_PHOTO_EXT[file.mimetype])),
})

// ————————————————————————————————————— Helpers

function haversineKm(a, b) {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const lat1 = a.lat * Math.PI / 180
  const lat2 = b.lat * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function autoDistanceKm(points) {
  let total = 0
  for (let i = 1; i < points.length; i++) total += haversineKm(points[i - 1], points[i])
  return Math.round(total * 10) / 10
}

function normalizePoints(value) {
  let arr = value
  if (typeof value === 'string') {
    try { arr = JSON.parse(value) } catch (_) { arr = [] }
  }
  if (!Array.isArray(arr)) return []
  return arr
    .map(p => {
      const lat = Number(p?.lat)
      const lng = Number(p?.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
      return {
        id: String(p.id || uuidv4()),
        name: String(p?.name || '').trim().slice(0, 120) || 'Étape',
        lat,
        lng,
        note: p?.note ? String(p.note).slice(0, 2000) : '',
      }
    })
    .filter(Boolean)
    .slice(0, 300)
}

function normalizeColor(value, fallback = '#e8663f') {
  const color = String(value || '').trim()
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback
}

function normalizeStatus(value) {
  return value === 'planned' ? 'planned' : 'done'
}

function normalizeDate(value) {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function nullableNumber(value, min, max) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  if (n < min || n > max) return null
  return n
}

function emptyToNull(value, max = 4000) {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, max) : null
}

function parseObject(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value === 'object' && !Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback
  } catch (_) { return fallback }
}

function normalizeCategory(value) {
  const category = String(value || '').trim().toLowerCase()
  return NOTE_CATEGORIES.has(category) ? category : 'other'
}

function normalizeHttpUrl(value) {
  const text = String(value || '').trim().slice(0, 2000)
  if (!text) return null
  try {
    const url = new URL(text)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch (_) { return null }
}

// Réduit le JSON libre à des valeurs sérialisables et bornées. Les clés qui
// pourraient modifier un prototype sont volontairement ignorées.
function sanitizeJson(value, depth = 0) {
  if (depth > 7 || value === undefined || typeof value === 'function') return null
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') return value.slice(0, 12000)
  if (Array.isArray(value)) return value.slice(0, 5000).map(item => sanitizeJson(item, depth + 1))
  if (typeof value === 'object') {
    const out = {}
    Object.entries(value).slice(0, 300).forEach(([key, item]) => {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) return
      out[String(key).slice(0, 100)] = sanitizeJson(item, depth + 1)
    })
    return out
  }
  return null
}

function normalizeTrack(value) {
  if (!Array.isArray(value)) return []
  return value.map(item => {
    const lat = Number(Array.isArray(item) ? item[0] : item?.lat)
    const lng = Number(Array.isArray(item) ? item[1] : item?.lng)
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
      ? { lat, lng }
      : null
  }).filter(Boolean).slice(0, 5000)
}

function normalizeAiPlan(payload) {
  const root = parseObject(payload)
  const trip = parseObject(root.trip, root)
  if (root.philoweek_type && root.philoweek_type !== 'road_trip_plan') {
    throw new Error('Le JSON doit avoir philoweek_type = "road_trip_plan"')
  }
  const sourcePoints = Array.isArray(trip.points) ? trip.points : (Array.isArray(trip.stops) ? trip.stops : [])
  const points = normalizePoints(sourcePoints.map(point => ({
    ...point,
    id: point.id || point.key,
    name: point.name || point.title,
  })))
  if (points.length < 2) throw new Error('Le tracé doit contenir au moins deux étapes avec des coordonnées valides')

  const sourcePlaces = Array.isArray(trip.places) ? trip.places
    : Array.isArray(trip.useful_places) ? trip.useful_places
      : Array.isArray(trip.notes) ? trip.notes : []
  const notes = sourcePlaces.map((place, index) => {
    const lat = nullableNumber(place?.lat, -90, 90)
    const lng = nullableNumber(place?.lng, -180, 180)
    if (lat === null || lng === null) return null
    const category = normalizeCategory(place.category)
    const details = sanitizeJson({
      importance: place.importance ?? null,
      address: place.address ?? null,
      opening_hours: place.opening_hours ?? null,
      price: place.price ?? null,
      phone: place.phone ?? null,
      website: normalizeHttpUrl(place.website),
      source_url: normalizeHttpUrl(place.source_url),
      verified_on: place.verified_on ?? null,
      confidence: place.confidence ?? null,
      best_time: place.best_time ?? null,
      reservation: place.reservation ?? null,
      accessibility: place.accessibility ?? null,
      supplies: place.supplies ?? null,
      warnings: place.warnings ?? null,
      tags: Array.isArray(place.tags) ? place.tags.slice(0, 30) : [],
      linked_point_key: place.linked_point_key ?? null,
    })
    return {
      lat, lng, category,
      title: emptyToNull(place.title || place.name, 200),
      body: emptyToNull(place.body || place.description || place.note, 5000),
      color: /^#[0-9a-f]{6}$/i.test(String(place.color || '')) ? String(place.color).toLowerCase() : null,
      details_json: JSON.stringify(details),
      sort_order: index,
    }
  }).filter(Boolean).slice(0, 500)

  const track = normalizeTrack(trip.track || trip.route_geometry)
  const plan = sanitizeJson({
    version: Number(root.version) || 1,
    summary: trip.summary || null,
    traveler_profile: trip.traveler_profile || null,
    departure: trip.departure || (trip.start_date || trip.start_time ? { date: trip.start_date || null, time: trip.start_time || null } : null),
    arrival: trip.arrival || (trip.end_date || trip.end_time ? { date: trip.end_date || null, time: trip.end_time || null } : null),
    transport_options: Array.isArray(trip.transport_options) ? trip.transport_options.slice(0, 20) : [],
    selected_transport: trip.selected_transport || null,
    segments: Array.isArray(trip.segments) ? trip.segments.slice(0, 300) : [],
    days: Array.isArray(trip.days) ? trip.days.slice(0, 180) : [],
    practical: trip.practical || null,
    checklist: Array.isArray(trip.checklist) ? trip.checklist.slice(0, 300) : [],
    sources: Array.isArray(trip.sources) ? trip.sources.slice(0, 300) : [],
    assumptions: Array.isArray(trip.assumptions) ? trip.assumptions.slice(0, 300) : [],
    track,
  })
  const warnings = []
  if (track.length < 2) warnings.push('Aucune géométrie détaillée : la carte reliera les étapes par des lignes droites.')
  if (!notes.length) warnings.push('Aucun lieu utile géolocalisé n’a été trouvé dans le JSON.')
  const unverified = notes.filter(note => {
    const details = parseObject(note.details_json)
    return !details.source_url || !details.verified_on
  }).length
  if (unverified) warnings.push(`${unverified} lieu${unverified > 1 ? 'x' : ''} utile${unverified > 1 ? 's' : ''} sans source ou date de vérification.`)

  return {
    trip: {
      title: trip.title, description: trip.description, status: trip.status || 'planned', tag: trip.tag,
      color: trip.color, points, distance_km: trip.distance_km, distance_manual: trip.distance_km != null,
      elevation_m: trip.elevation_m, start_date: trip.start_date, end_date: trip.end_date, plan,
    },
    notes,
    preview: {
      title: emptyToNull(trip.title, 200) || 'Voyage conseillé', points: points.length,
      segments: plan.segments.length, days: plan.days.length, places: notes.length,
      transport_options: plan.transport_options.length,
      selected_transport: plan.selected_transport?.label || null,
      categories: [...new Set(notes.map(note => note.category))], warnings,
    },
  }
}

// Photos d'un voyage, prêtes à sérialiser (URL servie par l'API authentifiée).
function photosForTrip(db, tripId, userId) {
  return db.prepare(
    'SELECT * FROM road_trip_photos WHERE trip_id = ? AND user_id = ? ORDER BY sort_order ASC, created_at ASC'
  ).all(tripId, userId).map(serializePhoto)
}

function serializePhoto(row) {
  return {
    id: row.id,
    trip_id: row.trip_id,
    filename: row.filename,
    url: `/api/roadtrips/photos/${row.filename}`,
    caption: row.caption,
    point_id: row.point_id,
    lat: row.lat,
    lng: row.lng,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    sort_order: row.sort_order,
    created_at: row.created_at,
  }
}

function notesForTrip(db, tripId, userId) {
  return db.prepare(
    'SELECT * FROM road_trip_notes WHERE trip_id = ? AND user_id = ? ORDER BY sort_order ASC, created_at ASC'
  ).all(tripId, userId).map(serializeNote)
}

function serializeNote(row) {
  return {
    id: row.id,
    trip_id: row.trip_id,
    lat: row.lat,
    lng: row.lng,
    title: row.title,
    body: row.body,
    color: row.color,
    category: normalizeCategory(row.category),
    details: parseObject(row.details_json),
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function serializeTrip(db, row, userId) {
  const points = normalizePoints(row.points_json)
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    tag: row.tag,
    color: row.color,
    points,
    plan: parseObject(row.plan_json),
    distance_km: row.distance_km,
    distance_manual: Boolean(row.distance_manual),
    distance_auto_km: autoDistanceKm(points),
    elevation_m: row.elevation_m,
    start_date: row.start_date,
    end_date: row.end_date,
    cover_photo_id: row.cover_photo_id,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
    photos: photosForTrip(db, row.id, userId),
    notes: notesForTrip(db, row.id, userId),
  }
}

function getOwnedTrip(db, id, userId) {
  const row = db.prepare('SELECT * FROM road_trips WHERE id = ? AND user_id = ?').get(id, userId)
  return row || null
}

// Champs éditables communs à POST/PUT.
function readTripBody(body, existing = {}) {
  const points = body.points !== undefined ? normalizePoints(body.points)
    : normalizePoints(existing.points_json)
  const distanceManual = body.distance_manual !== undefined
    ? (body.distance_manual ? 1 : 0)
    : (existing.distance_manual ?? 0)
  const distanceKm = distanceManual
    ? nullableNumber(body.distance_km, 0, 1000000)
    : autoDistanceKm(points)
  return {
    title: (body.title !== undefined ? emptyToNull(body.title, 200) : existing.title) || 'Voyage sans titre',
    description: body.description !== undefined ? emptyToNull(body.description, 20000) : existing.description ?? null,
    status: body.status !== undefined ? normalizeStatus(body.status) : (existing.status || 'done'),
    tag: body.tag !== undefined ? emptyToNull(body.tag, 60) : existing.tag ?? null,
    color: body.color !== undefined ? normalizeColor(body.color) : (existing.color || '#e8663f'),
    points_json: JSON.stringify(points),
    distance_km: distanceKm,
    distance_manual: distanceManual,
    elevation_m: body.elevation_m !== undefined ? nullableNumber(body.elevation_m, 0, 100000) : existing.elevation_m ?? null,
    start_date: body.start_date !== undefined ? normalizeDate(body.start_date) : existing.start_date ?? null,
    end_date: body.end_date !== undefined ? normalizeDate(body.end_date) : existing.end_date ?? null,
    cover_photo_id: body.cover_photo_id !== undefined ? (body.cover_photo_id ? String(body.cover_photo_id) : null) : existing.cover_photo_id ?? null,
    plan_json: body.plan !== undefined ? JSON.stringify(sanitizeJson(parseObject(body.plan))) : (existing.plan_json || '{}'),
  }
}

function deletePhotoFile(filename) {
  if (!filename || filename.includes('/') || filename.includes('..')) return
  try { fs.unlinkSync(path.join(ROADTRIP_PHOTOS_DIR, filename)) } catch (_) {}
}

// ————————————————————————————————————— Photos (servir un fichier)
// Déclaré avant `/:id` pour que "photos" ne soit pas capté comme un id.

router.get('/photos/:filename', (req, res) => {
  const { filename } = req.params
  if (filename.includes('/') || filename.includes('..')) return res.status(400).end()
  const db = getDb()
  const photo = db.prepare('SELECT * FROM road_trip_photos WHERE filename = ? AND user_id = ?').get(filename, req.user.id)
  if (!photo) return res.status(404).json({ error: 'Not found' })
  const filePath = path.join(ROADTRIP_PHOTOS_DIR, photo.filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing on disk' })
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
  res.sendFile(filePath)
})

// ————————————————————————————————————— Géocodage (proxy Nominatim, gratuit, sans clé)

router.get('/geocode', async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (q.length < 2) return res.json([])
  try {
    const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
      q,
      format: 'jsonv2',
      limit: '6',
      addressdetails: '1',
      'accept-language': 'fr',
    })
    const upstream = await fetch(url, {
      headers: {
        // Politique d'usage Nominatim : User-Agent identifiant l'application.
        'User-Agent': 'Opuscule-RoadTrips/1.0 (personal notebook app)',
        'Accept': 'application/json',
      },
    })
    if (!upstream.ok) return res.status(502).json({ error: 'Géocodage indisponible' })
    const data = await upstream.json()
    res.json((Array.isArray(data) ? data : []).map(item => ({
      name: shortPlaceName(item),
      full_name: item.display_name,
      lat: Number(item.lat),
      lng: Number(item.lon),
      type: item.type,
    })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)))
  } catch (err) {
    res.status(502).json({ error: 'Géocodage indisponible' })
  }
})

function shortPlaceName(item) {
  const a = item.address || {}
  const primary = a.city || a.town || a.village || a.municipality || a.county || a.state || item.name
  return String(primary || item.display_name || '').split(',')[0].trim() || 'Lieu'
}

// Aperçu sans écriture, puis import transactionnel d'un plan produit par un
// LLM externe. L'application ne transmet aucune donnée à un fournisseur IA.
router.post('/import-plan/preview', (req, res) => {
  try {
    res.json(normalizeAiPlan(req.body || {}).preview)
  } catch (err) {
    res.status(400).json({ error: err.message || 'Plan JSON invalide' })
  }
})

router.post('/import-plan', (req, res) => {
  let imported
  try { imported = normalizeAiPlan(req.body || {}) }
  catch (err) { return res.status(400).json({ error: err.message || 'Plan JSON invalide' }) }

  const db = getDb()
  const data = readTripBody(imported.trip)
  const id = uuidv4()
  const now = new Date().toISOString()
  const tx = db.transaction(() => {
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM road_trips WHERE user_id = ?').get(req.user.id).m
    db.prepare(`
      INSERT INTO road_trips (
        id, user_id, title, description, status, tag, color, points_json, plan_json,
        distance_km, distance_manual, elevation_m, start_date, end_date,
        cover_photo_id, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, req.user.id, data.title, data.description, data.status, data.tag, data.color, data.points_json, data.plan_json,
      data.distance_km, data.distance_manual, data.elevation_m, data.start_date, data.end_date,
      null, maxOrder + 1, now, now
    )
    const insertNote = db.prepare(`
      INSERT INTO road_trip_notes (
        id, trip_id, user_id, lat, lng, title, body, color, category, details_json, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    imported.notes.forEach(note => insertNote.run(
      uuidv4(), id, req.user.id, note.lat, note.lng, note.title, note.body, note.color,
      note.category, note.details_json, note.sort_order, now, now
    ))
  })
  try {
    tx()
    res.status(201).json(serializeTrip(db, getOwnedTrip(db, id, req.user.id), req.user.id))
  } catch (err) {
    console.error('Road trip plan import error:', err)
    res.status(500).json({ error: 'Import impossible' })
  }
})

// ————————————————————————————————————— Export JSON (tous les voyages)

router.get('/export', (req, res) => {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM road_trips WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').all(req.user.id)
  const embed = String(req.query.photos || '') === 'embed'
  const trips = rows.map(row => {
    const trip = serializeTrip(db, row, req.user.id)
    trip.photos = trip.photos.map(photo => {
      const out = { ...photo }
      if (embed) out.data_uri = photoToDataUri(photo.filename)
      return out
    })
    return trip
  })
  const payload = {
    philoweek_type: 'road_trips',
    version: 2,
    exported: new Date().toISOString(),
    trips,
  }
  const date = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="road-trips-${date}.json"`)
  res.send(JSON.stringify(payload, null, 2))
})

function photoToDataUri(filename) {
  try {
    const filePath = path.join(ROADTRIP_PHOTOS_DIR, filename)
    const ext = path.extname(filename).toLowerCase()
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
    return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`
  } catch (_) {
    return null
  }
}

// ————————————————————————————————————— GeoJSON (un voyage, standard interopérable)

router.get('/:id/geojson', (req, res) => {
  const db = getDb()
  const row = getOwnedTrip(db, req.params.id, req.user.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  const trip = serializeTrip(db, row, req.user.id)

  const features = []
  const routePoints = Array.isArray(trip.plan?.track) && trip.plan.track.length >= 2 ? trip.plan.track : trip.points
  if (routePoints.length >= 2) {
    features.push({
      type: 'Feature',
      properties: { kind: 'route', title: trip.title, status: trip.status, tag: trip.tag, color: trip.color, distance_km: trip.distance_km, elevation_m: trip.elevation_m },
      geometry: { type: 'LineString', coordinates: routePoints.map(p => [p.lng, p.lat]) },
    })
  }
  for (const p of trip.points) {
    features.push({
      type: 'Feature',
      properties: { kind: 'stop', name: p.name, note: p.note },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    })
  }
  for (const photo of trip.photos) {
    if (Number.isFinite(photo.lat) && Number.isFinite(photo.lng)) {
      features.push({
        type: 'Feature',
        properties: { kind: 'photo', caption: photo.caption, url: photo.url },
        geometry: { type: 'Point', coordinates: [photo.lng, photo.lat] },
      })
    }
  }
  for (const note of trip.notes) {
    features.push({
      type: 'Feature',
      properties: { kind: 'note', category: note.category, title: note.title, body: note.body, ...note.details },
      geometry: { type: 'Point', coordinates: [note.lng, note.lat] },
    })
  }

  const fc = { type: 'FeatureCollection', properties: { title: trip.title, status: trip.status }, features }
  res.setHeader('Content-Type', 'application/geo+json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${slugify(trip.title)}.geojson"`)
  res.send(JSON.stringify(fc, null, 2))
})

function slugify(text) {
  return String(text || 'road-trip').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'road-trip'
}

// ————————————————————————————————————— CRUD voyages

router.get('/', (req, res) => {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM road_trips WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').all(req.user.id)
  res.json(rows.map(row => serializeTrip(db, row, req.user.id)))
})

router.get('/:id', (req, res) => {
  const db = getDb()
  const row = getOwnedTrip(db, req.params.id, req.user.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  res.json(serializeTrip(db, row, req.user.id))
})

router.post('/', (req, res) => {
  const db = getDb()
  const data = readTripBody(req.body || {})
  const id = uuidv4()
  const now = new Date().toISOString()
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM road_trips WHERE user_id = ?').get(req.user.id).m
  db.prepare(`
    INSERT INTO road_trips (
      id, user_id, title, description, status, tag, color, points_json, plan_json,
      distance_km, distance_manual, elevation_m, start_date, end_date,
      cover_photo_id, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.user.id, data.title, data.description, data.status, data.tag, data.color, data.points_json, data.plan_json,
    data.distance_km, data.distance_manual, data.elevation_m, data.start_date, data.end_date,
    data.cover_photo_id, maxOrder + 1, now, now
  )
  res.status(201).json(serializeTrip(db, getOwnedTrip(db, id, req.user.id), req.user.id))
})

router.put('/:id', (req, res) => {
  const db = getDb()
  const existing = getOwnedTrip(db, req.params.id, req.user.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const data = readTripBody(req.body || {}, existing)
  db.prepare(`
    UPDATE road_trips SET
      title = ?, description = ?, status = ?, tag = ?, color = ?, points_json = ?,
      plan_json = ?, distance_km = ?, distance_manual = ?, elevation_m = ?, start_date = ?, end_date = ?,
      cover_photo_id = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    data.title, data.description, data.status, data.tag, data.color, data.points_json, data.plan_json,
    data.distance_km, data.distance_manual, data.elevation_m, data.start_date, data.end_date,
    data.cover_photo_id, new Date().toISOString(), req.params.id, req.user.id
  )
  res.json(serializeTrip(db, getOwnedTrip(db, req.params.id, req.user.id), req.user.id))
})

// Réordonner les voyages (liste). Body : { ids: [...] }
router.put('/reorder/list', (req, res) => {
  const db = getDb()
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
  const tx = db.transaction(() => {
    ids.forEach((id, index) => {
      db.prepare('UPDATE road_trips SET sort_order = ? WHERE id = ? AND user_id = ?').run(index, id, req.user.id)
    })
  })
  tx()
  const rows = db.prepare('SELECT * FROM road_trips WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').all(req.user.id)
  res.json(rows.map(row => serializeTrip(db, row, req.user.id)))
})

router.delete('/:id', (req, res) => {
  const db = getDb()
  const existing = getOwnedTrip(db, req.params.id, req.user.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const photos = db.prepare('SELECT filename FROM road_trip_photos WHERE trip_id = ? AND user_id = ?').all(req.params.id, req.user.id)
  db.prepare('DELETE FROM road_trips WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id)
  photos.forEach(p => deletePhotoFile(p.filename)) // fichiers effacés après le succès DB
  res.json({ ok: true })
})

// ————————————————————————————————————— Photos (upload / edit / delete)

router.post('/:id/photos', costlyOperationLimiter, upload.single('photo'), (req, res) => {
  const db = getDb()
  const trip = getOwnedTrip(db, req.params.id, req.user.id)
  if (!trip) {
    if (req.file) deletePhotoFile(req.file.filename)
    return res.status(404).json({ error: 'Not found' })
  }
  if (!req.file) return res.status(400).json({ error: 'No photo file' })
  try { assertUserStorageQuota(db, req.user.id, req.file.size) }
  catch (error) {
    deletePhotoFile(req.file.filename)
    return res.status(error.status || 413).json({ error: error.message, code: error.code })
  }

  const id = uuidv4()
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM road_trip_photos WHERE trip_id = ?').get(req.params.id).m
  db.prepare(`
    INSERT INTO road_trip_photos (
      id, trip_id, user_id, filename, caption, point_id, lat, lng, width, height, bytes, sort_order, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    id, req.params.id, req.user.id, req.file.filename,
    emptyToNull(req.body.caption, 500),
    req.body.point_id ? String(req.body.point_id) : null,
    nullableNumber(req.body.lat, -90, 90),
    nullableNumber(req.body.lng, -180, 180),
    nullableNumber(req.body.width, 0, 100000),
    nullableNumber(req.body.height, 0, 100000),
    req.file.size,
    maxOrder + 1
  )
  res.status(201).json(serializePhoto(db.prepare('SELECT * FROM road_trip_photos WHERE id = ?').get(id)))
})

router.put('/photos/:photoId', (req, res) => {
  const db = getDb()
  const photo = db.prepare('SELECT * FROM road_trip_photos WHERE id = ? AND user_id = ?').get(req.params.photoId, req.user.id)
  if (!photo) return res.status(404).json({ error: 'Not found' })
  const caption = req.body.caption !== undefined ? emptyToNull(req.body.caption, 500) : photo.caption
  const pointId = req.body.point_id !== undefined ? (req.body.point_id ? String(req.body.point_id) : null) : photo.point_id
  const lat = req.body.lat !== undefined ? nullableNumber(req.body.lat, -90, 90) : photo.lat
  const lng = req.body.lng !== undefined ? nullableNumber(req.body.lng, -180, 180) : photo.lng
  const sortOrder = req.body.sort_order !== undefined ? (nullableNumber(req.body.sort_order, 0, 100000) ?? photo.sort_order) : photo.sort_order
  db.prepare('UPDATE road_trip_photos SET caption = ?, point_id = ?, lat = ?, lng = ?, sort_order = ? WHERE id = ? AND user_id = ?')
    .run(caption, pointId, lat, lng, sortOrder, req.params.photoId, req.user.id)
  res.json(serializePhoto(db.prepare('SELECT * FROM road_trip_photos WHERE id = ?').get(req.params.photoId)))
})

// Réordonner les photos d'un voyage. Body : { ids: [...] }
router.put('/:id/photos/order', (req, res) => {
  const db = getDb()
  const trip = getOwnedTrip(db, req.params.id, req.user.id)
  if (!trip) return res.status(404).json({ error: 'Not found' })
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
  const tx = db.transaction(() => {
    ids.forEach((id, index) => {
      db.prepare('UPDATE road_trip_photos SET sort_order = ? WHERE id = ? AND trip_id = ? AND user_id = ?')
        .run(index, id, req.params.id, req.user.id)
    })
  })
  tx()
  res.json(photosForTrip(db, req.params.id, req.user.id))
})

router.delete('/photos/:photoId', (req, res) => {
  const db = getDb()
  const photo = db.prepare('SELECT * FROM road_trip_photos WHERE id = ? AND user_id = ?').get(req.params.photoId, req.user.id)
  if (!photo) return res.status(404).json({ error: 'Not found' })
  db.prepare('DELETE FROM road_trip_photos WHERE id = ? AND user_id = ?').run(req.params.photoId, req.user.id)
  // Si c'était la couverture du voyage, on la retire.
  db.prepare('UPDATE road_trips SET cover_photo_id = NULL WHERE cover_photo_id = ? AND user_id = ?').run(req.params.photoId, req.user.id)
  deletePhotoFile(photo.filename)
  res.json({ ok: true })
})

// ————————————————————————————————————— Notes géolocalisées (texte sur la carte)

router.post('/:id/notes', (req, res) => {
  const db = getDb()
  const trip = getOwnedTrip(db, req.params.id, req.user.id)
  if (!trip) return res.status(404).json({ error: 'Not found' })
  const lat = nullableNumber(req.body.lat, -90, 90)
  const lng = nullableNumber(req.body.lng, -180, 180)
  if (lat === null || lng === null) return res.status(400).json({ error: 'Coordonnées invalides' })

  const id = uuidv4()
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM road_trip_notes WHERE trip_id = ?').get(req.params.id).m
  db.prepare(`
    INSERT INTO road_trip_notes (id, trip_id, user_id, lat, lng, title, body, color, category, details_json, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    id, req.params.id, req.user.id, lat, lng,
    emptyToNull(req.body.title, 200), emptyToNull(req.body.body, 5000),
    req.body.color !== undefined ? normalizeColor(req.body.color, null) : null,
    normalizeCategory(req.body.category || 'practical'),
    JSON.stringify(sanitizeJson(parseObject(req.body.details))),
    maxOrder + 1
  )
  res.status(201).json(serializeNote(db.prepare('SELECT * FROM road_trip_notes WHERE id = ?').get(id)))
})

router.put('/notes/:noteId', (req, res) => {
  const db = getDb()
  const note = db.prepare('SELECT * FROM road_trip_notes WHERE id = ? AND user_id = ?').get(req.params.noteId, req.user.id)
  if (!note) return res.status(404).json({ error: 'Not found' })
  const title = req.body.title !== undefined ? emptyToNull(req.body.title, 200) : note.title
  const body = req.body.body !== undefined ? emptyToNull(req.body.body, 5000) : note.body
  const color = req.body.color !== undefined ? normalizeColor(req.body.color, null) : note.color
  const lat = req.body.lat !== undefined ? (nullableNumber(req.body.lat, -90, 90) ?? note.lat) : note.lat
  const lng = req.body.lng !== undefined ? (nullableNumber(req.body.lng, -180, 180) ?? note.lng) : note.lng
  const category = req.body.category !== undefined ? normalizeCategory(req.body.category) : note.category
  const detailsJson = req.body.details !== undefined ? JSON.stringify(sanitizeJson(parseObject(req.body.details))) : note.details_json
  db.prepare("UPDATE road_trip_notes SET title = ?, body = ?, color = ?, lat = ?, lng = ?, category = ?, details_json = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
    .run(title, body, color, lat, lng, category, detailsJson, req.params.noteId, req.user.id)
  res.json(serializeNote(db.prepare('SELECT * FROM road_trip_notes WHERE id = ?').get(req.params.noteId)))
})

router.delete('/notes/:noteId', (req, res) => {
  const db = getDb()
  const note = db.prepare('SELECT * FROM road_trip_notes WHERE id = ? AND user_id = ?').get(req.params.noteId, req.user.id)
  if (!note) return res.status(404).json({ error: 'Not found' })
  db.prepare('DELETE FROM road_trip_notes WHERE id = ? AND user_id = ?').run(req.params.noteId, req.user.id)
  res.json({ ok: true })
})

router.use((err, req, res, next) => {
  if (!(err instanceof multer.MulterError)) return next(err)
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400
  res.status(status).json({
    error: err.code === 'LIMIT_FILE_SIZE' ? 'Photo trop volumineuse' : 'Upload de photo invalide',
    code: err.code,
  })
})

module.exports = router
