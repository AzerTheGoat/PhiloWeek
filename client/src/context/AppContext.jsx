import { useReducer, useCallback, useRef } from 'react'
import { Ctx } from './AppContextCore'
import * as api from '../api'

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
}

const init = {
  tree: [],
  tabs: [],
  openFileId: null,
  openFile: null,
  view: 'editor', // 'editor' | 'journal' | 'timer' | 'inbox' | 'life' | 'todos' | 'agenda' | 'life-grid' | 'knowledge-graph' | 'timeline'
  theme: localStorage.getItem('pw-theme') || 'dark',
  sidebarOpen: !isMobileViewport(),
  toasts: [],
  contextMenu: null,
  modal: null,
  fileNames: [],
  showFilePicker: false,
  showQuizLauncher: false,
  currentUser: null,
  authChecked: false,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_TREE': {
      const flat = flattenTree(action.payload)
      const fileById = new Map(flat.map(file => [file.id, file]))
      const tabs = state.tabs
        .filter(tab => fileById.has(tab.id))
        .map(tab => ({ ...tab, ...tabFromFile(fileById.get(tab.id)) }))
      const next = { ...state, tree: action.payload, tabs }
      if (state.openFileId && !treeHasId(action.payload, state.openFileId)) {
        next.openFile = null
        next.openFileId = null
      }
      return next
    }
    case 'SET_FILE_NAMES': return { ...state, fileNames: action.payload }
    case 'OPEN_FILE': {
      const tab = tabFromFile(action.payload)
      const tabs = tab
        ? state.tabs.some(existing => existing.id === tab.id)
          ? state.tabs.map(existing => existing.id === tab.id ? { ...existing, ...tab } : existing)
          : [...state.tabs, tab]
        : state.tabs
      return {
        ...state,
        tabs,
        openFile: action.payload,
        openFileId: action.payload?.id || null,
        view: 'editor',
        modal: null,
        contextMenu: null,
        showFilePicker: false,
        showQuizLauncher: false,
        sidebarOpen: isMobileViewport() ? false : state.sidebarOpen,
      }
    }
    case 'SET_VIEW': return {
      ...state,
      view: action.payload,
      modal: null,
      contextMenu: null,
      showFilePicker: false,
      showQuizLauncher: false,
      sidebarOpen: isMobileViewport() ? false : state.sidebarOpen,
    }
    case 'SET_THEME': {
      localStorage.setItem('pw-theme', action.payload)
      return { ...state, theme: action.payload }
    }
    case 'TOGGLE_SIDEBAR': {
      const sidebarOpen = !state.sidebarOpen
      return {
        ...state,
        sidebarOpen,
        modal: null,
        contextMenu: null,
        showFilePicker: false,
        showQuizLauncher: false,
      }
    }
    case 'CLEAR_OPEN_FILE': return {
      ...state,
      openFile: null,
      openFileId: null,
    }
    case 'CLOSE_TAB': {
      const tabs = state.tabs.filter(tab => tab.id !== action.payload)
      if (state.openFileId !== action.payload) return { ...state, tabs }
      return { ...state, tabs, openFile: null, openFileId: null }
    }
    case 'CLOSE_ALL_TABS': return {
      ...state,
      tabs: [],
      openFile: null,
      openFileId: null,
      view: 'editor',
      contextMenu: null,
      modal: null,
      showFilePicker: false,
      showQuizLauncher: false,
    }
    case 'ADD_TOAST': return { ...state, toasts: [...state.toasts, action.payload] }
    case 'REMOVE_TOAST': return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) }
    case 'SET_CONTEXT_MENU': return { ...state, contextMenu: action.payload }
    case 'SET_MODAL': return {
      ...state,
      modal: action.payload,
      contextMenu: action.payload ? null : state.contextMenu,
      showFilePicker: action.payload ? false : state.showFilePicker,
      showQuizLauncher: action.payload ? false : state.showQuizLauncher,
      sidebarOpen: action.payload && isMobileViewport() ? false : state.sidebarOpen,
    }
    case 'TOGGLE_FILE_PICKER': {
      const showFilePicker = !state.showFilePicker
      return {
        ...state,
        showFilePicker,
        showQuizLauncher: showFilePicker ? false : state.showQuizLauncher,
        modal: showFilePicker ? null : state.modal,
        contextMenu: showFilePicker ? null : state.contextMenu,
        sidebarOpen: showFilePicker && isMobileViewport() ? false : state.sidebarOpen,
      }
    }
    case 'TOGGLE_QUIZ_LAUNCHER': {
      const showQuizLauncher = !state.showQuizLauncher
      return {
        ...state,
        showQuizLauncher,
        showFilePicker: showQuizLauncher ? false : state.showFilePicker,
        modal: showQuizLauncher ? null : state.modal,
        contextMenu: showQuizLauncher ? null : state.contextMenu,
        sidebarOpen: showQuizLauncher && isMobileViewport() ? false : state.sidebarOpen,
      }
    }
    case 'SET_CURRENT_USER': return { ...state, currentUser: action.payload, authChecked: true }
    case 'LOGOUT': return {
      ...init,
      theme: state.theme,
      sidebarOpen: state.sidebarOpen,
      authChecked: true,
      currentUser: null,
    }
    default: return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, init)
  const insertRef = useRef(null)
  const openRequestRef = useRef(0)

  const loadTree = useCallback(async () => {
    try {
      const [tree, names] = await Promise.all([
        api.getFileTree(),
        api.getFileNames(),
      ])
      dispatch({ type: 'SET_TREE', payload: tree })
      dispatch({ type: 'SET_FILE_NAMES', payload: names })
    } catch (err) {
      console.error('loadTree:', err)
    }
  }, [])

  const toast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random()
    dispatch({ type: 'ADD_TOAST', payload: { id, message, type } })
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', payload: id }), 3500)
  }, [])

  const openFile = useCallback(async (id) => {
    const requestId = ++openRequestRef.current
    try {
      const file = await api.getFile(id)
      if (requestId !== openRequestRef.current) return
      dispatch({ type: 'OPEN_FILE', payload: file })
    } catch (err) {
      if (requestId === openRequestRef.current) {
        dispatch({ type: 'CLEAR_OPEN_FILE' })
        await loadTree()
      }
      toast(err.message, 'error')
    }
  }, [loadTree, toast])

  const saveFile = useCallback(async (id, content) => {
    try {
      await api.updateFile(id, { content })
    } catch (err) {
      if (/not found/i.test(err.message || '')) {
        dispatch({ type: 'CLEAR_OPEN_FILE' })
        await loadTree()
      }
      toast(err.message || 'Erreur lors de la sauvegarde', 'error')
    }
  }, [loadTree, toast])

  const deleteFile = useCallback(async (id, options = {}) => {
    await api.deleteFile(id, Boolean(options.confirmChildren))
    if (state.openFileId === id) {
      dispatch({ type: 'CLEAR_OPEN_FILE' })
    }
    await loadTree()
  }, [loadTree, state.openFileId])

  const closeTab = useCallback(async (id) => {
    const index = state.tabs.findIndex(tab => tab.id === id)
    const isActive = state.openFileId === id
    const nextTab = isActive ? (state.tabs[index + 1] || state.tabs[index - 1]) : null
    dispatch({ type: 'CLOSE_TAB', payload: id })
    if (nextTab) await openFile(nextTab.id)
  }, [openFile, state.openFileId, state.tabs])

  const closeAllTabs = useCallback(() => {
    dispatch({ type: 'CLOSE_ALL_TABS' })
  }, [])

  const showContextMenu = useCallback((x, y, items) => {
    dispatch({ type: 'SET_CONTEXT_MENU', payload: { x, y, items } })
  }, [])

  const hideContextMenu = useCallback(() => {
    dispatch({ type: 'SET_CONTEXT_MENU', payload: null })
  }, [])

  const showModal = useCallback((type, data = {}) => {
    dispatch({ type: 'SET_MODAL', payload: { type, data } })
  }, [])

  const hideModal = useCallback(() => {
    dispatch({ type: 'SET_MODAL', payload: null })
  }, [])

  const openJournalToday = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10)
    const fileName = `${today}.md`
    const flat = flattenTree(state.tree)
    let journalFolder = flat.find(f => f.name === 'Journal' && !f.parent_id && f.type === 'folder')
    let todayFile = journalFolder && flat.find(f => f.name === fileName && f.parent_id === journalFolder.id)
    if (!journalFolder) {
      try {
        journalFolder = await api.createFile({ parent_id: null, name: 'Journal', type: 'folder' })
      } catch (err) {
        toast(err.message, 'error')
        return
      }
    }
    if (todayFile) {
      await openFile(todayFile.id)
    } else {
      try {
        const date = new Date()
        const header = `---\ntitle: Journal du ${date.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\ntags: [journal]\ncreated: ${date.toISOString()}\n---\n\n`
        const newFile = await api.createFile({
          parent_id: journalFolder.id,
          name: fileName,
          type: 'file',
          content: header
        })
        await loadTree()
        dispatch({ type: 'OPEN_FILE', payload: newFile })
      } catch (err) {
        toast(err.message, 'error')
      }
    }
    dispatch({ type: 'SET_VIEW', payload: 'editor' })
  }, [state.tree, openFile, loadTree, toast])

  const checkSession = useCallback(async () => {
    try {
      const user = await api.authMe()
      dispatch({ type: 'SET_CURRENT_USER', payload: user })
    } catch {
      dispatch({ type: 'SET_CURRENT_USER', payload: null })
    }
  }, [])

  const login = useCallback(async (username, password) => {
    const user = await api.authLogin(username, password)
    dispatch({ type: 'SET_CURRENT_USER', payload: user })
  }, [])

  const register = useCallback(async (username, password) => {
    const user = await api.authRegister(username, password)
    dispatch({ type: 'SET_CURRENT_USER', payload: user })
  }, [])

  const logout = useCallback(async () => {
    await api.authLogout().catch(() => {})
    dispatch({ type: 'LOGOUT' })
  }, [])

  const value = {
    ...state,
    currentFile: state.openFile,
    dispatch,
    loadTree,
    openFile,
    closeTab,
    closeAllTabs,
    saveFile,
    deleteFile,
    toast,
    showContextMenu,
    hideContextMenu,
    showModal,
    hideModal,
    openJournalToday,
    insertRef,
    checkSession,
    login,
    register,
    logout,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function flattenTree(nodes) {
  const result = []
  function walk(arr) {
    arr.forEach(n => { result.push(n); if (n.children) walk(n.children) })
  }
  walk(nodes)
  return result
}

function tabFromFile(file) {
  if (!file?.id || file.type === 'folder' || file.type === 'locked_folder') return null
  const tab = {
    id: file.id,
    name: file.name,
    type: file.type,
    parent_id: file.parent_id || null,
  }
  const kind = getFileKind(file)
  if (kind) tab.kind = kind
  return tab
}

function getFileKind(file) {
  if (/\.json$/i.test(file.name || '')) {
    if (typeof file.content === 'string') {
      try {
        const parsed = JSON.parse(file.content || '{}')
        if (parsed?.philoweek_type === 'definitions' || Array.isArray(parsed?.definitions)) return 'definitions'
      } catch (_) {}
      return 'questionnaire'
    }
    return null
  }
  if (typeof file.content === 'string' && /philoweek_type:\s*graph/i.test(file.content)) return 'graph'
  if (typeof file.content === 'string') return 'note'
  return null
}

function treeHasId(nodes, id) {
  if (!id) return false
  for (const node of nodes || []) {
    if (node.id === id) return true
    if (treeHasId(node.children, id)) return true
  }
  return false
}
