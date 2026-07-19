const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { v4: uuidv4 } = require('uuid')
const { getDb } = require('../db')
const { ROADTRIP_PHOTOS_DIR } = require('../paths')

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
    version: 1,
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
  if (trip.points.length >= 2) {
    features.push({
      type: 'Feature',
      properties: { kind: 'route', title: trip.title, status: trip.status, tag: trip.tag, color: trip.color, distance_km: trip.distance_km, elevation_m: trip.elevation_m },
      geometry: { type: 'LineString', coordinates: trip.points.map(p => [p.lng, p.lat]) },
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
      id, user_id, title, description, status, tag, color, points_json,
      distance_km, distance_manual, elevation_m, start_date, end_date,
      cover_photo_id, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.user.id, data.title, data.description, data.status, data.tag, data.color, data.points_json,
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
      distance_km = ?, distance_manual = ?, elevation_m = ?, start_date = ?, end_date = ?,
      cover_photo_id = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    data.title, data.description, data.status, data.tag, data.color, data.points_json,
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

router.post('/:id/photos', upload.single('photo'), (req, res) => {
  const db = getDb()
  const trip = getOwnedTrip(db, req.params.id, req.user.id)
  if (!trip) {
    if (req.file) deletePhotoFile(req.file.filename)
    return res.status(404).json({ error: 'Not found' })
  }
  if (!req.file) return res.status(400).json({ error: 'No photo file' })

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

module.exports = router
