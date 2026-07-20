import { useState, useEffect, useCallback } from 'react'
import { format, addDays, subDays, parseISO, isToday } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useApp } from '../context/useApp'
import * as api from '../api'

export default function Journal() {
  const { tree, openFile, loadTree, toast, dispatch } = useApp()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [entries, setEntries] = useState([]) // {date, id, name}

  // Load journal entries from file tree
  useEffect(() => {
    const flat = []
    function walk(nodes) {
      nodes.forEach(n => {
        if (n.name === 'Journal' && n.type === 'folder') {
          ;(n.children || []).forEach(child => {
            if (child.type === 'file' && /^\d{4}-\d{2}-\d{2}\.md$/.test(child.name)) {
              flat.push({ date: child.name.replace('.md', ''), id: child.id, name: child.name })
            }
          })
        }
        if (n.children) walk(n.children)
      })
    }
    walk(tree)
    flat.sort((a, b) => b.date.localeCompare(a.date))
    setEntries(flat)
  }, [tree])

  const openDay = useCallback(async (date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const entry = entries.find(e => e.date === dateStr)

    if (entry) {
      await openFile(entry.id)
      dispatch({ type: 'SET_VIEW', payload: 'editor' })
    } else {
      // Create it
      const flat = []
      function walk(nodes) {
        nodes.forEach(n => {
          flat.push(n)
          if (n.children) walk(n.children)
        })
      }
      walk(tree)
      let journalFolder = flat.find(f => f.name === 'Journal' && !f.parent_id)

      try {
        if (!journalFolder) {
          journalFolder = await api.createFile({ parent_id: null, name: 'Journal', type: 'folder' })
        }
        const label = format(date, "EEEE d MMMM yyyy", { locale: fr })
        const header = `---\ntitle: Journal du ${label}\ntags: [journal]\ncreated: ${date.toISOString()}\n---\n\n`
        const newFile = await api.createFile({
          parent_id: journalFolder.id,
          name: `${dateStr}.md`,
          type: 'file',
          content: header
        })
        await loadTree()
        await openFile(newFile.id, { editorMode: 'split' })
        dispatch({ type: 'SET_VIEW', payload: 'editor' })
      } catch (err) {
        toast(err.message, 'error')
      }
    }
  }, [entries, tree, openFile, loadTree, toast, dispatch])

  const hasEntry = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return entries.some(e => e.date === dateStr)
  }

  // Build a mini calendar for the current month
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDow = (firstDay.getDay() + 6) % 7 // Monday=0
  const days = []
  for (let i = 0; i < startDow; i++) days.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d))

  return (
    <div className="journal-view">
      <div className="journal-header">
        <h2>Journal</h2>
        <button className="btn-primary" onClick={() => openDay(new Date())}>
          Aujourd'hui
        </button>
      </div>

      {/* Mini calendar */}
      <div className="journal-calendar">
        <div className="cal-nav">
          <button className="icon-btn" onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>‹</button>
          <span className="cal-month">{format(currentDate, 'MMMM yyyy', { locale: fr })}</span>
          <button className="icon-btn" onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>›</button>
        </div>

        <div className="cal-grid">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
            <div key={i} className="cal-dow">{d}</div>
          ))}
          {days.map((day, i) => (
            <div
              key={i}
              className={`cal-day
                ${!day ? 'cal-empty' : ''}
                ${day && hasEntry(day) ? 'has-entry' : ''}
                ${day && isToday(day) ? 'today' : ''}
              `}
              onClick={() => day && openDay(day)}
            >
              {day?.getDate()}
            </div>
          ))}
        </div>
      </div>

      {/* Recent entries */}
      <div className="journal-entries">
        <h3>Entrées récentes</h3>
        {entries.length === 0 && (
          <div className="journal-empty">Aucune entrée. Crée ton premier journal !</div>
        )}
        {entries.slice(0, 10).map(e => (
          <div
            key={e.id}
            className={`journal-entry-row ${isToday(parseISO(e.date)) ? 'today' : ''}`}
            onClick={() => openFile(e.id).then(() => dispatch({ type: 'SET_VIEW', payload: 'editor' }))}
          >
            <span className="je-date">
              {format(parseISO(e.date), "EEE d MMM", { locale: fr })}
            </span>
            <span className="je-indicator">{isToday(parseISO(e.date)) ? '● aujourd\'hui' : ''}</span>
            <span className="je-arrow">→</span>
          </div>
        ))}
      </div>
    </div>
  )
}
