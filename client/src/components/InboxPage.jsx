import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../context/useApp'
import Icon from './Icons'
import * as api from '../api'

const RESOURCE_TYPES = [
  { id: 'article', label: 'Article', icon: '📄' },
  { id: 'video', label: 'Vidéo', icon: '🎥' },
  { id: 'book', label: 'Livre', icon: '📚' },
  { id: 'podcast', label: 'Podcast', icon: '🎧' },
  { id: 'other', label: 'Autre', icon: '🔗' },
]

const STATUS_CYCLE = { todo: 'in_progress', in_progress: 'done', done: 'todo' }
const STATUS_LABELS = { todo: 'À voir', in_progress: 'En cours', done: 'Fait' }
const STATUS_CLASS = { todo: 'status-todo', in_progress: 'status-progress', done: 'status-done' }

function typeIcon(type) {
  return RESOURCE_TYPES.find(t => t.id === type)?.icon || '🔗'
}

// ——— Resources Section ———

function ResourcesSection() {
  const { toast } = useApp()
  const [resources, setResources] = useState([])
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ url: '', title: '', type: 'article', notes: '' })
  const urlRef = useRef(null)

  const load = useCallback(async () => {
    const data = await api.getResources(filterStatus, filterType)
    setResources(data)
  }, [filterStatus, filterType])

  useEffect(() => { load() }, [load])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.url.trim()) return
    try {
      await api.createResource({ ...form, url: form.url.trim(), title: form.title || null })
      setForm({ url: '', title: '', type: 'article', notes: '' })
      setShowForm(false)
      await load()
      toast('Ressource ajoutée')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const cycleStatus = async (resource) => {
    const next = STATUS_CYCLE[resource.status] || 'todo'
    await api.updateResource(resource.id, { status: next })
    setResources(prev => prev.map(r => r.id === resource.id ? { ...r, status: next } : r))
  }

  const handleDelete = async (id) => {
    await api.deleteResource(id)
    setResources(prev => prev.filter(r => r.id !== id))
    toast('Supprimé')
  }

  // Auto-detect type from URL
  const handleUrlChange = (url) => {
    setForm(f => {
      const type = url.includes('youtube.com') || url.includes('youtu.be') || url.includes('vimeo.com')
        ? 'video'
        : url.includes('spotify.com') || url.includes('podcast') || url.includes('anchor.fm')
        ? 'podcast'
        : 'article'
      return { ...f, url, type }
    })
  }

  return (
    <div className="inbox-section">
      <div className="inbox-section-header">
        <h3>Ressources</h3>
        <button className="icon-btn" onClick={() => { setShowForm(s => !s); setTimeout(() => urlRef.current?.focus(), 50) }}>
          {showForm ? '✕' : '+'}
        </button>
      </div>

      {/* Inline add form */}
      {showForm && (
        <form className="resource-form" onSubmit={handleAdd}>
          <input
            ref={urlRef}
            type="url"
            className="inbox-input"
            placeholder="URL (https://…)"
            value={form.url}
            onChange={e => handleUrlChange(e.target.value)}
            required
          />
          <input
            type="text"
            className="inbox-input"
            placeholder="Titre (optionnel)"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
          <div className="type-pills">
            {RESOURCE_TYPES.map(t => (
              <button
                key={t.id}
                type="button"
                className={`type-pill ${form.type === t.id ? 'active' : ''}`}
                onClick={() => setForm(f => ({ ...f, type: t.id }))}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <textarea
            className="inbox-input"
            placeholder="Notes rapides (optionnel)"
            rows={2}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          />
          <button type="submit" className="btn-primary" disabled={!form.url.trim()}>
            Ajouter
          </button>
        </form>
      )}

      {/* Filters */}
      <div className="inbox-filters">
        <button className={`filter-pill ${!filterStatus ? 'active' : ''}`} onClick={() => setFilterStatus('')}>Tous</button>
        <button className={`filter-pill ${filterStatus === 'todo' ? 'active' : ''}`} onClick={() => setFilterStatus(f => f === 'todo' ? '' : 'todo')}>À voir</button>
        <button className={`filter-pill ${filterStatus === 'in_progress' ? 'active' : ''}`} onClick={() => setFilterStatus(f => f === 'in_progress' ? '' : 'in_progress')}>En cours</button>
        <button className={`filter-pill ${filterStatus === 'done' ? 'active' : ''}`} onClick={() => setFilterStatus(f => f === 'done' ? '' : 'done')}>Fait</button>
        <div className="filter-sep" />
        {RESOURCE_TYPES.map(t => (
          <button
            key={t.id}
            className={`filter-pill ${filterType === t.id ? 'active' : ''}`}
            onClick={() => setFilterType(f => f === t.id ? '' : t.id)}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="resource-list">
        {resources.length === 0 && (
          <div className="inbox-empty">Aucune ressource. Ajoutes-en une !</div>
        )}
        {resources.map(r => (
          <div key={r.id} className="resource-card">
            <div className="resource-card-main">
              <span className="resource-type-icon">{typeIcon(r.type)}</span>
              <div className="resource-info">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="resource-title"
                >
                  {r.title || r.url}
                </a>
                {r.title && (
                  <span className="resource-url-small">{r.url.replace(/^https?:\/\//, '').slice(0, 50)}</span>
                )}
                {r.notes && <p className="resource-notes">{r.notes}</p>}
              </div>
            </div>
            <div className="resource-card-actions">
              <button
                className={`status-badge ${STATUS_CLASS[r.status]}`}
                onClick={() => cycleStatus(r)}
                title="Changer le statut"
              >
                {STATUS_LABELS[r.status]}
              </button>
              <button
                className="resource-delete"
                onClick={() => handleDelete(r.id)}
                title="Supprimer"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ——— Ideas Section ———

function IdeasSection() {
  const { toast, fileNames, openFile, dispatch, loadTree } = useApp()
  const [ideas, setIdeas] = useState([])
  const [draft, setDraft] = useState(localStorage.getItem('inbox-draft') || '')
  const [editingId, setEditingId] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [sendingId, setSendingId] = useState(null)
  const [fileSearch, setFileSearch] = useState('')
  const textareaRef = useRef(null)

  useEffect(() => {
    api.getIdeas().then(setIdeas)
  }, [])

  // Persist draft to localStorage
  useEffect(() => {
    localStorage.setItem('inbox-draft', draft)
  }, [draft])

  const handleCapture = async (e) => {
    e?.preventDefault()
    if (!draft.trim()) return
    // Extract tags from content
    const tags = [...draft.matchAll(/#([a-zA-Z0-9_À-ɏ-]+)/g)].map(m => m[1])
    try {
      const idea = await api.createIdea({ content: draft.trim(), tags })
      setIdeas(prev => [idea, ...prev])
      setDraft('')
      localStorage.removeItem('inbox-draft')
      textareaRef.current?.focus()
      toast('Idée capturée')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleCapture()
  }

  const handleDelete = async (id) => {
    await api.deleteIdea(id)
    setIdeas(prev => prev.filter(i => i.id !== id))
    toast('Supprimé')
  }

  const startEdit = (idea) => {
    setEditingId(idea.id)
    setEditVal(idea.content)
  }

  const saveEdit = async (id) => {
    if (!editVal.trim()) { setEditingId(null); return }
    const tags = [...editVal.matchAll(/#([a-zA-Z0-9_À-ɏ-]+)/g)].map(m => m[1])
    const updated = await api.updateIdea(id, { content: editVal.trim(), tags })
    setIdeas(prev => prev.map(i => i.id === id ? updated : i))
    setEditingId(null)
  }

  const handleSendToFile = async (idea, fileId) => {
    try {
      const result = await api.sendIdeaToFile(idea.id, fileId)
      setIdeas(prev => prev.filter(i => i.id !== idea.id))
      setSendingId(null)
      // Refresh file if it's currently open
      if (result.file) {
        dispatch({ type: 'OPEN_FILE', payload: result.file })
      }
      toast('Idée envoyée vers la note')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const filteredFiles = fileNames.filter(f =>
    f.name.toLowerCase().includes(fileSearch.toLowerCase())
  ).slice(0, 8)

  const parseTags = (tagsJson) => {
    try { return JSON.parse(tagsJson) || [] } catch { return [] }
  }

  return (
    <div className="inbox-section">
      <div className="inbox-section-header">
        <h3>Questions & idées</h3>
      </div>

      {/* Quick capture */}
      <div className="idea-capture">
        <textarea
          ref={textareaRef}
          className="idea-textarea"
          placeholder="Une question, une idée, une intuition… (#tags supportés)"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
        />
        <button
          className="btn-primary idea-capture-btn"
          onClick={handleCapture}
          disabled={!draft.trim()}
        >
          Capturer
        </button>
      </div>

      {/* Ideas list */}
      <div className="idea-list">
        {ideas.length === 0 && (
          <div className="inbox-empty">Aucune idée. Capture ta première pensée !</div>
        )}
        {ideas.map(idea => {
          const tags = parseTags(idea.tags)
          return (
            <div key={idea.id} className={`idea-card ${editingId === idea.id ? 'editing' : ''}`}>
              {editingId === idea.id ? (
                <textarea
                  className="idea-edit-textarea"
                  value={editVal}
                  autoFocus
                  onChange={e => setEditVal(e.target.value)}
                  onBlur={() => saveEdit(idea.id)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') setEditingId(null)
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveEdit(idea.id)
                  }}
                  rows={3}
                />
              ) : (
                <p className="idea-content" onClick={() => startEdit(idea)}>{idea.content}</p>
              )}

              {tags.length > 0 && (
                <div className="idea-tags">
                  {tags.map(t => <span key={t} className="idea-tag">#{t}</span>)}
                </div>
              )}

              <div className="idea-meta">
                <span className="idea-date">
                  {new Date(idea.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </span>
                <div className="idea-actions">
                  {/* Send to file */}
                  <div className="idea-send-wrapper">
                    <button
                      className="idea-send-btn"
                      onClick={() => setSendingId(sendingId === idea.id ? null : idea.id)}
                      title="Envoyer vers une note"
                    >
                      → note
                    </button>
                    {sendingId === idea.id && (
                      <div className="file-dropdown">
                        <input
                          type="text"
                          autoFocus
                          placeholder="Chercher une note…"
                          value={fileSearch}
                          onChange={e => setFileSearch(e.target.value)}
                          className="file-dropdown-search"
                        />
                        {filteredFiles.length === 0 && (
                          <div className="file-dropdown-empty">Aucun résultat</div>
                        )}
                        {filteredFiles.map(f => (
                          <button
                            key={f.id}
                            className="file-dropdown-item"
                            onClick={() => { handleSendToFile(idea, f.id); setFileSearch('') }}
                          >
                            📄 {f.name.replace(/\.md$/i, '')}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    className="idea-delete"
                    onClick={() => handleDelete(idea.id)}
                    title="Supprimer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ——— InboxPage ———

export default function InboxPage() {
  const { dispatch } = useApp()
  const [mobileTab, setMobileTab] = useState('ideas')

  return (
    <div className="inbox-page">
      <div className="inbox-page-header">
        <button className="icon-btn" onClick={() => dispatch({ type: 'SET_VIEW', payload: 'editor' })} title="Retour">
          <Icon name="back" />
        </button>
        <h2><Icon name="idea" size={18} /> Nid à idées</h2>
      </div>

      {/* Mobile tabs */}
      <div className="inbox-mobile-tabs">
        <button
          className={`inbox-tab-btn ${mobileTab === 'resources' ? 'active' : ''}`}
          onClick={() => setMobileTab('resources')}
        >
          Ressources
        </button>
        <button
          className={`inbox-tab-btn ${mobileTab === 'ideas' ? 'active' : ''}`}
          onClick={() => setMobileTab('ideas')}
        >
          Idées
        </button>
      </div>

      <div className={`inbox-layout mobile-tab-${mobileTab}`}>
        <ResourcesSection />
        <IdeasSection />
      </div>
    </div>
  )
}
