#!/usr/bin/env python3
"""
Rhythm Game — Audio to Level Converter
=====================================
Usage:
    python convert.py song.mp3 --title "My Song" --artist "Artist Name" [--output ./output]
    python convert.py song.mp4 --title "My Song" --artist "Artist Name" [--output ./output]

Supported formats: MP3, MP4, WAV, WEBM, OGG

Outputs:
    level.json  — level metadata (title, artist, bpm, duration, maxScore)
    beats.json  — beat map [{id, time, lane, type, duration?}, ...]
"""

import argparse
import json
import math
import os
import subprocess
import sys
import tempfile

import librosa
import numpy as np
from imageio_ffmpeg import get_ffmpeg_exe


# ── Constants ──────────────────────────────────────────────────────────────────

LANES = 4
MIN_GAP_SEC = 0.08          # minimum gap between beats in same lane (80ms)
HOLD_THRESHOLD_SEC = 0.30   # sustained pitch > 300ms becomes a hold beat
ONSET_MERGE_WINDOW = 0.05   # merge onsets within 50ms of a BPM beat
HOLD_END_PADDING_SEC = 0.18 # leave room before the next beat starts

# Scoring constants (must match frontend)
PERFECT_POINTS = 300
MAX_MULTIPLIER = 4

# ── Beat Detection ─────────────────────────────────────────────────────────────

def detect_beats(y: np.ndarray, sr: int) -> dict:
    """
    Combined BPM + onset detection.
    Returns dict with keys: bpm, beat_times, onset_times
    """
    # 1. BPM tracking — gives rhythmically stable beat positions
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units='frames')
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    bpm = float(tempo[0] if hasattr(tempo, '__len__') else tempo)

    # 2. Onset detection — fine-grained, reactive to individual hits
    onset_frames = librosa.onset.onset_detect(
        y=y, sr=sr,
        units='frames',
        pre_max=3, post_max=3,
        pre_avg=5, post_avg=5,
        delta=0.07, wait=4
    )
    onset_times = librosa.frames_to_time(onset_frames, sr=sr)
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    onset_strengths = librosa.frames_to_time(
        np.arange(len(onset_env)), sr=sr
    )  # we use onset_env for weighting below

    return {
        'bpm': bpm,
        'beat_times': beat_times,
        'onset_times': onset_times,
        'onset_env': onset_env,
        'hop_length': 512,
        'sr': sr,
    }


def merge_beats(beat_times: np.ndarray, onset_times: np.ndarray) -> list[float]:
    """
    Merge BPM beats (backbone) with onsets.
    - Keep all BPM beat times
    - Add onset times that are not within ONSET_MERGE_WINDOW of any BPM beat
    """
    merged = list(beat_times)

    for ot in onset_times:
        # Only add onset if it's far enough from any existing beat
        min_dist = min((abs(ot - bt) for bt in merged), default=999)
        if min_dist > ONSET_MERGE_WINDOW:
            merged.append(ot)

    merged.sort()
    return merged


# ── Hold Note Detection ─────────────────────────────────────────────────────────

def detect_hold_regions(y: np.ndarray, sr: int, beat_times: list[float]) -> dict[float, float]:
    """
    Detect sustained pitches using YIN pitch detection.
    Returns {beat_time: hold_duration} for beats that are actually held notes.
    """
    # Use harmonic component to isolate pitch-bearing sounds
    y_harm, _ = librosa.effects.hpss(y)

    try:
        f0 = librosa.yin(
            y_harm,
            fmin=librosa.note_to_hz('C2'),
            fmax=librosa.note_to_hz('C7'),
            sr=sr
        )
    except Exception:
        return {}

    times = librosa.times_like(f0, sr=sr)
    hold_map = {}

    for beat_idx, bt in enumerate(beat_times):
        # Find pitch at this beat time
        pitch_idx = np.searchsorted(times, bt)
        if pitch_idx >= len(f0):
            continue
        pitch_at_beat = f0[pitch_idx]
        if pitch_at_beat < 50:  # unvoiced
            continue

        # Measure how long this pitch is sustained within ±20% frequency tolerance
        sustained_end = bt
        tolerance = 0.20

        for i in range(pitch_idx, min(pitch_idx + int(sr / 512 * 3), len(f0))):
            if f0[i] < 50:
                break
            rel_diff = abs(f0[i] - pitch_at_beat) / pitch_at_beat
            if rel_diff > tolerance:
                break
            sustained_end = times[i]

        duration = sustained_end - bt
        if beat_idx + 1 < len(beat_times):
            next_beat = beat_times[beat_idx + 1]
            max_duration = max(0.0, next_beat - bt - HOLD_END_PADDING_SEC)
            duration = min(duration, max_duration)

        if duration >= HOLD_THRESHOLD_SEC:
            hold_map[bt] = round(duration, 3)

    return hold_map


# ── Lane Assignment ────────────────────────────────────────────────────────────

def assign_lanes(
    beat_times: list[float],
    onset_env: np.ndarray,
    hop_length: int,
    sr: int
) -> list[int]:
    """
    Assign each beat to a lane (0–3).
    Rules:
    - Never repeat the same lane twice in a row
    - Weight by onset strength (stronger onsets get more central lanes 1 & 2)
    - Apply per-lane minimum gap to avoid clustering
    """
    lanes_last_time = [-999.0] * LANES
    lane_counts = [0] * LANES
    last_lane = -1
    assignments = []

    for beat_index, bt in enumerate(beat_times):
        # Get onset strength at this time
        frame = librosa.time_to_frames(bt, sr=sr, hop_length=hop_length)
        frame = min(frame, len(onset_env) - 1)
        strength = onset_env[frame]

        # Build candidate list weighted by strength
        # Strong hits (>0.7 normalized) prefer outer lanes (0, 3) for emphasis
        norm_env = onset_env.max()
        norm_strength = strength / norm_env if norm_env > 0 else 0.5

        if norm_strength > 0.7:
            preference = [0, 3, 1, 2] if beat_index % 2 == 0 else [3, 0, 2, 1]
        elif norm_strength > 0.4:
            preference = [1, 2, 0, 3] if beat_index % 2 == 0 else [2, 1, 3, 0]
        else:
            preference = [0, 1, 2, 3] if beat_index % 2 == 0 else [3, 2, 1, 0]

        chosen = -1
        chosen_score = -1e9
        for rank, candidate in enumerate(preference):
            if bt - lanes_last_time[candidate] < MIN_GAP_SEC:
                continue

            score = 4.0 - rank
            score -= lane_counts[candidate] * 0.65

            if candidate in (0, 3):
                score += 0.9 if norm_strength < 0.55 else 0.4
            else:
                score += 0.45 if norm_strength >= 0.55 else 0.2

            if candidate == last_lane:
                score -= 1.2

            if score > chosen_score:
                chosen_score = score
                chosen = candidate

        # Fallback: pick any available lane that does not immediately repeat.
        if chosen == -1:
            for candidate in range(LANES):
                if candidate != last_lane and bt - lanes_last_time[candidate] >= MIN_GAP_SEC:
                    chosen = candidate
                    break
        if chosen == -1:
            chosen = (last_lane + 1) % LANES

        assignments.append(chosen)
        lanes_last_time[chosen] = bt
        lane_counts[chosen] += 1
        last_lane = chosen

    return assignments


# ── Max Score Calculation ──────────────────────────────────────────────────────

def compute_max_score(beat_count: int) -> int:
    """
    Theoretical max: every beat hit as Perfect at 4x multiplier.
    Accounts for the ramp-up: first 14 beats are below 4x.
    Beat  1– 4: 1x
    Beat  5– 9: 2x
    Beat 10–14: 3x
    Beat 15+:   4x
    """
    score = 0
    for i in range(beat_count):
        if i < 5:
            mult = 1
        elif i < 10:
            mult = 2
        elif i < 15:
            mult = 3
        else:
            mult = 4
        score += PERFECT_POINTS * mult
    return score


# ── Audio Extraction ────────────────────────────────────────────────────────────

def extract_audio_from_video(video_path: str) -> str:
    """
    Extract audio from MP4 or other video containers using the bundled ffmpeg.
    Returns path to temporary WAV file.
    """
    print(f"[converter] Extracting audio from video...")
    try:
        ffmpeg_exe = get_ffmpeg_exe()

        # Export to temporary WAV file
        temp_wav = tempfile.NamedTemporaryFile(suffix='.wav', delete=False).name
        subprocess.run(
            [
                ffmpeg_exe,
                '-y',
                '-i', video_path,
                '-vn',
                '-acodec', 'pcm_s16le',
                temp_wav,
            ],
            check=True,
            capture_output=True,
        )
        
        return temp_wav
    except subprocess.CalledProcessError as e:
        stderr = e.stderr.decode('utf-8', errors='replace') if e.stderr else str(e)
        raise RuntimeError(f'Failed to extract audio from video: {stderr}')
    except Exception as e:
        raise RuntimeError(f'Failed to extract audio from video: {str(e)}')


# ── Main ────────────────────────────────────────────────────────────────────────

def convert(audio_path: str, title: str, artist: str, output_dir: str):
    temp_wav = None
    try:
        # If it's an MP4 or other video container, extract audio first
        file_ext = os.path.splitext(audio_path)[1].lower()
        if file_ext in ['.mp4', '.webm', '.mkv', '.mov', '.avi']:
            temp_wav = extract_audio_from_video(audio_path)
            load_path = temp_wav
        else:
            load_path = audio_path

        print(f"[converter] Loading: {audio_path}")
        y, sr = librosa.load(load_path, sr=None, mono=True)
        duration = float(librosa.get_duration(y=y, sr=sr))
        print(f"[converter] Duration: {duration:.2f}s  SR: {sr}Hz")

        print("[converter] Detecting beats...")
        result = detect_beats(y, sr)
        bpm = result['bpm']
        beat_times = result['beat_times']
        onset_times = result['onset_times']
        onset_env = result['onset_env']
        hop_length = result['hop_length']
        print(f"[converter] BPM: {bpm:.1f}  BPM beats: {len(beat_times)}  Onsets: {len(onset_times)}")

        print("[converter] Merging BPM beats + onsets...")
        merged_times = merge_beats(beat_times, onset_times)
        print(f"[converter] Merged beat count: {len(merged_times)}")

        print("[converter] Detecting hold notes...")
        hold_map = detect_hold_regions(y, sr, merged_times)
        print(f"[converter] Hold notes found: {len(hold_map)}")

        print("[converter] Assigning lanes...")
        lane_assignments = assign_lanes(merged_times, onset_env, hop_length, sr)

        # Build beat objects
        beats = []
        for i, (bt, lane) in enumerate(zip(merged_times, lane_assignments)):
            beat: dict = {
                'id': i,
                'time': round(float(bt), 4),
                'lane': int(lane),
                'type': 'tap',
            }
            if bt in hold_map:
                beat['type'] = 'hold'
                beat['duration'] = hold_map[bt]
            beats.append(beat)

        max_score = compute_max_score(len(beats))

        # Level metadata
        level_meta = {
            'title': title,
            'artist': artist,
            'bpm': round(bpm, 1),
            'duration': round(duration, 3),
            'maxScore': max_score,
            'beatCount': len(beats),
            'holdCount': len(hold_map),
        }

        # Write output
        os.makedirs(output_dir, exist_ok=True)
        level_path = os.path.join(output_dir, 'level.json')
        beats_path = os.path.join(output_dir, 'beats.json')

        with open(level_path, 'w', encoding='utf-8') as f:
            json.dump(level_meta, f, indent=2)

        with open(beats_path, 'w', encoding='utf-8') as f:
            json.dump(beats, f, indent=2)

        print(f"\n[converter] Done!")
        print(f"  level.json  → {level_path}")
        print(f"  beats.json  → {beats_path}")
        print(f"  Beats: {len(beats)}  |  Holds: {len(hold_map)}  |  Max Score: {max_score:,}")
        print(f"\nTo use in game, copy these files + the audio file into a folder under backend/levels/bundled/")
        print(f"Or upload them via the game's Upload Level interface.")

    finally:
        # Clean up temporary audio extraction
        if temp_wav and os.path.exists(temp_wav):
            os.unlink(temp_wav)


def main():
    parser = argparse.ArgumentParser(description='Convert audio (MP3, MP4, WAV, etc.) to a Rhythm game level')
    parser.add_argument('audio', help='Path to the audio file (MP3, MP4, WAV, WEBM, OGG, etc.)')
    parser.add_argument('--title',  default='Untitled', help='Song title')
    parser.add_argument('--artist', default='Unknown',  help='Artist name')
    parser.add_argument('--output', default='./output', help='Output directory')
    args = parser.parse_args()

    if not os.path.exists(args.audio):
        print(f"[error] File not found: {args.audio}", file=sys.stderr)
        sys.exit(1)

    convert(args.audio, args.title, args.artist, args.output)


if __name__ == '__main__':
    main()
