const BASE = '/api'

async function req(method, path, body, isFormData = false) {
  const opts = { method, headers: {}, credentials: 'include' }
  if (body && !isFormData) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  } else if (body) {
    opts.body = body
  }
  const res = await fetch(BASE + path, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    const e = new Error(err.error || res.statusText)
    e.status = res.status
    e.code = err.code || null
    e.details = err
    throw e
  }
  return res.json()
}

// Auth
export const authRegister = (username, password) => req('POST', '/auth/register', { username, password })
export const authLogin = (username, password) => req('POST', '/auth/login', { username, password })
export const authLogout = () => req('POST', '/auth/logout')
export const authMe = () => req('GET', '/auth/me')
export const authChangePassword = (currentPassword, newPassword) => req('PATCH', '/auth/password', { currentPassword, newPassword })

// Files
export const getFileTree = () => req('GET', '/files')
export const getFile = id => req('GET', `/files/${id}`)
export const getFileNames = () => req('GET', '/files/names')
export const searchFiles = q => req('GET', `/files/search?q=${encodeURIComponent(q)}`)
export const createFile = data => req('POST', '/files', data)
export const updateFile = (id, data) => req('PUT', `/files/${id}`, data)
export const deleteFile = (id, confirmChildren = false) =>
  req('DELETE', `/files/${id}${confirmChildren ? '?confirm_children=1' : ''}`)
export const batchTrashFiles = ids => req('POST', '/files/batch-trash', { ids, confirm_children: true })
export const undoFile = (id, base_version) => req('POST', `/files/${id}/history/undo`, { base_version })
export const redoFile = (id, base_version) => req('POST', `/files/${id}/history/redo`, { base_version })
export const getTrash = () => req('GET', '/files/trash')
export const restoreTrashItem = id => req('POST', `/files/trash/${id}/restore`)
export const permanentlyDeleteTrashItem = id => req('DELETE', `/files/trash/${id}`)
export const emptyTrash = () => req('DELETE', '/files/trash')
export const moveFile = (id, parent_id, sort_order) => req('PUT', `/files/${id}/move`, { parent_id, sort_order })
export const unlockFolder = (id, password) => req('POST', `/files/${id}/unlock`, { password })
export const enableFolderEncryption = (id, password) => req('POST', `/files/${id}/encryption/enable`, { password })
export const openEncryptedFolder = (id, password) => req('POST', `/files/${id}/encryption/open`, { password })
export const lockEncryptedFolder = id => req('POST', `/files/${id}/encryption/lock`)
export const disableFolderEncryption = (id, password) => req('DELETE', `/files/${id}/encryption`, { password })
export const changeVaultPassword = (currentPassword, newPassword) => req('PATCH', '/files/vault/password', { currentPassword, newPassword })

// Partage et présence collaborative
export const getFileShares = id => req('GET', `/shares/${id}`)
export const shareFile = (id, username, permission) => req('POST', `/shares/${id}`, { username, permission })
export const updateFileShare = (fileId, shareId, permission) => req('PATCH', `/shares/${fileId}/${shareId}`, { permission })
export const removeFileShare = (fileId, shareId) => req('DELETE', `/shares/${fileId}/${shareId}`)
export const heartbeatFilePresence = id => req('POST', `/shares/presence/${id}`)
export const leaveFilePresence = id => req('DELETE', `/shares/presence/${id}`)

// Tableurs Excel
export const exportSpreadsheet = id => {
  window.location.href = BASE + `/spreadsheets/${id}/export`
}
export const importSpreadsheet = (file, parentId = null) => {
  const fd = new FormData()
  fd.append('workbook', file)
  if (parentId) fd.append('parent_id', parentId)
  return req('POST', '/spreadsheets/import', fd, true)
}

// Export / Import
export const exportObsidian = async (password = '') => {
  const response = await fetch(BASE + '/export/obsidian', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!response.ok) {
    let payload = null
    try { payload = await response.json() } catch (_) {}
    throw new Error(payload?.error || `Erreur ${response.status}`)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filenameFromDisposition(response.headers.get('content-disposition')) || 'opuscule-vault.zip'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export const importObsidian = (file, conflict = 'overwrite', vaultPassword = '') => {
  const fd = new FormData()
  fd.append('vault', file)
  fd.append('conflict', conflict)
  if (vaultPassword) fd.append('vault_password', vaultPassword)
  return req('POST', '/import/obsidian', fd, true)
}

function filenameFromDisposition(value) {
  const utf8 = String(value || '').match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8) return decodeURIComponent(utf8[1])
  return String(value || '').match(/filename="?([^";]+)"?/i)?.[1] || ''
}

// Voice
export const getVoiceNotes = file_id =>
  req('GET', `/voice${file_id ? `?file_id=${file_id}` : ''}`)
export const uploadVoice = (file_id, audioBlob, duration, title) => {
  const fd = new FormData()
  fd.append('audio', audioBlob, 'recording.webm')
  if (file_id) fd.append('file_id', file_id)
  fd.append('duration', String(duration))
  fd.append('title', title || '')
  return req('POST', '/voice', fd, true)
}
export const deleteVoice = id => req('DELETE', `/voice/${id}`)

// Reconnaissance manuscrite

// Inbox — Resources
export const getResources = (status, type) => {
  const p = new URLSearchParams()
  if (status) p.set('status', status)
  if (type) p.set('type', type)
  return req('GET', `/inbox/resources${p.toString() ? '?' + p : ''}`)
}
export const createResource = data => req('POST', '/inbox/resources', data)
export const updateResource = (id, data) => req('PUT', `/inbox/resources/${id}`, data)
export const deleteResource = id => req('DELETE', `/inbox/resources/${id}`)

// Inbox — Ideas
export const getIdeas = () => req('GET', '/inbox/ideas')
export const createIdea = data => req('POST', '/inbox/ideas', data)
export const updateIdea = (id, data) => req('PUT', `/inbox/ideas/${id}`, data)
export const deleteIdea = id => req('DELETE', `/inbox/ideas/${id}`)
export const sendIdeaToFile = (id, fileId) =>
  req('POST', `/inbox/ideas/${id}/send-to-file`, { fileId })

// Life / Quotes
export const getQuotes = () => req('GET', '/life/quotes')
export const createQuote = data => req('POST', '/life/quotes', data)
export const updateQuote = (id, data) => req('PUT', `/life/quotes/${id}`, data)
export const deleteQuote = id => req('DELETE', `/life/quotes/${id}`)

// Life / Fact Check
export const getFactChecks = () => req('GET', '/life/fact-checks')
export const createFactCheck = data => req('POST', '/life/fact-checks', data)
export const updateFactCheck = (id, data) => req('PUT', `/life/fact-checks/${id}`, data)
export const deleteFactCheck = id => req('DELETE', `/life/fact-checks/${id}`)

// Todos
export const getTodos = (status = 'open') => req('GET', `/todos?status=${encodeURIComponent(status)}`)
export const getTodoReminder = () => req('GET', '/todos/reminder')
export const createTodo = data => req('POST', '/todos', data)
export const updateTodo = (id, data) => req('PUT', `/todos/${id}`, data)
export const deleteTodo = id => req('DELETE', `/todos/${id}`)
export const getTodoDashboard = (days = 42) => req('GET', `/todos/dashboard?days=${encodeURIComponent(days)}`)
export const createPractice = data => req('POST', '/todos/practices', data)
export const updatePractice = (id, data) => req('PUT', `/todos/practices/${id}`, data)
export const deletePractice = id => req('DELETE', `/todos/practices/${id}`)
export const setPracticeCheck = (id, data) => req('PUT', `/todos/practices/${id}/check`, data)
export const updateLifeProfile = data => req('PUT', '/todos/life-profile', data)
// Questionnaires
export const getQuestionnaireSession = data => req('POST', '/questionnaires/session', data)
export const getRequiredChanges = () => req('GET', '/questionnaires/required-changes')
export const saveQuestionnaireResult = data => req('POST', '/questionnaires/results', data)
export const getQuestionnaireResults = () => req('GET', '/questionnaires/results')
export const getLinkedQuestionnaires = fileId => req('GET', `/questionnaires/linked/${fileId}`)
export const generateQuestionnaireFromNote = fileId => req('POST', `/questionnaires/generate-from-note/${fileId}`)

// Knowledge graph
export const getKnowledgeGraph = () => req('GET', '/knowledge-graph')
export const getKnowledgeGraphReferences = fileId => req('GET', `/knowledge-graph/${fileId}/references`)
export const copyKnowledgeGraphBundle = data => req('POST', '/knowledge-graph/copy', data)

// Historical timeline
export const getHistoricalEvents = () => req('GET', '/historical-timeline')
export const createHistoricalEvent = data => req('POST', '/historical-timeline', data)
export const updateHistoricalEvent = (id, data) => req('PUT', `/historical-timeline/${id}`, data)
export const deleteHistoricalEvent = id => req('DELETE', `/historical-timeline/${id}`)

// Road trips (carnet de voyage)
export const getRoadTrips = () => req('GET', '/roadtrips')
export const createRoadTrip = data => req('POST', '/roadtrips', data)
export const updateRoadTrip = (id, data) => req('PUT', `/roadtrips/${id}`, data)
export const deleteRoadTrip = id => req('DELETE', `/roadtrips/${id}`)
export const reorderRoadTrips = ids => req('PUT', '/roadtrips/reorder/list', { ids })
export const geocodePlace = q => req('GET', `/roadtrips/geocode?q=${encodeURIComponent(q)}`)
export const previewRoadTripPlan = data => req('POST', '/roadtrips/import-plan/preview', data)
export const importRoadTripPlan = data => req('POST', '/roadtrips/import-plan', data)
export const uploadRoadTripPhoto = (tripId, blob, meta = {}) => {
  const fd = new FormData()
  fd.append('photo', blob, meta.filename || 'photo.jpg')
  if (meta.caption != null) fd.append('caption', meta.caption)
  if (meta.point_id) fd.append('point_id', meta.point_id)
  if (meta.lat != null) fd.append('lat', String(meta.lat))
  if (meta.lng != null) fd.append('lng', String(meta.lng))
  if (meta.width != null) fd.append('width', String(meta.width))
  if (meta.height != null) fd.append('height', String(meta.height))
  return req('POST', `/roadtrips/${tripId}/photos`, fd, true)
}
export const updateRoadTripPhoto = (photoId, data) => req('PUT', `/roadtrips/photos/${photoId}`, data)
export const deleteRoadTripPhoto = photoId => req('DELETE', `/roadtrips/photos/${photoId}`)
export const reorderRoadTripPhotos = (tripId, ids) => req('PUT', `/roadtrips/${tripId}/photos/order`, { ids })
export const createRoadTripNote = (tripId, data) => req('POST', `/roadtrips/${tripId}/notes`, data)
export const updateRoadTripNote = (noteId, data) => req('PUT', `/roadtrips/notes/${noteId}`, data)
export const deleteRoadTripNote = noteId => req('DELETE', `/roadtrips/notes/${noteId}`)
export const exportRoadTripsJson = (embed = false) => {
  window.location.href = BASE + `/roadtrips/export${embed ? '?photos=embed' : ''}`
}
export const exportRoadTripGeoJson = id => {
  window.location.href = BASE + `/roadtrips/${id}/geojson`
}

// Social journal
export const getPublicArticle = id => req('GET', `/public/social-journal/articles/${encodeURIComponent(id)}`)
export const markPublicArticleRead = id => req('POST', `/public/social-journal/articles/${encodeURIComponent(id)}/read`, {})
export const getArticles = ({ scope = 'feed', q = '', date = '' } = {}) => {
  const p = new URLSearchParams()
  p.set('scope', scope)
  if (q) p.set('q', q)
  if (date) p.set('date', date)
  return req('GET', `/social-journal/articles?${p}`)
}
export const getArticle = id => req('GET', `/social-journal/articles/${id}`)
export const createArticle = data => req('POST', '/social-journal/articles', data)
export const updateArticle = (id, data) => req('PUT', `/social-journal/articles/${id}`, data)
export const deleteArticle = id => req('DELETE', `/social-journal/articles/${id}`)
export const toggleArticleReaction = id => req('POST', `/social-journal/articles/${id}/reaction`)
export const markArticleRead = id => req('POST', `/social-journal/articles/${id}/read`)
export const getArticleComments = id => req('GET', `/social-journal/articles/${id}/comments`)
export const createArticleComment = (id, body, parent_id = null) => req('POST', `/social-journal/articles/${id}/comments`, { body, parent_id })
export const deleteArticleComment = id => req('DELETE', `/social-journal/comments/${id}`)

// Timer
export const getTimerSessions = file_id =>
  req('GET', `/timer${file_id ? `?file_id=${file_id}` : ''}`)
export const getTimerStats = () => req('GET', '/timer/stats')
export const saveTimerSession = data => req('POST', '/timer', data)
export const deleteTimerSession = id => req('DELETE', `/timer/${id}`)
export const getAppUsage = day => req('GET', `/timer/app-usage?day=${encodeURIComponent(day)}`)
export const trackAppUsage = entries => req('POST', '/timer/app-usage', { entries })
