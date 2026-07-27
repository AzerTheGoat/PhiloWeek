import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/useApp'
import * as api from '../api'

const MODES = [
  ['idea', 'Idée', 'Une pensée rapide avant qu’elle disparaisse.'],
  ['quote', 'Citation', 'Un texte, son auteur et sa source.'],
  ['fact', 'Fact check', 'Une affirmation à vérifier plus tard.'],
  ['agenda', 'Agenda', 'Les habitudes à cocher aujourd’hui.'],
  ['todo', 'Tâche', 'Une action et sa date limite.'],
]

export default function MobileCapturePage() {
  const { toast } = useApp()
  const [mode, setMode] = useState('idea')
  const active = MODES.find(item => item[0] === mode) || MODES[0]
  return (
    <div className="mobile-capture-page">
      <header className="mobile-capture-header">
        <select aria-label="Type de capture" value={mode} onChange={event => setMode(event.target.value)}>
          {MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <div><h2>Capturer</h2><p>{active[2]}</p></div>
      </header>
      {mode === 'idea' && <SimpleCapture type="idea" toast={toast} />}
      {mode === 'quote' && <SimpleCapture type="quote" toast={toast} />}
      {mode === 'fact' && <SimpleCapture type="fact" toast={toast} />}
      {mode === 'todo' && <SimpleCapture type="todo" toast={toast} />}
      {mode === 'agenda' && <AgendaCapture toast={toast} />}
    </div>
  )
}

function SimpleCapture({ type, toast }) {
  const empty = type === 'quote'
    ? { quote: '', author: '', source: '', notes: '' }
    : type === 'fact'
      ? { claim: '', source: '', notes: '' }
      : type === 'todo'
        ? { title: '', notes: '', due_at: todayInput() }
        : { content: '' }
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const required = type === 'quote' ? form.quote : type === 'fact' ? form.claim : type === 'todo' ? form.title : form.content

  async function submit(event) {
    event.preventDefault()
    if (!required.trim()) return
    setSaving(true)
    try {
      if (type === 'idea') await api.createIdea({ content: form.content.trim() })
      if (type === 'quote') await api.createQuote({ ...form, tags: [] })
      if (type === 'fact') await api.createFactCheck({ ...form, tags: [] })
      if (type === 'todo') await api.createTodo(form)
      setForm(empty)
      toast(type === 'todo' ? 'Tâche ajoutée' : 'Capture enregistrée')
    } catch (err) { toast(err.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <form className="mobile-capture-form" onSubmit={submit}>
      {type === 'idea' && <textarea autoFocus value={form.content} onChange={event => setForm({ content: event.target.value })} placeholder="Écris sans te censurer…" />}
      {type === 'quote' && <>
        <textarea autoFocus value={form.quote} onChange={event => setForm(current => ({ ...current, quote: event.target.value }))} placeholder="La citation…" />
        <input value={form.author} onChange={event => setForm(current => ({ ...current, author: event.target.value }))} placeholder="Auteur (facultatif)" />
        <input value={form.source} onChange={event => setForm(current => ({ ...current, source: event.target.value }))} placeholder="Source (facultatif)" />
        <textarea className="is-small" value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Notes (facultatif)" />
      </>}
      {type === 'fact' && <>
        <textarea autoFocus value={form.claim} onChange={event => setForm(current => ({ ...current, claim: event.target.value }))} placeholder="Quelle affirmation veux-tu vérifier ?" />
        <input value={form.source} onChange={event => setForm(current => ({ ...current, source: event.target.value }))} placeholder="Source actuelle (facultatif)" />
        <textarea className="is-small" value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Contexte ou doute (facultatif)" />
      </>}
      {type === 'todo' && <>
        <input autoFocus value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="Que faut-il faire ?" />
        <label>Échéance<input type="date" value={form.due_at} onChange={event => setForm(current => ({ ...current, due_at: event.target.value }))} /></label>
        <textarea className="is-small" value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Notes (facultatif)" />
      </>}
      <button type="submit" className="btn-primary" disabled={saving || !required.trim()}>
        {saving ? 'Enregistrement…' : type === 'todo' ? 'Ajouter la tâche' : 'Enregistrer'}
      </button>
    </form>
  )
}

function AgendaCapture({ toast }) {
  const [dashboard, setDashboard] = useState(null)
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const checked = useMemo(() => new Set(
    (dashboard?.checks || []).filter(item => item.entry_date === dashboard.today && item.done).map(item => item.practice_id)
  ), [dashboard])

  async function load() {
    setLoading(true)
    try { setDashboard(await api.getTodoDashboard(7)) }
    catch (err) { toast(err.message, 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(practice) {
    try {
      await api.setPracticeCheck(practice.id, { entry_date: dashboard.today, done: !checked.has(practice.id) })
      await load()
    } catch (err) { toast(err.message, 'error') }
  }
  async function add(event) {
    event.preventDefault()
    if (!title.trim()) return
    try {
      await api.createPractice({ title: title.trim() })
      setTitle('')
      await load()
      toast('Habitude ajoutée')
    } catch (err) { toast(err.message, 'error') }
  }

  const practices = (dashboard?.practices || []).filter(item => item.active)
  return <section className="mobile-agenda-capture">
    <div className="mobile-agenda-card">
      <h3>Aujourd’hui</h3>
      {loading && <p>Chargement…</p>}
      {!loading && practices.length === 0 && <p>Aucune habitude active.</p>}
      {practices.map(practice => <button key={practice.id} type="button" className={checked.has(practice.id) ? 'is-done' : ''} onClick={() => toggle(practice)}>
        <span>{checked.has(practice.id) ? '✓' : ''}</span><strong>{practice.title}</strong>
      </button>)}
    </div>
    <form className="mobile-practice-form" onSubmit={add}>
      <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Nouvelle habitude quotidienne" />
      <button className="btn-ghost" disabled={!title.trim()}>Ajouter</button>
    </form>
  </section>
}

function todayInput() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}
