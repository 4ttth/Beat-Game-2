const ADMIN_COOKIE_NAME   = 'beat_game_admin'
const ADMIN_SECRET        = process.env.ADMIN_SECRET   || 'CLCTF{wh0_w4ntz_c00ki3s}'

const CREATOR_COOKIE_NAME = 'beat_game_creator'
const CREATOR_SECRET      = process.env.CREATOR_SECRET || 'beats-creator-2026'

function parseCookies(req) {
  const header = req.headers.cookie || ''
  return header.split(';').reduce((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split('=')
    if (!rawKey) return acc
    acc[rawKey] = decodeURIComponent(rawValue.join('=') || '')
    return acc
  }, {})
}

function requireAdmin(req, res, next) {
  const cookies = parseCookies(req)
  if (cookies[ADMIN_COOKIE_NAME] !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Admin access required' })
  }
  return next()
}

function requireCreator(req, res, next) {
  const cookies = parseCookies(req)
  if (cookies[CREATOR_COOKIE_NAME] !== CREATOR_SECRET) {
    return res.status(403).json({ error: 'Creator access required' })
  }
  return next()
}

module.exports = {
  parseCookies,
  ADMIN_COOKIE_NAME,   ADMIN_SECRET,   requireAdmin,
  CREATOR_COOKIE_NAME, CREATOR_SECRET, requireCreator,
}
