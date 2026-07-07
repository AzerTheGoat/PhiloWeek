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
export const deleteFile = id => req('DELETE', `/files/${id}`)
export const moveFile = (id, parent_id, sort_order) => req('PUT', `/files/${id}/move`, { parent_id, sort_order })
export const unlockFolder = (id, password) => req('POST', `/files/${id}/unlock`, { password })
export const lockFolder = (id, password) => req('POST', `/files/${id}/lock`, { password })

// Export / Import
export const exportObsidian = () => {
  window.location.href = BASE + '/export/obsidian'
}
export const importObsidian = (file, conflict = 'rename') => {
  const fd = new FormData()
  fd.append('vault', file)
  fd.append('conflict', conflict)
  return req('POST', '/import/obsidian', fd, true)
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
// Questionnaires
export const getQuestionnaireSession = data => req('POST', '/questionnaires/session', data)
export const saveQuestionnaireResult = data => req('POST', '/questionnaires/results', data)
export const getQuestionnaireResults = () => req('GET', '/questionnaires/results')
export const getLinkedQuestionnaires = fileId => req('GET', `/questionnaires/linked/${fileId}`)

// Knowledge graph
export const getKnowledgeGraph = () => req('GET', '/knowledge-graph')
export const getKnowledgeGraphReferences = fileId => req('GET', `/knowledge-graph/${fileId}/references`)
export const copyKnowledgeGraphBundle = data => req('POST', '/knowledge-graph/copy', data)

// Timer
export const getTimerSessions = file_id =>
  req('GET', `/timer${file_id ? `?file_id=${file_id}` : ''}`)
export const getTimerStats = () => req('GET', '/timer/stats')
export const saveTimerSession = data => req('POST', '/timer', data)
export const deleteTimerSession = id => req('DELETE', `/timer/${id}`)
