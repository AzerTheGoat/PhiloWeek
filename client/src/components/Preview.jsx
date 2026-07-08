import { memo, useMemo, useCallback } from 'react'
import { marked } from 'marked'
import { useApp } from '../context/useApp'
import { sanitizeHtml } from '../utils/sanitizeHtml'

marked.setOptions({ breaks: true, gfm: true })

const Preview = memo(function Preview({ content }) {
  const { fileNames, openFile } = useApp()

  const nameToId = useMemo(() => {
    const m = {}
    fileNames.forEach(f => {
      m[f.name] = f.id
      m[f.name.replace(/\.md$/i, '')] = f.id
    })
    return m
  }, [fileNames])

  const html = useMemo(() => {
    if (!content) return '<p class="preview-empty">Commencez à écrire…</p>'

    // Remove frontmatter
    let body = content.replace(/^---[\s\S]*?---\n?/, '')

    // Replace [[links]] with HTML spans before Markdown parsing
    body = body.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => {
      const label = alias || target
      const id = nameToId[target] || nameToId[target + '.md']
      if (id) {
        return `<a class="wiki-link resolved" data-file-id="${id}">${label}</a>`
      }
      return `<a class="wiki-link unresolved">${label}</a>`
    })

    return sanitizeHtml(marked(body))
  }, [content, nameToId])

  const handleClick = useCallback((e) => {
    const link = e.target.closest('.wiki-link.resolved')
    if (link) {
      const id = link.dataset.fileId
      if (id) openFile(id)
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
