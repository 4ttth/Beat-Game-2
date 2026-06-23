/**
 * Generates a 60-second silent WAV file for the demo level.
 * WAV format: PCM 16-bit, 44100 Hz, mono
 */
const fs = require('fs')
const path = require('path')

const SAMPLE_RATE = 44100
const DURATION = 60
const NUM_SAMPLES = SAMPLE_RATE * DURATION
const BPM = 120
const BEAT_INTERVAL = SAMPLE_RATE * (60 / BPM) // samples per beat

// Generate simple click track so the demo level is actually playable
const samples = new Int16Array(NUM_SAMPLES)
const CLICK_DURATION = 882 // 20ms click

for (let beat = 0; beat < BPM; beat++) {
  const start = Math.floor(beat * BEAT_INTERVAL + 0.5 * SAMPLE_RATE)
  if (start >= NUM_SAMPLES) break
  for (let i = 0; i < CLICK_DURATION && start + i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE
    // 440Hz sine click, fading out
    const fade = 1 - i / CLICK_DURATION
    samples[start + i] = Math.floor(Math.sin(2 * Math.PI * 440 * t) * fade * 8000)
  }
}

// WAV header
const dataSize = NUM_SAMPLES * 2
const buffer = Buffer.alloc(44 + dataSize)
buffer.write('RIFF', 0)
buffer.writeUInt32LE(36 + dataSize, 4)
buffer.write('WAVE', 8)
buffer.write('fmt ', 12)
buffer.writeUInt32LE(16, 16)
buffer.writeUInt16LE(1, 20)   // PCM
buffer.writeUInt16LE(1, 22)   // mono
buffer.writeUInt32LE(SAMPLE_RATE, 24)
buffer.writeUInt32LE(SAMPLE_RATE * 2, 28) // byte rate
buffer.writeUInt16LE(2, 32)   // block align
buffer.writeUInt16LE(16, 34)  // bits per sample
buffer.write('data', 36)
buffer.writeUInt32LE(dataSize, 40)

for (let i = 0; i < NUM_SAMPLES; i++) {
  buffer.writeInt16LE(samples[i], 44 + i * 2)
}

const outPath = path.join(__dirname, 'audio.wav')
fs.writeFileSync(outPath, buffer)
console.log(`Generated ${DURATION}s WAV click track: ${outPath} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`)
