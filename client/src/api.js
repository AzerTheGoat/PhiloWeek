const BASE = '/api'

async function req(method, path, body, isFormData = false) {
  const opts = { method, headers: {} }
  if (body && !isFormData) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  } else if (body) {
    opts.body = body
  }
  const res = await fetch(BASE + path, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

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

// AI
export const getAIModels = () => req('GET', '/ai/models')
export const estimateAI = data => req('POST', '/ai/estimate', data)
export const generateAI = (file_id, mode, options = {}) =>
  req('POST', '/ai/generate', { file_id, mode, ...options })
export const activeAI = paragraph => req('POST', '/ai/active', { paragraph })

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

// Timer
export const getTimerSessions = file_id =>
  req('GET', `/timer${file_id ? `?file_id=${file_id}` : ''}`)
export const getTimerStats = () => req('GET', '/timer/stats')
export const saveTimerSession = data => req('POST', '/timer', data)
export const deleteTimerSession = id => req('DELETE', `/timer/${id}`)
