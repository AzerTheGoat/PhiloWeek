import { useEffect, useRef } from 'react'

// Une lecture n'est validée qu'après un vrai engagement, pas un missclick :
// il faut ~10 s passées sur l'article (onglet actif) ET avoir scrollé un
// peu. Si l'article est trop court pour scroller, l'exigence de scroll est
// automatiquement satisfaite.
const READ_THRESHOLD_MS = 10000

export function useArticleReadTracker({
  articleId,
  enabled = true,
  alreadyRead = false,
  scrollElRef = null,
  onRead,
}) {
  const onReadRef = useRef(onRead)
  onReadRef.current = onRead

  useEffect(() => {
    if (!enabled || !articleId || alreadyRead) return undefined

    let elapsed = 0
    let scrolled = false
    let done = false

    const isScrollable = () => {
      const el = scrollElRef?.current
      const target = el || document.scrollingElement || document.documentElement
      return target.scrollHeight > target.clientHeight + 4
    }

    const maybeMark = () => {
      if (done) return
      const engaged = scrolled || !isScrollable()
      if (elapsed >= READ_THRESHOLD_MS && engaged) {
        done = true
        cleanup()
        onReadRef.current?.()
      }
    }

    const onScroll = () => { scrolled = true; maybeMark() }
    const interval = setInterval(() => {
      if (document.hidden) return
      elapsed += 1000
      maybeMark()
    }, 1000)
    // Capture : les événements scroll ne bouillonnent pas, mais la phase de
    // capture au niveau document les intercepte quel que soit le conteneur.
    document.addEventListener('scroll', onScroll, true)

    function cleanup() {
      clearInterval(interval)
      document.removeEventListener('scroll', onScroll, true)
    }
    return cleanup
  }, [articleId, enabled, alreadyRead, scrollElRef])
}

// Identifiant anonyme stable par appareil, pour dédupliquer les lectures des
// visiteurs sans compte (lien public). Stocké en localStorage.
export function getAnonReaderId() {
  const KEY = 'pw-anon-reader-id'
  try {
    let id = localStorage.getItem(KEY)
    if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
      id = randomId()
      localStorage.setItem(KEY, id)
    }
    return id
  } catch (_) {
    return randomId()
  }
}

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replace(/-/g, '')
  return `a${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}
