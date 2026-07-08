import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/useApp'
import Icon from './Icons'
import * as api from '../api'

export default function TodoReminder() {
  const { currentUser, dispatch, toast } = useApp()
  const [todos, setTodos] = useState([])
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!currentUser?.id) return
    const today = todayInput()
    const key = `pw-todo-reminder-${currentUser.id}`
    if (localStorage.getItem(key) === today) return

    let cancelled = false
    api.getTodoReminder()
      .then(rows => {
        const dueNow = rows.filter(todo => String(todo.due_at || '').slice(0, 10) <= today)
        if (cancelled || !dueNow.length) return
        setTodos(dueNow)
        setVisible(true)
        localStorage.setItem(key, today)
      })
      .catch(err => toast(err.message, 'error'))

    return () => { cancelled = true }
  }, [currentUser?.id, toast])

  const urgentTodos = useMemo(() => {
    return todos
      .map(todo => ({ ...todo, deadline: deadlineState(todo.due_at) }))
      .sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)))
  }, [todos])

  if (!visible || urgentTodos.length === 0) return null

  return (
    <div className="todo-reminder-backdrop" role="dialog" aria-modal="true" aria-label="Rappel agenda">
      <section className="todo-reminder-panel">
        <div className="todo-reminder-head">
          <span className="todo-reminder-icon"><Icon name="calendar" size={22} /></span>
          <div>
            <strong>Agenda du jour</strong>
            <p>Voici les tâches à faire aujourd'hui ou déjà en retard.</p>
          </div>
          <button type="button" className="icon-btn" onClick={() => setVisible(false)} title="Fermer">
            <Icon name="close" />
          </button>
        </div>

        <div className="todo-reminder-list">
          {urgentTodos.map(todo => (
            <div key={todo.id} className="todo-reminder-item">
              <span className={`todo-deadline-pill ${todo.deadline.kind}`}>{todo.deadline.label}</span>
              <span>{todo.title}</span>
            </div>
          ))}
        </div>

        <div className="todo-reminder-actions">
          <button type="button" className="btn-ghost" onClick={() => setVisible(false)}>Plus tard</button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setVisible(false)
              dispatch({ type: 'SET_VIEW', payload: 'agenda' })
            }}
          >
            Ouvrir Agenda
          </button>
        </div>
      </section>
    </div>
  )
}

function deadlineState(dueAt) {
  const today = new Date(todayInput())
  const due = new Date(`${dueAt}T00:00:00`)
  const diff = Math.round((due - today) / 86400000)
  if (diff < 0) return { kind: 'late', label: `Retard ${Math.abs(diff)} j` }
  if (diff === 0) return { kind: 'today', label: "Aujourd'hui" }
  if (diff <= 3) return { kind: 'soon', label: `Dans ${diff} j` }
  return { kind: 'later', label: new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(due) }
}

function todayInput() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 10)
}
