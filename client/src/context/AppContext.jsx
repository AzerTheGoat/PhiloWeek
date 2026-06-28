import { createContext, useContext, useReducer, useCallback, useRef } from 'react'
import * as api from '../api'

const Ctx = createContext(null)

const init = {
  tree: [],
  openFileId: null,
  openFile: null,
  isDirty: false,
  view: 'editor', // 'editor' | 'journal' | 'timer' | 'inbox'
  theme: localStorage.getItem('pw-theme') || 'dark',
  showAI: true,
  sidebarOpen: true,
  toasts: [],
  contextMenu: null,
  modal: null,
  fileNames: [], // lightweight list for [[link]] autocomplete
  showFilePicker: false,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_TREE': return { ...state, tree: action.payload }
    case 'SET_FILE_NAMES': return { ...state, fileNames: action.payload }
    case 'OPEN_FILE': return { ...state, openFile: action.payload, openFileId: action.payload?.id || null, isDirty: false, view: 'editor' }
    case 'UPDATE_CONTENT': return { ...state, openFile: { ...state.openFile, content: action.payload }, isDirty: true }
    case 'SAVED': return { ...state, isDirty: false }
    case 'SET_VIEW': return { ...state, view: action.payload }
    case 'SET_THEME': {
      localStorage.setItem('pw-theme', action.payload)
      return { ...state, theme: action.payload }
    }
    case 'TOGGLE_AI': return { ...state, showAI: !state.showAI }
    case 'TOGGLE_SIDEBAR': return { ...state, sidebarOpen: !state.sidebarOpen }
    case 'ADD_TOAST': return { ...state, toasts: [...state.toasts, action.payload] }
    case 'REMOVE_TOAST': return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) }
    case 'SET_CONTEXT_MENU': return { ...state, contextMenu: action.payload }
    case 'SET_MODAL': return { ...state, modal: action.payload }
    case 'TOGGLE_FILE_PICKER': return { ...state, showFilePicker: !state.showFilePicker }
    default: return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, init)
  const insertRef = useRef(null) // callback for "Insert into note" from AI

  const loadTree = useCallback(async () => {
    try {
      const tree = await api.getFileTree()
      dispatch({ type: 'SET_TREE', payload: tree })
      const names = await api.getFileNames()
      dispatch({ type: 'SET_FILE_NAMES', payload: names })
    } catch (err) {
      console.error('loadTree:', err)
    }
  }, [])

  const openFile = useCallback(async (id) => {
    try {
      const file = await api.getFile(id)
      dispatch({ type: 'OPEN_FILE', payload: file })
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [])

  const updateContent = useCallback((content) => {
    dispatch({ type: 'UPDATE_CONTENT', payload: content })
  }, [])

  const saveFile = useCallback(async (id, content) => {
    try {
      await api.updateFile(id, { content })
      dispatch({ type: 'SAVED' })
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [])

  const toast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random()
    dispatch({ type: 'ADD_TOAST', payload: { id, message, type } })
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', payload: id }), 3500)
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
    // Find or create today's entry in the /Journal/ folder
    const today = new Date().toISOString().slice(0, 10)
    const fileName = `${today}.md`

    // Find Journal folder
    const flat = flattenTree(state.tree)
    const journalFolder = flat.find(f => f.name === 'Journal' && !f.parent_id && f.type === 'folder')
    if (!journalFolder) { toast('Dossier Journal introuvable', 'error'); return }

    // Find today's file
    const todayFile = flat.find(f => f.name === fileName && f.parent_id === journalFolder.id)

    if (todayFile) {
      await openFile(todayFile.id)
    } else {
      // Create it
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

  const value = {
    ...state,
    dispatch,
    loadTree,
    openFile,
    updateContent,
    saveFile,
    toast,
    showContextMenu,
    hideContextMenu,
    showModal,
    hideModal,
    openJournalToday,
    insertRef,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useApp = () => useContext(Ctx)

// Helper
function flattenTree(nodes) {
  const result = []
  function walk(arr) {
    arr.forEach(n => {
      result.push(n)
      if (n.children) walk(n.children)
    })
  }
  walk(nodes)
  return result
}
