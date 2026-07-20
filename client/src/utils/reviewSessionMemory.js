const reviewSessions = new Map()
const MAX_REMEMBERED_SESSIONS = 200

function sessionKey(kind, fileId) {
  return fileId ? `${kind}:${fileId}` : null
}

export function loadReviewSession(kind, fileId) {
  const key = sessionKey(kind, fileId)
  return key ? reviewSessions.get(key) || null : null
}

export function saveReviewSession(kind, fileId, state) {
  const key = sessionKey(kind, fileId)
  if (!key) return

  if (!state?.session?.length) {
    reviewSessions.delete(key)
    return
  }

  reviewSessions.delete(key)
  reviewSessions.set(key, {
    session: state.session,
    currentIndex: state.currentIndex,
    answer: state.answer,
    revealed: state.revealed,
  })

  if (reviewSessions.size > MAX_REMEMBERED_SESSIONS) {
    reviewSessions.delete(reviewSessions.keys().next().value)
  }
}

export function clearReviewSessionMemory() {
  reviewSessions.clear()
}
