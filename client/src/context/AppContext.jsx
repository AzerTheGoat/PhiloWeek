import { useReducer, useCallback, useRef } from 'react'
import { Ctx } from './AppContextCore'
import * as api from '../api'
import { clearReviewSessionMemory } from '../utils/reviewSessionMemory'

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
}

const init = {
  tree: [],
  tabs: [],
  viewTabs: [],
  openFileId: null,
  openFile: null,
  view: 'editor', // 'editor' | 'journal' | 'timer' | 'inbox' | 'life' | 'todos' | 'agenda' | 'life-grid' | 'knowledge-graph' | 'timeline' | 'roadtrips' | 'social-journal' | 'tutorial' | 'trash'
  theme: localStorage.getItem('pw-theme') || 'light',
  sidebarOpen: !isMobileViewport(),
  featuresOpen: false,
  toasts: [],
  contextMenu: null,
  modal: null,
  fileNames: [],
  fileHistory: {},
  fileConflicts: {},
  showFilePicker: false,
  showQuizLauncher: false,
  articleReadingFocus: false,
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
    case 'SET_FILE_HISTORY': return {
      ...state,
      fileHistory: {
        ...state.fileHistory,
        [action.payload.id]: {
          canUndo: Boolean(action.payload.can_undo),
          canRedo: Boolean(action.payload.can_redo),
          contentVersion: Number(action.payload.content_version || 0),
        },
      },
    }
    case 'SET_FILE_CONFLICT': return {
      ...state,
      fileConflicts: { ...state.fileConflicts, [action.payload.id]: action.payload },
    }
    case 'CLEAR_FILE_CONFLICT': {
      const fileConflicts = { ...state.fileConflicts }
      delete fileConflicts[action.payload]
      return { ...state, fileConflicts }
    }
    case 'OPEN_FILE': {
      const tab = tabFromFile(action.payload)
      const tabs = tab
        ? state.tabs.some(existing => existing.id === tab.id)
          ? state.tabs.map(existing => existing.id === tab.id ? { ...existing, ...tab } : existing)
          : [...state.tabs, tab]
        : state.tabs
      const fileConflicts = { ...state.fileConflicts }
      if (action.payload?.id) delete fileConflicts[action.payload.id]
      return {
        ...state,
        fileConflicts,
        fileHistory: action.payload?.id ? {
          ...state.fileHistory,
          [action.payload.id]: {
            canUndo: Boolean(action.payload.can_undo),
            canRedo: Boolean(action.payload.can_redo),
            contentVersion: Number(action.payload.content_version || 0),
          },
        } : state.fileHistory,
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
    case 'SET_VIEW': {
      const nextView = action.payload
      const viewTabs = nextView !== 'editor' && !state.viewTabs.includes(nextView)
        ? [...state.viewTabs, nextView]
        : state.viewTabs
      return {
        ...state,
        view: nextView,
        articleReadingFocus: nextView === 'social-journal' ? state.articleReadingFocus : false,
        viewTabs,
        modal: null,
        contextMenu: null,
        showFilePicker: false,
        showQuizLauncher: false,
        sidebarOpen: isMobileViewport() ? false : state.sidebarOpen,
      }
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
    case 'CLOSE_VIEW_TAB': {
      const viewTabs = state.viewTabs.filter(view => view !== action.payload)
      if (state.view !== action.payload) return { ...state, viewTabs }
      return {
        ...state,
        viewTabs,
        view: viewTabs[viewTabs.length - 1] || 'editor',
      }
    }
    case 'TOGGLE_MOBILE_SIDEBAR_MODE': {
      const featuresOpen = action.payload === 'features'
      const sidebarOpen = !(state.sidebarOpen && state.featuresOpen === featuresOpen)
      return {
        ...state,
        sidebarOpen,
        featuresOpen,
        modal: null,
        contextMenu: null,
        showFilePicker: false,
        showQuizLauncher: false,
      }
    }
    case 'SET_FEATURES_OPEN': return { ...state, featuresOpen: Boolean(action.payload) }
    case 'SET_ARTICLE_READING_FOCUS': return { ...state, articleReadingFocus: Boolean(action.payload) }
    case 'CLOSE_ALL_TABS': return {
      ...state,
      tabs: [],
      viewTabs: [],
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
  const fileVersionRef = useRef({})

  if (state.openFile?.id && fileVersionRef.current[state.openFile.id] === undefined) {
    fileVersionRef.current[state.openFile.id] = Number(state.openFile.content_version || 0)
  }

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

  const openFile = useCallback(async (id, { editorMode, focusPart } = {}) => {
    const requestId = ++openRequestRef.current
    try {
      const file = await api.getFile(id)
      if (requestId !== openRequestRef.current) return
      fileVersionRef.current[id] = Number(file.content_version || 0)
      dispatch({ type: 'OPEN_FILE', payload: {
        ...file,
        initial_editor_mode: editorMode,
        initial_focus_part: focusPart,
      } })
      return file
    } catch (err) {
      if (requestId === openRequestRef.current) {
        dispatch({ type: 'CLEAR_OPEN_FILE' })
        await loadTree()
      }
      toast(err.message, 'error')
      return null
    }
  }, [loadTree, toast])

  const saveFile = useCallback(async (id, content) => {
    try {
      const updated = await api.updateFile(id, {
        content,
        base_version: Number(fileVersionRef.current[id] ?? 0),
      })
      fileVersionRef.current[id] = Number(updated.content_version || 0)
      dispatch({ type: 'SET_FILE_HISTORY', payload: { id, ...updated } })
      return updated
    } catch (err) {
      if (err.code === 'FILE_VERSION_CONFLICT' && err.details?.current_file) {
        dispatch({
          type: 'SET_FILE_CONFLICT',
          payload: { id, local_content: content, current_file: err.details.current_file },
        })
        toast('Conflit détecté : le fichier a été modifié ailleurs', 'error')
        err.alreadyToasted = true
        throw err
      }
      if (/not found/i.test(err.message || '')) {
        dispatch({ type: 'CLEAR_OPEN_FILE' })
        await loadTree()
      }
      toast(err.message || 'Erreur lors de la sauvegarde', 'error')
      err.alreadyToasted = true
      throw err
    }
  }, [loadTree, toast])

  const stepFileHistory = useCallback(async (id, direction) => {
    try {
      const version = Number(fileVersionRef.current[id] ?? 0)
      const updated = direction === 'undo' ? await api.undoFile(id, version) : await api.redoFile(id, version)
      fileVersionRef.current[id] = Number(updated.content_version || 0)
      dispatch({ type: 'SET_FILE_HISTORY', payload: { id, ...updated } })
      return updated
    } catch (err) {
      if (err.code === 'FILE_VERSION_CONFLICT' && err.details?.current_file) {
        dispatch({ type: 'SET_FILE_CONFLICT', payload: { id, local_content: null, current_file: err.details.current_file } })
      }
      throw err
    }
  }, [])

  const resolveFileConflict = useCallback(async (id, resolution) => {
    const conflict = state.fileConflicts[id]
    if (!conflict?.current_file) return null
    if (resolution === 'cloud') {
      fileVersionRef.current[id] = Number(conflict.current_file.content_version || 0)
      dispatch({ type: 'OPEN_FILE', payload: conflict.current_file })
      toast('Version cloud chargée')
      return conflict.current_file
    }
    try {
      const updated = await api.updateFile(id, {
        content: conflict.local_content || '',
        base_version: Number(conflict.current_file.content_version || 0),
      })
      fileVersionRef.current[id] = Number(updated.content_version || 0)
      dispatch({ type: 'OPEN_FILE', payload: updated })
      toast('Ta version a été enregistrée; l’autre reste disponible dans l’historique')
      return updated
    } catch (err) {
      if (err.code === 'FILE_VERSION_CONFLICT' && err.details?.current_file) {
        dispatch({
          type: 'SET_FILE_CONFLICT',
          payload: { id, local_content: conflict.local_content, current_file: err.details.current_file },
        })
        toast('Une nouvelle modification est arrivée; vérifie à nouveau le conflit', 'error')
        return null
      }
      toast(err.message, 'error')
      return null
    }
  }, [state.fileConflicts, toast])

  const deleteFile = useCallback(async (id, options = {}) => {
    await api.deleteFile(id, Boolean(options.confirmChildren))
    if (state.openFileId === id) {
      dispatch({ type: 'CLEAR_OPEN_FILE' })
    }
    await loadTree()
  }, [loadTree, state.openFileId])

  const batchTrashFiles = useCallback(async (ids) => {
    const result = await api.batchTrashFiles(ids)
    await loadTree()
    return result
  }, [loadTree])

  const closeTab = useCallback(async (id) => {
    const index = state.tabs.findIndex(tab => tab.id === id)
    const isActive = state.view === 'editor' && state.openFileId === id
    const nextTab = isActive ? (state.tabs[index + 1] || state.tabs[index - 1]) : null
    dispatch({ type: 'CLOSE_TAB', payload: id })
    if (nextTab) await openFile(nextTab.id)
  }, [openFile, state.openFileId, state.tabs, state.view])

  const closeViewTab = useCallback(async (view) => {
    const remainingViews = state.viewTabs.filter(item => item !== view)
    const shouldRestoreFile = state.view === view && remainingViews.length === 0 && !state.openFile && state.tabs.length > 0
    const fallbackFile = shouldRestoreFile ? state.tabs[state.tabs.length - 1] : null
    dispatch({ type: 'CLOSE_VIEW_TAB', payload: view })
    if (fallbackFile) await openFile(fallbackFile.id)
  }, [openFile, state.openFile, state.tabs, state.view, state.viewTabs])

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
    let journalFolder = flat.find(f => f.name === 'Journal' && !f.parent_id && f.type === 'folder' && f.is_owner !== false)
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
        dispatch({ type: 'OPEN_FILE', payload: { ...newFile, initial_editor_mode: 'split' } })
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
    clearReviewSessionMemory()
    dispatch({ type: 'LOGOUT' })
  }, [])

  const value = {
    ...state,
    currentFile: state.openFile,
    dispatch,
    loadTree,
    openFile,
    closeTab,
    closeViewTab,
    closeAllTabs,
    saveFile,
    undoFile: id => stepFileHistory(id, 'undo'),
    redoFile: id => stepFileHistory(id, 'redo'),
    resolveFileConflict,
    deleteFile,
    batchTrashFiles,
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
  if (/\.xlsx$/i.test(file.name || '')) {
    if (typeof file.content !== 'string') return null
    try {
      return JSON.parse(file.content || '{}')?.philoweek_type === 'spreadsheet' ? 'spreadsheet' : null
    } catch (_) { return null }
  }
  if (/\.json$/i.test(file.name || '')) {
    if (typeof file.content === 'string') {
      try {
        const parsed = JSON.parse(file.content || '{}')
        if (parsed?.philoweek_type === 'actor_network') return 'actor-network'
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
