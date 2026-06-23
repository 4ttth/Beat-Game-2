import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import gsap from 'gsap'
import { api, Beat, Level } from '../api/client'
import { GameClock } from '../engine/GameClock'
import { BeatScheduler, getRating, ScheduledBeat } from '../engine/BeatScheduler'
import { useGameStore } from '../stores/gameStore'
import { useAuthStore } from '../stores/authStore'
import { BackgroundVideo } from '../components/BackgroundVideo'
import { getCachedLevelAssets, preloadLevelAssets } from '../utils/levelAssetCache'
import './GamePage.css'

// ── Constants ─────────────────────────────────────────────────────────────────
const LANE_KEYS  = ['d', 'f', 'j', 'k']
const LANE_COLORS = ['#00f5ff', '#ff00ff', '#00ff88', '#ffaa00']
const BASE_POINTS: Record<string, number> = { perfect: 300, good: 150, ok: 75 }

// Guitar Hero scroll: notes travel this many px per second
// LOOKAHEAD = 2s, so at start a note is SCROLL_SPEED*2 px above the hit line
const SCROLL_SPEED = 340

// Hit line is this many px from the BOTTOM of the lane element
const HIT_LINE_BOTTOM = 80

// ── Feedback item ────────────────────────────────────────────────────────────
interface Feedback {
  id: number
  lane: number
  rating: 'perfect' | 'good' | 'ok' | 'miss' | 'hold'
}

// ── Hold tracking ─────────────────────────────────────────────────────────────
interface HoldState {
  beat: ScheduledBeat
  pressTime: number
}

// ── Particle pool ─────────────────────────────────────────────────────────────
const POOL_SIZE = 60

// ─────────────────────────────────────────────────────────────────────────────
export default function GamePage() {
  const { levelId }  = useParams<{ levelId: string }>()
  const location     = useLocation()
  const navigate     = useNavigate()

  const levelFromState = location.state?.level as Level | undefined
  const [level, setLevel]           = useState<Level | null>(levelFromState ?? null)
  const [cachedVideoUrl, setCachedVideoUrl] = useState<string | null>(null)
  const [cachedVideoType, setCachedVideoType] = useState<string | null>(null)
  const [phase, setPhase]           = useState<'loading' | 'countdown' | 'playing' | 'ended'>('loading')
  const [countdown, setCountdown]   = useState(3)
  const [feedbacks, setFeedbacks]   = useState<Feedback[]>([])
  const [displayScore, setDisplayScore] = useState(0)
  const [displayStreak, setDisplayStreak] = useState(0)
  const [displayMult, setDisplayMult]   = useState(1)

  const feedbackId   = useRef(0)
  const gameRef      = useRef<HTMLDivElement>(null)
  const bgRef        = useRef<HTMLDivElement>(null)
  const laneRefs     = useRef<(HTMLDivElement | null)[]>([null, null, null, null])
  const hitZoneRefs  = useRef<(HTMLDivElement | null)[]>([null, null, null, null])

  // Imperative beat DOM — keyed by beat id
  const beatEls      = useRef<Map<number, HTMLDivElement>>(new Map())

  // Particle pool
  const particles    = useRef<HTMLDivElement[]>([])
  const particleIdx  = useRef(0)

  // Game engine refs
  const clockRef     = useRef<GameClock | null>(null)
  const scheduler    = useRef(new BeatScheduler())
  const rafId        = useRef(0)
  const gameEnded    = useRef(false)
  const audioBuffer  = useRef<AudioBuffer | null>(null)

  // Active hold per lane: tracks beat + press start time
  const activeHold    = useRef<(HoldState | null)[]>([null, null, null, null])

  // Flag 4 — prevent double-trigger
  const flagTriggered = useRef(false)

  // Stable refs for values accessed in game-loop closures
  const levelRef        = useRef<Level | null>(null)
  const displayMultRef  = useRef(1)
  const displayStreakRef = useRef(0)
  const lastBeatIdx     = useRef(-1)

  // We keep refs to values that must be readable from game-loop closures without staleness
  const phaseRef     = useRef<'loading' | 'countdown' | 'playing' | 'ended'>('loading')
  phaseRef.current      = phase
  levelRef.current      = level
  displayMultRef.current  = displayMult
  displayStreakRef.current = displayStreak

  const { addHit, reset, setTotalBeats, setLastResult } = useGameStore()

  // ── Flag 4 ───────────────────────────────────────────────────────
  function triggerFlagEffect() {
    if (flagTriggered.current || !gameRef.current) return
    flagTriggered.current = true

    const FLAG   = 'CLCTF{This_Is_Fine_67}'
    const COLORS = ['#00f5ff', '#ff00ff', '#00ff88', '#ffaa00']
    const chars  = FLAG.split('')   // 22 chars

    // 1. Replace D/F/J/K fret labels with the first 4 flag characters
    document.querySelectorAll<HTMLElement>('.hz-key').forEach((el, i) => {
      if (i < 4) {
        el.textContent = chars[i]
        el.classList.add('flag-key-active')
      }
    })

    // 2. 22-column visual overlay — one column per flag character
    const overlay = document.createElement('div')
    overlay.className = 'flag-highway-overlay'
    overlay.id = 'flag-overlay'

    const BEATS_PER_COL = 14
    chars.forEach((char, col) => {
      const color = COLORS[col % 4]
      const colEl = document.createElement('div')
      colEl.className = 'flag-col'

      // Fret label at the hit line
      const fret = document.createElement('div')
      fret.className = 'flag-col-fret'
      fret.textContent = char
      fret.style.color       = color
      fret.style.borderColor = color
      fret.style.setProperty('--fglow', color)
      colEl.appendChild(fret)

      // Continuously falling beats — staggered so the column is always active
      const dur = 1.5 + (col % 5) * 0.15
      for (let b = 0; b < BEATS_PER_COL; b++) {
        const beat = document.createElement('div')
        beat.className               = 'flag-beat'
        beat.style.borderColor       = color
        beat.style.background        = `${color}25`
        beat.style.boxShadow         = `0 0 6px ${color}88`
        beat.style.animationDuration = `${dur}s`
        beat.style.animationDelay   = `${-(b / BEATS_PER_COL) * dur}s`
        colEl.appendChild(beat)
      }

      overlay.appendChild(colEl)
    })

    gameRef.current.appendChild(overlay)

    // 3. Also flood the main 4 scheduler lanes with extra beats for chaos
    if (clockRef.current) {
      scheduler.current.injectFlagBeats(clockRef.current.currentTime)
    }
  }

  // ── Flag 4: console getter → visual overlay (no flag printed) ───
  useEffect(() => {
    Object.defineProperty(window, 'clctf', {
      configurable: true,
      get() {
        if (phaseRef.current === 'playing') triggerFlagEffect()
        // Return undefined — nothing is printed to the console
      },
    })
    return () => {
      try { delete (window as Window & { flag?: unknown }).flag } catch { /* */ }
      flagTriggered.current = false
      document.getElementById('flag-overlay')?.remove()
    }
  }, [levelId])

  // ── Build particle pool ──────────────────────────────────────────────
  useEffect(() => {
    if (!gameRef.current) return
    for (let i = 0; i < POOL_SIZE; i++) {
      const p = document.createElement('div')
      p.className = 'particle'
      gameRef.current.appendChild(p)
      particles.current.push(p)
    }
    return () => {
      particles.current.forEach(p => p.remove())
      particles.current = []
    }
  }, [])

  // ── Load audio + beats ───────────────────────────────────────────────
  useEffect(() => {
    if (!levelId) return
    const clock = new GameClock()
    clockRef.current = clock

    ;(async () => {
      try {
        const levelData = levelFromState ?? (await api.getLevels()).find(l => l.id === Number(levelId)) ?? null
        if (levelData) {
          setLevel(levelData)
        }

        const cachedAssets = getCachedLevelAssets(Number(levelId)) ?? (levelData ? await preloadLevelAssets(levelData) : null)
        if (cachedAssets) {
          setCachedVideoUrl(cachedAssets.videoUrl)
          setCachedVideoType(cachedAssets.videoType)
        }

        const beats = await api.getLevelBeats(Number(levelId))
        scheduler.current.load(beats as Beat[])
        setTotalBeats(scheduler.current.totalBeats)

        const buf = await clock.loadAudio(
          cachedAssets?.audioUrl ?? `/api/levels/${levelId}/audio`,
          useAuthStore.getState().user?.token
        )

        // React StrictMode runs effects twice (mount → cleanup → remount).
        // By the time the second async fetch completes the first clock has
        // been destroyed and clockRef points to the second one.  If this
        // IIFE's clock is no longer the active clock, bail out — otherwise
        // we'd start a second countdown that races with the real one and
        // calls finishGame() the moment the first source is stopped.
        if (clock !== clockRef.current) return

        audioBuffer.current = buf

        // If level wasn't in router state, set duration from audio
        if (!levelFromState) {
          setLevel(prev => prev ? { ...prev, duration: buf.duration } : null)
        }

        setPhase('countdown')
        startCountdown()
      } catch (e) {
        console.error('Failed to load level:', e)
      }
    })()

    return () => {
      clock.destroy()
      cancelAnimationFrame(rafId.current)
    }
  }, [levelId])

  // ── Countdown 3-2-1-GO ───────────────────────────────────────────────
  function startCountdown() {
    let n = 3
    setCountdown(n)
    const iv = setInterval(() => {
      n--
      if (n <= 0) {
        clearInterval(iv)
        beginPlay()
      } else {
        setCountdown(n)
      }
    }, 1000)
  }

  // ── Begin play ───────────────────────────────────────────────────────
  async function beginPlay() {
    if (!clockRef.current || !audioBuffer.current) return
    reset()
    setTotalBeats(scheduler.current.totalBeats)  // restore after reset() zeros it
    gameEnded.current = false
    lastBeatIdx.current = -1
    activeHold.current = [null, null, null, null]
    scheduler.current.reset()
    setDisplayScore(0)
    setDisplayStreak(0)
    setDisplayMult(1)

    // Await so the AudioContext is guaranteed running before we start the
    // game loop.  Without this, ctx.currentTime stays 0 if resume() is
    // pending, making every beat appear unhittable.
    await clockRef.current.play(audioBuffer.current)
    clockRef.current.onEnded(finishGame)
    setPhase('playing')
    gameLoop()
  }

  // ── Main game loop ───────────────────────────────────────────────────
  function gameLoop() {
    function tick() {
      if (!clockRef.current || gameEnded.current) return
      const now = clockRef.current.currentTime

      // 1. Auto-complete holds whose full duration has elapsed
      for (let lane = 0; lane < 4; lane++) {
        const hold = activeHold.current[lane]
        if (!hold) continue
        const endTime = hold.beat.hitTime + (hold.beat.duration ?? 0)
        if (now >= endTime + BeatScheduler.OK_MS) {
          completeHold(lane)
        }
      }

      // 2. Collect missed beats, excluding any that are actively being held
      const heldIds = new Set(
        activeHold.current
          .filter((h): h is HoldState => h !== null)
          .map(h => h.beat.id)
      )
      const missed = scheduler.current.collectMisses(now, heldIds)
      if (missed.length > 0) {
        missed.forEach((b) => {
          addHit('miss', 0)
          flashMiss(b.lane)
        })
        const st = useGameStore.getState()
        setDisplayScore(st.score)
        setDisplayStreak(st.streak)
        setDisplayMult(st.multiplier)
        syncStreakClass(st.streak, st.multiplier)
        updateBackground(st.streak, st.multiplier)
        // Red flash on background for miss
        if (bgRef.current) {
          const prev = bgRef.current.style.background
          bgRef.current.style.background =
            'radial-gradient(ellipse at 50% 100%, #ff0033 0%, transparent 55%)'
          gsap.killTweensOf(bgRef.current, 'opacity')
          gsap.fromTo(bgRef.current,
            { opacity: 0.35 },
            { opacity: displayMultRef.current > 1 ? 0.10 : 0, duration: 0.45, ease: 'power2.out',
              onComplete: () => { if (bgRef.current) bgRef.current.style.background = prev }
            }
          )
        }
      }

      // 3. BPM-synced background pulse
      const bpm = levelRef.current?.bpm ?? 120
      const beatIdx = Math.floor(now / (60 / bpm))
      if (beatIdx !== lastBeatIdx.current && now > 0) {
        lastBeatIdx.current = beatIdx
        pulseBg()
      }

      // 4. Render beats
      renderBeats(now)

      rafId.current = requestAnimationFrame(tick)
    }
    rafId.current = requestAnimationFrame(tick)
  }

  // ── Beat rendering (fully imperative, zero React re-renders) ─────────
  function renderBeats(now: number) {
    const visible = scheduler.current.getVisible(now)
    const visibleIds = new Set(visible.map(b => b.id))

    // Remove beats that are no longer visible
    beatEls.current.forEach((el, id) => {
      if (!visibleIds.has(id)) {
        el.remove()
        beatEls.current.delete(id)
      }
    })

    visible.forEach((beat) => {
      const laneEl = laneRefs.current[beat.lane]
      if (!laneEl) return

      const laneH    = laneEl.clientHeight
      const hitLineY = laneH - HIT_LINE_BOTTOM
      const timeUntilHit = beat.hitTime - now
      const top = hitLineY - timeUntilHit * SCROLL_SPEED

      let el = beatEls.current.get(beat.id)
      if (!el) {
        el = createBeatEl(beat)
        laneEl.appendChild(el)
        beatEls.current.set(beat.id, el)
      }

      // Add missed class so it turns red
      if (beat.missed && !el.classList.contains('beat-missed')) {
        el.classList.add('beat-missed')
      }

      // Position so the hit gem's center aligns with `top` (= hitLineY at hitTime).
      // Tap: single gem, 54px tall — center at top.
      // Hold: tail above, head below. Head is 54px; tail extends upward by tailH px.
      //   wrapper height = tailH + 54; el.top = top - tailH - 27 puts head center at top.
      if (beat.type === 'tap') {
        el.style.top = `${top - 27}px`
      } else {
        const tailH = (beat.duration ?? 0.5) * SCROLL_SPEED
        el.style.top = `${top - tailH - 27}px`
        el.style.height = `${tailH + 54}px`
        const tail = el.querySelector<HTMLDivElement>('.hold-tail')
        if (tail) tail.style.height = `${tailH}px`
      }
      // Later beats (higher hitTime) draw on top so their gems are never hidden
      // behind the tail of a beat closer to the hit line.
      el.style.zIndex = String(Math.round(beat.hitTime * 10))
    })
  }

  function createBeatEl(beat: ScheduledBeat): HTMLDivElement {
    const wrapper = document.createElement('div')
    wrapper.className = `beat beat-${beat.type} beat-lane-${beat.lane}`
    wrapper.dataset.id = String(beat.id)
    wrapper.style.willChange = 'top'

    if (beat.type === 'tap') {
      const gem = document.createElement('div')
      gem.className = 'gem'
      if (beat.label) {
        const lbl = document.createElement('span')
        lbl.className = 'gem-label'
        lbl.textContent = beat.label
        gem.appendChild(lbl)
      }
      wrapper.appendChild(gem)
    } else {
      // Hold note: tail at top, head at bottom (both absolutely positioned).
      // Wrapper must have explicit height so `bottom: 0` on the head resolves.
      const tailH = (beat.duration ?? 0.5) * SCROLL_SPEED
      wrapper.style.height = `${tailH + 54}px`

      const tail = document.createElement('div')
      tail.className = 'hold-tail'
      tail.style.height = `${tailH}px`

      const head = document.createElement('div')
      head.className = 'hold-head'

      wrapper.appendChild(tail)
      wrapper.appendChild(head)
    }

    return wrapper
  }

  // ── Input ────────────────────────────────────────────────────────────
  const handleKeyDown = useCallback((lane: number) => {
    if (phaseRef.current !== 'playing') return
    if (!clockRef.current) return

    const now = clockRef.current.currentTime
    const beat = scheduler.current.findHittable(lane, now)

    if (!beat) {
      flashHitZone(lane, 'empty')
      spawnHitRing(lane, 'rgba(255,255,255,0.3)')
      return
    }

    const diff   = Math.abs(beat.hitTime - now)
    const rating = getRating(diff)
    if (!rating) {
      flashHitZone(lane, 'empty')
      return
    }

    if (beat.type === 'hold') {
      // Don't resolve yet — hold must be sustained until end
      if (activeHold.current[lane]) return   // already holding in this lane
      activeHold.current[lane] = { beat, pressTime: now }
      const el = beatEls.current.get(beat.id)
      if (el) el.classList.add('beat-active')
      showFeedback(lane, 'hold')
      flashHitZone(lane, 'hold')
      spawnHitRing(lane, LANE_COLORS[lane])
    } else {
      // Tap: resolve immediately
      scheduler.current.resolve(beat, now)
      addHit(rating, BASE_POINTS[rating] ?? 0)

      const st = useGameStore.getState()
      setDisplayScore(st.score)
      setDisplayStreak(st.streak)
      setDisplayMult(st.multiplier)

      showFeedback(lane, rating)
      flashHitZone(lane, rating)
      spawnHitRing(lane, LANE_COLORS[lane])
      burstParticles(lane, st.multiplier)
      if (st.multiplier >= 3) screenShake(st.multiplier)
      syncStreakClass(st.streak, st.multiplier)
      updateBackground(st.streak, st.multiplier)
    }
  }, [addHit])

  const handleKeyUp = useCallback((lane: number) => {
    if (activeHold.current[lane]) completeHold(lane)
  }, [])

  // Keyboard listener — uses phaseRef, never stale
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return
      const lane = LANE_KEYS.indexOf(e.key.toLowerCase())
      if (lane !== -1) handleKeyDown(lane)
    }
    const up = (e: KeyboardEvent) => {
      const lane = LANE_KEYS.indexOf(e.key.toLowerCase())
      if (lane !== -1) handleKeyUp(lane)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [handleKeyDown, handleKeyUp])

  // ── Visual helpers ───────────────────────────────────────────────────

  function showFeedback(lane: number, rating: 'perfect' | 'good' | 'ok' | 'miss' | 'hold') {
    const id = ++feedbackId.current
    setFeedbacks(prev => [...prev.slice(-6), { id, lane, rating }])
    setTimeout(() => setFeedbacks(prev => prev.filter(f => f.id !== id)), 700)
  }

  function flashMiss(lane: number) {
    showFeedback(lane, 'miss')
    flashHitZone(lane, 'miss')
  }

  function flashHitZone(lane: number, rating: string) {
    const el = hitZoneRefs.current[lane]
    if (!el) return

    const colors: Record<string, string> = {
      perfect: '#00f5ff',
      good:    '#00ff88',
      ok:      '#ffff00',
      miss:    '#ff0044',
      hold:    '#ffffff',
      empty:   'rgba(255,255,255,0.25)',
    }
    const c = colors[rating] ?? colors.empty

    gsap.killTweensOf(el)
    gsap.fromTo(el,
      { scale: 1.0, boxShadow: `0 0 0px ${c}` },
      {
        scale: rating === 'perfect' ? 1.35 : rating === 'miss' ? 0.85 : 1.2,
        boxShadow: `0 0 40px ${c}, 0 0 80px ${c}`,
        duration: 0.06,
        ease: 'power2.out',
        yoyo: true,
        repeat: 1,
        onComplete: () => gsap.to(el, {
          scale: 1, boxShadow: `0 0 8px ${LANE_COLORS[lane]}44`, duration: 0.2
        })
      }
    )
  }

  function burstParticles(lane: number, multiplier: number) {
    const laneEl = laneRefs.current[lane]
    const hzEl   = hitZoneRefs.current[lane]
    if (!laneEl || !hzEl) return

    const laneRect = laneEl.getBoundingClientRect()
    const hzRect   = hzEl.getBoundingClientRect()
    const gameRect = gameRef.current!.getBoundingClientRect()

    const cx = hzRect.left + hzRect.width / 2  - gameRect.left
    const cy = hzRect.top  + hzRect.height / 2 - gameRect.top
    const color = LANE_COLORS[lane]
    const count = multiplier >= 4 ? 16 : multiplier >= 3 ? 10 : multiplier >= 2 ? 7 : 5

    for (let i = 0; i < count; i++) {
      const p = particles.current[particleIdx.current % POOL_SIZE]
      particleIdx.current++

      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.8
      const dist  = 30 + Math.random() * (multiplier >= 4 ? 120 : 70)
      const size  = multiplier >= 4 ? 6 + Math.random() * 8 : 4 + Math.random() * 5

      gsap.killTweensOf(p)
      gsap.set(p, { x: cx, y: cy, opacity: 1, scale: 1, width: size, height: size, background: color, borderRadius: '50%' })
      gsap.to(p, {
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        opacity: 0,
        scale: 0,
        duration: 0.4 + Math.random() * 0.4,
        ease: 'power2.out',
      })
    }
  }

  function screenShake(multiplier: number) {
    const el = gameRef.current
    if (!el) return
    const strength = multiplier >= 4 ? 10 : 5
    gsap.killTweensOf(el, 'x,y')
    gsap.to(el, {
      keyframes: [
        { x: strength,  y: -strength / 2, duration: 0.04 },
        { x: -strength, y:  strength / 2, duration: 0.04 },
        { x: strength / 2, y: strength, duration: 0.04 },
        { x: 0, y: 0, duration: 0.04 },
      ],
      ease: 'none',
    })
  }

  function syncStreakClass(streak: number, multiplier: number) {
    const el = gameRef.current
    if (!el) return
    el.classList.remove('streak-1x', 'streak-2x', 'streak-3x', 'streak-4x')
    if (multiplier >= 4 || streak >= 40) el.classList.add('streak-4x')
    else if (multiplier >= 3 || streak >= 20) el.classList.add('streak-3x')
    else if (multiplier >= 2 || streak >= 10) el.classList.add('streak-2x')
  }

  function updateBackground(streak: number, multiplier: number) {
    const el = bgRef.current
    if (!el) return
    const colors = [
      'rgba(255,255,255,0.8)',   // 1x
      'rgba(255,120,0,0.9)',      // 2x
      'rgba(180,0,255,0.9)',      // 3x
      'rgba(255,200,0,0.9)',      // 4x
    ]
    const opacities = [0, 0.06, 0.13, 0.22]
    const idx = Math.min(3, multiplier - 1)
    el.style.background = `radial-gradient(ellipse at 50% 110%, ${colors[idx]} 0%, transparent 60%)`
    gsap.to(el, { opacity: opacities[idx], duration: 0.4, overwrite: 'auto' })
  }

  function pulseBg() {
    const el = bgRef.current
    if (!el) return
    const mx = displayMultRef.current
    const base      = [0.02, 0.06, 0.13, 0.22][Math.min(3, mx - 1)]
    const peak      = base + [0.06, 0.09, 0.13, 0.18][Math.min(3, mx - 1)]
    const beatDur   = 60 / (levelRef.current?.bpm ?? 120)
    gsap.killTweensOf(el, 'opacity')
    gsap.fromTo(el,
      { opacity: peak },
      { opacity: base, duration: beatDur * 0.4, ease: 'power2.out' }
    )
  }

  function spawnHitRing(lane: number, color: string) {
    const hzEl = hitZoneRefs.current[lane]
    if (!hzEl) return
    const ring = document.createElement('div')
    ring.className = 'hit-ring'
    ring.style.borderColor = color
    ring.style.boxShadow = `0 0 12px ${color}`
    hzEl.appendChild(ring)
    gsap.fromTo(ring,
      { scale: 0.6, opacity: 0.9 },
      { scale: 2.8, opacity: 0, duration: 0.45, ease: 'power2.out',
        onComplete: () => ring.remove() }
    )
  }

  function completeHold(lane: number) {
    const hold = activeHold.current[lane]
    if (!hold) return
    activeHold.current[lane] = null

    const now       = clockRef.current?.currentTime ?? 0
    const duration  = hold.beat.duration ?? 0.5
    const coverage  = Math.min(1, (now - hold.pressTime) / duration)

    scheduler.current.resolve(hold.beat, now)

    const el = beatEls.current.get(hold.beat.id)
    if (el) el.classList.remove('beat-active')

    let rating: 'perfect' | 'good' | 'ok' | 'miss'
    if (coverage >= 0.90)      rating = 'perfect'
    else if (coverage >= 0.70) rating = 'good'
    else if (coverage >= 0.45) rating = 'ok'
    else                       rating = 'miss'

    if (rating === 'miss') {
      hold.beat.missed = true
      if (el) el.classList.add('beat-missed')
      addHit('miss', 0)
      showFeedback(lane, 'miss')
      flashHitZone(lane, 'miss')
    } else {
      addHit(rating, BASE_POINTS[rating] ?? 0)
      showFeedback(lane, rating)
      flashHitZone(lane, rating)
      spawnHitRing(lane, LANE_COLORS[lane])
    }

    const st = useGameStore.getState()
    setDisplayScore(st.score)
    setDisplayStreak(st.streak)
    setDisplayMult(st.multiplier)
    burstParticles(lane, st.multiplier)
    if (st.multiplier >= 3) screenShake(st.multiplier)
    syncStreakClass(st.streak, st.multiplier)
    updateBackground(st.streak, st.multiplier)
  }

  // ── End game ─────────────────────────────────────────────────────────
  async function finishGame() {
    if (gameEnded.current) return
    gameEnded.current = true
    cancelAnimationFrame(rafId.current)

    // Resolve any holds the player was still holding when the song ended
    for (let lane = 0; lane < 4; lane++) {
      if (activeHold.current[lane]) completeHold(lane)
    }

    // Read final state synchronously from Zustand — it's always up to date
    const st = useGameStore.getState()
    const total    = st.totalBeats || 1
    const weighted = st.perfectCount * 1.0 + st.goodCount * 0.6 + st.okCount * 0.3
    const accuracy = Math.min(100, Math.round((weighted / total) * 100))

    const result = {
      levelId:      Number(levelId),
      levelTitle:   level?.title ?? 'Unknown',
      score:        st.score,
      accuracy,
      maxCombo:     st.maxCombo,
      perfectCount: st.perfectCount,
      goodCount:    st.goodCount,
      okCount:      st.okCount,
      missCount:    st.missCount,
      totalBeats:   total,
    }

    // Save to backend (don't block navigation on failure)
    api.postScore({
      levelId:      result.levelId,
      score:        result.score,
      accuracy:     result.accuracy,
      maxCombo:     result.maxCombo,
      perfectCount: result.perfectCount,
      goodCount:    result.goodCount,
      okCount:      result.okCount,
      missCount:    result.missCount,
    }).catch(e => console.error('Score save failed:', e))

    setLastResult(result)
    setPhase('ended')
    navigate('/score')
  }

  // ─── Render ───────────────────────────────────────────────────────────
  const isPlaying = phase === 'playing'

  return (
    <div className={`game-page ${isPlaying ? `mult-bg-${displayMult}` : ''}`} ref={gameRef}>

      {/* ── Immersive background with beat-reactive video ── */}
      <BackgroundVideo
        videoPath={cachedVideoUrl ?? (level?.videoPath ? `/api/levels/${levelId}/video` : null)}
        videoType={cachedVideoType}
        isPlaying={isPlaying}
        gameClock={clockRef.current}
        scheduler={scheduler.current}
        bpm={level?.bpm ?? 120}
      />

      {/* ── Legacy reactive background glow layer ── */}
      <div className="bg-reactive" ref={bgRef} aria-hidden />

      {/* ── Loading ── */}
      <AnimatePresence>
        {phase === 'loading' && (
          <motion.div className="overlay-center" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="gh-spinner" />
            <p className="overlay-label">Loading level...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Countdown ── */}
      <AnimatePresence>
        {phase === 'countdown' && (
          <motion.div
            className="overlay-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <p className="countdown-song">{level?.title}</p>
            <p className="countdown-artist">{level?.artist}</p>
            <motion.div
              className="countdown-number"
              key={countdown}
              initial={{ scale: 2.5, opacity: 0 }}
              animate={{ scale: 1,   opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.35, ease: 'backOut' }}
            >
              {countdown}
            </motion.div>
            <div className="countdown-keys">
              {LANE_KEYS.map((k, i) => (
                <div key={i} className={`ck lane-color-${i}`}>{k.toUpperCase()}</div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HUD (score / streak / multiplier) ── */}
      {isPlaying && (
        <div className="hud">
          <div className="hud-score">
            <span className="hud-sub">SCORE</span>
            <span className={`hud-big ${displayMult >= 4 ? 'hyper-text' : ''}`}>
              {displayScore.toLocaleString()}
            </span>
          </div>

          <div className="hud-mid">
            <div className={`hud-mult mult-${displayMult}x`}>
              {displayMult}×
            </div>
            {displayStreak > 0 && (
              <div className="hud-streak">
                🔥 {displayStreak}
              </div>
            )}
          </div>

          <div className="hud-right">
            <span className="hud-sub">LEVEL</span>
            <span className="hud-title-text">{level?.title}</span>
          </div>
        </div>
      )}

      {/* ── Highway ── */}
      {isPlaying && (
        <div className="highway">
          {/* Perspective wrapper */}
          <div className="highway-inner">
            {/* Lane dividers */}
            <div className="lane-dividers">
              {[0,1,2,3,4].map(i => <div key={i} className="divider" />)}
            </div>

            {/* Vanishing-point speed lines */}
            <div className="speed-lines" aria-hidden>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="speed-line" style={{ '--i': i } as React.CSSProperties} />
              ))}
            </div>

            {/* 4 lanes */}
            {[0, 1, 2, 3].map((lane) => (
              <div
                key={lane}
                className={`lane gh-lane-${lane}`}
                ref={el => { laneRefs.current[lane] = el }}
                onMouseDown={() => handleKeyDown(lane)}
                onMouseUp={() => handleKeyUp(lane)}
                onTouchStart={e => { e.preventDefault(); handleKeyDown(lane) }}
                onTouchEnd={e => { e.preventDefault(); handleKeyUp(lane) }}
              />
            ))}

            {/* Hit line glow */}
            <div className="hit-line" />

            {/* Hit zones (one per lane, absolutely positioned at hit line) */}
            <div className="hit-zones">
              {[0, 1, 2, 3].map(lane => (
                <div
                  key={lane}
                  className={`hit-zone hz-${lane}`}
                  ref={el => { hitZoneRefs.current[lane] = el }}
                  onMouseDown={() => handleKeyDown(lane)}
                  onMouseUp={() => handleKeyUp(lane)}
                  onTouchStart={e => { e.preventDefault(); handleKeyDown(lane) }}
                  onTouchEnd={e => { e.preventDefault(); handleKeyUp(lane) }}
                >
                  <span className="hz-key">{LANE_KEYS[lane].toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Per-lane feedback labels (React-rendered, lightweight) ── */}
      {isPlaying && (
        <div className="feedback-layer" aria-live="polite">
          {feedbacks.map(f => (
            <FeedbackLabel key={f.id} lane={f.lane} rating={f.rating} laneRefs={laneRefs} />
          ))}
        </div>
      )}

      {/* ── Hyperactive overlay ── */}
      {isPlaying && displayMult >= 4 && (
        <div className="hyper-overlay" aria-hidden />
      )}
    </div>
  )
}

// ── Sub-component: animated feedback label per lane ───────────────────────────
function FeedbackLabel({
  lane, rating, laneRefs,
}: {
  lane: number
  rating: string
  laneRefs: React.MutableRefObject<(HTMLDivElement | null)[]>
}) {
  const laneEl = laneRefs.current[lane]
  if (!laneEl) return null
  const rect = laneEl.getBoundingClientRect()
  const cx   = rect.left + rect.width / 2

  const colors: Record<string, string> = {
    perfect: '#00f5ff',
    good:    '#00ff88',
    ok:      '#ffff00',
    miss:    '#ff0044',
    hold:    '#ffffff',
  }
  const labels: Record<string, string> = {
    perfect: 'PERFECT',
    good:    'GOOD',
    ok:      'OK',
    miss:    'MISS',
    hold:    'HOLD!',
  }

  return (
    <motion.div
      className="feedback-label"
      style={{
        left: cx,
        bottom: `${HIT_LINE_BOTTOM + 80}px`,
        color: colors[rating] ?? '#fff',
        textShadow: `0 0 20px ${colors[rating] ?? '#fff'}`,
      }}
      initial={{ opacity: 1, y: 0, scale: 0.7 }}
      animate={{ opacity: 0, y: -60, scale: 1.3 }}
      transition={{ duration: 0.55, ease: 'easeOut' }}
    >
      {labels[rating] ?? rating.toUpperCase()}
    </motion.div>
  )
}
