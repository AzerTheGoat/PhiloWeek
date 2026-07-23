import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getFile } from '../api'
import { normalizeWikiPart, parseWikiLinkExpression } from '../utils/wikiLinks'

const OPEN_DELAY = 320
const CACHE_TTL = 30_000
const PREVIEW_MAX_LENGTH = 420
const filePreviewCache = new Map()

export default function WikiLinkPreview({ rootRef, refreshKey }) {
  const [card, setCard] = useState(null)
  const cardRef = useRef(null)
  const activeLinkRef = useRef(null)
  const pointerRef = useRef({ x: 0, y: 0 })
  const requestRef = useRef(0)
  const openTimerRef = useRef(null)
  const moveFrameRef = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    const clearOpenTimer = () => {
      clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }

    const close = () => {
      clearOpenTimer()
      activeLinkRef.current = null
      requestRef.current += 1
      setCard(null)
    }

    const loadCard = async (link, fileId) => {
      if (activeLinkRef.current !== link) return
      const requestId = ++requestRef.current
      const part = link.dataset.filePart || ''
      const target = link.dataset.fileTarget || link.textContent?.trim() || 'Fichier lié'
      setCard({
        status: 'loading',
        target,
        x: pointerRef.current.x,
        y: pointerRef.current.y,
      })
      try {
        const file = await loadFilePreview(fileId)
        if (requestId !== requestRef.current || activeLinkRef.current !== link) return
        setCard({
          status: 'ready',
          preview: buildWikiLinkPreview(file, part),
          x: pointerRef.current.x,
          y: pointerRef.current.y,
        })
      } catch (error) {
        if (requestId !== requestRef.current || activeLinkRef.current !== link) return
        setCard({
          status: 'error',
          target,
          message: error?.message || 'Aperçu indisponible',
          x: pointerRef.current.x,
          y: pointerRef.current.y,
        })
      }
    }

    const open = (link, { immediate = false } = {}) => {
      const fileId = link?.dataset.fileId
      if (!fileId) return
      clearOpenTimer()
      activeLinkRef.current = link
      const show = () => loadCard(link, fileId)
      if (immediate) show()
      else openTimerRef.current = setTimeout(show, OPEN_DELAY)
    }

    const findLink = target => target instanceof Element
      ? target.closest('.wiki-link.resolved[data-file-id]')
      : null

    const handlePointerOver = event => {
      if (event.pointerType === 'touch') return
      const link = findLink(event.target)
      if (!link || !root.contains(link) || link.contains(event.relatedTarget)) return
      pointerRef.current = { x: event.clientX, y: event.clientY }
      open(link)
    }

    const handlePointerMove = event => {
      if (!activeLinkRef.current || event.pointerType === 'touch') return
      pointerRef.current = { x: event.clientX, y: event.clientY }
      if (moveFrameRef.current) return
      moveFrameRef.current = requestAnimationFrame(() => {
        moveFrameRef.current = null
        setCard(current => current ? { ...current, ...pointerRef.current } : current)
      })
    }

    const handlePointerOut = event => {
      const link = findLink(event.target)
      if (!link || link.contains(event.relatedTarget)) return
      close()
    }

    const handleFocusIn = event => {
      const link = findLink(event.target)
      if (!link || !root.contains(link)) return
      const rect = link.getBoundingClientRect()
      pointerRef.current = { x: rect.left + rect.width / 2, y: rect.bottom }
      open(link, { immediate: true })
    }

    const handleFocusOut = event => {
      const link = findLink(event.target)
      if (link) close()
    }

    root.addEventListener('pointerover', handlePointerOver)
    root.addEventListener('pointermove', handlePointerMove)
    root.addEventListener('pointerout', handlePointerOut)
    root.addEventListener('focusin', handleFocusIn)
    root.addEventListener('focusout', handleFocusOut)
    return () => {
      clearOpenTimer()
      cancelAnimationFrame(moveFrameRef.current)
      requestRef.current += 1
      root.removeEventListener('pointerover', handlePointerOver)
      root.removeEventListener('pointermove', handlePointerMove)
      root.removeEventListener('pointerout', handlePointerOut)
      root.removeEventListener('focusin', handleFocusIn)
      root.removeEventListener('focusout', handleFocusOut)
    }
  }, [refreshKey, rootRef])

  useLayoutEffect(() => {
    const element = cardRef.current
    if (!element || !card) return
    positionCard(element, card.x, card.y)
  }, [card])

  if (!card || typeof document === 'undefined') return null

  return createPortal(
    <aside
      ref={cardRef}
      className={`wiki-link-preview is-${card.status}`}
      role="tooltip"
      aria-live="polite"
    >
      {card.status === 'loading' && (
        <>
          <span className="wiki-link-preview-kind">Lien wiki</span>
          <strong>{card.target}</strong>
          <p>Chargement de l’aperçu…</p>
        </>
      )}
      {card.status === 'error' && (
        <>
          <span className="wiki-link-preview-kind">Lien wiki</span>
          <strong>{card.target}</strong>
          <p>{card.message}</p>
        </>
      )}
      {card.status === 'ready' && (
        <>
          <span className="wiki-link-preview-kind">{card.preview.kind}</span>
          <strong>{card.preview.title}</strong>
          {card.preview.body && <p>{card.preview.body}</p>}
          {card.preview.detail && <small>{card.preview.detail}</small>}
          <span className="wiki-link-preview-action">Cliquer pour ouvrir</span>
        </>
      )}
    </aside>,
    document.body
  )
}

async function loadFilePreview(fileId) {
  const now = Date.now()
  const cached = filePreviewCache.get(fileId)
  if (cached && now - cached.createdAt < CACHE_TTL) return cached.promise

  const promise = getFile(fileId).catch(error => {
    filePreviewCache.delete(fileId)
    throw error
  })
  filePreviewCache.set(fileId, { createdAt: now, promise })
  return promise
}

export function buildWikiLinkPreview(file, rawPart = '') {
  const part = normalizeWikiPart(rawPart)
  const name = stripExtension(file?.name || 'Fichier lié')
  const content = String(file?.content || '')

  if (/\.json$/i.test(file?.name || '')) {
    try {
      const data = JSON.parse(content || '{}')
      if (data?.philoweek_type === 'definitions' || Array.isArray(data?.definitions)) {
        const definitions = Array.isArray(data.definitions) ? data.definitions : []
        const match = part
          ? definitions.find(item => normalizeWikiPart(item?.term) === part || normalizeWikiPart(item?.id) === part)
          : null
        if (match) {
          return {
            kind: `Définition · ${data.title || name}`,
            title: match.term || rawPart || name,
            body: compactText(match.definition) || 'Définition non renseignée.',
            detail: compactText(match.example) ? `Exemple / nuance · ${compactText(match.example)}` : '',
          }
        }
        return {
          kind: 'Fiche de définitions',
          title: data.title || name,
          body: compactText(data.description) || `${definitions.length} définition${definitions.length > 1 ? 's' : ''}.`,
          detail: part ? `La définition « ${rawPart} » n’a pas été trouvée.` : '',
        }
      }

      if (data?.philoweek_type === 'questionnaire' || Array.isArray(data?.questions)) {
        return {
          kind: 'Questionnaire',
          title: data.title || name,
          body: compactText(data.description) || `${data.questions?.length || 0} question${data.questions?.length > 1 ? 's' : ''}.`,
          detail: '',
        }
      }

      if (data?.philoweek_type === 'actor_network') {
        return {
          kind: 'Réseau d’acteurs',
          title: data.title || name,
          body: compactText(data.description) || `${data.nodes?.length || 0} acteur${data.nodes?.length > 1 ? 's' : ''} dans le réseau.`,
          detail: '',
        }
      }
    } catch (_) {
      // Un JSON libre reste prévisualisé comme du texte ci-dessous.
    }
  }

  if (/\.xlsx$/i.test(file?.name || '')) {
    try {
      const workbook = JSON.parse(content || '{}')
      const sheetNames = (workbook.sheets || []).map(sheet => sheet.name).filter(Boolean)
      return {
        kind: 'Tableur Excel',
        title: workbook.title || name,
        body: sheetNames.length ? `Feuilles : ${sheetNames.slice(0, 6).join(', ')}${sheetNames.length > 6 ? '…' : ''}` : 'Classeur sans feuille.',
        detail: '',
      }
    } catch (_) {
      return { kind: 'Tableur Excel', title: name, body: 'Aperçu du classeur.', detail: '' }
    }
  }

  return buildMarkdownPreview(name, content, rawPart, part)
}

function buildMarkdownPreview(name, content, rawPart, normalizedPart) {
  const body = content
    .replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '')
    .replace(/```philoweek-graph[\s\S]*?```/gi, '')
  const lines = body.split(/\r?\n/)
  let title = name
  let excerptSource = body
  let kind = 'Note liée'
  let detail = ''

  if (normalizedPart) {
    const headingIndex = lines.findIndex(line => {
      const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
      return heading && normalizeWikiPart(stripMarkdown(heading[2])) === normalizedPart
    })
    if (headingIndex >= 0) {
      const heading = lines[headingIndex].match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
      const level = heading[1].length
      let end = lines.length
      for (let index = headingIndex + 1; index < lines.length; index += 1) {
        const next = lines[index].match(/^(#{1,6})\s+/)
        if (next && next[1].length <= level) {
          end = index
          break
        }
      }
      title = stripMarkdown(heading[2])
      excerptSource = lines.slice(headingIndex + 1, end).join('\n')
      kind = `Section · ${name}`
    } else {
      detail = `La partie « ${rawPart} » n’a pas été trouvée.`
    }
  } else {
    const firstHeading = lines.find(line => /^#{1,6}\s+/.test(line))
    if (firstHeading) title = stripMarkdown(firstHeading.replace(/^#{1,6}\s+/, ''))
  }

  return {
    kind,
    title: title || name,
    body: compactText(excerptSource) || 'Cette note ne contient pas encore de texte.',
    detail,
  }
}

function compactText(value) {
  const text = stripMarkdown(String(value || ''))
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= PREVIEW_MAX_LENGTH) return text
  return `${text.slice(0, PREVIEW_MAX_LENGTH).replace(/\s+\S*$/, '')}…`
}

function stripMarkdown(value) {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, (_, expression) => parseWikiLinkExpression(expression)?.label || expression)
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/[*_~`#]/g, '')
}

function stripExtension(value) {
  return String(value || '').replace(/\.(md|json|xlsx)$/i, '')
}

function positionCard(element, x, y) {
  const margin = 12
  const gap = 18
  const rect = element.getBoundingClientRect()
  const left = Math.max(margin, Math.min(x + gap, window.innerWidth - rect.width - margin))
  const below = y + gap
  const top = below + rect.height <= window.innerHeight - margin
    ? below
    : Math.max(margin, y - rect.height - gap)
  element.style.left = `${left}px`
  element.style.top = `${top}px`
}
