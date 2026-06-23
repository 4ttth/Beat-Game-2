import { useState } from 'react'
import { motion } from 'framer-motion'
import { api } from '../api/client'
import './UploadModal.css'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export default function UploadModal({ onClose, onSuccess }: Props) {
  const [levelJson, setLevelJson] = useState<File | null>(null)
  const [beatsJson, setBeatsJson] = useState<File | null>(null)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!levelJson || !beatsJson || !audioFile) {
      setError('Level JSON, beats JSON, and audio file are required')
      return
    }
    setLoading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('levelJson', levelJson)
      fd.append('beatsJson', beatsJson)
      fd.append('audio', audioFile)
      if (videoFile) {
        fd.append('video', videoFile)
      }
      await api.uploadLevel(fd)
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal-box card"
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 30 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">Upload Level</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <FileInput
            label="level.json"
            accept=".json"
            onChange={setLevelJson}
            file={levelJson}
          />
          <FileInput
            label="beats.json"
            accept=".json"
            onChange={setBeatsJson}
            file={beatsJson}
          />
          <FileInput
            label="Audio File (MP3, WAV, WEBM)"
            accept=".mp3,.wav,.webm,audio/*"
            onChange={setAudioFile}
            file={audioFile}
          />
          <FileInput
            label="Background Video (MP4, WEBM) - Optional"
            accept=".mp4,.webm,video/*"
            onChange={setVideoFile}
            file={videoFile}
            optional
          />

          {error && <p className="upload-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>

        <div className="modal-hint">
          <p>Use the Python converter to generate these files from an MP3:</p>
          <code>python converter/convert.py song.mp3 --title "Title" --artist "Artist"</code>
          <p style={{ marginTop: '12px', fontSize: '0.85rem' }}>You can optionally add a background video (MP4 or WEBM) to make the gameplay more immersive. The video will react to the beat with visual effects.</p>
        </div>
      </motion.div>
    </motion.div>
  )
}

function FileInput({
  label,
  accept,
  onChange,
  file,
  optional,
}: {
  label: string
  accept: string
  onChange: (f: File | null) => void
  file: File | null
  optional?: boolean
}) {
  return (
    <div className="file-input-group">
      <label className="form-label">{label}</label>
      <label className="file-drop">
        <input
          type="file"
          accept={accept}
          style={{ display: 'none' }}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
        <span className={file ? 'file-name-chosen' : 'file-name-placeholder'}>
          {file ? file.name : `Click to choose file${optional ? ' (optional)' : ''}`}
        </span>
      </label>
    </div>
  )
}
