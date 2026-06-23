# RHYTHM — Hyper-Casual Rhythm Game

A 4-lane falling-beat rhythm game with a Python MP3 converter.

## Quick Start

```
start.bat
```

Or manually:
```bash
# Terminal 1 — Backend
cd backend
npm.cmd run dev

# Terminal 2 — Frontend
cd frontend
npm.cmd run dev
```

Open http://localhost:5173

## Install Dependencies

```bash
# Root (concurrently)
npm.cmd install

# Frontend
cd frontend && npm.cmd install

# Backend (no native build tools needed)
cd backend && npm.cmd install --ignore-scripts
```

## Python Converter

Converts any MP3 to a game level.

### Setup
```bash
cd converter
pip install -r requirements.txt
```

### Usage
```bash
python convert.py song.mp3 --title "My Song" --artist "Artist Name" --output ./output
```

This produces `output/level.json` and `output/beats.json`.

### To add as a bundled level:
1. Create a folder: `backend/levels/bundled/my-song/`
2. Copy `level.json`, `beats.json`, and the MP3 (rename to `audio.mp3`) there
3. Restart the backend — it auto-seeds

### To upload via UI:
Use the **Upload Level** button on the level select screen.

## Controls

| Key | Lane |
|-----|------|
| D   | Lane 1 (Cyan) |
| F   | Lane 2 (Magenta) |
| J   | Lane 3 (Green) |
| K   | Lane 4 (Orange) |

Hold the key for hold notes.

## Streak System

| Hits | Multiplier | Effect |
|------|-----------|--------|
| 1–4  | 1x        | Normal |
| 5–9  | 2x        | Lane glow, hit bursts |
| 10–14| 3x        | Screen shake, bg pulse |
| 15+  | 4x        | HYPERACTIVE — rainbow lanes, particle storm |

Miss any beat = streak resets.

## Scoring

- Perfect (±30ms): 300 pts × multiplier
- Good (±70ms): 150 pts × multiplier  
- OK (±120ms): 75 pts × multiplier
- Miss: 0 pts, streak reset

## Stack

- **Frontend**: React + Vite + TypeScript, Framer Motion, GSAP, Zustand
- **Backend**: Express + sql.js (SQLite, no native deps)
- **Converter**: Python + librosa
