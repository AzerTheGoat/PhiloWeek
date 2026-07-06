import { useState, useCallback, useRef } from 'react'
import { useApp } from '../context/useApp'
import FileTree from './FileTree'
import Icon from './Icons'
import * as api from '../api'

export default function Sidebar() {
  const {
    tree, theme, showAI, sidebarOpen, loadTree, toast,
    dispatch, showModal, showContextMenu, openJournalToday, openFile, view
  } = useApp()
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef(null)

  const handleSearch = useCallback(async (q) => {
    setSearchQ(q)
    if (q.length < 2) { setSearchResults(null); return }
    const res = await api.searchFiles(q)
    setSearchResults(res)
  }, [])

  const handleImport = useCallback(async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    try {
      const result = await api.importObsidian(file)
      await loadTree()
      toast(`Import terminé : ${result.report.imported} fichiers, ${result.report.linksResolved} liens résolus`)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }, [loadTree, toast])

  const handleAreaContextMenu = useCallback((e) => {
    e.preventDefault()
    showContextMenu(e.clientX, e.clientY, [
      { icon: '📄', label: 'Nouveau fichier', action: () => showModal('new-file', {}) },
      { icon: '◎', label: 'Nouveau graphe', action: () => showModal('new-graph', {}) },
      { icon: '📁', label: 'Nouveau dossier', action: () => showModal('new-folder', {}) },
      { separator: true },
      { icon: '📥', label: 'Importer (.zip)', action: () => importInputRef.current?.click() },
      { icon: '📤', label: 'Exporter', action: () => api.exportObsidian() },
    ])
  }, [showModal, showContextMenu])

  return (
    <aside className={`sidebar ${sidebarOpen ? '' : 'hidden'}`}>
      <div className="sidebar-header">
        <span className="sidebar-logo"><Icon name="ai" size={20} /></span>
        <div className="sidebar-actions">
          <button title="Journal d'aujourd'hui" className="icon-btn" onClick={openJournalToday}>
            <Icon name="journal" />
          </button>
          <button
            title="Nid à idées"
            className={`icon-btn ${view === 'inbox' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_VIEW', payload: 'inbox' })}
          >
            <Icon name="idea" />
          </button>
          <button
            title="Vie intérieure"
            className={`icon-btn ${view === 'life' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_VIEW', payload: 'life' })}
          >
            <Icon name="life" />
          </button>
          <button title="Timer" className="icon-btn" onClick={() => dispatch({ type: 'SET_VIEW', payload: 'timer' })}>
            <Icon name="timer" />
          </button>
          <button
            title={showAI ? "Masquer l'IA" : "Afficher l'IA"}
            className={`icon-btn ${showAI ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_AI' })}
          >
            <Icon name="ai" />
          </button>
          <button
            title={theme === 'dark' ? 'Thème clair' : 'Thème sombre'}
            className="icon-btn"
            onClick={() => dispatch({ type: 'SET_THEME', payload: theme === 'dark' ? 'light' : 'dark' })}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
        </div>
      </div>

      <div className="sidebar-search">
        <input
          type="text"
          placeholder="Rechercher..."
          value={searchQ}
          onChange={e => handleSearch(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="sidebar-content" onContextMenu={handleAreaContextMenu}>
        {searchResults ? (
          <div className="search-results">
            {searchResults.length === 0 && (
              <div className="search-empty">Aucun résultat</div>
            )}
            {searchResults.map(r => (
              <div
                key={r.id}
                className="search-result"
                onClick={() => { openFile(r.id); setSearchQ(''); setSearchResults(null) }}
              >
                <div className="search-result-name">{r.name}</div>
                {r.excerpt && <div className="search-result-excerpt">{r.excerpt}</div>}
              </div>
            ))}
          </div>
        ) : (
          <FileTree nodes={tree} />
        )}
      </div>

      <div className="sidebar-footer">
        <button className="footer-btn" onClick={() => showModal('new-file', {})} title="Nouveau fichier">
          <Icon name="plus" size={16} /> Fichier
        </button>
        <button className="footer-btn" onClick={() => showModal('new-graph', {})} title="Nouveau graphe">
          <Icon name="graph" size={16} /> Graphe
        </button>
        <button className="footer-btn" onClick={() => showModal('new-questionnaire', {})} title="Nouveau questionnaire">
          <Icon name="question" size={16} /> Quiz
        </button>
        <button className="footer-btn" onClick={() => showModal('new-folder', {})} title="Nouveau dossier">
          <Icon name="folder" size={16} /> Dossier
        </button>
        <button className="footer-btn" onClick={api.exportObsidian} title="Exporter vault Obsidian">
          <Icon name="download" size={16} /> Export
        </button>
        <label className="footer-btn" title="Importer vault Obsidian (.zip)">
          {importing ? '...' : <><Icon name="upload" size={16} /> Import</>}
          <input ref={importInputRef} type="file" accept=".zip" hidden onChange={handleImport} />
        </label>
        <button className="footer-btn" onClick={() => dispatch({ type: 'TOGGLE_FILE_PICKER' })} title="Copier des notes sélectionnées">
          <Icon name="copy" size={16} /> Copier
        </button>
      </div>

      <div className="sidebar-version" title="Version déployée">v2.0.1</div>

      <button
        className="sidebar-toggle"
        onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
        title={sidebarOpen ? 'Masquer la sidebar' : 'Afficher la sidebar'}
      >
        {sidebarOpen ? '‹' : '›'}
      </button>
    </aside>
  )
}
