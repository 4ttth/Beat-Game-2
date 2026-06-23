const fs = require('fs')
const path = require('path')

const beats = []
const bpm = 120
const beatInterval = 60 / bpm // 0.5s per beat
const holdSet = new Set([4, 12, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110])
let lastLane = -1

for (let i = 0; i < 120; i++) {
  const time = parseFloat((i * beatInterval + 0.5).toFixed(4))
  let lane
  do { lane = Math.floor(Math.random() * 4) } while (lane === lastLane)
  lastLane = lane
  const beat = { id: i, time, lane, type: holdSet.has(i) ? 'hold' : 'tap' }
  if (beat.type === 'hold') beat.duration = 0.4
  beats.push(beat)
}

fs.writeFileSync(
  path.join(__dirname, 'beats.json'),
  JSON.stringify(beats, null, 2)
)
console.log('Generated', beats.length, 'beats')
