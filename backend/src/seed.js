const path = require('path')
const fs = require('fs')

/**
 * Seeds the database with bundled levels found in levels/bundled/.
 * Each bundled level folder must contain:
 *   - level.json
 *   - beats.json
 *   - audio.mp3
 */
function seed(db, levelsDir) {
  const bundledDir = path.join(levelsDir, 'bundled')
  if (!fs.existsSync(bundledDir)) {
    fs.mkdirSync(bundledDir, { recursive: true })
    return
  }

  const folders = fs.readdirSync(bundledDir).filter((f) => {
    return fs.statSync(path.join(bundledDir, f)).isDirectory()
  })

  for (const folder of folders) {
    const dir = path.join(bundledDir, folder)
    const levelJsonPath = path.join(dir, 'level.json')
    const beatsJsonPath = path.join(dir, 'beats.json')
    // Accept any audio file
    const audioFile = fs.readdirSync(dir).find((f) =>
      /\.(mp3|ogg|wav)$/i.test(f)
    )
    // Optional background video
    const videoFile = fs.readdirSync(dir).find((f) =>
      /\.(mp4|webm)$/i.test(f)
    )

    if (!fs.existsSync(levelJsonPath) || !fs.existsSync(beatsJsonPath) || !audioFile) {
      console.log(`[seed] Skipping ${folder} — missing files`)
      continue
    }

    const audioPath = path.join(dir, audioFile)
    const videoPath = videoFile ? path.join(dir, videoFile) : null
    const meta = JSON.parse(fs.readFileSync(levelJsonPath, 'utf8'))

    // Check if already seeded (by title + artist combo)
    const existing = db
      .prepare('SELECT id FROM levels WHERE title = ? AND artist = ? AND is_bundled = 1')
      .get(meta.title, meta.artist)

    if (existing) continue

    db.prepare(`
      INSERT INTO levels (title, artist, bpm, duration, max_score, audio_path, beats_path, video_path, creator_note, is_bundled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      meta.title   || 'Untitled',
      meta.artist  || 'Unknown',
      meta.bpm     || 120,
      meta.duration || 0,
      meta.maxScore || meta.max_score || 0,
      audioPath,
      beatsJsonPath,
      videoPath,
      // Flag 2 — private note that leaks via the verbose GET /api/levels/:id
      meta.creatorNote || 'CLCTF{4p1_t0ld_m3_t00_much}'
    )
    console.log(`[seed] Seeded bundled level: ${meta.title} by ${meta.artist}`)
  }
}

module.exports = seed
