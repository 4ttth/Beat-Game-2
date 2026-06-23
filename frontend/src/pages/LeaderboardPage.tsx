import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { api, LeaderboardEntry, GlobalEntry, Level } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import './LeaderboardPage.css'

export default function LeaderboardPage() {
  const { levelId } = useParams<{ levelId?: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const level = location.state?.level as Level | undefined

  const isGlobal = !levelId
  const [entries, setEntries] = useState<LeaderboardEntry[] | GlobalEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        if (isGlobal) {
          setEntries(await api.getGlobalLeaderboard())
        } else {
          setEntries(await api.getLevelLeaderboard(Number(levelId)))
        }
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [levelId, isGlobal])

  const listVariants = {
    visible: { transition: { staggerChildren: 0.06 } },
    hidden: {},
  }
  const rowVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.3 } },
  }

  return (
    <motion.div
      className="lb-page page page-scrollable"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.25 }}
    >
      <header className="lb-header">
        <button className="btn btn-secondary" onClick={() => navigate(-1)}>← Back</button>
        <h1 className="lb-title neon-text-cyan">
          {isGlobal ? 'Global Leaderboard' : `${level?.title ?? 'Level'} — Top Scores`}
        </h1>
        {!isGlobal && (
          <button className="btn btn-secondary" onClick={() => navigate('/leaderboard')}>
            Global Board
          </button>
        )}
      </header>

      <div className="lb-content">
        {loading ? (
          <div className="lb-loading">
            <div className="ls-spinner" />
          </div>
        ) : entries.length === 0 ? (
          <div className="lb-empty">
            <p>No scores yet — be the first!</p>
          </div>
        ) : (
          <motion.div
            className="lb-list"
            variants={listVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Table header */}
            <div className="lb-row lb-row-header">
              <span className="lb-rank">#</span>
              <span className="lb-username">Player</span>
              {isGlobal ? (
                <>
                  <span className="lb-score">Total Score</span>
                  <span className="lb-extra">Levels</span>
                </>
              ) : (
                <>
                  <span className="lb-score">Score</span>
                  <span className="lb-extra">Accuracy</span>
                  <span className="lb-extra">Combo</span>
                </>
              )}
            </div>

            {isGlobal
              ? (entries as GlobalEntry[]).map((e, i) => (
                  <motion.div
                    key={i}
                    className={`lb-row ${e.username === user?.username ? 'lb-row-me' : ''}`}
                    variants={rowVariants}
                  >
                    <span className={`lb-rank ${i < 3 ? `rank-top-${i + 1}` : ''}`}>{i + 1}</span>
                    <span className="lb-username">{e.username}</span>
                    <span className="lb-score">{e.totalScore.toLocaleString()}</span>
                    <span className="lb-extra">{e.levelsPlayed}</span>
                  </motion.div>
                ))
              : (entries as LeaderboardEntry[]).map((e, i) => (
                  <motion.div
                    key={i}
                    className={`lb-row ${e.username === user?.username ? 'lb-row-me' : ''}`}
                    variants={rowVariants}
                  >
                    <span className={`lb-rank ${i < 3 ? `rank-top-${i + 1}` : ''}`}>{i + 1}</span>
                    <span className="lb-username">{e.username}</span>
                    <span className="lb-score">{e.score.toLocaleString()}</span>
                    <span className="lb-extra">{e.accuracy}%</span>
                    <span className="lb-extra">{e.maxCombo}x</span>
                  </motion.div>
                ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
