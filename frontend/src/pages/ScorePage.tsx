import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useGameStore } from '../stores/gameStore'
import './ScorePage.css'

function getRank(accuracy: number): { rank: string; color: string } {
  if (accuracy >= 95) return { rank: 'S', color: '#ffff00' }
  if (accuracy >= 80) return { rank: 'A', color: '#00f5ff' }
  if (accuracy >= 65) return { rank: 'B', color: '#00ff88' }
  if (accuracy >= 50) return { rank: 'C', color: '#ff9900' }
  return { rank: 'D', color: '#ff0044' }
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
}
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
}

export default function ScorePage() {
  const navigate = useNavigate()
  const result = useGameStore((s) => s.lastResult)

  if (!result) {
    navigate('/')
    return null
  }

  const rank = getRank(result.accuracy)
  const totalHits = result.perfectCount + result.goodCount + result.okCount
  const total = result.totalBeats || 1

  return (
    <motion.div
      className="score-page page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* BG orbs */}
      <div className="score-orb score-orb-1" />
      <div className="score-orb score-orb-2" />

      <motion.div
        className="score-content"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Rank badge */}
        <motion.div className="rank-badge" variants={itemVariants}>
          <span className="rank-letter" style={{ color: rank.color, textShadow: `0 0 30px ${rank.color}` }}>
            {rank.rank}
          </span>
        </motion.div>

        {/* Level name */}
        <motion.h2 className="score-level-title" variants={itemVariants}>
          {result.levelTitle}
        </motion.h2>

        {/* Score */}
        <motion.div className="score-big" variants={itemVariants}>
          <span className="score-label">SCORE</span>
          <span className="score-number neon-text-cyan">
            {result.score.toLocaleString()}
          </span>
        </motion.div>

        {/* Stats grid */}
        <motion.div className="score-stats" variants={itemVariants}>
          <div className="stat-item">
            <span className="stat-value" style={{ color: 'var(--accent-cyan)' }}>{result.accuracy}%</span>
            <span className="stat-label">Accuracy</span>
          </div>
          <div className="stat-item">
            <span className="stat-value" style={{ color: 'var(--accent-yellow)' }}>{result.maxCombo}</span>
            <span className="stat-label">Max Combo</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{totalHits}/{total}</span>
            <span className="stat-label">Hits</span>
          </div>
        </motion.div>

        {/* Breakdown */}
        <motion.div className="score-breakdown" variants={itemVariants}>
          <BreakdownBar label="PERFECT" count={result.perfectCount} total={total} color="var(--accent-cyan)" />
          <BreakdownBar label="GOOD"    count={result.goodCount}    total={total} color="var(--accent-green)" />
          <BreakdownBar label="OK"      count={result.okCount}      total={total} color="var(--accent-yellow)" />
          <BreakdownBar label="MISS"    count={result.missCount}    total={total} color="var(--accent-red)" />
        </motion.div>

        {/* Actions */}
        <motion.div className="score-actions" variants={itemVariants}>
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/game/${result.levelId}`, { replace: true })}
          >
            Play Again
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => navigate(`/leaderboard/${result.levelId}`)}
          >
            Leaderboard
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/')}>
            Level Select
          </button>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

function BreakdownBar({
  label, count, total, color,
}: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="breakdown-row">
      <span className="breakdown-label" style={{ color }}>{label}</span>
      <div className="breakdown-bar-bg">
        <motion.div
          className="breakdown-bar-fill"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
        />
      </div>
      <span className="breakdown-count">{count}</span>
    </div>
  )
}
