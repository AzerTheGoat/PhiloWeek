import { useState, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import FileTree from './FileTree'
import * as api from '../api'

export default function Sidebar() {
  const {
    tree, theme, showAI, sidebarOpen, loadTree, toast,
    dispatch, showModal, openJournalToday, openFile, view
  } = useApp()
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [importing, setImporting] = useState(false)

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

  return (
    <aside className={`sidebar ${sidebarOpen ? '' : 'hidden'}`}>
      {/* Header */}
      <div className="sidebar-header">
        <span className="sidebar-logo">✦</span>
        <div className="sidebar-actions">
          <button
            title="Journal d'aujourd'hui"
            className="icon-btn"
            onClick={openJournalToday}
          >📓</button>
          <button
            title="Nid à idées"
            className={`icon-btn ${view === 'inbox' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_VIEW', payload: 'inbox' })}
          >💡</button>
          <button
            title="Vie intérieure"
            className={`icon-btn ${view === 'life' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_VIEW', payload: 'life' })}
          >◈</button>
          <button
            title="Timer"
            className="icon-btn"
            onClick={() => dispatch({ type: 'SET_VIEW', payload: 'timer' })}
          >⏱</button>
          <button
            title={showAI ? 'Masquer l\'IA' : 'Afficher l\'IA'}
            className={`icon-btn ${showAI ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_AI' })}
          >✦</button>
          <button
            title={theme === 'dark' ? 'Thème clair' : 'Thème sombre'}
            className="icon-btn"
            onClick={() => dispatch({ type: 'SET_THEME', payload: theme === 'dark' ? 'light' : 'dark' })}
          >{theme === 'dark' ? '☀' : '◑'}</button>
        </div>
      </div>

      {/* Search */}
      <div className="sidebar-search">
        <input
          type="text"
          placeholder="Rechercher…"
          value={searchQ}
          onChange={e => handleSearch(e.target.value)}
          className="search-input"
        />
      </div>

      {/* Search results or file tree */}
      <div className="sidebar-content">
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
                <div className="search-result-name">📄 {r.name}</div>
                {r.excerpt && <div className="search-result-excerpt">{r.excerpt}</div>}
              </div>
            ))}
          </div>
        ) : (
          <FileTree nodes={tree} />
        )}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <button
          className="footer-btn"
          onClick={() => showModal('new-file', {})}
          title="Nouveau fichier"
        >+ Fichier</button>
        <button
          className="footer-btn"
          onClick={() => showModal('new-folder', {})}
          title="Nouveau dossier"
        >+ Dossier</button>
        <button
          className="footer-btn"
          onClick={api.exportObsidian}
          title="Exporter vault Obsidian"
        >↓ Export</button>
        <label className="footer-btn" title="Importer vault Obsidian (.zip)">
          {importing ? '…' : '↑ Import'}
          <input type="file" accept=".zip" hidden onChange={handleImport} />
        </label>
        <button
          className="footer-btn"
          onClick={() => dispatch({ type: 'TOGGLE_FILE_PICKER' })}
          title="Copier des notes sélectionnées"
        >⎘ Copier</button>
      </div>

      {/* Mobile toggle */}
      <button
        className="sidebar-toggle"
        onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
        title="Masquer la sidebar"
      >‹</button>
    </aside>
  )
}
