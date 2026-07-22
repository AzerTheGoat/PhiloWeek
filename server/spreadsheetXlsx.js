const ExcelJS = require('exceljs')
const JSZip = require('jszip')
const { v4: uuidv4 } = require('uuid')

const MAX_SHEETS = 20
const MAX_ROWS = 2000
const MAX_COLUMNS = 200
const MAX_CELLS = 100000
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024

function createSpreadsheetDocument(title, sheets) {
  const now = new Date().toISOString()
  return {
    philoweek_type: 'spreadsheet',
    version: 1,
    id: uuidv4(),
    title: cleanText(title || 'Classeur', 160),
    locale: 'fr-FR',
    created: now,
    modified: now,
    sheets,
  }
}

function parseSpreadsheetContent(content) {
  let document
  try { document = JSON.parse(content || '{}') }
  catch (_) { throw new Error('Le contenu du classeur est invalide') }
  if (document?.philoweek_type !== 'spreadsheet' || !Array.isArray(document.sheets)) {
    throw new Error('Ce fichier n’est pas un classeur Opuscule')
  }
  if (document.sheets.length < 1 || document.sheets.length > MAX_SHEETS) throw new Error(`Un classeur doit contenir entre 1 et ${MAX_SHEETS} feuilles`)
  let cellCount = 0
  const names = new Set()
  for (const sheet of document.sheets) {
    const name = cleanSheetName(sheet?.name)
    if (names.has(name.toLowerCase())) throw new Error('Deux feuilles portent le même nom')
    names.add(name.toLowerCase())
    const rowCount = safeInt(sheet?.rowCount, 1, MAX_ROWS, 100)
    const columnCount = safeInt(sheet?.columnCount, 1, MAX_COLUMNS, 26)
    const cells = sheet?.cells && typeof sheet.cells === 'object' ? sheet.cells : {}
    cellCount += Object.keys(cells).length
    if (cellCount > MAX_CELLS) throw new Error(`Le classeur dépasse la limite de ${MAX_CELLS} cellules renseignées`)
    sheet.name = name
    sheet.rowCount = rowCount
    sheet.columnCount = columnCount
    sheet.cells = cells
  }
  return document
}

async function spreadsheetToXlsxBuffer(content) {
  const document = parseSpreadsheetContent(content)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Opuscule'
  workbook.created = validDate(document.created) || new Date()
  workbook.modified = validDate(document.modified) || new Date()
  workbook.calcProperties.fullCalcOnLoad = true
  workbook.calcProperties.forceFullCalc = true

  for (const sourceSheet of document.sheets) {
    const worksheet = workbook.addWorksheet(sourceSheet.name, {
      views: [{
        state: 'frozen',
        xSplit: safeInt(sourceSheet.frozenColumns, 0, sourceSheet.columnCount, 1),
        ySplit: safeInt(sourceSheet.frozenRows, 0, sourceSheet.rowCount, 1),
      }],
    })
    for (let col = 1; col <= sourceSheet.columnCount; col++) {
      const key = numberToColumn(col)
      const widthPx = Number(sourceSheet.columnWidths?.[key] || 110)
      worksheet.getColumn(col).width = Math.max(8, Math.min(52, widthPx / 7))
    }
    for (const [rowKey, heightPx] of Object.entries(sourceSheet.rowHeights || {})) {
      const row = safeInt(rowKey, 1, sourceSheet.rowCount, 0)
      const height = Number(heightPx)
      if (row && Number.isFinite(height)) worksheet.getRow(row).height = Math.max(12, Math.min(180, height)) * 0.75
    }
    for (const [address, sourceCell] of Object.entries(sourceSheet.cells)) {
      const point = parseAddress(address)
      if (!point || point.row > sourceSheet.rowCount || point.col > sourceSheet.columnCount) continue
      const cell = worksheet.getCell(address)
      const input = sourceCell?.input ?? ''
      if (typeof input === 'string' && input.startsWith('=')) {
        const formula = input.slice(1)
        cell.value = isSafeExcelFormula(formula) ? { formula } : `'${input}`
      }
      else if (sourceCell?.style?.numberFormat === 'date' && typeof input === 'string' && validDate(input)) cell.value = validDate(input)
      else cell.value = input
      applyExcelStyle(cell, sourceCell?.style || {})
      if (sourceCell?.note) cell.note = String(sourceCell.note).slice(0, 5000)
      if (sourceCell?.validation?.type === 'list' && Array.isArray(sourceCell.validation.values)) {
        const formula = sourceCell.validation.values.map(value => String(value).replace(/"/g, '""')).join(',')
        cell.dataValidation = {
          type: 'list', allowBlank: true, showErrorMessage: sourceCell.validation.rejectInvalid !== false,
          errorTitle: 'Valeur invalide', error: 'Choisissez une valeur dans la liste.', formulae: [`"${formula.slice(0, 250)}"`],
        }
      }
    }
    for (const merge of Array.isArray(sourceSheet.merges) ? sourceSheet.merges : []) {
      const top = safeInt(merge?.top, 1, sourceSheet.rowCount, 0)
      const left = safeInt(merge?.left, 1, sourceSheet.columnCount, 0)
      const bottom = safeInt(merge?.bottom, top, sourceSheet.rowCount, 0)
      const right = safeInt(merge?.right, left, sourceSheet.columnCount, 0)
      if (top && left && (top !== bottom || left !== right)) worksheet.mergeCells(top, left, bottom, right)
    }
    if (sourceSheet.filters?.range) {
      const range = sourceSheet.filters.range
      worksheet.autoFilter = {
        from: { row: safeInt(range.top, 1, sourceSheet.rowCount, 1), column: safeInt(range.left, 1, sourceSheet.columnCount, 1) },
        to: { row: safeInt(range.bottom, 1, sourceSheet.rowCount, sourceSheet.rowCount), column: safeInt(range.right, 1, sourceSheet.columnCount, sourceSheet.columnCount) },
      }
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

async function xlsxBufferToSpreadsheetContent(buffer, title = 'Classeur') {
  await validateXlsxArchive(buffer)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer, { ignoreNodes: ['extLst'] })
  if (!workbook.worksheets.length) throw new Error('Le fichier Excel ne contient aucune feuille')
  if (workbook.worksheets.length > MAX_SHEETS) throw new Error(`Le fichier contient plus de ${MAX_SHEETS} feuilles`)

  let populatedCells = 0
  const sheets = workbook.worksheets.map((worksheet, sheetIndex) => {
    const rowCount = Math.max(100, Math.min(MAX_ROWS, worksheet.actualRowCount || 1))
    const columnCount = Math.max(26, Math.min(MAX_COLUMNS, worksheet.actualColumnCount || 1))
    if ((worksheet.actualRowCount || 0) > MAX_ROWS || (worksheet.actualColumnCount || 0) > MAX_COLUMNS) {
      throw new Error(`La feuille « ${worksheet.name} » dépasse ${MAX_ROWS} lignes ou ${MAX_COLUMNS} colonnes`)
    }
    const cells = {}
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > MAX_ROWS) return
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        if (colNumber > MAX_COLUMNS) return
        if (cell.isMerged && cell.master && cell.master.address !== cell.address) return
        populatedCells++
        if (populatedCells > MAX_CELLS) throw new Error(`Le classeur dépasse ${MAX_CELLS} cellules renseignées`)
        const input = excelCellInput(cell)
        const style = excelCellStyle(cell)
        const note = excelCellNote(cell)
        const validation = excelCellValidation(cell)
        if (input !== '' || Object.keys(style).length || note || validation) cells[toAddress(rowNumber, colNumber)] = {
          input,
          ...(Object.keys(style).length ? { style } : {}),
          ...(note ? { note } : {}),
          ...(validation ? { validation } : {}),
        }
      })
    })
    const columnWidths = {}
    for (let col = 1; col <= columnCount; col++) {
      const width = worksheet.getColumn(col).width
      if (Number.isFinite(width)) columnWidths[numberToColumn(col)] = Math.max(56, Math.min(360, Math.round(width * 7)))
    }
    const frozen = Array.isArray(worksheet.views) ? worksheet.views.find(view => view.state === 'frozen') : null
    const rowHeights = {}
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      if (Number.isFinite(row.height)) rowHeights[rowNumber] = Math.max(12, Math.min(180, Math.round(row.height / 0.75)))
    })
    const merges = (worksheet.model?.merges || []).map(range => parseRange(range)).filter(Boolean)
    const autoFilter = worksheet.autoFilter
    return {
      id: uuidv4(),
      name: uniqueSheetName(cleanSheetName(worksheet.name || `Feuille ${sheetIndex + 1}`), sheetIndex),
      rowCount,
      columnCount,
      frozenRows: safeInt(frozen?.ySplit, 0, rowCount, 1),
      frozenColumns: safeInt(frozen?.xSplit, 0, columnCount, 1),
      columnWidths,
      rowHeights,
      merges,
      filters: autoFilter ? { range: excelAutoFilterRange(autoFilter), rules: {} } : null,
      conditionalFormats: [],
      charts: [],
      gridlines: worksheet.views?.[0]?.showGridLines !== false,
      cells,
    }
  })

  return JSON.stringify(createSpreadsheetDocument(title, sheets), null, 2)
}

async function validateXlsxArchive(buffer) {
  let zip
  try { zip = await JSZip.loadAsync(buffer) }
  catch (_) { throw new Error('Le fichier fourni n’est pas une archive XLSX valide') }
  const entries = Object.values(zip.files)
  if (entries.length > 1500) throw new Error('Le classeur contient trop de composants internes')
  if (!zip.file('[Content_Types].xml') || !zip.file('xl/workbook.xml')) throw new Error('Le fichier fourni n’est pas un classeur XLSX valide')
  const total = entries.reduce((sum, entry) => sum + Number(entry?._data?.uncompressedSize || 0), 0)
  if (total > MAX_UNCOMPRESSED_BYTES) throw new Error('Le classeur décompressé dépasse la limite de 100 Mo')
}

function applyExcelStyle(cell, style) {
  if (style.bold || style.italic || style.underline || style.strike || style.fontSize || validHex(style.color)) {
    cell.font = {
      name: 'Aptos',
      size: safeInt(style.fontSize, 8, 36, 11),
      bold: Boolean(style.bold),
      italic: Boolean(style.italic),
      underline: style.underline ? true : undefined,
      strike: Boolean(style.strike),
      color: validHex(style.color) ? { argb: toArgb(style.color) } : undefined,
    }
  }
  if (validHex(style.fill)) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toArgb(style.fill) } }
  if (['left', 'center', 'right'].includes(style.align) || ['top', 'middle', 'bottom'].includes(style.valign) || style.wrap) {
    cell.alignment = { horizontal: style.align, vertical: style.valign || 'middle', wrapText: Boolean(style.wrap) }
  }
  if (style.border && style.border !== 'none') {
    const border = { style: 'thin', color: { argb: validHex(style.borderColor) ? toArgb(style.borderColor) : 'FFB7B7B7' } }
    if (style.border === 'all' || style.border === 'outer') cell.border = { top: border, left: border, bottom: border, right: border }
    if (style.border === 'bottom') cell.border = { bottom: border }
  }
  const numberFormats = { number: '#,##0.##########', currency: '#,##0.00 [$€-fr-FR]', percent: '0.00%', date: 'yyyy-mm-dd' }
  if (numberFormats[style.numberFormat]) cell.numFmt = numberFormats[style.numberFormat]
}

function excelCellInput(cell) {
  if (cell.formula) return `=${cell.formula}`
  const value = cell.value
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if (value.formula) return `=${value.formula}`
    if (value.richText) return value.richText.map(part => part.text || '').join('')
    if (value.text !== undefined) return String(value.text)
    if (value.error) return String(value.error)
    return cell.text || ''
  }
  return typeof value === 'number' || typeof value === 'boolean' ? value : String(value)
}

function excelCellStyle(cell) {
  const style = {}
  if (cell.font?.bold) style.bold = true
  if (cell.font?.italic) style.italic = true
  if (cell.font?.underline) style.underline = true
  if (cell.font?.strike) style.strike = true
  if (Number.isFinite(cell.font?.size) && cell.font.size !== 11) style.fontSize = Math.max(8, Math.min(36, Math.round(cell.font.size)))
  const color = fromExcelColor(cell.font?.color)
  if (color) style.color = color
  const fill = fromExcelColor(cell.fill?.fgColor)
  if (fill) style.fill = fill
  if (['left', 'center', 'right'].includes(cell.alignment?.horizontal)) style.align = cell.alignment.horizontal
  if (['top', 'middle', 'bottom'].includes(cell.alignment?.vertical)) style.valign = cell.alignment.vertical
  if (cell.alignment?.wrapText) style.wrap = true
  const sides = cell.border || {}
  if (sides.top?.style && sides.left?.style && sides.bottom?.style && sides.right?.style) style.border = 'all'
  else if (sides.bottom?.style) style.border = 'bottom'
  const borderColor = fromExcelColor(sides.bottom?.color || sides.top?.color || sides.left?.color || sides.right?.color)
  if (borderColor) style.borderColor = borderColor
  const numFmt = String(cell.numFmt || '').toLowerCase()
  if (numFmt.includes('%')) style.numberFormat = 'percent'
  else if (numFmt.includes('€') || numFmt.includes('$')) style.numberFormat = 'currency'
  else if (/[ymd]/.test(numFmt) && !/general/.test(numFmt)) style.numberFormat = 'date'
  else if (numFmt && numFmt !== 'general') style.numberFormat = 'number'
  return style
}

function excelCellNote(cell) {
  const note = cell.note
  if (!note) return ''
  if (typeof note === 'string') return note.slice(0, 5000)
  if (Array.isArray(note.texts)) return note.texts.map(item => item.text || '').join('').slice(0, 5000)
  return String(note).slice(0, 5000)
}

function excelCellValidation(cell) {
  const validation = cell.dataValidation
  if (validation?.type !== 'list' || !validation.formulae?.length) return null
  const raw = String(validation.formulae[0] || '').replace(/^"|"$/g, '')
  if (!raw || raw.startsWith('=')) return null
  const values = raw.split(',').map(value => value.replace(/""/g, '"').trim()).filter(Boolean).slice(0, 100)
  return values.length ? { type: 'list', values, rejectInvalid: validation.showErrorMessage !== false } : null
}

function parseRange(value) {
  const [from, to = from] = String(value || '').split(':')
  const a = parseAddress(from)
  const b = parseAddress(to)
  return a && b ? { top: Math.min(a.row, b.row), left: Math.min(a.col, b.col), bottom: Math.max(a.row, b.row), right: Math.max(a.col, b.col) } : null
}

function excelAutoFilterRange(autoFilter) {
  if (typeof autoFilter === 'string') return parseRange(autoFilter) || { top: 1, left: 1, bottom: 1, right: 1 }
  const from = autoFilter?.from || {}
  const to = autoFilter?.to || from
  return {
    top: safeInt(from.row, 1, MAX_ROWS, 1), left: safeInt(from.column, 1, MAX_COLUMNS, 1),
    bottom: safeInt(to.row, 1, MAX_ROWS, safeInt(from.row, 1, MAX_ROWS, 1)),
    right: safeInt(to.column, 1, MAX_COLUMNS, safeInt(from.column, 1, MAX_COLUMNS, 1)),
  }
}

function fromExcelColor(color) {
  const argb = String(color?.argb || '')
  if (!/^[0-9a-f]{8}$/i.test(argb)) return null
  return `#${argb.slice(2).toLowerCase()}`
}

function toArgb(hex) { return `FF${hex.slice(1).toUpperCase()}` }
function validHex(value) { return /^#[0-9a-f]{6}$/i.test(String(value || '')) }
function cleanText(value, max) { return String(value || '').trim().slice(0, max) || 'Classeur' }
function cleanSheetName(value) { return cleanText(value, 31).replace(/[\\/*?:[\]]/g, ' ').trim() || 'Feuille' }
function uniqueSheetName(name, index) { return index ? name.slice(0, 27) + ` ${index + 1}` : name }
function validDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date }
function safeInt(value, min, max, fallback) { const number = Number(value); return Number.isInteger(number) ? Math.max(min, Math.min(max, number)) : fallback }

function numberToColumn(value) {
  let number = value
  let result = ''
  while (number > 0) { const remainder = (number - 1) % 26; result = String.fromCharCode(65 + remainder) + result; number = Math.floor((number - 1) / 26) }
  return result
}

function columnToNumber(value) {
  let result = 0
  for (const char of String(value || '').toUpperCase()) result = result * 26 + char.charCodeAt(0) - 64
  return result
}

function parseAddress(address) {
  const match = String(address || '').match(/^([A-Z]{1,3})(\d+)$/i)
  if (!match) return null
  return { col: columnToNumber(match[1]), row: Number(match[2]) }
}

const SAFE_FORMULA_FUNCTIONS = new Set([
  'SUM', 'SOMME', 'AVERAGE', 'MOYENNE', 'MIN', 'MAX', 'COUNT', 'NB',
  'COUNTA', 'NBVAL', 'IF', 'SI', 'AND', 'ET', 'OR', 'OU', 'NOT', 'NON',
  'ROUND', 'ARRONDI', 'ROUNDUP', 'ARRONDI.SUP', 'ROUNDDOWN', 'ARRONDI.INF',
  'ABS', 'SQRT', 'RACINE', 'POWER', 'PUISSANCE', 'MOD', 'CONCAT',
  'CONCATENATE', 'CONCATENER', 'LEFT', 'GAUCHE', 'RIGHT', 'DROITE', 'MID',
  'STXT', 'LEN', 'NBCAR', 'LOWER', 'MINUSCULE', 'UPPER', 'MAJUSCULE',
  'TRIM', 'SUPPRESPACE', 'TODAY', 'AUJOURDHUI', 'DATE', 'YEAR', 'ANNEE',
  'MONTH', 'MOIS', 'DAY', 'JOUR', 'COUNTIF', 'NB.SI', 'SUMIF', 'SOMME.SI',
])

function isSafeExcelFormula(formula) {
  const value = String(formula || '')
  if (!value || value.length > 8192) return false
  if (/\[|\]|https?:|file:|\\\\|\||\b(DDE|WEBSERVICE|HYPERLINK|RTD|CALL|EXEC|REGISTER)\b/i.test(value)) return false
  const functionPattern = /([A-Za-zÀ-ÿ.]+)\s*\(/g
  let match
  while ((match = functionPattern.exec(value)) !== null) {
    if (!SAFE_FORMULA_FUNCTIONS.has(match[1].toUpperCase())) return false
  }
  return true
}

function toAddress(row, col) { return `${numberToColumn(col)}${row}` }

module.exports = {
  createSpreadsheetDocument,
  parseSpreadsheetContent,
  spreadsheetToXlsxBuffer,
  xlsxBufferToSpreadsheetContent,
}
