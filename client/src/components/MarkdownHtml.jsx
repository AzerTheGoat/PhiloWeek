import { useEffect, useRef, useState } from 'react'
import WikiLinkPreview from './WikiLinkPreview'
import { normalizeWikiPart } from '../utils/wikiLinks'

const MAX_DIAGRAMS = 20
const MAX_SOURCE_LENGTH = 50_000
let mermaidQueue = Promise.resolve()

export default function MarkdownHtml({ html, className = 'markdown-preview', focusPart, focusRequest, onClick, onKeyDown }) {
  const rootRef = useRef(null)
  const [theme, setTheme] = useState(readTheme)

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    let cancelled = false
    const blocks = [...root.querySelectorAll('pre > code.language-mermaid')]

    if (!blocks.length) return undefined

    const diagrams = blocks.map((code, index) => {
      const source = code.textContent || ''
      const wrapper = document.createElement('div')
      wrapper.className = 'mermaid-shell'
      const diagram = document.createElement('div')
      diagram.className = 'mermaid'
      diagram.textContent = source
      wrapper.appendChild(diagram)
      code.parentElement.replaceWith(wrapper)
      if (index >= MAX_DIAGRAMS) {
        showMermaidError(wrapper, source, `Limite de ${MAX_DIAGRAMS} diagrammes par aperçu.`)
        return null
      }
      if (source.length > MAX_SOURCE_LENGTH) {
        showMermaidError(wrapper, source, 'Diagramme trop volumineux.')
        return null
      }
      return { wrapper, diagram, source }
    }).filter(Boolean)

    if (!diagrams.length) return undefined

    mermaidQueue = mermaidQueue.catch(() => {}).then(async () => {
      const { default: mermaid } = await import('mermaid')
      if (cancelled) return
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        theme: theme === 'light' ? 'default' : 'dark',
        maxTextSize: MAX_SOURCE_LENGTH,
        maxEdges: 500,
        fontFamily: 'inherit',
      })

      for (const item of diagrams) {
        if (cancelled || !item.diagram.isConnected) return
        try {
          await mermaid.run({ nodes: [item.diagram], suppressErrors: false })
          item.wrapper.classList.add('rendered')
        } catch (error) {
          showMermaidError(item.wrapper, item.source, formatMermaidError(error))
        }
      }
    }).catch(error => {
      if (cancelled) return
      diagrams.forEach(item => showMermaidError(item.wrapper, item.source, formatMermaidError(error)))
    })

    return () => { cancelled = true }
  }, [html, theme])

  useEffect(() => {
    const requestedPart = normalizeWikiPart(focusPart)
    const root = rootRef.current
    if (!requestedPart || !root) return undefined
    let target
    let cleanupTimer
    const frame = requestAnimationFrame(() => {
      target = [...root.querySelectorAll('h1, h2, h3, h4, h5, h6')]
        .find(heading => normalizeWikiPart(heading.textContent) === requestedPart)
      if (!target) return
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      target.classList.add('wiki-focus-target')
      cleanupTimer = setTimeout(() => target?.classList.remove('wiki-focus-target'), 2200)
    })
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(cleanupTimer)
      target?.classList.remove('wiki-focus-target')
    }
  }, [focusPart, focusRequest, html, theme])

  return (
    <>
      <div
        key={theme}
        ref={rootRef}
        className={className}
        onClick={onClick}
        onKeyDown={onKeyDown}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <WikiLinkPreview rootRef={rootRef} refreshKey={theme} />
    </>
  )
}

function showMermaidError(wrapper, source, message) {
  if (!wrapper?.isConnected || wrapper.classList.contains('mermaid-error')) return
  wrapper.className = 'mermaid-shell mermaid-error'
  const title = document.createElement('strong')
  title.textContent = 'Diagramme Mermaid invalide'
  const detail = document.createElement('span')
  detail.textContent = message
  const pre = document.createElement('pre')
  const code = document.createElement('code')
  code.textContent = source
  pre.appendChild(code)
  wrapper.replaceChildren(title, detail, pre)
}

function formatMermaidError(error) {
  const firstLine = String(error?.message || error || 'Erreur de syntaxe')
    .split('\n')
    .find(Boolean)
  return firstLine?.slice(0, 240) || 'Erreur de syntaxe'
}

function readTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}
