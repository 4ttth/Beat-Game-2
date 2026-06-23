import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { api, AdminUser, Level } from '../api/client'
import UploadModal from '../components/UploadModal'
import './AdminPage.css'

type Access = 'loading' | 'creator' | 'ctf' | 'denied'
type Tab = 'users' | 'levels'

export default function AdminPage() {
  const [access, setAccess] = useState<Access>('loading')

  useEffect(() => {
    Promise.all([api.getCreatorStatus(), api.getAdminStatus()])
      .then(([{ creator }, { admin }]) => {
        if (creator) setAccess('creator')
        else if (admin) setAccess('ctf')
        else setAccess('denied')
      })
      .catch(() => setAccess('denied'))
  }, [])

  if (access === 'loading') return <LoadingScreen />
  if (access === 'denied')  return <DeniedScreen />
  if (access === 'ctf')     return <FlagScreen />
  return <CreatorPanel />
}

// ── Loading ──────────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="admin-page page">
      <div className="admin-loading">
        <div className="admin-spinner" />
        <span>Checking access...</span>
      </div>
    </div>
  )
}

// ── Access Denied ─────────────────────────────────────────────────────────────

function DeniedScreen() {
  return (
    <div className="admin-page page">
      <div className="admin-denied">
        <h2>Access Denied</h2>
        <p>You do not have permission to view this page.</p>
      </div>
    </div>
  )
}

// ── CTF flag image (shown to anyone who solves the cookie challenge) ──────────

function FlagScreen() {
  async function handleLogout() {
    await api.adminLogout()
    window.location.reload()
  }

  return (
    <div className="admin-page page admin-flag-page">
      <button className="admin-flag-logout btn btn-danger" onClick={handleLogout}>
        Logout
      </button>
      <div className="admin-flag-wrap">
        <img
          className="admin-flag-img"
          src="/admin-flag.svg"
          alt="Admin access granted"
          draggable={false}
        />
      </div>
    </div>
  )
}

// ── Creator panel (upload / delete users / delete levels) ─────────────────────

function CreatorPanel() {
  const [tab, setTab] = useState<Tab>('users')

  // Users
  const [users, setUsers] = useState<AdminUser[]>([])
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [userMsg, setUserMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [uploadResult, setUploadResult] = useState<{
    created: number
    failed: { username: string; reason: string }[]
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Levels
  const [levels, setLevels] = useState<Level[]>([])
  const [showUpload, setShowUpload] = useState(false)

  useEffect(() => {
    fetchUsers()
    fetchLevels()
  }, [])

  async function fetchUsers() {
    try { setUsers(await api.adminGetUsers()) } catch {}
  }

  async function fetchLevels() {
    try { setLevels(await api.adminGetLevels()) } catch {}
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault()
    setUserMsg(null)
    setUploadResult(null)
    try {
      await api.adminCreateUser(newUsername.trim(), newPassword)
      setUserMsg({ text: `User "${newUsername.trim()}" created.`, ok: true })
      setNewUsername('')
      setNewPassword('')
      fetchUsers()
    } catch (err) {
      setUserMsg({ text: err instanceof Error ? err.message : 'Failed', ok: false })
    }
  }

  async function handleDeleteUser(id: number, username: string) {
    if (!confirm(`Delete user "${username}" and all their scores?`)) return
    try {
      await api.adminDeleteUser(id)
      setUsers((u) => u.filter((x) => x.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  function handleUsersJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUserMsg(null)
    setUploadResult(null)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const list = JSON.parse(ev.target?.result as string)
        const result = await api.adminUploadUsers(list)
        setUploadResult(result)
        fetchUsers()
      } catch {
        setUserMsg({ text: 'Invalid JSON or upload failed', ok: false })
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleDeleteLevel(id: number, title: string) {
    if (!confirm(`Delete level "${title}"?`)) return
    try {
      await api.deleteLevel(id)
      setLevels((l) => l.filter((x) => x.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  async function handleLogout() {
    await api.creatorLogout()
    window.location.reload()
  }

  return (
    <div className="admin-page page page-scrollable">
      <header className="admin-header">
        <h1 className="admin-logo">Admin Panel</h1>
        <button className="btn btn-danger" onClick={handleLogout}>Logout</button>
      </header>

      <div className="admin-tabs">
        <button
          className={`admin-tab ${tab === 'users' ? 'active' : ''}`}
          onClick={() => setTab('users')}
        >
          Users ({users.length})
        </button>
        <button
          className={`admin-tab ${tab === 'levels' ? 'active' : ''}`}
          onClick={() => setTab('levels')}
        >
          Levels ({levels.length})
        </button>
      </div>

      <main className="admin-main">
        {tab === 'users' && (
          <div className="admin-section">
            <div className="card admin-card">
              <h3 className="admin-card-title">Add User</h3>
              <form className="admin-form" onSubmit={handleAddUser}>
                <input
                  className="input"
                  placeholder="Username"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  autoComplete="off"
                />
                <input
                  className="input"
                  type="password"
                  placeholder="Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button className="btn btn-primary" type="submit">Create</button>
              </form>

              <div className="admin-bulk-upload">
                <span className="admin-bulk-label">Bulk import</span>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload JSON
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                  onChange={handleUsersJson}
                />
                <span className="admin-td-dim" style={{ fontSize: '0.75rem' }}>
                  — array of &#123; username, password &#125;
                </span>
              </div>

              {userMsg && (
                <p className={userMsg.ok ? 'admin-success' : 'admin-error'}>{userMsg.text}</p>
              )}
              {uploadResult && (
                <div className="admin-upload-result">
                  <span className="admin-success">{uploadResult.created} created</span>
                  {uploadResult.failed.length > 0 && (
                    <span className="admin-error">{uploadResult.failed.length} failed</span>
                  )}
                </div>
              )}
            </div>

            <div className="card admin-card">
              <h3 className="admin-card-title">All Users ({users.length})</h3>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th><th>Username</th><th>Created</th><th>Scores</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td className="admin-td-dim">{u.id}</td>
                        <td className="admin-td-username">{u.username}</td>
                        <td className="admin-td-dim">{new Date(u.created_at).toLocaleDateString()}</td>
                        <td className="admin-td-dim">{u.score_count}</td>
                        <td>
                          <button
                            className="btn btn-danger admin-btn-sm"
                            onClick={() => handleDeleteUser(u.id, u.username)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr><td colSpan={5} className="admin-empty-row">No users yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'levels' && (
          <div className="admin-section">
            <div className="admin-levels-header">
              <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
                + Upload Level
              </button>
            </div>

            <div className="card admin-card">
              <h3 className="admin-card-title">All Levels ({levels.length})</h3>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th><th>Title</th><th>Artist</th><th>BPM</th><th>Duration</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {levels.map((l) => (
                      <tr key={l.id}>
                        <td className="admin-td-dim">{l.id}</td>
                        <td className="admin-td-title">{l.title}</td>
                        <td className="admin-td-dim">{l.artist}</td>
                        <td className="admin-td-dim">{l.bpm}</td>
                        <td className="admin-td-dim">{formatTime(l.duration)}</td>
                        <td>
                          <button
                            className="btn btn-danger admin-btn-sm"
                            onClick={() => handleDeleteLevel(l.id, l.title)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {levels.length === 0 && (
                      <tr><td colSpan={6} className="admin-empty-row">No levels yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      <AnimatePresence>
        {showUpload && (
          <UploadModal
            onClose={() => setShowUpload(false)}
            onSuccess={() => { setShowUpload(false); fetchLevels() }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
