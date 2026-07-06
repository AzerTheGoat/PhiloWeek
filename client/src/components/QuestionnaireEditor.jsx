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
