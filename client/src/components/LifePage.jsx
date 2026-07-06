import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import Icon from './Icons'
import * as api from '../api'

const PERIODS = [
  { days: 7, label: '1 semaine' },
  { days: 14, label: '2 semaines' },
  { days: 30, label: '1 mois' },
  { days: 90, label: '3 mois' },
]

export default function LifePage() {
  const { dispatch, toast } = useApp()
  const [quotes, setQuotes] = useState([])
  const [form, setForm] = useState({ quote: '', author: '', source: '', notes: '', tags: '' })
  const [days, setDays] = useState(7)
  const [modelsConfig, setModelsConfig] = useState(null)
  const [provider, setProvider] = useState(localStorage.getItem('pw-ai-provider') || 'anthropic')
  const [model, setModel] = useState(localStorage.getItem('pw-ai-model') || 'claude-sonnet-4-6')
  const [loadingReport, setLoadingReport] = useState(false)
  const [report, setReport] = useState(null)
  const [mobileTab, setMobileTab] = useState('quotes')
  const [showQuoteForm, setShowQuoteForm] = useState(false)

  const providerConfig = modelsConfig?.providers?.[provider]
  const models = providerConfig?.models || []
  const selectedModel = models.find(m => m.id === model) || models[0]

  useEffect(() => {
    loadQuotes()
    api.getAIModels().then(config => {
      setModelsConfig(config)
      const nextProvider = config.providers?.[provider] ? provider : config.defaultProvider
      const nextModel = config.providers?.[nextProvider]?.models?.some(m => m.id === model)
        ? model
        : config.providers?.[nextProvider]?.models?.[0]?.id
      setProvider(nextProvider)
      if (nextModel) setModel(nextModel)
    }).catch(err => toast(err.message, 'error'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const quoteTags = useMemo(() => {
    return form.tags
      .split(',')
      .map(t => t.trim().replace(/^#/, ''))
      .filter(Boolean)
  }, [form.tags])

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
      toast('Citation ajoutée')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function removeQuote(id) {
    await api.deleteQuote(id)
    setQuotes(prev => prev.filter(q => q.id !== id))
    toast('Citation supprimée')
  }

  async function generateReport() {
    setLoadingReport(true)
    setReport(null)
    try {
      const result = await api.generateLifeReport({
        days,
        provider,
        model: selectedModel?.id || model,
        max_tokens: 1800,
      })
      setReport(result)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoadingReport(false)
    }
  }

  return (
    <div className="life-page">
      <div className="life-header">
        <button className="icon-btn" onClick={() => dispatch({ type: 'SET_VIEW', payload: 'editor' })} title="Retour">
          <Icon name="back" />
        </button>
        <h2>Vie intérieure</h2>
      </div>

      <div className="life-mobile-tabs">
        <button
          className={`inbox-tab-btn ${mobileTab === 'quotes' ? 'active' : ''}`}
          onClick={() => setMobileTab('quotes')}
        >
          Citations
        </button>
        <button
          className={`inbox-tab-btn ${mobileTab === 'report' ? 'active' : ''}`}
          onClick={() => setMobileTab('report')}
        >
          Rapport IA
        </button>
      </div>

      <div className={`life-layout mobile-tab-${mobileTab}`}>
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
            <input className="life-input" placeholder="Tags séparés par virgules" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
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
                    {[q.author, q.source].filter(Boolean).join(' · ') || 'Source non renseignée'}
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

        <section className="life-section report-section">
          <div className="life-section-header">
            <h3>Rapport IA</h3>
          </div>

          <div className="report-controls">
            <div className="period-pills">
              {PERIODS.map(p => (
                <button
                  key={p.days}
                  className={`filter-pill ${days === p.days ? 'active' : ''}`}
                  onClick={() => setDays(p.days)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="report-ai-row">
              <select
                className="life-input"
                value={provider}
                onChange={e => {
                  const nextProvider = e.target.value
                  const first = modelsConfig?.providers?.[nextProvider]?.models?.[0]
                  setProvider(nextProvider)
                  if (first) setModel(first.id)
                }}
              >
                {modelsConfig && Object.entries(modelsConfig.providers).map(([id, cfg]) => (
                  <option key={id} value={id}>{cfg.label}</option>
                ))}
              </select>
              <select className="life-input" value={selectedModel?.id || model} onChange={e => setModel(e.target.value)}>
                {models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>

            <button className="btn-primary report-generate" onClick={generateReport} disabled={loadingReport || !selectedModel}>
              {loadingReport ? 'Analyse en cours...' : 'Générer le rapport'}
            </button>
          </div>

          {report && (
            <div className="life-report">
              <div className="report-counts">
                <span>{report.counts.notes} notes</span>
                <span>{report.counts.quotes} citations</span>
                <span>{report.counts.ideas} idées</span>
                <span>{report.counts.timerSessions} sessions</span>
              </div>
              <ReportText text={report.text} />
            </div>
          )}

          {!report && (
            <div className="life-empty report-empty">
              Le rapport lit tes notes modifiées, citations, idées, ressources, sessions de travail et notes vocales sur la période choisie.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function ReportText({ text }) {
  return (
    <div className="report-text">
      {String(text || '').split('\n').map((line, i) => {
        if (line.startsWith('## ')) return <h4 key={i}>{line.slice(3)}</h4>
        if (!line.trim()) return <br key={i} />
        return <p key={i}>{line}</p>
      })}
    </div>
  )
}

function parseTags(raw) {
  try { return JSON.parse(raw) || [] } catch { return [] }
}
