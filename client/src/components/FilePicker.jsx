import { useState, useCallback, useEffect } from 'react'
import { useApp } from '../context/useApp'
import * as api from '../api'

const COPY_PROMPTS = {
  none: {
    label: 'Sans prompt',
    text: '',
  },
  questionnaire: {
    label: 'Questionnaire JSON',
    text: `Tu vas creer un questionnaire PhiloWeek a partir des notes ci-dessous.

Retourne uniquement un JSON valide, sans Markdown autour, au format :
{
  "philoweek_type": "questionnaire",
  "version": 1,
  "id": "slug-stable",
  "title": "Titre",
  "description": "Objectif du questionnaire",
  "tags": [],
  "questions": [
    {
      "id": "q1",
      "type": "open",
      "prompt": "Question claire",
      "answer": "Reponse attendue",
      "explanation": "Pourquoi cette reponse est juste",
      "tags": []
    },
    {
      "id": "q2",
      "type": "mcq",
      "prompt": "Question a choix multiple",
      "choices": ["Option A", "Option B", "Option C"],
      "answer": "Option A",
      "explanation": "Pourquoi cette option est juste",
      "tags": []
    },
    {
      "id": "q3",
      "type": "true_false",
      "prompt": "Affirmation a juger",
      "answer": "Vrai",
      "explanation": "Pourquoi c'est vrai ou faux",
      "tags": []
    }
  ]
}

Fais un melange de questions open, mcq et true_false, utiles pour reviser, avec des reponses precises et des explications courtes.`,
  },
  socratique: {
    label: 'Analyse socratique',
    text: 'Analyse les notes ci-dessous avec une methode socratique : clarifie les theses, questionne les presupposes, fais apparaitre les tensions, puis propose des questions qui obligent a preciser la pensee.',
  },
  critique: {
    label: 'Critique',
    text: 'Analyse les notes ci-dessous de maniere critique : repere les faiblesses, objections possibles, concepts flous, sauts logiques et contre-exemples. Termine par une liste de revisions prioritaires.',
  },
  explorateur: {
    label: 'Explorateur',
    text: 'Explore les notes ci-dessous : propose des pistes nouvelles, rapprochements, analogies, auteurs ou problemes connexes. Priorise les idees qui peuvent ouvrir un vrai travail.',
  },
  synthese: {
    label: 'Synthese',
    text: 'Fais une synthese structuree des notes ci-dessous : theses, arguments, exemples, objections, concepts cles, puis une conclusion concise.',
  },
}

const PERIOD_RECAP_PROMPT = `Tu vas faire un recapitulatif de periode a partir des notes PhiloWeek ci-dessous.

Objectif :
- synthetiser les idees importantes de la periode ;
- reperer les fils conducteurs, questions recurrentes, tensions et evolutions ;
- distinguer les faits observes dans les notes des hypotheses ;
- proposer une section "A revoir / a approfondir" ;
- rester prudent : pas de diagnostic, pas de conclusion psychologique certaine.

Format attendu :
## Resume de la periode
## Idees fortes
## Questions ouvertes
## Liens entre les notes
## A revoir la semaine prochaine`

// ——— Helpers ———

function getAllFileIds(node) {
  const ids = []
  if (node.type === 'file') ids.push(node.id)
  ;(node.children || []).forEach(c => ids.push(...getAllFileIds(c)))
  return ids
}

function getFilesInTreeOrder(tree, selectedIds) {
  const files = []
  function walk(nodes) {
    nodes.forEach(n => {
      if (n.type === 'file' && selectedIds.has(n.id)) files.push(n)
      if (n.children) walk(n.children)
    })
  }
  walk(tree)
  return files
}

function buildFullPath(tree, fileId) {
  function walk(nodes, prefix) {
    for (const n of nodes) {
      const p = prefix ? prefix + '/' + n.name : n.name
      if (n.id === fileId) return p
      if (n.children) {
        const found = walk(n.children, p)
        if (found) return found
      }
    }
    return null
  }
  return walk(tree, '') || ''
}

async function buildConcatenation(tree, selectedIds, promptKey = 'none') {
  const orderedFiles = getFilesInTreeOrder(tree, selectedIds)
  const parts = []
  for (const f of orderedFiles) {
    const data = await api.getFile(f.id)
    const raw = data.content || ''
    const body = raw.replace(/^---[\s\S]*?---\n?/, '').trim()
    const title = f.name.replace(/\.md$/i, '')
    const path = buildFullPath(tree, f.id)
    const modDate = new Date(f.updated_at || f.created_at).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short', year: 'numeric'
    })
    parts.push(`# ${title}\n> Chemin : /${path} — Modifié le ${modDate}\n\n${body}`)
  }
  const notes = parts.join('\n\n---\n\n')
  const prompt = COPY_PROMPTS[promptKey]?.text || ''
  return { text: prompt ? `${prompt}\n\n--- NOTES ---\n\n${notes}` : notes, count: orderedFiles.length }
}

async function buildPeriodConcatenation(tree, startValue, endValue) {
  const start = startOfDay(parseDateInput(startValue))
  const end = endOfDay(parseDateInput(endValue))
  if (!start || !end || start > end) throw new Error('Periode invalide')

  const allIds = new Set()
  function collect(nodes) {
    nodes.forEach(node => {
      if (node.type === 'file') {
        const date = parseFileDate(node)
        if (date && date >= start && date <= end) allIds.add(node.id)
      }
      if (node.children) collect(node.children)
    })
  }
  collect(tree)

  const { text, count } = await buildConcatenation(tree, allIds, 'none')
  const periodLabel = `${formatDateFr(start)} -> ${formatDateFr(end)}`
  return {
    count,
    text: `${PERIOD_RECAP_PROMPT}\n\nPeriode : ${periodLabel}\nNombre de notes : ${count}\n\n--- NOTES DE LA PERIODE ---\n\n${text}`,
  }
}

function getLastWeekRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - 6)
  return { start: toDateInput(start), end: toDateInput(end) }
}

function parseFileDate(file) {
  const raw = file.updated_at || file.created_at
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseDateInput(value) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfDay(date) {
  if (!date) return null
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date) {
  if (!date) return null
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function toDateInput(date) {
  const local = new Date(date)
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset())
  return local.toISOString().slice(0, 10)
}

function formatDateFr(date) {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ——— SelectableTree ———

function SelectableTree({ nodes, depth = 0, selectedIds, onToggle }) {
  return (
    <ul className={`file-tree ${depth === 0 ? 'root' : ''}`}>
      {nodes.map(n => (
        <SelectableNode key={n.id} node={n} depth={depth} selectedIds={selectedIds} onToggle={onToggle} />
      ))}
    </ul>
  )
}

function SelectableNode({ node, depth, selectedIds, onToggle }) {
  const [expanded, setExpanded] = useState(depth === 0)
  const isFolder = node.type === 'folder' || node.type === 'locked_folder'
  const isLocked = node.type === 'locked_folder'
  const children = node.children || []

  const descendantIds = isFolder ? getAllFileIds(node) : [node.id]
  const checkedCount = descendantIds.filter(id => selectedIds.has(id)).length
  const isChecked = descendantIds.length > 0 && checkedCount === descendantIds.length
  const isIndeterminate = checkedCount > 0 && checkedCount < descendantIds.length

  const handleToggle = (e) => {
    e.stopPropagation()
    if (isLocked) return
    const allSelected = isChecked
    descendantIds.forEach(id => onToggle(id, !allSelected))
  }

  const icon = isLocked ? '🔒' : isFolder ? (expanded ? '▾' : '▸') : '📄'

  return (
    <li className="file-node">
      <div
        className={`file-row picker-row ${isFolder ? 'is-folder' : ''} ${isLocked ? 'is-locked' : ''}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={isFolder ? () => setExpanded(e => !e) : handleToggle}
      >
        <input
          type="checkbox"
          className="picker-checkbox"
          checked={isChecked}
          ref={el => { if (el) el.indeterminate = isIndeterminate }}
          onChange={handleToggle}
          disabled={isLocked}
          onClick={e => e.stopPropagation()}
        />
        <span className="file-icon">{icon}</span>
        <span className="file-name">{node.name.replace(/\.md$/i, '')}</span>
        {isFolder && !isLocked && (
          <button
            className="picker-select-all"
            onClick={handleToggle}
            title={isChecked ? 'Tout désélectionner' : 'Tout sélectionner'}
          >
            {isChecked ? '−' : '+'}
          </button>
        )}
      </div>
      {isFolder && expanded && children.length > 0 && (
        <SelectableTree nodes={children} depth={depth + 1} selectedIds={selectedIds} onToggle={onToggle} />
      )}
    </li>
  )
}

// ——— FilePicker (slide-in panel) ———

export default function FilePicker() {
  const { tree, dispatch, toast } = useApp()
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [promptKey, setPromptKey] = useState('none')
  const [periodStart, setPeriodStart] = useState(() => getLastWeekRange().start)
  const [periodEnd, setPeriodEnd] = useState(() => getLastWeekRange().end)

  // Reset on open
  useEffect(() => { setSelectedIds(new Set()) }, [])

  const handleToggle = useCallback((id, force) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (force === true) next.add(id)
      else if (force === false) next.delete(id)
      else if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const fileCount = getFilesInTreeOrder(tree, selectedIds).length

  const handleCopy = async () => {
    if (fileCount === 0) { toast('Sélectionne au moins un fichier', 'error'); return }
    setLoading(true)
    try {
      const { text, count } = await buildConcatenation(tree, selectedIds, promptKey)
      await navigator.clipboard.writeText(text)
      toast(`${count} note(s) copiée(s) dans le presse-papier`)
      dispatch({ type: 'TOGGLE_FILE_PICKER' })
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async () => {
    if (fileCount === 0) { toast('Sélectionne au moins un fichier', 'error'); return }
    setLoading(true)
    try {
      const { text, count } = await buildConcatenation(tree, selectedIds, promptKey)
      const blob = new Blob([text], { type: 'text/markdown; charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `selection-${new Date().toISOString().slice(0, 10)}.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast(`${count} note(s) téléchargée(s)`)
      dispatch({ type: 'TOGGLE_FILE_PICKER' })
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyPeriod = async (range = null) => {
    const nextRange = range || { start: periodStart, end: periodEnd }
    setLoading(true)
    try {
      const { text, count } = await buildPeriodConcatenation(tree, nextRange.start, nextRange.end)
      if (count === 0) {
        toast('Aucune note modifiee sur cette periode', 'error')
        return
      }
      await navigator.clipboard.writeText(text)
      toast(`${count} note(s) de la periode copiee(s)`)
      dispatch({ type: 'TOGGLE_FILE_PICKER' })
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLastWeek = () => {
    const range = getLastWeekRange()
    setPeriodStart(range.start)
    setPeriodEnd(range.end)
    handleCopyPeriod(range)
  }

  const selectAll = () => {
    const ids = new Set()
    getFilesInTreeOrder(tree, new Set(tree.flatMap(n => getAllFileIds(n)))).forEach(f => ids.add(f.id))
    // More direct: collect all file ids
    function collectAll(nodes) { nodes.forEach(n => { if (n.type === 'file') ids.add(n.id); if (n.children) collectAll(n.children) }) }
    collectAll(tree)
    setSelectedIds(ids)
  }

  return (
    <>
      {/* Backdrop */}
      <div className="picker-backdrop" onClick={() => dispatch({ type: 'TOGGLE_FILE_PICKER' })} />

      {/* Slide-in panel */}
      <div className="picker-panel">
        <div className="picker-header">
          <h3>Copier des notes</h3>
          <div className="picker-header-actions">
            <button className="picker-select-all-btn" onClick={selectAll}>Tout sélectionner</button>
            <button className="icon-btn" onClick={() => dispatch({ type: 'TOGGLE_FILE_PICKER' })}>✕</button>
          </div>
        </div>

        <div className="picker-tree-container">
          <div className="picker-prompt-box">
            <label>
              Prompt au debut du presse-papier
              <select value={promptKey} onChange={e => setPromptKey(e.target.value)}>
                {Object.entries(COPY_PROMPTS).map(([key, prompt]) => (
                  <option key={key} value={key}>{prompt.label}</option>
                ))}
              </select>
            </label>
            {promptKey !== 'none' && <p>{COPY_PROMPTS[promptKey].text.split('\n')[0]}</p>}
          </div>
          <div className="picker-period-box">
            <div>
              <strong>Recap de periode</strong>
              <p>Copie les notes modifiees sur une periode avec un preprompt de synthese.</p>
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={handleCopyLastWeek}
              disabled={loading}
            >
              Copier la derniere semaine
            </button>
            <div className="picker-period-grid">
              <label>
                Debut
                <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
              </label>
              <label>
                Fin
                <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
              </label>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleCopyPeriod()}
              disabled={loading}
            >
              Copier cette periode
            </button>
          </div>
          <SelectableTree
            nodes={tree}
            selectedIds={selectedIds}
            onToggle={handleToggle}
          />
        </div>

        <div className="picker-footer">
          <span className="picker-count">
            {fileCount > 0 ? `${fileCount} fichier(s) sélectionné(s)` : 'Aucun fichier sélectionné'}
          </span>
          <div className="picker-actions">
            <button
              className="btn-ghost picker-dl"
              onClick={handleDownload}
              disabled={loading || fileCount === 0}
              title="Télécharger en .md"
            >
              ↓ .md
            </button>
            <button
              className="btn-primary"
              onClick={handleCopy}
              disabled={loading || fileCount === 0}
            >
              {loading ? '…' : '⎘ Copier'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
