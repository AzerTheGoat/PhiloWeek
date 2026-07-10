import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import { useApp } from '../context/useApp'
import { sanitizeHtml } from '../utils/sanitizeHtml'
import { useArticleReadTracker } from '../utils/useArticleReadTracker'
import { promptImageUrl } from '../utils/imageInput'
import Icon from './Icons'
import * as api from '../api'

marked.setOptions({ breaks: true, gfm: true })

const EMPTY_FORM = {
  title: '',
  excerpt: '',
  content: '',
  status: 'published',
  published_on: localDate(),
  tags: '',
  event_id: '',
  cover_image_data: '',
}

export default function SocialJournal() {
  const { toast } = useApp()
  const [scope, setScope] = useState('feed')
  const [query, setQuery] = useState('')
  const [articles, setArticles] = useState([])
  const [events, setEvents] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('read')
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [comment, setComment] = useState('')

  const loadArticles = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await api.getArticles({ scope, q: query, date: localDate() })
      setArticles(rows)
      if (!selected && rows[0]) {
        const full = await api.getArticle(rows[0].id)
        setSelected(full)
      }
    } catch (err) {
      toast(err.message || 'Journal impossible a charger', 'error')
    } finally {
      setLoading(false)
    }
  }, [query, scope, selected, toast])

  useEffect(() => { loadArticles() }, [loadArticles])

  useEffect(() => {
    let cancelled = false
    api.getHistoricalEvents()
      .then(rows => { if (!cancelled) setEvents(rows) })
      .catch(() => { if (!cancelled) setEvents([]) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const pendingArticleId = window.sessionStorage.getItem('pw-open-article')
    if (pendingArticleId) {
      window.sessionStorage.removeItem('pw-open-article')
      openArticle(pendingArticleId)
    }

    const handler = async (event) => {
      const id = event.detail?.articleId
      if (!id) return
      setMode('read')
      await openArticle(id)
    }
    window.addEventListener('philoweek:open-article', handler)
    return () => window.removeEventListener('philoweek:open-article', handler)
  }, [])

  const readerRef = useRef(null)
  const markedReadRef = useRef(new Set())

  // On ne compte pas l'auteur comme lecteur de son propre article.
  const trackable = mode === 'read' && !!selected && !selected.can_edit

  const applyReadSummary = useCallback((id, summary) => {
    const patch = current => (current?.id === id ? { ...current, ...summary } : current)
    setSelected(patch)
    setArticles(rows => rows.map(row => (row.id === id ? { ...row, ...summary } : row)))
  }, [])

  const markSelectedRead = useCallback(async () => {
    if (!selected) return
    const id = selected.id
    if (markedReadRef.current.has(id)) return
    markedReadRef.current.add(id)
    try {
      const summary = await api.markArticleRead(id)
      applyReadSummary(id, summary)
    } catch (_) {
      markedReadRef.current.delete(id)
    }
  }, [selected, applyReadSummary])

  useArticleReadTracker({
    articleId: selected?.id,
    enabled: trackable,
    alreadyRead: Boolean(selected?.read_by_me),
    scrollElRef: readerRef,
    onRead: markSelectedRead,
  })

  const openArticle = async (id) => {
    try {
      const full = await api.getArticle(id)
      setSelected(full)
      setMode('read')
    } catch (err) {
      toast(err.message || 'Article introuvable', 'error')
    }
  }

  const startCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, published_on: localDate() })
    setMode('write')
  }

  const startEdit = (article) => {
    setEditingId(article.id)
    setForm({
      title: article.title || '',
      excerpt: article.excerpt || '',
      content: article.content || '',
      status: article.status || 'draft',
      published_on: article.published_on || localDate(),
      tags: parseTags(article.tags).join(', '),
      event_id: article.event_id || '',
      cover_image_data: article.cover_image_data || '',
    })
    setMode('write')
  }

  const saveArticle = async (event) => {
    event.preventDefault()
    const payload = {
      ...form,
      tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
      event_id: form.event_id || null,
    }
    try {
      const saved = editingId
        ? await api.updateArticle(editingId, payload)
        : await api.createArticle(payload)
      toast(saved.status === 'published' ? 'Article publie' : 'Brouillon enregistre')
      await loadArticles()
      await openArticle(saved.id)
    } catch (err) {
      toast(err.message || 'Article impossible a enregistrer', 'error')
    }
  }

  const removeArticle = async (article) => {
    if (!window.confirm(`Supprimer "${article.title}" ?`)) return
    try {
      await api.deleteArticle(article.id)
      setSelected(null)
      await loadArticles()
      toast('Article supprime')
    } catch (err) {
      toast(err.message || 'Suppression impossible', 'error')
    }
  }

  const copyPublicLink = async (article) => {
    const url = `${window.location.origin}/articles/${encodeURIComponent(article.id)}`
    try {
      await navigator.clipboard.writeText(url)
      toast('Lien public copie')
    } catch (_) {
      window.prompt('Lien public de l article', url)
    }
  }

  const toggleLike = async (article) => {
    try {
      const summary = await api.toggleArticleReaction(article.id)
      const patch = current => current?.id === article.id ? { ...current, ...summary } : current
      setSelected(patch)
      setArticles(rows => rows.map(row => row.id === article.id ? { ...row, ...summary } : row))
    } catch (err) {
      toast(err.message || 'Reaction impossible', 'error')
    }
  }

  const sendComment = async (event) => {
    event.preventDefault()
    if (!selected || !comment.trim()) return
    try {
      const saved = await api.createArticleComment(selected.id, comment)
      setSelected(current => ({
        ...current,
        comments: [...(current.comments || []), saved],
        comment_count: Number(current.comment_count || 0) + 1,
      }))
      setComment('')
    } catch (err) {
      toast(err.message || 'Commentaire impossible', 'error')
    }
  }

  const removeComment = async (commentId) => {
    try {
      await api.deleteArticleComment(commentId)
      setSelected(current => ({
        ...current,
        comments: (current.comments || []).filter(item => item.id !== commentId),
        comment_count: Math.max(0, Number(current.comment_count || 0) - 1),
      }))
    } catch (err) {
      toast(err.message || 'Suppression impossible', 'error')
    }
  }

  const handleCover = async (file) => {
    if (!file) return
    try {
      const dataUrl = await fileToWebpDataUrl(file)
      setForm(current => ({ ...current, cover_image_data: dataUrl }))
    } catch (_) {
      toast('Image impossible a lire', 'error')
    }
  }

  const handleCoverUrl = () => {
    try {
      const url = promptImageUrl()
      if (url) setForm(current => ({ ...current, cover_image_data: url }))
    } catch (err) {
      toast(err.message || 'URL invalide', 'error')
    }
  }

  return (
    <div className="social-journal-page">
      <header className="social-journal-header">
        <div>
          <span>Journal public</span>
          <h1>Articles du reseau</h1>
        </div>
        <button type="button" className="btn-primary" onClick={startCreate}>
          <Icon name="edit" size={16} /> Ecrire
        </button>
      </header>

      <section className="social-journal-toolbar">
        <div className="social-tabs">
          {[
            ['feed', 'Fil'],
            ['mine', 'Mes articles'],
          ].map(([key, label]) => (
            <button key={key} type="button" className={scope === key ? 'active' : ''} onClick={() => setScope(key)}>
              {label}
            </button>
          ))}
        </div>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher un article, un auteur..." />
      </section>

      <div className="social-journal-layout">
        <aside className="article-feed">
          {loading && <p className="article-empty">Chargement...</p>}
          {!loading && articles.length === 0 && <p className="article-empty">Aucun article pour le moment.</p>}
          {articles.map(article => {
            const unread = !article.can_edit && !article.read_by_me
            return (
              <article
                key={article.id}
                className={`article-feed-card ${selected?.id === article.id ? 'active' : ''} ${unread ? 'unread' : ''}`}
                onClick={() => openArticle(article.id)}
              >
                <ArticleMedia src={article.cover_image_data} className="article-card-media" />
                <div>
                  <span className="article-card-line">
                    {unread && <i className="article-unread-dot" title="Non lu" />}
                    {formatDate(article.published_on || article.created_at)}
                    {!unread && !article.can_edit && (
                      <em className="article-read-flag"><Icon name="check" size={12} /> Lu</em>
                    )}
                  </span>
                  <h2>{article.title}</h2>
                  <p>{article.excerpt || stripMarkdown(article.content).slice(0, 150)}</p>
                  <small>
                    {article.author_username || 'Compte supprime'} · <Icon name="eye" size={12} /> {article.read_count || 0} · {article.like_count || 0} j'aime · {article.comment_count || 0} comm.
                  </small>
                  {article.status === 'draft' && <em>Brouillon</em>}
                </div>
              </article>
            )
          })}
        </aside>

        <main className="article-reader" ref={readerRef}>
          {mode === 'write' ? (
            <ArticleForm
              form={form}
              setForm={setForm}
              events={events}
              editingId={editingId}
              onSubmit={saveArticle}
              onCancel={() => setMode('read')}
              onCover={handleCover}
              onCoverUrl={handleCoverUrl}
            />
          ) : selected ? (
            <ArticleView
              article={selected}
              onEdit={() => startEdit(selected)}
              onDelete={() => removeArticle(selected)}
              onCopyLink={() => copyPublicLink(selected)}
              onLike={() => toggleLike(selected)}
              comment={comment}
              setComment={setComment}
              onComment={sendComment}
              onRemoveComment={removeComment}
            />
          ) : (
            <div className="article-placeholder">
              <Icon name="newspaper" size={40} />
              <h2>Choisis un article</h2>
              <p>Le journal public rassemble les textes publies par tous les comptes.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function ArticleView({ article, onEdit, onDelete, onCopyLink, onLike, comment, setComment, onComment, onRemoveComment }) {
  const html = useMemo(() => sanitizeHtml(marked(article.content || '')), [article.content])
  return (
    <article className="article-view">
      {article.cover_image_data && (
        <div className="article-cover-frame">
          <img className="article-cover" src={article.cover_image_data} alt="" />
        </div>
      )}
      <div className="article-view-head">
        <div>
          <span>{formatDate(article.published_on || article.created_at)}</span>
          <h2>{article.title}</h2>
          <p>publie par {article.author_username || 'Compte supprime'}</p>
        </div>
        {(article.status === 'published' || article.can_edit) && (
          <div className="article-owner-actions">
            {article.status === 'published' && <button type="button" className="btn-ghost" onClick={onCopyLink}>Copier le lien</button>}
            {article.can_edit && <button type="button" className="btn-ghost" onClick={onEdit}>Modifier</button>}
            {article.can_edit && <button type="button" className="btn-ghost danger" onClick={onDelete}>Supprimer</button>}
          </div>
        )}
      </div>
      {article.excerpt && <p className="article-lede">{article.excerpt}</p>}
      {article.event_title && (
        <div className="article-event-link">
          <Icon name="timeline" size={16} />
          Lie a la frise : <strong>{article.event_title}</strong>
          <span>{article.event_start_label}{article.event_end_label ? ` - ${article.event_end_label}` : ''}</span>
        </div>
      )}
      <TagLine tags={parseTags(article.tags)} />
      <div className="article-markdown markdown-preview" dangerouslySetInnerHTML={{ __html: html }} />
      <div className="article-social-row">
        <button type="button" className={article.liked_by_me ? 'active' : ''} onClick={onLike}>
          <Icon name="heart" size={16} /> {article.like_count || 0}
        </button>
        <span><Icon name="eye" size={16} /> {article.read_count || 0} lecteur{Number(article.read_count || 0) > 1 ? 's' : ''}</span>
        <span>{article.comment_count || 0} commentaire{Number(article.comment_count || 0) > 1 ? 's' : ''}</span>
      </div>
      <section className="article-comments">
        <h3>Conversation</h3>
        <form onSubmit={onComment}>
          <input value={comment} onChange={event => setComment(event.target.value)} placeholder="Ajouter un commentaire..." />
          <button type="submit" className="btn-primary" disabled={!comment.trim()}>Publier</button>
        </form>
        {(article.comments || []).map(item => (
          <article key={item.id} className="article-comment">
            <div>
              <strong>{item.author_username || 'Compte supprime'}</strong>
              <span>{formatDate(item.created_at)}</span>
            </div>
            <p>{item.body}</p>
            {item.can_edit && <button type="button" onClick={() => onRemoveComment(item.id)}>Supprimer</button>}
          </article>
        ))}
      </section>
    </article>
  )
}

function ArticleForm({ form, setForm, events, editingId, onSubmit, onCancel, onCover, onCoverUrl }) {
  const preview = useMemo(() => sanitizeHtml(marked(form.content || '')), [form.content])
  return (
    <form className="article-form" onSubmit={onSubmit}>
      <div className="article-form-head">
        <div>
          <span>{editingId ? 'Modifier' : 'Nouvel article'}</span>
          <h2>{editingId ? 'Reprendre le texte' : 'Publier dans le journal'}</h2>
        </div>
        <div>
          <button type="button" className="btn-ghost" onClick={onCancel}>Annuler</button>
          <button type="submit" className="btn-primary" disabled={!form.title.trim() || !form.content.trim()}>
            Enregistrer
          </button>
        </div>
      </div>
      <input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Titre de l'article" />
      <textarea value={form.excerpt} onChange={event => setForm({ ...form, excerpt: event.target.value })} placeholder="Accroche courte" />
      <div className="article-form-grid">
        <label>
          Statut
          <select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}>
            <option value="published">Publie</option>
            <option value="draft">Brouillon</option>
          </select>
        </label>
        <label>
          Date du journal
          <input type="date" value={form.published_on} onChange={event => setForm({ ...form, published_on: event.target.value })} />
        </label>
        <label>
          Carte de frise
          <select value={form.event_id} onChange={event => setForm({ ...form, event_id: event.target.value })}>
            <option value="">Aucune</option>
            {events.map(event => (
              <option key={event.id} value={event.id}>{event.start_label} · {event.title}</option>
            ))}
          </select>
        </label>
      </div>
      <input value={form.tags} onChange={event => setForm({ ...form, tags: event.target.value })} placeholder="Tags separes par virgules" />
      <div className="article-cover-actions">
        <label className="article-cover-picker">
          <Icon name="upload" size={16} />
          Image de couverture
          <input type="file" accept="image/*" hidden onChange={event => onCover(event.target.files?.[0])} />
        </label>
        <button type="button" className="btn-ghost" onClick={onCoverUrl}>
          <Icon name="link" size={16} /> Coller un lien
        </button>
      </div>
      {form.cover_image_data && (
        <div className="article-cover-preview">
          <img src={form.cover_image_data} alt="" />
          <button type="button" onClick={() => setForm({ ...form, cover_image_data: '' })}>Retirer</button>
        </div>
      )}
      <div className="article-compose">
        <textarea value={form.content} onChange={event => setForm({ ...form, content: event.target.value })} placeholder="Texte en Markdown" />
        <div className="article-preview markdown-preview" dangerouslySetInnerHTML={{ __html: preview || '<p class="preview-empty">Apercu</p>' }} />
      </div>
    </form>
  )
}

function TagLine({ tags }) {
  if (!tags.length) return null
  return <div className="article-tags">{tags.map(tag => <span key={tag}>#{tag}</span>)}</div>
}

// Média d'un article : cadre au format constant (object-fit: cover) quand une
// image existe, sinon un placeholder neutre pour garder des cartes alignées.
function ArticleMedia({ src, className = '' }) {
  return (
    <div className={`${className} ${src ? 'has-image' : 'no-image'}`}>
      {src
        ? <img src={src} alt="" loading="lazy" />
        : <Icon name="newspaper" size={22} />}
    </div>
  )
}

function parseTags(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'))
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch (_) {
    return []
  }
}

function stripMarkdown(value) {
  return String(value || '')
    .replace(/[#*_`>\[\]()!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function localDate() {
  const date = new Date()
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value)
  if (!Number.isFinite(date.getTime())) return String(value)
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

async function fileToWebpDataUrl(file) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  const max = 1400
  const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  canvas.width = Math.round(bitmap.width * ratio)
  canvas.height = Math.round(bitmap.height * ratio)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/webp', 0.82)
}
