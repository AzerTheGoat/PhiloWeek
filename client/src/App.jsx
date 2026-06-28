import { useEffect } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'
import AIPanel from './components/AIPanel'
import Journal from './components/Journal'
import Timer from './components/Timer'
import InboxPage from './components/InboxPage'
import LifePage from './components/LifePage'
import FilePicker from './components/FilePicker'
import Toast from './components/Toast'
import ContextMenu from './components/ContextMenu'
import Modals from './components/Modals'

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}

function AppShell() {
  const { theme, showAI, sidebarOpen, view, currentFile, loadTree, contextMenu, hideContextMenu, showFilePicker } = useApp()

  useEffect(() => { loadTree() }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => hideContextMenu()
    document.addEventListener('click', handler, { once: true })
    return () => document.removeEventListener('click', handler)
  }, [contextMenu, hideContextMenu])

  return (
    <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'} ${showAI ? 'ai-open' : ''}`}>
      <Sidebar />

      <main className="main-pane">
        {view === 'timer' ? (
          <Timer />
        ) : view === 'journal' ? (
          <Journal />
        ) : view === 'inbox' ? (
          <InboxPage />
        ) : view === 'life' ? (
          <LifePage />
        ) : currentFile ? (
          <Editor />
        ) : (
          <Welcome />
        )}
      </main>

      {showAI && view !== 'inbox' && view !== 'life' && <AIPanel />}

      {showFilePicker && <FilePicker />}

      <MobileNav />
      <Toast />
      <ContextMenu />
      <Modals />
    </div>
  )
}

function MobileNav() {
  const { dispatch, view, showAI } = useApp()
  return (
    <nav className="mobile-nav">
      <button
        className={`mobile-nav-btn`}
        onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
      >
        <span>📁</span><span>Fichiers</span>
      </button>
      <button
        className={`mobile-nav-btn ${view === 'editor' ? 'active' : ''}`}
        onClick={() => dispatch({ type: 'SET_VIEW', payload: 'editor' })}
      >
        <span>✏</span><span>Éditeur</span>
      </button>
      <button
        className={`mobile-nav-btn ${view === 'journal' ? 'active' : ''}`}
        onClick={() => dispatch({ type: 'SET_VIEW', payload: 'journal' })}
      >
        <span>📓</span><span>Journal</span>
      </button>
      <button
        className={`mobile-nav-btn ${view === 'inbox' ? 'active' : ''}`}
        onClick={() => dispatch({ type: 'SET_VIEW', payload: 'inbox' })}
      >
        <span>💡</span><span>Idées</span>
      </button>
      <button
        className={`mobile-nav-btn ${showAI ? 'active' : ''}`}
        onClick={() => dispatch({ type: 'TOGGLE_AI' })}
      >
        <span>✦</span><span>IA</span>
      </button>
      <button
        className={`mobile-nav-btn ${view === 'life' ? 'active' : ''}`}
        onClick={() => dispatch({ type: 'SET_VIEW', payload: 'life' })}
      >
        <span>◈</span><span>Vie</span>
      </button>
    </nav>
  )
}

function Welcome() {
  const { openJournalToday, showModal } = useApp()
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-logo">✦</div>
        <h1>PhiloWeek</h1>
        <p>Ton espace de pensée philosophique</p>
        <div className="welcome-actions">
          <button className="btn-primary" onClick={() => showModal('new-file', {})}>
            Nouveau fichier
          </button>
          <button className="btn-ghost" onClick={openJournalToday}>
            Journal d'aujourd'hui
          </button>
        </div>
        <div className="welcome-shortcuts">
          <span><kbd>↑</kbd> Sélectionner dans la sidebar</span>
          <span><kbd>[[</kbd> Lier des notes</span>
          <span><kbd>#tag</kbd> Taguer</span>
        </div>
      </div>
    </div>
  )
}
