import { useState, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import * as api from '../api'

export default function FileTree({ nodes, depth = 0 }) {
  return (
    <ul className={`file-tree ${depth === 0 ? 'root' : ''}`}>
      {nodes.map(node => (
        <FileNode key={node.id} node={node} depth={depth} />
      ))}
    </ul>
  )
}

function FileNode({ node, depth }) {
  const {
    openFileId, openFile, loadTree, toast, showContextMenu, showModal, dispatch
  } = useApp()
  const [expanded, setExpanded] = useState(depth === 0)
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState(node.name)
  const [unlocking, setUnlocking] = useState(false)
  const [password, setPassword] = useState('')

  const isFolder = node.type === 'folder' || node.type === 'locked_folder'
  const isLocked = node.type === 'locked_folder'
  const isActive = node.id === openFileId
  const children = node.children || []

  const handleClick = useCallback(async () => {
    if (isLocked) {
      setUnlocking(true)
      return
    }
    if (isFolder) {
      setExpanded(e => !e)
    } else {
      openFile(node.id)
    }
  }, [isFolder, isLocked, openFile, node.id])

  const handleContextMenu = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    const items = isFolder
      ? [
          { icon: '📄', label: 'Nouveau fichier ici', action: () => showModal('new-file', { parent_id: node.id }) },
          { icon: '📁', label: 'Nouveau dossier ici', action: () => showModal('new-folder', { parent_id: node.id }) },
          { separator: true },
          { icon: '✏', label: 'Renommer', action: () => setRenaming(true) },
          !isLocked && { icon: '🔒', label: 'Verrouiller…', action: () => showModal('lock-folder', { id: node.id }) },
          isLocked && { icon: '🔓', label: 'Déverrouiller…', action: () => setUnlocking(true) },
          { separator: true },
          node.name !== 'Journal' && { icon: '🗑', label: 'Supprimer', danger: true, action: () => handleDelete() },
        ].filter(Boolean)
      : [
          { icon: '✏', label: 'Renommer', action: () => setRenaming(true) },
          { icon: '🗑', label: 'Supprimer', danger: true, action: () => handleDelete() },
        ]
    showContextMenu(e.clientX, e.clientY, items)
  }, [isFolder, isLocked, node, showModal, showContextMenu])

  const handleDelete = useCallback(async () => {
    if (!confirm(`Supprimer "${node.name}" ?`)) return
    try {
      await api.deleteFile(node.id)
      await loadTree()
      toast(`"${node.name}" supprimé`)
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [node, loadTree, toast])

  const handleRename = useCallback(async () => {
    if (!renameVal.trim() || renameVal === node.name) { setRenaming(false); return }
    try {
      await api.updateFile(node.id, { name: renameVal.trim() })
      await loadTree()
      toast('Renommé')
    } catch (err) {
      toast(err.message, 'error')
    }
    setRenaming(false)
  }, [renameVal, node, loadTree, toast])

  const handleUnlock = useCallback(async (e) => {
    e.preventDefault()
    try {
      await api.unlockFolder(node.id, password)
      setExpanded(true)
      setUnlocking(false)
      toast('Dossier déverrouillé')
    } catch {
      toast('Mot de passe incorrect', 'error')
    }
    setPassword('')
  }, [node.id, password, toast])

  const icon = isLocked ? '🔒' : isFolder ? (expanded ? '▾' : '▸') : '📄'

  return (
    <li className={`file-node ${isActive ? 'active' : ''}`}>
      {renaming ? (
        <form
          className="rename-form"
          onSubmit={e => { e.preventDefault(); handleRename() }}
        >
          <input
            autoFocus
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onBlur={handleRename}
            onKeyDown={e => e.key === 'Escape' && setRenaming(false)}
            className="rename-input"
          />
        </form>
      ) : (
        <div
          className={`file-row ${isFolder ? 'is-folder' : ''} ${isLocked ? 'is-locked' : ''}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          title={node.name}
        >
          <span className="file-icon">{icon}</span>
          <span className="file-name">{node.name.replace(/\.md$/i, '')}</span>
        </div>
      )}

      {unlocking && (
        <form className="unlock-form" onSubmit={handleUnlock}>
          <input
            autoFocus
            type="password"
            placeholder="Mot de passe…"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && setUnlocking(false)}
          />
          <button type="submit">Ouvrir</button>
          <button type="button" onClick={() => setUnlocking(false)}>✕</button>
        </form>
      )}

      {isFolder && expanded && children.length > 0 && (
        <FileTree nodes={children} depth={depth + 1} />
      )}

      {isFolder && expanded && children.length === 0 && !isLocked && (
        <div className="folder-empty" style={{ paddingLeft: `${28 + depth * 16}px` }}>
          vide
        </div>
      )}
    </li>
  )
}
