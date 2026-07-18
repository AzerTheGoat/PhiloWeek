import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../context/useApp'
import Icon from './Icons'
import * as api from '../api'

export default function Trash() {
  const { loadTree, toast } = useApp()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  const loadTrash = useCallback(async () => {
    setLoading(true)
    try { setItems(await api.getTrash()) }
    catch (err) { toast(err.message, 'error') }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { loadTrash() }, [loadTrash])

  const restore = async (item) => {
    setBusyId(item.id)
    try {
      const result = await api.restoreTrashItem(item.id)
      await Promise.all([loadTree(), loadTrash()])
      toast(`« ${result.name} » restauré`)
    } catch (err) { toast(err.message, 'error') }
    finally { setBusyId(null) }
  }

  const removeForever = async (item) => {
    const count = Number(item.descendant_count || 0)
    const suffix = count ? ` et ses ${count} élément(s)` : ''
    if (!window.confirm(`Supprimer définitivement « ${item.name} »${suffix} ?\n\nCette action est irréversible.`)) return
    setBusyId(item.id)
    try {
      await api.permanentlyDeleteTrashItem(item.id)
      await loadTrash()
      toast('Suppression définitive effectuée')
    } catch (err) { toast(err.message, 'error') }
    finally { setBusyId(null) }
  }

  const empty = async () => {
    if (!items.length) return
    if (!window.confirm(`Vider toute la corbeille (${items.length} élément(s)) ?\n\nTous les fichiers et dossiers seront supprimés définitivement.`)) return
    setBusyId('all')
    try {
      await api.emptyTrash()
      setItems([])
      toast('Corbeille vidée')
    } catch (err) { toast(err.message, 'error') }
    finally { setBusyId(null) }
  }

  return (
    <div className="trash-view">
      <div className="trash-header">
        <div>
          <h2>Corbeille</h2>
          <p>Les éléments sont supprimés automatiquement 30 jours après leur mise à la corbeille.</p>
        </div>
        <button type="button" className="btn-danger" onClick={empty} disabled={!items.length || busyId === 'all'}>
          <Icon name="trash" size={16} /> Vider la corbeille
        </button>
      </div>

      {loading ? (
        <div className="trash-empty">Chargement…</div>
      ) : items.length === 0 ? (
        <div className="trash-empty"><Icon name="trash" size={30} /><strong>La corbeille est vide</strong></div>
      ) : (
        <div className="trash-list">
          {items.map(item => {
            const count = Number(item.descendant_count || 0)
            return (
              <article className="trash-item" key={item.id}>
                <span className="trash-item-icon"><Icon name={item.type === 'file' ? 'file' : 'folder'} size={19} /></span>
                <div className="trash-item-info">
                  <strong>{item.name.replace(/\.(md|json|xlsx)$/i, '')}</strong>
                  <span>
                    Supprimé {formatDeletedDate(item.deleted_at)} · encore {remainingDays(item.deleted_at)} jour(s)
                    {count > 0 ? ` · ${count} élément(s) à l’intérieur` : ''}
                  </span>
                </div>
                <div className="trash-item-actions">
                  <button type="button" className="btn-ghost" disabled={busyId === item.id} onClick={() => restore(item)}>Restaurer</button>
                  <button type="button" className="btn-danger" disabled={busyId === item.id} onClick={() => removeForever(item)}>Supprimer définitivement</button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatDeletedDate(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'récemment'
  return `le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function remainingDays(value) {
  const deleted = new Date(value).getTime()
  if (!Number.isFinite(deleted)) return 30
  return Math.max(0, Math.ceil((deleted + 30 * 86400000 - Date.now()) / 86400000))
}
