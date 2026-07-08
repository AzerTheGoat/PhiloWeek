const express = require('express')
const { getDb } = require('../db')
const { rollbackLatestSnapshot } = require('../history')

const router = express.Router()

router.post('/rollback', (req, res) => {
  const result = rollbackLatestSnapshot(getDb(), req.user.id, {
    confirm: Boolean(req.body?.confirm),
  })

  if (!result.ok) {
    return res.status(result.status || 500).json(result)
  }

  res.json(result)
})

module.exports = router
