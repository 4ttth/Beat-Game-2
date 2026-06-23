import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { api, Level } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import { preloadLevelAssets } from '../utils/levelAssetCache'
import './LevelSelectPage.css'

export default function LevelSelectPage() {
  const [levels, setLevels] = useState<Level[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingLevel, setLoadingLevel] = useState<Level | null>(null)
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const fetchLevels = async () => {
    try {
      const data = await api.getLevels()
      setLevels(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLevels() }, [])

  const handleLogout = () => { logout(); navigate('/auth') }

  const FLAG3_THRESHOLD = 670_000_000_000
  const hasFlag3 = levels.some(l => (l.personalBest ?? 0) >= FLAG3_THRESHOLD)

  const handlePlayLevel = async (level: Level) => {
    try {
      setLoadingLevel(level)
      // Prefetch full level details from the verbose endpoint (see Flag 2).
      // The response carries more than we render here.
      api.getLevel(level.id).catch(() => {})
      await preloadLevelAssets(level)
      navigate(`/game/${level.id}`, { state: { level } })
    } catch (error) {
      console.error('Failed to preload level assets:', error)
      navigate(`/game/${level.id}`, { state: { level } })
    } finally {
      setLoadingLevel(null)
    }
  }

  return (
    <div className="level-select-page page page-scrollable">
      {/* Header */}
      <header className="ls-header">
        <h1 className="ls-logo neon-text-cyan">RHYTHM</h1>
        <nav className="ls-nav">
          <button className="btn btn-secondary" onClick={() => navigate('/leaderboard')}>
            Global Board
          </button>
          <div className="ls-user-info">
            <span className="ls-username">{user?.username}</span>
            <button className="btn btn-danger" onClick={handleLogout}>Logout</button>
          </div>
        </nav>
      </header>

      {/* Flag 3 banner — only visible after Burp Suite score injection */}
      {hasFlag3 && (
        <div className="ls-flag-banner">
          <span className="ls-flag-label">SCORE ACHIEVED</span>
          <span className="ls-flag-value">CLCTF&#123;w0w_g00d_sk1ll5&#125;</span>
        </div>
      )}

      {/* Level Grid */}
      <main className="ls-main">
        <motion.h2
          className="ls-section-title"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          Select a Level
        </motion.h2>

        {loading ? (
          <div className="ls-loading">
            <div className="ls-spinner" />
            <span>Loading levels...</span>
          </div>
        ) : levels.length === 0 ? (
          <div className="ls-empty">
            <p>No levels yet. Upload one to get started!</p>
          </div>
        ) : (
          <motion.div
            className="ls-grid"
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.07 } },
              hidden: {},
            }}
          >
            {levels.map((level) => (
              <motion.div
                key={level.id}
                className="ls-card card"
                variants={{
                  hidden: { opacity: 0, y: 30 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
                }}
                whileHover={{ scale: 1.03, y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handlePlayLevel(level)}
              >
                <div className="ls-card-bpm">{level.bpm} BPM</div>
                <h3 className="ls-card-title">{level.title}</h3>
                <p className="ls-card-artist">{level.artist}</p>
                <div className="ls-card-meta">
                  <span className="ls-card-duration">{formatTime(level.duration)}</span>
                  <span className="ls-card-maxscore">Max: {level.maxScore.toLocaleString()}</span>
                </div>
                {level.personalBest != null && (
                  <div className="ls-card-pb">
                    Your Best: <strong>{level.personalBest.toLocaleString()}</strong>
                  </div>
                )}
                <div className="ls-card-actions">
                  <button
                    className="btn btn-primary ls-play-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      handlePlayLevel(level)
                    }}
                  >
                    Play
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/leaderboard/${level.id}`, { state: { level } })
                    }}
                  >
                    Scores
                  </button>
                </div>
                {/* Animated card glow */}
                <div className="ls-card-glow" />
              </motion.div>
            ))}
          </motion.div>
        )}
      </main>

      <AnimatePresence>
        {loadingLevel && (
          <motion.div
            className="ls-level-loading-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="ls-level-loading-card card"
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              <div className="ls-spinner" />
              <p className="ls-level-loading-title">Level loading</p>
              <p className="ls-level-loading-text">Caching audio and video for {loadingLevel.title}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
