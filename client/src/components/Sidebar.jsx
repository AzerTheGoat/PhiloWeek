import { useState, useCallback, useRef } from 'react'
import { useApp } from '../context/useApp'
import FileTree from './FileTree'
import Icon from './Icons'
import * as api from '../api'

export default function Sidebar() {
  const {
    tree, theme, sidebarOpen, featuresOpen, loadTree, toast,
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
      let result
      try {
        result = await api.importObsidian(file)
      } catch (error) {
        if (error.code !== 'VAULT_PASSWORD_REQUIRED_FOR_IMPORT') throw error
        const password = window.prompt('Ce ZIP contient des dossiers chiffrés. Mot de passe du coffre :')
        if (!password) throw new Error('Import annulé : mot de passe du coffre requis')
        result = await api.importObsidian(file, 'rename', password)
      }
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
      { label: 'Nouveau fichier', action: () => showModal('new-file', {}) },
      { label: 'Nouveau graphe', action: () => showModal('new-graph', {}) },
      { label: 'Nouveau réseau d’acteurs', action: () => showModal('new-actor-network', {}) },
      { label: 'Nouveau questionnaire', action: () => showModal('new-questionnaire', {}) },
      { label: 'Nouvelles definitions', action: () => showModal('new-definitions', {}) },
      { label: 'Nouveau tableur Excel', action: () => showModal('new-spreadsheet', {}) },
      { label: 'Nouveau dossier', action: () => showModal('new-folder', {}) },
      { separator: true },
      { label: 'Importer (.zip)', action: () => importInputRef.current?.click() },
      { label: 'Exporter', action: () => showModal('export-vault', {}) },
    ])
  }, [showModal, showContextMenu])

  const runFeature = useCallback((action) => {
    action()
  }, [])

  const createActions = [
    { icon: 'file', label: 'Note', action: () => showModal('new-file', {}) },
    { icon: 'graph', label: 'Graphe d’idées', action: () => showModal('new-graph', {}) },
    { icon: 'graph', label: 'Réseau d’acteurs', action: () => showModal('new-actor-network', {}) },
    { icon: 'question', label: 'Questionnaire', action: () => showModal('new-questionnaire', {}) },
    { icon: 'book', label: 'Definitions', action: () => showModal('new-definitions', {}) },
    { icon: 'spreadsheet', label: 'Tableur Excel', action: () => showModal('new-spreadsheet', {}) },
    { icon: 'folder', label: 'Dossier', action: () => showModal('new-folder', {}) },
  ]

  const viewActions = [
    { icon: 'journal', label: 'Journal', active: view === 'journal', action: openJournalToday },
    { icon: 'idea', label: 'Boîte à idées', active: view === 'inbox', action: () => dispatch({ type: 'SET_VIEW', payload: 'inbox' }) },
    { icon: 'quote', label: 'Citations', active: view === 'life', action: () => dispatch({ type: 'SET_VIEW', payload: 'life' }) },
    { icon: 'listCheck', label: 'Tâches', active: view === 'todos', action: () => dispatch({ type: 'SET_VIEW', payload: 'todos' }) },
    { icon: 'calendar', label: 'Agenda', active: view === 'agenda', action: () => dispatch({ type: 'SET_VIEW', payload: 'agenda' }) },
    { icon: 'life', label: 'Vie perso', active: view === 'life-grid', action: () => dispatch({ type: 'SET_VIEW', payload: 'life-grid' }) },
    { icon: 'timer', label: 'Focus', active: view === 'timer', action: () => dispatch({ type: 'SET_VIEW', payload: 'timer' }) },
    { icon: 'database', label: 'Base de liens', active: view === 'knowledge-graph', action: () => dispatch({ type: 'SET_VIEW', payload: 'knowledge-graph' }) },
    { icon: 'timeline', label: 'Frise historique', active: view === 'timeline', action: () => dispatch({ type: 'SET_VIEW', payload: 'timeline' }) },
    { icon: 'map', label: 'Carnet de voyage', active: view === 'roadtrips', action: () => dispatch({ type: 'SET_VIEW', payload: 'roadtrips' }) },
    { icon: 'newspaper', label: 'Journal public', active: view === 'social-journal', action: () => dispatch({ type: 'SET_VIEW', payload: 'social-journal' }) },
    { icon: 'trash', label: 'Corbeille', active: view === 'trash', action: () => dispatch({ type: 'SET_VIEW', payload: 'trash' }) },
    { icon: 'shield', label: 'Sécurité', active: view === 'security', action: () => dispatch({ type: 'SET_VIEW', payload: 'security' }) },
    { icon: 'thought', label: 'Aide', active: view === 'tutorial', action: () => dispatch({ type: 'SET_VIEW', payload: 'tutorial' }) },
  ]

  const toolActions = [
    { icon: 'play', label: 'Réviser', action: () => dispatch({ type: 'TOGGLE_QUIZ_LAUNCHER' }) },
    { icon: 'edit', label: 'À modifier', active: view === 'required-changes', action: () => dispatch({ type: 'SET_VIEW', payload: 'required-changes' }) },
    { icon: 'copy', label: 'Copier notes', action: () => dispatch({ type: 'TOGGLE_FILE_PICKER' }) },
    { icon: 'download', label: 'Exporter', action: () => showModal('export-vault', {}) },
    { icon: 'upload', label: importing ? 'Import...' : 'Importer', action: () => importInputRef.current?.click() },
    { icon: theme === 'dark' ? 'sun' : 'moon', label: theme === 'dark' ? 'Clair' : 'Sombre', action: () => dispatch({ type: 'SET_THEME', payload: theme === 'dark' ? 'light' : 'dark' }) },
    { icon: 'compass', label: 'Compte', action: () => showModal('account', {}) },
  ]

  return (
    <aside className={`sidebar ${sidebarOpen ? '' : 'hidden'}`}>
      <div className="sidebar-header">
        <span className="sidebar-logo"><Icon name="ai" size={20} /></span>
        <div className="sidebar-actions">
          <button
            type="button"
            title="Journal public"
            className={`feature-toggle icon-only ${view === 'social-journal' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_VIEW', payload: 'social-journal' })}
          >
            <Icon name="newspaper" size={16} />
          </button>
          <button
            type="button"
            title="Fonctionnalités"
            className={`feature-toggle ${featuresOpen ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_FEATURES_OPEN', payload: !featuresOpen })}
          >
            <Icon name="compass" size={16} />
            <span>Fonctions</span>
          </button>
        </div>
      </div>

      {featuresOpen && (
        <div className="feature-panel">
          <FeatureGroup title="Créer" actions={createActions} runFeature={runFeature} />
          <FeatureGroup title="Vues" actions={viewActions} runFeature={runFeature} />
          <FeatureGroup title="Outils" actions={toolActions} runFeature={runFeature} />
        </div>
      )}

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
          <>
            <div className="file-section-label">Mes fichiers</div>
            <FileTree nodes={tree.filter(node => !node.shared_root)} />
            {tree.some(node => node.shared_root) && (
              <>
                <div className="file-section-label shared"><Icon name="cloud" size={13} /> Partagés avec moi</div>
                <FileTree nodes={tree.filter(node => node.shared_root)} />
              </>
            )}
          </>
        )}
      </div>

      <input ref={importInputRef} type="file" accept=".zip" hidden onChange={handleImport} />

      <div className="sidebar-version" title="Version déployée">v2.0.2</div>

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

function FeatureGroup({ title, actions, runFeature }) {
  return (
    <section className="feature-group">
      <h3>{title}</h3>
      <div className="feature-grid">
        {actions.map(action => (
          <button
            key={action.label}
            type="button"
            className={`feature-action ${action.active ? 'active' : ''}`}
            onClick={() => runFeature(action.action)}
          >
            <Icon name={action.icon} size={17} />
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
