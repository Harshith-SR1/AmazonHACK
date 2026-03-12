import { useEffect, useRef, useState, useCallback } from 'react'
import { Hands } from '@mediapipe/hands'
import { Camera } from '@mediapipe/camera_utils'
import { jsonFetch } from '../apiClient'

export default function GestureTrainingScreen() {
  const [activeTab, setActiveTab] = useState('custom')
  const [name, setName] = useState('')
  const [task, setTask] = useState('')
  const [signLabel, setSignLabel] = useState('hello')
  const [currentLandmarks, setCurrentLandmarks] = useState([])
  const [isRecording, setIsRecording] = useState(false)
  const [recordedFrames, setRecordedFrames] = useState([])
  const [recordCountdown, setRecordCountdown] = useState(0)
  const [predictedSign, setPredictedSign] = useState('')
  const [status, setStatus] = useState('')
  const [vocabulary, setVocabulary] = useState(null)
  const [signStats, setSignStats] = useState(null)
  const [savedGestures, setSavedGestures] = useState([])
  const [lastAction, setLastAction] = useState(null)
  const [cameraActive, setCameraActive] = useState(false)
  const videoRef = useRef(null)
  const cameraRef = useRef(null)
  const handsRef = useRef(null)
  const recordingRef = useRef(false)
  const countdownRef = useRef(null)

  // Keep recording ref in sync
  useEffect(() => { recordingRef.current = isRecording }, [isRecording])

  // Load vocabulary, stats, saved gestures on mount
  useEffect(() => {
    jsonFetch('/api/sign/vocabulary')
      .then(r => r.json()).then(d => d.ok && setVocabulary(d.signs)).catch(() => {})
    refreshStats()
    loadSavedGestures()
  }, [])

  const refreshStats = () => {
    jsonFetch('/api/sign/stats')
      .then(r => r.json()).then(d => d.ok && setSignStats(d)).catch(() => {})
  }

  const loadSavedGestures = () => {
    jsonFetch('/api/gesture/custom')
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setSavedGestures(d) }).catch(() => {})
  }

  const deleteGesture = useCallback(async (gestureName) => {
    try {
      const res = await jsonFetch(`/api/gesture/custom/${encodeURIComponent(gestureName)}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        setSavedGestures(prev => prev.filter(g => g.name !== gestureName))
        setStatus(`Deleted gesture "${gestureName}"`)
      }
    } catch { setStatus('Failed to delete gesture') }
  }, [])

  // Start camera + MediaPipe
  const startCamera = useCallback(() => {
    if (cameraActive || !videoRef.current) return
    setCameraActive(true)

    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    })
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 })
    hands.onResults((results) => {
      const landmarks = results.multiHandLandmarks?.[0] || []
      if (!landmarks.length) return
      const normalized = landmarks.map(lm => [lm.x, lm.y, lm.z])
      setCurrentLandmarks(normalized)
      if (recordingRef.current) {
        setRecordedFrames(prev => [...prev.slice(-59), normalized])
      }
    })
    handsRef.current = hands

    const camera = new Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current && handsRef.current) {
          try { await handsRef.current.send({ image: videoRef.current }) } catch {}
        }
      },
      width: 640, height: 360
    })
    camera.start()
    cameraRef.current = camera
  }, [cameraActive])

  const stopCamera = useCallback(() => {
    cameraRef.current?.stop()
    cameraRef.current = null
    handsRef.current = null
    setCameraActive(false)
    setCurrentLandmarks([])
  }, [])

  // Cleanup on unmount
  useEffect(() => () => { cameraRef.current?.stop(); clearInterval(countdownRef.current) }, [])

  const representativeLandmarks = () => {
    if (recordedFrames.length === 0) return currentLandmarks
    return recordedFrames[Math.floor(recordedFrames.length / 2)]
  }

  // 3-second countdown recording
  const startRecording = useCallback(() => {
    setRecordedFrames([])
    setRecordCountdown(3)
    let count = 3
    countdownRef.current = setInterval(() => {
      count--
      if (count > 0) {
        setRecordCountdown(count)
      } else {
        clearInterval(countdownRef.current)
        setRecordCountdown(0)
        setIsRecording(true)
        // Auto-stop after 3 seconds of recording
        setTimeout(() => { setIsRecording(false); setStatus('Recording complete! Review frames then save.') }, 3000)
      }
    }, 1000)
  }, [])

  const saveGesture = async () => {
    if (!name.trim()) { setStatus('Enter a gesture name'); return }
    if (!task.trim()) { setStatus('Enter a mapped task/command'); return }
    const landmarks = representativeLandmarks()
    if (!landmarks?.length) { setStatus('No landmarks captured. Start camera and record a gesture.'); return }
    try {
      const res = await jsonFetch('/api/gesture/train', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), mapped_task: task.trim(), landmarks })
      })
      const data = await res.json()
      if (data.ok) {
        setStatus(`✓ Gesture "${data.gesture}" saved!`)
        setName(''); setTask(''); setRecordedFrames([])
        loadSavedGestures()
      } else { setStatus('Failed to save gesture') }
    } catch (err) { setStatus(`Error: ${err.message}`) }
  }

  const trainSign = async () => {
    const landmarks = representativeLandmarks()
    if (!landmarks?.length) { setStatus('No landmarks captured for sign training.'); return }
    try {
      const res = await jsonFetch('/api/sign/train', {
        method: 'POST', body: JSON.stringify({ label: signLabel, landmarks })
      })
      const data = await res.json()
      setStatus(data.ok ? `✓ Sign "${data.label}" trained${data.action ? ` → ${data.action}` : ''}` : data.error || 'Sign train failed')
      refreshStats()
    } catch (err) { setStatus(`Error: ${err.message}`) }
  }

  const predictSign = async () => {
    if (!currentLandmarks?.length) { setPredictedSign('No hand detected'); return }
    try {
      const res = await jsonFetch('/api/sign/predict', {
        method: 'POST', body: JSON.stringify({ landmarks: currentLandmarks })
      })
      const data = await res.json()
      setPredictedSign(data.ok
        ? `${data.predicted_label} (${Math.round(data.confidence * 100)}%) → ${data.action || 'no action'} [${data.method}]`
        : data.error)
    } catch (err) { setPredictedSign(`Error: ${err.message}`) }
  }

  const executeSignAction = async () => {
    if (!currentLandmarks?.length) { setStatus('No hand detected.'); return }
    try {
      const res = await jsonFetch('/api/sign/event', {
        method: 'POST',
        body: JSON.stringify({ landmarks: currentLandmarks, source_device: 'desktop-1' })
      })
      const data = await res.json()
      if (!res.ok || !data.ok) { setStatus(`Sign action failed: ${data.error || 'Unknown error'}`); return }
      setLastAction(data)
      setStatus(data.mapped_task
        ? `Sign "${data.predicted_label}" → ${data.action}: ${data.mapped_task}${data.agent_response ? ' | Agent: ' + data.agent_response : ''}`
        : `Sign "${data.predicted_label}" detected (${Math.round((data.confidence || 0) * 100)}%), no mapped task.`)
    } catch (err) { setStatus(`Error: ${err.message}`) }
  }

  const handDetected = currentLandmarks.length > 0

  return (
    <div className="gt-screen">
      <div className="gt-header">
        <h2>🤟 Gesture & Sign Training</h2>
        <p className="gt-subtitle">Record hand poses, train custom gestures, and teach sign language to the AI.</p>
      </div>

      {/* Camera section */}
      <div className="gt-camera-section">
        <div className="gt-camera-wrap">
          <video ref={videoRef} autoPlay muted playsInline className="gt-camera-video" />
          {!cameraActive && (
            <div className="gt-camera-overlay" onClick={startCamera}>
              <span className="gt-camera-overlay-icon">📷</span>
              <span>Click to start camera</span>
            </div>
          )}
          {recordCountdown > 0 && (
            <div className="gt-countdown">{recordCountdown}</div>
          )}
          {isRecording && (
            <div className="gt-recording-badge">● REC ({recordedFrames.length} frames)</div>
          )}
        </div>

        <div className="gt-camera-controls">
          <button className={`gt-btn ${cameraActive ? 'gt-btn-danger' : 'gt-btn-primary'}`} onClick={cameraActive ? stopCamera : startCamera}>
            {cameraActive ? '⏹ Stop Camera' : '📷 Start Camera'}
          </button>
          <div className={`gt-hand-indicator ${handDetected ? 'detected' : ''}`}>
            <span className="gt-hand-dot" />
            {handDetected ? '✋ Hand detected' : 'No hand in frame'}
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="gt-tabs">
        <button className={`gt-tab ${activeTab === 'custom' ? 'active' : ''}`} onClick={() => setActiveTab('custom')}>
          ✊ Custom Gestures
        </button>
        <button className={`gt-tab ${activeTab === 'sign' ? 'active' : ''}`} onClick={() => setActiveTab('sign')}>
          🤟 Sign Language
        </button>
        <button className={`gt-tab ${activeTab === 'saved' ? 'active' : ''}`} onClick={() => setActiveTab('saved')}>
          📋 Saved ({savedGestures.length})
        </button>
      </div>

      {/* Custom Gesture Tab */}
      {activeTab === 'custom' && (
        <div className="gt-panel">
          <h3>Record & Save Custom Gesture</h3>
          <p className="gt-panel-desc">Hold a hand pose in front of the camera, record it, then map it to a task for the AI to execute.</p>

          <div className="gt-form-group">
            <label className="gt-label">Gesture Name</label>
            <input className="gt-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., peace_sign, wave, point_up" />
          </div>

          <div className="gt-form-group">
            <label className="gt-label">Mapped Task / Command</label>
            <input className="gt-input" value={task} onChange={e => setTask(e.target.value)} placeholder="e.g., open spotify, take a screenshot, mute microphone" />
          </div>

          <div className="gt-action-row">
            <button className="gt-btn gt-btn-record" onClick={startRecording} disabled={!cameraActive || isRecording || recordCountdown > 0}>
              {recordCountdown > 0 ? `Starting in ${recordCountdown}...` : isRecording ? `● Recording (${recordedFrames.length})` : '⏺ Record Pose (3s)'}
            </button>
            <button className="gt-btn gt-btn-primary" onClick={saveGesture} disabled={recordedFrames.length === 0 && currentLandmarks.length === 0}>
              💾 Save Gesture
            </button>
          </div>

          {recordedFrames.length > 0 && (
            <div className="gt-frames-badge">
              ✓ {recordedFrames.length} frames captured — representative frame selected for training
            </div>
          )}
        </div>
      )}

      {/* Sign Language Tab */}
      {activeTab === 'sign' && (
        <div className="gt-panel">
          <h3>Sign Language Training</h3>
          <p className="gt-panel-desc">Train the AI to recognize ASL signs. Select a sign from the vocabulary, hold the pose, and submit.</p>

          <div className="gt-form-group">
            <label className="gt-label">Select Sign</label>
            <select className="gt-select" value={signLabel} onChange={e => setSignLabel(e.target.value)}>
              {vocabulary
                ? Object.entries(vocabulary).map(([label, info]) => (
                    <option key={label} value={label}>{label} → {info.action}</option>
                  ))
                : <option value="hello">hello</option>}
            </select>
          </div>

          <div className="gt-action-row">
            <button className="gt-btn gt-btn-record" onClick={() => { startRecording() }} disabled={!cameraActive || isRecording}>
              ⏺ Record Sign
            </button>
            <button className="gt-btn gt-btn-primary" onClick={trainSign} disabled={recordedFrames.length === 0 && currentLandmarks.length === 0}>
              🧠 Train This Sign
            </button>
          </div>

          <div className="gt-action-row">
            <button className="gt-btn" onClick={predictSign} disabled={!handDetected}>
              🔍 Predict Current Sign
            </button>
            <button className="gt-btn" onClick={executeSignAction} disabled={!handDetected}>
              ▶️ Execute Sign → Agent
            </button>
          </div>

          {predictedSign && (
            <div className="gt-prediction">
              <span className="gt-prediction-label">Prediction:</span>
              <span className="gt-prediction-value">{predictedSign}</span>
            </div>
          )}

          {/* Training stats */}
          {signStats && (
            <div className="gt-stats">
              <div className="gt-stat-card">
                <span className="gt-stat-value">{signStats.total_samples}</span>
                <span className="gt-stat-label">Samples</span>
              </div>
              <div className="gt-stat-card">
                <span className="gt-stat-value">{signStats.unique_labels}/{signStats.vocabulary_size}</span>
                <span className="gt-stat-label">Signs Trained</span>
              </div>
              <div className="gt-stat-card">
                <span className="gt-stat-value">{signStats.untrained?.length || 0}</span>
                <span className="gt-stat-label">Untrained</span>
              </div>
            </div>
          )}

          {/* Vocabulary table */}
          {vocabulary && (
            <details className="gt-vocab-details">
              <summary>📖 Sign Vocabulary ({Object.keys(vocabulary).length} signs)</summary>
              <div className="gt-vocab-grid">
                {Object.entries(vocabulary).map(([label, info]) => (
                  <div key={label} className="gt-vocab-item">
                    <span className="gt-vocab-name">{label}</span>
                    <span className="gt-vocab-action">{info.action}</span>
                    <span className="gt-vocab-desc">{info.description}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Saved Gestures Tab */}
      {activeTab === 'saved' && (
        <div className="gt-panel">
          <h3>Saved Custom Gestures</h3>
          {savedGestures.length === 0 ? (
            <p className="gt-empty">No custom gestures saved yet. Record one in the Custom Gestures tab!</p>
          ) : (
            <div className="gt-saved-list">
              {savedGestures.map(g => (
                <div key={g.name} className="gt-saved-item">
                  <div className="gt-saved-info">
                    <span className="gt-saved-name">{g.name}</span>
                    <span className="gt-saved-task">{g.mapped_task}</span>
                  </div>
                  <button className="gt-btn gt-btn-sm gt-btn-danger" onClick={() => deleteGesture(g.name)}>🗑</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Last action */}
      {lastAction && (
        <div className="gt-last-action">
          <span className="gt-la-label">Last Action:</span>
          <strong>{lastAction.predicted_label}</strong> → {lastAction.action}
          {lastAction.agent_response && <span className="gt-la-agent"> | {lastAction.agent_response}</span>}
        </div>
      )}

      {/* Status bar */}
      {status && (
        <div className={`gt-status ${status.startsWith('✓') ? 'success' : status.startsWith('Error') || status.startsWith('Failed') ? 'error' : ''}`}>
          {status}
        </div>
      )}
    </div>
  )
}
