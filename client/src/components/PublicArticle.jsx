import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import { sanitizeHtml } from '../utils/sanitizeHtml'
import * as api from '../api'
import Icon from './Icons'

marked.setOptions({ breaks: true, gfm: true })

export default function PublicArticle({ articleId }) {
  const [article, setArticle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', localStorage.getItem('pw-theme') || 'dark')
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api.getPublicArticle(articleId)
      .then(row => {
        if (!cancelled) setArticle(row)
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Article introuvable.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [articleId])

  if (loading) {
    return (
      <div className="public-article-page">
        <div className="article-placeholder public-article-status">
          <Icon name="newspaper" size={36} />
          <h2>Chargement...</h2>
        </div>
      </div>
    )
  }

  if (error || !article) {
    return (
      <div className="public-article-page">
        <div className="article-placeholder public-article-status">
          <Icon name="newspaper" size={36} />
          <h2>Article indisponible</h2>
          <p>{error || 'Ce lien ne pointe pas vers un article publie.'}</p>
          <a className="btn-ghost" href="/">Retour a Opuscule</a>
        </div>
      </div>
    )
  }

  return (
    <div className="public-article-page">
      <main className="public-article-shell">
        <PublicArticleView article={article} />
      </main>
    </div>
  )
}

function PublicArticleView({ article }) {
  const html = useMemo(() => sanitizeHtml(marked(article.content || '')), [article.content])
  const comments = article.comments || []

  return (
    <article className="article-view public-article-view">
      {article.cover_image_data && <img className="article-cover" src={article.cover_image_data} alt="" />}
      <div className="article-view-head">
        <div>
          <span>{formatDate(article.published_on || article.created_at)}</span>
          <h2>{article.title}</h2>
          <p>publie par {article.author_username || 'Compte supprime'}</p>
        </div>
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
      <div className="article-social-row public-article-meta">
        <span>{article.like_count || 0} j'aime</span>
        <span>{article.comment_count || 0} commentaire{Number(article.comment_count || 0) > 1 ? 's' : ''}</span>
      </div>
      {comments.length > 0 && (
        <section className="article-comments">
          <h3>Conversation</h3>
          {comments.map(item => (
            <article key={item.id} className="article-comment">
              <div>
                <strong>{item.author_username || 'Compte supprime'}</strong>
                <span>{formatDate(item.created_at)}</span>
              </div>
              <p>{item.body}</p>
            </article>
          ))}
        </section>
      )}
    </article>
  )
}

function TagLine({ tags }) {
  if (!tags.length) return null
  return <div className="article-tags">{tags.map(tag => <span key={tag}>#{tag}</span>)}</div>
}

function parseTags(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'))
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch (_) {
    return []
  }
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value)
  if (!Number.isFinite(date.getTime())) return String(value)
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}
