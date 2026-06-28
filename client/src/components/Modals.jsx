import { useState } from 'react'
import { useApp } from '../context/AppContext'
import * as api from '../api'

export default function Modals() {
  const { modal, hideModal } = useApp()
  if (!modal) return null

  const props = { modal, hideModal }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && hideModal()}>
      {modal.type === 'new-file' && <NewFileModal {...props} />}
      {modal.type === 'new-folder' && <NewFolderModal {...props} />}
      {modal.type === 'lock-folder' && <LockFolderModal {...props} />}
    </div>
  )
}

function NewFileModal({ modal, hideModal }) {
  const { loadTree, openFile, toast } = useApp()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || submitting) return
    setSubmitting(true)
    const fileName = name.trim().endsWith('.md') ? name.trim() : name.trim() + '.md'
    try {
      const f = await api.createFile({
        parent_id: modal.data?.parent_id || null,
        name: fileName,
        type: 'file',
        content: `---\ntitle: ${name.trim()}\ntags: []\ncreated: ${new Date().toISOString()}\n---\n\n`
      })
      await loadTree()
      await openFile(f.id)
      hideModal()
      toast(`"${fileName}" créé`)
    } catch (err) {
      toast(err.message, 'error')
      setSubmitting(false)
    }
  }

  return (
    <div className="modal">
      <div className="modal-header">
        <h3>Nouveau fichier</h3>
        <button className="icon-btn" onClick={hideModal}>✕</button>
      </div>
      <form onSubmit={handleSubmit} className="modal-body">
        <input
          autoFocus
          type="text"
          placeholder="Nom du fichier"
          value={name}
          onChange={e => setName(e.target.value)}
          className="modal-input"
        />
        {modal.data?.parent_id && (
          <p className="modal-hint">Sera créé dans le dossier sélectionné</p>
        )}
        <div className="modal-actions">
          <button type="submit" className="btn-primary" disabled={!name.trim() || submitting}>
            {submitting ? 'Création…' : 'Créer'}
          </button>
          <button type="button" className="btn-ghost" onClick={hideModal}>Annuler</button>
        </div>
      </form>
    </div>
  )
}

function NewFolderModal({ modal, hideModal }) {
  const { loadTree, toast } = useApp()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || submitting) return
    setSubmitting(true)
    try {
      await api.createFile({
        parent_id: modal.data?.parent_id || null,
        name: name.trim(),
        type: 'folder'
      })
      await loadTree()
      hideModal()
      toast(`Dossier "${name.trim()}" créé`)
    } catch (err) {
      toast(err.message, 'error')
      setSubmitting(false)
    }
  }

  return (
    <div className="modal">
      <div className="modal-header">
        <h3>Nouveau dossier</h3>
        <button className="icon-btn" onClick={hideModal}>✕</button>
      </div>
      <form onSubmit={handleSubmit} className="modal-body">
        <input
          autoFocus
          type="text"
          placeholder="Nom du dossier"
          value={name}
          onChange={e => setName(e.target.value)}
          className="modal-input"
        />
        <div className="modal-actions">
          <button type="submit" className="btn-primary" disabled={!name.trim() || submitting}>
            {submitting ? 'Création…' : 'Créer'}
          </button>
          <button type="button" className="btn-ghost" onClick={hideModal}>Annuler</button>
        </div>
      </form>
    </div>
  )
}

function LockFolderModal({ modal, hideModal }) {
  const { loadTree, toast } = useApp()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (password !== confirm) { toast('Les mots de passe ne correspondent pas', 'error'); return }
    if (password.length < 4) { toast('Minimum 4 caractères', 'error'); return }
    setSubmitting(true)
    try {
      await api.lockFolder(modal.data.id, password)
      await loadTree()
      hideModal()
      toast('Dossier verrouillé')
    } catch (err) {
      toast(err.message, 'error')
      setSubmitting(false)
    }
  }

  return (
    <div className="modal">
      <div className="modal-header">
        <h3>🔒 Verrouiller le dossier</h3>
        <button className="icon-btn" onClick={hideModal}>✕</button>
      </div>
      <form onSubmit={handleSubmit} className="modal-body">
        <p className="modal-hint">
          Le contenu sera chiffré AES-256. Sans le mot de passe, les fichiers seront inaccessibles.
        </p>
        <input
          autoFocus
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="modal-input"
        />
        <input
          type="password"
          placeholder="Confirmer le mot de passe"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          className="modal-input"
        />
        <div className="modal-actions">
          <button type="submit" className="btn-danger" disabled={!password || !confirm || submitting}>
            {submitting ? 'Verrouillage…' : 'Verrouiller'}
          </button>
          <button type="button" className="btn-ghost" onClick={hideModal}>Annuler</button>
        </div>
      </form>
    </div>
  )
}
