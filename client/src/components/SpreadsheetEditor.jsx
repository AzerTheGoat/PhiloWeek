import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/useApp'
import Icon from './Icons'
import FileHistoryControls, { useFileHistoryActions } from './FileHistoryControls'
import * as api from '../api'
import {
  cellInSelection,
  columnToNumber,
  createBlankSheet,
  evaluateWorkbookCell,
  formatCellValue,
  makeId,
  normalizeSelection,
  numberToColumn,
  parseAddress,
  parseSpreadsheetJson,
  serializeSpreadsheet,
  toAddress,
} from '../utils/spreadsheetFile'

const AUTOSAVE_DELAY = 650
const MAX_VISIBLE_CELLS = 10000

export default function SpreadsheetEditor({ readOnly = false }) {
  const { currentFile, openFileId, saveFile, toast } = useApp()
  const initial = useMemo(() => safeParse(currentFile?.content), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [workbook, setWorkbook] = useState(initial.workbook)
  const [parseError, setParseError] = useState(initial.error)
  const [activeSheetId, setActiveSheetId] = useState(initial.workbook?.sheets?.[0]?.id || null)
  const [activeCell, setActiveCell] = useState({ row: 1, col: 1 })
  const [selectionEnd, setSelectionEnd] = useState({ row: 1, col: 1 })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formulaHelp, setFormulaHelp] = useState(false)
  const gridRef = useRef(null)
  const editorRef = useRef(null)
  const saveTimerRef = useRef(null)
  const saveGenerationRef = useRef(0)
  const savePromiseRef = useRef(null)
  const serializedRef = useRef(currentFile?.content || '')
  const dirtyRef = useRef(false)
  const previousFileIdRef = useRef(openFileId)
  const draggingRef = useRef(false)

  const sheet = workbook?.sheets?.find(item => item.id === activeSheetId) || workbook?.sheets?.[0]
  const selection = normalizeSelection(activeCell, selectionEnd)
  const activeAddress = toAddress(activeCell.row, activeCell.col)
  const activeRaw = sheet?.cells?.[activeAddress]?.input ?? ''

  useEffect(() => {
    const previousId = previousFileIdRef.current
    if (previousId && previousId !== openFileId && dirtyRef.current) {
      clearTimeout(saveTimerRef.current)
      const contentToSave = serializedRef.current
      Promise.resolve(savePromiseRef.current).catch(() => {}).then(() => saveFile(previousId, contentToSave)).catch(() => {})
    }
    previousFileIdRef.current = openFileId
    const parsed = safeParse(currentFile?.content)
    setWorkbook(parsed.workbook)
    setParseError(parsed.error)
    setActiveSheetId(parsed.workbook?.sheets?.[0]?.id || null)
    setActiveCell({ row: 1, col: 1 })
    setSelectionEnd({ row: 1, col: 1 })
    setEditing(false)
    setSaving(false)
    setDirty(false)
    dirtyRef.current = false
    serializedRef.current = currentFile?.content || ''
    clearTimeout(saveTimerRef.current)
  }, [currentFile]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(saveTimerRef.current), [])

  useEffect(() => {
    const onMouseUp = () => { draggingRef.current = false }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [])

  useEffect(() => {
    if (!editing) setDraft(stringifyInput(activeRaw))
  }, [activeAddress, activeRaw, activeSheetId, editing])

  useEffect(() => {
    if (editing) requestAnimationFrame(() => editorRef.current?.focus())
  }, [editing, activeAddress])

  const queueSave = useCallback((nextWorkbook) => {
    const serialized = serializeSpreadsheet(nextWorkbook)
    serializedRef.current = serialized
    dirtyRef.current = true
    const generation = ++saveGenerationRef.current
    setDirty(true)
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      if (!openFileId) return
      setSaving(true)
      const savePromise = saveFile(openFileId, serializedRef.current)
      savePromiseRef.current = savePromise
      try {
        await savePromise
        if (generation === saveGenerationRef.current) {
          dirtyRef.current = false
          setDirty(false)
        }
      } catch (_) {
        // Le contexte conserve la version locale et affiche le conflit éventuel.
      } finally {
        if (savePromiseRef.current === savePromise) savePromiseRef.current = null
        if (generation === saveGenerationRef.current) setSaving(false)
      }
    }, AUTOSAVE_DELAY)
  }, [openFileId, saveFile])

  const updateWorkbook = useCallback((producer) => {
    if (readOnly || !workbook) return
    const next = producer(workbook)
    setWorkbook(next)
    queueSave(next)
  }, [queueSave, readOnly, workbook])

  const flushPending = useCallback(async () => {
    if (!openFileId) return false
    clearTimeout(saveTimerRef.current)
    if (savePromiseRef.current) {
      await savePromiseRef.current
      if (!dirtyRef.current) return true
    }
    if (!dirtyRef.current) return false
    const generation = saveGenerationRef.current
    setSaving(true)
    const savePromise = saveFile(openFileId, serializedRef.current)
    savePromiseRef.current = savePromise
    try {
      await savePromise
      if (generation === saveGenerationRef.current) {
        dirtyRef.current = false
        setDirty(false)
      }
      return true
    } finally {
      if (savePromiseRef.current === savePromise) savePromiseRef.current = null
      setSaving(false)
    }
  }, [openFileId, saveFile])

  const applyHistoryContent = useCallback((content) => {
    const parsed = safeParse(content)
    setWorkbook(parsed.workbook)
    setParseError(parsed.error)
    setActiveSheetId(current => parsed.workbook?.sheets.some(item => item.id === current) ? current : parsed.workbook?.sheets?.[0]?.id || null)
    serializedRef.current = content
    dirtyRef.current = false
    setDirty(false)
    setEditing(false)
  }, [])

  const history = useFileHistoryActions({ flushPending, applyContent: applyHistoryContent, hasPending: dirty, disabled: readOnly })

  const writeCell = useCallback((row, col, input, stylePatch = null) => {
    if (!sheet) return
    updateWorkbook(current => ({
      ...current,
      sheets: current.sheets.map(item => {
        if (item.id !== sheet.id) return item
        const cells = { ...item.cells }
        const address = toAddress(row, col)
        const previous = cells[address] || { input: '' }
        const nextStyle = stylePatch ? { ...(previous.style || {}), ...stylePatch } : previous.style
        const cleanedStyle = Object.fromEntries(Object.entries(nextStyle || {}).filter(([, value]) => value !== false && value !== '' && value !== null && value !== undefined))
        const nextCell = { input, ...(Object.keys(cleanedStyle).length ? { style: cleanedStyle } : {}) }
        if ((input === '' || input === null) && !Object.keys(cleanedStyle).length) delete cells[address]
        else cells[address] = nextCell
        return { ...item, cells }
      }),
    }))
  }, [sheet, updateWorkbook])

  const commitDraft = useCallback((move = null) => {
    if (!readOnly) writeCell(activeCell.row, activeCell.col, normalizeEditorInput(draft))
    setEditing(false)
    if (move && sheet) moveActive(move.row, move.col, sheet)
  }, [activeCell.col, activeCell.row, draft, readOnly, sheet, writeCell]) // eslint-disable-line react-hooks/exhaustive-deps

  const startEditing = useCallback((initialValue = null) => {
    if (readOnly) return
    setDraft(initialValue === null ? stringifyInput(activeRaw) : initialValue)
    setEditing(true)
  }, [activeRaw, readOnly])

  const moveActive = useCallback((rowDelta, colDelta, targetSheet = sheet, extend = false) => {
    if (!targetSheet) return
    const source = extend ? selectionEnd : activeCell
    const next = {
      row: Math.max(1, Math.min(targetSheet.rowCount, source.row + rowDelta)),
      col: Math.max(1, Math.min(targetSheet.columnCount, source.col + colDelta)),
    }
    if (extend) setSelectionEnd(next)
    else { setActiveCell(next); setSelectionEnd(next) }
    setEditing(false)
    requestAnimationFrame(() => scrollCellIntoView(next))
  }, [activeCell, selectionEnd, sheet])

  const scrollCellIntoView = useCallback((point) => {
    gridRef.current?.querySelector(`[data-address="${toAddress(point.row, point.col)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [])

  const selectCell = useCallback((event, row, col) => {
    if (event.shiftKey) setSelectionEnd({ row, col })
    else {
      setActiveCell({ row, col })
      setSelectionEnd({ row, col })
      draggingRef.current = true
    }
    setEditing(false)
    gridRef.current?.focus({ preventScroll: true })
  }, [])

  const handleGridKeyDown = useCallback((event) => {
    if (!sheet || editing) return
    const extend = event.shiftKey
    if (event.key === 'ArrowUp') { event.preventDefault(); moveActive(-1, 0, sheet, extend); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); moveActive(1, 0, sheet, extend); return }
    if (event.key === 'ArrowLeft') { event.preventDefault(); moveActive(0, -1, sheet, extend); return }
    if (event.key === 'ArrowRight') { event.preventDefault(); moveActive(0, 1, sheet, extend); return }
    if (event.key === 'Tab') { event.preventDefault(); moveActive(0, event.shiftKey ? -1 : 1); return }
    if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); startEditing(); return }
    if ((event.key === 'Delete' || event.key === 'Backspace') && !readOnly) { event.preventDefault(); clearSelection(); return }
    if ((event.ctrlKey || event.metaKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase()) && !readOnly) {
      event.preventDefault()
      const key = { b: 'bold', i: 'italic', u: 'underline' }[event.key.toLowerCase()]
      toggleStyle(key)
      return
    }
    if (!readOnly && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
      event.preventDefault()
      startEditing(event.key)
    }
  }, [editing, moveActive, readOnly, sheet, startEditing]) // eslint-disable-line react-hooks/exhaustive-deps

  const clearSelection = useCallback(() => {
    if (!sheet) return
    updateWorkbook(current => ({
      ...current,
      sheets: current.sheets.map(item => {
        if (item.id !== sheet.id) return item
        const cells = { ...item.cells }
        forEachSelection(selection, (row, col) => {
          const address = toAddress(row, col)
          if (!cells[address]) return
          const style = cells[address].style
          if (style && Object.keys(style).length) cells[address] = { input: '', style }
          else delete cells[address]
        })
        return { ...item, cells }
      }),
    }))
  }, [selection, sheet, updateWorkbook])

  const applyStyle = useCallback((patch) => {
    if (!sheet) return
    updateWorkbook(current => ({
      ...current,
      sheets: current.sheets.map(item => {
        if (item.id !== sheet.id) return item
        const cells = { ...item.cells }
        forEachSelection(selection, (row, col) => {
          const address = toAddress(row, col)
          const previous = cells[address] || { input: '' }
          const style = { ...(previous.style || {}), ...patch }
          for (const key of Object.keys(style)) if (style[key] === false || style[key] === '' || style[key] === null) delete style[key]
          cells[address] = { input: previous.input ?? '', ...(Object.keys(style).length ? { style } : {}) }
        })
        return { ...item, cells }
      }),
    }))
  }, [selection, sheet, updateWorkbook])

  const toggleStyle = useCallback((key) => {
    const current = Boolean(sheet?.cells?.[activeAddress]?.style?.[key])
    applyStyle({ [key]: !current })
  }, [activeAddress, applyStyle, sheet])

  const handleCopy = useCallback((event) => {
    if (!sheet) return
    event.preventDefault()
    event.clipboardData.setData('text/plain', selectionToTsv(sheet, selection))
  }, [selection, sheet])

  const handlePaste = useCallback((event) => {
    if (!sheet || readOnly) return
    event.preventDefault()
    const rows = event.clipboardData.getData('text/plain').replace(/\r/g, '').split('\n').map(row => row.split('\t'))
    if (rows.at(-1)?.length === 1 && rows.at(-1)[0] === '') rows.pop()
    if (!rows.length) return
    updateWorkbook(current => ({
      ...current,
      sheets: current.sheets.map(item => {
        if (item.id !== sheet.id) return item
        const cells = { ...item.cells }
        rows.forEach((values, rowOffset) => values.forEach((value, colOffset) => {
          const row = activeCell.row + rowOffset
          const col = activeCell.col + colOffset
          if (row > item.rowCount || col > item.columnCount) return
          const address = toAddress(row, col)
          cells[address] = { ...(cells[address] || {}), input: normalizeEditorInput(value) }
        }))
        return { ...item, cells }
      }),
    }))
    setSelectionEnd({
      row: Math.min(sheet.rowCount, activeCell.row + rows.length - 1),
      col: Math.min(sheet.columnCount, activeCell.col + Math.max(...rows.map(row => row.length)) - 1),
    })
  }, [activeCell, readOnly, sheet, updateWorkbook])

  const mutateDimension = useCallback((axis, direction) => {
    if (!sheet) return
    const index = axis === 'row' ? activeCell.row : activeCell.col
    const isInsert = direction === 'insert'
    const limit = axis === 'row' ? 2000 : 200
    const countKey = axis === 'row' ? 'rowCount' : 'columnCount'
    if (isInsert && sheet[countKey] >= limit) return toast(`Limite de ${limit} ${axis === 'row' ? 'lignes' : 'colonnes'} atteinte`, 'error')
    const nextRows = sheet.rowCount + (axis === 'row' && isInsert ? 1 : 0)
    const nextColumns = sheet.columnCount + (axis === 'col' && isInsert ? 1 : 0)
    if (isInsert && nextRows * nextColumns > MAX_VISIBLE_CELLS) return toast(`La feuille est limitée à ${MAX_VISIBLE_CELLS.toLocaleString('fr-FR')} cellules affichables`, 'error')
    if (!isInsert && sheet[countKey] <= 1) return
    updateWorkbook(current => shiftWorkbookDimension(current, sheet.id, axis, index, isInsert ? 1 : -1))
    if (!isInsert) {
      const next = axis === 'row'
        ? { row: Math.min(activeCell.row, sheet.rowCount - 1), col: activeCell.col }
        : { row: activeCell.row, col: Math.min(activeCell.col, sheet.columnCount - 1) }
      setActiveCell(next)
      setSelectionEnd(next)
    }
  }, [activeCell, sheet, toast, updateWorkbook])

  const resizeColumn = useCallback((delta) => {
    if (!sheet) return
    const key = numberToColumn(activeCell.col)
    updateWorkbook(current => ({
      ...current,
      sheets: current.sheets.map(item => item.id === sheet.id ? {
        ...item,
        columnWidths: { ...item.columnWidths, [key]: Math.max(56, Math.min(360, Number(item.columnWidths?.[key] || 110) + delta)) },
      } : item),
    }))
  }, [activeCell.col, sheet, updateWorkbook])

  const addSheet = useCallback(() => {
    if (!workbook || readOnly) return
    if (workbook.sheets.length >= 20) return toast('Un classeur peut contenir au maximum 20 feuilles', 'error')
    const names = new Set(workbook.sheets.map(item => item.name.toLowerCase()))
    let number = workbook.sheets.length + 1
    while (names.has(`feuille ${number}`)) number++
    const nextSheet = createBlankSheet(`Feuille ${number}`)
    updateWorkbook(current => ({ ...current, sheets: [...current.sheets, nextSheet] }))
    setActiveSheetId(nextSheet.id)
    setActiveCell({ row: 1, col: 1 })
    setSelectionEnd({ row: 1, col: 1 })
  }, [readOnly, toast, updateWorkbook, workbook])

  const renameSheet = useCallback((target) => {
    if (readOnly) return
    const requested = window.prompt('Nom de la feuille', target.name)
    if (requested === null) return
    const name = requested.replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31)
    if (!name) return
    if (workbook.sheets.some(item => item.id !== target.id && item.name.toLowerCase() === name.toLowerCase())) return toast('Ce nom de feuille existe déjà', 'error')
    updateWorkbook(current => renameWorkbookSheet(current, target.id, name))
  }, [readOnly, toast, updateWorkbook, workbook])

  const deleteSheet = useCallback((target) => {
    if (readOnly || workbook.sheets.length <= 1) return
    if (!window.confirm(`Supprimer la feuille « ${target.name} » ?`)) return
    const remaining = workbook.sheets.filter(item => item.id !== target.id)
    updateWorkbook(current => deleteWorkbookSheet(current, target))
    if (activeSheetId === target.id) setActiveSheetId(remaining[0].id)
  }, [activeSheetId, readOnly, updateWorkbook, workbook])

  const selectionStats = useMemo(() => {
    if (!workbook || !sheet) return { count: 0, sum: 0 }
    const cache = new Map()
    const values = []
    forEachSelection(selection, (row, col) => values.push(evaluateWorkbookCell(workbook, sheet.id, toAddress(row, col), cache)))
    const numbers = values.filter(value => value !== '' && Number.isFinite(Number(value))).map(Number)
    return { count: values.filter(value => value !== '').length, sum: numbers.reduce((total, value) => total + value, 0), average: numbers.length ? numbers.reduce((total, value) => total + value, 0) / numbers.length : null }
  }, [selection, sheet, workbook])

  if (parseError || !workbook || !sheet) {
    return (
      <div className="spreadsheet-editor spreadsheet-error">
        <Icon name="alert" size={32} />
        <h3>Classeur illisible</h3>
        <p>{parseError || 'Aucune feuille disponible.'}</p>
      </div>
    )
  }

  const cellCount = sheet.rowCount * sheet.columnCount
  if (cellCount > MAX_VISIBLE_CELLS) {
    return <div className="spreadsheet-editor spreadsheet-error"><p>Cette feuille dépasse la limite d’affichage de {MAX_VISIBLE_CELLS.toLocaleString('fr-FR')} cellules.</p></div>
  }

  const cache = new Map()
  const columns = Array.from({ length: sheet.columnCount }, (_, index) => index + 1)
  const rows = Array.from({ length: sheet.rowCount }, (_, index) => index + 1)
  const gridColumns = `46px ${columns.map(col => `${sheet.columnWidths?.[numberToColumn(col)] || 110}px`).join(' ')}`
  const activeStyle = sheet.cells?.[activeAddress]?.style || {}

  return (
    <div className={`spreadsheet-editor ${readOnly ? 'is-readonly' : ''}`}>
      <header className="spreadsheet-titlebar">
        <div className="spreadsheet-title">
          <Icon name="spreadsheet" size={20} />
          <div>
            <h2>{currentFile.name.replace(/\.xlsx$/i, '')}</h2>
            <span>{readOnly ? 'Lecture seule' : saving ? 'Sauvegarde…' : dirty ? 'Modifications locales' : 'Enregistré dans le cloud'}</span>
          </div>
        </div>
        <div className="spreadsheet-title-actions">
          {!readOnly && <FileHistoryControls history={history} />}
          <button type="button" className="btn-ghost" onClick={() => api.exportSpreadsheet(openFileId)} title="Télécharger le classeur Excel">
            <Icon name="download" size={15} /> XLSX
          </button>
        </div>
      </header>

      {!readOnly && (
        <div className="spreadsheet-toolbar" role="toolbar" aria-label="Mise en forme du tableur">
          <button className={activeStyle.bold ? 'active' : ''} onClick={() => toggleStyle('bold')} title="Gras (Ctrl+B)"><strong>B</strong></button>
          <button className={activeStyle.italic ? 'active' : ''} onClick={() => toggleStyle('italic')} title="Italique (Ctrl+I)"><em>I</em></button>
          <button className={activeStyle.underline ? 'active' : ''} onClick={() => toggleStyle('underline')} title="Souligné (Ctrl+U)"><u>U</u></button>
          <span className="spreadsheet-toolbar-separator" />
          {['left', 'center', 'right'].map(align => (
            <button key={align} className={activeStyle.align === align ? 'active' : ''} onClick={() => applyStyle({ align })} title={`Aligner ${align}`}>
              <Icon name={`align-${align}`} size={15} />
            </button>
          ))}
          <label className="spreadsheet-color-control" title="Couleur du texte">
            A<input type="color" value={activeStyle.color || '#1f2937'} onChange={event => applyStyle({ color: event.target.value })} />
          </label>
          <label className="spreadsheet-color-control" title="Couleur de fond">
            <Icon name="paint" size={14} /><input type="color" value={activeStyle.fill || '#ffffff'} onChange={event => applyStyle({ fill: event.target.value })} />
          </label>
          <select value={activeStyle.numberFormat || 'general'} onChange={event => applyStyle({ numberFormat: event.target.value })} title="Format des nombres">
            <option value="general">Général</option>
            <option value="number">Nombre</option>
            <option value="currency">Euro</option>
            <option value="percent">Pourcentage</option>
            <option value="date">Date</option>
          </select>
          <span className="spreadsheet-toolbar-separator" />
          <button onClick={() => mutateDimension('row', 'insert')} title="Insérer une ligne">+ Ligne</button>
          <button onClick={() => mutateDimension('row', 'delete')} title="Supprimer la ligne">− Ligne</button>
          <button onClick={() => mutateDimension('col', 'insert')} title="Insérer une colonne">+ Col.</button>
          <button onClick={() => mutateDimension('col', 'delete')} title="Supprimer la colonne">− Col.</button>
          <button onClick={() => resizeColumn(-20)} title="Réduire la colonne">↤</button>
          <button onClick={() => resizeColumn(20)} title="Élargir la colonne">↦</button>
          <button onClick={() => setFormulaHelp(value => !value)} title="Aide sur les formules">fx ?</button>
        </div>
      )}

      {formulaHelp && (
        <div className="spreadsheet-formula-help">
          Formules : <code>=A1+B1</code>, <code>=SOMME(A1:A10)</code>, MOYENNE, MIN, MAX, NB, NBVAL, SI, ET, OU, NON, ARRONDI, ABS et CONCAT. Les références entre feuilles utilisent <code>=&apos;Feuille 2&apos;!A1</code>.
        </div>
      )}

      <div className="spreadsheet-formula-bar">
        <strong>{activeAddress}</strong>
        <span>fx</span>
        <input
          value={draft}
          readOnly={readOnly}
          onChange={event => setDraft(event.target.value)}
          onBlur={() => {
            if (!readOnly && stringifyInput(activeRaw) !== draft) writeCell(activeCell.row, activeCell.col, normalizeEditorInput(draft))
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (!readOnly) writeCell(activeCell.row, activeCell.col, normalizeEditorInput(draft))
              moveActive(1, 0)
            }
            if (event.key === 'Escape') { setDraft(stringifyInput(activeRaw)); setEditing(false) }
          }}
          aria-label={`Contenu de ${activeAddress}`}
        />
      </div>

      <div
        className="spreadsheet-grid"
        ref={gridRef}
        tabIndex={0}
        onKeyDown={handleGridKeyDown}
        onCopy={handleCopy}
        onPaste={handlePaste}
        style={{ gridTemplateColumns: gridColumns }}
        aria-label={`Feuille ${sheet.name}`}
      >
        <div className="spreadsheet-corner" />
        {columns.map(col => <div key={`head-${col}`} className={`spreadsheet-column-head ${selection.left <= col && selection.right >= col ? 'selected' : ''}`}>{numberToColumn(col)}</div>)}
        {rows.map(row => (
          <SpreadsheetRow
            key={row}
            row={row}
            columns={columns}
            workbook={workbook}
            sheet={sheet}
            cache={cache}
            selection={selection}
            activeAddress={activeAddress}
            editing={editing}
            draft={draft}
            editorRef={editorRef}
            readOnly={readOnly}
            onSelect={selectCell}
            onHover={(hoverRow, hoverCol) => draggingRef.current && setSelectionEnd({ row: hoverRow, col: hoverCol })}
            onStartEdit={(rowNumber, colNumber) => {
              setActiveCell({ row: rowNumber, col: colNumber })
              setSelectionEnd({ row: rowNumber, col: colNumber })
              const input = sheet.cells?.[toAddress(rowNumber, colNumber)]?.input ?? ''
              setDraft(stringifyInput(input))
              setEditing(true)
            }}
            onDraft={setDraft}
            onCommit={commitDraft}
            onCancel={() => { setDraft(stringifyInput(activeRaw)); setEditing(false) }}
          />
        ))}
      </div>

      <footer className="spreadsheet-footer">
        <div className="spreadsheet-sheet-tabs">
          {workbook.sheets.map(item => (
            <button
              key={item.id}
              className={item.id === sheet.id ? 'active' : ''}
              onClick={() => { setActiveSheetId(item.id); setActiveCell({ row: 1, col: 1 }); setSelectionEnd({ row: 1, col: 1 }); setEditing(false) }}
              onDoubleClick={() => renameSheet(item)}
              onContextMenu={event => { event.preventDefault(); if (!readOnly) deleteSheet(item) }}
              title={readOnly ? item.name : 'Double-clic : renommer · clic droit : supprimer'}
            >
              {item.name}
            </button>
          ))}
          {!readOnly && <button className="spreadsheet-add-sheet" onClick={addSheet} title="Ajouter une feuille">+</button>}
        </div>
        <div className="spreadsheet-status">
          <span>{selectionStats.count} valeur(s)</span>
          {selectionStats.average !== null && <span>Moy. {formatCellValue(selectionStats.average, { numberFormat: 'number' }, workbook.locale)}</span>}
          <span>Somme {formatCellValue(selectionStats.sum, { numberFormat: 'number' }, workbook.locale)}</span>
        </div>
      </footer>
    </div>
  )
}

function SpreadsheetRow({
  row, columns, workbook, sheet, cache, selection, activeAddress, editing, draft, editorRef, readOnly,
  onSelect, onHover, onStartEdit, onDraft, onCommit, onCancel,
}) {
  return (
    <>
      <div className={`spreadsheet-row-head ${selection.top <= row && selection.bottom >= row ? 'selected' : ''}`}>{row}</div>
      {columns.map(col => {
        const address = toAddress(row, col)
        const cell = sheet.cells?.[address] || {}
        const style = cell.style || {}
        const value = evaluateWorkbookCell(workbook, sheet.id, address, cache)
        const isActive = activeAddress === address
        return (
          <div
            key={address}
            data-address={address}
            className={`spreadsheet-cell ${cellInSelection(row, col, selection) ? 'selected' : ''} ${isActive ? 'active' : ''} ${String(value).startsWith('#') ? 'formula-error' : ''}`}
            style={{
              fontWeight: style.bold ? 700 : undefined,
              fontStyle: style.italic ? 'italic' : undefined,
              textDecoration: style.underline ? 'underline' : undefined,
              textAlign: style.align || (typeof value === 'number' ? 'right' : 'left'),
              backgroundColor: style.fill || undefined,
              color: style.color || undefined,
            }}
            onMouseDown={event => onSelect(event, row, col)}
            onMouseEnter={() => onHover(row, col)}
            onDoubleClick={() => onStartEdit(row, col)}
            title={typeof cell.input === 'string' && cell.input.startsWith('=') ? `${cell.input} → ${formatCellValue(value, style, workbook.locale)}` : undefined}
          >
            {isActive && editing && !readOnly ? (
              <input
                ref={editorRef}
                value={draft}
                onChange={event => onDraft(event.target.value)}
                onMouseDown={event => event.stopPropagation()}
                onBlur={() => onCommit()}
                onKeyDown={event => {
                  event.stopPropagation()
                  if (event.key === 'Enter') { event.preventDefault(); onCommit({ row: 1, col: 0 }) }
                  if (event.key === 'Tab') { event.preventDefault(); onCommit({ row: 0, col: event.shiftKey ? -1 : 1 }) }
                  if (event.key === 'Escape') { event.preventDefault(); onCancel() }
                }}
              />
            ) : (
              <span>{formatCellValue(value, style, workbook.locale)}</span>
            )}
          </div>
        )
      })}
    </>
  )
}

function safeParse(content) {
  try { return { workbook: parseSpreadsheetJson(content), error: null } }
  catch (err) { return { workbook: null, error: err.message } }
}

function stringifyInput(input) {
  if (input === null || input === undefined) return ''
  return String(input)
}

function normalizeEditorInput(value) {
  const text = String(value ?? '')
  if (text.startsWith('=') || text.startsWith("'")) return text
  const trimmed = text.trim()
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return Number(trimmed)
  if (/^(vrai|true)$/i.test(trimmed)) return true
  if (/^(faux|false)$/i.test(trimmed)) return false
  return text
}

function forEachSelection(selection, callback) {
  for (let row = selection.top; row <= selection.bottom; row++) {
    for (let col = selection.left; col <= selection.right; col++) callback(row, col)
  }
}

function selectionToTsv(sheet, selection) {
  const rows = []
  for (let row = selection.top; row <= selection.bottom; row++) {
    const values = []
    for (let col = selection.left; col <= selection.right; col++) values.push(stringifyInput(sheet.cells?.[toAddress(row, col)]?.input ?? ''))
    rows.push(values.join('\t'))
  }
  return rows.join('\n')
}

function shiftWorkbookDimension(workbook, targetSheetId, axis, index, delta) {
  const targetSheet = workbook.sheets.find(item => item.id === targetSheetId)
  if (!targetSheet) return workbook
  const targetName = targetSheet.name
  return {
    ...workbook,
    sheets: workbook.sheets.map(sheet => {
      let next = sheet
      if (sheet.id === targetSheetId) {
        const cells = {}
        for (const [address, cell] of Object.entries(sheet.cells || {})) {
          const point = parseAddress(address)
          if (!point) continue
          const coordinate = axis === 'row' ? point.row : point.col
          if (delta < 0 && coordinate === index) continue
          const shouldShift = delta > 0 ? coordinate >= index : coordinate > index
          const moved = { ...point, [axis]: shouldShift ? coordinate + delta : coordinate }
          if (moved.row < 1 || moved.col < 1) continue
          cells[toAddress(moved.row, moved.col)] = cell
        }
        next = {
          ...sheet,
          [axis === 'row' ? 'rowCount' : 'columnCount']: sheet[axis === 'row' ? 'rowCount' : 'columnCount'] + delta,
          columnWidths: axis === 'col' ? shiftColumnWidths(sheet.columnWidths || {}, index, delta) : sheet.columnWidths,
          cells,
        }
      }
      const cells = Object.fromEntries(Object.entries(next.cells || {}).map(([address, cell]) => [address, {
        ...cell,
        input: typeof cell.input === 'string' && cell.input.startsWith('=')
          ? adjustFormula(cell.input, targetName, sheet.name, axis, index, delta)
          : cell.input,
      }]))
      return { ...next, cells }
    }),
  }
}

function adjustFormula(formula, targetSheetName, currentSheetName, axis, index, delta) {
  return formula.replace(/(?:(('(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!)?)((?:\$?[A-Za-z]{1,3})(?:\$?\d+))/g, (match, _qualified, sheetPart, address) => {
    const explicitName = sheetPart ? sheetPart.slice(0, -1).replace(/^'|'$/g, '').replace(/''/g, "'") : currentSheetName
    if (explicitName.toLowerCase() !== targetSheetName.toLowerCase()) return match
    const point = parseAddress(address)
    if (!point) return match
    const coordinate = axis === 'row' ? point.row : point.col
    if (delta < 0 && coordinate === index) return '#REF!'
    const shouldShift = delta > 0 ? coordinate >= index : coordinate > index
    if (!shouldShift) return match
    const shifted = axis === 'row'
      ? `${numberToColumn(point.col)}${point.row + delta}`
      : `${numberToColumn(point.col + delta)}${point.row}`
    return `${sheetPart || ''}${shifted}`
  })
}

function renameWorkbookSheet(workbook, sheetId, name) {
  const target = workbook.sheets.find(item => item.id === sheetId)
  if (!target) return workbook
  const oldName = target.name
  const quotedOld = `'${oldName.replace(/'/g, "''")}'!`
  const quotedNew = `'${name.replace(/'/g, "''")}'!`
  const plainPattern = new RegExp(`\\b${escapeRegex(oldName)}!`, 'gi')
  return {
    ...workbook,
    sheets: workbook.sheets.map(sheet => ({
      ...sheet,
      name: sheet.id === sheetId ? name : sheet.name,
      cells: Object.fromEntries(Object.entries(sheet.cells || {}).map(([address, cell]) => [address, {
        ...cell,
        input: typeof cell.input === 'string' && cell.input.startsWith('=')
          ? cell.input.split(quotedOld).join(quotedNew).replace(plainPattern, quotedNew)
          : cell.input,
      }])),
    })),
  }
}

function deleteWorkbookSheet(workbook, target) {
  const quotedPattern = new RegExp(`'${escapeRegex(target.name.replace(/'/g, "''"))}'!\\$?[A-Z]{1,3}\\$?\\d+`, 'gi')
  const plainPattern = new RegExp(`\\b${escapeRegex(target.name)}!\\$?[A-Z]{1,3}\\$?\\d+`, 'gi')
  return {
    ...workbook,
    sheets: workbook.sheets.filter(item => item.id !== target.id).map(sheet => ({
      ...sheet,
      cells: Object.fromEntries(Object.entries(sheet.cells || {}).map(([address, cell]) => [address, {
        ...cell,
        input: typeof cell.input === 'string' && cell.input.startsWith('=')
          ? cell.input.replace(quotedPattern, '#REF!').replace(plainPattern, '#REF!')
          : cell.input,
      }])),
    })),
  }
}

function shiftColumnWidths(widths, index, delta) {
  const next = {}
  for (const [column, width] of Object.entries(widths || {})) {
    const number = columnToNumber(column)
    if (delta < 0 && number === index) continue
    const shouldShift = delta > 0 ? number >= index : number > index
    next[numberToColumn(shouldShift ? number + delta : number)] = width
  }
  return next
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
