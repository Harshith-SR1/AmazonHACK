import { useEffect, useState, useRef } from 'react'
import { jsonFetch } from '../apiClient'

const SESSION_KEY = 'unison_session_start'

function getSessionStart() {
  let start = sessionStorage.getItem(SESSION_KEY)
  if (!start) {
    start = new Date().toISOString()
    sessionStorage.setItem(SESSION_KEY, start)
  }
  return start
}

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function CircularProgress({ value, max, label, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const r = 38, circumference = 2 * Math.PI * r
  const offset = circumference - (pct / 100) * circumference

  return (
    <div className="circular-progress">
      <svg viewBox="0 0 100 100" className="circular-svg">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#1a263b" strokeWidth="7" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          transform="rotate(-90 50 50)" className="circular-fill"
        />
      </svg>
      <div className="circular-label">
        <span className="circular-pct">{Math.round(pct)}%</span>
        <span className="circular-name">{label}</span>
      </div>
    </div>
  )
}

function UsageBar({ label, value, max, color, count }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="usage-bar-row">
      <span className="usage-bar-label">{label}</span>
      <div className="usage-bar-track">
        <div className="usage-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="usage-bar-value">{count || 0}</span>
    </div>
  )
}

const MODALITY_ICONS = {
  mic: '🎤', hand: '👋', device: '📱', sign: '🤟', settings: '⚙️', morse: '📡', text: '💬'
}

export default function AppUsageScreen() {
  const sessionStart = useRef(getSessionStart()).current
  const [elapsed, setElapsed] = useState(0)
  const [featureUsage, setFeatureUsage] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const tick = () => setElapsed(Date.now() - new Date(sessionStart).getTime())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [sessionStart])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await jsonFetch('/api/usage/stats')
        if (!res.ok) throw new Error('Failed to load')
        const data = await res.json()
        if (cancelled) return
        setFeatureUsage(data.features || [])
        setSessions(data.sessions || [])
      } catch {
        if (cancelled) return
        const stored = JSON.parse(localStorage.getItem('omniaccess_usage') || '[]')
        setFeatureUsage([
          { name: 'Voice Commands', time_ms: 0, count: 0, icon: 'mic' },
          { name: 'Gesture Control', time_ms: 0, count: 0, icon: 'hand' },
          { name: 'Sign Language', time_ms: 0, count: 0, icon: 'sign' },
          { name: 'Morse Code', time_ms: 0, count: 0, icon: 'morse' },
          { name: 'Device Automation', time_ms: 0, count: 0, icon: 'device' },
        ])
        setSessions(stored)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const pollInterval = setInterval(load, 10000)
    return () => { cancelled = true; clearInterval(pollInterval) }
  }, [])

  useEffect(() => {
    const save = () => {
      const current = {
        id: sessionStart,
        startedAt: sessionStart,
        endedAt: new Date().toISOString(),
        duration_ms: Date.now() - new Date(sessionStart).getTime(),
      }
      const stored = JSON.parse(localStorage.getItem('omniaccess_usage') || '[]')
      const idx = stored.findIndex((s) => s.id === current.id)
      if (idx >= 0) stored[idx] = current
      else stored.unshift(current)
      localStorage.setItem('omniaccess_usage', JSON.stringify(stored.slice(0, 30)))
    }
    const id = setInterval(save, 5000)
    save()
    return () => clearInterval(id)
  }, [sessionStart])

  const maxFeatureCount = Math.max(...featureUsage.map((f) => f.count || 0), 1)
  const totalActions = featureUsage.reduce((s, f) => s + (f.count || 0), 0)
  const featureColors = ['#00d3c1', '#4b69ff', '#ff6b6b', '#ffa94d', '#a78bfa', '#f472b6']

  // Calculate hours and minutes for the ring display
  const elapsedMin = Math.floor(elapsed / 60000)
  const dailyGoalMin = 120 // 2 hours daily goal

  return (
    <div className="usage-screen">
      <div className="usage-header">
        <svg className="usage-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <h3>Dashboard</h3>
      </div>

      {/* Live session with ring */}
      <div className="usage-live-card glass-card">
        <div className="usage-live-ring">
          <CircularProgress value={elapsedMin} max={dailyGoalMin} label="Session" color="#00d3c1" />
        </div>
        <div className="usage-live-info">
          <div className="usage-live-pulse" />
          <span className="usage-live-label">Current Session</span>
          <span className="usage-live-timer">{formatDuration(elapsed)}</span>
          <span className="usage-live-meta">Started {formatTime(sessionStart)}</span>
        </div>
      </div>

      {/* Stats cards */}
      <div className="usage-stats-row">
        <div className="usage-stat-card glass-card">
          <span className="usage-stat-icon">⚡</span>
          <span className="usage-stat-value">{totalActions}</span>
          <span className="usage-stat-label">Actions</span>
        </div>
        <div className="usage-stat-card glass-card">
          <span className="usage-stat-icon">🎯</span>
          <span className="usage-stat-value">{featureUsage.filter(f => f.count > 0).length}</span>
          <span className="usage-stat-label">Modalities</span>
        </div>
        <div className="usage-stat-card glass-card">
          <span className="usage-stat-icon">📊</span>
          <span className="usage-stat-value">{sessions.length}</span>
          <span className="usage-stat-label">Sessions</span>
        </div>
      </div>

      {/* Feature breakdown */}
      <div className="usage-section">
        <h4>Input Modalities</h4>
        {loading ? (
          <p className="usage-empty">Loading...</p>
        ) : (
          <div className="usage-bars">
            {featureUsage.map((f, i) => (
              <UsageBar
                key={f.name}
                label={`${MODALITY_ICONS[f.icon] || '📌'} ${f.name}`}
                value={f.count || 0}
                max={maxFeatureCount}
                color={featureColors[i % featureColors.length]}
                count={f.count}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent sessions */}
      <div className="usage-section">
        <h4>Recent Sessions</h4>
        {sessions.length === 0 && !loading ? (
          <p className="usage-empty">No previous sessions</p>
        ) : (
          <div className="usage-session-list">
            {sessions.slice(0, 8).map((s) => (
              <div key={s.id || s.startedAt} className="usage-session-item glass-card">
                <div className="usage-session-top">
                  <span className="usage-session-date">{formatDate(s.startedAt)}</span>
                  <span className="usage-session-dur">{formatDuration(s.duration_ms)}</span>
                </div>
                <div className="usage-session-times">
                  <span>{formatTime(s.startedAt)}</span>
                  <svg width="14" height="8" viewBox="0 0 14 8"><path d="M0 4h12M10 1l3 3-3 3" stroke="#607090" fill="none" strokeWidth="1.5" /></svg>
                  <span>{formatTime(s.endedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>


    </div>
  )
}
