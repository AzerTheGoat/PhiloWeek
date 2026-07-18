const DEFAULT_ROWS = 100
const DEFAULT_COLUMNS = 26
const MAX_ROWS = 2000
const MAX_COLUMNS = 200
const MAX_SHEETS = 20

export function isSpreadsheetFile(file) {
  if (!file || !/\.xlsx$/i.test(file.name || '') || typeof file.content !== 'string') return false
  try {
    return JSON.parse(file.content)?.philoweek_type === 'spreadsheet'
  } catch (_) {
    return false
  }
}

export function createSpreadsheetJson(title = 'Classeur') {
  const now = new Date().toISOString()
  return JSON.stringify({
    philoweek_type: 'spreadsheet',
    version: 1,
    id: makeId('wb'),
    title: String(title || 'Classeur').trim() || 'Classeur',
    locale: 'fr-FR',
    created: now,
    modified: now,
    sheets: [createBlankSheet('Feuille 1')],
  }, null, 2)
}

export function createBlankSheet(name = 'Feuille') {
  return {
    id: makeId('sheet'),
    name: String(name || 'Feuille').slice(0, 31),
    rowCount: DEFAULT_ROWS,
    columnCount: DEFAULT_COLUMNS,
    frozenRows: 1,
    frozenColumns: 1,
    columnWidths: {},
    rowHeights: {},
    cells: {},
  }
}

export function parseSpreadsheetJson(content) {
  let parsed
  try {
    parsed = JSON.parse(content || '{}')
  } catch (_) {
    throw new Error('Le classeur est illisible (JSON invalide)')
  }
  if (parsed?.philoweek_type !== 'spreadsheet') throw new Error('Ce fichier n’est pas un classeur Opuscule')
  const sheets = Array.isArray(parsed.sheets) ? parsed.sheets.slice(0, MAX_SHEETS).map((sheet, index) => normalizeSheet(sheet, index)) : []
  if (!sheets.length) sheets.push(createBlankSheet('Feuille 1'))
  return {
    ...parsed,
    version: 1,
    title: String(parsed.title || 'Classeur').slice(0, 160),
    locale: parsed.locale === 'en-US' ? 'en-US' : 'fr-FR',
    sheets,
  }
}

function normalizeSheet(sheet, index) {
  const rowCount = clampInt(sheet?.rowCount, 1, MAX_ROWS, DEFAULT_ROWS)
  const columnCount = clampInt(sheet?.columnCount, 1, MAX_COLUMNS, DEFAULT_COLUMNS)
  const cells = {}
  for (const [address, cell] of Object.entries(sheet?.cells || {})) {
    const point = parseAddress(address)
    if (!point || point.row > rowCount || point.col > columnCount || !cell || typeof cell !== 'object') continue
    const input = normalizeInput(cell.input)
    const style = normalizeStyle(cell.style)
    if (input !== '' || Object.keys(style).length) cells[toAddress(point.row, point.col)] = { input, ...(Object.keys(style).length ? { style } : {}) }
  }
  const columnWidths = {}
  for (const [key, value] of Object.entries(sheet?.columnWidths || {})) {
    const col = columnToNumber(key)
    const width = Number(value)
    if (col > 0 && col <= columnCount && Number.isFinite(width)) columnWidths[numberToColumn(col)] = Math.max(56, Math.min(360, width))
  }
  return {
    id: String(sheet?.id || makeId('sheet')),
    name: String(sheet?.name || `Feuille ${index + 1}`).replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31) || `Feuille ${index + 1}`,
    rowCount,
    columnCount,
    frozenRows: clampInt(sheet?.frozenRows, 0, rowCount, 1),
    frozenColumns: clampInt(sheet?.frozenColumns, 0, columnCount, 1),
    columnWidths,
    rowHeights: sheet?.rowHeights && typeof sheet.rowHeights === 'object' ? sheet.rowHeights : {},
    cells,
  }
}

function normalizeInput(input) {
  if (input === null || input === undefined) return ''
  if (typeof input === 'number' || typeof input === 'boolean') return input
  return String(input).slice(0, 50000)
}

function normalizeStyle(style) {
  if (!style || typeof style !== 'object') return {}
  const next = {}
  if (style.bold) next.bold = true
  if (style.italic) next.italic = true
  if (style.underline) next.underline = true
  if (['left', 'center', 'right'].includes(style.align)) next.align = style.align
  if (/^#[0-9a-f]{6}$/i.test(style.fill || '')) next.fill = style.fill
  if (/^#[0-9a-f]{6}$/i.test(style.color || '')) next.color = style.color
  if (['general', 'number', 'currency', 'percent', 'date'].includes(style.numberFormat)) next.numberFormat = style.numberFormat
  return next
}

export function serializeSpreadsheet(workbook) {
  return JSON.stringify({ ...workbook, modified: new Date().toISOString() }, null, 2)
}

export function makeId(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function numberToColumn(value) {
  let number = Number(value)
  if (!Number.isInteger(number) || number < 1) return ''
  let result = ''
  while (number > 0) {
    const remainder = (number - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    number = Math.floor((number - 1) / 26)
  }
  return result
}

export function columnToNumber(value) {
  const text = String(value || '').replace(/\$/g, '').toUpperCase()
  if (!/^[A-Z]+$/.test(text)) return 0
  let result = 0
  for (const char of text) result = result * 26 + char.charCodeAt(0) - 64
  return result
}

export function toAddress(row, col) {
  return `${numberToColumn(col)}${row}`
}

export function parseAddress(address) {
  const match = String(address || '').toUpperCase().match(/^\$?([A-Z]{1,3})\$?(\d+)$/)
  if (!match) return null
  const row = Number(match[2])
  const col = columnToNumber(match[1])
  if (!row || !col) return null
  return { row, col }
}

export function normalizeSelection(a, b = a) {
  return {
    top: Math.min(a.row, b.row),
    bottom: Math.max(a.row, b.row),
    left: Math.min(a.col, b.col),
    right: Math.max(a.col, b.col),
  }
}

export function cellInSelection(row, col, selection) {
  return row >= selection.top && row <= selection.bottom && col >= selection.left && col <= selection.right
}

export function parseLiteral(value) {
  if (typeof value !== 'string') return value
  if (value.startsWith("'")) return value.slice(1)
  const trimmed = value.trim()
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return Number(trimmed)
  if (/^(true|vrai)$/i.test(trimmed)) return true
  if (/^(false|faux)$/i.test(trimmed)) return false
  return value
}

export function formatCellValue(value, style = {}, locale = 'fr-FR') {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' && value.startsWith('#')) return value
  const format = style.numberFormat || 'general'
  try {
    if (format === 'currency' && Number.isFinite(Number(value))) {
      return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(Number(value))
    }
    if (format === 'percent' && Number.isFinite(Number(value))) {
      return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(Number(value))
    }
    if (format === 'number' && Number.isFinite(Number(value))) {
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 10 }).format(Number(value))
    }
    if (format === 'date') {
      const date = value instanceof Date ? value : new Date(value)
      if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat(locale).format(date)
    }
  } catch (_) {}
  if (typeof value === 'boolean') return value ? 'VRAI' : 'FAUX'
  return String(value)
}

export function evaluateWorkbookCell(workbook, sheetId, address, cache = new Map(), stack = new Set()) {
  const sheet = workbook.sheets.find(item => item.id === sheetId)
  if (!sheet) return '#REF!'
  const point = parseAddress(address)
  if (!point) return '#REF!'
  const normalizedAddress = toAddress(point.row, point.col)
  const key = `${sheetId}:${normalizedAddress}`
  if (cache.has(key)) return cache.get(key)
  if (stack.has(key)) return '#CYCLE!'
  stack.add(key)
  const input = sheet.cells?.[normalizedAddress]?.input ?? ''
  let result
  if (typeof input === 'string' && input.startsWith('=')) {
    try {
      const parser = new FormulaParser(workbook, sheet, input.slice(1), cache, stack)
      result = parser.parse()
    } catch (err) {
      result = err?.formulaError || '#ERREUR!'
    }
  } else {
    result = parseLiteral(input)
  }
  stack.delete(key)
  cache.set(key, result)
  return result
}

class FormulaParser {
  constructor(workbook, sheet, source, cache, stack) {
    this.workbook = workbook
    this.sheet = sheet
    this.tokens = tokenize(source)
    this.index = 0
    this.cache = cache
    this.stack = stack
  }

  parse() {
    const result = this.comparison()
    if (this.peek().type !== 'eof') this.fail('#ERREUR!')
    return scalar(result)
  }

  comparison() {
    let left = this.concat()
    while (['=', '<>', '<', '>', '<=', '>='].includes(this.peek().value)) {
      const op = this.next().value
      const right = this.concat()
      if (op === '=') left = scalar(left) === scalar(right)
      if (op === '<>') left = scalar(left) !== scalar(right)
      if (op === '<') left = scalar(left) < scalar(right)
      if (op === '>') left = scalar(left) > scalar(right)
      if (op === '<=') left = scalar(left) <= scalar(right)
      if (op === '>=') left = scalar(left) >= scalar(right)
    }
    return left
  }

  concat() {
    let left = this.additive()
    while (this.peek().value === '&') {
      this.next()
      left = String(scalar(left) ?? '') + String(scalar(this.additive()) ?? '')
    }
    return left
  }

  additive() {
    let left = this.multiplicative()
    while (this.peek().value === '+' || this.peek().value === '-') {
      const op = this.next().value
      const right = this.multiplicative()
      left = op === '+' ? numeric(left) + numeric(right) : numeric(left) - numeric(right)
    }
    return left
  }

  multiplicative() {
    let left = this.power()
    while (this.peek().value === '*' || this.peek().value === '/') {
      const op = this.next().value
      const right = this.power()
      if (op === '/' && numeric(right) === 0) this.fail('#DIV/0!')
      left = op === '*' ? numeric(left) * numeric(right) : numeric(left) / numeric(right)
    }
    return left
  }

  power() {
    let left = this.unary()
    while (this.peek().value === '^') {
      this.next()
      left = numeric(left) ** numeric(this.unary())
    }
    return left
  }

  unary() {
    if (this.peek().value === '+') { this.next(); return numeric(this.unary()) }
    if (this.peek().value === '-') { this.next(); return -numeric(this.unary()) }
    return this.primary()
  }

  primary() {
    const token = this.next()
    if (token.type === 'number' || token.type === 'string') return token.value
    if (token.value === '(') {
      const value = this.comparison()
      this.expect(')')
      return value
    }
    if (token.type === 'reference') {
      if (this.peek().value === ':') {
        this.next()
        const end = this.next()
        if (end.type !== 'reference') this.fail('#REF!')
        return this.range(token.value, end.value)
      }
      return this.reference(token.value)
    }
    if (token.type === 'identifier') {
      const name = token.value.toUpperCase()
      if (name === 'TRUE' || name === 'VRAI') return true
      if (name === 'FALSE' || name === 'FAUX') return false
      if (this.peek().value !== '(') this.fail('#NOM?')
      this.next()
      const args = []
      if (this.peek().value !== ')') {
        do {
          args.push(this.comparison())
          if (this.peek().value !== ',' && this.peek().value !== ';') break
          this.next()
        } while (true)
      }
      this.expect(')')
      return callFormula(name, args, () => this.fail('#NOM?'))
    }
    this.fail('#ERREUR!')
  }

  reference(raw) {
    const ref = splitReference(raw, this.sheet)
    const targetSheet = this.workbook.sheets.find(item => item.name.toLowerCase() === ref.sheetName.toLowerCase())
    if (!targetSheet || !parseAddress(ref.address)) this.fail('#REF!')
    return evaluateWorkbookCell(this.workbook, targetSheet.id, ref.address, this.cache, this.stack)
  }

  range(startRaw, endRaw) {
    const start = splitReference(startRaw, this.sheet)
    const end = splitReference(endRaw, this.sheet, start.sheetName)
    if (start.sheetName.toLowerCase() !== end.sheetName.toLowerCase()) this.fail('#REF!')
    const targetSheet = this.workbook.sheets.find(item => item.name.toLowerCase() === start.sheetName.toLowerCase())
    const a = parseAddress(start.address)
    const b = parseAddress(end.address)
    if (!targetSheet || !a || !b) this.fail('#REF!')
    const selection = normalizeSelection(a, b)
    if ((selection.bottom - selection.top + 1) * (selection.right - selection.left + 1) > 10000) this.fail('#LIMITE!')
    const values = []
    for (let row = selection.top; row <= selection.bottom; row++) {
      for (let col = selection.left; col <= selection.right; col++) {
        values.push(evaluateWorkbookCell(this.workbook, targetSheet.id, toAddress(row, col), this.cache, this.stack))
      }
    }
    return values
  }

  peek() { return this.tokens[this.index] }
  next() { return this.tokens[this.index++] }
  expect(value) { if (this.next().value !== value) this.fail('#ERREUR!') }
  fail(formulaError) { const error = new Error(formulaError); error.formulaError = formulaError; throw error }
}

function tokenize(source) {
  const tokens = []
  let index = 0
  while (index < source.length) {
    const rest = source.slice(index)
    const whitespace = rest.match(/^\s+/)
    if (whitespace) { index += whitespace[0].length; continue }
    const reference = rest.match(/^(?:(?:'[^']*(?:''[^']*)*'|[A-Za-z_][A-Za-z0-9_.]*)!)?\$?[A-Za-z]{1,3}\$?\d+/)
    if (reference) { tokens.push({ type: 'reference', value: reference[0] }); index += reference[0].length; continue }
    const number = rest.match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/)
    if (number) { tokens.push({ type: 'number', value: Number(number[0]) }); index += number[0].length; continue }
    if (rest[0] === '"') {
      let value = ''
      let cursor = 1
      for (; cursor < rest.length; cursor++) {
        if (rest[cursor] === '"' && rest[cursor + 1] === '"') { value += '"'; cursor++; continue }
        if (rest[cursor] === '"') break
        value += rest[cursor]
      }
      if (cursor >= rest.length) throw Object.assign(new Error('#ERREUR!'), { formulaError: '#ERREUR!' })
      tokens.push({ type: 'string', value }); index += cursor + 1; continue
    }
    const identifier = rest.match(/^[A-Za-z_À-ÿ][A-Za-z0-9_.À-ÿ]*/)
    if (identifier) { tokens.push({ type: 'identifier', value: identifier[0] }); index += identifier[0].length; continue }
    const operator = rest.match(/^(<=|>=|<>|[+\-*/^&=<>(),;:])/)
    if (operator) { tokens.push({ type: 'operator', value: operator[0] }); index += operator[0].length; continue }
    throw Object.assign(new Error('#ERREUR!'), { formulaError: '#ERREUR!' })
  }
  tokens.push({ type: 'eof', value: '' })
  return tokens
}

function splitReference(raw, currentSheet, fallbackSheetName) {
  const bang = raw.lastIndexOf('!')
  const sheetName = bang >= 0
    ? raw.slice(0, bang).replace(/^'|'$/g, '').replace(/''/g, "'")
    : fallbackSheetName || currentSheet.name
  return { sheetName, address: raw.slice(bang + 1).replace(/\$/g, '').toUpperCase() }
}

function callFormula(name, args, unknown) {
  const flat = args.flat(Infinity)
  const formulaError = flat.find(value => typeof value === 'string' && value.startsWith('#'))
  if (formulaError) return formulaError
  const numbers = flat.filter(value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value))).map(Number)
  if (name === 'SUM' || name === 'SOMME') return numbers.reduce((sum, value) => sum + value, 0)
  if (name === 'AVERAGE' || name === 'MOYENNE') return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : '#DIV/0!'
  if (name === 'MIN') return numbers.length ? Math.min(...numbers) : 0
  if (name === 'MAX') return numbers.length ? Math.max(...numbers) : 0
  if (name === 'COUNT' || name === 'NB') return numbers.length
  if (name === 'COUNTA' || name === 'NBVAL') return flat.filter(value => value !== '' && value !== null && value !== undefined).length
  if (name === 'IF' || name === 'SI') return scalar(args[0]) ? scalar(args[1]) : scalar(args[2])
  if (name === 'AND' || name === 'ET') return flat.every(Boolean)
  if (name === 'OR' || name === 'OU') return flat.some(Boolean)
  if (name === 'NOT' || name === 'NON') return !scalar(args[0])
  if (name === 'ROUND' || name === 'ARRONDI') {
    const digits = Math.max(0, Math.min(12, Math.trunc(numeric(args[1] ?? 0))))
    const factor = 10 ** digits
    return Math.round(numeric(args[0]) * factor) / factor
  }
  if (name === 'ABS') return Math.abs(numeric(args[0]))
  if (name === 'CONCAT') return flat.map(value => String(value ?? '')).join('')
  return unknown()
}

function scalar(value) {
  return Array.isArray(value) ? value[0] ?? '' : value
}

function numeric(value) {
  const current = scalar(value)
  if (typeof current === 'string' && current.startsWith('#')) throw Object.assign(new Error(current), { formulaError: current })
  const number = Number(current || 0)
  if (!Number.isFinite(number)) throw Object.assign(new Error('#VALEUR!'), { formulaError: '#VALEUR!' })
  return number
}

function clampInt(value, min, max, fallback) {
  const number = Number(value)
  return Number.isInteger(number) ? Math.max(min, Math.min(max, number)) : fallback
}
