import { useState, useCallback, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import * as api from '../api'

// ——— Helpers ———

function getAllFileIds(node) {
  const ids = []
  if (node.type === 'file') ids.push(node.id)
  ;(node.children || []).forEach(c => ids.push(...getAllFileIds(c)))
  return ids
}

function getFilesInTreeOrder(tree, selectedIds) {
  const files = []
  function walk(nodes) {
    nodes.forEach(n => {
      if (n.type === 'file' && selectedIds.has(n.id)) files.push(n)
      if (n.children) walk(n.children)
    })
  }
  walk(tree)
  return files
}

function buildFullPath(tree, fileId) {
  function walk(nodes, prefix) {
    for (const n of nodes) {
      const p = prefix ? prefix + '/' + n.name : n.name
      if (n.id === fileId) return p
      if (n.children) {
        const found = walk(n.children, p)
        if (found) return found
      }
    }
    return null
  }
  return walk(tree, '') || ''
}

async function buildConcatenation(tree, selectedIds) {
  const orderedFiles = getFilesInTreeOrder(tree, selectedIds)
  const parts = []
  for (const f of orderedFiles) {
    const data = await api.getFile(f.id)
    const raw = data.content || ''
    const body = raw.replace(/^---[\s\S]*?---\n?/, '').trim()
    const title = f.name.replace(/\.md$/i, '')
    const path = buildFullPath(tree, f.id)
    const modDate = new Date(f.updated_at || f.created_at).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short', year: 'numeric'
    })
    parts.push(`# ${title}\n> Chemin : /${path} — Modifié le ${modDate}\n\n${body}`)
  }
  return { text: parts.join('\n\n---\n\n'), count: orderedFiles.length }
}

// ——— SelectableTree ———

function SelectableTree({ nodes, depth = 0, selectedIds, onToggle }) {
  return (
    <ul className={`file-tree ${depth === 0 ? 'root' : ''}`}>
      {nodes.map(n => (
        <SelectableNode key={n.id} node={n} depth={depth} selectedIds={selectedIds} onToggle={onToggle} />
      ))}
    </ul>
  )
}

function SelectableNode({ node, depth, selectedIds, onToggle }) {
  const [expanded, setExpanded] = useState(depth === 0)
  const isFolder = node.type === 'folder' || node.type === 'locked_folder'
  const isLocked = node.type === 'locked_folder'
  const children = node.children || []

  const descendantIds = isFolder ? getAllFileIds(node) : [node.id]
  const checkedCount = descendantIds.filter(id => selectedIds.has(id)).length
  const isChecked = descendantIds.length > 0 && checkedCount === descendantIds.length
  const isIndeterminate = checkedCount > 0 && checkedCount < descendantIds.length

  const handleToggle = (e) => {
    e.stopPropagation()
    if (isLocked) return
    const allSelected = isChecked
    descendantIds.forEach(id => onToggle(id, !allSelected))
  }

  const icon = isLocked ? '🔒' : isFolder ? (expanded ? '▾' : '▸') : '📄'

  return (
    <li className="file-node">
      <div
        className={`file-row picker-row ${isFolder ? 'is-folder' : ''} ${isLocked ? 'is-locked' : ''}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={isFolder ? () => setExpanded(e => !e) : handleToggle}
      >
        <input
          type="checkbox"
          className="picker-checkbox"
          checked={isChecked}
          ref={el => { if (el) el.indeterminate = isIndeterminate }}
          onChange={handleToggle}
          disabled={isLocked}
          onClick={e => e.stopPropagation()}
        />
        <span className="file-icon">{icon}</span>
        <span className="file-name">{node.name.replace(/\.md$/i, '')}</span>
        {isFolder && !isLocked && (
          <button
            className="picker-select-all"
            onClick={handleToggle}
            title={isChecked ? 'Tout désélectionner' : 'Tout sélectionner'}
          >
            {isChecked ? '−' : '+'}
          </button>
        )}
      </div>
      {isFolder && expanded && children.length > 0 && (
        <SelectableTree nodes={children} depth={depth + 1} selectedIds={selectedIds} onToggle={onToggle} />
      )}
    </li>
  )
}

// ——— FilePicker (slide-in panel) ———

export default function FilePicker() {
  const { tree, dispatch, toast } = useApp()
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [loading, setLoading] = useState(false)

  // Reset on open
  useEffect(() => { setSelectedIds(new Set()) }, [])

  const handleToggle = useCallback((id, force) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (force === true) next.add(id)
      else if (force === false) next.delete(id)
      else if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const fileCount = getFilesInTreeOrder(tree, selectedIds).length

  const handleCopy = async () => {
    if (fileCount === 0) { toast('Sélectionne au moins un fichier', 'error'); return }
    setLoading(true)
    try {
      const { text, count } = await buildConcatenation(tree, selectedIds)
      await navigator.clipboard.writeText(text)
      toast(`${count} note(s) copiée(s) dans le presse-papier`)
      dispatch({ type: 'TOGGLE_FILE_PICKER' })
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async () => {
    if (fileCount === 0) { toast('Sélectionne au moins un fichier', 'error'); return }
    setLoading(true)
    try {
      const { text, count } = await buildConcatenation(tree, selectedIds)
      const blob = new Blob([text], { type: 'text/markdown; charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `selection-${new Date().toISOString().slice(0, 10)}.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast(`${count} note(s) téléchargée(s)`)
      dispatch({ type: 'TOGGLE_FILE_PICKER' })
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const selectAll = () => {
    const ids = new Set()
    getFilesInTreeOrder(tree, new Set(tree.flatMap(n => getAllFileIds(n)))).forEach(f => ids.add(f.id))
    // More direct: collect all file ids
    function collectAll(nodes) { nodes.forEach(n => { if (n.type === 'file') ids.add(n.id); if (n.children) collectAll(n.children) }) }
    collectAll(tree)
    setSelectedIds(ids)
  }

  return (
    <>
      {/* Backdrop */}
      <div className="picker-backdrop" onClick={() => dispatch({ type: 'TOGGLE_FILE_PICKER' })} />

      {/* Slide-in panel */}
      <div className="picker-panel">
        <div className="picker-header">
          <h3>Copier des notes</h3>
          <div className="picker-header-actions">
            <button className="picker-select-all-btn" onClick={selectAll}>Tout sélectionner</button>
            <button className="icon-btn" onClick={() => dispatch({ type: 'TOGGLE_FILE_PICKER' })}>✕</button>
          </div>
        </div>

        <div className="picker-tree-container">
          <SelectableTree
            nodes={tree}
            selectedIds={selectedIds}
            onToggle={handleToggle}
          />
        </div>

        <div className="picker-footer">
          <span className="picker-count">
            {fileCount > 0 ? `${fileCount} fichier(s) sélectionné(s)` : 'Aucun fichier sélectionné'}
          </span>
          <div className="picker-actions">
            <button
              className="btn-ghost picker-dl"
              onClick={handleDownload}
              disabled={loading || fileCount === 0}
              title="Télécharger en .md"
            >
              ↓ .md
            </button>
            <button
              className="btn-primary"
              onClick={handleCopy}
              disabled={loading || fileCount === 0}
            >
              {loading ? '…' : '⎘ Copier'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
