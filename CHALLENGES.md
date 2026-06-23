# RHYTHM — CTF Challenge Guide (CLCTF 2026)

Five flags are hidden in this rhythm game. Point values are suggestions —
set the real values in CTFd.

| # | Title | Category | Pts | Flag |
|---|-------|----------|-----|------|
| 1 | Crumbs | Web / Recon | 100 | `CLCTF{wh0_w4ntz_c00ki3s}` |
| 2 | Oversharing API | Web / API | 300 | `CLCTF{4p1_t0ld_m3_t00_much}` |
| 3 | Impossible Score | Web / Logic | 300 | `CLCTF{w0w_g00d_sk1ll5}` |
| 4 | Console Cowboy | Client-side / JS | 500 | `CLCTF{This_Is_Fine_67}` |
| 5 | Drop the Beat | Forensics | 500 | `CLCTF{b34t_dr0p_st3g0_m4st3r}` |

> Players must register an account (any username/password) to reach the game.

---

## Flag 1 — Crumbs (100)
**Prompt:** "Good crawlers read the rules first."

**Solve**
1. Visit `/robots.txt` — it `Disallow`s `/admin` and leaks a flag in a comment.
2. That value is also the admin secret. Browse to `/admin` → "Access Denied".
3. Authenticate: `POST /api/auth/admin-login` with `{"secret":"CLCTF{wh0_w4ntz_c00ki3s}"}`
   (or set cookie `beat_game_admin=CLCTF{wh0_w4ntz_c00ki3s}`).
4. Reload `/admin` → "ACCESS GRANTED" image displays the flag.

**Where:** `frontend/public/robots.txt`, `backend/src/middleware/requireAdmin.js`

---

## Flag 2 — Oversharing API (300)  *(Excessive Data Exposure / OWASP API3)*
**Prompt:** "The level list is tidy. The level *detail* isn't."

**Solve**
1. Log in, open DevTools → Network. Starting a level fires `GET /api/levels/:id`.
2. `GET /api/levels` (the list) is clean, but `GET /api/levels/:id` returns the
   **whole DB row**, including a private `creator_note`.
3. Read the JSON response (any level id works) → flag.
   ```
   curl -s http://HOST/api/levels/1 -H "Authorization: Bearer <token>"
   ```

**Where:** `backend/src/routes/levels.js` (`GET /:id`), note seeded in
`backend/src/db.js` + `backend/src/seed.js`. Change the flag in those two spots.

---

## Flag 3 — Impossible Score (300)
**Prompt:** "670 billion? Nobody's *that* good."

**Solve**
1. Play any level so the client sends `POST /api/scores`.
2. Intercept it (Burp/DevTools) and set `score` ≥ `670000000000`
   (real max scores are ~1.2M — the backend never validates).
3. Return to the level-select screen → a "SCORE ACHIEVED" banner reveals the flag.

**Where:** `frontend/src/pages/LevelSelectPage.tsx` (`FLAG3_THRESHOLD`)

---

## Flag 4 — Console Cowboy (500)
**Prompt:** "Some globals bite back. Nothing gets printed."

**Solve**
1. Start playing a level (must be in the `playing` phase).
2. In the DevTools console, reference `clctf` (type `clctf` ⏎ or `window.clctf`).
3. A getter fires: nothing prints — instead the highway floods and a 22-column
   overlay + the D/F/J/K key labels **spell the flag on screen**. Read it off.

**Where:** `frontend/src/pages/GamePage.tsx` (`window.clctf` getter)

---

## Flag 5 — Drop the Beat (500)  *(Forensics — trailing-data stego)*
**Prompt:** "The beat video is bigger than it needs to be."

**Solve**
1. Levels have background videos. Download one (Waka Waka = level 6):
   `curl -s http://HOST/api/levels/6/video -o waka.mp4`
2. The flag is appended *after* the MP4 ends (playback unaffected). A plain
   `strings | grep CLCTF` finds nothing — the blob is base64 under a marker.
   ```
   binwalk waka.mp4        # or:  tail -c 60 waka.mp4
   # --BEATDROP--
   # Q0xDVEZ7YjM0dF9kcjBwX3N0M2cwX200c3Qzcn0=
   echo 'Q0xDVEZ7YjM0dF9kcjBwX3N0M2cwX200c3Qzcn0=' | base64 -d
   ```
3. Decode → flag.

**Where:** trailing bytes of
`backend/levels/upload_1782066355702/waka-waka.mp4`.
To re-plant after replacing the video:
```bash
{ printf '\n--BEATDROP--\n'; printf '%s' 'CLCTF{b34t_dr0p_st3g0_m4st3r}' | base64; printf '\n'; } >> path/to/served-video.mp4
```

---

## Deploy notes that affect the flags
- **Rebuild the frontend.** The committed `frontend/dist/` is a stale build with
  **no flags in it**. `docker-compose up --build` rebuilds from source (flags
  included); never serve the old `dist/` directly.
- **Keep `ADMIN_SECRET` = Flag 1.** It defaults to `CLCTF{wh0_w4ntz_c00ki3s}` in
  `docker-compose.yml`. If you change it, update `robots.txt` and
  `admin-flag.svg` to match.
- **Change `CREATOR_SECRET`** (`beats-creator-2026`) before hosting — it unlocks
  the real upload/delete admin panel and is **not** a flag.
- **DB paths are absolute** in the committed `rhythm.db` (`C:\Users\...`). On a
  fresh host, delete `backend/rhythm.db` and re-seed, or move the song folders
  under `backend/levels/bundled/` so they seed with portable paths.
