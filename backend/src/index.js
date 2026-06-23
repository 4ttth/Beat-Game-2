const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')

const db = require('./db')
const authRouter = require('./routes/auth')
const levelsRouter = require('./routes/levels')
const scoresRouter = require('./routes/scores')
const leaderboardRouter = require('./routes/leaderboard')
const adminRouter = require('./routes/admin')

const app = express()
const PORT = process.env.PORT || 3001

// Ensure levels directory exists
const LEVELS_DIR = path.join(__dirname, '..', 'levels')
if (!fs.existsSync(LEVELS_DIR)) fs.mkdirSync(LEVELS_DIR, { recursive: true })

app.use(cors())
app.use(express.json())

// Health check (available before DB ready)
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }))

// Routes
app.use('/api/auth', authRouter)
app.use('/api/levels', levelsRouter)
app.use('/api/scores', scoresRouter)
app.use('/api/leaderboard', leaderboardRouter)
app.use('/api/admin', adminRouter)

// Wait for DB to be ready before starting
db.ready.then(() => {
  console.log('[backend] Database initialized')

  // Seed bundled levels
  require('./seed')(db, LEVELS_DIR)

  app.listen(PORT, () => {
    console.log(`[backend] Running on http://localhost:${PORT}`)
  })
}).catch((err) => {
  console.error('[backend] Failed to initialize database:', err)
  process.exit(1)
})
