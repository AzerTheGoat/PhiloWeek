import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import EditorToolbar from './EditorToolbar'
import Preview from './Preview'
import * as api from '../api'

const AUTOSAVE_DELAY = 800

export default function Editor() {
  const { openFile, openFileId, isDirty, updateContent, saveFile, toast, fileNames, insertRef } = useApp()
  const [mode, setMode] = useState('split') // 'edit' | 'split' | 'preview'
  const [wordCount, setWordCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [wikiQuery, setWikiQuery] = useState(null) // { query, openPos }
  const textareaRef = useRef(null)
  const saveTimer = useRef(null)
  const activeTimer = useRef(null)

  const content = openFile?.content || ''

  // Wire up "Insert into note" for AI panel
  useEffect(() => {
    insertRef.current = (text) => {
      const ta = textareaRef.current
      if (!ta) return
      const pos = ta.selectionStart
      const newContent = content.slice(0, pos) + '\n\n' + text + '\n\n' + content.slice(pos)
      updateContent(newContent)
      ta.focus()
    }
    return () => { insertRef.current = null }
  }, [content, updateContent, insertRef])

  // Word count
  useEffect(() => {
    const text = content.replace(/^---[\s\S]*?---\n?/, '').replace(/[#*`_~\[\]]/g, '')
    setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0)
  }, [content])

  // Autosave
  const triggerSave = useCallback((value) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      await saveFile(openFileId, value)
      setSaving(false)
    }, AUTOSAVE_DELAY)
  }, [openFileId, saveFile])

  // AI active mode trigger (90s without typing)
  useEffect(() => {
    if (!openFile) return
    const reset = () => {
      clearTimeout(activeTimer.current)
      activeTimer.current = setTimeout(async () => {
        // Get current paragraph around cursor
        const ta = textareaRef.current
        if (!ta) return
        const pos = ta.selectionStart
        const text = ta.value
        const paraStart = text.lastIndexOf('\n\n', pos - 1) + 2
        const paraEnd = text.indexOf('\n\n', pos)
        const para = text.slice(paraStart, paraEnd === -1 ? undefined : paraEnd).trim()
        if (para.length < 30) return
        try {
          const { text: suggestion } = await api.activeAI(para)
          if (suggestion) toast(`✦ ${suggestion}`, 'info')
        } catch (_) {}
      }, 90000)
    }
    window.addEventListener('keydown', reset)
    return () => {
      window.removeEventListener('keydown', reset)
      clearTimeout(activeTimer.current)
    }
  }, [openFile, toast])

  const handleChange = useCallback((e) => {
    const value = e.target.value
    updateContent(value)
    triggerSave(value)
    checkWikiLink(e.target)
  }, [updateContent, triggerSave])

  function checkWikiLink(ta) {
    const pos = ta.selectionStart
    const before = ta.value.slice(0, pos)
    const lastOpen = before.lastIndexOf('[[')
    const lastClose = before.lastIndexOf(']]')

    if (lastOpen > lastClose && lastOpen >= 0) {
      const query = before.slice(lastOpen + 2)
      if (!query.includes('\n') && query.length <= 50) {
        setWikiQuery({ query, openPos: lastOpen })
        return
      }
    }
    setWikiQuery(null)
  }

  function insertWikiLink(fileName) {
    const ta = textareaRef.current
    if (!ta || !wikiQuery) return
    const pos = ta.selectionStart
    const value = ta.value
    const name = fileName.replace(/\.md$/i, '')
    const newValue = value.slice(0, wikiQuery.openPos) + `[[${name}]]` + value.slice(pos)
    updateContent(newValue)
    triggerSave(newValue)
    setWikiQuery(null)
    setTimeout(() => {
      const newPos = wikiQuery.openPos + name.length + 4
      ta.setSelectionRange(newPos, newPos)
      ta.focus()
    }, 0)
  }

  // Toolbar format actions
  const format = useCallback((before, after = '') => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const sel = content.slice(start, end)
    const newContent = content.slice(0, start) + before + sel + after + content.slice(end)
    updateContent(newContent)
    triggerSave(newContent)
    setTimeout(() => {
      const newStart = start + before.length
      const newEnd = newStart + sel.length
      ta.setSelectionRange(newStart, newEnd)
      ta.focus()
    }, 0)
  }, [content, updateContent, triggerSave])

  // Image paste → WebP base64
  const handlePaste = useCallback(async (e) => {
    const items = [...(e.clipboardData?.items || [])]
    const imageItem = items.find(i => i.type.startsWith('image/'))
    if (!imageItem) return
    e.preventDefault()

    const blob = imageItem.getAsFile()
    const bmp = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    const MAX = 1200
    const ratio = Math.min(1, MAX / Math.max(bmp.width, bmp.height))
    canvas.width = Math.round(bmp.width * ratio)
    canvas.height = Math.round(bmp.height * ratio)
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/webp', 0.85)

    const imgMarkdown = `![image](${dataUrl})`
    const ta = textareaRef.current
    const pos = ta.selectionStart
    const newContent = content.slice(0, pos) + imgMarkdown + content.slice(pos)
    updateContent(newContent)
    triggerSave(newContent)
  }, [content, updateContent, triggerSave])

  // Key shortcuts in textarea
  const handleKeyDown = useCallback((e) => {
    // Close wiki autocomplete on Escape
    if (e.key === 'Escape' && wikiQuery) {
      setWikiQuery(null)
      return
    }
    // Tab → indent
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = textareaRef.current
      const start = ta.selectionStart
      const newContent = content.slice(0, start) + '  ' + content.slice(start)
      updateContent(newContent)
      setTimeout(() => ta.setSelectionRange(start + 2, start + 2), 0)
    }
    // Ctrl/Cmd+S → save immediately
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      clearTimeout(saveTimer.current)
      saveFile(openFileId, content)
    }
  }, [wikiQuery, content, updateContent, openFileId, saveFile])

  const filteredFiles = wikiQuery
    ? fileNames
        .filter(f => f.name.toLowerCase().includes(wikiQuery.query.toLowerCase()))
        .slice(0, 8)
    : []

  if (!openFile) return null

  return (
    <div className="editor-container">
      {/* Title bar */}
      <div className="editor-titlebar">
        <h2 className="editor-filename">{openFile.name.replace(/\.md$/i, '')}</h2>
        <div className="editor-meta">
          <span className="word-count">{wordCount} mots</span>
          <span className={`save-status ${isDirty ? 'dirty' : ''}`}>
            {saving ? 'Enregistrement…' : isDirty ? '● non sauvegardé' : '✓ sauvegardé'}
          </span>
          <div className="view-toggle">
            <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>Éditer</button>
            <button className={mode === 'split' ? 'active' : ''} onClick={() => setMode('split')}>Split</button>
            <button className={mode === 'preview' ? 'active' : ''} onClick={() => setMode('preview')}>Aperçu</button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      {mode !== 'preview' && <EditorToolbar format={format} />}

      {/* Editor body */}
      <div className={`editor-body mode-${mode}`}>
        {mode !== 'preview' && (
          <div className="editor-write-pane">
            <textarea
              ref={textareaRef}
              className="editor-textarea"
              value={content}
              onChange={handleChange}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              spellCheck
              autoComplete="off"
              placeholder="Commence à écrire… (supporte Markdown et [[liens]])"
            />

            {/* Wiki link autocomplete */}
            {wikiQuery && filteredFiles.length > 0 && (
              <div className="wiki-autocomplete">
                <div className="wiki-ac-header">Lier une note ([[{wikiQuery.query}…)</div>
                {filteredFiles.map(f => (
                  <div
                    key={f.id}
                    className="wiki-ac-item"
                    onMouseDown={e => { e.preventDefault(); insertWikiLink(f.name) }}
                  >
                    📄 {f.name.replace(/\.md$/i, '')}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {mode !== 'edit' && (
          <div className="editor-preview-pane">
            <Preview content={content} />
          </div>
        )}
      </div>
    </div>
  )
}
