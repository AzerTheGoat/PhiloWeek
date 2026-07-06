import { useEffect, useRef } from 'react'
import { useApp } from '../context/useApp'

export default function ContextMenu() {
  const { contextMenu, hideContextMenu } = useApp()
  const ref = useRef(null)

  useEffect(() => {
    if (!contextMenu || !ref.current) return
    const el = ref.current
    const { innerWidth: vw, innerHeight: vh } = window
    const r = el.getBoundingClientRect()
    if (contextMenu.x + r.width > vw) el.style.left = `${contextMenu.x - r.width}px`
    if (contextMenu.y + r.height > vh) el.style.top = `${contextMenu.y - r.height}px`
  }, [contextMenu])

  if (!contextMenu) return null

  return (
    <ul
      ref={ref}
      className="context-menu"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onClick={e => e.stopPropagation()}
    >
      {contextMenu.items.map((item, i) =>
        item.separator ? (
          <li key={i} className="context-separator" />
        ) : (
          <li
            key={i}
            className={`context-item ${item.danger ? 'danger' : ''}`}
            onClick={() => { item.action(); hideContextMenu() }}
          >
            {item.icon && <span className="context-icon">{item.icon}</span>}
            {item.label}
          </li>
        )
      )}
    </ul>
  )
}
