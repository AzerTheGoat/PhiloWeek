import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/useApp'
import Icon from './Icons'
import * as api from '../api'

const STATUS_FILTERS = [
  { value: 'open', label: 'Ouvertes' },
  { value: 'done', label: 'Terminées' },
  { value: 'all', label: 'Toutes' },
]

const SECTION_META = {
  tasks: { title: 'Tâches', subtitle: 'Tâches et dates limites' },
  agenda: { title: 'Agenda', subtitle: 'Habitudes quotidiennes et suivi' },
  life: { title: 'Vie', subtitle: 'Grille de vie et horizon personnel' },
}

export default function TodosPage({ section = 'tasks' }) {
  const { currentUser, toast } = useApp()
  const [todos, setTodos] = useState([])
  const [filter, setFilter] = useState('open')
  const [form, setForm] = useState(() => ({ title: '', notes: '', due_at: todayInput() }))
  const [showForm, setShowForm] = useState(true)
  const [loading, setLoading] = useState(false)
  const [agendaMonth, setAgendaMonth] = useState(() => startOfMonth(todayInput()))
  const [selectedAgendaDate, setSelectedAgendaDate] = useState(todayInput())
  const [agendaNoticeClosed, setAgendaNoticeClosed] = useState(false)

  const [dashboard, setDashboard] = useState(() => ({ practices: [], checks: [], events: [], profile: { birth_date: '', life_expectancy_years: 85 }, today: todayInput() }))
  const [practiceForm, setPracticeForm] = useState({ title: '' })
  const [editingPracticeId, setEditingPracticeId] = useState(null)
  const [editingPracticeTitle, setEditingPracticeTitle] = useState('')
  const [lifeUnit, setLifeUnit] = useState('week')
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [eventForm, setEventForm] = useState(() => emptyAgendaEvent(todayInput()))
  const [editingEventId, setEditingEventId] = useState(null)
  const [showEventForm, setShowEventForm] = useState(false)
  const [importingCalendar, setImportingCalendar] = useState(false)
  const calendarInputRef = useRef(null)

  useEffect(() => {
    if (section === 'tasks') loadTodos(filter)
    if (section === 'agenda') loadTodos('open')
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
  const tasksByDate = useMemo(() => groupTodosByDate(todos), [todos])
  const agendaMonthGrid = useMemo(() => buildMonthGrid(agendaMonth), [agendaMonth])
  const selectedDayTasks = tasksByDate.get(selectedAgendaDate) || []
  const todayTasks = tasksByDate.get(dashboard.today) || []
  const overdueTasks = todos.filter(todo => todo.status === 'open' && todo.due_at < dashboard.today)
  const selectedDayPractices = useMemo(
    () => dashboardAvailablePractices(dashboard.practices, selectedAgendaDate),
    [dashboard.practices, selectedAgendaDate]
  )
  const selectedDayDone = selectedDayPractices.filter(practice => checkMap.get(`${practice.id}:${selectedAgendaDate}`)).length
  const selectedDayEvents = useMemo(
    () => (dashboard.events || []).filter(event => event.start_date <= selectedAgendaDate && event.end_date >= selectedAgendaDate),
    [dashboard.events, selectedAgendaDate]
  )
  const showAgendaNotice = section === 'agenda'
    && !agendaNoticeClosed
    && (todayTasks.length > 0 || overdueTasks.length > 0)
    && !hasSeenAgendaNotice(currentUser?.id, dashboard.today)

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
      toast('Tâche ajoutée')
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
      toast('Tâche supprimée')
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

  function closeAgendaNotice() {
    markAgendaNoticeSeen(currentUser?.id, dashboard.today)
    setAgendaNoticeClosed(true)
  }

  async function addPractice(event) {
    event.preventDefault()
    if (!practiceForm.title.trim()) return
    try {
      const created = await api.createPractice(practiceForm)
      setDashboard(prev => ({ ...prev, practices: [...prev.practices, created] }))
      setPracticeForm({ title: '' })
      toast('Habitude ajoutée')
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

  function startEditPractice(practice) {
    setEditingPracticeId(practice.id)
    setEditingPracticeTitle(practice.title)
  }

  async function savePracticeTitle(practice) {
    const title = editingPracticeTitle.trim()
    if (!title) return
    try {
      const updated = await api.updatePractice(practice.id, { title })
      setDashboard(prev => ({
        ...prev,
        practices: prev.practices.map(item => item.id === practice.id ? updated : item),
      }))
      setEditingPracticeId(null)
      setEditingPracticeTitle('')
      toast('Habitude modifiée')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function removePractice(practice) {
    if (!window.confirm(`Supprimer "${practice.title}" et son historique ?`)) return
    try {
      await api.deletePractice(practice.id)
      setDashboard(prev => ({
        ...prev,
        practices: prev.practices.filter(item => item.id !== practice.id),
        checks: prev.checks.filter(check => check.practice_id !== practice.id),
      }))
      if (editingPracticeId === practice.id) {
        setEditingPracticeId(null)
        setEditingPracticeTitle('')
      }
      toast('Habitude supprimée')
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

  function beginNewEvent(date = selectedAgendaDate) {
    setEditingEventId(null)
    setEventForm(emptyAgendaEvent(date))
    setShowEventForm(true)
  }

  function beginEditEvent(event) {
    setEditingEventId(event.id)
    setEventForm({
      title: event.title || '', notes: event.notes || '', location: event.location || '',
      start_date: event.start_date, start_time: event.start_time || '09:00',
      end_date: event.end_date, end_time: event.end_time || '10:00', all_day: Boolean(event.all_day),
    })
    setShowEventForm(true)
  }

  async function saveAgendaEvent(event) {
    event.preventDefault()
    try {
      const saved = editingEventId
        ? await api.updateAgendaEvent(editingEventId, eventForm)
        : await api.createAgendaEvent(eventForm)
      setDashboard(prev => ({
        ...prev,
        events: editingEventId
          ? (prev.events || []).map(item => item.id === saved.id ? saved : item)
          : [...(prev.events || []), saved],
      }))
      setSelectedAgendaDate(saved.start_date)
      setAgendaMonth(startOfMonth(saved.start_date))
      setShowEventForm(false)
      setEditingEventId(null)
      setEventForm(emptyAgendaEvent(saved.start_date))
      toast(editingEventId ? 'Événement modifié' : 'Événement ajouté')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function removeAgendaEvent(event) {
    if (!window.confirm(`Supprimer « ${event.title} » ?`)) return
    try {
      await api.deleteAgendaEvent(event.id)
      setDashboard(prev => ({ ...prev, events: (prev.events || []).filter(item => item.id !== event.id) }))
      if (editingEventId === event.id) {
        setEditingEventId(null)
        setShowEventForm(false)
      }
      toast('Événement supprimé')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function importCalendarFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImportingCalendar(true)
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Le fichier iCalendar dépasse 2 Mo')
      const result = await api.importAgendaIcs(await file.text())
      await loadDashboard()
      toast(`${result.imported} événement(s) importé(s)`)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setImportingCalendar(false)
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
          agendaMonth={agendaMonth}
          setAgendaMonth={setAgendaMonth}
          selectedDate={selectedAgendaDate}
          setSelectedDate={setSelectedAgendaDate}
          checkMap={checkMap}
          todayDone={todayDone}
          selectedDayDone={selectedDayDone}
          agendaCompletion={agendaCompletion}
          currentStreak={currentStreak}
          agendaSeries={agendaSeries}
          agendaMonthGrid={agendaMonthGrid}
          tasksByDate={tasksByDate}
          selectedDayTasks={selectedDayTasks}
          selectedDayEvents={selectedDayEvents}
          todayTasks={todayTasks}
          overdueTasks={overdueTasks}
          showAgendaNotice={showAgendaNotice}
          closeAgendaNotice={closeAgendaNotice}
          practiceForm={practiceForm}
          setPracticeForm={setPracticeForm}
          addPractice={addPractice}
          toggleTodo={toggleTodo}
          togglePractice={togglePractice}
          editingPracticeId={editingPracticeId}
          editingPracticeTitle={editingPracticeTitle}
          setEditingPracticeTitle={setEditingPracticeTitle}
          startEditPractice={startEditPractice}
          savePracticeTitle={savePracticeTitle}
          cancelEditPractice={() => { setEditingPracticeId(null); setEditingPracticeTitle('') }}
          removePractice={removePractice}
          togglePracticeCheck={togglePracticeCheck}
          events={dashboard.events || []}
          eventForm={eventForm}
          setEventForm={setEventForm}
          editingEventId={editingEventId}
          showEventForm={showEventForm}
          beginNewEvent={beginNewEvent}
          beginEditEvent={beginEditEvent}
          saveAgendaEvent={saveAgendaEvent}
          removeAgendaEvent={removeAgendaEvent}
          cancelEventForm={() => { setShowEventForm(false); setEditingEventId(null) }}
          calendarInputRef={calendarInputRef}
          importCalendarFile={importCalendarFile}
          importingCalendar={importingCalendar}
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
  if (section === 'agenda') return `${activePractices} habitudes actives · ${agendaCompletion}% sur 28 jours · série ${currentStreak} j`
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
        {!loading && todos.length === 0 && <div className="todo-empty">Aucune tâche ici.</div>}
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

function AgendaPanel({
  loading,
  activePractices,
  practices,
  today,
  agendaMonth,
  setAgendaMonth,
  selectedDate,
  setSelectedDate,
  checkMap,
  todayDone,
  selectedDayDone,
  agendaCompletion,
  currentStreak,
  agendaSeries,
  agendaMonthGrid,
  tasksByDate,
  selectedDayTasks,
  selectedDayEvents,
  todayTasks,
  overdueTasks,
  showAgendaNotice,
  closeAgendaNotice,
  practiceForm,
  setPracticeForm,
  addPractice,
  toggleTodo,
  togglePractice,
  editingPracticeId,
  editingPracticeTitle,
  setEditingPracticeTitle,
  startEditPractice,
  savePracticeTitle,
  cancelEditPractice,
  removePractice,
  togglePracticeCheck,
  events,
  eventForm,
  setEventForm,
  editingEventId,
  showEventForm,
  beginNewEvent,
  beginEditEvent,
  saveAgendaEvent,
  removeAgendaEvent,
  cancelEventForm,
  calendarInputRef,
  importCalendarFile,
  importingCalendar,
}) {
  return (
    <div className="agenda-dashboard">
      {showAgendaNotice && (
        <section className="agenda-day-alert">
          <div>
            <strong>{todayTasks.length} tâche(s) aujourd'hui</strong>
            {overdueTasks.length > 0 && <span>{overdueTasks.length} tâche(s) en retard à rattraper.</span>}
            {todayTasks.length > 0 && <span>Ton Agenda les affiche directement dans la journée.</span>}
          </div>
          <button type="button" className="btn-ghost" onClick={closeAgendaNotice}>Vu pour aujourd'hui</button>
        </section>
      )}

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

      <section className="agenda-calendar-panel">
        <div className="agenda-section-head">
          <div>
            <h3>Calendrier</h3>
            <span>{monthLabel(agendaMonth)}</span>
          </div>
          <div className="agenda-calendar-nav">
            <input ref={calendarInputRef} className="agenda-file-input" type="file" accept=".ics,text/calendar" onChange={importCalendarFile} />
            <button type="button" className="btn-ghost" disabled={importingCalendar} onClick={() => calendarInputRef.current?.click()}>
              {importingCalendar ? 'Import…' : 'Importer .ics'}
            </button>
            <button type="button" className="btn-ghost" onClick={api.exportAgendaIcs}>Exporter</button>
            <button type="button" className="icon-btn" onClick={() => setAgendaMonth(month => shiftMonth(month, -1))}>‹</button>
            <button type="button" className="btn-ghost" onClick={() => { setAgendaMonth(startOfMonth(today)); setSelectedDate(today) }}>Aujourd'hui</button>
            <button type="button" className="icon-btn" onClick={() => setAgendaMonth(month => shiftMonth(month, 1))}>›</button>
          </div>
        </div>
        <div className="agenda-calendar-grid">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, index) => <span key={`${day}-${index}`} className="agenda-weekday">{day}</span>)}
          {agendaMonthGrid.map(day => {
            const dayTasks = tasksByDate.get(day.date) || []
            const dayEvents = events.filter(event => event.start_date <= day.date && event.end_date >= day.date)
            const dayPractices = dashboardAvailablePractices(practices, day.date)
            const dayDone = dayPractices.filter(practice => checkMap.get(`${practice.id}:${day.date}`)).length
            return (
              <button
                key={day.date}
                type="button"
                className={[
                  'agenda-calendar-day',
                  !day.inMonth ? 'outside' : '',
                  day.date === today ? 'today' : '',
                  day.date === selectedDate ? 'selected' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setSelectedDate(day.date)}
              >
                <strong>{dayNumber(day.date)}</strong>
                <b>{dayEvents.length ? `${dayEvents.length} évènement${dayEvents.length > 1 ? 's' : ''}` : ''}</b>
                <span>{dayTasks.length ? `${dayTasks.length} tâche${dayTasks.length > 1 ? 's' : ''}` : ''}</span>
                {dayPractices.length > 0 && <em>{dayDone}/{dayPractices.length}</em>}
              </button>
            )
          })}
        </div>
      </section>

      <section className="agenda-day-panel">
        <div className="agenda-section-head">
          <div>
            <h3>{selectedDate === today ? "Aujourd'hui" : formatDate(selectedDate)}</h3>
            <span>{selectedDayEvents.length} événement(s) · {selectedDayTasks.length} tâche(s) · {selectedDayDone}/{dashboardAvailablePractices(practices, selectedDate).length} habitude(s)</span>
          </div>
          <button type="button" className="btn-primary" onClick={() => beginNewEvent(selectedDate)}>+ Événement</button>
        </div>
        <div className="agenda-day-list">
          {selectedDayEvents.length === 0 && selectedDayTasks.length === 0 && <div className="todo-empty">Rien de prévu ce jour-là.</div>}
          {selectedDayEvents.map(event => (
            <article key={event.id} className="agenda-event-card">
              <div className="agenda-event-time">{formatEventTime(event, selectedDate)}</div>
              <div>
                <strong>{event.title}</strong>
                {event.location && <span>📍 {event.location}</span>}
                {event.notes && <p>{event.notes}</p>}
              </div>
              <div className="agenda-event-actions">
                <button type="button" onClick={() => beginEditEvent(event)}>Modifier</button>
                <button type="button" className="danger" onClick={() => removeAgendaEvent(event)}>Supprimer</button>
              </div>
            </article>
          ))}
          {selectedDayTasks.map(todo => (
            <article key={todo.id} className="agenda-task-card">
              <button type="button" className="todo-check" onClick={() => toggleTodo(todo)} title="Terminer">✓</button>
              <div>
                <strong>{todo.title}</strong>
                {todo.notes && <p>{todo.notes}</p>}
              </div>
            </article>
          ))}
          {overdueTasks.length > 0 && selectedDate === today && (
            <div className="agenda-overdue">
              <strong>À rattraper</strong>
              {overdueTasks.map(todo => (
                <article key={todo.id} className="agenda-task-card late">
                  <button type="button" className="todo-check" onClick={() => toggleTodo(todo)} title="Terminer">✓</button>
                  <div>
                    <strong>{todo.title}</strong>
                    <span>{formatDate(todo.due_at)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {showEventForm && (
        <section className="agenda-event-editor">
          <div className="agenda-section-head">
            <div>
              <h3>{editingEventId ? 'Modifier l’événement' : 'Nouvel événement'}</h3>
              <span>Journée entière ou rendez-vous avec horaires.</span>
            </div>
            <button type="button" className="btn-ghost" onClick={cancelEventForm}>Fermer</button>
          </div>
          <form className="agenda-event-form" onSubmit={saveAgendaEvent}>
            <label className="agenda-event-title">Titre
              <input className="todo-input" value={eventForm.title} maxLength="240" required onChange={event => setEventForm(prev => ({ ...prev, title: event.target.value }))} />
            </label>
            <label>Début
              <input className="todo-input" type="date" required value={eventForm.start_date} onChange={event => setEventForm(prev => ({ ...prev, start_date: event.target.value, end_date: prev.end_date < event.target.value ? event.target.value : prev.end_date }))} />
            </label>
            {!eventForm.all_day && <label>Heure
              <input className="todo-input" type="time" required value={eventForm.start_time} onChange={event => setEventForm(prev => ({ ...prev, start_time: event.target.value }))} />
            </label>}
            <label>Fin
              <input className="todo-input" type="date" required min={eventForm.start_date} value={eventForm.end_date} onChange={event => setEventForm(prev => ({ ...prev, end_date: event.target.value }))} />
            </label>
            {!eventForm.all_day && <label>Heure
              <input className="todo-input" type="time" required value={eventForm.end_time} onChange={event => setEventForm(prev => ({ ...prev, end_time: event.target.value }))} />
            </label>}
            <label className="agenda-all-day">
              <input type="checkbox" checked={eventForm.all_day} onChange={event => setEventForm(prev => ({ ...prev, all_day: event.target.checked }))} /> Journée entière
            </label>
            <label>Lieu
              <input className="todo-input" value={eventForm.location} maxLength="500" onChange={event => setEventForm(prev => ({ ...prev, location: event.target.value }))} />
            </label>
            <label className="agenda-event-notes">Notes
              <textarea className="todo-input" rows="3" value={eventForm.notes} maxLength="4000" onChange={event => setEventForm(prev => ({ ...prev, notes: event.target.value }))} />
            </label>
            <div className="agenda-event-submit">
              <button type="button" className="btn-ghost" onClick={cancelEventForm}>Annuler</button>
              <button type="submit" className="btn-primary">{editingEventId ? 'Enregistrer' : 'Créer'}</button>
            </div>
          </form>
        </section>
      )}

      <section className="agenda-today">
        <div className="agenda-section-head">
          <div>
            <h3>Habitudes</h3>
            <span>{selectedDayDone}/{dashboardAvailablePractices(practices, selectedDate).length} faites le {formatShortDate(selectedDate)}</span>
          </div>
        </div>

        <form className="practice-form" onSubmit={addPractice}>
          <input
            className="todo-input"
            placeholder="Nouvelle habitude"
            value={practiceForm.title}
            onChange={event => setPracticeForm(prev => ({ ...prev, title: event.target.value }))}
          />
          <div className="practice-form-row">
            <button className="btn-primary" disabled={!practiceForm.title.trim()}>Ajouter</button>
          </div>
        </form>

        <div className="practice-check-list">
          {loading && <div className="todo-empty">Chargement...</div>}
          {!loading && dashboardAvailablePractices(practices, selectedDate).length === 0 && <div className="todo-empty">Ajoute une habitude pour commencer.</div>}
          {dashboardAvailablePractices(practices, selectedDate).map(practice => {
            const done = checkMap.get(`${practice.id}:${selectedDate}`)
            return (
              <button
                key={practice.id}
                type="button"
                className={`practice-check ${done ? 'done' : ''}`}
                onClick={() => togglePracticeCheck(practice, selectedDate)}
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
            const label = `${formatShortDate(day.day)} · ${day.done}/${day.total || 0} habitudes · ${day.percent}%`
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
            <span>Les habitudes archivées restent dans l'historique.</span>
          </div>
        </div>
        <div className="practice-manage-list">
          {practices.map(practice => (
            <article key={practice.id} className={`practice-manage-card ${practice.active ? '' : 'archived'}`}>
              <span className="practice-dot" />
              <div>
                {editingPracticeId === practice.id ? (
                  <input
                    className="todo-input practice-edit-input"
                    value={editingPracticeTitle}
                    onChange={event => setEditingPracticeTitle(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') savePracticeTitle(practice)
                      if (event.key === 'Escape') cancelEditPractice()
                    }}
                    autoFocus
                  />
                ) : (
                  <strong>{practice.title}</strong>
                )}
                <span>{practice.active ? 'Active' : `Archivée ${formatDate(practice.archived_at)}`}</span>
              </div>
              <div className="practice-manage-actions">
                {editingPracticeId === practice.id ? (
                  <>
                    <button type="button" onClick={() => savePracticeTitle(practice)}>Valider</button>
                    <button type="button" onClick={cancelEditPractice}>Annuler</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => startEditPractice(practice)}>Modifier</button>
                    <button type="button" onClick={() => togglePractice(practice, !practice.active)}>
                      {practice.active ? 'Archiver' : 'Reprendre'}
                    </button>
                    <button type="button" className="danger" onClick={() => removePractice(practice)}>Supprimer</button>
                  </>
                )}
              </div>
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

function emptyAgendaEvent(date) {
  return {
    title: '', notes: '', location: '', start_date: date, start_time: '09:00',
    end_date: date, end_time: '10:00', all_day: true,
  }
}

function formatEventTime(event, selectedDate) {
  if (event.all_day) return event.start_date === event.end_date ? 'Journée' : 'Plusieurs jours'
  if (selectedDate === event.start_date) return event.start_time || 'Début'
  if (selectedDate === event.end_date) return `jusqu’à ${event.end_time || ''}`.trim()
  return 'En cours'
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

function startOfMonth(dateText) {
  const date = new Date(`${dateText}T00:00:00`)
  return toDateInput(new Date(date.getFullYear(), date.getMonth(), 1))
}

function shiftMonth(dateText, delta) {
  const date = new Date(`${dateText}T00:00:00`)
  return toDateInput(new Date(date.getFullYear(), date.getMonth() + delta, 1))
}

function buildMonthGrid(monthText) {
  const first = new Date(`${monthText}T00:00:00`)
  const startOffset = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(first.getDate() - startOffset)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return {
      date: toDateInput(date),
      inMonth: date.getMonth() === first.getMonth(),
    }
  })
}

function groupTodosByDate(todos) {
  const map = new Map()
  todos.forEach(todo => {
    const key = String(todo.due_at || '').slice(0, 10)
    if (!key) return
    const list = map.get(key) || []
    list.push(todo)
    map.set(key, list)
  })
  return map
}

function dashboardAvailablePractices(practices, day) {
  return practices.filter(practice => practice.active && wasPracticeAvailable(practice, day))
}

function wasPracticeAvailable(practice, day) {
  if (!practice.created_at) return true
  const created = String(practice.created_at).slice(0, 10)
  const archived = practice.archived_at ? String(practice.archived_at).slice(0, 10) : null
  return day >= created && (!archived || day <= archived)
}

function monthLabel(value) {
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

function dayNumber(value) {
  return new Date(`${value}T00:00:00`).getDate()
}

function agendaNoticeKey(userId) {
  return `pw-agenda-reminder-${userId || 'local'}`
}

function hasSeenAgendaNotice(userId, today) {
  return localStorage.getItem(agendaNoticeKey(userId)) === today
}

function markAgendaNoticeSeen(userId, today) {
  localStorage.setItem(agendaNoticeKey(userId), today)
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
