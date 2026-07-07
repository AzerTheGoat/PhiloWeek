import { useState, useCallback } from 'react'
import { useApp } from '../context/useApp'
import * as api from '../api'

export default function FileTree({ nodes, depth = 0, dragState, setDragState, dropTargetId, setDropTargetId }) {
  const [localDragState, setLocalDragState] = useState(null)
  const [localDropTargetId, setLocalDropTargetId] = useState(null)
  const currentDragState = dragState ?? localDragState
  const updateDragState = setDragState ?? setLocalDragState
  const currentDropTargetId = dropTargetId ?? localDropTargetId
  const updateDropTargetId = setDropTargetId ?? setLocalDropTargetId

  return (
    <ul className={`file-tree ${depth === 0 ? 'root' : ''}`}>
      {nodes.map(node => (
        <FileNode
          key={node.id}
          node={node}
          depth={depth}
          dragState={currentDragState}
          setDragState={updateDragState}
          dropTargetId={currentDropTargetId}
          setDropTargetId={updateDropTargetId}
        />
      ))}
    </ul>
  )
}

function FileNode({ node, depth, dragState, setDragState, dropTargetId, setDropTargetId }) {
  const {
    openFileId, openFile, loadTree, deleteFile, toast, showContextMenu, showModal, dispatch
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
  const isDragging = dragState?.id === node.id
  const canReceiveDrop = Boolean(
    dragState &&
    isFolder &&
    !isLocked &&
    dragState.id !== node.id &&
    dragState.parent_id !== node.id &&
    !dragState.descendantIds?.includes(node.id)
  )
  const isDropTarget = canReceiveDrop && dropTargetId === node.id

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

  const handleDragStart = useCallback((e) => {
    if (renaming || unlocking) {
      e.preventDefault()
      return
    }
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', node.id)
    setDragState({
      id: node.id,
      parent_id: node.parent_id,
      type: node.type,
      name: node.name,
      descendantIds: collectDescendantIds(node),
    })
  }, [node, renaming, setDragState, unlocking])

  const handleDragEnd = useCallback(() => {
    setDragState(null)
    setDropTargetId(null)
  }, [setDragState, setDropTargetId])

  const handleDragOver = useCallback((e) => {
    if (!canReceiveDrop) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDropTargetId(node.id)
  }, [canReceiveDrop, node.id, setDropTargetId])

  const handleDragLeave = useCallback((e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    if (dropTargetId === node.id) setDropTargetId(null)
  }, [dropTargetId, node.id, setDropTargetId])

  const handleDrop = useCallback(async (e) => {
    if (!canReceiveDrop) return
    e.preventDefault()
    e.stopPropagation()
    try {
      await api.moveFile(dragState.id, node.id, 0)
      setExpanded(true)
      await loadTree()
      toast(`"${dragState.name}" déplacé dans "${node.name}"`)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setDragState(null)
      setDropTargetId(null)
    }
  }, [canReceiveDrop, dragState, loadTree, node.id, node.name, setDragState, setDropTargetId, toast])

  const handleContextMenu = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    const items = isFolder
      ? [
          { icon: '📄', label: 'Nouveau fichier ici', action: () => showModal('new-file', { parent_id: node.id }) },
          { icon: '◎', label: 'Nouveau graphe ici', action: () => showModal('new-graph', { parent_id: node.id }) },
          { icon: '📁', label: 'Nouveau dossier ici', action: () => showModal('new-folder', { parent_id: node.id }) },
          { separator: true },
          { icon: '✏', label: 'Renommer', action: () => setRenaming(true) },
          !isLocked && { icon: '🔒', label: 'Verrouiller…', action: () => showModal('lock-folder', { id: node.id }) },
          isLocked && { icon: '🔓', label: 'Déverrouiller…', action: () => setUnlocking(true) },
          { separator: true },
          { icon: '🗑', label: 'Supprimer', danger: true, action: () => handleDelete() },
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
      await deleteFile(node.id)
      toast(`"${node.name}" supprimé`)
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [deleteFile, node, toast])

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
      await loadTree()
      setExpanded(true)
      setUnlocking(false)
      toast('Dossier déverrouillé')
    } catch {
      toast('Mot de passe incorrect', 'error')
    }
    setPassword('')
  }, [node.id, password, loadTree, toast])

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
          className={`file-row ${isFolder ? 'is-folder' : ''} ${isLocked ? 'is-locked' : ''} ${isDragging ? 'is-dragging' : ''} ${isDropTarget ? 'is-drop-target' : ''}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          title={node.name}
        >
          <span className="file-icon">{icon}</span>
          <span className="file-name">{node.name.replace(/\.(md|json)$/i, '')}</span>
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
        <FileTree
          nodes={children}
          depth={depth + 1}
          dragState={dragState}
          setDragState={setDragState}
          dropTargetId={dropTargetId}
          setDropTargetId={setDropTargetId}
        />
      )}

      {isFolder && expanded && children.length === 0 && !isLocked && (
        <div className="folder-empty" style={{ paddingLeft: `${28 + depth * 16}px` }}>
          vide
        </div>
      )}
    </li>
  )
}

function collectDescendantIds(node) {
  const ids = []
  function walk(children = []) {
    children.forEach(child => {
      ids.push(child.id)
      walk(child.children)
    })
  }
  walk(node.children)
  return ids
}
