const yauzl = require('yauzl')

const MAX_ENTRIES = 2000
const MAX_ENTRY_BYTES = 25 * 1024 * 1024
const MAX_TOTAL_BYTES = 250 * 1024 * 1024
const MAX_COMPRESSION_RATIO = 100

function readBoundedZip(filePath, { accept } = {}) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: true, validateEntrySizes: true }, (openError, zip) => {
      if (openError) return reject(uploadError('Archive ZIP invalide'))
      const entries = []
      let entryCount = 0
      let totalBytes = 0
      let settled = false

      const fail = (error) => {
        if (settled) return
        settled = true
        try { zip.close() } catch (_) {}
        reject(error)
      }

      zip.on('error', () => fail(uploadError('Archive ZIP corrompue')))
      zip.on('end', () => {
        if (settled) return
        settled = true
        resolve(entries)
      })

      zip.on('entry', entry => {
        entryCount++
        if (entryCount > MAX_ENTRIES) return fail(uploadError(`L'archive dépasse ${MAX_ENTRIES} entrées`))

        const relativePath = normalizeEntryPath(entry.fileName)
        if (!relativePath) return fail(uploadError('Chemin dangereux détecté dans le ZIP'))
        const isDirectory = /\/$/.test(relativePath)
        if (isDirectory || (accept && !accept(relativePath))) {
          zip.readEntry()
          return
        }

        const uncompressed = Number(entry.uncompressedSize || 0)
        const compressed = Number(entry.compressedSize || 0)
        if (uncompressed > MAX_ENTRY_BYTES) return fail(uploadError(`Entrée trop grande : ${relativePath}`))
        if (uncompressed / Math.max(1, compressed) > MAX_COMPRESSION_RATIO) {
          return fail(uploadError(`Ratio de compression suspect : ${relativePath}`))
        }
        if (totalBytes + uncompressed > MAX_TOTAL_BYTES) return fail(uploadError('Archive décompressée trop volumineuse'))

        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) return fail(uploadError(`Impossible de lire ${relativePath}`))
          const chunks = []
          let actualBytes = 0
          stream.on('data', chunk => {
            actualBytes += chunk.length
            if (actualBytes > MAX_ENTRY_BYTES || totalBytes + actualBytes > MAX_TOTAL_BYTES) {
              stream.destroy(uploadError(`Limite de décompression dépassée : ${relativePath}`))
              return
            }
            chunks.push(chunk)
          })
          stream.on('error', error => fail(error.status ? error : uploadError(`Décompression impossible : ${relativePath}`)))
          stream.on('end', () => {
            totalBytes += actualBytes
            entries.push({ relativePath, buffer: Buffer.concat(chunks, actualBytes) })
            zip.readEntry()
          })
        })
      })

      zip.readEntry()
    })
  })
}

function normalizeEntryPath(value) {
  const input = String(value || '').replace(/\\/g, '/')
  if (!input || input.startsWith('/') || /^[a-zA-Z]:/.test(input) || input.includes('\0')) return null
  const parts = input.split('/')
  if (parts.some(part => part === '..')) return null
  return parts.filter(part => part && part !== '.').join('/') + (input.endsWith('/') ? '/' : '')
}

function uploadError(message) {
  const error = new Error(message)
  error.status = 413
  error.code = 'UNSAFE_ZIP'
  return error
}

module.exports = { readBoundedZip, normalizeEntryPath }
