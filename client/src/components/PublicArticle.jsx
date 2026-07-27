import { useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import { sanitizeHtml } from '../utils/sanitizeHtml'
import { useArticleReadTracker, getAnonReaderId } from '../utils/useArticleReadTracker'
import * as api from '../api'
import Icon from './Icons'
import MarkdownHtml from './MarkdownHtml'

marked.setOptions({ breaks: true, gfm: true })

export default function PublicArticle({ articleId }) {
  const [article, setArticle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const pageRef = useRef(null)
  const markedRef = useRef(false)

  const markRead = () => {
    if (markedRef.current || !article) return
    markedRef.current = true
    api.markPublicArticleRead(article.id, getAnonReaderId())
      .then(summary => setArticle(cur => (cur ? { ...cur, ...summary } : cur)))
      .catch(() => { markedRef.current = false })
  }

  useArticleReadTracker({
    articleId: article?.id,
    enabled: Boolean(article),
    scrollElRef: pageRef,
    onRead: markRead,
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', localStorage.getItem('pw-theme') || 'light')
    const root = document.documentElement
    const syncViewport = () => {
      const visual = window.visualViewport
      const height = visual?.height || window.innerHeight
      root.style.setProperty('--app-height', `${height}px`)
    }

    syncViewport()
    window.addEventListener('resize', syncViewport)
    window.visualViewport?.addEventListener('resize', syncViewport)
    window.visualViewport?.addEventListener('scroll', syncViewport)
    return () => {
      window.removeEventListener('resize', syncViewport)
      window.visualViewport?.removeEventListener('resize', syncViewport)
      window.visualViewport?.removeEventListener('scroll', syncViewport)
    }
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
    <div className="public-article-page" ref={pageRef}>
      <main className="public-article-shell">
        <PublicArticleView article={article} />
      </main>
    </div>
  )
}

function PublicArticleView({ article }) {
  const html = useMemo(() => sanitizeHtml(marked(article.content || ''), { allowRemoteImages: true }), [article.content])
  const comments = article.comments || []

  return (
    <article className="article-view public-article-view">
      {article.cover_image_data && (
        <div className="article-cover-frame">
          <img className="article-cover" src={article.cover_image_data} alt="" referrerPolicy="no-referrer" />
        </div>
      )}
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
      <MarkdownHtml className="article-markdown markdown-preview" html={html} />
      <div className="article-social-row public-article-meta">
        <span><Icon name="eye" size={16} /> {article.read_count || 0} lecteur{Number(article.read_count || 0) > 1 ? 's' : ''}</span>
        <span>{article.like_count || 0} j'aime</span>
        <span>{article.comment_count || 0} commentaire{Number(article.comment_count || 0) > 1 ? 's' : ''}</span>
      </div>
      {comments.length > 0 && (
        <section className="article-comments">
          <h3>Conversation</h3>
          <PublicCommentThreads comments={comments} />
        </section>
      )}
    </article>
  )
}

function PublicCommentThreads({ comments }) {
  const byId = new Map((comments || []).map(comment => [comment.id, { ...comment, children: [] }]))
  const roots = []
  byId.forEach(comment => {
    const parent = comment.parent_id ? byId.get(comment.parent_id) : null
    if (parent) parent.children.push(comment)
    else roots.push(comment)
  })
  return roots.map(comment => <PublicCommentThread key={comment.id} comment={comment} />)
}

function PublicCommentThread({ comment }) {
  return (
    <article className={`article-comment ${comment.parent_id ? 'article-comment-reply' : ''}`}>
      <div className="article-comment-head">
        <strong>{comment.author_username || 'Compte supprime'}</strong>
        <span>{formatDate(comment.created_at)}</span>
      </div>
      <p>{comment.body}</p>
      {comment.children?.map(child => <PublicCommentThread key={child.id} comment={child} />)}
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
