const express = require('express')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

// GET /api/leaderboard/global — top 10 users by sum of best score per level
// IMPORTANT: must be defined BEFORE /:levelId to avoid route shadowing
router.get('/global', requireAuth, (req, res) => {
  const entries = db.prepare(`
    SELECT
      u.username,
      SUM(best.best_score) AS total_score,
      COUNT(DISTINCT best.level_id) AS levels_played
    FROM users u
    JOIN (
      SELECT user_id, level_id, MAX(score) AS best_score
      FROM scores
      GROUP BY user_id, level_id
    ) best ON best.user_id = u.id
    GROUP BY u.id
    ORDER BY total_score DESC
    LIMIT 10
  `).all()

  return res.json(
    entries.map((e, i) => ({
      rank: i + 1,
      username: e.username,
      totalScore: e.total_score,
      levelsPlayed: e.levels_played,
    }))
  )
})

// GET /api/leaderboard/:levelId — top 10 for a specific level
router.get('/:levelId', requireAuth, (req, res) => {
  const entries = db.prepare(`
    SELECT
      u.username,
      s.score,
      s.accuracy,
      s.max_combo,
      s.created_at
    FROM scores s
    JOIN users u ON u.id = s.user_id
    WHERE s.level_id = ?
    ORDER BY s.score DESC
    LIMIT 10
  `).all(req.params.levelId)

  return res.json(
    entries.map((e, i) => ({
      rank: i + 1,
      username: e.username,
      score: e.score,
      accuracy: e.accuracy,
      maxCombo: e.max_combo,
    }))
  )
})

module.exports = router
