const crypto = require('crypto')
const { promisify } = require('util')
const scryptAsync = promisify(crypto.scrypt)
const MAX_CONCURRENT_KDFS = Math.max(1, Number(process.env.AUTH_KDF_CONCURRENCY) || 2)
const MAX_QUEUED_KDFS = 50
let activeKdfs = 0
const kdfQueue = []

// Paramètres volontairement plus forts que le hash historique des dossiers
// verrouillés (routes/files.js, jamais modifié) — nouvelles données, aucune
// compatibilité à préserver. N=2^17 dépasse le maxmem par défaut de Node
// (32 Mo) : `maxmem` doit être passé explicitement, sinon scrypt lève
// ERR_CRYPTO_INVALID_SCRYPT_PARAMS.
const SCRYPT_N = 131072 // 2^17
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEYLEN = 64

function scryptOpts(N, r, p) {
  return { N, r, p, maxmem: 128 * N * r * p * 2 }
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = await boundedScrypt(password, salt, KEYLEN, scryptOpts(SCRYPT_N, SCRYPT_R, SCRYPT_P))
  // Format versionné et auto-descriptif : les coûts sont stockés dans le
  // hash, donc on peut les renforcer plus tard sans invalider les anciens.
  return `scrypt$2$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash.toString('hex')}`
}

async function verifyPassword(password, storedHash) {
  if (!storedHash) return false
  const parts = String(storedHash).split('$')
  if (parts[0] !== 'scrypt' || parts[1] !== '2' || parts.length !== 7) return false
  const [, , N, r, p, salt, expected] = parts
  const actual = await boundedScrypt(password, salt, KEYLEN, scryptOpts(Number(N), Number(r), Number(p)))
  const expectedBuffer = Buffer.from(expected, 'hex')
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(expectedBuffer, actual)
}

async function boundedScrypt(password, salt, keyLength, options) {
  if (activeKdfs >= MAX_CONCURRENT_KDFS) {
    if (kdfQueue.length >= MAX_QUEUED_KDFS) {
      const error = new Error('Service d’authentification temporairement saturé')
      error.status = 503
      throw error
    }
    await new Promise(resolve => kdfQueue.push(resolve))
  }
  activeKdfs++
  try {
    return await scryptAsync(password, salt, keyLength, options)
  } finally {
    activeKdfs--
    kdfQueue.shift()?.()
  }
}

module.exports = { boundedScrypt, hashPassword, verifyPassword }
