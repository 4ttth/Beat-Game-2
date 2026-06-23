/**
 * db.js — SQLite via sql.js (pure WASM, no native build required)
 *
 * sql.js keeps the DB in memory and periodically persists it to disk.
 * We expose a synchronous-style wrapper so all route code stays the same.
 */

const path = require('path')
const fs = require('fs')

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'rhythm.db')

// sql.js is async on init; we export a promise and a sync-like proxy
let _db = null
let _dirty = false

// Persist on every write
function persist() {
  if (!_db || !_dirty) return
  const data = _db.export()
  fs.writeFileSync(DB_PATH, Buffer.from(data))
  _dirty = false
}

// Flush every 2 seconds and on process exit
setInterval(persist, 2000)
process.on('exit', persist)
process.on('SIGINT', () => { persist(); process.exit() })

async function initDb() {
  const initSqlJs = require('sql.js')
  const SQL = await initSqlJs()

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH)
    _db = new SQL.Database(fileBuffer)
  } else {
    _db = new SQL.Database()
  }

  // Schema
  _db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      username    TEXT    NOT NULL UNIQUE,
      password    TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token       TEXT    PRIMARY KEY,
      user_id     INTEGER NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS levels (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      artist      TEXT    NOT NULL DEFAULT 'Unknown',
      bpm         REAL    NOT NULL DEFAULT 120,
      duration    REAL    NOT NULL DEFAULT 0,
      max_score   INTEGER NOT NULL DEFAULT 0,
      audio_path  TEXT    NOT NULL,
      beats_path  TEXT    NOT NULL,
      video_path   TEXT,
      creator_note TEXT,
      is_bundled   INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scores (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      level_id      INTEGER NOT NULL,
      score         INTEGER NOT NULL DEFAULT 0,
      accuracy      INTEGER NOT NULL DEFAULT 0,
      max_combo     INTEGER NOT NULL DEFAULT 0,
      perfect_count INTEGER NOT NULL DEFAULT 0,
      good_count    INTEGER NOT NULL DEFAULT 0,
      ok_count      INTEGER NOT NULL DEFAULT 0,
      miss_count    INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `)

  // Backfill schema changes for existing databases.
  const levelsStmt = _db.prepare('PRAGMA table_info(levels)')
  const levelsColumns = []
  while (levelsStmt.step()) {
    levelsColumns.push(levelsStmt.getAsObject())
  }
  levelsStmt.free()
  const hasVideoPath = levelsColumns.some((col) => col.name === 'video_path')
  if (!hasVideoPath) {
    _db.run('ALTER TABLE levels ADD COLUMN video_path TEXT')
  }

  const hasCreatorNote = levelsColumns.some((col) => col.name === 'creator_note')
  if (!hasCreatorNote) {
    _db.run('ALTER TABLE levels ADD COLUMN creator_note TEXT')
  }

  // ── Flag 2 (Excessive Data Exposure / OWASP API3) ──────────────────────────
  // Every level carries a private "creator note". The public GET /api/levels
  // list endpoint explicitly omits this column, but the verbose
  // GET /api/levels/:id endpoint returns the whole row — leaking it to anyone
  // who reads the API response (DevTools → Network, or a plain curl).
  _db.run("UPDATE levels SET creator_note = 'CLCTF{4p1_t0ld_m3_t00_much}' WHERE creator_note IS NULL")

  _dirty = true
  persist()
  return _db
}

/**
 * Synchronous query helpers — mirrors better-sqlite3 API used in routes
 */
const db = {
  _getDb() {
    if (!_db) throw new Error('Database not initialized. Await db.ready first.')
    return _db
  },

  prepare(sql) {
    const self = this
    return {
      // .get(...params) → first row or undefined
      get(...params) {
        const d = self._getDb()
        const stmt = d.prepare(sql)
        stmt.bind(params)
        const result = stmt.step() ? stmt.getAsObject() : undefined
        stmt.free()
        return result
      },
      // .all(...params) → array of rows
      all(...params) {
        const d = self._getDb()
        const stmt = d.prepare(sql)
        stmt.bind(params)
        const rows = []
        while (stmt.step()) rows.push(stmt.getAsObject())
        stmt.free()
        return rows
      },
      // .run(...params) → { lastInsertRowid, changes }
      run(...params) {
        const d = self._getDb()
        d.run(sql, params)
        _dirty = true
        const lastInsertRowid = d.exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? 0
        return { lastInsertRowid, changes: d.getRowsModified() }
      },
    }
  },

  exec(sql) {
    const d = this._getDb()
    _dirty = true
    return d.exec(sql)
  },

  run(sql, params = []) {
    const d = this._getDb()
    d.run(sql, params)
    _dirty = true
  },

  // Promise that resolves once DB is ready
  ready: null,
}

db.ready = initDb().then((instance) => {
  _db = instance
  return db
})

module.exports = db
