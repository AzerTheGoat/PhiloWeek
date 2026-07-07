import { useEffect } from 'react'
import { AppProvider } from './context/AppContext'
import { useApp } from './context/useApp'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'
import AIPanel from './components/AIPanel'
import Journal from './components/Journal'
import Timer from './components/Timer'
import InboxPage from './components/InboxPage'
import LifePage from './components/LifePage'
import KnowledgeGraph from './components/KnowledgeGraph'
import Tutorial from './components/Tutorial'
import FilePicker from './components/FilePicker'
import GlobalQuizLauncher from './components/GlobalQuizLauncher'
import Toast from './components/Toast'
import ContextMenu from './components/ContextMenu'
import Modals from './components/Modals'
import Icon from './components/Icons'

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}

function AppShell() {
  const { theme, showAI, sidebarOpen, view, currentFile, loadTree, contextMenu, hideContextMenu, showFilePicker, showQuizLauncher } = useApp()

  useEffect(() => { loadTree() }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    const syncViewport = () => {
      const visual = window.visualViewport
      const height = visual?.height || window.innerHeight
      root.style.setProperty('--app-height', `${height}px`)
      root.classList.toggle('keyboard-open', Boolean(visual && visual.height < window.innerHeight - 120))
    }

    syncViewport()
    window.addEventListener('resize', syncViewport)
    window.visualViewport?.addEventListener('resize', syncViewport)
    window.visualViewport?.addEventListener('scroll', syncViewport)
    return () => {
      window.removeEventListener('resize', syncViewport)
      window.visualViewport?.removeEventListener('resize', syncViewport)
      window.visualViewport?.removeEventListener('scroll', syncViewport)
      root.classList.remove('keyboard-open')
    }
  }, [])

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
        ) : view === 'knowledge-graph' ? (
          <KnowledgeGraph />
        ) : view === 'tutorial' ? (
          <Tutorial />
        ) : currentFile ? (
          <Editor />
        ) : (
          <Welcome />
        )}
      </main>

      {showAI && view !== 'inbox' && view !== 'life' && view !== 'knowledge-graph' && <AIPanel />}

      {showFilePicker && <FilePicker />}
      {showQuizLauncher && <GlobalQuizLauncher />}

      <MobileNav />
      <Toast />
      <ContextMenu />
      <Modals />
    </div>
  )
}

function MobileNav() {
  const { dispatch, view, showAI, sidebarOpen } = useApp()
  const items = [
    { key: 'files', label: 'Fichiers', icon: 'folder', active: sidebarOpen, action: () => dispatch({ type: 'TOGGLE_SIDEBAR' }) },
    { key: 'editor', label: 'Éditer', icon: 'edit', active: view === 'editor' && !showAI && !sidebarOpen, action: () => dispatch({ type: 'SET_VIEW', payload: 'editor' }) },
    { key: 'journal', label: 'Journal', icon: 'journal', active: view === 'journal', action: () => dispatch({ type: 'SET_VIEW', payload: 'journal' }) },
    { key: 'inbox', label: 'Idées', icon: 'idea', active: view === 'inbox', action: () => dispatch({ type: 'SET_VIEW', payload: 'inbox' }) },
    { key: 'graph', label: 'Graphe', icon: 'graph', active: view === 'knowledge-graph', action: () => dispatch({ type: 'SET_VIEW', payload: 'knowledge-graph' }) },
    { key: 'timer', label: 'Timer', icon: 'timer', active: view === 'timer', action: () => dispatch({ type: 'SET_VIEW', payload: 'timer' }) },
    { key: 'ai', label: 'IA', icon: 'ai', active: showAI, action: () => dispatch({ type: 'TOGGLE_AI' }) },
    { key: 'life', label: 'Vie', icon: 'life', active: view === 'life', action: () => dispatch({ type: 'SET_VIEW', payload: 'life' }) },
  ]

  return (
    <nav className="mobile-nav" aria-label="Navigation mobile">
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          className={`mobile-nav-btn ${item.active ? 'active' : ''}`}
          onClick={item.action}
        >
          <span className="mobile-nav-icon"><Icon name={item.icon} size={21} /></span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

function Welcome() {
  const { openJournalToday, showModal, dispatch } = useApp()
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-logo"><Icon name="ai" size={42} /></div>
        <h1>PhiloWeek</h1>
        <p>Ton espace de pensée philosophique</p>
        <div className="welcome-actions">
          <button className="btn-primary" onClick={() => showModal('new-file', {})}>
            Nouveau fichier
          </button>
          <button className="btn-ghost" onClick={openJournalToday}>
            Journal d'aujourd'hui
          </button>
          <button className="btn-ghost welcome-tutorial-btn" onClick={() => dispatch({ type: 'SET_VIEW', payload: 'tutorial' })}>
            <Icon name="thought" size={16} /> Découvrir les fonctionnalités
          </button>
        </div>
        <div className="welcome-shortcuts">
          <span><kbd>↑</kbd> Sélectionner dans Fichiers</span>
          <span><kbd>[[</kbd> Lier des notes</span>
          <span><kbd>#tag</kbd> Taguer</span>
        </div>
      </div>
    </div>
  )
}
