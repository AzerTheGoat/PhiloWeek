import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../context/useApp'
import EditorToolbar from './EditorToolbar'
import Preview from './Preview'
import GraphEditor from './GraphEditor'
import { isGraphFile } from '../utils/graphFile'
import * as api from '../api'

const AUTOSAVE_DELAY = 800

function initialMode() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches ? 'edit' : 'split'
}

export default function Editor() {
  const { currentFile, openFileId, saveFile, toast, fileNames, insertRef } = useApp()

  // Content is LOCAL state — never dispatched to global context
  const [content, setContent] = useState(currentFile?.content || '')
  const [isDirty, setIsDirty] = useState(false)
  const [mode, setMode] = useState(initialMode)
  const [wordCount, setWordCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [wikiQuery, setWikiQuery] = useState(null)
  // Debounced content for Preview — avoids re-rendering preview on every keystroke
  const [previewContent, setPreviewContent] = useState(currentFile?.content || '')

  const textareaRef = useRef(null)
  const saveTimerRef = useRef(null)
  const activeTimerRef = useRef(null)
  const previewTimerRef = useRef(null)
  const wordCountTimerRef = useRef(null)

  // Always-fresh refs — safe to use inside useCallback without deps
  const contentRef = useRef(content)
  const wikiQueryRef = useRef(wikiQuery)
  const isDirtyRef = useRef(isDirty)
  const prevFileIdRef = useRef(openFileId)
  // Holds latest openFileId + saveFile — avoids callback recreation
  const saveRef = useRef({ openFileId, saveFile })

  contentRef.current = content
  wikiQueryRef.current = wikiQuery
  isDirtyRef.current = isDirty
  saveRef.current = { openFileId, saveFile }

  // Stable save trigger — no deps needed, reads from refs
  const triggerSave = useCallback((value) => {
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const { openFileId: fid, saveFile: fn } = saveRef.current
      if (!fid) return
      setSaving(true)
      try {
        await fn(fid, value)
        setIsDirty(false)
      } catch (_) {
        // toast shown by saveFile in context
      } finally {
        setSaving(false)
      }
    }, AUTOSAVE_DELAY)
  }, [])

  // Sync content when the opened file changes
  useEffect(() => {
    const prevId = prevFileIdRef.current
    // Save pending changes before switching files
    if (prevId && openFileId && prevId !== openFileId && isDirtyRef.current) {
      clearTimeout(saveTimerRef.current)
      const { saveFile: fn } = saveRef.current
      fn(prevId, contentRef.current)
    }
    prevFileIdRef.current = openFileId
    const newContent = currentFile?.content || ''
    setContent(newContent)
    setPreviewContent(newContent)
    setIsDirty(false)
    clearTimeout(saveTimerRef.current)
  }, [currentFile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced word count
  useEffect(() => {
    clearTimeout(wordCountTimerRef.current)
    wordCountTimerRef.current = setTimeout(() => {
      const text = content.replace(/^---[\s\S]*?---\n?/, '').replace(/[#*`_~\[\]]/g, '')
      setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0)
    }, 400)
    return () => clearTimeout(wordCountTimerRef.current)
  }, [content])

  // Debounced preview — only updates 350ms after typing stops
  useEffect(() => {
    clearTimeout(previewTimerRef.current)
    previewTimerRef.current = setTimeout(() => setPreviewContent(content), 350)
    return () => clearTimeout(previewTimerRef.current)
  }, [content])

  // Wire up "Insert into note" for AI panel
  useEffect(() => {
    insertRef.current = (text) => {
      const ta = textareaRef.current
      if (!ta) return
      const pos = ta.selectionStart
      setContent(prev => {
        const newContent = prev.slice(0, pos) + '\n\n' + text + '\n\n' + prev.slice(pos)
        triggerSave(newContent)
        return newContent
      })
      setIsDirty(true)
      ta.focus()
    }
    return () => { insertRef.current = null }
  }, [insertRef, triggerSave])

  // AI active mode trigger (90s without typing)
  useEffect(() => {
    if (!currentFile) return
    const reset = () => {
      clearTimeout(activeTimerRef.current)
      activeTimerRef.current = setTimeout(async () => {
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
      clearTimeout(activeTimerRef.current)
    }
  }, [currentFile, toast])

  const handleChange = useCallback((e) => {
    const value = e.target.value
    setContent(value)
    setIsDirty(true)
    triggerSave(value)
    checkWikiLink(e.target)
  }, [triggerSave])

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
    if (!ta) return
    const wq = wikiQueryRef.current
    if (!wq) return
    const pos = ta.selectionStart
    const cur = contentRef.current
    const name = fileName.replace(/\.md$/i, '')
    const newValue = cur.slice(0, wq.openPos) + `[[${name}]]` + cur.slice(pos)
    setContent(newValue)
    setIsDirty(true)
    triggerSave(newValue)
    setWikiQuery(null)
    setTimeout(() => {
      const newPos = wq.openPos + name.length + 4
      ta.setSelectionRange(newPos, newPos)
      ta.focus()
    }, 0)
  }

  // Toolbar format actions — stable, reads content from ref
  const format = useCallback((before, after = '') => {
    const ta = textareaRef.current
    if (!ta) return
    const cur = contentRef.current
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const sel = cur.slice(start, end)
    const newContent = cur.slice(0, start) + before + sel + after + cur.slice(end)
    setContent(newContent)
    setIsDirty(true)
    triggerSave(newContent)
    setTimeout(() => {
      ta.setSelectionRange(start + before.length, start + before.length + sel.length)
      ta.focus()
    }, 0)
  }, [triggerSave])

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
    const cur = contentRef.current
    const newContent = cur.slice(0, pos) + imgMarkdown + cur.slice(pos)
    setContent(newContent)
    setIsDirty(true)
    triggerSave(newContent)
  }, [triggerSave])

  // Key shortcuts — stable, reads from refs (no stale closures)
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape' && wikiQueryRef.current) {
      setWikiQuery(null)
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = textareaRef.current
      const start = ta.selectionStart
      const cur = contentRef.current
      const newContent = cur.slice(0, start) + '  ' + cur.slice(start)
      setContent(newContent)
      setIsDirty(true)
      triggerSave(newContent)
      setTimeout(() => ta.setSelectionRange(start + 2, start + 2), 0)
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      clearTimeout(saveTimerRef.current)
      const { openFileId: fid, saveFile: fn } = saveRef.current
      fn(fid, contentRef.current)
      setIsDirty(false)
    }
  }, [triggerSave])

  const filteredFiles = wikiQuery
    ? fileNames.filter(f => f.name.toLowerCase().includes(wikiQuery.query.toLowerCase())).slice(0, 8)
    : []

  if (!currentFile) return null
  if (isGraphFile(currentFile)) return <GraphEditor />

  return (
    <div className="editor-container">
      <div className="editor-titlebar">
        <h2 className="editor-filename">{currentFile.name.replace(/\.md$/i, '')}</h2>
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

      {mode !== 'preview' && <EditorToolbar format={format} />}

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
            <Preview content={previewContent} />
          </div>
        )}
      </div>
    </div>
  )
}
