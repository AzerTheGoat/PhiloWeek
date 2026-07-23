import { memo, useMemo, useCallback } from 'react'
import { marked } from 'marked'
import { useApp } from '../context/useApp'
import { sanitizeHtml } from '../utils/sanitizeHtml'
import { buildFileNameIndex, parseWikiLinkExpression, resolveWikiTarget } from '../utils/wikiLinks'
import MarkdownHtml from './MarkdownHtml'

marked.setOptions({ breaks: true, gfm: true })

const Preview = memo(function Preview({ content }) {
  const { currentFile, fileNames, openFile } = useApp()

  const nameToId = useMemo(() => buildFileNameIndex(fileNames), [fileNames])

  const html = useMemo(() => {
    if (!content) return '<p class="preview-empty">Commencez à écrire…</p>'

    // Remove frontmatter
    let body = content.replace(/^---[\s\S]*?---\n?/, '')

    // Replace [[links]] with HTML spans before Markdown parsing
    body = body.replace(/\[\[([^\]]+)\]\]/g, (_, expression) => {
      const parsed = parseWikiLinkExpression(expression)
      if (!parsed) return escapeHtml(`[[${expression}]]`)
      const { target, part, label } = parsed
      const safeLabel = escapeHtml(label)
      const id = target ? resolveWikiTarget(nameToId, target) : currentFile?.id
      if (id) {
        const partAttribute = part ? ` data-file-part="${escapeHtmlAttribute(part)}"` : ''
        const targetLabel = target || currentFile?.name || 'Cette note'
        return `<a class="wiki-link resolved" role="link" tabindex="0" data-file-id="${escapeHtmlAttribute(id)}" data-file-target="${escapeHtmlAttribute(targetLabel)}"${partAttribute}>${safeLabel}</a>`
      }
      return `<a class="wiki-link unresolved">${safeLabel}</a>`
    })

    return sanitizeHtml(marked(body))
  }, [content, currentFile?.id, currentFile?.name, nameToId])

  const handleClick = useCallback((e) => {
    const link = e.target.closest('.wiki-link.resolved')
    if (link) {
      const id = link.dataset.fileId
      if (id) openFile(id, { focusPart: link.dataset.filePart || undefined })
    }
  }, [openFile])

  const handleKeyDown = useCallback((e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const link = e.target.closest('.wiki-link.resolved')
    if (!link) return
    e.preventDefault()
    const id = link.dataset.fileId
    if (id) openFile(id, { focusPart: link.dataset.filePart || undefined })
  }, [openFile])

  return (
    <MarkdownHtml
      html={html}
      className="markdown-preview"
      focusPart={currentFile?.initial_focus_part}
      focusRequest={currentFile}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
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
