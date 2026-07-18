import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../context/useApp'
import Icon from './Icons'

export function useFileHistoryActions({ flushPending, applyContent, hasPending = false, disabled = false }) {
  const { openFileId, fileHistory, undoFile, redoFile, toast } = useApp()
  const [busy, setBusy] = useState(false)
  const latestRef = useRef({ flushPending, applyContent, openFileId, busy, availability: {} })
  const storedAvailability = fileHistory[openFileId] || { canUndo: false, canRedo: false }
  const availability = {
    canUndo: !disabled && (storedAvailability.canUndo || hasPending),
    canRedo: !disabled && storedAvailability.canRedo && !hasPending,
  }
  latestRef.current = { flushPending, applyContent, openFileId, busy, availability }

  const step = useCallback(async (direction) => {
    const latest = latestRef.current
    if (disabled || !latest.openFileId || latest.busy) return
    const allowed = direction === 'undo' ? latest.availability.canUndo : latest.availability.canRedo
    setBusy(true)
    try {
      const saved = await latest.flushPending?.()
      if (!allowed && !saved) return
      const result = direction === 'undo'
        ? await undoFile(latest.openFileId)
        : await redoFile(latest.openFileId)
      latest.applyContent(result.content || '')
    } catch (err) {
      if (!err.alreadyToasted) toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }, [disabled, redoFile, toast, undoFile])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (disabled) return
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      const direction = key === 'y' || (key === 'z' && event.shiftKey) ? 'redo' : key === 'z' ? 'undo' : null
      if (!direction) return
      event.preventDefault()
      step(direction)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [disabled, step])

  return {
    busy,
    canUndo: availability.canUndo,
    canRedo: availability.canRedo,
    undo: () => step('undo'),
    redo: () => step('redo'),
  }
}

export default function FileHistoryControls({ history }) {
  return (
    <div className="file-history-controls" aria-label="Historique du fichier">
      <button
        type="button"
        onClick={history.undo}
        disabled={history.busy || !history.canUndo}
        title="Annuler la dernière étape (Ctrl+Z)"
        aria-label="Annuler"
      >
        <Icon name="undo" size={16} />
      </button>
      <button
        type="button"
        onClick={history.redo}
        disabled={history.busy || !history.canRedo}
        title="Rétablir l’étape (Ctrl+Shift+Z ou Ctrl+Y)"
        aria-label="Rétablir"
      >
        <Icon name="redo" size={16} />
      </button>
    </div>
  )
}
