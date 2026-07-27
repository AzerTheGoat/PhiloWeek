import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/useApp'
import { parseQuestionnaireJson, removeQuestionFromQuestionnaire } from '../utils/questionnaireFile'
import Icon from './Icons'
import FileHistoryControls, { useFileHistoryActions } from './FileHistoryControls'
import * as api from '../api'
import { useFileScrollRestoration } from '../utils/useFileScrollRestoration'
import { loadReviewSession, saveReviewSession } from '../utils/reviewSessionMemory'

const AUTOSAVE_DELAY = 800
const REVIEW_LIMIT = 12

export default function QuestionnaireEditor() {
  const { currentFile, openFileId, openFile, saveFile, tree, toast } = useApp()
  const [content, setContent] = useState(currentFile?.content || '')
  const [mode, setMode] = useState('preview')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [session, setSession] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [sourceModalOpen, setSourceModalOpen] = useState(false)
  const [sessionStartedAt, setSessionStartedAt] = useState(Date.now())
  const saveTimerRef = useRef(null)
  const jsonPaneRef = useRef(null)
  const previewPaneRef = useRef(null)
  const reviewStateRef = useRef(null)

  reviewStateRef.current = { session, currentIndex, answer, revealed }

  useEffect(() => {
    setContent(currentFile?.content || '')
    setDirty(false)
    clearTimeout(saveTimerRef.current)
  }, [currentFile])

  useEffect(() => {
    const fileId = currentFile?.id
    if (!fileId) return undefined

    const saved = loadReviewSession('questionnaire', fileId)
    setSession(saved?.session || [])
    setCurrentIndex(saved?.currentIndex || 0)
    setAnswer(saved?.answer || '')
    setRevealed(Boolean(saved?.revealed))
    setSessionStartedAt(Date.now())

    return () => saveReviewSession('questionnaire', fileId, reviewStateRef.current)
  }, [currentFile?.id])

  useEffect(() => () => clearTimeout(saveTimerRef.current), [])

  const parsed = useMemo(() => {
    try {
      return { data: parseQuestionnaireJson(content), error: null }
    } catch (err) {
      return { data: null, error: err.message }
    }
  }, [content])

  const fileOptions = useMemo(() => collectMarkdownFiles(tree), [tree])
  const selectedSourcePaths = useMemo(
    () => new Set((parsed.data?.source_paths || []).map(normalizePath)),
    [parsed.data?.source_paths]
  )
  const currentQuestion = session[currentIndex] || null

  const triggerSave = useCallback((value) => {
    clearTimeout(saveTimerRef.current)
    setDirty(true)
    saveTimerRef.current = setTimeout(async () => {
      if (!openFileId) return
      setSaving(true)
      try {
        await saveFile(openFileId, value)
        setDirty(false)
      } catch (_) {
        // Le contexte affiche déjà l'erreur et conserve l'état non sauvegardé.
      } finally {
        setSaving(false)
      }
    }, AUTOSAVE_DELAY)
  }, [openFileId, saveFile])

  const handleChange = useCallback((event) => {
    const value = event.target.value
    setContent(value)
    triggerSave(value)
  }, [triggerSave])

  const formatJson = useCallback(() => {
    try {
      const formatted = JSON.stringify(JSON.parse(content), null, 2)
      setContent(formatted)
      triggerSave(formatted)
    } catch (err) {
      toast(`JSON invalide : ${err.message}`, 'error')
    }
  }, [content, toast, triggerSave])

  const startSession = useCallback(async () => {
    try {
      const result = await api.getQuestionnaireSession({
        scope: 'file',
        file_id: currentFile?.id,
        limit: REVIEW_LIMIT,
      })
      if (!result.questions.length) {
        toast('Aucune question trouvee pour cette selection', 'error')
        return
      }
      setSession(result.questions)
      setCurrentIndex(0)
      setAnswer('')
      setRevealed(false)
      setSessionStartedAt(Date.now())
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) setMode('preview')
      toast(`${result.questions.length} question(s) chargee(s)`)
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [currentFile?.id, toast])

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
        response_ms: Date.now() - sessionStartedAt,
      })
      const nextIndex = currentIndex + 1
      setAnswer('')
      setRevealed(false)
      setSessionStartedAt(Date.now())
      if (nextIndex >= session.length) {
        setCurrentIndex(session.length)
        toast('Session terminee')
      } else {
        setCurrentIndex(nextIndex)
      }
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [answer, currentIndex, currentQuestion, session.length, sessionStartedAt, toast])

  const deleteCurrentQuestion = useCallback(() => {
    if (!currentQuestion) return
    if (!window.confirm('Supprimer définitivement cette question du fichier JSON ?')) return
    try {
      const nextContent = removeQuestionFromQuestionnaire(content, currentQuestion)
      setContent(nextContent)
      triggerSave(nextContent)
      setSession(previous => previous.filter((_, index) => index !== currentIndex))
      setAnswer('')
      setRevealed(false)
      toast('Question supprimée du questionnaire')
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [content, currentIndex, currentQuestion, toast, triggerSave])

  const saveSourceFiles = useCallback((selectedFiles) => {
    if (parsed.error) {
      toast('Corrige le JSON avant de lier des fichiers', 'error')
      return
    }
    try {
      const json = parseQuestionnaireJson(content)
      const next = {
        ...json,
        source_paths: selectedFiles.map(file => file.path),
        source_file_ids: selectedFiles.map(file => file.id),
        modified: new Date().toISOString(),
      }
      const formatted = JSON.stringify(next, null, 2)
      setContent(formatted)
      triggerSave(formatted)
      setSourceModalOpen(false)
      toast(`${selectedFiles.length} fichier(s) lie(s) au questionnaire`)
    } catch (err) {
      toast(`JSON invalide : ${err.message}`, 'error')
    }
  }, [content, parsed.error, toast, triggerSave])

  const flushPending = useCallback(async () => {
    if (!dirty || !openFileId) return null
    clearTimeout(saveTimerRef.current)
    setSaving(true)
    try {
      const result = await saveFile(openFileId, content)
      setDirty(false)
      return result
    } finally {
      setSaving(false)
    }
  }, [content, dirty, openFileId, saveFile])

  const applyHistoryContent = useCallback((value) => {
    clearTimeout(saveTimerRef.current)
    setContent(value)
    setDirty(false)
    setSession([])
    setCurrentIndex(0)
  }, [])

  const history = useFileHistoryActions({ flushPending, applyContent: applyHistoryContent, hasPending: dirty })

  useFileScrollRestoration(openFileId, 'questionnaire-json', jsonPaneRef, mode !== 'preview')
  useFileScrollRestoration(openFileId, 'questionnaire-preview', previewPaneRef, mode !== 'edit')

  if (!currentFile) return null

  return (
    <div className={`questionnaire-editor ${session.length > 0 ? 'is-reviewing' : ''}`}>
      <div className="editor-titlebar">
        <h2 className="editor-filename">{currentFile.name.replace(/\.json$/i, '')}</h2>
        <div className="editor-meta">
          <FileHistoryControls history={history} />
          <span className={`save-status ${dirty ? 'dirty' : ''}`}>
            {saving ? 'Enregistrement...' : dirty ? 'non sauvegarde' : 'sauvegarde'}
          </span>
          <div className="view-toggle">
            <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>Editer</button>
            <button className={mode === 'split' ? 'active' : ''} onClick={() => setMode('split')}>Split</button>
            <button className={mode === 'preview' ? 'active' : ''} onClick={() => setMode('preview')}>Apercu</button>
          </div>
        </div>
      </div>

      <div className="questionnaire-toolbar">
        <button type="button" className="btn-ghost" onClick={formatJson}>
          <Icon name="synthesis" size={16} /> Formater JSON
        </button>
      </div>

      <div className={`questionnaire-body mode-${mode}`}>
        {mode !== 'preview' && (
          <div className="questionnaire-json-pane">
            <textarea
              ref={jsonPaneRef}
              value={content}
              onChange={handleChange}
              className="questionnaire-textarea"
              spellCheck={false}
              placeholder="Colle ton questionnaire JSON ici..."
            />
          </div>
        )}

        {mode !== 'edit' && (
          <div className="questionnaire-preview-pane" ref={previewPaneRef}>
            <SourceFilesPanel
              files={fileOptions}
              selectedSourcePaths={selectedSourcePaths}
              onOpen={() => setSourceModalOpen(true)}
            />
            <QuizPanel
              startSession={startSession}
              session={session}
              currentIndex={currentIndex}
              currentQuestion={currentQuestion}
              answer={answer}
              setAnswer={setAnswer}
              revealed={revealed}
              setRevealed={setRevealed}
              recordResult={recordResult}
              openSource={() => currentQuestion?.source_file_id && openFile(currentQuestion.source_file_id)}
              deleteCurrentQuestion={deleteCurrentQuestion}
            />
            <QuestionnairePreview parsed={parsed} />
          </div>
        )}
      </div>

      {sourceModalOpen && (
        <SourceFilesModal
          tree={tree}
          files={fileOptions}
          selectedSourcePaths={selectedSourcePaths}
          onClose={() => setSourceModalOpen(false)}
          onValidate={saveSourceFiles}
        />
      )}
    </div>
  )
}

function QuestionnairePreview({ parsed }) {
  if (parsed.error) {
    return (
      <section className="questionnaire-card is-error">
        <strong>JSON invalide</strong>
        <span>{parsed.error}</span>
      </section>
    )
  }

  const data = parsed.data || {}
  const questions = data.questions || []
  return (
    <section className="questionnaire-card">
      <div className="questionnaire-preview-head">
        <div>
          <h3>{data.title || 'Questionnaire'}</h3>
          {data.description && <p>{data.description}</p>}
        </div>
        <span>{questions.length} question(s)</span>
      </div>
      <div className="questionnaire-question-list">
        {questions.length === 0 && <p className="questionnaire-muted">Ajoute des questions dans le JSON.</p>}
        {questions.map((question, index) => (
          <article key={question.id || index} className="questionnaire-question-preview">
            <span>{question.type || 'open'}</span>
            <strong>{question.prompt || question.question || question.text || `Question ${index + 1}`}</strong>
            {(question.answer || question.expected_answer) && <p>{question.answer || question.expected_answer}</p>}
          </article>
        ))}
      </div>
    </section>
  )
}

function SourceFilesPanel({ files, selectedSourcePaths, onOpen }) {
  const selectedFiles = files.filter(file => selectedSourcePaths.has(normalizePath(file.path)))
  return (
    <button type="button" className="btn-ghost questionnaire-quick-action" onClick={onOpen}>
      <Icon name="folder" size={16} />
      {selectedFiles.length > 0 ? `Notes liées · ${selectedFiles.length}` : 'Lier des notes'}
    </button>
  )
}

function SourceFilesModal({ tree, files, selectedSourcePaths, onClose, onValidate }) {
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState(() => new Set(selectedSourcePaths))
  const selectedFiles = files.filter(file => draft.has(normalizePath(file.path)))
  const filteredTree = useMemo(() => filterMarkdownTree(tree, query), [tree, query])

  const toggleFile = useCallback((file) => {
    setDraft(prev => {
      const next = new Set(prev)
      const key = normalizePath(file.path)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const selectFolder = useCallback((node, checked) => {
    const folderFiles = collectMarkdownFiles([node])
    setDraft(prev => {
      const next = new Set(prev)
      folderFiles.forEach(file => {
        const key = normalizePath(file.path)
        if (checked) next.add(key)
        else next.delete(key)
      })
      return next
    })
  }, [])

  const selectVisible = useCallback(() => {
    const visibleFiles = collectMarkdownFiles(filteredTree)
    setDraft(prev => {
      const next = new Set(prev)
      visibleFiles.forEach(file => next.add(normalizePath(file.path)))
      return next
    })
  }, [filteredTree])

  const clearSelection = useCallback(() => setDraft(new Set()), [])

  return (
    <>
      <div className="picker-backdrop" data-focus-layer onClick={onClose} />
      <div className="picker-panel source-link-panel">
        <div className="picker-header">
          <h3>Fichiers du questionnaire</h3>
          <div className="picker-header-actions">
            <button type="button" className="picker-select-all-btn" onClick={selectVisible}>Tout selectionner</button>
            <button type="button" className="icon-btn" onClick={onClose}>
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>

        <div className="source-link-search">
          <input
            autoFocus
            type="search"
            className="search-input"
            placeholder="Rechercher un fichier ou dossier..."
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </div>

        <div className="source-link-summary">
          {selectedFiles.length === 0 ? (
            <span>Aucun fichier selectionne</span>
          ) : (
            <>
              <span>{selectedFiles.length} fichier(s) selectionne(s)</span>
              <button type="button" onClick={clearSelection}>Vider</button>
            </>
          )}
        </div>

        <div className="picker-tree-container source-link-tree-container">
          {filteredTree.length === 0 ? (
            <p className="source-link-empty">Aucun fichier trouve.</p>
          ) : (
            <SourceTree
              nodes={filteredTree}
              draft={draft}
              onToggleFile={toggleFile}
              onSelectFolder={selectFolder}
            />
          )}
        </div>

        {selectedFiles.length > 0 && (
          <div className="source-link-selection-strip">
            {selectedFiles.slice(0, 4).map(file => (
              <button key={file.id} type="button" onClick={() => toggleFile(file)}>
                <span>{file.path.replace(/\.md$/i, '')}</span>
                <Icon name="close" size={13} />
              </button>
            ))}
            {selectedFiles.length > 4 && <em>+ {selectedFiles.length - 4} autre(s)</em>}
          </div>
        )}

        <div className="picker-footer">
          <span className="picker-count">
            {selectedFiles.length > 0 ? `${selectedFiles.length} fichier(s) lie(s)` : 'Aucun fichier selectionne'}
          </span>
          <div className="picker-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
            <button type="button" className="btn-primary" onClick={() => onValidate(selectedFiles)}>
              Valider
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function SourceTree({ nodes, draft, onToggleFile, onSelectFolder, depth = 0 }) {
  return (
    <ul className={`source-tree ${depth === 0 ? 'root' : ''}`}>
      {nodes.map(node => (
        <SourceTreeNode
          key={node.id}
          node={node}
          draft={draft}
          onToggleFile={onToggleFile}
          onSelectFolder={onSelectFolder}
          depth={depth}
        />
      ))}
    </ul>
  )
}

function SourceTreeNode({ node, draft, onToggleFile, onSelectFolder, depth }) {
  const [expanded, setExpanded] = useState(depth < 1)
  const isFolder = node.type === 'folder'
  const children = node.children || []
  const markdownFiles = isFolder ? collectMarkdownFiles([node]) : []
  const checkedCount = markdownFiles.filter(file => draft.has(normalizePath(file.path))).length
  const allChecked = markdownFiles.length > 0 && checkedCount === markdownFiles.length
  const partial = checkedCount > 0 && checkedCount < markdownFiles.length

  return (
    <li>
      {isFolder ? (
        <div className="source-tree-row picker-row is-folder" style={{ paddingLeft: `${12 + depth * 16}px` }}>
          <button type="button" onClick={() => setExpanded(value => !value)}>
            {expanded ? '▾' : '▸'}
          </button>
          <input
            type="checkbox"
            checked={allChecked}
            ref={el => { if (el) el.indeterminate = partial }}
            onChange={event => onSelectFolder(node, event.target.checked)}
          />
          <span onClick={() => setExpanded(value => !value)}>{node.name}</span>
          <em>{checkedCount}/{markdownFiles.length}</em>
        </div>
      ) : (
        <label className="source-tree-row picker-row" style={{ paddingLeft: `${34 + depth * 16}px` }}>
          <input
            type="checkbox"
            checked={draft.has(normalizePath(node.path))}
            onChange={() => onToggleFile(node)}
          />
          <span>{node.name.replace(/\.md$/i, '')}</span>
        </label>
      )}
      {isFolder && expanded && children.length > 0 && (
        <SourceTree
          nodes={children}
          draft={draft}
          onToggleFile={onToggleFile}
          onSelectFolder={onSelectFolder}
          depth={depth + 1}
        />
      )}
    </li>
  )
}

function QuizPanel({
  startSession,
  session,
  currentIndex,
  currentQuestion,
  answer,
  setAnswer,
  revealed,
  setRevealed,
  recordResult,
  openSource,
  deleteCurrentQuestion,
}) {
  const done = session.length > 0 && currentIndex >= session.length
  const choices = getQuestionChoices(currentQuestion)

  if (session.length === 0) {
    return (
      <button type="button" className="btn-primary questionnaire-quick-action" onClick={startSession}>
        <Icon name="play" size={17} /> Commencer une révision
      </button>
    )
  }

  return (
    <section className="questionnaire-card quiz-card has-session">
      <div className="questionnaire-preview-head">
        <div>
          <h3>Revision random</h3>
          <p>Les questions ratees reviennent plus souvent.</p>
        </div>
        <span>{Math.min(currentIndex + 1, session.length)} / {session.length}</span>
      </div>

      {done && (
        <div className="quiz-done">
          <Icon name="question" size={28} />
          <strong>Session terminee</strong>
          <span>Relance une session pour recalculer les priorites.</span>
          <button type="button" className="btn-primary" onClick={startSession}>Recommencer</button>
        </div>
      )}

      {currentQuestion && !done && (
        <div className={`quiz-live quiz-flashcard ${revealed ? 'is-revealed' : ''}`}>
          <div className="quiz-flashcard-scroll">
            <span className="quiz-origin">{currentQuestion.questionnaire_title}</span>
            <span className="quiz-type">{getQuestionTypeLabel(currentQuestion.type)}</span>
            <h4>{currentQuestion.prompt}</h4>
            {!revealed && choices.length > 0 && (
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
            {!revealed && (
              <textarea
                className="quiz-answer-field"
                value={answer}
                onChange={event => setAnswer(event.target.value)}
                placeholder="Ta reponse..."
              />
            )}
            {revealed && (
              <div className="quiz-correction">
              <strong>Correction</strong>
              <p>{currentQuestion.answer || 'Pas de correction renseignee.'}</p>
              {currentQuestion.explanation && <p>{currentQuestion.explanation}</p>}
              </div>
            )}
          </div>
          <div className="quiz-flashcard-actions">
            <div className="quiz-card-tools">
              {currentQuestion.source_file_id && (
                <button type="button" className="btn-ghost quiz-source-btn" onClick={openSource}>
                  <Icon name="folder" size={16} /> Voir la source
                  {currentQuestion.source_file_name && <span>{currentQuestion.source_file_name.replace(/\.md$/i, '')}</span>}
                </button>
              )}
              <button type="button" className="btn-ghost danger quiz-delete-question" onClick={deleteCurrentQuestion}>
                <Icon name="trash" size={16} /> Supprimer la question
              </button>
            </div>
            {!revealed ? (
              <>
                <span className="quiz-mental-hint">Pense à ta réponse, puis retourne la carte.</span>
                <button type="button" className="btn-primary quiz-reveal-btn" onClick={() => setRevealed(true)}>
                  <Icon name="eye" size={18} /> Afficher la solution
                </button>
              </>
            ) : (
              <div className="quiz-grade-actions">
                <button type="button" className="btn-danger quiz-grade-no" onClick={() => recordResult(false)}><Icon name="close" size={18} /> À revoir</button>
                <button type="button" className="btn-primary quiz-grade-ok" onClick={() => recordResult(true)}><Icon name="check" size={18} /> Je savais</button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function collectMarkdownFiles(tree, prefix = '') {
  const files = []
  function walk(nodes, currentPrefix = '') {
    nodes.forEach(node => {
      const path = node.path || (currentPrefix ? `${currentPrefix}/${node.name}` : node.name)
      if (node.type === 'file' && /\.md$/i.test(node.name)) {
        files.push({ id: node.id, path, name: node.name })
      }
      if (node.children) walk(node.children, path)
    })
  }
  walk(tree || [], prefix)
  return files
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').trim().toLowerCase()
}

function getQuestionChoices(question) {
  if (!question) return []
  if (Array.isArray(question.choices) && question.choices.length > 0) return question.choices
  if (question.type === 'true_false') return ['Vrai', 'Faux']
  return []
}

function getQuestionTypeLabel(type) {
  if (type === 'definition') return 'Definition'
  if (type === 'mcq') return 'QCM'
  if (type === 'true_false') return 'Vrai / Faux'
  return 'Question ouverte'
}

function filterMarkdownTree(nodes, query, prefix = '') {
  const q = normalizePath(query)
  const result = []
  for (const node of nodes || []) {
    if (node.type === 'locked_folder') continue
    const path = prefix ? `${prefix}/${node.name}` : node.name
    if (node.type === 'file') {
      if (/\.md$/i.test(node.name) && (!q || normalizePath(path).includes(q))) {
        result.push({ ...node, path })
      }
      continue
    }
    if (node.type === 'folder') {
      const children = filterMarkdownTree(node.children || [], query, path)
      if (children.length > 0 || (!q && collectMarkdownFiles([node], prefix).length > 0)) {
        result.push({ ...node, path, children })
      }
    }
  }
  return result
}
