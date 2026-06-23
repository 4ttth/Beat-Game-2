const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const { requireCreator } = require('../middleware/requireAdmin')

const router = express.Router()

const LEVELS_DIR = path.join(__dirname, '..', '..', 'levels')

// Stored paths may be absolute paths from another machine/OS (e.g. a Windows
// dev box) baked into the DB. If the stored path doesn't exist, re-derive it
// relative to the current levels directory so files resolve in any environment
// (host dev, Docker container, etc.).
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

function removeLevelFiles(level) {
  const paths = [level.audio_path, level.beats_path, level.video_path].filter(Boolean)
  for (const filePath of paths) {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch (error) {
      console.warn('[levels] Failed to remove file:', filePath, error.message)
    }
  }

  const levelDir = path.dirname(level.audio_path)
  const resolvedLevelsDir = path.resolve(LEVELS_DIR)
  const resolvedLevelDir = path.resolve(levelDir)
  if (resolvedLevelDir.startsWith(resolvedLevelsDir)) {
    try {
      fs.rmSync(resolvedLevelDir, { recursive: true, force: true })
    } catch (error) {
      console.warn('[levels] Failed to remove level directory:', resolvedLevelDir, error.message)
    }
  }
}

// Multer storage — keeps original extension
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(LEVELS_DIR, `upload_${Date.now()}`)
    fs.mkdirSync(dir, { recursive: true })
    req._uploadDir = dir
    cb(null, dir)
  },
  filename: (req, file, cb) => cb(null, file.originalname),
})
const upload = multer({ storage, limits: { fileSize: 300 * 1024 * 1024 } })

// GET /api/levels
router.get('/', requireAuth, (req, res) => {
  const levels = db.prepare(`
    SELECT l.*,
      (SELECT MAX(s.score) FROM scores s WHERE s.level_id = l.id AND s.user_id = ?) AS personal_best
    FROM levels l
    ORDER BY l.created_at DESC
  `).all(req.user.id)

  return res.json(
    levels.map((l) => ({
      id: l.id,
      title: l.title,
      artist: l.artist,
      bpm: l.bpm,
      duration: l.duration,
      maxScore: l.max_score,
      createdAt: l.created_at,
      personalBest: l.personal_best ?? null,
      videoPath: l.video_path ?? null,
    }))
  )
})

// GET /api/levels/:id — verbose single-level details
// ⚠ Flag 2 (Excessive Data Exposure): unlike the list endpoint above, this
// returns the *entire* levels row — including the private `creator_note`
// column and the server-side file paths. The UI only reads a couple of
// fields, so the leaked note rides along in the JSON unnoticed.
router.get('/:id', requireAuth, (req, res) => {
  const level = db.prepare('SELECT * FROM levels WHERE id = ?').get(req.params.id)
  if (!level) return res.status(404).json({ error: 'Level not found' })
  return res.json(level)
})

// GET /api/levels/:id/beats
router.get('/:id/beats', requireAuth, (req, res) => {
  const level = db.prepare('SELECT * FROM levels WHERE id = ?').get(req.params.id)
  if (!level) return res.status(404).json({ error: 'Level not found' })

  try {
    const raw = fs.readFileSync(resolveLevelFile(level.beats_path), 'utf8')
    const beats = JSON.parse(raw)
    return res.json(beats)
  } catch {
    return res.status(500).json({ error: 'Failed to read beats file' })
  }
})

// GET /api/levels/:id/audio — no auth required (audio is fetched by AudioContext which can't send headers)
router.get('/:id/audio', (req, res) => {
  const level = db.prepare('SELECT * FROM levels WHERE id = ?').get(req.params.id)
  if (!level) return res.status(404).json({ error: 'Level not found' })
  const audioPath = resolveLevelFile(level.audio_path)
  if (!fs.existsSync(audioPath)) {
    return res.status(404).json({ error: 'Audio file not found' })
  }
  // Set explicit content type based on extension
  const ext = path.extname(audioPath).toLowerCase()
  const mimeTypes = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.webm': 'audio/webm' }
  const mime = mimeTypes[ext] || 'audio/mpeg'
  res.setHeader('Content-Type', mime)
  res.sendFile(path.resolve(audioPath))
})

// GET /api/levels/:id/video — serves video file (mp4, webm)
router.get('/:id/video', (req, res) => {
  const level = db.prepare('SELECT * FROM levels WHERE id = ?').get(req.params.id)
  if (!level) return res.status(404).json({ error: 'Level not found' })
  const videoPath = resolveLevelFile(level.video_path)
  if (!videoPath || !fs.existsSync(videoPath)) {
    return res.status(404).json({ error: 'Video file not found' })
  }
  // Set explicit content type based on extension
  const ext = path.extname(videoPath).toLowerCase()
  const mimeTypes = { '.mp4': 'video/mp4', '.webm': 'video/webm' }
  const mime = mimeTypes[ext] || 'video/mp4'
  res.setHeader('Content-Type', mime)
  res.sendFile(path.resolve(videoPath))
})

// POST /api/levels/upload
router.post(
  '/upload',
  requireCreator,
  (req, res, next) => {
    upload.fields([
      { name: 'levelJson', maxCount: 1 },
      { name: 'beatsJson', maxCount: 1 },
      { name: 'audio',     maxCount: 1 },
      { name: 'video',     maxCount: 1 },
    ])(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'Upload too large. Max file size is 300MB per file.' })
        }
        return next(err)
      }
      return next()
    })
  },
  (req, res) => {
    try {
      const files = req.files
      if (!files.levelJson || !files.beatsJson || !files.audio) {
        return res.status(400).json({ error: 'levelJson, beatsJson, and audio are all required' })
      }

      const levelJsonPath = files.levelJson[0].path
      const beatsJsonPath = files.beatsJson[0].path
      const audioPath     = files.audio[0].path
      const videoPath     = files.video ? files.video[0].path : null

      const meta = JSON.parse(fs.readFileSync(levelJsonPath, 'utf8'))

      const result = db.prepare(`
        INSERT INTO levels (title, artist, bpm, duration, max_score, audio_path, beats_path, video_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        meta.title   || 'Untitled',
        meta.artist  || 'Unknown',
        meta.bpm     || 120,
        meta.duration || 0,
        meta.maxScore || meta.max_score || 0,
        audioPath,
        beatsJsonPath,
        videoPath
      )

      const level = db.prepare('SELECT * FROM levels WHERE id = ?').get(result.lastInsertRowid)
      return res.status(201).json({
        id: level.id,
        title: level.title,
        artist: level.artist,
        bpm: level.bpm,
        duration: level.duration,
        maxScore: level.max_score,
        videoPath: level.video_path ?? null,
      })
    } catch (err) {
      console.error(err)
      return res.status(500).json({ error: 'Upload failed: ' + err.message })
    }
  }
)

// DELETE /api/levels/:id
router.delete('/:id', requireCreator, (req, res) => {
  const level = db.prepare('SELECT * FROM levels WHERE id = ?').get(req.params.id)
  if (!level) return res.status(404).json({ error: 'Level not found' })

  try {
    db.prepare('DELETE FROM scores WHERE level_id = ?').run(level.id)
    db.prepare('DELETE FROM levels WHERE id = ?').run(level.id)
    removeLevelFiles(level)
    return res.json({ deleted: true })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to delete level' })
  }
})

module.exports = router
