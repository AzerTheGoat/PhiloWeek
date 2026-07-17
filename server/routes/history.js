const express = require('express')
const { getDb } = require('../db')
const { rollbackLatestSnapshot, redoLatestSnapshot } = require('../history')

const router = express.Router()

function sendRestoreResult(res, result) {
  if (!result.ok) return res.status(result.status || 500).json(result)
  return res.json(result)
}

router.post('/undo', (req, res) => {
  const result = rollbackLatestSnapshot(getDb(), req.user.id, {
    confirm: Boolean(req.body?.confirm),
  })
  return sendRestoreResult(res, result)
})

router.post('/redo', (req, res) => {
  const result = redoLatestSnapshot(getDb(), req.user.id, {
    confirm: Boolean(req.body?.confirm),
  })
  return sendRestoreResult(res, result)
})

// Backward compatibility for clients deployed before the undo/redo split.
router.post('/rollback', (req, res) => {
  const result = rollbackLatestSnapshot(getDb(), req.user.id, {
    confirm: Boolean(req.body?.confirm),
  })
  return sendRestoreResult(res, result)
})

module.exports = router
