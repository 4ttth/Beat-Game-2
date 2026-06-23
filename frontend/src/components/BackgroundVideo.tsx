import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import './BackgroundVideo.css'

interface BackgroundVideoProps {
  videoPath?: string | null
  videoType?: string | null
  isPlaying: boolean
  gameClock: any
  scheduler: any
  bpm: number
}

export const BackgroundVideo = ({
  videoPath,
  videoType,
  isPlaying,
  gameClock,
  scheduler,
  bpm,
}: BackgroundVideoProps) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const beatResponseRef = useRef<HTMLDivElement>(null)
  const beatRafRef = useRef(0)
  const syncTimerRef = useRef<number | null>(null)
  const lastBeatIdx = useRef(-1)
  const beatRingIds = useRef<number[]>([])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !isPlaying || !videoPath) return

    let cancelled = false

    const startVideo = async () => {
      try {
        if (gameClock) {
          const targetTime = Math.max(0, gameClock.currentTime)
          if (Math.abs(video.currentTime - targetTime) > 0.15) {
            video.currentTime = targetTime
          }
        }
        if (!cancelled) await video.play()
      } catch {
      }
    }

    const correctDrift = () => {
      if (!gameClock || !video) return
      const drift = video.currentTime - gameClock.currentTime
      if (Math.abs(drift) > 0.4) {
        video.currentTime = gameClock.currentTime
      }
    }

    void startVideo()
    correctDrift()
    syncTimerRef.current = window.setInterval(correctDrift, 1500)

    return () => {
      cancelled = true
      if (syncTimerRef.current !== null) {
        clearInterval(syncTimerRef.current)
        syncTimerRef.current = null
      }
      video.pause()
    }
  }, [isPlaying, gameClock, videoPath])

  useEffect(() => {
    if (!isPlaying || !gameClock || !beatResponseRef.current) return

    const tickEffects = () => {
      const now = gameClock.currentTime

      const beatIdx = Math.floor(now / (60 / bpm))
      if (beatIdx !== lastBeatIdx.current && now > 0) {
        lastBeatIdx.current = beatIdx
        beatFlash()
        createBeatRing()
      }

      const upcomingBeats = scheduler?.getVisible(now, now + 1.0) || []
      if (upcomingBeats.length > 0) {
        applyGlowEffect(upcomingBeats.length)
      }

      beatRafRef.current = requestAnimationFrame(tickEffects)
    }

    beatRafRef.current = requestAnimationFrame(tickEffects)

    return () => cancelAnimationFrame(beatRafRef.current)
  }, [isPlaying, gameClock, scheduler, bpm])

  const beatFlash = () => {
    if (!beatResponseRef.current) return

    gsap.killTweensOf(beatResponseRef.current, 'opacity,scale')
    gsap.fromTo(
      beatResponseRef.current,
      { opacity: 0.3, scale: 1 },
      {
        opacity: 0,
        scale: 1.03,
        duration: 0.22,
        ease: 'power2.out',
      }
    )
  }

  const createBeatRing = () => {
    if (!containerRef.current) return

    const ring = document.createElement('div')
    ring.className = 'bg-beat-ring'
    const ringId = Date.now() + Math.random()

    containerRef.current.appendChild(ring)
    beatRingIds.current.push(ringId)

    gsap.fromTo(
      ring,
      {
        opacity: 0.5,
        scale: 0.65,
        borderColor: 'rgba(255, 200, 0, 0.8)',
        boxShadow: '0 0 20px rgba(255, 200, 0, 0.6)',
      },
      {
        opacity: 0,
        scale: 1.7,
        duration: 0.7,
        ease: 'power2.out',
        onComplete: () => {
          ring.remove()
          beatRingIds.current = beatRingIds.current.filter(id => id !== ringId)
        },
      }
    )
  }

  const applyGlowEffect = (beatCount: number) => {
    if (!containerRef.current) return

    const intensity = Math.min(beatCount * 0.18, 0.75)
    gsap.to(containerRef.current, {
      '--bg-glow': `${intensity}`,
      duration: 0.2,
      overwrite: 'auto',
    } as any)
  }

  if (!videoPath) {
    return (
      <div className="bg-video-container bg-fallback" ref={containerRef}>
        <div className="bg-fallback-gradient" />
        <div className="bg-beat-response" ref={beatResponseRef} />
      </div>
    )
  }

  return (
    <div className="bg-video-container" ref={containerRef}>
      <video
        ref={videoRef}
        className="bg-video"
        autoPlay
        muted
        playsInline
        preload="auto"
        loop
      >
        <source src={videoPath} type={videoType ?? (videoPath.endsWith('.webm') ? 'video/webm' : 'video/mp4')} />
      </video>

      <div className="bg-beat-response" ref={beatResponseRef} />
      <div className="bg-gradient-overlay" />
    </div>
  )
}
