import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/useApp'
import Icon from './Icons'
import * as api from '../api'

const FACT_STATUSES = [
  { value: 'to_check', label: 'A verifier', color: 'var(--text-3)' },
  { value: 'true', label: 'Vrai', color: 'var(--success)' },
  { value: 'false', label: 'Faux', color: 'var(--danger)' },
  { value: 'partial', label: 'Partiellement vrai', color: 'var(--info)' },
]

function statusMeta(value) {
  return FACT_STATUSES.find(s => s.value === value) || FACT_STATUSES[0]
}

export default function LifePage() {
  const { toast } = useApp()
  const [quotes, setQuotes] = useState([])
  const [form, setForm] = useState({ quote: '', author: '', source: '', notes: '', tags: '' })
  const [showQuoteForm, setShowQuoteForm] = useState(false)

  const [factChecks, setFactChecks] = useState([])
  const [factForm, setFactForm] = useState({ claim: '', source: '', notes: '', tags: '' })
  const [showFactForm, setShowFactForm] = useState(false)

  const quoteTags = useMemo(() => {
    return form.tags
      .split(',')
      .map(t => t.trim().replace(/^#/, ''))
      .filter(Boolean)
  }, [form.tags])

  const factTags = useMemo(() => {
    return factForm.tags
      .split(',')
      .map(t => t.trim().replace(/^#/, ''))
      .filter(Boolean)
  }, [factForm.tags])

  useEffect(() => {
    loadQuotes()
    loadFactChecks()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadQuotes() {
    try {
      setQuotes(await api.getQuotes())
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function loadFactChecks() {
    try {
      setFactChecks(await api.getFactChecks())
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

  async function addFactCheck(e) {
    e.preventDefault()
    if (!factForm.claim.trim()) return
    try {
      const created = await api.createFactCheck({ ...factForm, tags: factTags })
      setFactChecks(prev => [created, ...prev])
      setFactForm({ claim: '', source: '', notes: '', tags: '' })
      setShowFactForm(false)
      toast('Idee ajoutee au fact check')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function setFactStatus(id, status) {
    try {
      const updated = await api.updateFactCheck(id, { status })
      setFactChecks(prev => prev.map(f => f.id === id ? updated : f))
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function removeFactCheck(id) {
    await api.deleteFactCheck(id)
    setFactChecks(prev => prev.filter(f => f.id !== id))
    toast('Idee supprimee')
  }

  return (
    <div className="life-page">
      <div className="life-header">
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

        <section className="life-section factcheck-section">
          <div className="life-section-header">
            <h3>Fact Check</h3>
            <button
              type="button"
              className="life-add-btn"
              onClick={() => setShowFactForm(open => !open)}
            >
              <Icon name={showFactForm ? 'close' : 'plus'} size={15} />
              {showFactForm ? 'Fermer' : 'Ajouter'}
            </button>
          </div>

          <form className={`quote-form ${showFactForm ? 'is-open' : ''}`} onSubmit={addFactCheck}>
            <textarea
              className="life-input"
              placeholder="L'idee recue que tu n'as pas encore verifiee..."
              rows={3}
              value={factForm.claim}
              onChange={e => setFactForm(f => ({ ...f, claim: e.target.value }))}
            />
            <input className="life-input" placeholder="D'ou ca vient (source)" value={factForm.source} onChange={e => setFactForm(f => ({ ...f, source: e.target.value }))} />
            <input className="life-input" placeholder="Tags separes par virgules" value={factForm.tags} onChange={e => setFactForm(f => ({ ...f, tags: e.target.value }))} />
            <textarea className="life-input" placeholder="Pourquoi tu doutes, contexte..." rows={2} value={factForm.notes} onChange={e => setFactForm(f => ({ ...f, notes: e.target.value }))} />
            <button className="btn-primary" disabled={!factForm.claim.trim()}>Ajouter</button>
          </form>

          <div className="quote-list">
            {factChecks.length === 0 && <div className="life-empty">Rien a verifier pour le moment.</div>}
            {factChecks.map(f => {
              const tags = parseTags(f.tags)
              const meta = statusMeta(f.status)
              return (
                <article key={f.id} className="quote-card factcheck-card">
                  <p className="factcheck-claim">{f.claim}</p>
                  <div className="factcheck-status-row">
                    <select
                      className="factcheck-status-select"
                      style={{ '--status-color': meta.color }}
                      value={f.status}
                      onChange={e => setFactStatus(f.id, e.target.value)}
                    >
                      {FACT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    {f.source && <span className="quote-meta">{f.source}</span>}
                  </div>
                  {f.notes && <p className="quote-notes">{f.notes}</p>}
                  {tags.length > 0 && (
                    <div className="quote-tags">{tags.map(t => <span key={t}>#{t}</span>)}</div>
                  )}
                  <button className="quote-delete" onClick={() => removeFactCheck(f.id)}>Supprimer</button>
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
