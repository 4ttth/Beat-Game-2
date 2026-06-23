const express = require('express')
const db = require('../db')
const { requireAdmin, requireCreator } = require('../middleware/requireAdmin')

const router = express.Router()

// ── CTF Flag 2 — broken access control ────────────────────────────────────────
// GET /api/admin/backup — legacy maintenance snapshot.
// Disclosed in robots.txt and guarded only by the (forgeable) admin cookie,
// so anyone who solved the cookie challenge can read it.
router.get('/backup', requireAdmin, (req, res) => {
  return res.json({
    service: 'beat-game',
    exported_at: new Date().toISOString(),
    note: 'internal maintenance snapshot — do not expose',
    flag: 'CLCTF{r0b0t5_t0ld_y0u_s0}',
  })
})

// GET /api/admin/users
router.get('/users', requireCreator, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.created_at,
      (SELECT COUNT(*) FROM scores s WHERE s.user_id = u.id) AS score_count
    FROM users u
    ORDER BY u.created_at DESC
  `).all()
  return res.json(users)
})

// POST /api/admin/users — create a single user
router.post('/users', requireCreator, (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' })
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) return res.status(409).json({ error: 'Username already taken' })
  const result = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, password)
  return res.status(201).json({ id: result.lastInsertRowid, username })
})

// POST /api/admin/users/upload — bulk import from a JSON array [ { username, password }, ... ]
router.post('/users/upload', requireCreator, (req, res) => {
  const list = req.body
  if (!Array.isArray(list)) {
    return res.status(400).json({ error: 'Expected a JSON array of { username, password }' })
  }
  const created = []
  const failed = []
  for (const entry of list) {
    const { username, password } = entry || {}
    if (!username || !password) {
      failed.push({ username: username ?? '?', reason: 'Missing username or password' })
      continue
    }
    try {
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
      if (existing) {
        failed.push({ username, reason: 'Already exists' })
        continue
      }
      db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, password)
      created.push(username)
    } catch (e) {
      failed.push({ username, reason: e.message })
    }
  }
  return res.json({ created: created.length, failed })
})

// DELETE /api/admin/users/:id — delete user + their sessions and scores
router.delete('/users/:id', requireCreator, (req, res) => {
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id)
  db.prepare('DELETE FROM scores WHERE user_id = ?').run(user.id)
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id)
  return res.json({ deleted: true, username: user.username })
})

// GET /api/admin/levels — list all levels (no user token needed)
router.get('/levels', requireCreator, (req, res) => {
  const levels = db.prepare(`
    SELECT id, title, artist, bpm, duration, max_score, created_at, video_path
    FROM levels ORDER BY created_at DESC
  `).all()
  return res.json(
    levels.map((l) => ({
      id: l.id,
      title: l.title,
      artist: l.artist,
      bpm: l.bpm,
      duration: l.duration,
      maxScore: l.max_score,
      createdAt: l.created_at,
      videoPath: l.video_path ?? null,
    }))
  )
})

module.exports = router
