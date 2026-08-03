import { useEffect, useMemo, useRef, useState } from 'react'
import * as api from '../api'
import Icon from './Icons'

export default function ElocutionPage() {
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [selectedAudio, setSelectedAudio] = useState(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const importRef = useRef(null)

  const load = async () => {
    setBusy(true); setError('')
    try {
      const rows = await api.getElocutionCourses()
      setCourses(rows)
      setSelectedCourseId(current => rows.some(row => row.id === current) ? current : rows[0]?.id || null)
      setSelectedAudio(current => findAudio(rows, current?.id) || null)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  useEffect(() => { load() }, [])
  const selectedCourse = courses.find(course => course.id === selectedCourseId)

  const importCourse = async event => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      await api.importElocutionCourse(parsed)
      await load()
    } catch (err) { setError(err instanceof SyntaxError ? "Le fichier n'est pas un JSON valide." : err.message) }
  }

  if (busy) return <div className="elocution-empty">Chargement de votre entraînement…</div>
  return (
    <div className="elocution-page">
      <header className="elocution-header">
        <div><span className="elocution-kicker">ENTRAÎNEMENT VOCAL</span><h1>Élocution</h1><p>Enregistrez, analysez manuellement et observez votre progression.</p></div>
        <button className="btn-primary" onClick={() => importRef.current?.click()}><Icon name="upload" size={17} /> Importer un cours JSON</button>
        <input ref={importRef} hidden type="file" accept="application/json,.json" onChange={importCourse} />
      </header>
      {error && <div className="elocution-error">{error}<button onClick={() => setError('')}>×</button></div>}
      {!courses.length ? <EmptyImport onImport={() => importRef.current?.click()} /> : (
        <div className="elocution-layout">
          <aside className="elocution-courses">
            <h2>Mes cours</h2>
            {courses.map(course => {
              const stats = courseStats(course)
              return <button key={course.id} className={course.id === selectedCourseId ? 'active' : ''} onClick={() => { setSelectedCourseId(course.id); setSelectedAudio(null) }}>
                <strong>{course.title}</strong><span>{stats.audios} audio{stats.audios > 1 ? 's' : ''} · {stats.average == null ? 'non évalué' : `${stats.average}/10`}</span>
              </button>
            })}
          </aside>
          <main className="elocution-content">
            {selectedAudio ? <AudioDetail audio={selectedAudio} close={() => setSelectedAudio(null)} reload={load} setError={setError} /> : <CourseDashboard course={selectedCourse} openAudio={setSelectedAudio} reload={load} setError={setError} />}
          </main>
        </div>
      )}
    </div>
  )
}

function EmptyImport({ onImport }) {
  return <section className="elocution-empty"><Icon name="book" size={34} /><h2>Aucun cours d’élocution</h2><p>Importez un fichier JSON composé de chapitres et d’exercices.</p><button className="btn-primary" onClick={onImport}>Choisir un fichier JSON</button></section>
}

function CourseDashboard({ course, openAudio, reload, setError }) {
  const [openChapter, setOpenChapter] = useState(course?.chapters?.[0]?.id)
  const [chartFilter, setChartFilter] = useState('all')
  useEffect(() => setOpenChapter(course?.chapters?.[0]?.id), [course?.id])
  useEffect(() => setChartFilter('all'), [course?.id])
  if (!course) return null
  const stats = courseStats(course)
  const chartAudios = course.chapters.flatMap(chapter => chapter.exercises.flatMap(exercise => exercise.audios.map(audio => ({ ...audio, chapterId: chapter.id, exerciseType: exercise.type })))).filter(audio => audio.evaluation)
  const evaluated = chartFilter === 'all' ? chartAudios : chartAudios.filter(audio => chartFilter.startsWith('chapter:') ? audio.chapterId === chartFilter.slice(8) : audio.exerciseType === chartFilter.slice(5))
  const deleteCourse = async () => {
    if (!window.confirm(`Supprimer le cours « ${course.title} » et tous ses audios ?`)) return
    try { await api.deleteElocutionCourse(course.id); await reload() } catch (err) { setError(err.message) }
  }
  return <>
    <div className="elocution-course-head"><div><h2>{course.title}</h2>{course.description && <p>{course.description}</p>}</div><button className="btn-ghost danger" onClick={deleteCourse}><Icon name="trash" size={16} /> Supprimer</button></div>
    <div className="elocution-stats"><Metric value={course.chapters.length} label="chapitres" /><Metric value={stats.audios} label="audios" /><Metric value={stats.average == null ? '—' : `${stats.average}/10`} label="score moyen" /></div>
    <div className="elocution-chart-filter"><label>Courbe de progression <select value={chartFilter} onChange={event => setChartFilter(event.target.value)}><option value="all">Tous les audios</option>{course.chapters.map(chapter => <option key={chapter.id} value={`chapter:${chapter.id}`}>Jour {chapter.number} · {chapter.title}</option>)}{[...new Set(course.chapters.flatMap(chapter => chapter.exercises.map(exercise => exercise.type)))].map(type => <option key={type} value={`type:${type}`}>Type · {type.replaceAll('_', ' ')}</option>)}</select></label></div>
    <ProgressChart audios={evaluated} />
    <div className="elocution-chapters">
      {course.chapters.map(chapter => {
        const chapterAudios = chapter.exercises.flatMap(exercise => exercise.audios)
        const scores = chapterAudios.map(a => a.evaluation?.score_global).filter(Number.isFinite)
        return <section key={chapter.id} className="elocution-chapter">
          <button className="elocution-chapter-title" onClick={() => setOpenChapter(openChapter === chapter.id ? null : chapter.id)}>
            <span><b>Jour {chapter.number}</b><strong>{chapter.title}</strong></span><small>{chapterAudios.length} audio{chapterAudios.length > 1 ? 's' : ''}{scores.length ? ` · ${(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1)}/10` : ''}</small>
          </button>
          {openChapter === chapter.id && <div className="elocution-exercises">{chapter.description && <p>{chapter.description}</p>}{chapter.exercises.map(exercise => <Exercise key={exercise.id} exercise={exercise} openAudio={openAudio} reload={reload} setError={setError} />)}</div>}
        </section>
      })}
    </div>
  </>
}

function Exercise({ exercise, openAudio, reload, setError }) {
  const recorder = useRecorder(async (blob, duration) => {
    try { await api.uploadElocutionAudio(exercise.id, blob, duration); await reload() } catch (err) { setError(err.message) }
  }, setError)
  return <article className="elocution-exercise">
    <div className="elocution-exercise-head"><span>{exercise.type.replaceAll('_', ' ')}</span>{recorder.recording ? <button className="btn-danger" onClick={recorder.stop}>Arrêter · {recorder.seconds}s</button> : <button className="btn-primary" onClick={recorder.start}><Icon name="play" size={15} /> Enregistrer</button>}</div>
    <h3>{exercise.instruction}</h3>{exercise.support_text && <blockquote>{exercise.support_text}</blockquote>}
    {Object.keys(exercise.parameters || {}).length > 0 && <small>Paramètres : {Object.entries(exercise.parameters).map(([k,v]) => `${k}: ${v}`).join(' · ')}</small>}
    <div className="elocution-audios">{exercise.audios.map(audio => <button key={audio.id} onClick={() => openAudio(audio)}><Icon name="play" size={15} /><span>{formatDate(audio.recorded_at)} · {formatDuration(audio.duration_seconds)} · {audio.source}</span><b className={audio.evaluation ? '' : 'pending'}>{audio.evaluation ? `${audio.evaluation.score_global}/10` : 'À analyser'}</b></button>)}</div>
  </article>
}

function AudioDetail({ audio, close, reload, setError }) {
  const [prompt, setPrompt] = useState('')
  const [raw, setRaw] = useState(audio.evaluation?.json_brut || '')
  const [message, setMessage] = useState('')
  const copyPrompt = async () => {
    try { const data = await api.getElocutionPrompt(audio.id); setPrompt(data.prompt); await navigator.clipboard.writeText(data.prompt); setMessage('Prompt copié. Pensez à joindre manuellement cet audio à l’IA de votre choix.') } catch (err) { setError(err.message) }
  }
  const save = async () => {
    try { await api.saveElocutionEvaluation(audio.id, raw); setMessage('Évaluation enregistrée.'); await reload() } catch (err) { setError(err.message) }
  }
  const remove = async () => {
    if (!window.confirm('Supprimer définitivement cet enregistrement ?')) return
    try { await api.deleteElocutionAudio(audio.id); await reload(); close() } catch (err) { setError(err.message) }
  }
  return <section className="elocution-audio-detail">
    <div className="elocution-detail-head"><button className="btn-ghost" onClick={close}>← Retour au cours</button><button className="btn-ghost danger" onClick={remove}>Supprimer l’audio</button></div>
    <h2>Enregistrement du {formatDate(audio.recorded_at)}</h2><audio controls src={api.elocutionAudioUrl(audio.id)} />
    {audio.evaluation && <Evaluation evaluation={audio.evaluation} />}
    <div className="elocution-manual-flow"><h3>Analyse externe manuelle</h3><p>1. Copiez le prompt. 2. Joignez cet audio vous-même dans l’IA de votre choix. 3. Collez uniquement sa réponse JSON ci-dessous.</p><button className="btn-primary" onClick={copyPrompt}><Icon name="copy" size={16} /> Copier le prompt</button>{message && <p className="elocution-success">{message}</p>}{prompt && <textarea readOnly value={prompt} rows={10} />}
      <label>Réponse JSON de l’IA<textarea value={raw} onChange={e => setRaw(e.target.value)} rows={12} placeholder='{"score_global": 7.5, ...}' /></label><button className="btn-primary" disabled={!raw.trim()} onClick={save}>{audio.evaluation ? 'Remplacer l’évaluation' : 'Enregistrer l’évaluation'}</button>
    </div>
  </section>
}

function Evaluation({ evaluation }) {
  return <section className="elocution-evaluation"><div className="elocution-score"><b>{evaluation.score_global}</b><span>/10</span></div><div><h3>Résultat</h3><p>{evaluation.remarques_generales}</p></div><div className="elocution-score-grid">{Object.entries(evaluation.scores_details || {}).map(([key, value]) => <article key={key}><span>{key}</span><b>{value.score}/10</b><p>{value.commentaire}</p></article>)}</div>{evaluation.conseils?.length > 0 && <div><h3>Conseils</h3><ul>{evaluation.conseils.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}</section>
}

function ProgressChart({ audios }) {
  if (!audios.length) return <div className="elocution-chart empty">La courbe apparaîtra après la première évaluation.</div>
  const points = audios.slice().sort((a,b) => a.recorded_at.localeCompare(b.recorded_at)).map((a,i,rows) => `${rows.length === 1 ? 50 : i * 100/(rows.length-1)},${100-a.evaluation.score_global*10}`).join(' ')
  return <div className="elocution-chart"><div><strong>Progression globale</strong><span>{audios.length} évaluation{audios.length > 1 ? 's' : ''}</span></div><svg viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="0" y1="50" x2="100" y2="50" /><polyline points={points} /></svg></div>
}

function Metric({ value, label }) { return <div><b>{value}</b><span>{label}</span></div> }
function allAudios(course) { return course?.chapters?.flatMap(chapter => chapter.exercises.flatMap(exercise => exercise.audios)) || [] }
function courseStats(course) { const audios = allAudios(course); const scores = audios.map(a => a.evaluation?.score_global).filter(Number.isFinite); return { audios: audios.length, average: scores.length ? (scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1) : null } }
function findAudio(courses, id) { return id ? courses.flatMap(allAudios).find(audio => audio.id === id) : null }
function formatDate(value) { return new Date(value).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) }
function formatDuration(seconds) { return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}` }

function useRecorder(onComplete, onError) {
  const [recording, setRecording] = useState(false); const [seconds, setSeconds] = useState(0)
  const media = useRef(null); const chunks = useRef([]); const timer = useRef(null); const started = useRef(0)
  const start = async () => { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); chunks.current = []; const recorder = new MediaRecorder(stream); media.current = recorder; started.current = Date.now(); recorder.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data) }; recorder.onstop = () => { stream.getTracks().forEach(track => track.stop()); clearInterval(timer.current); setRecording(false); const duration = Math.max(1, Math.round((Date.now()-started.current)/1000)); onComplete(new Blob(chunks.current, { type: recorder.mimeType || 'audio/webm' }), duration) }; recorder.start(); setSeconds(0); setRecording(true); timer.current = setInterval(() => setSeconds(Math.round((Date.now()-started.current)/1000)), 1000) } catch (err) { onError(err.message || 'Microphone indisponible.') } }
  const stop = () => media.current?.state === 'recording' && media.current.stop()
  useEffect(() => () => { clearInterval(timer.current); media.current?.stream?.getTracks().forEach(track => track.stop()) }, [])
  return { recording, seconds, start, stop }
}
