import { useCallback, useMemo, useState } from 'react'
import { useApp } from '../context/useApp'
import Icon from './Icons'
import * as api from '../api'

export default function GlobalQuizLauncher() {
  const { tree, dispatch, toast } = useApp()
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [limit, setLimit] = useState(12)
  const [loading, setLoading] = useState(false)
  const [session, setSession] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [startedAt, setStartedAt] = useState(Date.now())
  const [sessionResults, setSessionResults] = useState([])
  const [stopped, setStopped] = useState(false)

  const selectedFiles = useMemo(() => collectSelectedFiles(tree, selectedIds), [tree, selectedIds])
  const currentQuestion = session[currentIndex] || null
  const done = session.length > 0 && (currentIndex >= session.length || stopped)
  const choices = getQuestionChoices(currentQuestion)
  const report = useMemo(() => buildSessionReport(session, sessionResults, stopped), [session, sessionResults, stopped])

  const close = () => dispatch({ type: 'TOGGLE_QUIZ_LAUNCHER' })

  const handleToggle = useCallback((id, force) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (force === true) next.add(id)
      else if (force === false) next.delete(id)
      else if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(collectReviewSourceFiles(tree).map(file => file.id)))
  }, [tree])

  const startQuiz = useCallback(async () => {
    if (selectedFiles.length === 0) {
      toast('Selectionne au moins un fichier', 'error')
      return
    }
    setLoading(true)
    try {
      const result = await api.getQuestionnaireSession({
        scope: 'source_files',
        file_ids: selectedFiles.map(file => file.id),
        limit,
      })
      if (!result.questions.length) {
        toast('Aucune question liee a ces fichiers', 'error')
        return
      }
      setSession(result.questions)
      setCurrentIndex(0)
      setAnswer('')
      setRevealed(false)
      setStartedAt(Date.now())
      setSessionResults([])
      setStopped(false)
      toast(`${result.questions.length} question(s) chargee(s)`)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [limit, selectedFiles, toast])

  const recordResult = useCallback(async (correct) => {
    if (!currentQuestion) return
    try {
      const resultPayload = {
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
      }
      await api.saveQuestionnaireResult(resultPayload)
      setSessionResults(prev => [...prev, resultPayload])
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

  const stopQuiz = useCallback(() => {
    setStopped(true)
    setAnswer('')
    setRevealed(false)
  }, [])

  const backToSources = useCallback(() => {
    setSession([])
    setSessionResults([])
    setCurrentIndex(0)
    setAnswer('')
    setRevealed(false)
    setStopped(false)
  }, [])

  return (
    <>
      <div className="picker-backdrop" data-focus-layer onClick={close} />
      <div className="picker-panel global-quiz-panel">
        <div className="picker-header">
          <h3>Reviser</h3>
          <div className="picker-header-actions">
            {session.length === 0 && (
              <button type="button" className="picker-select-all-btn" onClick={selectAll}>Tout selectionner</button>
            )}
            <button type="button" className="icon-btn" onClick={close}>
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>

        {session.length === 0 && (
          <div className="global-quiz-settings">
            <label>
              Nombre de questions
              <input
                type="number"
                min="1"
                max="50"
                value={limit}
                onChange={event => setLimit(Math.max(1, Math.min(50, Number(event.target.value) || 1)))}
              />
            </label>
          </div>
        )}

        {session.length === 0 ? (
          <div className="picker-tree-container">
            <QuizSourceTree nodes={tree} selectedIds={selectedIds} onToggle={handleToggle} />
          </div>
        ) : (
          <div className={`global-quiz-live ${!done ? 'quiz-flashcard' : ''} ${revealed && !done ? 'is-revealed' : ''}`}>
            {done ? (
              <div className="quiz-done global-quiz-report">
                <Icon name="question" size={28} />
                <strong>{stopped ? 'Session arretee' : 'Session terminee'}</strong>
                <div className="global-quiz-score">
                  <span>{report.percent}%</span>
                  <p>{report.correct} juste(s) / {report.answered} reponse(s)</p>
                </div>
                <div className="global-quiz-report-grid">
                  <div>
                    <strong>{report.answered}</strong>
                    <span>faites</span>
                  </div>
                  <div>
                    <strong>{report.wrong}</strong>
                    <span>a revoir</span>
                  </div>
                  <div>
                    <strong>{report.remaining}</strong>
                    <span>restantes</span>
                  </div>
                </div>
                <p>{report.message}</p>
                {report.weakQuestions.length > 0 && (
                  <div className="global-quiz-weak-list">
                    <span>Questions a revoir</span>
                    {report.weakQuestions.map(question => (
                      <p key={question.question_key}>{question.question_text}</p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="global-quiz-progress">
                  <span>{currentIndex + 1} / {session.length}</span>
                  <strong>{currentQuestion.questionnaire_title}</strong>
                </div>
                <span className="quiz-type">{getQuestionTypeLabel(currentQuestion.type)}</span>
                <h4>{currentQuestion.prompt}</h4>
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
                  className="quiz-answer-field"
                  value={answer}
                  onChange={event => setAnswer(event.target.value)}
                  placeholder="Ta reponse..."
                />
                {!revealed ? (
                  <>
                    <span className="quiz-mental-hint">Pense à ta réponse, puis retourne la carte.</span>
                    <button type="button" className="btn-primary quiz-reveal-btn" onClick={() => setRevealed(true)}>
                      <Icon name="eye" size={18} /> Afficher la solution
                    </button>
                  </>
                ) : (
                  <div className="quiz-correction">
                    <strong>Correction</strong>
                    <p>{currentQuestion.answer || 'Pas de correction renseignee.'}</p>
                    {currentQuestion.explanation && <p>{currentQuestion.explanation}</p>}
                    <div className="quiz-grade-actions">
                      <button type="button" className="btn-danger quiz-grade-no" onClick={() => recordResult(false)}><Icon name="close" size={18} /> À revoir</button>
                      <button type="button" className="btn-primary quiz-grade-ok" onClick={() => recordResult(true)}><Icon name="check" size={18} /> Je savais</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {session.length === 0 && selectedFiles.length > 0 && (
          <div className="source-link-selection-strip">
            {selectedFiles.slice(0, 4).map(file => (
              <button key={file.id} type="button" onClick={() => handleToggle(file.id, false)}>
                <span>{file.path.replace(/\.(md|json)$/i, '')}</span>
                <Icon name="close" size={13} />
              </button>
            ))}
            {selectedFiles.length > 4 && <em>+ {selectedFiles.length - 4} autre(s)</em>}
          </div>
        )}

        <div className="picker-footer">
          <span className="picker-count">
            {session.length > 0
              ? `${sessionResults.length} / ${session.length} reponse(s)`
              : selectedFiles.length > 0 ? `${selectedFiles.length} fichier(s)` : 'Aucun fichier selectionne'}
          </span>
          <div className="picker-actions">
            {session.length === 0 && (
              <button
                type="button"
                className="btn-primary"
                onClick={startQuiz}
                disabled={loading || selectedFiles.length === 0}
              >
                {loading ? '...' : 'Lancer'}
              </button>
            )}
            {session.length > 0 && !done && (
              <button type="button" className="btn-danger" onClick={stopQuiz}>Stop</button>
            )}
            {session.length > 0 && done && (
              <>
                <button type="button" className="btn-ghost" onClick={backToSources}>Sources</button>
                <button type="button" className="btn-primary" onClick={startQuiz}>Relancer</button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function QuizSourceTree({ nodes, depth = 0, selectedIds, onToggle }) {
  return (
    <ul className={`file-tree ${depth === 0 ? 'root' : ''}`}>
      {nodes.map(node => (
        <QuizSourceNode key={node.id} node={node} depth={depth} selectedIds={selectedIds} onToggle={onToggle} />
      ))}
    </ul>
  )
}

function QuizSourceNode({ node, depth, selectedIds, onToggle }) {
  const [expanded, setExpanded] = useState(depth === 0)
  const isFolder = node.type === 'folder' || node.type === 'locked_folder'
  const isLocked = node.type === 'locked_folder'
  const children = node.children || []
  const descendantFiles = isFolder ? collectReviewSourceFiles([node]) : []
  const isSelectableFile = node.type === 'file' && isReviewSourceName(node.name)
  const checkedCount = descendantFiles.filter(file => selectedIds.has(file.id)).length
  const isChecked = isSelectableFile ? selectedIds.has(node.id) : descendantFiles.length > 0 && checkedCount === descendantFiles.length
  const isIndeterminate = !isSelectableFile && checkedCount > 0 && checkedCount < descendantFiles.length

  const handleToggle = (event) => {
    event.stopPropagation()
    if (isLocked) return
    if (isSelectableFile) {
      onToggle(node.id)
      return
    }
    descendantFiles.forEach(file => onToggle(file.id, !isChecked))
  }

  if (!isFolder && !isSelectableFile) return null

  return (
    <li className="file-node">
      <div
        className={`file-row picker-row ${isFolder ? 'is-folder' : ''} ${isLocked ? 'is-locked' : ''}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={isFolder ? () => setExpanded(value => !value) : handleToggle}
      >
        <input
          type="checkbox"
          className="picker-checkbox"
          checked={isChecked}
          ref={el => { if (el) el.indeterminate = isIndeterminate }}
          onChange={handleToggle}
          disabled={isLocked || (!isSelectableFile && descendantFiles.length === 0)}
          onClick={event => event.stopPropagation()}
        />
        <span className="file-icon">{isLocked ? 'lock' : isFolder ? (expanded ? 'v' : '>') : 'doc'}</span>
        <span className="file-name">{node.name.replace(/\.md$/i, '')}</span>
      </div>
      {isFolder && expanded && children.length > 0 && (
        <QuizSourceTree nodes={children} depth={depth + 1} selectedIds={selectedIds} onToggle={onToggle} />
      )}
    </li>
  )
}

function collectSelectedFiles(tree, selectedIds) {
  return collectReviewSourceFiles(tree).filter(file => selectedIds.has(file.id))
}

function collectReviewSourceFiles(tree, prefix = '') {
  const files = []
  function walk(nodes, currentPrefix = '') {
    nodes.forEach(node => {
      const path = node.path || (currentPrefix ? `${currentPrefix}/${node.name}` : node.name)
      if (node.type === 'file' && isReviewSourceName(node.name)) {
        files.push({ id: node.id, path, name: node.name })
      }
      if (node.children) walk(node.children, path)
    })
  }
  walk(tree || [], prefix)
  return files
}

function isReviewSourceName(name) {
  return /\.(md|json)$/i.test(String(name || ''))
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

function buildSessionReport(session, results, stopped) {
  const answered = results.length
  const correct = results.filter(result => result.correct).length
  const wrong = answered - correct
  const remaining = Math.max(0, session.length - answered)
  const percent = answered > 0 ? Math.round((correct / answered) * 100) : 0
  const weakQuestions = results.filter(result => !result.correct).slice(-3).reverse()
  let message = 'Aucune reponse notee pour cette session.'
  if (answered > 0 && wrong === 0) {
    message = stopped ? 'Session courte, mais tout ce qui a ete tente est juste.' : 'Tres propre : aucune erreur sur cette session.'
  } else if (answered > 0 && percent >= 70) {
    message = 'Bonne session. Les erreurs notees ressortiront plus souvent.'
  } else if (answered > 0) {
    message = 'Session utile : les points rates vont etre renforces dans les prochains tirages.'
  }
  return { answered, correct, wrong, remaining, percent, weakQuestions, message }
}
