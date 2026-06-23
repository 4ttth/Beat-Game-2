import gsap from 'gsap'

/**
 * HyperActiveController manages all visual effects for streak levels.
 * Uses GSAP for imperative, GPU-composited animations.
 * All effects operate on will-change: transform/opacity properties only.
 */
export class HyperActiveController {
  private gameEl: HTMLElement | null = null
  private particlePool: HTMLElement[] = []
  private currentLevel = 0
  private rainbowTween: gsap.core.Tween | null = null
  private bgTween: gsap.core.Tween | null = null

  private readonly POOL_SIZE = 40
  private readonly LANE_COLORS = [
    'var(--lane-0)',
    'var(--lane-1)',
    'var(--lane-2)',
    'var(--lane-3)',
  ]

  init(gameEl: HTMLElement) {
    this.gameEl = gameEl
    this.buildParticlePool()
  }

  private buildParticlePool() {
    if (!this.gameEl) return
    for (let i = 0; i < this.POOL_SIZE; i++) {
      const p = document.createElement('div')
      p.className = 'hyper-particle'
      p.style.cssText = `
        position: absolute;
        width: 8px; height: 8px;
        border-radius: 50%;
        pointer-events: none;
        opacity: 0;
        will-change: transform, opacity;
        z-index: 50;
      `
      this.gameEl.appendChild(p)
      this.particlePool.push(p)
    }
  }

  setLevel(level: number) {
    if (level === this.currentLevel || !this.gameEl) return
    this.currentLevel = level

    // Remove old streak classes
    this.gameEl.classList.remove('streak-1x', 'streak-2x', 'streak-3x', 'streak-4x')
    if (level > 0) {
      this.gameEl.classList.add(`streak-${level}x`)
    }

    // Kill ongoing tweens
    if (this.rainbowTween) { this.rainbowTween.kill(); this.rainbowTween = null }
    if (this.bgTween) { this.bgTween.kill(); this.bgTween = null }

    if (level >= 4) {
      this.startHyperMode()
    }
  }

  private startHyperMode() {
    if (!this.gameEl) return
    // Pulsing background hue cycle
    let hue = 0
    const el = this.gameEl
    this.bgTween = gsap.to({}, {
      duration: 0.08,
      repeat: -1,
      onRepeat: () => {
        hue = (hue + 3) % 360
        el.style.setProperty('--hyper-hue', `${hue}deg`)
      }
    })
  }

  /**
   * Burst particles from a hit zone position.
   * Reuses pooled DOM nodes — never creates new ones.
   */
  burstParticles(x: number, y: number, lane: number) {
    const color = this.LANE_COLORS[lane] ?? '#fff'
    const count = this.currentLevel >= 4 ? 12 : this.currentLevel >= 3 ? 8 : 5

    let poolIdx = 0
    for (let i = 0; i < count; i++) {
      // Find next available (opacity 0) particle
      let p: HTMLElement | null = null
      for (let j = 0; j < this.POOL_SIZE; j++) {
        const idx = (poolIdx + j) % this.POOL_SIZE
        const candidate = this.particlePool[idx]
        if (parseFloat(candidate.style.opacity) < 0.01) {
          p = candidate
          poolIdx = (idx + 1) % this.POOL_SIZE
          break
        }
      }
      if (!p) break

      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5
      const dist = 40 + Math.random() * 60
      const dx = Math.cos(angle) * dist
      const dy = Math.sin(angle) * dist

      p.style.background = color
      p.style.left = `${x}px`
      p.style.top = `${y}px`
      p.style.opacity = '1'
      p.style.transform = 'translate(-50%, -50%) scale(1)'

      gsap.to(p, {
        x: dx,
        y: dy,
        opacity: 0,
        scale: 0.2,
        duration: 0.5 + Math.random() * 0.3,
        ease: 'power2.out',
        onComplete: () => {
          p!.style.transform = 'translate(-50%, -50%) scale(1)'
          p!.style.opacity = '0'
          gsap.set(p!, { x: 0, y: 0 })
        },
      })
    }
  }

  /**
   * Screen shake — only transforms the game element.
   */
  screenShake(intensity = 1) {
    if (!this.gameEl) return
    const i = intensity * (this.currentLevel >= 4 ? 8 : 4)
    gsap.fromTo(
      this.gameEl,
      { x: 0 },
      {
        x: gsap.utils.random(-i, i),
        duration: 0.04,
        repeat: 5,
        yoyo: true,
        ease: 'none',
        onComplete: () => gsap.set(this.gameEl!, { x: 0 }),
      }
    )
  }

  destroy() {
    if (this.rainbowTween) this.rainbowTween.kill()
    if (this.bgTween) this.bgTween.kill()
    this.particlePool.forEach((p) => p.remove())
    this.particlePool = []
    this.currentLevel = 0
    if (this.gameEl) {
      this.gameEl.classList.remove('streak-1x', 'streak-2x', 'streak-3x', 'streak-4x')
      this.gameEl.style.removeProperty('--hyper-hue')
    }
  }
}
