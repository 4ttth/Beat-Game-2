const express = require('express')
const { v4: uuidv4 } = require('uuid')
const db = require('../db')
const {
  parseCookies,
  ADMIN_COOKIE_NAME,   ADMIN_SECRET,
  CREATOR_COOKIE_NAME, CREATOR_SECRET,
} = require('../middleware/requireAdmin')

const router = express.Router()

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 1000 * 60 * 60 * 24 * 7,
}

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' })
  }
  if (username.length < 2 || username.length > 32) {
    return res.status(400).json({ error: 'Username must be 2–32 characters' })
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) return res.status(409).json({ error: 'Username already taken' })

  const result = db
    .prepare('INSERT INTO users (username, password) VALUES (?, ?)')
    .run(username, password)

  const token = uuidv4()
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, result.lastInsertRowid)

  return res.status(201).json({
    token,
    user: { id: result.lastInsertRowid, username },
  })
})

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' })
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid username or password' })
  }

  const token = uuidv4()
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id)

  return res.json({
    token,
    user: { id: user.id, username: user.username },
  })
})

// ── CTF admin cookie (flag = CLCTF{wh0_w4ntz_c00ki3s}) ──────────────────────

// POST /api/auth/admin-login
router.post('/admin-login', (req, res) => {
  const { secret } = req.body
  if (!secret) return res.status(400).json({ error: 'Secret is required' })
  if (secret !== ADMIN_SECRET) return res.status(401).json({ error: 'Invalid admin secret' })
  res.cookie(ADMIN_COOKIE_NAME, ADMIN_SECRET, COOKIE_OPTS)
  return res.json({ admin: true })
})

// POST /api/auth/admin-logout
router.post('/admin-logout', (req, res) => {
  res.clearCookie(ADMIN_COOKIE_NAME, { path: '/' })
  return res.json({ admin: false })
})

// GET /api/auth/admin-status
router.get('/admin-status', (req, res) => {
  const cookies = parseCookies(req)
  return res.json({ admin: cookies[ADMIN_COOKIE_NAME] === ADMIN_SECRET })
})

// ── Creator cookie (challenge creator / real admin) ───────────────────────────

// POST /api/auth/creator-login
router.post('/creator-login', (req, res) => {
  const { secret } = req.body
  if (!secret) return res.status(400).json({ error: 'Secret is required' })
  if (secret !== CREATOR_SECRET) return res.status(401).json({ error: 'Invalid creator secret' })
  res.cookie(CREATOR_COOKIE_NAME, CREATOR_SECRET, COOKIE_OPTS)
  return res.json({ creator: true })
})

// POST /api/auth/creator-logout
router.post('/creator-logout', (req, res) => {
  res.clearCookie(CREATOR_COOKIE_NAME, { path: '/' })
  return res.json({ creator: false })
})

// GET /api/auth/creator-status
router.get('/creator-status', (req, res) => {
  const cookies = parseCookies(req)
  return res.json({ creator: cookies[CREATOR_COOKIE_NAME] === CREATOR_SECRET })
})

module.exports = router
