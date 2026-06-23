const express = require('express')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

// POST /api/scores
router.post('/', requireAuth, (req, res) => {
  const {
    levelId, score, accuracy, maxCombo,
    perfectCount, goodCount, okCount, missCount,
  } = req.body

  if (!levelId || score === undefined) {
    return res.status(400).json({ error: 'levelId and score are required' })
  }

  const level = db.prepare('SELECT id FROM levels WHERE id = ?').get(levelId)
  if (!level) return res.status(404).json({ error: 'Level not found' })

  const result = db.prepare(`
    INSERT INTO scores (user_id, level_id, score, accuracy, max_combo,
      perfect_count, good_count, ok_count, miss_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id, levelId, score, accuracy ?? 0, maxCombo ?? 0,
    perfectCount ?? 0, goodCount ?? 0, okCount ?? 0, missCount ?? 0
  )

  return res.status(201).json({ id: result.lastInsertRowid })
})

module.exports = router
