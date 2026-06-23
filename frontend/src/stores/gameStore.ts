import { create } from 'zustand'

export type HitRating = 'perfect' | 'good' | 'ok' | 'miss'

export interface ScoreResult {
  levelId: number
  levelTitle: string
  score: number
  accuracy: number
  maxCombo: number
  perfectCount: number
  goodCount: number
  okCount: number
  missCount: number
  totalBeats: number
}

interface GameState {
  score: number
  streak: number
  multiplier: number
  maxCombo: number
  perfectCount: number
  goodCount: number
  okCount: number
  missCount: number
  totalBeats: number
  lastResult: ScoreResult | null

  addHit: (rating: HitRating, basePoints: number) => void
  setTotalBeats: (n: number) => void
  setLastResult: (r: ScoreResult) => void
  reset: () => void
}

const STREAK_THRESHOLDS = [5, 10, 15] // hits needed for 2x, 3x, 4x

function getMultiplier(streak: number): number {
  if (streak >= STREAK_THRESHOLDS[2]) return 4
  if (streak >= STREAK_THRESHOLDS[1]) return 3
  if (streak >= STREAK_THRESHOLDS[0]) return 2
  return 1
}

export const useGameStore = create<GameState>()((set, get) => ({
  score: 0,
  streak: 0,
  multiplier: 1,
  maxCombo: 0,
  perfectCount: 0,
  goodCount: 0,
  okCount: 0,
  missCount: 0,
  totalBeats: 0,
  lastResult: null,

  addHit: (rating, basePoints) => {
    const state = get()
    if (rating === 'miss') {
      set({
        missCount: state.missCount + 1,
        streak: 0,
        multiplier: 1,
      })
      return
    }
    const newStreak = state.streak + 1
    const newMultiplier = getMultiplier(newStreak)
    const points = basePoints * newMultiplier
    const newMax = Math.max(state.maxCombo, newStreak)
    set({
      score: state.score + points,
      streak: newStreak,
      multiplier: newMultiplier,
      maxCombo: newMax,
      perfectCount: rating === 'perfect' ? state.perfectCount + 1 : state.perfectCount,
      goodCount:    rating === 'good'    ? state.goodCount + 1    : state.goodCount,
      okCount:      rating === 'ok'      ? state.okCount + 1      : state.okCount,
    })
  },

  setTotalBeats: (n) => set({ totalBeats: n }),

  setLastResult: (r) => set({ lastResult: r }),

  reset: () => set({
    score: 0,
    streak: 0,
    multiplier: 1,
    maxCombo: 0,
    perfectCount: 0,
    goodCount: 0,
    okCount: 0,
    missCount: 0,
    totalBeats: 0,
  }),
}))
