const crypto = require('crypto')

// Paramètres volontairement plus forts que le hash historique des dossiers
// verrouillés (routes/files.js, jamais modifié) — nouvelles données, aucune
// compatibilité à préserver. N=2^17 dépasse le maxmem par défaut de Node
// (32 Mo) : `maxmem` doit être passé explicitement, sinon scryptSync lève
// ERR_CRYPTO_INVALID_SCRYPT_PARAMS.
const SCRYPT_N = 131072 // 2^17
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEYLEN = 64

function scryptOpts(N, r, p) {
  return { N, r, p, maxmem: 128 * N * r * p * 2 }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, KEYLEN, scryptOpts(SCRYPT_N, SCRYPT_R, SCRYPT_P)).toString('hex')
  // Format versionné et auto-descriptif : les coûts sont stockés dans le
  // hash, donc on peut les renforcer plus tard sans invalider les anciens.
  return `scrypt$2$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false
  const parts = String(storedHash).split('$')
  if (parts[0] !== 'scrypt' || parts[1] !== '2' || parts.length !== 7) return false
  const [, , N, r, p, salt, expected] = parts
  const actual = crypto.scryptSync(password, salt, KEYLEN, scryptOpts(Number(N), Number(r), Number(p)))
  const expectedBuffer = Buffer.from(expected, 'hex')
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(expectedBuffer, actual)
}

module.exports = { hashPassword, verifyPassword }
