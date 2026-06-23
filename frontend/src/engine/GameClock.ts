/**
 * GameClock
 * ─────────
 * Uses performance.now() as the game-time clock so that the song position
 * is always "seconds since play() was called" regardless of how long the
 * AudioContext has been alive.
 *
 * Audio is still played through the Web Audio API (for quality), but we
 * do NOT use ctx.currentTime as the game clock because that counter keeps
 * running from the moment the AudioContext is created.  Using it as a
 * `when` argument to source.start() causes the browser to skip ahead in
 * the audio buffer by however many seconds have elapsed since context
 * creation — which on repeated plays can exceed the buffer duration,
 * making the source end instantly with score 0.
 */
export class GameClock {
  private ctx: AudioContext
  private source: AudioBufferSourceNode | null = null
  private _startedAt = 0   // performance.now() value when play() fired
  private _playing = false

  constructor() {
    this.ctx = new AudioContext()
  }

  get audioContext(): AudioContext { return this.ctx }

  /**
   * Song position in seconds. 0 = beginning of the track.
   */
  get currentTime(): number {
    if (!this._playing) return 0
    return (performance.now() - this._startedAt) / 1000
  }

  get isPlaying(): boolean { return this._playing }

  async loadAudio(url: string, token?: string): Promise<AudioBuffer> {
    const headers: HeadersInit = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`Audio ${res.status}: ${res.statusText}`)
    const ab = await res.arrayBuffer()
    return this.ctx.decodeAudioData(ab)
  }

  async play(buffer: AudioBuffer): Promise<void> {
    this.stop()

    // Await resume so the browser actually allows audio output before we
    // schedule the source.  Without this, ctx.resume() is fire-and-forget
    // and audio may silently never start when called from a timer callback.
    if (this.ctx.state !== 'running') {
      await this.ctx.resume()
    }

    this.source = this.ctx.createBufferSource()
    this.source.buffer = buffer
    this.source.connect(this.ctx.destination)

    // start() with no argument means "start now, from position 0".
    // We record performance.now() as our game-time origin so that
    // currentTime always starts at 0 and never depends on how long
    // the AudioContext has been alive.
    this._startedAt = performance.now()
    this.source.start()
    this._playing = true
  }

  onEnded(cb: () => void) {
    const src = this.source
    if (!src) return
    // Close over `src` so we can verify the source that fired `ended` is
    // still the active one.  Without this check, stopping source A and
    // immediately starting source B causes B's _playing=true to be read
    // when A's onended fires, making finishGame() trigger prematurely.
    src.onended = () => {
      if (this.source === src && this._playing) {
        this._playing = false
        cb()
      }
    }
  }

  stop() {
    if (this.source) {
      try { this.source.stop() } catch { /* already stopped */ }
      this.source.disconnect()
      this.source = null
    }
    this._playing = false
  }

  destroy() {
    this.stop()
    this.ctx.close()
  }
}
