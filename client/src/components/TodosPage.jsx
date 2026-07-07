import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/useApp'
import Icon from './Icons'
import * as api from '../api'

const STATUS_FILTERS = [
  { value: 'open', label: 'Ouvertes' },
  { value: 'done', label: 'Terminées' },
  { value: 'all', label: 'Toutes' },
]

export default function TodosPage() {
  const { dispatch, toast } = useApp()
  const [todos, setTodos] = useState([])
  const [filter, setFilter] = useState('open')
  const [form, setForm] = useState(() => ({ title: '', notes: '', due_at: todayInput() }))
  const [showForm, setShowForm] = useState(true)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadTodos(filter)
  }, [filter]) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const open = todos.filter(todo => todo.status === 'open')
    return {
      total: todos.length,
      late: open.filter(todo => deadlineState(todo.due_at).kind === 'late').length,
      today: open.filter(todo => deadlineState(todo.due_at).kind === 'today').length,
    }
  }, [todos])

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

  return (
    <div className="todos-page">
      <div className="todos-header">
        <button className="icon-btn" onClick={() => dispatch({ type: 'SET_VIEW', payload: 'editor' })} title="Retour">
          <Icon name="back" />
        </button>
        <div>
          <h2>Todo</h2>
          <span>{stats.late} en retard · {stats.today} aujourd'hui · {stats.total} affichées</span>
        </div>
        <button type="button" className="btn-primary" onClick={() => setShowForm(open => !open)}>
          <Icon name={showForm ? 'close' : 'plus'} size={16} />
          {showForm ? 'Fermer' : 'Ajouter'}
        </button>
      </div>

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
                <input
                  type="date"
                  value={todo.due_at}
                  onChange={event => updateDueDate(todo, event.target.value)}
                />
                <button type="button" onClick={() => removeTodo(todo.id)}>Supprimer</button>
              </div>
            </article>
          )
        })}
      </div>
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

function deadlineState(dueAt) {
  const today = new Date(todayInput())
  const due = new Date(`${dueAt}T00:00:00`)
  const diff = Math.round((due - today) / 86400000)
  if (diff < 0) return { kind: 'late', label: `En retard de ${Math.abs(diff)} j` }
  if (diff === 0) return { kind: 'today', label: "Aujourd'hui" }
  if (diff <= 3) return { kind: 'soon', label: `Dans ${diff} j` }
  return { kind: 'later', label: formatDate(dueAt) }
}

function formatDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
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
