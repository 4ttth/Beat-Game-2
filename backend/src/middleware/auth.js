const db = require('../db')

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || ''
  const token = header.replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token)
  if (!session) return res.status(401).json({ error: 'Invalid or expired session' })

  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(session.user_id)
  if (!user) return res.status(401).json({ error: 'User not found' })

  req.user = user
  next()
}

module.exports = { requireAuth }
