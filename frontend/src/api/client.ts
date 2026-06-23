import { useAuthStore } from '../stores/authStore'

const BASE = '/api'

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const user = useAuthStore.getState().user
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }
  if (user?.token) {
    headers['Authorization'] = `Bearer ${user.token}`
  }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data as T
}

export const api = {
  // Auth
  register: (username: string, password: string) =>
    request<{ token: string; user: { id: number; username: string } }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  login: (username: string, password: string) =>
    request<{ token: string; user: { id: number; username: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  adminLogin: (secret: string) =>
    request<{ admin: boolean }>('/auth/admin-login', {
      method: 'POST',
      body: JSON.stringify({ secret }),
    }),

  adminLogout: () =>
    request<{ admin: boolean }>('/auth/admin-logout', {
      method: 'POST',
    }),

  getAdminStatus: () =>
    request<{ admin: boolean }>('/auth/admin-status'),

  creatorLogin: (secret: string) =>
    request<{ creator: boolean }>('/auth/creator-login', {
      method: 'POST',
      body: JSON.stringify({ secret }),
    }),

  creatorLogout: () =>
    request<{ creator: boolean }>('/auth/creator-logout', { method: 'POST' }),

  getCreatorStatus: () =>
    request<{ creator: boolean }>('/auth/creator-status'),

  // Levels
  getLevels: () =>
    request<Level[]>('/levels'),

  // Verbose single-level fetch — returns more than the UI uses (see Flag 2)
  getLevel: (id: number) =>
    request<Level & { creator_note?: string | null }>(`/levels/${id}`),

  getLevelBeats: (id: number) =>
    request<Beat[]>(`/levels/${id}/beats`),

  uploadLevel: (formData: FormData) =>
    request<Level>('/levels/upload', { method: 'POST', body: formData }),

  deleteLevel: (id: number) =>
    request<{ deleted: boolean }>(`/levels/${id}`, { method: 'DELETE' }),

  // Admin — users
  adminGetUsers: () =>
    request<AdminUser[]>('/admin/users'),

  adminCreateUser: (username: string, password: string) =>
    request<{ id: number; username: string }>('/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  adminUploadUsers: (list: { username: string; password: string }[]) =>
    request<{ created: number; failed: { username: string; reason: string }[] }>('/admin/users/upload', {
      method: 'POST',
      body: JSON.stringify(list),
    }),

  adminDeleteUser: (id: number) =>
    request<{ deleted: boolean; username: string }>(`/admin/users/${id}`, { method: 'DELETE' }),

  // Admin — levels
  adminGetLevels: () =>
    request<Level[]>('/admin/levels'),

  // Scores
  postScore: (payload: {
    levelId: number
    score: number
    accuracy: number
    maxCombo: number
    perfectCount: number
    goodCount: number
    okCount: number
    missCount: number
  }) => request<{ id: number }>('/scores', { method: 'POST', body: JSON.stringify(payload) }),

  // Leaderboards
  getLevelLeaderboard: (levelId: number) =>
    request<LeaderboardEntry[]>(`/leaderboard/${levelId}`),

  getGlobalLeaderboard: () =>
    request<GlobalEntry[]>('/leaderboard/global'),
}

// Shared types
export interface Level {
  id: number
  title: string
  artist: string
  bpm: number
  duration: number
  maxScore: number
  createdAt: string
  personalBest?: number | null
  videoPath?: string | null
}

export interface Beat {
  id: number
  time: number
  lane: 0 | 1 | 2 | 3
  type: 'tap' | 'hold'
  duration?: number
}

export interface LeaderboardEntry {
  rank: number
  username: string
  score: number
  accuracy: number
  maxCombo: number
}

export interface GlobalEntry {
  rank: number
  username: string
  totalScore: number
  levelsPlayed: number
}

export interface AdminUser {
  id: number
  username: string
  created_at: string
  score_count: number
}
