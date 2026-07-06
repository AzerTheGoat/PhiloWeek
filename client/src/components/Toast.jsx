import { useApp } from '../context/useApp'

export default function Toast() {
  const { toasts } = useApp()
  if (!toasts.length) return null

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.type === 'error' && '⚠ '}
          {t.type === 'success' && '✓ '}
          {t.message}
        </div>
      ))}
    </div>
  )
}
