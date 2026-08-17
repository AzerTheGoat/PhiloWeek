import { useState, useCallback } from 'react'
import { useApp } from '../context/useApp'
import * as api from '../api'

export default function FileTree({
  nodes, depth = 0, dragState, setDragState, dropTargetId, setDropTargetId,
  selectionMode = false, selectedIds = new Set(), onToggleSelected,
}) {
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
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelected={onToggleSelected}
        />
      ))}
    </ul>
  )
}

function FileNode({
  node, depth, dragState, setDragState, dropTargetId, setDropTargetId,
  selectionMode, selectedIds, onToggleSelected,
}) {
  const {
    openFileId, openFile, loadTree, deleteFile, toast, showContextMenu, showModal, dispatch
  } = useApp()
  const [expanded, setExpanded] = useState(depth === 0)
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState(node.name)
  const [unlocking, setUnlocking] = useState(false)
  const [password, setPassword] = useState('')

  const isFolder = node.type === 'folder' || node.type === 'locked_folder'
  const isEncrypted = Boolean(node.is_encrypted)
  const isLegacyLocked = node.type === 'locked_folder'
  const isLocked = isLegacyLocked || Boolean(node.is_locked)
  const isInsideEncrypted = Boolean(node.encrypted_folder_id)
  const isOwner = node.is_owner !== false
  const canEdit = node.can_edit !== false
  const isActive = node.id === openFileId
  const children = node.children || []
  const isDragging = dragState?.id === node.id
  const canReceiveDrop = Boolean(
    dragState &&
    isOwner &&
    dragState.isOwner !== false &&
    isFolder &&
    !isLocked &&
    dragState.id !== node.id &&
    dragState.parent_id !== node.id &&
    !dragState.descendantIds?.includes(node.id)
  )
  const isDropTarget = canReceiveDrop && dropTargetId === node.id
  const isSelected = selectedIds.has(node.id)
  const canSelect = isOwner && !isLocked

  const handleClick = useCallback(async () => {
    if (selectionMode) {
      if (canSelect) onToggleSelected?.(node.id)
      return
    }
    if (isLocked) {
      if (isOwner) setUnlocking(true)
      else toast('Ce dossier verrouillé doit être ouvert par son propriétaire', 'error')
      return
    }
    if (isFolder) {
      setExpanded(e => !e)
    } else {
      openFile(node.id)
    }
  }, [canSelect, isFolder, isLocked, isOwner, node.id, onToggleSelected, openFile, selectionMode, toast])

  const handleDragStart = useCallback((e) => {
    if (!isOwner || renaming || unlocking) {
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
      isOwner,
    })
  }, [isOwner, node, renaming, setDragState, unlocking])

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

  const handleSessionLock = useCallback(async () => {
    try {
      await api.lockEncryptedFolder(node.id)
      setExpanded(false)
      await loadTree()
      toast('Dossier verrouillé dans cette session')
    } catch (error) {
      toast(error.message, 'error')
    }
  }, [loadTree, node.id, toast])

  const handleContextMenu = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    const items = isFolder
      ? [
          canEdit && !isLocked && { icon: '📄', label: 'Nouveau fichier ici', action: () => showModal('new-file', { parent_id: node.id }) },
          canEdit && !isLocked && { icon: '◎', label: 'Nouveau graphe ici', action: () => showModal('new-graph', { parent_id: node.id }) },
          canEdit && !isLocked && { icon: '◉', label: 'Nouveau réseau d’acteurs ici', action: () => showModal('new-actor-network', { parent_id: node.id }) },
          canEdit && !isLocked && { icon: '?', label: 'Nouveau questionnaire ici', action: () => showModal('new-questionnaire', { parent_id: node.id }) },
          canEdit && !isLocked && { icon: 'abc', label: 'Nouvelles definitions ici', action: () => showModal('new-definitions', { parent_id: node.id }) },
          canEdit && !isLocked && { icon: '▦', label: 'Nouveau tableur Excel ici', action: () => showModal('new-spreadsheet', { parent_id: node.id }) },
          canEdit && !isLocked && { icon: '📁', label: 'Nouveau dossier ici', action: () => showModal('new-folder', { parent_id: node.id }) },
          canEdit && !isLocked && isOwner && { separator: true },
          isOwner && !isInsideEncrypted && { icon: '☁', label: 'Partager…', action: () => showModal('share-file', node) },
          isOwner && { icon: '✏', label: 'Renommer', action: () => setRenaming(true) },
          isOwner && !isInsideEncrypted && !isLocked && { icon: '🛡', label: 'Activer le chiffrement…', action: () => showModal('lock-folder', { id: node.id }) },
          isOwner && isEncrypted && !isLocked && { icon: '🔒', label: 'Verrouiller maintenant', action: handleSessionLock },
          isOwner && isEncrypted && !isLocked && { icon: '○', label: 'Désactiver le chiffrement…', danger: true, action: () => showModal('decrypt-folder', { id: node.id }) },
          isOwner && isLocked && { icon: '🔓', label: isEncrypted ? 'Ouvrir le dossier chiffré…' : 'Déverrouiller l’ancien dossier…', action: () => setUnlocking(true) },
          isOwner && { separator: true },
          isOwner && { icon: '🗑', label: 'Mettre à la corbeille', danger: true, action: () => handleDelete() },
        ].filter(Boolean)
      : [
          isOwner && { icon: 'doc', label: 'Nouveau fichier a cote', action: () => showModal('new-file', { parent_id: node.parent_id || null }) },
          isOwner && { icon: 'graph', label: 'Nouveau graphe a cote', action: () => showModal('new-graph', { parent_id: node.parent_id || null }) },
          isOwner && { icon: '◉', label: 'Nouveau réseau d’acteurs a cote', action: () => showModal('new-actor-network', { parent_id: node.parent_id || null }) },
          isOwner && { icon: '?', label: 'Nouveau questionnaire a cote', action: () => showModal('new-questionnaire', { parent_id: node.parent_id || null }) },
          isOwner && { icon: 'abc', label: 'Nouvelles definitions a cote', action: () => showModal('new-definitions', { parent_id: node.parent_id || null }) },
          isOwner && { icon: '▦', label: 'Nouveau tableur Excel a cote', action: () => showModal('new-spreadsheet', { parent_id: node.parent_id || null }) },
          isOwner && { separator: true },
          isOwner && !isInsideEncrypted && { icon: '☁', label: 'Partager…', action: () => showModal('share-file', node) },
          isOwner && { icon: '✏', label: 'Renommer', action: () => setRenaming(true) },
          isOwner && { icon: '🗑', label: 'Mettre à la corbeille', danger: true, action: () => handleDelete() },
        ].filter(Boolean)
    if (items.length) showContextMenu(e.clientX, e.clientY, items)
  }, [canEdit, handleSessionLock, isEncrypted, isFolder, isInsideEncrypted, isLocked, isOwner, node, showModal, showContextMenu])

  const handleDelete = useCallback(async () => {
    const descendantCount = isFolder ? collectDescendantIds(node).length : 0
    const message = isFolder && descendantCount > 0
      ? `Mettre le dossier "${node.name}" et ses ${descendantCount} élément(s) à la corbeille ?\n\nIls pourront être restaurés pendant 30 jours.`
      : `Mettre "${node.name}" à la corbeille ?\n\nIl pourra être restauré pendant 30 jours.`
    if (!window.confirm(message)) return
    try {
      await deleteFile(node.id, { confirmChildren: isFolder && descendantCount > 0 })
      toast(`"${node.name}" placé dans la corbeille`)
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [deleteFile, isFolder, node, toast])

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
      if (isEncrypted) await api.openEncryptedFolder(node.id, password)
      else await api.unlockFolder(node.id, password)
      await loadTree()
      setExpanded(true)
      setUnlocking(false)
      toast(isEncrypted ? 'Dossier chiffré ouvert pour cette session' : 'Ancien dossier déverrouillé')
    } catch (error) {
      toast(error.message || 'Ouverture impossible', 'error')
    }
    setPassword('')
  }, [isEncrypted, node.id, password, loadTree, toast])

  const icon = isLocked ? '🔒' : isFolder ? (expanded ? '▾' : '▸') : /\.xlsx$/i.test(node.name || '') ? '▦' : '📄'
  const isNote = !isFolder && /\.md$/i.test(node.name || '')
  const missingQuiz = isNote && !node.has_quiz

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
          className={`file-row ${isFolder ? 'is-folder' : ''} ${isLocked ? 'is-locked' : ''} ${isDragging ? 'is-dragging' : ''} ${isDropTarget ? 'is-drop-target' : ''} ${selectionMode ? 'selection-mode' : ''} ${isSelected ? 'is-selected' : ''}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          draggable={isOwner && !selectionMode}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          title={node.name}
        >
          {selectionMode && (
            <button
              type="button"
              className="file-select-toggle"
              aria-label={`${isSelected ? 'Désélectionner' : 'Sélectionner'} ${node.name}`}
              aria-pressed={isSelected}
              disabled={!canSelect}
              onClick={event => { event.stopPropagation(); onToggleSelected?.(node.id) }}
            >
              {isSelected ? '✓' : ''}
            </button>
          )}
          <span className="file-icon">{icon}</span>
          <span className="file-name">{node.name.replace(/\.(md|json|xlsx)$/i, '')}</span>
          {missingQuiz && <span className="file-no-quiz-badge" title="Aucun quiz genere pour cette note">🚫</span>}
          {isEncrypted && <span className="file-encrypted-badge" title={isLocked ? 'Chiffré et verrouillé' : 'Chiffré en base, ouvert dans cette session'}>🛡</span>}
          {node.shared_root && <span className="file-shared-badge" title={`Partagé par ${node.owner_username}`}>☁</span>}
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
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelected={onToggleSelected}
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
