import { useEffect, useRef, useState } from 'react'
import { AppProvider } from './context/AppContext'
import { useApp } from './context/useApp'
import * as api from './api'
import { pickNextQuote } from './utils/quoteBag'
import AuthScreen from './components/AuthScreen'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'
import Journal from './components/Journal'
import Timer from './components/Timer'
import InboxPage from './components/InboxPage'
import LifePage from './components/LifePage'
import TodosPage from './components/TodosPage'
import TodoReminder from './components/TodoReminder'
import KnowledgeGraph from './components/KnowledgeGraph'
import HistoricalTimeline from './components/HistoricalTimeline'
import SocialJournal from './components/SocialJournal'
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
      <AuthGate />
    </AppProvider>
  )
}

// Garde de confort UX uniquement : elle évite d'afficher l'arbre de
// fichiers avant d'avoir confirmé la session. La vraie protection est
// entièrement côté serveur (middleware requireAuth + filtrage user_id sur
// chaque requête SQL) — contourner ce garde côté client (devtools) ne
// donne accès à rien, puisque le serveur ne fait jamais confiance à ce que
// le client prétend sur son identité, seulement au cookie de session.
function AuthGate() {
  const { currentUser, authChecked, checkSession } = useApp()

  useEffect(() => { checkSession() }, [])

  if (!authChecked) return null
  return currentUser ? <AppShell /> : <AuthScreen />
}

function AppShell() {
  const { theme, sidebarOpen, view, currentFile, loadTree, openFile, contextMenu, hideContextMenu, showFilePicker, showQuizLauncher, toast } = useApp()
  const rollbackBusyRef = useRef(false)

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

  useEffect(() => {
    const rollback = async (confirm = false) => {
      const result = await api.rollbackHistory(confirm)
      await loadTree()
      if (result.focus_file_id) {
        await openFile(result.focus_file_id)
      } else {
        window.setTimeout(() => window.location.reload(), 250)
      }
      toast('Retour en arriere effectue.')
    }

    const runRollback = async (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (rollbackBusyRef.current) return
      rollbackBusyRef.current = true
      try {
        await rollback(false)
      } catch (err) {
        if (err.status === 409) {
          const ok = window.confirm('Ce retour en arriere va restaurer ou deplacer un fichier. Continuer ?')
          if (ok) {
            try {
              await rollback(true)
            } catch (confirmErr) {
              toast(confirmErr.message || 'Retour en arriere impossible.', 'error')
            }
          }
        } else {
          toast(err.message || 'Retour en arriere impossible.', 'error')
        }
      } finally {
        rollbackBusyRef.current = false
      }
    }

    const keyHandler = async (event) => {
      const isUndoKey = (event.key || '').toLowerCase() === 'z' || event.code === 'KeyZ'
      if (!(event.ctrlKey || event.metaKey) || !isUndoKey || event.shiftKey || event.altKey) return
      await runRollback(event)
    }

    const inputHandler = async (event) => {
      if (event.inputType !== 'historyUndo') return
      await runRollback(event)
    }

    window.addEventListener('keydown', keyHandler, { capture: true })
    window.addEventListener('beforeinput', inputHandler, { capture: true })
    return () => {
      window.removeEventListener('keydown', keyHandler, { capture: true })
      window.removeEventListener('beforeinput', inputHandler, { capture: true })
    }
  }, [loadTree, openFile, toast])

  return (
    <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <Sidebar />

      <main className="main-pane">
        <FileTabs />

        {view === 'timer' ? (
          <Timer />
        ) : view === 'journal' ? (
          <Journal />
        ) : view === 'inbox' ? (
          <InboxPage />
        ) : view === 'life' ? (
          <LifePage />
        ) : view === 'todos' ? (
          <TodosPage section="tasks" />
        ) : view === 'agenda' ? (
          <TodosPage section="agenda" />
        ) : view === 'life-grid' ? (
          <TodosPage section="life" />
        ) : view === 'knowledge-graph' ? (
          <KnowledgeGraph />
        ) : view === 'timeline' ? (
          <HistoricalTimeline />
        ) : view === 'social-journal' ? (
          <SocialJournal />
        ) : view === 'tutorial' ? (
          <Tutorial />
        ) : currentFile ? (
          <Editor />
        ) : (
          <Welcome />
        )}
      </main>

      {showFilePicker && <FilePicker />}
      {showQuizLauncher && <GlobalQuizLauncher />}
      <TodoReminder />

      <MobileNav />
      <Toast />
      <ContextMenu />
      <Modals />
    </div>
  )
}

function FileTabs() {
  const { tabs, openFileId, openFile, closeTab, closeAllTabs, showContextMenu } = useApp()

  if (!tabs.length) return null

  const openTabMenu = (event) => {
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    showContextMenu(rect.right - 8, rect.bottom + 4, [
      { icon: '×', label: 'Tout fermer', danger: true, action: closeAllTabs },
    ])
  }

  return (
    <div className="file-tabs" role="tablist" aria-label="Fichiers ouverts">
      <div className="file-tabs-scroll">
        {tabs.map(tab => (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.id === openFileId}
            className={`file-tab ${tab.id === openFileId ? 'active' : ''}`}
            title={tab.name}
          >
            <button
              type="button"
              className="file-tab-main"
              onClick={() => openFile(tab.id)}
            >
              <Icon name={getTabIcon(tab)} size={14} />
              <span>{formatTabName(tab.name)}</span>
            </button>
            <button
              type="button"
              className="file-tab-close"
              title="Fermer l'onglet"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                closeTab(tab.id)
              }}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="file-tabs-menu"
        title="Options des onglets"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={openTabMenu}
      >
        ...
      </button>
    </div>
  )
}

function formatTabName(name) {
  return String(name || 'Sans titre').replace(/\.(md|json)$/i, '')
}

function getTabIcon(tab) {
  if (tab.kind === 'graph') return 'graph'
  if (tab.kind === 'definitions') return 'book'
  if (tab.kind === 'questionnaire' || /\.json$/i.test(tab.name || '')) return 'question'
  return 'edit'
}

function MobileNav() {
  const { dispatch, view, sidebarOpen } = useApp()
  const items = [
    { key: 'files', label: 'Fichiers', icon: 'folder', active: sidebarOpen, action: () => dispatch({ type: 'TOGGLE_SIDEBAR' }) },
    { key: 'editor', label: 'Éditer', icon: 'edit', active: view === 'editor' && !sidebarOpen, action: () => dispatch({ type: 'SET_VIEW', payload: 'editor' }) },
    { key: 'journal', label: 'Journal', icon: 'journal', active: view === 'journal', action: () => dispatch({ type: 'SET_VIEW', payload: 'journal' }) },
    { key: 'inbox', label: 'Idées', icon: 'idea', active: view === 'inbox', action: () => dispatch({ type: 'SET_VIEW', payload: 'inbox' }) },
    { key: 'todos', label: 'Tâches', icon: 'listCheck', active: view === 'todos', action: () => dispatch({ type: 'SET_VIEW', payload: 'todos' }) },
    { key: 'agenda', label: 'Agenda', icon: 'calendar', active: view === 'agenda', action: () => dispatch({ type: 'SET_VIEW', payload: 'agenda' }) },
    { key: 'graph', label: 'Base', icon: 'database', active: view === 'knowledge-graph', action: () => dispatch({ type: 'SET_VIEW', payload: 'knowledge-graph' }) },
    { key: 'timeline', label: 'Frise', icon: 'timeline', active: view === 'timeline', action: () => dispatch({ type: 'SET_VIEW', payload: 'timeline' }) },
    { key: 'social', label: 'Articles', icon: 'newspaper', active: view === 'social-journal', action: () => dispatch({ type: 'SET_VIEW', payload: 'social-journal' }) },
    { key: 'timer', label: 'Focus', icon: 'timer', active: view === 'timer', action: () => dispatch({ type: 'SET_VIEW', payload: 'timer' }) },
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
        <h1>Opuscule</h1>
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
        <WelcomeQuote />
        <div className="welcome-shortcuts">
          <span><kbd>↑</kbd> Sélectionner dans Fichiers</span>
          <span><kbd>[[</kbd> Lier des notes</span>
          <span><kbd>#tag</kbd> Taguer</span>
        </div>
      </div>
    </div>
  )
}

// Citation du jour : une nouvelle à chaque chargement de l'accueil, via un
// sac mélangé (pas de répétition avant d'avoir tout vu). Le bouton ↻ en tire
// une autre sans recharger la page.
function WelcomeQuote() {
  const [quotes, setQuotes] = useState(null) // null = pas encore chargé
  const [quote, setQuote] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.getQuotes()
      .then(rows => {
        if (cancelled) return
        const list = Array.isArray(rows) ? rows : []
        setQuotes(list)
        setQuote(pickNextQuote(list))
      })
      .catch(() => { if (!cancelled) setQuotes([]) })
    return () => { cancelled = true }
  }, [])

  if (!quote) return null

  const attribution = [quote.author, quote.source].filter(Boolean).join(' — ')
  const canRotate = Array.isArray(quotes) && quotes.length > 1

  return (
    <figure className="welcome-quote">
      <blockquote>{quote.quote}</blockquote>
      <figcaption>
        {attribution && <cite>{attribution}</cite>}
        {canRotate && (
          <button
            type="button"
            className="welcome-quote-refresh"
            title="Une autre citation"
            aria-label="Une autre citation"
            onClick={() => setQuote(pickNextQuote(quotes))}
          >
            <Icon name="refresh" size={14} />
          </button>
        )}
      </figcaption>
    </figure>
  )
}
