import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../context/useApp'
import EditorToolbar from './EditorToolbar'
import Preview from './Preview'
import GraphEditor from './GraphEditor'
import QuestionnaireEditor from './QuestionnaireEditor'
import DefinitionsEditor from './DefinitionsEditor'
import HandwritingPanel from './HandwritingPanel'
import Icon from './Icons'
import { isGraphFile } from '../utils/graphFile'
import { isQuestionnaireFile } from '../utils/questionnaireFile'
import { isDefinitionsFile } from '../utils/definitionsFile'
import * as api from '../api'

const AUTOSAVE_DELAY = 800
const LOCAL_HISTORY_LIMIT = 250
const TYPING_GROUP_DELAY = 700

function initialMode() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches ? 'edit' : 'preview'
}

export default function Editor() {
  const { currentFile, openFileId, saveFile, toast, fileNames, insertRef } = useApp()

  // Content is LOCAL state — never dispatched to global context
  const [content, setContent] = useState(currentFile?.content || '')
  const [isDirty, setIsDirty] = useState(false)
  const [mode, setMode] = useState(initialMode)
  const [wordCount, setWordCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [handwritingOpen, setHandwritingOpen] = useState(false)
  const [wikiQuery, setWikiQuery] = useState(null)
  // Debounced content for Preview — avoids re-rendering preview on every keystroke
  const [previewContent, setPreviewContent] = useState(currentFile?.content || '')

  const textareaRef = useRef(null)
  const saveTimerRef = useRef(null)
  const handwritingAnchorRef = useRef(0)
  const previewTimerRef = useRef(null)
  const wordCountTimerRef = useRef(null)
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  const historyGroupRef = useRef({ type: null, at: 0 })
  const selectionRef = useRef({ start: 0, end: 0 })

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

  // Resynchronise le contenu local à chaque (ré)ouverture de fichier.
  // On dépend de l'OBJET `currentFile`, pas de `currentFile.content` :
  //   - `saveFile` ne met jamais à jour `currentFile`, donc pendant la frappe
  //     la référence ne change pas → aucune resynchro intempestive, la frappe
  //     est préservée.
  //   - `openFile` (déclenché notamment par le retour en arrière Ctrl+Z)
  //     produit TOUJOURS un nouvel objet `currentFile`, même si le contenu
  //     restauré est identique à la valeur de base précédente → l'éditeur
  //     recharge alors le contenu serveur et abandonne son état local périmé.
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
    undoStackRef.current = []
    redoStackRef.current = []
    historyGroupRef.current = { type: null, at: 0 }
    selectionRef.current = { start: 0, end: 0 }
    // Annule tout autosave en attente : évite qu'une frappe non sauvegardée
    // ré-écrase le contenu qu'on vient de restaurer.
    clearTimeout(saveTimerRef.current)
  }, [currentFile]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const rememberLocalChange = useCallback((groupType = null) => {
    const now = Date.now()
    const previousGroup = historyGroupRef.current
    const grouped = groupType && previousGroup.type === groupType && now - previousGroup.at <= TYPING_GROUP_DELAY

    if (!grouped) {
      undoStackRef.current.push({
        content: contentRef.current,
        start: selectionRef.current.start,
        end: selectionRef.current.end,
      })
      if (undoStackRef.current.length > LOCAL_HISTORY_LIMIT) undoStackRef.current.shift()
    }
    redoStackRef.current = []
    historyGroupRef.current = { type: groupType, at: now }
  }, [])

  const applyLocalHistory = useCallback((direction) => {
    const source = direction === 'redo' ? redoStackRef.current : undoStackRef.current
    const destination = direction === 'redo' ? undoStackRef.current : redoStackRef.current
    const target = source.pop()
    if (!target) return false

    destination.push({
      content: contentRef.current,
      start: textareaRef.current?.selectionStart ?? selectionRef.current.start,
      end: textareaRef.current?.selectionEnd ?? selectionRef.current.end,
    })
    if (destination.length > LOCAL_HISTORY_LIMIT) destination.shift()

    historyGroupRef.current = { type: null, at: 0 }
    contentRef.current = target.content
    selectionRef.current = { start: target.start, end: target.end }
    setContent(target.content)
    setIsDirty(true)
    triggerSave(target.content)
    setTimeout(() => {
      const textarea = textareaRef.current
      textarea?.setSelectionRange(target.start, target.end)
      textarea?.focus()
    }, 0)
    return true
  }, [triggerSave])

  const requestHistory = useCallback((direction) => {
    if (applyLocalHistory(direction)) return
    window.dispatchEvent(new CustomEvent('app-history-command', { detail: { direction } }))
  }, [applyLocalHistory])

  useEffect(() => {
    insertRef.current = (text) => {
      const textarea = textareaRef.current
      if (!textarea) return
      const position = textarea.selectionStart
      const current = contentRef.current
      const next = current.slice(0, position) + '\n\n' + text + '\n\n' + current.slice(position)
      rememberLocalChange()
      contentRef.current = next
      setContent(next)
      setIsDirty(true)
      triggerSave(next)
      textarea.focus()
    }
    return () => { insertRef.current = null }
  }, [insertRef, rememberLocalChange, triggerSave])

  const handleChange = useCallback((e) => {
    const value = e.target.value
    if (value === contentRef.current) return
    const inputType = e.nativeEvent?.inputType || ''
    const typing = inputType.startsWith('insertText') || inputType.startsWith('deleteContent') || inputType === 'insertCompositionText'
    rememberLocalChange(typing ? 'typing' : null)
    selectionRef.current = { start: e.target.selectionStart, end: e.target.selectionEnd }
    contentRef.current = value
    setContent(value)
    setIsDirty(true)
    triggerSave(value)
    checkWikiLink(e.target)
  }, [rememberLocalChange, triggerSave])

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
    rememberLocalChange()
    contentRef.current = newValue
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
    rememberLocalChange()
    contentRef.current = newContent
    setContent(newContent)
    setIsDirty(true)
    triggerSave(newContent)
    setTimeout(() => {
      ta.setSelectionRange(start + before.length, start + before.length + sel.length)
      ta.focus()
    }, 0)
  }, [rememberLocalChange, triggerSave])

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
    rememberLocalChange()
    contentRef.current = newContent
    setContent(newContent)
    setIsDirty(true)
    triggerSave(newContent)
  }, [rememberLocalChange, triggerSave])

  // Key shortcuts — stable, reads from refs (no stale closures)
  const handleKeyDown = useCallback((e) => {
    const key = (e.key || '').toLowerCase()
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (key === 'z') {
        e.preventDefault()
        requestHistory(e.shiftKey ? 'redo' : 'undo')
        return
      }
      if (key === 'y' && !e.shiftKey) {
        e.preventDefault()
        requestHistory('redo')
        return
      }
    }
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
      rememberLocalChange()
      contentRef.current = newContent
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
  }, [rememberLocalChange, requestHistory, triggerSave])

  const filteredFiles = wikiQuery
    ? fileNames.filter(f => f.name.toLowerCase().includes(wikiQuery.query.toLowerCase())).slice(0, 8)
    : []

  const openHandwriting = useCallback(() => {
    const textarea = textareaRef.current
    const cursorIsActive = textarea && document.activeElement === textarea
    handwritingAnchorRef.current = cursorIsActive ? textarea.selectionStart : contentRef.current.length
    setHandwritingOpen(true)
  }, [])

  const insertHandwriting = useCallback((text) => {
    const cur = contentRef.current
    const position = Math.min(handwritingAnchorRef.current, cur.length)
    const before = cur.slice(0, position)
    const after = cur.slice(position)
    const prefix = before && !/[\s\n]$/.test(before) ? ' ' : ''
    const suffix = after && !/^[\s\n.,;:!?)]/.test(after) ? ' ' : ''
    const inserted = `${prefix}${text.trim()}${suffix}`
    const newContent = before + inserted + after
    const nextPosition = position + inserted.length
    rememberLocalChange()
    contentRef.current = newContent
    setContent(newContent)
    setIsDirty(true)
    triggerSave(newContent)
    setHandwritingOpen(false)
    setTimeout(() => {
      const textarea = textareaRef.current
      textarea?.setSelectionRange(nextPosition, nextPosition)
      textarea?.focus()
    }, 0)
  }, [rememberLocalChange, triggerSave])

  if (!currentFile) return null
  if (isGraphFile(currentFile)) return <GraphEditor />
  if (isDefinitionsFile(currentFile)) return <DefinitionsEditor />
  if (isQuestionnaireFile(currentFile)) return <QuestionnaireEditor />

  return (
    <div className="editor-container">
      <div className="editor-titlebar">
        <h2 className="editor-filename">{currentFile.name.replace(/\.md$/i, '')}</h2>
        <div className="editor-meta">
          <LinkedQuizLauncher currentFile={currentFile} />
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

      {mode !== 'preview' && (
        <EditorToolbar
          format={format}
          onHandwriting={openHandwriting}
          handwritingOpen={handwritingOpen}
          onUndo={() => requestHistory('undo')}
          onRedo={() => requestHistory('redo')}
        />
      )}

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
              onSelect={event => {
                selectionRef.current = {
                  start: event.currentTarget.selectionStart,
                  end: event.currentTarget.selectionEnd,
                }
              }}
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
      {handwritingOpen && (
        <HandwritingPanel
          onClose={() => setHandwritingOpen(false)}
          onInsert={insertHandwriting}
        />
      )}
    </div>
  )
}

function LinkedQuizLauncher({ currentFile }) {
  const { toast } = useApp()
  const [linked, setLinked] = useState([])
  const [loading, setLoading] = useState(false)
  const [session, setSession] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [startedAt, setStartedAt] = useState(Date.now())

  useEffect(() => {
    let cancelled = false
    setLinked([])
    setSession([])
    if (!currentFile?.id) return
    api.getLinkedQuestionnaires(currentFile.id)
      .then(rows => { if (!cancelled) setLinked(rows) })
      .catch(() => { if (!cancelled) setLinked([]) })
    return () => { cancelled = true }
  }, [currentFile?.id])

  const startQuiz = useCallback(async () => {
    if (!currentFile?.id || loading) return
    setLoading(true)
    try {
      const result = await api.getQuestionnaireSession({
        scope: 'linked_file',
        file_id: currentFile.id,
        limit: 12,
      })
      if (!result.questions.length) {
        toast('Aucun quiz lie a cette note', 'error')
        return
      }
      setSession(result.questions)
      setCurrentIndex(0)
      setAnswer('')
      setRevealed(false)
      setStartedAt(Date.now())
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [currentFile?.id, loading, toast])

  const currentQuestion = session[currentIndex] || null
  const done = session.length > 0 && currentIndex >= session.length

  const recordResult = useCallback(async (correct) => {
    if (!currentQuestion) return
    try {
      await api.saveQuestionnaireResult({
        question_key: currentQuestion.question_key,
        questionnaire_file_id: currentQuestion.questionnaire_file_id,
        questionnaire_title: currentQuestion.questionnaire_title,
        question_id: currentQuestion.question_id,
        question_text: currentQuestion.prompt,
        answer_text: answer,
        expected_answer: currentQuestion.answer,
        correct,
        score: correct ? 1 : 0,
        response_ms: Date.now() - startedAt,
      })
      const nextIndex = currentIndex + 1
      setAnswer('')
      setRevealed(false)
      setStartedAt(Date.now())
      if (nextIndex >= session.length) {
        setCurrentIndex(session.length)
        toast('Quiz termine')
      } else {
        setCurrentIndex(nextIndex)
      }
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [answer, currentIndex, currentQuestion, session.length, startedAt, toast])
  const choices = getQuestionChoices(currentQuestion)

  return (
    <>
      <button
        type="button"
        className="btn-ghost editor-quiz-btn"
        onClick={startQuiz}
        disabled={loading || linked.length === 0}
        title={linked.length === 0 ? 'Aucun questionnaire lie a cette note' : `${linked.length} questionnaire(s) lie(s)`}
      >
        <Icon name="question" size={15} /> Quiz
      </button>

      {session.length > 0 && (
        <div className="linked-quiz-panel">
          <div className="linked-quiz-head">
            <strong>Quiz lie</strong>
            <span>{done ? session.length : Math.min(currentIndex + 1, session.length)} / {session.length}</span>
            <button type="button" className="icon-btn" onClick={() => setSession([])}>
              <Icon name="close" size={16} />
            </button>
          </div>

          {done ? (
            <div className="linked-quiz-done">
              <strong>Session terminee</strong>
              <button type="button" className="btn-primary" onClick={startQuiz}>Relancer</button>
            </div>
          ) : (
            <div className="linked-quiz-live">
              <span>{currentQuestion?.questionnaire_title}</span>
              <span className="quiz-type">{getQuestionTypeLabel(currentQuestion?.type)}</span>
              <h3>{currentQuestion?.prompt}</h3>
              {choices.length > 0 && (
                <div className="quiz-choices">
                  {choices.map(choice => (
                    <button
                      key={choice}
                      type="button"
                      className={answer === choice ? 'active' : ''}
                      onClick={() => setAnswer(choice)}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                value={answer}
                onChange={event => setAnswer(event.target.value)}
                placeholder="Ta reponse..."
              />
              {!revealed ? (
                <button type="button" className="btn-ghost" onClick={() => setRevealed(true)}>
                  Voir la correction
                </button>
              ) : (
                <div className="quiz-correction">
                  <strong>Correction</strong>
                  <p>{currentQuestion?.answer || 'Pas de correction renseignee.'}</p>
                  {currentQuestion?.explanation && <p>{currentQuestion.explanation}</p>}
                  <div className="quiz-grade-actions">
                    <button type="button" className="btn-danger" onClick={() => recordResult(false)}>Faux</button>
                    <button type="button" className="btn-primary" onClick={() => recordResult(true)}>Juste</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function getQuestionChoices(question) {
  if (!question) return []
  if (Array.isArray(question.choices) && question.choices.length > 0) return question.choices
  if (question.type === 'true_false') return ['Vrai', 'Faux']
  return []
}

function getQuestionTypeLabel(type) {
  if (type === 'mcq') return 'QCM'
  if (type === 'true_false') return 'Vrai / Faux'
  return 'Question ouverte'
}
