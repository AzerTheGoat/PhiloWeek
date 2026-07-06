import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/useApp'
import { parseQuestionnaireJson } from '../utils/questionnaireFile'
import Icon from './Icons'
import * as api from '../api'

const AUTOSAVE_DELAY = 800

export default function QuestionnaireEditor() {
  const { currentFile, openFileId, saveFile, tree, toast } = useApp()
  const [content, setContent] = useState(currentFile?.content || '')
  const [mode, setMode] = useState('split')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [scope, setScope] = useState('file')
  const [folderIds, setFolderIds] = useState(new Set())
  const [limit, setLimit] = useState(12)
  const [session, setSession] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [sourceModalOpen, setSourceModalOpen] = useState(false)
  const [sessionStartedAt, setSessionStartedAt] = useState(Date.now())
  const saveTimerRef = useRef(null)

  useEffect(() => {
    setContent(currentFile?.content || '')
    setDirty(false)
    clearTimeout(saveTimerRef.current)
    setSession([])
    setCurrentIndex(0)
    setAnswer('')
    setRevealed(false)
  }, [currentFile?.id])

  useEffect(() => () => clearTimeout(saveTimerRef.current), [])

  const parsed = useMemo(() => {
    try {
      return { data: parseQuestionnaireJson(content), error: null }
    } catch (err) {
      return { data: null, error: err.message }
    }
  }, [content])

  const folderOptions = useMemo(() => collectFolders(tree), [tree])
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
        scope,
        folder_ids: Array.from(folderIds),
        file_id: currentFile?.id,
        limit,
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
      toast(`${result.questions.length} question(s) chargee(s)`)
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [currentFile?.id, folderIds, limit, scope, toast])

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

  const toggleFolder = useCallback((id) => {
    setFolderIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

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

  if (!currentFile) return null

  return (
    <div className="questionnaire-editor">
      <div className="editor-titlebar">
        <h2 className="editor-filename">{currentFile.name.replace(/\.json$/i, '')}</h2>
        <div className="editor-meta">
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
        <button type="button" className="btn-primary" onClick={startSession}>
          <Icon name="question" size={16} /> Questionnaire random
        </button>
      </div>

      <div className={`questionnaire-body mode-${mode}`}>
        {mode !== 'preview' && (
          <div className="questionnaire-json-pane">
            <textarea
              value={content}
              onChange={handleChange}
              className="questionnaire-textarea"
              spellCheck={false}
              placeholder="Colle ton questionnaire JSON ici..."
            />
          </div>
        )}

        {mode !== 'edit' && (
          <div className="questionnaire-preview-pane">
            <QuestionnairePreview parsed={parsed} />
            <SourceFilesPanel
              files={fileOptions}
              selectedSourcePaths={selectedSourcePaths}
              onOpen={() => setSourceModalOpen(true)}
            />
            <QuizPanel
              scope={scope}
              setScope={setScope}
              folderOptions={folderOptions}
              folderIds={folderIds}
              toggleFolder={toggleFolder}
              limit={limit}
              setLimit={setLimit}
              startSession={startSession}
              session={session}
              currentIndex={currentIndex}
              currentQuestion={currentQuestion}
              answer={answer}
              setAnswer={setAnswer}
              revealed={revealed}
              setRevealed={setRevealed}
              recordResult={recordResult}
            />
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
    <section className="questionnaire-card source-files-card">
      <div className="questionnaire-preview-head">
        <div>
          <h3>Fichiers lies</h3>
          <p>Ces notes Markdown seront considerees comme le sujet de ce questionnaire.</p>
        </div>
        <span>{selectedFiles.length} / {files.length}</span>
      </div>
      <div className="source-files-summary">
        {selectedFiles.length === 0 ? (
          <p className="questionnaire-muted">Aucun fichier lie pour l'instant.</p>
        ) : (
          selectedFiles.slice(0, 5).map(file => (
            <span key={file.id}>{file.path.replace(/\.md$/i, '')}</span>
          ))
        )}
        {selectedFiles.length > 5 && <em>+ {selectedFiles.length - 5} autre(s)</em>}
      </div>
      <button type="button" className="btn-primary source-files-manage" onClick={onOpen}>
        <Icon name="folder" size={16} /> Gerer les fichiers lies
      </button>
    </section>
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

  return (
    <div className="modal-overlay source-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal source-files-modal">
        <div className="modal-header">
          <h3>Fichiers du questionnaire</h3>
          <button type="button" className="icon-btn" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal-body source-files-modal-body">
          <input
            autoFocus
            type="search"
            className="modal-input"
            placeholder="Rechercher un fichier ou dossier..."
            value={query}
            onChange={event => setQuery(event.target.value)}
          />

          <div className="source-modal-layout">
            <div className="source-modal-tree">
              {filteredTree.length === 0 ? (
                <p className="questionnaire-muted">Aucun fichier trouve.</p>
              ) : (
                <SourceTree
                  nodes={filteredTree}
                  draft={draft}
                  onToggleFile={toggleFile}
                  onSelectFolder={selectFolder}
                />
              )}
            </div>

            <aside className="source-modal-selection">
              <strong>{selectedFiles.length} selectionne(s)</strong>
              {selectedFiles.length === 0 ? (
                <p>Aucun fichier choisi.</p>
              ) : (
                selectedFiles.map(file => (
                  <button key={file.id} type="button" onClick={() => toggleFile(file)}>
                    <span>{file.path.replace(/\.md$/i, '')}</span>
                    <Icon name="close" size={14} />
                  </button>
                ))
              )}
            </aside>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-primary" onClick={() => onValidate(selectedFiles)}>
              Valider {selectedFiles.length} fichier(s)
            </button>
            <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
          </div>
        </div>
      </div>
    </div>
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
        <div className="source-tree-row is-folder" style={{ paddingLeft: `${8 + depth * 16}px` }}>
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
        <label className="source-tree-row" style={{ paddingLeft: `${30 + depth * 16}px` }}>
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
  scope,
  setScope,
  folderOptions,
  folderIds,
  toggleFolder,
  limit,
  setLimit,
  startSession,
  session,
  currentIndex,
  currentQuestion,
  answer,
  setAnswer,
  revealed,
  setRevealed,
  recordResult,
}) {
  const done = session.length > 0 && currentIndex >= session.length

  return (
    <section className="questionnaire-card quiz-card">
      <div className="questionnaire-preview-head">
        <div>
          <h3>Revision random</h3>
          <p>Les questions ratees reviennent plus souvent.</p>
        </div>
        {session.length > 0 && <span>{Math.min(currentIndex + 1, session.length)} / {session.length}</span>}
      </div>

      <div className="quiz-settings">
        <label>
          Source
          <select value={scope} onChange={event => setScope(event.target.value)}>
            <option value="file">Ce questionnaire</option>
            <option value="all">Tout le repo</option>
            <option value="folders">Dossiers choisis</option>
          </select>
        </label>
        <label>
          Nombre
          <input type="number" min="1" max="50" value={limit} onChange={event => setLimit(event.target.value)} />
        </label>
      </div>

      {scope === 'folders' && (
        <div className="quiz-folder-list">
          {folderOptions.length === 0 && <span>Aucun dossier disponible.</span>}
          {folderOptions.map(folder => (
            <label key={folder.id}>
              <input
                type="checkbox"
                checked={folderIds.has(folder.id)}
                onChange={() => toggleFolder(folder.id)}
              />
              {folder.path}
            </label>
          ))}
        </div>
      )}

      <button type="button" className="btn-primary quiz-start" onClick={startSession}>
        Lancer
      </button>

      {done && (
        <div className="quiz-done">
          <Icon name="question" size={28} />
          <strong>Session terminee</strong>
          <span>Relance une session pour recalculer les priorites.</span>
        </div>
      )}

      {currentQuestion && !done && (
        <div className="quiz-live">
          <span className="quiz-origin">{currentQuestion.questionnaire_title}</span>
          <h4>{currentQuestion.prompt}</h4>
          {currentQuestion.choices?.length > 0 && (
            <div className="quiz-choices">
              {currentQuestion.choices.map(choice => (
                <button key={choice} type="button" onClick={() => setAnswer(choice)}>
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
              <p>{currentQuestion.answer || 'Pas de correction renseignee.'}</p>
              {currentQuestion.explanation && <p>{currentQuestion.explanation}</p>}
              <div className="quiz-grade-actions">
                <button type="button" className="btn-danger" onClick={() => recordResult(false)}>Je me suis trompe</button>
                <button type="button" className="btn-primary" onClick={() => recordResult(true)}>J'avais juste</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function collectFolders(tree) {
  const folders = []
  function walk(nodes, prefix = '') {
    nodes.forEach(node => {
      if (node.type === 'folder') {
        const path = prefix ? `${prefix}/${node.name}` : node.name
        folders.push({ id: node.id, path })
        walk(node.children || [], path)
      }
    })
  }
  walk(tree || [])
  return folders
}

function collectMarkdownFiles(tree, prefix = '') {
  const files = []
  function walk(nodes, currentPrefix = '') {
    nodes.forEach(node => {
      const path = currentPrefix ? `${currentPrefix}/${node.name}` : node.name
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
