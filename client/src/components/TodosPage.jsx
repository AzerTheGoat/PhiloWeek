import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/useApp'
import Icon from './Icons'
import * as api from '../api'

const STATUS_FILTERS = [
  { value: 'open', label: 'Ouvertes' },
  { value: 'done', label: 'Terminées' },
  { value: 'all', label: 'Toutes' },
]

const SECTION_META = {
  tasks: { title: 'Todo', subtitle: 'Tâches et dates limites' },
  agenda: { title: 'Agenda', subtitle: 'Pratiques quotidiennes et suivi' },
  life: { title: 'Vie', subtitle: 'Grille de vie et horizon personnel' },
}

const PRACTICE_COLORS = ['#6ba3e8', '#4caf7d', '#d69d55', '#a08be0', '#e05555', '#d8d8d8']

export default function TodosPage({ section = 'tasks' }) {
  const { dispatch, toast } = useApp()
  const [todos, setTodos] = useState([])
  const [filter, setFilter] = useState('open')
  const [form, setForm] = useState(() => ({ title: '', notes: '', due_at: todayInput() }))
  const [showForm, setShowForm] = useState(true)
  const [loading, setLoading] = useState(false)

  const [dashboard, setDashboard] = useState(() => ({ practices: [], checks: [], profile: { birth_date: '', life_expectancy_years: 85 }, today: todayInput() }))
  const [practiceForm, setPracticeForm] = useState({ title: '', color: PRACTICE_COLORS[0] })
  const [lifeUnit, setLifeUnit] = useState('week')
  const [dashboardLoading, setDashboardLoading] = useState(false)

  useEffect(() => {
    if (section === 'tasks') loadTodos(filter)
  }, [section, filter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (section === 'agenda' || section === 'life') loadDashboard()
  }, [section]) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const open = todos.filter(todo => todo.status === 'open')
    return {
      total: todos.length,
      late: open.filter(todo => deadlineState(todo.due_at).kind === 'late').length,
      today: open.filter(todo => deadlineState(todo.due_at).kind === 'today').length,
    }
  }, [todos])

  const activePractices = useMemo(
    () => dashboard.practices.filter(practice => practice.active),
    [dashboard.practices]
  )

  const checkMap = useMemo(() => {
    const map = new Map()
    dashboard.checks.forEach(check => map.set(`${check.practice_id}:${check.entry_date}`, Boolean(check.done)))
    return map
  }, [dashboard.checks])

  const agendaDays = useMemo(() => lastDays(28), [])
  const agendaSeries = useMemo(() => {
    return agendaDays.map(day => {
      const available = dashboard.practices.filter(practice => wasPracticeAvailable(practice, day))
      const done = available.filter(practice => checkMap.get(`${practice.id}:${day}`)).length
      return {
        day,
        done,
        total: available.length,
        percent: available.length ? Math.round((done / available.length) * 100) : 0,
      }
    })
  }, [agendaDays, dashboard.practices, checkMap])

  const todayDone = activePractices.filter(practice => checkMap.get(`${practice.id}:${dashboard.today}`)).length
  const agendaCompletion = agendaSeries.length
    ? Math.round(agendaSeries.reduce((sum, day) => sum + day.percent, 0) / agendaSeries.length)
    : 0
  const currentStreak = useMemo(() => buildStreak(agendaSeries), [agendaSeries])

  const lifeGrid = useMemo(() => {
    return buildLifeGrid(dashboard.profile, lifeUnit)
  }, [dashboard.profile, lifeUnit])

  async function loadTodos(nextFilter = filter) {
    setLoading(true)
    try {
      setTodos(await api.getTodos(nextFilter))
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function loadDashboard() {
    setDashboardLoading(true)
    try {
      setDashboard(await api.getTodoDashboard(180))
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setDashboardLoading(false)
    }
  }

  async function addTodo(event) {
    event.preventDefault()
    if (!form.title.trim() || !form.due_at) return
    try {
      const created = await api.createTodo(form)
      setTodos(prev => filter === 'done' ? prev : [created, ...prev].sort(sortTodos))
      setForm({ title: '', notes: '', due_at: todayInput() })
      setShowForm(false)
      toast('Todo ajoutée')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function toggleTodo(todo) {
    try {
      const nextStatus = todo.status === 'done' ? 'open' : 'done'
      const updated = await api.updateTodo(todo.id, { status: nextStatus })
      setTodos(prev => {
        if (filter !== 'all' && updated.status !== filter) return prev.filter(item => item.id !== todo.id)
        return prev.map(item => item.id === todo.id ? updated : item).sort(sortTodos)
      })
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function removeTodo(id) {
    try {
      await api.deleteTodo(id)
      setTodos(prev => prev.filter(todo => todo.id !== id))
      toast('Todo supprimée')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function updateDueDate(todo, due_at) {
    try {
      const updated = await api.updateTodo(todo.id, { due_at })
      setTodos(prev => prev.map(item => item.id === todo.id ? updated : item).sort(sortTodos))
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function addPractice(event) {
    event.preventDefault()
    if (!practiceForm.title.trim()) return
    try {
      const created = await api.createPractice(practiceForm)
      setDashboard(prev => ({ ...prev, practices: [...prev.practices, created] }))
      setPracticeForm({ title: '', color: PRACTICE_COLORS[0] })
      toast('Pratique ajoutée')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function togglePractice(practice, active) {
    try {
      const updated = await api.updatePractice(practice.id, { active })
      setDashboard(prev => ({
        ...prev,
        practices: prev.practices.map(item => item.id === practice.id ? updated : item),
      }))
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function togglePracticeCheck(practice, entryDate = dashboard.today) {
    const key = `${practice.id}:${entryDate}`
    const nextDone = !checkMap.get(key)
    try {
      await api.setPracticeCheck(practice.id, { entry_date: entryDate, done: nextDone })
      setDashboard(prev => {
        const checks = prev.checks.filter(check => !(check.practice_id === practice.id && check.entry_date === entryDate))
        return { ...prev, checks: [...checks, { practice_id: practice.id, entry_date: entryDate, done: nextDone ? 1 : 0 }] }
      })
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function saveLifeProfile(patch) {
    try {
      const next = {
        birth_date: dashboard.profile?.birth_date || '',
        life_expectancy_years: dashboard.profile?.life_expectancy_years || 85,
        ...patch,
      }
      const profile = await api.updateLifeProfile(next)
      setDashboard(prev => ({ ...prev, profile }))
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <div className={`todos-page ${section === 'agenda' ? 'agenda-page' : ''}`}>
      <div className="todos-header">
        <button className="icon-btn" onClick={() => dispatch({ type: 'SET_VIEW', payload: 'editor' })} title="Retour">
          <Icon name="back" />
        </button>
        <div>
          <h2>{SECTION_META[section]?.title || SECTION_META.tasks.title}</h2>
          <span>{headerSubtitle(section, stats, activePractices.length, agendaCompletion, currentStreak)}</span>
        </div>
        {section === 'tasks' && (
          <button type="button" className="btn-primary" onClick={() => setShowForm(open => !open)}>
            <Icon name={showForm ? 'close' : 'plus'} size={16} />
            {showForm ? 'Fermer' : 'Ajouter'}
          </button>
        )}
      </div>

      {section === 'tasks' && (
        <TasksPanel
          filter={filter}
          setFilter={setFilter}
          form={form}
          setForm={setForm}
          showForm={showForm}
          addTodo={addTodo}
          loading={loading}
          todos={todos}
          toggleTodo={toggleTodo}
          updateDueDate={updateDueDate}
          removeTodo={removeTodo}
        />
      )}

      {section === 'agenda' && (
        <AgendaPanel
          loading={dashboardLoading}
          activePractices={activePractices}
          practices={dashboard.practices}
          today={dashboard.today}
          checkMap={checkMap}
          todayDone={todayDone}
          agendaCompletion={agendaCompletion}
          currentStreak={currentStreak}
          agendaSeries={agendaSeries}
          practiceForm={practiceForm}
          setPracticeForm={setPracticeForm}
          addPractice={addPractice}
          togglePractice={togglePractice}
          togglePracticeCheck={togglePracticeCheck}
        />
      )}

      {section === 'life' && (
        <LifePanel
          profile={dashboard.profile}
          lifeGrid={lifeGrid}
          lifeUnit={lifeUnit}
          setLifeUnit={setLifeUnit}
          saveLifeProfile={saveLifeProfile}
        />
      )}
    </div>
  )
}

function headerSubtitle(section, stats, activePractices, agendaCompletion, currentStreak) {
  if (section === 'agenda') return `${activePractices} pratiques actives · ${agendaCompletion}% sur 28 jours · série ${currentStreak} j`
  if (section === 'life') return SECTION_META.life.subtitle
  return `${stats.late} en retard · ${stats.today} aujourd'hui · ${stats.total} visibles`
}

function TasksPanel({ filter, setFilter, form, setForm, showForm, addTodo, loading, todos, toggleTodo, updateDueDate, removeTodo }) {
  return (
    <>
      <div className="todos-toolbar">
        {STATUS_FILTERS.map(item => (
          <button
            key={item.value}
            type="button"
            className={filter === item.value ? 'active' : ''}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form className={`todo-form ${showForm ? 'is-open' : ''}`} onSubmit={addTodo}>
        <input
          className="todo-input"
          placeholder="Ce qu'il faut faire..."
          value={form.title}
          onChange={event => setForm(prev => ({ ...prev, title: event.target.value }))}
        />
        <div className="todo-form-grid">
          <label>
            Date limite max
            <input
              className="todo-input"
              type="date"
              value={form.due_at}
              onChange={event => setForm(prev => ({ ...prev, due_at: event.target.value }))}
            />
          </label>
          <button className="btn-primary" disabled={!form.title.trim() || !form.due_at}>Créer</button>
        </div>
        <textarea
          className="todo-input"
          rows={2}
          placeholder="Notes optionnelles"
          value={form.notes}
          onChange={event => setForm(prev => ({ ...prev, notes: event.target.value }))}
        />
      </form>

      <div className="todo-list">
        {loading && <div className="todo-empty">Chargement...</div>}
        {!loading && todos.length === 0 && <div className="todo-empty">Aucune todo ici.</div>}
        {!loading && todos.map(todo => {
          const state = deadlineState(todo.due_at)
          return (
            <article key={todo.id} className={`todo-card ${todo.status === 'done' ? 'done' : ''}`}>
              <button
                type="button"
                className="todo-check"
                onClick={() => toggleTodo(todo)}
                title={todo.status === 'done' ? 'Rouvrir' : 'Terminer'}
              >
                {todo.status === 'done' ? '✓' : ''}
              </button>
              <div className="todo-card-main">
                <div className="todo-card-title">{todo.title}</div>
                {todo.notes && <p>{todo.notes}</p>}
                <div className="todo-meta">
                  <span>Créée {formatDateTime(todo.created_at)}</span>
                  {todo.completed_at && <span>Terminée {formatDateTime(todo.completed_at)}</span>}
                </div>
              </div>
              <div className="todo-deadline">
                <span className={`todo-deadline-pill ${state.kind}`}>{state.label}</span>
                <input type="date" value={todo.due_at} onChange={event => updateDueDate(todo, event.target.value)} />
                <button type="button" onClick={() => removeTodo(todo.id)}>Supprimer</button>
              </div>
            </article>
          )
        })}
      </div>
    </>
  )
}

function AgendaPanel({ loading, activePractices, practices, today, checkMap, todayDone, agendaCompletion, currentStreak, agendaSeries, practiceForm, setPracticeForm, addPractice, togglePractice, togglePracticeCheck }) {
  return (
    <div className="agenda-dashboard">
      <section className="agenda-hero">
        <div className="agenda-section-head">
          <div>
            <h3>Aujourd'hui</h3>
            <span>{formatDate(today)}</span>
          </div>
        </div>
        <div className="agenda-score-ring" style={{ '--agenda-score': `${activePractices.length ? (todayDone / activePractices.length) * 100 : 0}%` }}>
          <strong>{todayDone}/{activePractices.length}</strong>
          <span>cochées</span>
        </div>
        <div className="agenda-metrics">
          <div>
            <strong>{agendaCompletion}%</strong>
            <span>moyenne 28 j</span>
          </div>
          <div>
            <strong>{currentStreak} j</strong>
            <span>série actuelle</span>
          </div>
        </div>
      </section>

      <section className="agenda-today">
        <div className="agenda-section-head">
          <div>
            <h3>Pratiques du jour</h3>
            <span>{todayDone}/{activePractices.length} faites</span>
          </div>
        </div>

        <form className="practice-form" onSubmit={addPractice}>
          <input
            className="todo-input"
            placeholder="Nouvelle pratique"
            value={practiceForm.title}
            onChange={event => setPracticeForm(prev => ({ ...prev, title: event.target.value }))}
          />
          <div className="practice-form-row">
            <div className="practice-color-row">
              {PRACTICE_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  className={practiceForm.color === color ? 'active' : ''}
                  style={{ '--practice-color': color }}
                  onClick={() => setPracticeForm(prev => ({ ...prev, color }))}
                  title={color}
                />
              ))}
            </div>
            <button className="btn-primary" disabled={!practiceForm.title.trim()}>Ajouter</button>
          </div>
        </form>

        <div className="practice-check-list">
          {loading && <div className="todo-empty">Chargement...</div>}
          {!loading && activePractices.length === 0 && <div className="todo-empty">Ajoute une pratique pour commencer.</div>}
          {activePractices.map(practice => {
            const done = checkMap.get(`${practice.id}:${today}`)
            return (
              <button
                key={practice.id}
                type="button"
                className={`practice-check ${done ? 'done' : ''}`}
                style={{ '--practice-color': practice.color }}
                onClick={() => togglePracticeCheck(practice)}
              >
                <span>{done ? '✓' : ''}</span>
                {practice.title}
              </button>
            )
          })}
        </div>
      </section>

      <section className="agenda-chart-panel">
        <div className="agenda-section-head">
          <div>
            <h3>Rythme</h3>
            <span>28 derniers jours</span>
          </div>
        </div>
        <div className="agenda-heatmap">
          {agendaSeries.map(day => {
            const label = `${formatShortDate(day.day)} · ${day.done}/${day.total || 0} pratiques · ${day.percent}%`
            return (
              <button
                key={day.day}
                type="button"
                className={`level-${heatmapLevel(day)} ${day.day === today ? 'today' : ''}`}
                title={label}
                aria-label={label}
              >
                <span>{label}</span>
              </button>
            )
          })}
        </div>
        <div className="agenda-heatmap-legend" aria-hidden="true">
          <span>Moins</span>
          {[0, 1, 2, 3, 4].map(level => <i key={level} className={`level-${level}`} />)}
          <span>Plus</span>
        </div>
      </section>

      <section className="agenda-practices-panel">
        <div className="agenda-section-head">
          <div>
            <h3>Gestion</h3>
            <span>Les pratiques archivées restent dans l'historique.</span>
          </div>
        </div>
        <div className="practice-manage-list">
          {practices.map(practice => (
            <article key={practice.id} className={`practice-manage-card ${practice.active ? '' : 'archived'}`}>
              <span className="practice-dot" style={{ '--practice-color': practice.color }} />
              <div>
                <strong>{practice.title}</strong>
                <span>{practice.active ? 'Active' : `Archivée ${formatDate(practice.archived_at)}`}</span>
              </div>
              <button type="button" onClick={() => togglePractice(practice, !practice.active)}>
                {practice.active ? 'Archiver' : 'Reprendre'}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function LifePanel({ profile, lifeGrid, lifeUnit, setLifeUnit, saveLifeProfile }) {
  const [draftBirth, setDraftBirth] = useState(profile?.birth_date || '')
  const [draftYears, setDraftYears] = useState(profile?.life_expectancy_years || 85)

  useEffect(() => {
    setDraftBirth(profile?.birth_date || '')
    setDraftYears(profile?.life_expectancy_years || 85)
  }, [profile?.birth_date, profile?.life_expectancy_years])

  return (
    <div className="life-dashboard">
      <section className="life-config-panel">
        <div className="agenda-section-head">
          <div>
            <h3>Grille de vie</h3>
            <span>Chaque point représente une semaine ou un mois.</span>
          </div>
        </div>
        <div className="life-config-grid">
          <label>
            Date de naissance
            <input className="todo-input" type="date" value={draftBirth} onChange={event => setDraftBirth(event.target.value)} />
          </label>
          <label>
            Horizon
            <input className="todo-input" type="number" min="1" max="130" value={draftYears} onChange={event => setDraftYears(event.target.value)} />
          </label>
          <button className="btn-primary" onClick={() => saveLifeProfile({ birth_date: draftBirth, life_expectancy_years: Number(draftYears) || 85 })}>
            Enregistrer
          </button>
        </div>
        <div className="life-unit-toggle">
          <button className={lifeUnit === 'week' ? 'active' : ''} onClick={() => setLifeUnit('week')}>Semaines</button>
          <button className={lifeUnit === 'month' ? 'active' : ''} onClick={() => setLifeUnit('month')}>Mois</button>
        </div>
      </section>

      <section className="life-grid-panel">
        {!profile?.birth_date ? (
          <div className="todo-empty">Entre ta date de naissance pour afficher la grille.</div>
        ) : (
          <>
            <div className="life-grid-summary">
              <strong>{lifeGrid.lived} points vécus</strong>
              <span>{lifeGrid.remaining} restants sur {lifeGrid.total}</span>
            </div>
            <div className={`life-dot-grid ${lifeUnit}`}>
              {Array.from({ length: lifeGrid.total }).map((_, index) => (
                <span
                  key={index}
                  className={index < lifeGrid.lived ? 'lived' : index === lifeGrid.lived ? 'current' : ''}
                  title={`${lifeUnit === 'week' ? 'Semaine' : 'Mois'} ${index + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function sortTodos(a, b) {
  if (a.status !== b.status) return a.status === 'open' ? -1 : 1
  return String(a.due_at).localeCompare(String(b.due_at)) || String(b.created_at).localeCompare(String(a.created_at))
}

function todayInput() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 10)
}

function lastDays(count) {
  const days = []
  const base = new Date(`${todayInput()}T00:00:00`)
  for (let i = count - 1; i >= 0; i--) {
    const day = new Date(base)
    day.setDate(base.getDate() - i)
    days.push(toDateInput(day))
  }
  return days
}

function toDateInput(date) {
  const next = new Date(date)
  next.setMinutes(next.getMinutes() - next.getTimezoneOffset())
  return next.toISOString().slice(0, 10)
}

function wasPracticeAvailable(practice, day) {
  if (!practice.created_at) return true
  const created = String(practice.created_at).slice(0, 10)
  const archived = practice.archived_at ? String(practice.archived_at).slice(0, 10) : null
  return day >= created && (!archived || day <= archived)
}

function buildStreak(series) {
  let streak = 0
  for (let i = series.length - 1; i >= 0; i--) {
    if (!series[i].total || series[i].percent < 100) break
    streak++
  }
  return streak
}

function heatmapLevel(day) {
  if (!day.total || day.percent <= 0) return 0
  if (day.percent < 34) return 1
  if (day.percent < 67) return 2
  if (day.percent < 100) return 3
  return 4
}

function deadlineState(dueAt) {
  const today = new Date(todayInput())
  const due = new Date(`${dueAt}T00:00:00`)
  const diff = Math.round((due - today) / 86400000)
  if (diff < 0) return { kind: 'late', label: `En retard de ${Math.abs(diff)} j` }
  if (diff === 0) return { kind: 'today', label: "Aujourd'hui" }
  if (diff <= 3) return { kind: 'soon', label: `Dans ${diff} j` }
  return { kind: 'later', label: formatDate(dueAt) }
}

function buildLifeGrid(profile, unit) {
  const years = Number(profile?.life_expectancy_years) || 85
  const total = unit === 'week' ? years * 52 : years * 12
  if (!profile?.birth_date) return { total, lived: 0, remaining: total }
  const birth = new Date(`${profile.birth_date}T00:00:00`)
  const now = new Date()
  const days = Math.max(0, Math.floor((now - birth) / 86400000))
  const lived = Math.min(total, unit === 'week' ? Math.floor(days / 7) : monthDiff(birth, now))
  return { total, lived, remaining: Math.max(0, total - lived) }
}

function monthDiff(start, end) {
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  if (end.getDate() < start.getDate()) months--
  return Math.max(0, months)
}

function formatDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`))
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date(`${value}T00:00:00`))
}

function formatDateTime(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
