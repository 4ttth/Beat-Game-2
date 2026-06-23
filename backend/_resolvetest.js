const path = require('path')
const fs = require('fs')
const LEVELS_DIR = path.join(__dirname, 'levels')

function resolveLevelFile(storedPath) {
  if (!storedPath) return storedPath
  if (fs.existsSync(storedPath)) return storedPath
  const norm = String(storedPath).replace(/\\/g, '/')
  const idx = norm.toLowerCase().lastIndexOf('/levels/')
  if (idx !== -1) {
    const rel = norm.slice(idx + '/levels/'.length)
    const candidate = path.join(LEVELS_DIR, rel)
    if (fs.existsSync(candidate)) return candidate
  }
  return storedPath
}

// Simulate the container: paths that do NOT exist as-is on this host
const tests = [
  'C:\\nope\\Beat-Game\\backend\\levels\\bundled\\demo-level\\audio.wav',
  '/app/levels/upload_1782066355683/Shakira - Waka Waka (This Time for Africa) (The Official 2010 FIFA World Cup™ Song).mp3',
]
for (const t of tests) {
  const r = resolveLevelFile(t)
  console.log(fs.existsSync(r) ? 'RESOLVED OK' : 'MISSING   ', '->', r)
}
