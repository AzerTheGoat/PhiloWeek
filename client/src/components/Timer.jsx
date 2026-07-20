import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../context/useApp'
import Icon from './Icons'
import * as api from '../api'
import { getLogicalDay } from '../hooks/useAppUsageTracker'

const ACTIVITIES = [
  { id: 'reading', label: 'Lecture', icon: 'journal' },
  { id: 'watching', label: 'Visionnage', icon: 'video' },
  { id: 'writing', label: 'Écriture', icon: 'edit' },
  { id: 'thinking', label: 'Réflexion', icon: 'thought' },
]

export default function Timer() {
  const { openFileId, currentFile, toast, openJournalToday } = useApp()
  const [seconds, setSeconds] = useState(0)
  const [running, setRunning] = useState(false)
  const [activity, setActivity] = useState('thinking')
  const [sessions, setSessions] = useState([])
  const [stats, setStats] = useState({ today_seconds: 0, total_seconds: 0 })
  const [usageStats, setUsageStats] = useState({
    today_seconds: 0,
    week_seconds: 0,
    average_weekly_seconds: 0,
    total_seconds: 0,
    history: [],
  })
  const [showAllUsage, setShowAllUsage] = useState(false)
  const [pendingSave, setPendingSave] = useState(false)
  const [sessionNotes, setSessionNotes] = useState('')
  const intervalRef = useRef(null)

  useEffect(() => {
    loadData()
    const refresh = window.setInterval(loadUsage, 30000)
    return () => window.clearInterval(refresh)
  }, [])

  async function loadData() {
    try {
      const [s, st, usage] = await Promise.all([
        api.getTimerSessions(),
        api.getTimerStats(),
        api.getAppUsage(getLogicalDay()),
      ])
      setSessions(s)
      setStats(st)
      setUsageStats(usage)
    } catch (_) {}
  }

  async function loadUsage() {
    try {
      setUsageStats(await api.getAppUsage(getLogicalDay()))
    } catch (_) {}
  }

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [running])

  const fmt = (s) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const fmtMin = (s) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    return h > 0 ? `${h}h${m > 0 ? m + 'm' : ''}` : `${m}m`
  }

  const stop = useCallback(() => {
    setRunning(false)
    if (seconds >= 10) setPendingSave(true)
    else setSeconds(0)
  }, [seconds])

  const reset = useCallback(() => {
    setRunning(false)
    setSeconds(0)
    setPendingSave(false)
    setSessionNotes('')
  }, [])

  const saveSession = useCallback(async (addToJournal = false) => {
    try {
      await api.saveTimerSession({
        file_id: openFileId || null,
        duration_seconds: seconds,
        activity_type: activity,
        notes: sessionNotes || null
      })

      if (addToJournal) {
        await openJournalToday()
        toast('Session sauvegardée. Ajoute des notes dans ton journal.')
      } else {
        toast('Session sauvegardée')
      }

      await loadData()
      reset()
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [seconds, activity, sessionNotes, openFileId, openJournalToday, toast, reset])

  const deleteSession = useCallback(async (id) => {
    await api.deleteTimerSession(id)
    await loadData()
    toast('Session supprimée')
  }, [toast])

  return (
    <div className="timer-view">
      <div className="timer-header">
        <h2>Timer de travail</h2>
      </div>

      {currentFile && (
        <div className="timer-context">
          Fichier actif : <strong>{currentFile.name.replace(/\.(md|json|xlsx)$/i, '')}</strong>
        </div>
      )}

      <div className={`timer-display ${running ? 'running' : ''}`}>
        {fmt(seconds)}
      </div>

      {!pendingSave ? (
        <div className="timer-controls">
          {!running ? (
            <button className="btn-primary timer-start" onClick={() => setRunning(true)}>
              <Icon name="play" size={18} /> Démarrer
            </button>
          ) : (
            <button className="btn-danger timer-stop" onClick={stop}>
              Arrêter
            </button>
          )}
          {seconds > 0 && !running && (
            <button className="btn-ghost" onClick={reset}>Réinitialiser</button>
          )}
        </div>
      ) : (
        <div className="timer-save-panel">
          <div className="timer-save-info">
            Session de <strong>{fmtMin(seconds)}</strong>
          </div>
          <ActivityPicker activity={activity} setActivity={setActivity} />
          <textarea
            className="session-notes"
            placeholder="Notes optionnelles sur cette session..."
            value={sessionNotes}
            onChange={e => setSessionNotes(e.target.value)}
            rows={3}
          />
          <div className="timer-save-actions">
            <button className="btn-primary" onClick={() => saveSession(false)}>
              Sauvegarder
            </button>
            <button className="btn-ghost" onClick={() => saveSession(true)}>
              Ajouter au journal
            </button>
            <button className="btn-ghost danger" onClick={reset}>
              Ignorer
            </button>
          </div>
        </div>
      )}

      {!pendingSave && <ActivityPicker activity={activity} setActivity={setActivity} />}

      <section className="app-usage-panel">
        <div className="app-usage-heading">
          <div>
            <h3>Temps dans l'application</h3>
            <p>Compté uniquement quand l'application est visible et active. La journée change à 03:00.</p>
          </div>
          <Icon name="timer" size={20} />
        </div>

        <div className="timer-stats app-usage-stats">
          <div className="timer-stat">
            <span className="stat-label">Aujourd'hui</span>
            <span className="stat-value">{fmtMin(usageStats.today_seconds)}</span>
          </div>
          <div className="timer-stat">
            <span className="stat-label">Cette semaine</span>
            <span className="stat-value">{fmtMin(usageStats.week_seconds)}</span>
          </div>
          <div className="timer-stat">
            <span className="stat-label">Moyenne / semaine</span>
            <span className="stat-value">{fmtMin(usageStats.average_weekly_seconds)}</span>
          </div>
          <div className="timer-stat">
            <span className="stat-label">Total</span>
            <span className="stat-value">{fmtMin(usageStats.total_seconds)}</span>
          </div>
        </div>

        <div className="app-usage-history">
          <h4>Historique jour par jour</h4>
          {usageStats.history.length === 0 && <div className="history-empty">Aucun temps enregistré pour le moment</div>}
          {(showAllUsage ? usageStats.history : usageStats.history.slice(0, 14)).map(day => (
            <div className="app-usage-row" key={day.entry_date}>
              <span>{formatUsageDay(day.entry_date, usageStats.today)}</span>
              <strong>{fmtMin(day.duration_seconds)}</strong>
            </div>
          ))}
          {usageStats.history.length > 14 && (
            <button type="button" className="btn-ghost app-usage-more" onClick={() => setShowAllUsage(value => !value)}>
              {showAllUsage ? 'Réduire' : `Tout afficher (${usageStats.history.length} jours)`}
            </button>
          )}
        </div>
      </section>

      <h3 className="timer-section-title">Sessions chronométrées</h3>
      <div className="timer-stats">
        <div className="timer-stat">
          <span className="stat-label">Aujourd'hui</span>
          <span className="stat-value">{fmtMin(stats.today_seconds)}</span>
        </div>
        <div className="timer-stat">
          <span className="stat-label">Total</span>
          <span className="stat-value">{fmtMin(stats.total_seconds)}</span>
        </div>
      </div>

      <div className="timer-history">
        <h3>Historique récent</h3>
        {sessions.length === 0 && <div className="history-empty">Aucune session</div>}
        {sessions.slice(0, 15).map(s => {
          const act = ACTIVITIES.find(a => a.id === s.activity_type) || ACTIVITIES[3]
          return (
            <div key={s.id} className="session-row">
              <span className="session-icon"><Icon name={act.icon} size={16} /></span>
              <span className="session-duration">{fmtMin(s.duration_seconds)}</span>
              <span className="session-date">{new Date(s.created_at).toLocaleDateString('fr-FR')}</span>
              {s.notes && <span className="session-notes-text">{s.notes}</span>}
              <button className="session-delete" onClick={() => deleteSession(s.id)} title="Supprimer">×</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ActivityPicker({ activity, setActivity }) {
  return (
    <div className="activity-picker">
      {ACTIVITIES.map(a => (
        <button
          key={a.id}
          className={`activity-btn ${activity === a.id ? 'active' : ''}`}
          onClick={() => setActivity(a.id)}
        >
          <Icon name={a.icon} size={17} /> {a.label}
        </button>
      ))}
    </div>
  )
}

function formatUsageDay(day, today) {
  if (day === today) return "Aujourd'hui"
  return new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
