import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
    month_seconds: 0,
    average_daily_month_seconds: 0,
    active_days_month: 0,
    average_weekly_seconds: 0,
    total_seconds: 0,
    history: [],
    monthly_history: [],
  })
  const [showAllUsage, setShowAllUsage] = useState(false)
  const [usageRange, setUsageRange] = useState('daily')
  const [pendingSave, setPendingSave] = useState(false)
  const [sessionNotes, setSessionNotes] = useState('')
  const intervalRef = useRef(null)
  const usageSeries = useMemo(
    () => usageRange === 'monthly'
      ? buildMonthlySeries(usageStats.today, usageStats.monthly_history, 12)
      : buildDailySeries(usageStats.today, usageStats.history, 30),
    [usageRange, usageStats.history, usageStats.monthly_history, usageStats.today]
  )

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
      setUsageStats(normalizeUsageStats(usage))
    } catch (_) {}
  }

  async function loadUsage() {
    try {
      setUsageStats(normalizeUsageStats(await api.getAppUsage(getLogicalDay())))
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
    if (s > 0 && h === 0 && m === 0) return '<1m'
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
            <span className="stat-label">Ce mois</span>
            <span className="stat-value">{fmtMin(usageStats.month_seconds)}</span>
          </div>
          <div className="timer-stat">
            <span className="stat-label">Total</span>
            <span className="stat-value">{fmtMin(usageStats.total_seconds)}</span>
          </div>
        </div>

        <div className="app-usage-insights" aria-label="Moyennes d'utilisation">
          <span>Moyenne ce mois <strong>{fmtMin(usageStats.average_daily_month_seconds)} / jour</strong></span>
          <span>Jours actifs ce mois <strong>{usageStats.active_days_month || 0}</strong></span>
          <span>Moyenne historique <strong>{fmtMin(usageStats.average_weekly_seconds)} / semaine</strong></span>
        </div>

        <div className="app-usage-dashboard">
          <div className="app-usage-chart-heading">
            <div>
              <h4>Évolution du temps passé</h4>
              <p>{usageRange === 'daily' ? 'Les 30 derniers jours' : 'Les 12 derniers mois'}</p>
            </div>
            <div className="app-usage-range" role="group" aria-label="Période de la courbe">
              <button type="button" className={usageRange === 'daily' ? 'active' : ''} onClick={() => { setUsageRange('daily'); setShowAllUsage(false) }}>30 jours</button>
              <button type="button" className={usageRange === 'monthly' ? 'active' : ''} onClick={() => { setUsageRange('monthly'); setShowAllUsage(false) }}>12 mois</button>
            </div>
          </div>
          <UsageChart series={usageSeries} formatDuration={fmtMin} />
        </div>

        <div className="app-usage-history">
          <h4>{usageRange === 'daily' ? 'Historique jour par jour' : 'Historique mois par mois'}</h4>
          {(usageRange === 'daily' ? usageStats.history : usageStats.monthly_history).length === 0 && (
            <div className="history-empty">Aucun temps enregistré pour le moment</div>
          )}
          {(showAllUsage
            ? (usageRange === 'daily' ? usageStats.history : usageStats.monthly_history)
            : (usageRange === 'daily' ? usageStats.history : usageStats.monthly_history).slice(0, usageRange === 'daily' ? 14 : 12)
          ).map(entry => (
            <div className="app-usage-row" key={entry.entry_date || entry.entry_month}>
              <span>{usageRange === 'daily'
                ? formatUsageDay(entry.entry_date, usageStats.today)
                : formatUsageMonth(entry.entry_month)}</span>
              <span className="app-usage-row-meta">{usageRange === 'monthly' ? `${entry.active_days} jour${entry.active_days > 1 ? 's' : ''} actif${entry.active_days > 1 ? 's' : ''}` : ''}</span>
              <strong>{fmtMin(entry.duration_seconds)}</strong>
            </div>
          ))}
          {(usageRange === 'daily' ? usageStats.history.length > 14 : usageStats.monthly_history.length > 12) && (
            <button type="button" className="btn-ghost app-usage-more" onClick={() => setShowAllUsage(value => !value)}>
              {showAllUsage
                ? 'Réduire'
                : `Tout afficher (${usageRange === 'daily' ? `${usageStats.history.length} jours` : `${usageStats.monthly_history.length} mois`})`}
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

function UsageChart({ series, formatDuration }) {
  const width = 720
  const height = 230
  const padding = { top: 14, right: 18, bottom: 34, left: 52 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const maxSeconds = Math.max(0, ...series.map(point => Number(point.seconds || 0)))
  const ceiling = niceUsageCeiling(maxSeconds)

  if (maxSeconds <= 0) {
    return <div className="app-usage-chart-empty">La courbe apparaîtra dès que du temps sera enregistré.</div>
  }

  const points = series.map((point, index) => ({
    ...point,
    x: padding.left + (series.length === 1 ? plotWidth / 2 : (index / (series.length - 1)) * plotWidth),
    y: padding.top + plotHeight - (Number(point.seconds || 0) / ceiling) * plotHeight,
  }))
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padding.top + plotHeight).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padding.top + plotHeight).toFixed(1)} Z`
  const labelIndexes = new Set([0, Math.floor((series.length - 1) / 4), Math.floor((series.length - 1) / 2), Math.floor((series.length - 1) * 3 / 4), series.length - 1])
  const grid = [0, 0.25, 0.5, 0.75, 1]

  return (
    <figure className="app-usage-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Courbe du temps passé dans Opuscule">
        <title>Évolution du temps passé dans Opuscule</title>
        <defs>
          <linearGradient id="usage-area-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {grid.map(ratio => {
          const y = padding.top + plotHeight - ratio * plotHeight
          return (
            <g key={ratio} className="app-usage-grid-line">
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text x={padding.left - 9} y={y + 4} textAnchor="end">{formatAxisDuration(ceiling * ratio)}</text>
            </g>
          )
        })}
        <path className="app-usage-area" d={areaPath} />
        <path className="app-usage-line" d={linePath} />
        {points.map((point, index) => (
          <g key={point.key}>
            <circle className="app-usage-point" cx={point.x} cy={point.y} r={point.seconds > 0 ? 3.5 : 2}>
              <title>{`${point.fullLabel} : ${formatDuration(point.seconds)}`}</title>
            </circle>
            {labelIndexes.has(index) && (
              <text className="app-usage-x-label" x={point.x} y={height - 10} textAnchor="middle">{point.label}</text>
            )}
          </g>
        ))}
      </svg>
      <figcaption>
        <span>{series[0]?.fullLabel}</span>
        <strong>Pic : {formatDuration(maxSeconds)}</strong>
        <span>{series[series.length - 1]?.fullLabel}</span>
      </figcaption>
    </figure>
  )
}

function normalizeUsageStats(value) {
  const raw = value || {}
  const today = raw.today || getLogicalDay()
  const history = Array.isArray(raw.history) ? raw.history : []
  const monthlyHistory = Array.isArray(raw.monthly_history)
    ? raw.monthly_history
    : aggregateMonthlyHistory(history)
  const currentMonth = today.slice(0, 7)
  const currentMonthRow = monthlyHistory.find(row => row.entry_month === currentMonth)
  const monthSeconds = Number(raw.month_seconds ?? currentMonthRow?.duration_seconds ?? 0)

  return {
    today,
    today_seconds: Number(raw.today_seconds || 0),
    week_seconds: Number(raw.week_seconds || 0),
    month_seconds: monthSeconds,
    average_daily_month_seconds: Number(raw.average_daily_month_seconds ?? Math.round(monthSeconds / Math.max(1, Number(today.slice(8, 10)) || 1))),
    active_days_month: Number(raw.active_days_month ?? currentMonthRow?.active_days ?? 0),
    average_weekly_seconds: Number(raw.average_weekly_seconds || 0),
    total_seconds: Number(raw.total_seconds || 0),
    history,
    monthly_history: monthlyHistory,
  }
}

function aggregateMonthlyHistory(history) {
  const months = new Map()
  for (const row of history || []) {
    const entryMonth = String(row.entry_date || '').slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(entryMonth)) continue
    const current = months.get(entryMonth) || { entry_month: entryMonth, duration_seconds: 0, active_days: 0 }
    current.duration_seconds += Number(row.duration_seconds || 0)
    current.active_days += 1
    months.set(entryMonth, current)
  }
  return [...months.values()].sort((a, b) => b.entry_month.localeCompare(a.entry_month))
}

function buildDailySeries(today, history, count) {
  const end = today || getLogicalDay()
  const values = new Map((history || []).map(row => [row.entry_date, Number(row.duration_seconds || 0)]))
  return Array.from({ length: count }, (_, index) => {
    const day = shiftDay(end, index - count + 1)
    return {
      key: day,
      label: formatShortDay(day),
      fullLabel: formatUsageDay(day, end),
      seconds: values.get(day) || 0,
    }
  })
}

function buildMonthlySeries(today, history, count) {
  const endMonth = String(today || getLogicalDay()).slice(0, 7)
  const values = new Map((history || []).map(row => [row.entry_month, Number(row.duration_seconds || 0)]))
  return Array.from({ length: count }, (_, index) => {
    const month = shiftMonth(endMonth, index - count + 1)
    return {
      key: month,
      label: formatShortMonth(month),
      fullLabel: formatUsageMonth(month),
      seconds: values.get(month) || 0,
    }
  })
}

function shiftDay(day, offset) {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function shiftMonth(month, offset) {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1))
  return date.toISOString().slice(0, 7)
}

function niceUsageCeiling(seconds) {
  const minimum = 20 * 60
  const value = Math.max(minimum, Number(seconds || 0))
  const targetStep = value / 4
  const steps = [60, 5 * 60, 10 * 60, 15 * 60, 30 * 60, 60 * 60, 2 * 3600, 4 * 3600, 6 * 3600, 12 * 3600, 24 * 3600]
  const step = steps.find(candidate => candidate >= targetStep) || Math.ceil(targetStep / 86400) * 86400
  return step * 4
}

function formatAxisDuration(seconds) {
  if (seconds <= 0) return '0'
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  const hours = seconds / 3600
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`
}

function formatShortDay(day) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function formatShortMonth(month) {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' }).replace('.', '')
}

function formatUsageMonth(month) {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
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
