import { memo, useMemo, useCallback } from 'react'
import { marked } from 'marked'
import { useApp } from '../context/useApp'
import { sanitizeHtml } from '../utils/sanitizeHtml'
import { buildFileNameIndex, resolveWikiTarget } from '../utils/wikiLinks'

marked.setOptions({ breaks: true, gfm: true })

const Preview = memo(function Preview({ content }) {
  const { fileNames, openFile } = useApp()

  const nameToId = useMemo(() => buildFileNameIndex(fileNames), [fileNames])

  const html = useMemo(() => {
    if (!content) return '<p class="preview-empty">Commencez à écrire…</p>'

    // Remove frontmatter
    let body = content.replace(/^---[\s\S]*?---\n?/, '')

    // Replace [[links]] with HTML spans before Markdown parsing
    body = body.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, rawTarget, rawPart) => {
      const target = rawTarget.trim()
      const part = rawPart?.trim() || ''
      const label = escapeHtml(part || target)
      const id = resolveWikiTarget(nameToId, target)
      if (id) {
        const partAttribute = part ? ` data-file-part="${escapeHtmlAttribute(part)}"` : ''
        return `<a class="wiki-link resolved" data-file-id="${escapeHtmlAttribute(id)}"${partAttribute}>${label}</a>`
      }
      return `<a class="wiki-link unresolved">${label}</a>`
    })

    return sanitizeHtml(marked(body))
  }, [content, nameToId])

  const handleClick = useCallback((e) => {
    const link = e.target.closest('.wiki-link.resolved')
    if (link) {
      const id = link.dataset.fileId
      if (id) openFile(id, { focusPart: link.dataset.filePart || undefined })
    }
  }, [openFile])

  return (
    <div
      className="markdown-preview"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})

export default Preview

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#096;')
}
