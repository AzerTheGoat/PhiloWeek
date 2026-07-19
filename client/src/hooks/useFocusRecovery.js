import { useEffect, useRef } from 'react'

const TEXT_INPUT_TYPES = new Set([
  'date', 'datetime-local', 'email', 'month', 'number', 'password',
  'search', 'tel', 'text', 'time', 'url', 'week',
])

function isEditable(element) {
  if (!(element instanceof HTMLElement) || !element.isConnected) return false
  if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly
  if (element instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has(element.type) && !element.disabled && !element.readOnly
  }
  return element.isContentEditable
}

function focusIfAvailable(element) {
  if (!isEditable(element)) return
  const active = document.activeElement
  // Une vue nouvellement ouverte peut avoir volontairement autofocus un autre
  // champ. Dans ce cas, ne pas lui voler le focus.
  if (isEditable(active)) return
  const openLayer = document.querySelector('[data-focus-layer]')
  if (openLayer && !element.closest('[data-focus-layer]')) return
  element.focus({ preventScroll: true })
}

/**
 * Rend le focus au champ utilise avant l'ouverture d'une surface temporaire.
 *
 * Le navigateur place souvent le focus sur <body> quand le bouton de fermeture
 * d'un panneau est demonte. Les frappes suivantes sont alors perdues jusqu'a un
 * rechargement (particulierement apres un dialogue fichier sur mobile/Chromium).
 * Les surfaces concernees portent l'attribut data-focus-layer.
 */
export default function useFocusRecovery() {
  const beforePointerRef = useRef(null)
  const beforePointerAtRef = useRef(0)
  const lastEditableRef = useRef(null)
  const returnTargetRef = useRef(null)
  const nativeDialogTargetRef = useRef(null)
  const layerCountRef = useRef(0)

  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return undefined

    let restoreFrame = null

    const currentEditable = () => isEditable(document.activeElement) ? document.activeElement : null
    const scheduleRestore = (target) => {
      if (restoreFrame !== null) cancelAnimationFrame(restoreFrame)
      restoreFrame = requestAnimationFrame(() => {
        restoreFrame = null
        focusIfAvailable(target)
      })
    }

    // Capture avant que l'action par defaut du pointerdown ne deplace le focus
    // de l'editeur vers le bouton qui ouvre le panneau.
    const rememberBeforePointer = () => {
      const editable = currentEditable()
      if (editable) {
        beforePointerRef.current = editable
        beforePointerAtRef.current = Date.now()
      }
    }

    const rememberEditable = (event) => {
      if (isEditable(event.target) && !event.target.closest('[data-focus-layer]')) {
        lastEditableRef.current = event.target
      }
    }

    const recentPointerTarget = () => Date.now() - beforePointerAtRef.current < 1500
      ? beforePointerRef.current
      : null

    const syncLayers = () => {
      const nextCount = root.querySelectorAll('[data-focus-layer]').length
      const previousCount = layerCountRef.current

      if (previousCount === 0 && nextCount > 0) {
        returnTargetRef.current = currentEditable() || recentPointerTarget() || lastEditableRef.current
      } else if (previousCount > 0 && nextCount === 0) {
        const target = returnTargetRef.current
        returnTargetRef.current = null
        scheduleRestore(target)
      }

      layerCountRef.current = nextCount
    }

    const onWindowBlur = () => {
      nativeDialogTargetRef.current = currentEditable() || recentPointerTarget() || lastEditableRef.current
    }
    const onWindowFocus = () => {
      const target = nativeDialogTargetRef.current
      nativeDialogTargetRef.current = null
      scheduleRestore(target)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && nativeDialogTargetRef.current) onWindowFocus()
    }

    document.addEventListener('pointerdown', rememberBeforePointer, true)
    document.addEventListener('focusin', rememberEditable, true)
    window.addEventListener('blur', onWindowBlur)
    window.addEventListener('focus', onWindowFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)

    const observer = new MutationObserver(syncLayers)
    observer.observe(root, { childList: true, subtree: true })
    syncLayers()

    return () => {
      document.removeEventListener('pointerdown', rememberBeforePointer, true)
      document.removeEventListener('focusin', rememberEditable, true)
      window.removeEventListener('blur', onWindowBlur)
      window.removeEventListener('focus', onWindowFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      observer.disconnect()
      if (restoreFrame !== null) cancelAnimationFrame(restoreFrame)
    }
  }, [])
}
