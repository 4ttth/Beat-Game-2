import type { Level } from '../api/client'

export interface CachedLevelAssets {
  audioUrl: string
  videoUrl: string | null
  videoType: string | null
}

type AssetState = {
  promise: Promise<CachedLevelAssets>
  assets?: CachedLevelAssets
}

const cache = new Map<number, AssetState>()

async function fetchBlobUrl(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`)
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

export function getCachedLevelAssets(levelId: number): CachedLevelAssets | null {
  return cache.get(levelId)?.assets ?? null
}

export function clearCachedLevelAssets(levelId: number) {
  const entry = cache.get(levelId)
  if (!entry?.assets) return

  URL.revokeObjectURL(entry.assets.audioUrl)
  if (entry.assets.videoUrl) URL.revokeObjectURL(entry.assets.videoUrl)
  cache.delete(levelId)
}

export async function preloadLevelAssets(level: Level): Promise<CachedLevelAssets> {
  const existing = cache.get(level.id)
  if (existing?.assets) return existing.assets
  if (existing?.promise) return existing.promise

  const promise = (async () => {
    const audioUrl = await fetchBlobUrl(`/api/levels/${level.id}/audio`)
    const videoUrl = level.videoPath ? await fetchBlobUrl(`/api/levels/${level.id}/video`) : null
    const videoType = level.videoPath
      ? (level.videoPath.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4')
      : null
    const assets = { audioUrl, videoUrl, videoType }
    cache.set(level.id, { promise, assets })
    return assets
  })()

  cache.set(level.id, { promise })
  return promise
}