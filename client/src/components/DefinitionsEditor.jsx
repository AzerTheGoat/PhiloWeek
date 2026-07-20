import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/useApp'
import { normalizeTagsInput, parseDefinitionsJson } from '../utils/definitionsFile'
import Icon from './Icons'
import FileHistoryControls, { useFileHistoryActions } from './FileHistoryControls'
import * as api from '../api'

const AUTOSAVE_DELAY = 800

export default function DefinitionsEditor() {
  const { currentFile, openFileId, saveFile, toast } = useApp()
  const [content, setContent] = useState(currentFile?.content || '')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showJson, setShowJson] = useState(false)
  const [session, setSession] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [startedAt, setStartedAt] = useState(Date.now())
  const saveTimerRef = useRef(null)

  useEffect(() => {
    setContent(currentFile?.content || '')
    setDirty(false)
    clearTimeout(saveTimerRef.current)
    setSession([])
    setCurrentIndex(0)
    setAnswer('')
    setRevealed(false)
  }, [currentFile])

  useEffect(() => () => clearTimeout(saveTimerRef.current), [])

  const parsed = useMemo(() => {
    try {
      return { data: parseDefinitionsJson(content), error: null }
    } catch (err) {
      return { data: null, error: err.message }
    }
  }, [content])

  const data = parsed.data || {}
  const definitions = data.definitions || []
  const currentCard = session[currentIndex] || null
  const done = session.length > 0 && currentIndex >= session.length

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

  const writeData = useCallback((patcher) => {
    if (parsed.error) {
      toast('Corrige le JSON avant de modifier cette fiche', 'error')
      return
    }
    const base = parseDefinitionsJson(content)
    const next = patcher(base)
    const formatted = JSON.stringify({ ...next, modified: new Date().toISOString() }, null, 2)
    setContent(formatted)
    triggerSave(formatted)
  }, [content, parsed.error, toast, triggerSave])

  const updateMeta = useCallback((field, value) => {
    writeData(base => ({ ...base, [field]: value }))
  }, [writeData])

  const updateDefinition = useCallback((index, field, value) => {
    writeData(base => {
      const items = Array.isArray(base.definitions) ? base.definitions.slice() : []
      const item = { ...(items[index] || {}) }
      item[field] = field === 'tags' ? normalizeTagsInput(value) : value
      items[index] = item
      return { ...base, definitions: items }
    })
  }, [writeData])

  const addDefinition = useCallback(() => {
    writeData(base => {
      const items = Array.isArray(base.definitions) ? base.definitions.slice() : []
      items.push({
        id: `d${Date.now().toString(36)}`,
        term: '',
        definition: '',
        example: '',
        tags: [],
      })
      return { ...base, definitions: items }
    })
  }, [writeData])

  const removeDefinition = useCallback((index) => {
    writeData(base => {
      const items = Array.isArray(base.definitions) ? base.definitions.slice() : []
      items.splice(index, 1)
      return { ...base, definitions: items }
    })
  }, [writeData])

  const formatJson = useCallback(() => {
    try {
      const formatted = JSON.stringify(JSON.parse(content), null, 2)
      setContent(formatted)
      triggerSave(formatted)
    } catch (err) {
      toast(`JSON invalide : ${err.message}`, 'error')
    }
  }, [content, toast, triggerSave])

  const handleRawChange = useCallback((event) => {
    const value = event.target.value
    setContent(value)
    triggerSave(value)
  }, [triggerSave])

  const startSession = useCallback(async () => {
    try {
      const result = await api.getQuestionnaireSession({
        scope: 'file',
        file_id: currentFile?.id,
        limit: Math.min(50, Math.max(1, definitions.length)),
      })
      if (!result.questions.length) {
        toast('Aucune définition à réviser', 'error')
        return
      }
      setSession(result.questions)
      setCurrentIndex(0)
      setAnswer('')
      setRevealed(false)
      setStartedAt(Date.now())
      toast(`${result.questions.length} définition(s) chargée(s)`)
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [currentFile?.id, definitions.length, toast])

  const recordResult = useCallback(async (correct) => {
    if (!currentCard) return
    try {
      await api.saveQuestionnaireResult({
        question_key: currentCard.question_key,
        questionnaire_file_id: currentCard.questionnaire_file_id,
        questionnaire_title: currentCard.questionnaire_title,
        question_id: currentCard.question_id,
        question_text: currentCard.prompt,
        answer_text: answer,
        expected_answer: currentCard.answer,
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
        toast('Revision terminee')
      } else {
        setCurrentIndex(nextIndex)
      }
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [answer, currentCard, currentIndex, session.length, startedAt, toast])

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

  if (!currentFile) return null

  return (
    <div className="questionnaire-editor definitions-editor">
      <div className="editor-titlebar">
        <h2 className="editor-filename">{currentFile.name.replace(/\.json$/i, '')}</h2>
        <div className="editor-meta">
          <FileHistoryControls history={history} />
          <span className={`save-status ${dirty ? 'dirty' : ''}`}>
            {saving ? 'Enregistrement...' : dirty ? 'non sauvegarde' : 'sauvegarde'}
          </span>
        </div>
      </div>

      <div className="questionnaire-toolbar">
        <button type="button" className="btn-primary" onClick={addDefinition}>
          <Icon name="plus" size={16} /> Définition
        </button>
        <button type="button" className="btn-ghost" onClick={startSession} disabled={definitions.length === 0}>
          <Icon name="book" size={16} /> Réviser
        </button>
        <button type="button" className="btn-ghost" onClick={() => setShowJson(value => !value)}>
          <Icon name="synthesis" size={16} /> {showJson ? 'Fiche' : 'JSON'}
        </button>
        {showJson && (
          <button type="button" className="btn-ghost" onClick={formatJson}>
            Formater
          </button>
        )}
      </div>

      <div className={`questionnaire-body ${showJson ? 'mode-split' : 'mode-preview'}`}>
        {showJson && (
          <div className="questionnaire-json-pane">
            <textarea
              value={content}
              onChange={handleRawChange}
              className="questionnaire-textarea"
              spellCheck={false}
              placeholder="JSON definitions..."
            />
          </div>
        )}

        <div className="questionnaire-preview-pane">
          {parsed.error ? (
            <section className="questionnaire-card is-error">
              <strong>JSON invalide</strong>
              <span>{parsed.error}</span>
            </section>
          ) : (
            <>
              <details className="definitions-meta-card">
                <summary>
                  <span>
                    <strong>{data.title || 'Fiche sans titre'}</strong>
                    <small>{definitions.length} définition{definitions.length > 1 ? 's' : ''}{data.tags?.length ? ` · ${data.tags.join(', ')}` : ''}</small>
                  </span>
                  <span className="definitions-meta-action">Informations de la fiche</span>
                </summary>
                <div className="definitions-meta-fields">
                  <label>
                    Titre
                    <input value={data.title || ''} onChange={event => updateMeta('title', event.target.value)} />
                  </label>
                  <label>
                    Tags
                    <input
                      value={(data.tags || []).join(', ')}
                      onChange={event => updateMeta('tags', normalizeTagsInput(event.target.value))}
                      placeholder="philo, vocabulaire"
                    />
                  </label>
                  <label className="definition-description-field">
                    Description
                    <textarea
                      value={data.description || ''}
                      onChange={event => updateMeta('description', event.target.value)}
                      placeholder="Sujet de cette liste de définitions..."
                    />
                  </label>
                </div>
              </details>

              {session.length > 0 && <section className="questionnaire-card quiz-card definitions-quiz-card">
                <div className="questionnaire-preview-head">
                  <div>
                    <h3>Révision des définitions</h3>
                    <p>Retrouve la définition, puis note ta réponse juste ou fausse.</p>
                  </div>
                  <span>{Math.min(currentIndex + 1, session.length)} / {session.length}</span>
                </div>
                {done && (
                  <div className="quiz-done">
                    <Icon name="book" size={28} />
                    <strong>Révision terminée</strong>
                    <span>Les définitions ratées reviendront plus souvent.</span>
                    <button type="button" className="btn-ghost" onClick={startSession}>Recommencer</button>
                  </div>
                )}
                {currentCard && !done && (
                  <div className="quiz-live">
                    <span className="quiz-origin">{currentCard.questionnaire_title}</span>
                    <span className="quiz-type">Définition</span>
                    <h4>{currentCard.prompt}</h4>
                    <textarea
                      value={answer}
                      onChange={event => setAnswer(event.target.value)}
                      placeholder="Ta définition..."
                    />
                    {!revealed ? (
                      <button type="button" className="btn-ghost" onClick={() => setRevealed(true)}>
                        Voir la définition
                      </button>
                    ) : (
                      <div className="quiz-correction">
                        <strong>Définition</strong>
                        <p>{currentCard.answer || 'Pas de définition renseignée.'}</p>
                        {currentCard.explanation && <p>{currentCard.explanation}</p>}
                        <div className="quiz-grade-actions">
                          <button type="button" className="btn-danger" onClick={() => recordResult(false)}>Faux</button>
                          <button type="button" className="btn-primary" onClick={() => recordResult(true)}>Juste</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>}

              <section className="definitions-list">
                {definitions.length === 0 && (
                  <div className="questionnaire-card">
                    <p className="questionnaire-muted">Ajoute un premier mot.</p>
                  </div>
                )}
                {definitions.map((definition, index) => (
                  <article key={definition.id || index} className="questionnaire-card definition-card">
                    <div className="definition-card-head">
                      <span className="definition-number">{index + 1}</span>
                      <label className="definition-term-field">
                        <span>Mot ou notion</span>
                        <input
                          value={definition.term || ''}
                          onChange={event => updateDefinition(index, 'term', event.target.value)}
                          placeholder="Ex. aporie"
                        />
                      </label>
                      <button type="button" className="icon-btn definition-delete" onClick={() => removeDefinition(index)} aria-label={`Supprimer ${definition.term || `la définition ${index + 1}`}`} title="Supprimer">
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                    <div className="definition-card-body">
                      <label>
                        Définition
                        <textarea
                          value={definition.definition || ''}
                          onChange={event => updateDefinition(index, 'definition', event.target.value)}
                          placeholder="Définition à retenir..."
                        />
                      </label>
                      <label>
                        Exemple / nuance
                        <textarea
                          value={definition.example || ''}
                          onChange={event => updateDefinition(index, 'example', event.target.value)}
                          placeholder="Exemple, contre-exemple, piège..."
                        />
                      </label>
                    </div>
                    <label className="definition-tags-field">
                      Tags
                      <input
                        value={(definition.tags || []).join(', ')}
                        onChange={event => updateDefinition(index, 'tags', event.target.value)}
                        placeholder="logique, grec"
                      />
                    </label>
                  </article>
                ))}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
