import { useEffect } from 'react'

const positions = new Map()
const MAX_SAVED_POSITIONS = 500

export function useFileScrollRestoration(fileId, pane, ref, enabled = true, restore = true) {
  useEffect(() => {
    const element = ref.current
    if (!enabled || !fileId || !element) return undefined

    const key = `${fileId}:${pane}`
    const saved = restore ? positions.get(key) : null
    const frame = requestAnimationFrame(() => {
      if (!saved) return
      element.scrollTop = saved.top
      element.scrollLeft = saved.left
    })

    const remember = () => savePosition(key, element)
    element.addEventListener('scroll', remember, { passive: true })

    return () => {
      cancelAnimationFrame(frame)
      element.removeEventListener('scroll', remember)
      savePosition(key, element)
    }
  }, [enabled, fileId, pane, ref, restore])
}

function savePosition(key, element) {
  if (positions.size >= MAX_SAVED_POSITIONS && !positions.has(key)) {
    positions.delete(positions.keys().next().value)
  }
  positions.set(key, {
    top: Math.max(0, element.scrollTop || 0),
    left: Math.max(0, element.scrollLeft || 0),
  })
}
