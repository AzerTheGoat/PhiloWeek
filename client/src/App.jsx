import { useEffect, useState } from 'react'
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
import RoadTrips from './components/RoadTrips'
import SocialJournal from './components/SocialJournal'
import PublicArticle from './components/PublicArticle'
import Tutorial from './components/Tutorial'
import SecurityPage from './components/SecurityPage'
import MobileCapturePage from './components/MobileCapturePage'
import Trash from './components/Trash'
import FilePicker from './components/FilePicker'
import GlobalQuizLauncher from './components/GlobalQuizLauncher'
import RequiredChanges from './components/RequiredChanges'
import ElocutionPage from './components/ElocutionPage'
import Toast from './components/Toast'
import ContextMenu from './components/ContextMenu'
import Modals from './components/Modals'
import Icon from './components/Icons'
import useFocusRecovery from './hooks/useFocusRecovery'
import useAppUsageTracker from './hooks/useAppUsageTracker'

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
  const { currentUser, authChecked, checkSession, theme } = useApp()
  const publicArticleId = getPublicArticleId()

  useEffect(() => { checkSession() }, [])
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  if (publicArticleId) return <PublicArticle articleId={publicArticleId} />
  if (!authChecked) return null
  return currentUser ? <AppShell /> : (
    <>
      <AuthScreen />
      <Toast />
    </>
  )
}

function getPublicArticleId() {
  const match = window.location.pathname.match(/^\/articles\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

function AppShell() {
  const { theme, sidebarOpen, view, currentFile, currentUser, loadTree, contextMenu, hideContextMenu, showFilePicker, showQuizLauncher, articleReadingFocus } = useApp()

  useFocusRecovery()
  useAppUsageTracker(currentUser?.id)

  useEffect(() => {
    loadTree()
    const timer = setInterval(loadTree, 30000)
    return () => clearInterval(timer)
  }, [loadTree])

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
    <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'} ${articleReadingFocus ? 'article-reading-focus' : ''}`}>
      <Sidebar />

      <main className="main-pane">
        {!articleReadingFocus && <FileTabs />}

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
        ) : view === 'elocution' ? (
          <ElocutionPage />
        ) : view === 'roadtrips' ? (
          <RoadTrips />
        ) : view === 'social-journal' ? (
          <SocialJournal />
        ) : view === 'tutorial' ? (
          <Tutorial />
        ) : view === 'security' ? (
          <SecurityPage />
        ) : view === 'required-changes' ? (
          <RequiredChanges />
        ) : view === 'mobile-capture' ? (
          <MobileCapturePage />
        ) : view === 'trash' ? (
          <Trash />
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
  const { tabs, viewTabs, view, openFileId, openFile, closeTab, closeViewTab, closeAllTabs, showContextMenu, dispatch } = useApp()

  if (!tabs.length && !viewTabs.length) return null

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
            aria-selected={view === 'editor' && tab.id === openFileId}
            className={`file-tab ${view === 'editor' && tab.id === openFileId ? 'active' : ''}`}
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
        {viewTabs.map(viewKey => {
          const viewTab = getViewTab(viewKey)
          return (
            <div
              key={`view:${viewKey}`}
              role="tab"
              aria-selected={view === viewKey}
              className={`file-tab view-tab ${view === viewKey ? 'active' : ''}`}
              title={viewTab.label}
            >
              <button
                type="button"
                className="file-tab-main"
                onClick={() => dispatch({ type: 'SET_VIEW', payload: viewKey })}
              >
                <Icon name={viewTab.icon} size={14} />
                <span>{viewTab.label}</span>
              </button>
              <button
                type="button"
                className="file-tab-close"
                title="Fermer l'onglet"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  closeViewTab(viewKey)
                }}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          )
        })}
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

const VIEW_TABS = {
  timer: { label: 'Focus', icon: 'timer' },
  journal: { label: 'Journal', icon: 'journal' },
  inbox: { label: 'Boîte à idées', icon: 'idea' },
  life: { label: 'Citations', icon: 'quote' },
  todos: { label: 'Tâches', icon: 'listCheck' },
  agenda: { label: 'Agenda', icon: 'calendar' },
  'life-grid': { label: 'Vie perso', icon: 'life' },
  'knowledge-graph': { label: 'Base de liens', icon: 'database' },
  timeline: { label: 'Frise historique', icon: 'timeline' },
  elocution: { label: 'Élocution', icon: 'play' },
  roadtrips: { label: 'Carnet de voyage', icon: 'map' },
  'social-journal': { label: 'Journal public', icon: 'newspaper' },
  tutorial: { label: 'Aide', icon: 'thought' },
  security: { label: 'Sécurité', icon: 'shield' },
  'required-changes': { label: 'À modifier', icon: 'edit' },
  'mobile-capture': { label: 'Capturer', icon: 'idea' },
  trash: { label: 'Corbeille', icon: 'trash' },
}

function getViewTab(view) {
  return VIEW_TABS[view] || { label: view, icon: 'compass' }
}

function formatTabName(name) {
  return String(name || 'Sans titre').replace(/\.(md|json|xlsx)$/i, '')
}

function getTabIcon(tab) {
  if (tab.kind === 'spreadsheet' || /\.xlsx$/i.test(tab.name || '')) return 'spreadsheet'
  if (tab.kind === 'actor-network') return 'graph'
  if (tab.kind === 'graph') return 'graph'
  if (tab.kind === 'definitions') return 'book'
  if (tab.kind === 'questionnaire' || /\.json$/i.test(tab.name || '')) return 'question'
  return 'edit'
}

function MobileNav() {
  const { dispatch, view, sidebarOpen, featuresOpen, showQuizLauncher } = useApp()
  const items = [
    {
      key: 'social', label: 'Articles', icon: 'newspaper',
      active: view === 'social-journal' && !sidebarOpen && !showQuizLauncher,
      action: () => dispatch({ type: 'SET_VIEW', payload: 'social-journal' }),
    },
    {
      key: 'files', label: 'Fichiers', icon: 'folder',
      active: sidebarOpen && !featuresOpen,
      action: () => dispatch({ type: 'TOGGLE_MOBILE_SIDEBAR_MODE', payload: 'files' }),
    },
    {
      key: 'review', label: 'Réviser', icon: 'play',
      active: showQuizLauncher,
      action: () => dispatch({ type: 'TOGGLE_QUIZ_LAUNCHER' }),
    },
    {
      key: 'capture', label: 'Capturer', icon: 'idea',
      active: view === 'mobile-capture' && !sidebarOpen && !showQuizLauncher,
      action: () => dispatch({ type: 'SET_VIEW', payload: 'mobile-capture' }),
    },
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
