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
  const [openMenu, setOpenMenu] = useState(null)
  const [findPanel, setFindPanel] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [zoom, setZoom] = useState(100)
  const [chartPanel, setChartPanel] = useState(false)
  const [localHistoryTick, setLocalHistoryTick] = useState(0)
  const [resizePreview, setResizePreview] = useState(null)
  const gridRef = useRef(null)
  const editorRef = useRef(null)
  const saveTimerRef = useRef(null)
  const saveGenerationRef = useRef(0)
  const savePromiseRef = useRef(null)
  const serializedRef = useRef(currentFile?.content || '')
  const dirtyRef = useRef(false)
  const previousFileIdRef = useRef(openFileId)
  const draggingRef = useRef(false)
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  const clipboardRef = useRef(null)

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
    undoStackRef.current = []
    redoStackRef.current = []
    setLocalHistoryTick(value => value + 1)
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

  const updateWorkbook = useCallback((producer, { record = true } = {}) => {
    if (readOnly || !workbook) return
    const next = producer(workbook)
    if (next === workbook) return
    if (record) {
      undoStackRef.current = [...undoStackRef.current.slice(-49), workbook]
      redoStackRef.current = []
      setLocalHistoryTick(value => value + 1)
    }
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
    undoStackRef.current = []
    redoStackRef.current = []
    setLocalHistoryTick(value => value + 1)
  }, [])

  const serverHistory = useFileHistoryActions({ flushPending, applyContent: applyHistoryContent, hasPending: dirty, disabled: readOnly, keyboardDisabled: true })
  const localUndo = useCallback(() => {
    const previous = undoStackRef.current.pop()
    if (!previous || !workbook) return false
    redoStackRef.current.push(workbook)
    setWorkbook(previous)
    queueSave(previous)
    setLocalHistoryTick(value => value + 1)
    return true
  }, [queueSave, workbook])
  const localRedo = useCallback(() => {
    const next = redoStackRef.current.pop()
    if (!next || !workbook) return false
    undoStackRef.current.push(workbook)
    setWorkbook(next)
    queueSave(next)
    setLocalHistoryTick(value => value + 1)
    return true
  }, [queueSave, workbook])
  const history = useMemo(() => ({
    busy: serverHistory.busy,
    canUndo: undoStackRef.current.length > 0 || serverHistory.canUndo,
    canRedo: redoStackRef.current.length > 0 || serverHistory.canRedo,
    undo: () => { if (!localUndo()) serverHistory.undo() },
    redo: () => { if (!localRedo()) serverHistory.redo() },
  }), [localHistoryTick, localRedo, localUndo, serverHistory]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKeyDown = event => {
      if (readOnly || !(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); history.undo() }
      else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); history.redo() }
      else if (key === 'f') { event.preventDefault(); setFindPanel(true) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [history, readOnly])

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
    clipboardRef.current = {
      source: selection,
      cells: selectionToCells(sheet, selection),
      cut: false,
    }
  }, [selection, sheet])

  const copySelection = useCallback(async (cut = false) => {
    if (!sheet) return
    clipboardRef.current = { source: selection, cells: selectionToCells(sheet, selection), cut }
    try { await navigator.clipboard.writeText(selectionToTsv(sheet, selection)) } catch (_) {}
    toast(cut ? 'Sélection prête à être déplacée' : 'Sélection copiée', 'success')
  }, [selection, sheet, toast])

  const handlePaste = useCallback((event) => {
    if (!sheet || readOnly) return
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    const internal = clipboardRef.current
    const rows = text.replace(/\r/g, '').split('\n').map(row => row.split('\t'))
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
          const internalCell = internal?.cells?.[rowOffset]?.[colOffset]
          if (internalCell) {
            const sourceRow = internal.source.top + rowOffset
            const sourceCol = internal.source.left + colOffset
            cells[address] = translateCell(internalCell, row - sourceRow, col - sourceCol)
          } else cells[address] = { ...(cells[address] || {}), input: normalizeEditorInput(value) }
        }))
        if (internal?.cut) {
          forEachSelection(internal.source, (row, col) => delete cells[toAddress(row, col)])
          clipboardRef.current = null
        }
        return { ...item, cells }
      }),
    }))
    setSelectionEnd({
      row: Math.min(sheet.rowCount, activeCell.row + rows.length - 1),
      col: Math.min(sheet.columnCount, activeCell.col + Math.max(...rows.map(row => row.length)) - 1),
    })
  }, [activeCell, readOnly, sheet, updateWorkbook])

  const pasteValuesOnly = useCallback(() => {
    const copied = clipboardRef.current
    if (!copied || !sheet || readOnly) return toast('Copiez d’abord une plage du classeur', 'error')
    updateWorkbook(current => ({
      ...current,
      sheets: current.sheets.map(item => {
        if (item.id !== sheet.id) return item
        const cells = { ...item.cells }
        copied.cells.forEach((rowCells, rowOffset) => rowCells.forEach((cell, colOffset) => {
          const row = activeCell.row + rowOffset
          const col = activeCell.col + colOffset
          if (row <= item.rowCount && col <= item.columnCount) cells[toAddress(row, col)] = { input: cell?.input ?? '' }
        }))
        return { ...item, cells }
      }),
    }))
  }, [activeCell, readOnly, sheet, toast, updateWorkbook])

  const selectWholeRow = useCallback((row) => {
    setActiveCell({ row, col: 1 }); setSelectionEnd({ row, col: sheet.columnCount }); setEditing(false)
  }, [sheet])

  const selectWholeColumn = useCallback((col) => {
    setActiveCell({ row: 1, col }); setSelectionEnd({ row: sheet.rowCount, col }); setEditing(false)
  }, [sheet])

  const selectAll = useCallback(() => {
    setActiveCell({ row: 1, col: 1 }); setSelectionEnd({ row: sheet.rowCount, col: sheet.columnCount }); setEditing(false)
  }, [sheet])

  const clearFormatting = useCallback(() => {
    if (!sheet) return
    updateWorkbook(current => ({ ...current, sheets: current.sheets.map(item => {
      if (item.id !== sheet.id) return item
      const cells = { ...item.cells }
      forEachSelection(selection, (row, col) => {
        const address = toAddress(row, col)
        if (!cells[address]) return
        const { style, ...rest } = cells[address]
        if ((rest.input ?? '') === '' && !rest.note && !rest.validation) delete cells[address]
        else cells[address] = rest
      })
      return { ...item, cells }
    }) }))
  }, [selection, sheet, updateWorkbook])

  const mergeSelection = useCallback(() => {
    if (!sheet) return
    const existing = (sheet.merges || []).find(merge => rangesOverlap(merge, selection))
    if (existing) {
      updateWorkbook(current => ({ ...current, sheets: current.sheets.map(item => item.id === sheet.id ? { ...item, merges: (item.merges || []).filter(merge => merge !== existing && !rangesEqual(merge, existing)) } : item) }))
      return
    }
    if (selection.top === selection.bottom && selection.left === selection.right) return toast('Sélectionnez plusieurs cellules à fusionner', 'error')
    updateWorkbook(current => ({ ...current, sheets: current.sheets.map(item => {
      if (item.id !== sheet.id) return item
      const cells = { ...item.cells }
      const anchor = cells[toAddress(selection.top, selection.left)] || { input: '' }
      forEachSelection(selection, (row, col) => { if (row !== selection.top || col !== selection.left) delete cells[toAddress(row, col)] })
      cells[toAddress(selection.top, selection.left)] = anchor
      return { ...item, cells, merges: [...(item.merges || []), selection] }
    }) }))
  }, [selection, sheet, toast, updateWorkbook])

  const setCellNote = useCallback(() => {
    if (!sheet) return
    const current = sheet.cells?.[activeAddress]?.note || ''
    const note = window.prompt(`Note de ${activeAddress}`, current)
    if (note === null) return
    updateWorkbook(currentWorkbook => ({ ...currentWorkbook, sheets: currentWorkbook.sheets.map(item => {
      if (item.id !== sheet.id) return item
      const cells = { ...item.cells }
      const previous = cells[activeAddress] || { input: '' }
      if (note.trim()) cells[activeAddress] = { ...previous, note: note.trim().slice(0, 5000) }
      else { delete previous.note; cells[activeAddress] = { ...previous } }
      return { ...item, cells }
    }) }))
  }, [activeAddress, sheet, updateWorkbook])

  const setDropdown = useCallback(() => {
    if (!sheet) return
    const existing = sheet.cells?.[activeAddress]?.validation?.values?.join(', ') || ''
    const raw = window.prompt('Valeurs de la liste déroulante, séparées par des virgules. Laissez vide pour la retirer.', existing)
    if (raw === null) return
    const values = raw.split(',').map(value => value.trim()).filter(Boolean).slice(0, 100)
    updateWorkbook(current => ({ ...current, sheets: current.sheets.map(item => {
      if (item.id !== sheet.id) return item
      const cells = { ...item.cells }
      forEachSelection(selection, (row, col) => {
        const address = toAddress(row, col)
        const previous = cells[address] || { input: '' }
        if (values.length) cells[address] = { ...previous, validation: { type: 'list', values, rejectInvalid: true } }
        else { const { validation, ...rest } = previous; cells[address] = rest }
      })
      return { ...item, cells }
    }) }))
  }, [activeAddress, selection, sheet, updateWorkbook])

  const setConditionalFormat = useCallback(() => {
    if (!sheet) return
    const operator = window.prompt('Règle : contains, equals, greater, less ou notEmpty', 'greater')
    if (operator === null) return
    if (!['contains', 'equals', 'greater', 'less', 'notEmpty'].includes(operator)) return toast('Règle inconnue', 'error')
    const value = operator === 'notEmpty' ? '' : window.prompt('Valeur à comparer', '')
    if (value === null) return
    const fill = window.prompt('Couleur de fond (hex)', '#d9ead3')
    if (fill === null || !/^#[0-9a-f]{6}$/i.test(fill)) return toast('Couleur invalide', 'error')
    updateWorkbook(current => ({ ...current, sheets: current.sheets.map(item => item.id === sheet.id ? {
      ...item,
      conditionalFormats: [...(item.conditionalFormats || []), { id: makeId('cf'), range: selection, operator, value, fill, color: '#1f2937' }].slice(-100),
    } : item) }))
  }, [selection, sheet, toast, updateWorkbook])

  const toggleFilter = useCallback(() => {
    if (!sheet) return
    updateWorkbook(current => ({ ...current, sheets: current.sheets.map(item => item.id === sheet.id ? { ...item, filters: item.filters ? null : { range: selection, rules: {} } } : item) }))
  }, [selection, sheet, updateWorkbook])

  const editFilter = useCallback((col) => {
    if (!sheet?.filters) return
    const raw = window.prompt(`Filtrer ${numberToColumn(col)} : contains:texte, equals:texte, greater:10, less:10, notEmpty. Vide pour retirer.`, '')
    if (raw === null) return
    const [candidate, ...rest] = raw.split(':')
    const operator = ['contains', 'equals', 'greater', 'less', 'notEmpty'].includes(candidate) ? candidate : 'contains'
    const value = rest.join(':') || (operator === 'contains' && candidate !== 'contains' ? candidate : '')
    updateWorkbook(current => ({ ...current, sheets: current.sheets.map(item => {
      if (item.id !== sheet.id) return item
      const rules = { ...(item.filters?.rules || {}) }
      if (!raw.trim()) delete rules[col]
      else rules[col] = { operator, value }
      return { ...item, filters: { ...item.filters, rules } }
    }) }))
  }, [sheet, updateWorkbook])

  const sortSelection = useCallback((direction) => {
    if (!sheet) return
    const keyCol = activeCell.col
    updateWorkbook(current => ({ ...current, sheets: current.sheets.map(item => {
      if (item.id !== sheet.id) return item
      const cells = { ...item.cells }
      const rows = []
      for (let row = selection.top; row <= selection.bottom; row++) {
        const rowCells = []
        for (let col = selection.left; col <= selection.right; col++) rowCells.push(cells[toAddress(row, col)] ? structuredClone(cells[toAddress(row, col)]) : null)
        rows.push({ sourceRow: row, cells: rowCells, key: evaluateWorkbookCell(current, item.id, toAddress(row, keyCol), new Map()) })
      }
      rows.sort((a, b) => compareValues(a.key, b.key) * direction)
      rows.forEach((entry, offset) => entry.cells.forEach((cell, colOffset) => {
        const targetRow = selection.top + offset
        const address = toAddress(targetRow, selection.left + colOffset)
        if (cell) cells[address] = translateCell(cell, targetRow - entry.sourceRow, 0)
        else delete cells[address]
      }))
      return { ...item, cells }
    }) }))
  }, [activeCell.col, selection, sheet, updateWorkbook])

  const findNext = useCallback(() => {
    if (!findText || !sheet) return
    const addresses = Object.keys(sheet.cells || {}).sort((a, b) => {
      const pa = parseAddress(a); const pb = parseAddress(b); return pa.row - pb.row || pa.col - pb.col
    })
    const start = addresses.indexOf(activeAddress)
    const ordered = [...addresses.slice(start + 1), ...addresses.slice(0, start + 1)]
    const found = ordered.find(address => String(sheet.cells[address]?.input ?? '').toLowerCase().includes(findText.toLowerCase()))
    if (!found) return toast('Aucune occurrence trouvée', 'error')
    const point = parseAddress(found); setActiveCell(point); setSelectionEnd(point); requestAnimationFrame(() => scrollCellIntoView(point))
  }, [activeAddress, findText, scrollCellIntoView, sheet, toast])

  const replaceCurrent = useCallback((all = false) => {
    if (!findText || !sheet || readOnly) return
    updateWorkbook(current => ({ ...current, sheets: current.sheets.map(item => {
      if (item.id !== sheet.id) return item
      const cells = { ...item.cells }
      const targets = all ? Object.keys(cells) : [activeAddress]
      let count = 0
      for (const address of targets) {
        const input = cells[address]?.input
        if (typeof input !== 'string' || !input.toLowerCase().includes(findText.toLowerCase())) continue
        cells[address] = { ...cells[address], input: replaceCaseInsensitive(input, findText, replaceText, all) }; count++
      }
      if (!count) toast('Aucune occurrence remplacée', 'error')
      return { ...item, cells }
    }) }))
  }, [activeAddress, findText, readOnly, replaceText, sheet, toast, updateWorkbook])

  const addChart = useCallback((type) => {
    if (!sheet) return
    if (selection.top === selection.bottom || selection.left === selection.right) return toast('Sélectionnez au moins deux lignes et deux colonnes', 'error')
    const typeLabel = { bar: 'Graphique en barres', line: 'Graphique en courbes', pie: 'Graphique circulaire' }[type]
    updateWorkbook(current => ({ ...current, sheets: current.sheets.map(item => item.id === sheet.id ? { ...item, charts: [...(item.charts || []), { id: makeId('chart'), type, title: typeLabel, range: selection }].slice(-20) } : item) }))
    setChartPanel(true)
  }, [selection, sheet, toast, updateWorkbook])

  const duplicateSheet = useCallback((target = sheet) => {
    if (!target || workbook.sheets.length >= 20) return toast('Limite de 20 feuilles atteinte', 'error')
    const copy = structuredClone(target)
    copy.id = makeId('sheet')
    copy.name = uniqueSheetName(`${target.name} copie`, workbook.sheets)
    updateWorkbook(current => ({ ...current, sheets: [...current.sheets, copy] }))
    setActiveSheetId(copy.id)
  }, [sheet, toast, updateWorkbook, workbook.sheets])

  const moveSheet = useCallback((target, delta) => {
    const index = workbook.sheets.findIndex(item => item.id === target.id)
    const nextIndex = Math.max(0, Math.min(workbook.sheets.length - 1, index + delta))
    if (index === nextIndex) return
    updateWorkbook(current => { const sheets = [...current.sheets]; const [moved] = sheets.splice(index, 1); sheets.splice(nextIndex, 0, moved); return { ...current, sheets } })
  }, [updateWorkbook, workbook.sheets])

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

  const autoFitColumn = useCallback((col = activeCell.col) => {
    if (!sheet) return
    let length = numberToColumn(col).length
    for (let row = 1; row <= sheet.rowCount; row++) {
      const value = evaluateWorkbookCell(workbook, sheet.id, toAddress(row, col), new Map())
      length = Math.max(length, String(value ?? '').length)
    }
    const width = Math.max(56, Math.min(360, length * 7.2 + 18))
    updateWorkbook(current => ({ ...current, sheets: current.sheets.map(item => item.id === sheet.id ? { ...item, columnWidths: { ...item.columnWidths, [numberToColumn(col)]: width } } : item) }))
  }, [activeCell.col, sheet, updateWorkbook, workbook])

  const beginResize = useCallback((event, axis, index) => {
    if (!sheet || readOnly) return
    event.preventDefault(); event.stopPropagation()
    const startPoint = axis === 'col' ? event.clientX : event.clientY
    const startValue = axis === 'col' ? Number(sheet.columnWidths?.[numberToColumn(index)] || 110) : Number(sheet.rowHeights?.[index] || 26)
    let finalValue = startValue
    const onMove = moveEvent => {
      const point = axis === 'col' ? moveEvent.clientX : moveEvent.clientY
      finalValue = Math.max(axis === 'col' ? 42 : 20, Math.min(axis === 'col' ? 500 : 180, startValue + point - startPoint))
      setResizePreview({ axis, index, value: finalValue })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp)
      setResizePreview(null)
      updateWorkbook(current => ({ ...current, sheets: current.sheets.map(item => item.id === sheet.id ? axis === 'col'
        ? { ...item, columnWidths: { ...item.columnWidths, [numberToColumn(index)]: finalValue } }
        : { ...item, rowHeights: { ...item.rowHeights, [index]: finalValue } }
        : item) }))
    }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
  }, [readOnly, sheet, updateWorkbook])

  const fillSelection = useCallback((axis = 'down') => {
    if (!sheet) return
    const sourceRow = selection.top
    const sourceCol = selection.left
    updateWorkbook(current => ({ ...current, sheets: current.sheets.map(item => {
      if (item.id !== sheet.id) return item
      const cells = { ...item.cells }
      forEachSelection(selection, (row, col) => {
        if ((axis === 'down' && row === sourceRow) || (axis === 'right' && col === sourceCol)) return
        const originAddress = axis === 'down' ? toAddress(sourceRow, col) : toAddress(row, sourceCol)
        const sourceCell = cells[originAddress]
        if (sourceCell) cells[toAddress(row, col)] = translateCell(sourceCell, row - (axis === 'down' ? sourceRow : row), col - (axis === 'right' ? sourceCol : col))
      })
      return { ...item, cells }
    }) }))
  }, [selection, sheet, updateWorkbook])

  const setFreeze = useCallback((rows, columns) => {
    if (!sheet) return
    updateWorkbook(current => ({ ...current, sheets: current.sheets.map(item => item.id === sheet.id ? { ...item, frozenRows: rows, frozenColumns: columns } : item) }))
  }, [sheet, updateWorkbook])

  const toggleGridlines = useCallback(() => {
    if (!sheet) return
    updateWorkbook(current => ({ ...current, sheets: current.sheets.map(item => item.id === sheet.id ? { ...item, gridlines: item.gridlines === false } : item) }))
  }, [sheet, updateWorkbook])

  const exportCsv = useCallback(() => {
    if (!sheet) return
    const lines = []
    const cache = new Map()
    for (let row = 1; row <= sheet.rowCount; row++) {
      const values = []
      for (let col = 1; col <= sheet.columnCount; col++) values.push(csvEscape(evaluateWorkbookCell(workbook, sheet.id, toAddress(row, col), cache)))
      while (values.length && values.at(-1) === '') values.pop()
      lines.push(values.join(','))
    }
    while (lines.length && !lines.at(-1)) lines.pop()
    downloadText(`${sheet.name}.csv`, `\ufeff${lines.join('\r\n')}`, 'text/csv;charset=utf-8')
  }, [sheet, workbook])

  const importCsv = useCallback((file) => {
    if (!file || !sheet || readOnly) return
    file.text().then(text => {
      const rows = parseCsv(text.replace(/^\uFEFF/, '')).slice(0, sheet.rowCount)
      updateWorkbook(current => ({ ...current, sheets: current.sheets.map(item => {
        if (item.id !== sheet.id) return item
        const cells = { ...item.cells }
        rows.forEach((values, rowOffset) => values.slice(0, item.columnCount).forEach((value, colOffset) => {
          const address = toAddress(rowOffset + 1, colOffset + 1)
          if (value === '') delete cells[address]
          else cells[address] = { input: normalizeEditorInput(value) }
        }))
        return { ...item, cells }
      }) }))
    }).catch(() => toast('CSV illisible', 'error'))
  }, [readOnly, sheet, toast, updateWorkbook])

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
  const hiddenRows = computeFilteredRows(workbook, sheet)
  const rows = Array.from({ length: sheet.rowCount }, (_, index) => index + 1).filter(row => !hiddenRows.has(row))
  const gridColumns = `46px ${columns.map(col => `${resizePreview?.axis === 'col' && resizePreview.index === col ? resizePreview.value : sheet.columnWidths?.[numberToColumn(col)] || 110}px`).join(' ')}`
  const gridRows = `26px ${rows.map(row => `${resizePreview?.axis === 'row' && resizePreview.index === row ? resizePreview.value : sheet.rowHeights?.[row] || 26}px`).join(' ')}`
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

      <SpreadsheetMenuBar
        readOnly={readOnly}
        openMenu={openMenu}
        setOpenMenu={setOpenMenu}
        actions={{
          xlsx: () => api.exportSpreadsheet(openFileId), csv: exportCsv, importCsv, undo: history.undo, redo: history.redo,
          cut: () => copySelection(true), copy: () => copySelection(false), pasteValuesOnly, find: () => setFindPanel(true),
          clear: clearSelection, clearFormatting, fillDown: () => fillSelection('down'), fillRight: () => fillSelection('right'),
          gridlines: toggleGridlines, freezeHeader: () => setFreeze(1, 0), freezeFirstColumn: () => setFreeze(0, 1), freezeSelection: () => setFreeze(Math.max(0, activeCell.row - 1), Math.max(0, activeCell.col - 1)), unfreeze: () => setFreeze(0, 0),
          rowInsert: () => mutateDimension('row', 'insert'), rowDelete: () => mutateDimension('row', 'delete'), colInsert: () => mutateDimension('col', 'insert'), colDelete: () => mutateDimension('col', 'delete'),
          note: setCellNote, dropdown: setDropdown, merge: mergeSelection, conditional: setConditionalFormat,
          chartBar: () => addChart('bar'), chartLine: () => addChart('line'), chartPie: () => addChart('pie'),
          sortAsc: () => sortSelection(1), sortDesc: () => sortSelection(-1), filter: toggleFilter,
          duplicateSheet, autoFit: () => autoFitColumn(), formulaHelp: () => setFormulaHelp(value => !value),
        }}
        checked={{ gridlines: sheet.gridlines !== false, filter: Boolean(sheet.filters) }}
      />

      {!readOnly && (
        <div className="spreadsheet-toolbar" role="toolbar" aria-label="Mise en forme du tableur">
          <button className={activeStyle.bold ? 'active' : ''} onClick={() => toggleStyle('bold')} title="Gras (Ctrl+B)"><strong>B</strong></button>
          <button className={activeStyle.italic ? 'active' : ''} onClick={() => toggleStyle('italic')} title="Italique (Ctrl+I)"><em>I</em></button>
          <button className={activeStyle.underline ? 'active' : ''} onClick={() => toggleStyle('underline')} title="Souligné (Ctrl+U)"><u>U</u></button>
          <button className={activeStyle.strike ? 'active' : ''} onClick={() => toggleStyle('strike')} title="Barré"><s>S</s></button>
          <select className="spreadsheet-font-size" value={activeStyle.fontSize || 11} onChange={event => applyStyle({ fontSize: Number(event.target.value) })} title="Taille du texte">
            {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36].map(size => <option key={size} value={size}>{size}</option>)}
          </select>
          <span className="spreadsheet-toolbar-separator" />
          {['left', 'center', 'right'].map(align => (
            <button key={align} className={activeStyle.align === align ? 'active' : ''} onClick={() => applyStyle({ align })} title={`Aligner ${align}`}>
              <Icon name={`align-${align}`} size={15} />
            </button>
          ))}
          <select value={activeStyle.valign || 'middle'} onChange={event => applyStyle({ valign: event.target.value })} title="Alignement vertical">
            <option value="top">Haut</option><option value="middle">Milieu</option><option value="bottom">Bas</option>
          </select>
          <button className={activeStyle.wrap ? 'active' : ''} onClick={() => toggleStyle('wrap')} title="Renvoyer à la ligne">↵</button>
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
          <select value={activeStyle.border || 'none'} onChange={event => applyStyle({ border: event.target.value })} title="Bordures">
            <option value="none">Sans bordure</option><option value="all">Toutes bordures</option><option value="outer">Contour</option><option value="bottom">Bordure basse</option>
          </select>
          <button className={(sheet.merges || []).some(merge => rangesOverlap(merge, selection)) ? 'active' : ''} onClick={mergeSelection} title="Fusionner ou dissocier">Fusionner</button>
          <button onClick={toggleFilter} className={sheet.filters ? 'active' : ''} title="Créer ou retirer un filtre">Filtrer</button>
          <span className="spreadsheet-toolbar-separator" />
          <button onClick={() => mutateDimension('row', 'insert')} title="Insérer une ligne">+ Ligne</button>
          <button onClick={() => mutateDimension('row', 'delete')} title="Supprimer la ligne">− Ligne</button>
          <button onClick={() => mutateDimension('col', 'insert')} title="Insérer une colonne">+ Col.</button>
          <button onClick={() => mutateDimension('col', 'delete')} title="Supprimer la colonne">− Col.</button>
          <button onClick={() => resizeColumn(-20)} title="Réduire la colonne">↤</button>
          <button onClick={() => resizeColumn(20)} title="Élargir la colonne">↦</button>
          <button onClick={() => setFormulaHelp(value => !value)} title="Aide sur les formules">fx ?</button>
          <select value={zoom} onChange={event => setZoom(Number(event.target.value))} title="Zoom">
            {[50, 75, 90, 100, 125, 150, 175, 200].map(value => <option key={value} value={value}>{value}%</option>)}
          </select>
        </div>
      )}

      {findPanel && (
        <div className="spreadsheet-findbar">
          <input autoFocus value={findText} onChange={event => setFindText(event.target.value)} onKeyDown={event => event.key === 'Enter' && findNext()} placeholder="Rechercher dans la feuille" />
          <input value={replaceText} onChange={event => setReplaceText(event.target.value)} placeholder="Remplacer par" />
          <button onClick={findNext}>Suivant</button>
          {!readOnly && <><button onClick={() => replaceCurrent(false)}>Remplacer</button><button onClick={() => replaceCurrent(true)}>Tout remplacer</button></>}
          <button onClick={() => setFindPanel(false)} aria-label="Fermer">×</button>
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

      <div className="spreadsheet-workarea">
      <div
        className={`spreadsheet-grid ${sheet.gridlines === false ? 'hide-gridlines' : ''}`}
        ref={gridRef}
        tabIndex={0}
        onKeyDown={handleGridKeyDown}
        onCopy={handleCopy}
        onPaste={handlePaste}
        style={{ gridTemplateColumns: gridColumns, gridTemplateRows: gridRows, zoom: zoom / 100 }}
        aria-label={`Feuille ${sheet.name}`}
      >
        <div className="spreadsheet-corner" style={{ gridRow: 1, gridColumn: 1 }} onMouseDown={selectAll} title="Tout sélectionner" />
        {columns.map(col => (
          <div key={`head-${col}`} style={{ gridRow: 1, gridColumn: col + 1 }} className={`spreadsheet-column-head ${selection.left <= col && selection.right >= col ? 'selected' : ''}`} onMouseDown={() => selectWholeColumn(col)} onDoubleClick={() => autoFitColumn(col)}>
            {numberToColumn(col)}
            {sheet.filters && col >= sheet.filters.range.left && col <= sheet.filters.range.right ? <button className={(sheet.filters.rules || {})[col] ? 'active' : ''} onMouseDown={event => event.stopPropagation()} onClick={() => editFilter(col)}>▾</button> : null}
            {!readOnly && <i className="spreadsheet-resize-handle col" onPointerDown={event => beginResize(event, 'col', col)} />}
          </div>
        ))}
        {rows.map((row, visibleIndex) => (
          <SpreadsheetRow
            key={row}
            row={row}
            gridRow={visibleIndex + 2}
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
            onSetValue={writeCell}
            onCommit={commitDraft}
            onCancel={() => { setDraft(stringifyInput(activeRaw)); setEditing(false) }}
            onSelectRow={selectWholeRow}
            onResizeRow={event => beginResize(event, 'row', row)}
          />
        ))}
      </div>
      {chartPanel && <SpreadsheetCharts workbook={workbook} sheet={sheet} onClose={() => setChartPanel(false)} onDelete={id => updateWorkbook(current => ({ ...current, sheets: current.sheets.map(item => item.id === sheet.id ? { ...item, charts: (item.charts || []).filter(chart => chart.id !== id) } : item) }))} />}
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
          {!readOnly && <button className="spreadsheet-add-sheet" onClick={() => duplicateSheet(sheet)} title="Dupliquer la feuille">⧉</button>}
          {!readOnly && <button className="spreadsheet-add-sheet" onClick={() => moveSheet(sheet, -1)} title="Déplacer à gauche">‹</button>}
          {!readOnly && <button className="spreadsheet-add-sheet" onClick={() => moveSheet(sheet, 1)} title="Déplacer à droite">›</button>}
          {(sheet.charts || []).length > 0 && <button className="spreadsheet-add-sheet" onClick={() => setChartPanel(value => !value)} title="Afficher les graphiques">▥</button>}
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

const SPREADSHEET_MENUS = [
  { id: 'file', label: 'Fichier', items: [
    ['xlsx', 'Télécharger au format Excel (.xlsx)'], ['csv', 'Exporter la feuille en CSV'], ['importCsv', 'Importer un CSV…', 'file'],
  ] },
  { id: 'edit', label: 'Édition', items: [
    ['undo', 'Annuler', 'Ctrl+Z'], ['redo', 'Rétablir', 'Ctrl+Y'], 'separator', ['cut', 'Couper', 'Ctrl+X'], ['copy', 'Copier', 'Ctrl+C'], ['pasteValuesOnly', 'Coller les valeurs uniquement'], 'separator', ['find', 'Rechercher et remplacer', 'Ctrl+F'], ['clear', 'Effacer le contenu'], ['clearFormatting', 'Effacer la mise en forme'], ['fillDown', 'Recopier vers le bas'], ['fillRight', 'Recopier vers la droite'],
  ] },
  { id: 'view', label: 'Affichage', items: [
    ['gridlines', 'Quadrillage', 'check'], ['freezeHeader', 'Figer la première ligne'], ['freezeFirstColumn', 'Figer la première colonne'], ['freezeSelection', 'Figer jusqu’à la sélection'], ['unfreeze', 'Ne rien figer'],
  ] },
  { id: 'insert', label: 'Insertion', items: [
    ['rowInsert', 'Insérer une ligne'], ['colInsert', 'Insérer une colonne'], ['note', 'Note de cellule'], ['dropdown', 'Liste déroulante'], ['merge', 'Fusionner / dissocier'], 'separator', ['chartBar', 'Graphique en barres'], ['chartLine', 'Graphique en courbes'], ['chartPie', 'Graphique circulaire'],
  ] },
  { id: 'format', label: 'Format', items: [
    ['conditional', 'Mise en forme conditionnelle'], ['clearFormatting', 'Effacer la mise en forme'], ['autoFit', 'Ajuster la largeur à la colonne'],
  ] },
  { id: 'data', label: 'Données', items: [
    ['sortAsc', 'Trier A → Z'], ['sortDesc', 'Trier Z → A'], ['filter', 'Créer / retirer un filtre', 'check'], ['dropdown', 'Validation par liste déroulante'],
  ] },
  { id: 'sheet', label: 'Feuille', items: [
    ['duplicateSheet', 'Dupliquer la feuille'], ['rowDelete', 'Supprimer la ligne'], ['colDelete', 'Supprimer la colonne'],
  ] },
  { id: 'help', label: 'Aide', items: [['formulaHelp', 'Fonctions et formules disponibles']] },
]

function SpreadsheetMenuBar({ readOnly, openMenu, setOpenMenu, actions, checked }) {
  useEffect(() => {
    const close = () => setOpenMenu(null)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [setOpenMenu])
  return (
    <nav className="spreadsheet-menubar" aria-label="Menus du tableur" onPointerDown={event => event.stopPropagation()}>
      {SPREADSHEET_MENUS.map(menu => (
        <div className="spreadsheet-menu" key={menu.id}>
          <button type="button" className={openMenu === menu.id ? 'active' : ''} onClick={() => setOpenMenu(openMenu === menu.id ? null : menu.id)}>{menu.label}</button>
          {openMenu === menu.id && <div className="spreadsheet-menu-popover">
            {menu.items.map((item, index) => item === 'separator' ? <hr key={index} /> : item[2] === 'file' ? (
              <label key={item[0]} className={readOnly ? 'disabled' : ''}>{item[1]}<input type="file" accept=".csv,text/csv" disabled={readOnly} onChange={event => { actions.importCsv(event.target.files?.[0]); event.target.value = ''; setOpenMenu(null) }} /></label>
            ) : (
              <button key={`${item[0]}-${index}`} type="button" disabled={readOnly && !['xlsx', 'csv', 'copy', 'find', 'gridlines', 'formulaHelp'].includes(item[0])} onClick={() => { actions[item[0]]?.(); setOpenMenu(null) }}>
                <span>{item[2] === 'check' && (checked[item[0]] ? '✓ ' : '　')}{item[1]}</span>{item[2] && item[2] !== 'check' ? <kbd>{item[2]}</kbd> : null}
              </button>
            ))}
          </div>}
        </div>
      ))}
    </nav>
  )
}

function SpreadsheetCharts({ workbook, sheet, onClose, onDelete }) {
  return (
    <aside className="spreadsheet-chart-panel">
      <header><strong>Graphiques</strong><button onClick={onClose}>×</button></header>
      {(sheet.charts || []).length === 0 ? <p>Sélectionnez une plage puis utilisez Insertion → Graphique.</p> : sheet.charts.map(chart => (
        <article key={chart.id} className="spreadsheet-chart-card">
          <div><strong>{chart.title}</strong><button onClick={() => onDelete(chart.id)} title="Supprimer">×</button></div>
          <ChartSvg workbook={workbook} sheet={sheet} chart={chart} />
        </article>
      ))}
    </aside>
  )
}

function ChartSvg({ workbook, sheet, chart }) {
  const { labels, series } = chartData(workbook, sheet, chart.range)
  const values = series.flatMap(item => item.values).filter(Number.isFinite)
  if (!values.length) return <p className="spreadsheet-chart-empty">Aucune donnée numérique dans la plage.</p>
  const colors = ['#188038', '#4285f4', '#f9ab00', '#d93025', '#9334e6']
  if (chart.type === 'pie') {
    const data = series[0]?.values.map((value, index) => ({ value: Math.max(0, value || 0), label: labels[index] })) || []
    const total = data.reduce((sum, item) => sum + item.value, 0) || 1
    let angle = -Math.PI / 2
    return <svg viewBox="0 0 360 220" role="img" aria-label={chart.title}>{data.map((item, index) => {
      const next = angle + item.value / total * Math.PI * 2
      const path = pieSlice(118, 108, 80, angle, next)
      angle = next
      return <path key={index} d={path} fill={colors[index % colors.length]}><title>{item.label}: {item.value}</title></path>
    })}</svg>
  }
  const max = Math.max(...values.map(value => Math.abs(value)), 1)
  const width = 330; const height = 175; const baseY = 190
  if (chart.type === 'line') return <svg viewBox="0 0 360 220" role="img" aria-label={chart.title}>
    <line x1="25" y1={baseY} x2="350" y2={baseY} className="chart-axis" />
    {series.map((entry, seriesIndex) => {
      const points = entry.values.map((value, index) => `${35 + index * (width / Math.max(1, labels.length - 1))},${baseY - Number(value || 0) / max * height}`).join(' ')
      return <g key={entry.name}><polyline points={points} fill="none" stroke={colors[seriesIndex % colors.length]} strokeWidth="3" />{points.split(' ').map((point, index) => { const [cx, cy] = point.split(','); return <circle key={index} cx={cx} cy={cy} r="3" fill={colors[seriesIndex % colors.length]}><title>{labels[index]}: {entry.values[index]}</title></circle> })}</g>
    })}
  </svg>
  const groupWidth = width / Math.max(1, labels.length)
  const barWidth = Math.max(3, groupWidth / Math.max(1, series.length) - 3)
  return <svg viewBox="0 0 360 220" role="img" aria-label={chart.title}><line x1="25" y1={baseY} x2="350" y2={baseY} className="chart-axis" />
    {series.flatMap((entry, seriesIndex) => entry.values.map((value, index) => <rect key={`${entry.name}-${index}`} x={28 + index * groupWidth + seriesIndex * (barWidth + 2)} y={baseY - Math.max(0, Number(value || 0)) / max * height} width={barWidth} height={Math.abs(Number(value || 0)) / max * height} fill={colors[seriesIndex % colors.length]}><title>{labels[index]} — {entry.name}: {value}</title></rect>))}
  </svg>
}

function SpreadsheetRow({
  row, gridRow, columns, workbook, sheet, cache, selection, activeAddress, editing, draft, editorRef, readOnly,
  onSelect, onHover, onStartEdit, onDraft, onSetValue, onCommit, onCancel, onSelectRow, onResizeRow,
}) {
  return (
    <>
      <div style={{ gridRow, gridColumn: 1, height: '100%' }} onMouseDown={() => onSelectRow(row)} className={`spreadsheet-row-head ${selection.top <= row && selection.bottom >= row ? 'selected' : ''}`}>{row}{!readOnly && <i className="spreadsheet-resize-handle row" onPointerDown={onResizeRow} />}</div>
      {columns.map(col => {
        const address = toAddress(row, col)
        const merge = (sheet.merges || []).find(item => cellInSelection(row, col, item))
        if (merge && (merge.top !== row || merge.left !== col)) return null
        const cell = sheet.cells?.[address] || {}
        const style = cell.style || {}
        const value = evaluateWorkbookCell(workbook, sheet.id, address, cache)
        const isActive = activeAddress === address
        const conditional = (sheet.conditionalFormats || []).find(rule => cellInSelection(row, col, rule.range) && filterMatches(value, rule))
        const borderStyle = cellBorderStyle(style)
        const frozenRow = row <= Number(sheet.frozenRows || 0)
        const frozenColumn = col <= Number(sheet.frozenColumns || 0)
        return (
          <div
            key={address}
            data-address={address}
            className={`spreadsheet-cell ${cellInSelection(row, col, selection) ? 'selected' : ''} ${isActive ? 'active' : ''} ${String(value).startsWith('#') ? 'formula-error' : ''}`}
            style={{
              gridRow,
              gridColumn: merge ? `${col + 1} / span ${merge.right - merge.left + 1}` : col + 1,
              height: '100%',
              fontWeight: style.bold ? 700 : undefined,
              fontStyle: style.italic ? 'italic' : undefined,
              fontSize: style.fontSize ? `${style.fontSize}px` : undefined,
              textDecoration: [style.underline ? 'underline' : '', style.strike ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
              textAlign: style.align || (typeof value === 'number' ? 'right' : 'left'),
              alignItems: style.valign === 'top' ? 'flex-start' : style.valign === 'bottom' ? 'flex-end' : 'center',
              backgroundColor: conditional?.fill || style.fill || undefined,
              color: conditional?.color || style.color || undefined,
              whiteSpace: style.wrap ? 'normal' : undefined,
              position: frozenRow || frozenColumn ? 'sticky' : undefined,
              top: frozenRow ? `${26 + (row - 1) * 26}px` : undefined,
              left: frozenColumn ? `${46 + frozenColumnOffset(sheet, col)}px` : undefined,
              zIndex: frozenRow && frozenColumn ? 3 : frozenRow || frozenColumn ? 2 : undefined,
              ...borderStyle,
            }}
            onMouseDown={event => onSelect(event, row, col)}
            onMouseEnter={() => onHover(row, col)}
            onDoubleClick={() => onStartEdit(row, col)}
            title={[cell.note ? `Note : ${cell.note}` : '', typeof cell.input === 'string' && cell.input.startsWith('=') ? `${cell.input} → ${formatCellValue(value, style, workbook.locale)}` : ''].filter(Boolean).join('\n') || undefined}
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
            ) : cell.validation?.type === 'list' && !readOnly && isActive ? (
              <select className="spreadsheet-cell-dropdown" value={stringifyInput(cell.input)} onMouseDown={event => event.stopPropagation()} onChange={event => onSetValue(row, col, event.target.value)}>
                <option value="" />{cell.validation.values.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : <span className={style.wrap ? 'wrap' : ''}>{formatCellValue(value, style, workbook.locale)}</span>}
            {cell.note && <i className="spreadsheet-note-mark" />}
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

function selectionToCells(sheet, selection) {
  const rows = []
  for (let row = selection.top; row <= selection.bottom; row++) {
    const cells = []
    for (let col = selection.left; col <= selection.right; col++) cells.push(structuredClone(sheet.cells?.[toAddress(row, col)] || { input: '' }))
    rows.push(cells)
  }
  return rows
}

function translateCell(cell, rowDelta, colDelta) {
  const next = structuredClone(cell)
  if (typeof next.input === 'string' && next.input.startsWith('=')) next.input = translateFormula(next.input, rowDelta, colDelta)
  return next
}

function translateFormula(formula, rowDelta, colDelta) {
  return formula.replace(/(?:(?:'[^']*(?:''[^']*)*'|[A-Za-z_][A-Za-z0-9_.]*)!)?(\$?)([A-Za-z]{1,3})(\$?)(\d+)/g, (match, absoluteCol, colText, absoluteRow, rowText) => {
    const col = columnToNumber(colText)
    const row = Number(rowText)
    const nextCol = absoluteCol ? col : col + colDelta
    const nextRow = absoluteRow ? row : row + rowDelta
    if (nextCol < 1 || nextRow < 1) return '#REF!'
    const prefixLength = match.length - (`${absoluteCol}${colText}${absoluteRow}${rowText}`).length
    return `${match.slice(0, prefixLength)}${absoluteCol}${numberToColumn(nextCol)}${absoluteRow}${nextRow}`
  })
}

function rangesOverlap(a, b) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top
}

function rangesEqual(a, b) {
  return a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.right === b.right
}

function filterMatches(value, rule) {
  const text = String(value ?? '')
  const expected = String(rule?.value ?? '')
  if (rule?.operator === 'notEmpty') return text !== ''
  if (rule?.operator === 'equals') return text.toLowerCase() === expected.toLowerCase()
  if (rule?.operator === 'greater') return Number(value) > Number(expected)
  if (rule?.operator === 'less') return Number(value) < Number(expected)
  return text.toLowerCase().includes(expected.toLowerCase())
}

function computeFilteredRows(workbook, sheet) {
  const hidden = new Set()
  const filters = sheet.filters
  if (!filters?.range || !Object.keys(filters.rules || {}).length) return hidden
  const cache = new Map()
  for (let row = filters.range.top + 1; row <= filters.range.bottom; row++) {
    const visible = Object.entries(filters.rules).every(([col, rule]) => filterMatches(evaluateWorkbookCell(workbook, sheet.id, toAddress(row, Number(col)), cache), rule))
    if (!visible) hidden.add(row)
  }
  return hidden
}

function compareValues(a, b) {
  const aNumber = Number(a); const bNumber = Number(b)
  if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber
  return String(a ?? '').localeCompare(String(b ?? ''), 'fr', { numeric: true, sensitivity: 'base' })
}

function replaceCaseInsensitive(input, search, replacement, all) {
  const pattern = new RegExp(escapeRegex(search), all ? 'gi' : 'i')
  return input.replace(pattern, replacement)
}

function uniqueSheetName(base, sheets) {
  const existing = new Set(sheets.map(item => item.name.toLowerCase()))
  let name = base.slice(0, 31)
  let index = 2
  while (existing.has(name.toLowerCase())) name = `${base.slice(0, 27)} ${index++}`.slice(0, 31)
  return name
}

function cellBorderStyle(style) {
  if (!style.border || style.border === 'none') return {}
  const border = `1px solid ${style.borderColor || '#9aa0a6'}`
  if (style.border === 'bottom') return { borderBottom: border }
  return { border: border }
}

function frozenColumnOffset(sheet, col) {
  let offset = 0
  for (let index = 1; index < col; index++) offset += Number(sheet.columnWidths?.[numberToColumn(index)] || 110)
  return offset
}

function chartData(workbook, sheet, range) {
  const cache = new Map()
  const labels = []
  for (let row = range.top + 1; row <= range.bottom; row++) labels.push(String(evaluateWorkbookCell(workbook, sheet.id, toAddress(row, range.left), cache) || row))
  const series = []
  for (let col = range.left + 1; col <= range.right; col++) {
    const name = String(evaluateWorkbookCell(workbook, sheet.id, toAddress(range.top, col), cache) || numberToColumn(col))
    const values = []
    for (let row = range.top + 1; row <= range.bottom; row++) values.push(Number(evaluateWorkbookCell(workbook, sheet.id, toAddress(row, col), cache)))
    series.push({ name, values })
  }
  return { labels, series }
}

function pieSlice(cx, cy, radius, start, end) {
  const x1 = cx + radius * Math.cos(start); const y1 = cy + radius * Math.sin(start)
  const x2 = cx + radius * Math.cos(end); const y2 = cy + radius * Math.sin(end)
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`
}

function csvEscape(value) {
  const text = String(value ?? '')
  if (!text) return ''
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function parseCsv(text) {
  const rows = []; let row = []; let value = ''; let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted && char === '"' && text[index + 1] === '"') { value += '"'; index++; continue }
    if (char === '"') { quoted = !quoted; continue }
    if (!quoted && char === ',') { row.push(value); value = ''; continue }
    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[index + 1] === '\n') index++
      row.push(value); rows.push(row); row = []; value = ''; continue
    }
    value += char
  }
  row.push(value); rows.push(row)
  return rows
}

function downloadText(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
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
          rowHeights: axis === 'row' ? shiftNumericKeys(sheet.rowHeights || {}, index, delta) : sheet.rowHeights,
          merges: (sheet.merges || []).map(range => shiftRange(range, axis, index, delta)).filter(Boolean),
          filters: sheet.filters ? { ...sheet.filters, range: shiftRange(sheet.filters.range, axis, index, delta) || sheet.filters.range } : null,
          conditionalFormats: (sheet.conditionalFormats || []).map(rule => ({ ...rule, range: shiftRange(rule.range, axis, index, delta) })).filter(rule => rule.range),
          charts: (sheet.charts || []).map(chart => ({ ...chart, range: shiftRange(chart.range, axis, index, delta) })).filter(chart => chart.range),
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

function shiftNumericKeys(values, index, delta) {
  const next = {}
  for (const [key, value] of Object.entries(values || {})) {
    const number = Number(key)
    if (delta < 0 && number === index) continue
    const shouldShift = delta > 0 ? number >= index : number > index
    next[shouldShift ? number + delta : number] = value
  }
  return next
}

function shiftRange(range, axis, index, delta) {
  if (!range) return null
  const startKey = axis === 'row' ? 'top' : 'left'
  const endKey = axis === 'row' ? 'bottom' : 'right'
  const next = { ...range }
  if (delta > 0) {
    if (index <= next[startKey]) { next[startKey]++; next[endKey]++ }
    else if (index <= next[endKey]) next[endKey]++
  } else {
    if (index < next[startKey]) { next[startKey]--; next[endKey]-- }
    else if (index <= next[endKey]) next[endKey]--
  }
  return next[endKey] >= next[startKey] ? next : null
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
