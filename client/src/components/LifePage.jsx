import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/useApp'
import Icon from './Icons'
import * as api from '../api'

export default function LifePage() {
  const { dispatch, toast } = useApp()
  const [quotes, setQuotes] = useState([])
  const [form, setForm] = useState({ quote: '', author: '', source: '', notes: '', tags: '' })
  const [showQuoteForm, setShowQuoteForm] = useState(false)

  const quoteTags = useMemo(() => {
    return form.tags
      .split(',')
      .map(t => t.trim().replace(/^#/, ''))
      .filter(Boolean)
  }, [form.tags])

  useEffect(() => {
    loadQuotes()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadQuotes() {
    try {
      setQuotes(await api.getQuotes())
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function addQuote(e) {
    e.preventDefault()
    if (!form.quote.trim()) return
    try {
      const created = await api.createQuote({ ...form, tags: quoteTags })
      setQuotes(prev => [created, ...prev])
      setForm({ quote: '', author: '', source: '', notes: '', tags: '' })
      setShowQuoteForm(false)
      toast('Citation ajoutee')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function removeQuote(id) {
    await api.deleteQuote(id)
    setQuotes(prev => prev.filter(q => q.id !== id))
    toast('Citation supprimee')
  }

  return (
    <div className="life-page">
      <div className="life-header">
        <button className="icon-btn" onClick={() => dispatch({ type: 'SET_VIEW', payload: 'editor' })} title="Retour">
          <Icon name="back" />
        </button>
        <h2>Vie interieure</h2>
      </div>

      <div className="life-layout">
        <section className="life-section quotes-section">
          <div className="life-section-header">
            <h3>Citations</h3>
            <button
              type="button"
              className="life-add-btn"
              onClick={() => setShowQuoteForm(open => !open)}
            >
              <Icon name={showQuoteForm ? 'close' : 'plus'} size={15} />
              {showQuoteForm ? 'Fermer' : 'Ajouter'}
            </button>
          </div>

          <form className={`quote-form ${showQuoteForm ? 'is-open' : ''}`} onSubmit={addQuote}>
            <textarea
              className="life-input"
              placeholder="Citation..."
              rows={4}
              value={form.quote}
              onChange={e => setForm(f => ({ ...f, quote: e.target.value }))}
            />
            <div className="quote-form-grid">
              <input className="life-input" placeholder="Auteur" value={form.author} onChange={e => setForm(f => ({ ...f, author: e.target.value }))} />
              <input className="life-input" placeholder="Source" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} />
            </div>
            <input className="life-input" placeholder="Tags separes par virgules" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
            <textarea className="life-input" placeholder="Pourquoi elle te parle ?" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            <button className="btn-primary" disabled={!form.quote.trim()}>Ajouter</button>
          </form>

          <div className="quote-list">
            {quotes.length === 0 && <div className="life-empty">Aucune citation pour le moment.</div>}
            {quotes.map(q => {
              const tags = parseTags(q.tags)
              return (
                <article key={q.id} className="quote-card">
                  <blockquote>{q.quote}</blockquote>
                  <div className="quote-meta">
                    {[q.author, q.source].filter(Boolean).join(' - ') || 'Source non renseignee'}
                  </div>
                  {q.notes && <p className="quote-notes">{q.notes}</p>}
                  {tags.length > 0 && (
                    <div className="quote-tags">{tags.map(t => <span key={t}>#{t}</span>)}</div>
                  )}
                  <button className="quote-delete" onClick={() => removeQuote(q.id)}>Supprimer</button>
                </article>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}

function parseTags(raw) {
  try { return JSON.parse(raw) || [] } catch { return [] }
}
