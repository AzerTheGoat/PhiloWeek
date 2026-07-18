import { useEffect, useState } from 'react'
import { useApp } from '../context/useApp'
import Icon from './Icons'
import * as api from '../api'

export default function ShareModal({ modal, hideModal }) {
  const { toast } = useApp()
  const file = modal.data
  const [shares, setShares] = useState([])
  const [username, setUsername] = useState('')
  const [permission, setPermission] = useState('view')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    try { setShares(await api.getFileShares(file.id)) }
    catch (err) { toast(err.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [file.id])

  const addShare = async (event) => {
    event.preventDefault()
    if (!username.trim() || submitting) return
    setSubmitting(true)
    try {
      await api.shareFile(file.id, username.trim(), permission)
      setUsername('')
      await load()
      toast(`Partage mis à jour pour ${username.trim()}`)
    } catch (err) { toast(err.message, 'error') }
    finally { setSubmitting(false) }
  }

  const updatePermission = async (share, nextPermission) => {
    try {
      await api.updateFileShare(file.id, share.id, nextPermission)
      setShares(current => current.map(item => item.id === share.id ? { ...item, permission: nextPermission } : item))
      toast('Droit mis à jour')
    } catch (err) { toast(err.message, 'error') }
  }

  const remove = async (share) => {
    if (!window.confirm(`Retirer l’accès de ${share.username} ?`)) return
    try {
      await api.removeFileShare(file.id, share.id)
      setShares(current => current.filter(item => item.id !== share.id))
      toast('Accès retiré')
    } catch (err) { toast(err.message, 'error') }
  }

  return (
    <div className="modal share-modal">
      <div className="modal-header">
        <div>
          <h3>Partager « {String(file.name || '').replace(/\.(md|json|xlsx)$/i, '')} »</h3>
          <span className="share-modal-subtitle">Le partage d’un dossier inclut automatiquement tout son contenu.</span>
        </div>
        <button className="icon-btn" onClick={hideModal} aria-label="Fermer"><Icon name="close" size={17} /></button>
      </div>

      <div className="modal-body">
        <form className="share-form" onSubmit={addShare}>
          <label>
            Identifiant utilisateur
            <input
              autoFocus
              className="modal-input"
              value={username}
              onChange={event => setUsername(event.target.value)}
              placeholder="ex: marie_75"
              autoComplete="off"
            />
          </label>
          <label>
            Droit
            <select value={permission} onChange={event => setPermission(event.target.value)}>
              <option value="view">Lecture seule</option>
              <option value="edit">Peut modifier</option>
            </select>
          </label>
          <button type="submit" className="btn-primary" disabled={!username.trim() || submitting}>
            <Icon name="plus" size={16} /> {submitting ? 'Partage…' : 'Partager'}
          </button>
        </form>

        <div className="share-security-note">
          <Icon name="alert" size={16} />
          <span>Seul le propriétaire peut supprimer, déplacer, verrouiller ou repartager. Les modifications concurrentes ne s’écrasent jamais silencieusement.</span>
        </div>

        <div className="share-list">
          <h4>Personnes ayant accès</h4>
          {loading ? <p className="modal-hint">Chargement…</p> : shares.length === 0 ? (
            <p className="modal-hint">Cet élément n’est partagé avec personne.</p>
          ) : shares.map(share => (
            <div className="share-person" key={share.id}>
              <span className="share-avatar">{share.username.slice(0, 1).toUpperCase()}</span>
              <strong>
                {share.username}
                {Boolean(share.is_inherited) && <small>Hérité de « {share.source_name} »</small>}
              </strong>
              <select disabled={Boolean(share.is_inherited)} value={share.permission} onChange={event => updatePermission(share, event.target.value)}>
                <option value="view">Lecture seule</option>
                <option value="edit">Peut modifier</option>
              </select>
              <button type="button" className="btn-danger" disabled={Boolean(share.is_inherited)} onClick={() => remove(share)}>
                {share.is_inherited ? 'Hérité' : 'Retirer'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
