import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context/useApp'
import { createGraphMarkdown } from '../utils/graphFile'
import { createQuestionnaireJson } from '../utils/questionnaireFile'
import { createDefinitionsJson } from '../utils/definitionsFile'
import { createSpreadsheetJson } from '../utils/spreadsheetFile'
import * as api from '../api'
import ShareModal from './ShareModal'
import Icon from './Icons'

function shouldAutoFocus() {
  return true
}

function useModalFocus() {
  const ref = useRef(null)
  useEffect(() => {
    const id = requestAnimationFrame(() => ref.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [])
  return ref
}

export default function Modals() {
  const { modal, hideModal } = useApp()
  if (!modal) return null

  const props = { modal, hideModal }

  return (
    <div className="modal-overlay" data-focus-layer onClick={e => e.target === e.currentTarget && hideModal()}>
      {modal.type === 'new-file' && <NewFileModal {...props} />}
      {modal.type === 'new-graph' && <NewGraphModal {...props} />}
      {modal.type === 'new-questionnaire' && <NewQuestionnaireModal {...props} />}
      {modal.type === 'new-definitions' && <NewDefinitionsModal {...props} />}
      {modal.type === 'new-spreadsheet' && <NewSpreadsheetModal {...props} />}
      {modal.type === 'new-folder' && <NewFolderModal {...props} />}
      {modal.type === 'lock-folder' && <LockFolderModal {...props} />}
      {modal.type === 'account' && <AccountModal {...props} />}
      {modal.type === 'share-file' && <ShareModal {...props} />}
    </div>
  )
}

function NewSpreadsheetModal({ modal, hideModal }) {
  const { loadTree, openFile, toast } = useApp()
  const [name, setName] = useState('')
  const [importFile, setImportFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useModalFocus()

  const handleSubmit = async (event) => {
    event.preventDefault()
    if ((!name.trim() && !importFile) || submitting) return
    setSubmitting(true)
    try {
      let file
      if (importFile) {
        file = await api.importSpreadsheet(importFile, modal.data?.parent_id || null)
      } else {
        const baseName = name.trim().replace(/\.xlsx$/i, '')
        file = await api.createFile({
          parent_id: modal.data?.parent_id || null,
          name: `${baseName}.xlsx`,
          type: 'file',
          content: createSpreadsheetJson(baseName),
        })
      }
      await loadTree()
      await openFile(file.id)
      hideModal()
      toast(importFile ? `Classeur « ${file.name} » importé` : `Classeur « ${file.name} » créé`)
    } catch (err) {
      toast(err.message, 'error')
      setSubmitting(false)
    }
  }

  return (
    <div className="modal spreadsheet-create-modal">
      <div className="modal-header">
        <h3>Nouveau tableur Excel</h3>
        <button className="icon-btn" onClick={hideModal}>×</button>
      </div>
      <form onSubmit={handleSubmit} className="modal-body">
        <input
          ref={inputRef}
          autoFocus={shouldAutoFocus()}
          type="text"
          placeholder="Nom du classeur"
          value={name}
          onChange={event => setName(event.target.value)}
          className="modal-input"
          disabled={Boolean(importFile)}
        />
        <div className="spreadsheet-import-divider"><span>ou</span></div>
        <label className="spreadsheet-import-picker">
          <Icon name="upload" size={18} />
          <span>{importFile ? importFile.name : 'Importer un classeur .xlsx existant'}</span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={event => setImportFile(event.target.files?.[0] || null)}
          />
        </label>
        {importFile && <button type="button" className="btn-ghost" onClick={() => setImportFile(null)}>Retirer le fichier</button>}
        <p className="modal-hint">Le tableur prend en charge plusieurs feuilles, les formules, la mise en forme, l’historique et le partage cloud.</p>
        <div className="modal-actions">
          <button type="submit" className="btn-primary" disabled={(!name.trim() && !importFile) || submitting}>
            {submitting ? 'Préparation…' : importFile ? 'Importer' : 'Créer'}
          </button>
          <button type="button" className="btn-ghost" onClick={hideModal}>Annuler</button>
        </div>
      </form>
    </div>
  )
}

function NewDefinitionsModal({ modal, hideModal }) {
  const { loadTree, openFile, toast } = useApp()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useModalFocus()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || submitting) return
    setSubmitting(true)
    const baseName = name.trim()
    const fileName = baseName.endsWith('.json') ? baseName : `${baseName}.json`
    const title = baseName.replace(/\.json$/i, '')
    try {
      const f = await api.createFile({
        parent_id: modal.data?.parent_id || null,
        name: fileName,
        type: 'file',
        content: createDefinitionsJson(title),
      })
      await loadTree()
      await openFile(f.id)
      hideModal()
      toast(`Definitions "${fileName}" creees`)
    } catch (err) {
      toast(err.message, 'error')
      setSubmitting(false)
    }
  }

  return (
    <div className="modal">
      <div className="modal-header">
        <h3>Nouvelles definitions</h3>
        <button className="icon-btn" onClick={hideModal}>x</button>
      </div>
      <form onSubmit={handleSubmit} className="modal-body">
        <input
          ref={inputRef}
          autoFocus={shouldAutoFocus()}
          type="text"
          placeholder="Nom de la fiche"
          value={name}
          onChange={e => setName(e.target.value)}
          className="modal-input"
        />
        <p className="modal-hint">Cree une fiche de mots et definitions, compatible avec la revision.</p>
        <div className="modal-actions">
          <button type="submit" className="btn-primary" disabled={!name.trim() || submitting}>
            {submitting ? 'Creation...' : 'Creer'}
          </button>
          <button type="button" className="btn-ghost" onClick={hideModal}>Annuler</button>
        </div>
      </form>
    </div>
  )
}

function NewQuestionnaireModal({ modal, hideModal }) {
  const { loadTree, openFile, toast } = useApp()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useModalFocus()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || submitting) return
    setSubmitting(true)
    const baseName = name.trim()
    const fileName = baseName.endsWith('.json') ? baseName : `${baseName}.json`
    const title = baseName.replace(/\.json$/i, '')
    try {
      const f = await api.createFile({
        parent_id: modal.data?.parent_id || null,
        name: fileName,
        type: 'file',
        content: createQuestionnaireJson(title),
      })
      await loadTree()
      await openFile(f.id)
      hideModal()
      toast(`Questionnaire "${fileName}" cree`)
    } catch (err) {
      toast(err.message, 'error')
      setSubmitting(false)
    }
  }

  return (
    <div className="modal">
      <div className="modal-header">
        <h3>Nouveau questionnaire</h3>
        <button className="icon-btn" onClick={hideModal}>x</button>
      </div>
      <form onSubmit={handleSubmit} className="modal-body">
        <input
          ref={inputRef}
          autoFocus={shouldAutoFocus()}
          type="text"
          placeholder="Nom du questionnaire"
          value={name}
          onChange={e => setName(e.target.value)}
          className="modal-input"
        />
        <p className="modal-hint">Cree un fichier JSON de questions, compatible revision random.</p>
        <div className="modal-actions">
          <button type="submit" className="btn-primary" disabled={!name.trim() || submitting}>
            {submitting ? 'Creation...' : 'Creer'}
          </button>
          <button type="button" className="btn-ghost" onClick={hideModal}>Annuler</button>
        </div>
      </form>
    </div>
  )
}

function NewGraphModal({ modal, hideModal }) {
  const { loadTree, openFile, toast } = useApp()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useModalFocus()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || submitting) return
    setSubmitting(true)
    const baseName = name.trim()
    const fileName = baseName.endsWith('.md') ? baseName : `${baseName}.md`
    const title = baseName.replace(/\.md$/i, '')
    try {
      const f = await api.createFile({
        parent_id: modal.data?.parent_id || null,
        name: fileName,
        type: 'file',
        content: createGraphMarkdown(title),
      })
      await loadTree()
      await openFile(f.id)
      hideModal()
      toast(`Graphe "${fileName}" cree`)
    } catch (err) {
      toast(err.message, 'error')
      setSubmitting(false)
    }
  }

  return (
    <div className="modal">
      <div className="modal-header">
        <h3>Nouveau graphe</h3>
        <button className="icon-btn" onClick={hideModal}>x</button>
      </div>
      <form onSubmit={handleSubmit} className="modal-body">
        <input
          ref={inputRef}
          autoFocus={shouldAutoFocus()}
          type="text"
          placeholder="Nom du graphe"
          value={name}
          onChange={e => setName(e.target.value)}
          className="modal-input"
        />
        <p className="modal-hint">Cree une carte visuelle pour organiser idees, objectifs, questions et ressources.</p>
        <div className="modal-actions">
          <button type="submit" className="btn-primary" disabled={!name.trim() || submitting}>
            {submitting ? 'Creation...' : 'Creer'}
          </button>
          <button type="button" className="btn-ghost" onClick={hideModal}>Annuler</button>
        </div>
      </form>
    </div>
  )
}

function NewFileModal({ modal, hideModal }) {
  const { loadTree, openFile, toast } = useApp()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useModalFocus()

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
      await openFile(f.id, { editorMode: 'split' })
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
          ref={inputRef}
          autoFocus={shouldAutoFocus()}
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
  const inputRef = useModalFocus()

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
          ref={inputRef}
          autoFocus={shouldAutoFocus()}
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
  const inputRef = useModalFocus()

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
          ref={inputRef}
          autoFocus={shouldAutoFocus()}
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

function AccountModal({ hideModal }) {
  const { currentUser, logout, toast } = useApp()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useModalFocus()

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (newPassword !== confirm) { toast('Les mots de passe ne correspondent pas', 'error'); return }
    if (newPassword.length < 10) { toast('Minimum 10 caractères', 'error'); return }
    setSubmitting(true)
    try {
      await api.authChangePassword(currentPassword, newPassword)
      toast('Mot de passe modifié')
      setCurrentPassword('')
      setNewPassword('')
      setConfirm('')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = async () => {
    hideModal()
    await logout()
  }

  return (
    <div className="modal">
      <div className="modal-header">
        <h3>Compte</h3>
        <button className="icon-btn" onClick={hideModal}>✕</button>
      </div>
      <div className="modal-body">
        <p className="modal-hint">Connecté en tant que <strong>{currentUser?.username}</strong></p>
        <form onSubmit={handleChangePassword} className="modal-body" style={{ padding: 0 }}>
          <input
            ref={inputRef}
            autoFocus={shouldAutoFocus()}
            type="password"
            placeholder="Mot de passe actuel"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            className="modal-input"
            autoComplete="current-password"
          />
          <input
            type="password"
            placeholder="Nouveau mot de passe (min. 10 caractères)"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="modal-input"
            autoComplete="new-password"
          />
          <input
            type="password"
            placeholder="Confirmer le nouveau mot de passe"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className="modal-input"
            autoComplete="new-password"
          />
          <div className="modal-actions">
            <button type="submit" className="btn-primary" disabled={!currentPassword || !newPassword || !confirm || submitting}>
              {submitting ? 'Modification…' : 'Changer le mot de passe'}
            </button>
          </div>
        </form>
        <div className="modal-actions">
          <button type="button" className="btn-danger" onClick={handleLogout}>Se déconnecter</button>
        </div>
      </div>
    </div>
  )
}
