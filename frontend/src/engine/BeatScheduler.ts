import { Beat } from '../api/client'

export interface ScheduledBeat extends Beat {
  hitTime:  number
  resolved: boolean   // true = hit by player OR auto-missed
  missed:   boolean   // true = auto-missed (never hit)
  hitAt:    number    // song time when player hit it (-1 if not yet hit)
  label?:   string    // optional character label (used by flag 4 chaos beats)
}

/**
 * BeatScheduler — pure timing data, no React/DOM.
 *
 * Time reference: song seconds (0 = start of audio playback).
 * Callers supply `now = GameClock.currentTime` each frame.
 */
export class BeatScheduler {
  private beats: ScheduledBeat[] = []

  // How far ahead beats appear (seconds before their hit time)
  static readonly LOOKAHEAD = 2.0

  // Hit judgment windows — symmetric around hitTime
  static readonly PERFECT_MS = 0.040   // ±40 ms
  static readonly GOOD_MS    = 0.080   // ±80 ms
  static readonly OK_MS      = 0.140   // ±140 ms

  // How long past hitTime a beat stays visible for miss flash
  static readonly MISS_LINGER = 0.25

  load(raw: Beat[]) {
    this.beats = raw
      .slice()
      .sort((a, b) => a.time - b.time)
      .map(b => ({
        ...b,
        hitTime:  b.time,
        resolved: false,
        missed:   false,
        hitAt:    -1,
      }))
  }

  /**
   * Returns beats to render this frame.
   * A beat is visible from (hitTime - LOOKAHEAD) until it leaves the screen.
   * We keep resolved+missed beats visible briefly so the MISS flash shows.
   */
  getVisible(now: number): ScheduledBeat[] {
    return this.beats.filter(b => {
      // Not yet in view
      if (now < b.hitTime - BeatScheduler.LOOKAHEAD) return false
      // Hit by player — remove immediately (flash handled separately)
      if (b.resolved && !b.missed) return false
      // Missed — keep visible a little past hit time for the red flash
      if (b.missed) return now - b.hitTime < BeatScheduler.MISS_LINGER
      // Normal in-view unresolved beat
      return true
    })
  }

  /**
   * Find the nearest unresolved beat in `lane` within the OK window.
   * Returns null when nothing hittable.
   */
  findHittable(lane: number, now: number): ScheduledBeat | null {
    let best: ScheduledBeat | null = null
    let bestDiff = Infinity
    for (const b of this.beats) {
      if (b.resolved || b.lane !== lane) continue
      const diff = Math.abs(b.hitTime - now)
      if (diff <= BeatScheduler.OK_MS && diff < bestDiff) {
        bestDiff = diff
        best = b
      }
    }
    return best
  }

  /**
   * Mark beats whose OK window has fully passed (player never hit them).
   * Returns newly-missed beats so the caller can flash feedback.
   */
  collectMisses(now: number, excludeIds?: ReadonlySet<number>): ScheduledBeat[] {
    const out: ScheduledBeat[] = []
    for (const b of this.beats) {
      if (!b.resolved && now - b.hitTime > BeatScheduler.OK_MS) {
        if (excludeIds?.has(b.id)) continue   // beat is actively held — don't auto-miss
        b.resolved = true
        b.missed   = true
        out.push(b)
      }
    }
    return out
  }

  resolve(beat: ScheduledBeat, now: number) {
    beat.resolved = true
    beat.hitAt    = now
  }

  reset() {
    for (const b of this.beats) {
      b.resolved = false
      b.missed   = false
      b.hitAt    = -1
    }
  }

  /**
   * Flood the main 4 lanes with dense unlabeled beats for chaos.
   * The flag characters are shown in the 22-column visual overlay,
   * not on the beats themselves.
   */
  injectFlagBeats(now: number) {
    const ROWS         = 36          // 36 rows × 4 lanes = 144 extra notes
    const ROW_INTERVAL = 0.11        // very tight spacing
    const START        = now + 0.3   // first wave arrives 300 ms from now

    let id = 9_000_000 + Math.floor(Math.random() * 1_000_000)

    for (let row = 0; row < ROWS; row++) {
      for (let lane = 0; lane < 4; lane++) {
        const hitTime = START + row * ROW_INTERVAL
        this.beats.push({
          id:       id++,
          time:     hitTime,
          lane:     lane as 0 | 1 | 2 | 3,
          type:     'tap',
          hitTime,
          resolved: false,
          missed:   false,
          hitAt:    -1,
        })
      }
    }
  }

  get allBeats():   ScheduledBeat[] { return this.beats }
  get totalBeats(): number           { return this.beats.length }
}

export function getRating(diff: number): 'perfect' | 'good' | 'ok' | null {
  if (diff <= BeatScheduler.PERFECT_MS) return 'perfect'
  if (diff <= BeatScheduler.GOOD_MS)    return 'good'
  if (diff <= BeatScheduler.OK_MS)      return 'ok'
  return null
}
