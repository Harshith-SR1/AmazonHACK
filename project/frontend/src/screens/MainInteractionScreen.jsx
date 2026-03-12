import { useEffect, useRef, useState, useCallback } from 'react'
import { Hands } from '@mediapipe/hands'
import { Camera } from '@mediapipe/camera_utils'
import VideoCallPanel from '../components/VideoCallPanel'
import MorseCodeInput from '../components/MorseCodeInput'
import GestureTutorial from '../components/GestureTutorial'
import VoiceStreamingPanel from '../components/VoiceStreamingPanel'
import { jsonFetch, API_BASE } from '../apiClient'
import { WORLD_LANGUAGES } from '../languages'

const INPUT_MODES = [
  { id: 'voice', label: 'Voice', icon: '🎤' },
  { id: 'sonic', label: 'Voice Stream', icon: '🎙️' },
  { id: 'sign', label: 'Sign & Gesture', icon: '🤟' },
  { id: 'morse', label: 'Morse Code', icon: '📡' },
]

/* ── Demo gesture presets (quick-action cards) ─────────────────── */
const DEMO_GESTURES = [
  { name: 'fist', label: 'Fist', desc: 'Capture context', emoji: '✊' },
  { name: 'open_palm', label: 'Open Palm', desc: 'Release / send', emoji: '🖐️' },
  { name: 'thumbs_up', label: 'Thumbs Up', desc: 'Confirm action', emoji: '👍' },
  { name: 'two_fingers', label: 'Two Fingers', desc: 'Cancel / back', emoji: '✌️' },
]

const DEMO_QUICK_ACTIONS = [
  { label: 'Open YouTube', command: 'open youtube', emoji: '▶️' },
  { label: 'Search YouTube', command: 'search youtube trending videos', emoji: '🔍' },
  { label: 'Open Google', command: 'open google.com', emoji: '🌐' },
  { label: 'Take Screenshot', command: 'take screenshot', emoji: '📸' },
  { label: 'Add Note', command: 'add note remember to check this later', emoji: '📝' },
  { label: 'Go Home', command: 'go home', emoji: '🏠' },
]

export default function MainInteractionScreen({ avatarId, voiceLang = 'en-US' }) {
  const [aiResponse, setAiResponse] = useState('')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [speechTick, setSpeechTick] = useState(0)
  const [gestureState, setGestureState] = useState('idle')
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [videoReadyTick, setVideoReadyTick] = useState(0)
  const [inputMode, setInputMode] = useState('voice')
  const [isListening, setIsListening] = useState(false)
  const [screenshotImg, setScreenshotImg] = useState(null)
  const [transcript, setTranscript] = useState('')
  const [interimText, setInterimText] = useState('')
  const [commandText, setCommandText] = useState('')
  const [micError, setMicError] = useState('')
  const [taskLog, setTaskLog] = useState([])
  const [signDetected, setSignDetected] = useState('')
  const [cameraContrast, setCameraContrast] = useState(1.2)
  const [cameraBrightness, setCameraBrightness] = useState(1.3)
  const boundaryTimerRef = useRef(null)
  const userVideoElRef = useRef(null)
  const autoCamRef = useRef(null)
  const handsRef = useRef(null)
  const lastAutoGestureRef = useRef({ name: '', ts: 0 })
  const recognitionRef = useRef(null)
  const inputModeRef = useRef(inputMode)
  const onSendCommandRef = useRef(null)
  const gotFinalRef = useRef(false)
  const fingerSignBusyRef = useRef(false)
  const lastFingerSignRef = useRef(null)
  const noHandFramesRef = useRef(0)
  const showTransferPanelRef = useRef(false)
  const [showTransferPanel, setShowTransferPanel] = useState(false)
  const [transferDevices, setTransferDevices] = useState([])
  const [transferTarget, setTransferTarget] = useState('')
  const [transferFiles, setTransferFiles] = useState([])
  const [transferFolders, setTransferFolders] = useState([])  // [{name, files: File[], paths: string[]}]
  const [transferLink, setTransferLink] = useState('')
  const [transferStatus, setTransferStatus] = useState('')
  const [transferProgress, setTransferProgress] = useState(null)
  const [transferHistory, setTransferHistory] = useState([])
  const [transferNotifications, setTransferNotifications] = useState([])
  const [transferTab, setTransferTab] = useState('send') // 'send' | 'receive'
  const [incomingTransfers, setIncomingTransfers] = useState([])
  const [showTutorial, setShowTutorial] = useState(false)
  const fileInputRef = useRef(null)

  // Keep ref in sync so MediaPipe callback sees current mode
  useEffect(() => { inputModeRef.current = inputMode }, [inputMode])
  useEffect(() => { showTransferPanelRef.current = showTransferPanel }, [showTransferPanel])

  // ── Transfer panel helpers (must be above SSE effect) ────────
  const loadTransferDevices = useCallback(async () => {
    try {
      const res = await jsonFetch('/api/devices')
      const devices = await res.json()
      setTransferDevices(devices.filter(d => d.online))
      // Load history too
      const hRes = await jsonFetch('/api/transfer/history')
      const hData = await hRes.json()
      if (hData.ok) setTransferHistory(hData.transfers.slice(0, 10))
    } catch { setTransferDevices([]) }
  }, [])

  // Load incoming transfers for this device
  const loadIncomingTransfers = useCallback(async () => {
    try {
      const res = await jsonFetch('/api/transfer/incoming/desktop-1')
      const data = await res.json()
      if (data.ok) setIncomingTransfers(data.transfers)
    } catch { /* ignore */ }
  }, [])

  // ── SSE: Real-time transfer notifications ────────────────────
  useEffect(() => {
    const deviceId = 'desktop-1'
    let es
    try {
      es = new EventSource(`${API_BASE}/api/transfer/notifications/${deviceId}`)
      es.onmessage = (event) => {
        try {
          const transfer = JSON.parse(event.data)
          if (transfer._event === 'receipt') {
            // Receipt from target device — show sender-side confirmation toast
            const action = transfer._receipt_action
            const label = action === 'accepted' ? '✓ Accepted' : action === 'downloaded' ? '⬇ Downloaded' : '✗ Declined'
            setTransferNotifications(prev => [
              { ...transfer, _label: label, _dismissAt: Date.now() + 6000 },
              ...prev.slice(0, 4)
            ])
          } else {
            // Incoming transfer notification
            setTransferNotifications(prev => [
              { ...transfer, _dismissAt: Date.now() + 6000 },
              ...prev.slice(0, 4)
            ])
            // Refresh incoming transfers
            loadIncomingTransfers()
          }
          // Auto-refresh history if transfer panel is open
          if (showTransferPanelRef.current) loadTransferDevices()
        } catch {}
      }
      es.onerror = () => {
        // Reconnect handled automatically by EventSource
      }
    } catch {}
    return () => es?.close()
  }, [loadTransferDevices])

  // Auto-dismiss notifications
  useEffect(() => {
    if (transferNotifications.length === 0) return
    const timer = setInterval(() => {
      const now = Date.now()
      setTransferNotifications(prev => prev.filter(n => n._dismissAt > now))
    }, 1000)
    return () => clearInterval(timer)
  }, [transferNotifications.length])

  // ── Gesture / finger-count classifier ────────────────────────
  const classifyGesture = useCallback((landmarks) => {
    if (!landmarks || landmarks.length < 21) return null
    const tip8 = landmarks[8], tip12 = landmarks[12], tip16 = landmarks[16], tip20 = landmarks[20]
    const mcp8 = landmarks[5], mcp12 = landmarks[9], mcp16 = landmarks[13], mcp20 = landmarks[17]
    const thumbTip = landmarks[4], thumbIp = landmarks[3]

    // Finger extended = tip is ABOVE (lower Y) its mcp joint
    const indexUp  = tip8[1] < mcp8[1]
    const middleUp = tip12[1] < mcp12[1]
    const ringUp   = tip16[1] < mcp16[1]
    const pinkyUp  = tip20[1] < mcp20[1]
    const thumbUp  = thumbTip[1] < thumbIp[1]  // works for both hands
    const extCount = [indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length

    // ── Specific sign shortcuts (checked first) ──────────────
    // Middle finger ONLY → WhatsApp
    if (middleUp && !indexUp && !ringUp && !pinkyUp) return 'middle_finger'
    // Index finger ONLY → YouTube
    if (indexUp && !middleUp && !ringUp && !pinkyUp) return 'one_finger'
    // Index + middle + ring (pinky down) → new tab
    if (indexUp && middleUp && ringUp && !pinkyUp) return 'three_fingers'
    // Pinky finger ONLY → open transfer panel
    if (pinkyUp && !indexUp && !middleUp && !ringUp) return 'pinky_finger'

    // ── General gestures ─────────────────────────────────────
    // Fist: all fingers folded
    if (extCount === 0 && !thumbUp) return 'fist'
    // Thumbs up: only thumb up, all fingers folded
    if (extCount === 0 && thumbUp) return 'thumbs_up'
    // Two fingers: index + middle only
    if (extCount === 2 && indexUp && middleUp) return 'two_fingers'
    // Open palm: all 4 fingers up
    if (extCount >= 4) return 'open_palm'

    return null
  }, [])

  // ── Finger-sign → direct command mapping ────────────────────
  const FINGER_SIGN_ACTIONS = {
    one_finger: 'open youtube',        // index only
    middle_finger: 'open whatsapp',    // middle only
    three_fingers: 'open new tab',     // index+middle+ring
    pinky_finger: '__transfer_panel__', // pinky only → open transfer panel
  }

  // ── MediaPipe gesture/sign detection ─────────────────────────
  // Runs on camera toggle only — NOT on inputMode change so it stays alive
  useEffect(() => {
    if (!cameraEnabled || !userVideoElRef.current) {
      autoCamRef.current?.stop()
      autoCamRef.current = null
      return
    }

    let hands, camera, alive = true
    const init = async () => {
      try {
        hands = new Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        })
        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6,
        })

        hands.onResults((results) => {
          if (!alive) return
          const landmarks = results.multiHandLandmarks?.[0]?.map((lm) => [lm.x, lm.y, lm.z]) || null

          // Track hand absence — reset last finger sign after hand leaves
          if (!landmarks) {
            noHandFramesRef.current++
            if (noHandFramesRef.current > 10) lastFingerSignRef.current = null
            return
          }
          noHandFramesRef.current = 0

          const mode = inputModeRef.current

          // Sign & Gesture are merged — detect both when in 'sign' mode
          if (mode === 'sign') {
            handleSignDetection(landmarks)
            const gesture = classifyGesture(landmarks)
            if (gesture) {
              const now = Date.now()
              const last = lastAutoGestureRef.current
              const isFingerSign = gesture in FINGER_SIGN_ACTIONS

              // Finger-sign loop prevention: same gesture won't fire again
              // until a DIFFERENT gesture is shown or hand leaves frame
              if (isFingerSign && gesture === lastFingerSignRef.current) return

              const cooldown = isFingerSign ? 4000 : 2000
              if (!(gesture === last.name && now - last.ts < cooldown)) {
                // Block rapid finger-sign actions while one is executing
                if (isFingerSign && fingerSignBusyRef.current) return
                lastAutoGestureRef.current = { name: gesture, ts: now }
                const fingerCmd = FINGER_SIGN_ACTIONS[gesture]
                if (fingerCmd) {
                  fingerSignBusyRef.current = true
                  lastFingerSignRef.current = gesture
                  if (fingerCmd === '__transfer_panel__' && !showTransferPanelRef.current) {
                    setShowTransferPanel(true)
                    showTransferPanelRef.current = true
                    loadTransferDevices()
                  } else if (fingerCmd !== '__transfer_panel__') {
                    onSendCommandRef.current(fingerCmd, 'sign')
                  }
                  setTimeout(() => { fingerSignBusyRef.current = false }, 5000)
                } else {
                  onGestureEvent(gesture)
                }
              }
            }
          }
        })

        handsRef.current = hands

        camera = new Camera(userVideoElRef.current, {
          onFrame: async () => {
            if (alive && userVideoElRef.current && handsRef.current) {
              try { await handsRef.current.send({ image: userVideoElRef.current }) } catch {}
            }
          },
          width: 640,
          height: 360,
        })
        camera.start()
        autoCamRef.current = camera
      } catch (err) {
        console.warn('MediaPipe init failed:', err)
      }
    }
    init()

    return () => {
      alive = false
      autoCamRef.current?.stop()
      autoCamRef.current = null
      handsRef.current = null
    }
  }, [cameraEnabled, videoReadyTick, classifyGesture])

  // ── TTS (fixed: don't cancel prematurely, clean up on unmount) ──
  useEffect(() => {
    return () => {
      if (boundaryTimerRef.current) clearInterval(boundaryTimerRef.current)
      window.speechSynthesis?.cancel()
    }
  }, [])

  const speak = useCallback((text) => {
    if (!window.speechSynthesis) return
    // Stop any current speech and timer
    window.speechSynthesis.cancel()
    if (boundaryTimerRef.current) { clearInterval(boundaryTimerRef.current); boundaryTimerRef.current = null }
    // Small delay to let cancel() complete before speaking again
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = voiceLang
      utterance.onstart = () => {
        setIsSpeaking(true)
        boundaryTimerRef.current = setInterval(() => setSpeechTick((p) => p + 1), 120)
      }
      utterance.onend = () => {
        setIsSpeaking(false)
        if (boundaryTimerRef.current) { clearInterval(boundaryTimerRef.current); boundaryTimerRef.current = null }
      }
      utterance.onerror = () => {
        setIsSpeaking(false)
        if (boundaryTimerRef.current) { clearInterval(boundaryTimerRef.current); boundaryTimerRef.current = null }
      }
      window.speechSynthesis.speak(utterance)
    }, 50)
  }, [voiceLang])

  const handleFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files || [])
    setTransferFiles(prev => [...prev, ...files])
  }, [])

  const removeTransferFile = useCallback((idx) => {
    setTransferFiles(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const removeTransferFolder = useCallback((idx) => {
    setTransferFolders(prev => prev.filter((_, i) => i !== idx))
  }, [])

  // Recursively read all files from a dropped directory entry
  const readDirectoryEntry = useCallback((entry, basePath = '') => {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file(f => resolve([{ file: f, path: basePath + f.name }]))
      } else if (entry.isDirectory) {
        const reader = entry.createReader()
        const allEntries = []
        const readBatch = () => {
          reader.readEntries(async (entries) => {
            if (entries.length === 0) {
              const results = await Promise.all(allEntries.map(e => readDirectoryEntry(e, basePath + entry.name + '/')))
              resolve(results.flat())
            } else {
              allEntries.push(...entries)
              readBatch()  // keep reading (batched in 100s by spec)
            }
          })
        }
        readBatch()
      } else {
        resolve([])
      }
    })
  }, [])

  // Handle drop that may include folders
  const handleDrop = useCallback(async (e) => {
    e.preventDefault()
    e.currentTarget.classList.remove('drag-over')
    const items = e.dataTransfer.items
    if (!items) {
      // Fallback: no DataTransferItem API
      setTransferFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)])
      return
    }
    const plainFiles = []
    const folderPromises = []
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.()
      if (entry?.isDirectory) {
        folderPromises.push(
          readDirectoryEntry(entry).then(fileEntries => ({
            name: entry.name,
            files: fileEntries.map(fe => fe.file),
            paths: fileEntries.map(fe => fe.path),
          }))
        )
      } else if (entry?.isFile) {
        const file = items[i].getAsFile()
        if (file) plainFiles.push(file)
      } else {
        // Fallback for items without webkitGetAsEntry
        const file = items[i].getAsFile()
        if (file) plainFiles.push(file)
      }
    }
    if (plainFiles.length) setTransferFiles(prev => [...prev, ...plainFiles])
    if (folderPromises.length) {
      const folders = await Promise.all(folderPromises)
      setTransferFolders(prev => [...prev, ...folders])
    }
  }, [readDirectoryEntry])

  // Upload a folder as zip via the folder endpoint
  const uploadFolderWithProgress = useCallback((folder, folderIndex, totalItems) => {
    return new Promise((resolve, reject) => {
      const form = new FormData()
      folder.files.forEach(f => form.append('files', f))
      form.append('paths', JSON.stringify(folder.paths))
      form.append('folder_name', folder.name)
      form.append('source_device', 'desktop-1')
      form.append('target_device', transferTarget)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${API_BASE}/api/transfer/upload-folder`)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const filePct = Math.round((e.loaded / e.total) * 100)
          const overallPct = Math.round(((folderIndex + e.loaded / e.total) / totalItems) * 100)
          setTransferProgress({ fileName: `📁 ${folder.name}`, fileIndex: folderIndex + 1, totalFiles: totalItems, filePct, overallPct, loaded: e.loaded, total: e.total })
        }
      }

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText)
          if (xhr.status >= 200 && xhr.status < 300 && data.ok) resolve(data)
          else reject(new Error(data.error || `Folder upload failed (${xhr.status})`))
        } catch { reject(new Error(`Folder upload failed (${xhr.status})`)) }
      }

      xhr.onerror = () => reject(new Error('Network error during folder upload'))
      xhr.send(form)
    })
  }, [transferTarget])

  // Upload a single file with XHR progress tracking
  const uploadFileWithProgress = useCallback((file, fileIndex, totalFiles) => {
    return new Promise((resolve, reject) => {
      const form = new FormData()
      form.append('file', file)
      form.append('source_device', 'desktop-1')
      form.append('target_device', transferTarget)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${API_BASE}/api/transfer/upload`)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const filePct = Math.round((e.loaded / e.total) * 100)
          const overallPct = Math.round(((fileIndex + e.loaded / e.total) / totalFiles) * 100)
          setTransferProgress({ fileName: file.name, fileIndex: fileIndex + 1, totalFiles, filePct, overallPct, loaded: e.loaded, total: e.total })
        }
      }

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText)
          if (xhr.status >= 200 && xhr.status < 300 && data.ok) resolve(data)
          else reject(new Error(data.error || `Upload failed (${xhr.status})`))
        } catch { reject(new Error(`Upload failed (${xhr.status})`)) }
      }

      xhr.onerror = () => reject(new Error('Network error during upload'))
      xhr.send(form)
    })
  }, [transferTarget])

  const sendTransfer = useCallback(async () => {
    if (!transferTarget) { setTransferStatus('Select a target device'); return }
    if (!transferFiles.length && !transferFolders.length && !transferLink.trim()) { setTransferStatus('Add files, folders, or a link to transfer'); return }
    setTransferStatus('Sending...')
    setTransferProgress(null)
    try {
      const totalItems = transferFiles.length + transferFolders.length
      let idx = 0
      // Send individual files with progress
      for (let i = 0; i < transferFiles.length; i++) {
        await uploadFileWithProgress(transferFiles[i], idx++, totalItems)
      }
      // Send folders (zipped) with progress
      for (let i = 0; i < transferFolders.length; i++) {
        await uploadFolderWithProgress(transferFolders[i], idx++, totalItems)
      }
      // Send link
      if (transferLink.trim()) {
        const res = await jsonFetch('/api/transfer/link', {
          method: 'POST',
          body: JSON.stringify({
            source_device: 'desktop-1',
            target_device: transferTarget,
            url: transferLink.trim(),
          })
        })
        const data = await res.json()
        if (!data.ok) { setTransferStatus(`Failed: ${data.error}`); return }
      }
      const count = totalItems + (transferLink.trim() ? 1 : 0)
      setTransferStatus(`✓ Sent ${count} item${count > 1 ? 's' : ''} successfully!`)
      setTransferFiles([])
      setTransferFolders([])
      setTransferLink('')
      setTransferProgress(null)
      speak(`Transfer sent to device`)
      // Refresh history
      loadTransferDevices()
      setTimeout(() => setTransferStatus(''), 4000)
    } catch (err) {
      setTransferStatus(`Error: ${err.message}`)
      setTransferProgress(null)
    }
  }, [transferTarget, transferFiles, transferFolders, transferLink, speak, loadTransferDevices, uploadFileWithProgress, uploadFolderWithProgress])

  // ── Incoming transfer actions ───────────────────────────────
  const acceptTransfer = useCallback(async (transferId) => {
    try {
      const res = await jsonFetch(`/api/transfer/accept/${transferId}`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) loadIncomingTransfers()
    } catch { /* ignore */ }
  }, [loadIncomingTransfers])

  const declineTransfer = useCallback(async (transferId) => {
    try {
      const res = await jsonFetch(`/api/transfer/decline/${transferId}`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) loadIncomingTransfers()
    } catch { /* ignore */ }
  }, [loadIncomingTransfers])

  const downloadTransfer = useCallback((transfer) => {
    if (transfer.type === 'link') {
      window.open(transfer.url, '_blank', 'noopener')
      return
    }
    // Trigger file download via hidden link
    const a = document.createElement('a')
    a.href = `${API_BASE}/api/transfer/download/${transfer.id}`
    a.download = transfer.filename || 'download'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Refresh incoming after download
    setTimeout(() => loadIncomingTransfers(), 1000)
  }, [loadIncomingTransfers])

  // ── Task logging ────────────────────────────────────────────
  const addTaskLog = useCallback((entry) => {
    setTaskLog((prev) => [{ ...entry, ts: new Date().toLocaleTimeString() }, ...prev].slice(0, 50))
  }, [])

  // ── Analytics: track modality usage ──────────────────────────
  const MODALITY_FEATURE_MAP = {
    voice: { name: 'Voice Commands', icon: 'mic' },
    text: { name: 'Voice Commands', icon: 'mic' },
    gesture: { name: 'Gesture Control', icon: 'hand' },
    sign: { name: 'Sign Language', icon: 'sign' },
    morse: { name: 'Morse Code', icon: 'morse' },
  }
  const trackModality = useCallback((modality) => {
    const feat = MODALITY_FEATURE_MAP[modality]
    if (!feat) return
    jsonFetch('/api/usage/track', {
      method: 'POST',
      body: JSON.stringify({ type: 'feature', name: feat.name, icon: feat.icon, count: 1, time_ms: 0 })
    }).catch(() => {})
  }, [])

  // ── Send command to backend ─────────────────────────────────
  const onSendCommand = useCallback(async (text, modality = 'text') => {
    addTaskLog({ type: 'input', modality, text })
    trackModality(modality)
    try {
      const res = await jsonFetch('/api/task/execute', {
        method: 'POST',
        body: JSON.stringify({ text, modality, device_id: 'desktop-1', language: voiceLang })
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = `Task failed: ${data.detail || data.error || 'Unknown error'}`
        setAiResponse(msg)
        addTaskLog({ type: 'error', text: msg })
        return
      }
      const summary = data.response_text || 'Done.'
      setAiResponse(summary)
      speak(summary)
      // Check for screenshot in actions_taken
      const ssAction = (data.actions_taken || []).find(a => a.tool === 'take_screenshot' && a.result?.screenshot_base64)
      if (ssAction) {
        setScreenshotImg(`data:image/jpeg;base64,${ssAction.result.screenshot_base64}`)
      }
      addTaskLog({ type: 'result', text: summary, actions: data.actions_taken || [] })
    } catch (error) {
      const msg = `Task failed: ${error.message}`
      setAiResponse(msg)
      addTaskLog({ type: 'error', text: msg })
    }
  }, [voiceLang, speak, addTaskLog, trackModality])

  // ── Gesture event ───────────────────────────────────────────
  const onGestureEvent = useCallback(async (gesture) => {
    addTaskLog({ type: 'input', modality: 'gesture', text: gesture })
    trackModality('gesture')
    try {
      const res = await jsonFetch('/api/gesture/event', {
        method: 'POST',
        body: JSON.stringify({
          gesture_name: gesture,
          source_device: 'desktop-1',
          target_device: 'phone-1',
          metadata: {}
        })
      })
      const data = await res.json()
      if (!res.ok) { setAiResponse(`Gesture failed: ${data.detail || 'Error'}`); return }
      setGestureState(data.action || 'idle')
      setTimeout(() => setGestureState('idle'), 1400)
      const msg = `Gesture ${gesture}: ${data.action}`
      setAiResponse(msg)
      speak(msg)
      addTaskLog({ type: 'result', text: msg })
    } catch (error) {
      setAiResponse(`Gesture failed: ${error.message}`)
    }
  }, [addTaskLog, speak, trackModality])

  // ── Sign language detection ─────────────────────────────────
  const lastSignRef = useRef({ label: '', ts: 0 })
  const handleSignDetection = useCallback(async (landmarks) => {
    const now = Date.now()
    if (now - lastSignRef.current.ts < 2000) return
    lastSignRef.current.ts = now
    try {
      const res = await jsonFetch('/api/sign/event', {
        method: 'POST',
        body: JSON.stringify({ landmarks, source_device: 'desktop-1' })
      })
      const data = await res.json()
      if (data.ok && data.predicted_label) {
        setSignDetected(data.predicted_label)
        lastSignRef.current.label = data.predicted_label
        trackModality('sign')
        if (data.agent_response) {
          setAiResponse(data.agent_response)
          speak(data.agent_response)
          addTaskLog({ type: 'result', modality: 'sign', text: `Sign "${data.predicted_label}": ${data.agent_response}` })
        }
      }
    } catch { /* silent */ }
  }, [speak, addTaskLog, trackModality])

  // ── Keep onSendCommand ref in sync ─────────────────────────
  useEffect(() => { onSendCommandRef.current = onSendCommand }, [onSendCommand])

  // ── Voice input (non-continuous for reliability) ────────────
  const startVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setMicError('Speech recognition not supported in this browser.'); return }

    if (recognitionRef.current) { try { recognitionRef.current.abort() } catch {} recognitionRef.current = null }
    setMicError('')
    setInterimText('')
    setTranscript('')
    setCommandText('')
    gotFinalRef.current = false

    const recognition = new SR()
    recognition.lang = voiceLang
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => { setIsListening(true) }

    recognition.onresult = (event) => {
      let interim = '', finalText = ''
      for (let i = 0; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) finalText += t
        else interim += t
      }
      setInterimText(interim)
      setCommandText(interim || finalText)
      if (finalText) {
        gotFinalRef.current = true
        setTranscript(finalText)
        setInterimText('')
        setCommandText(finalText)
        if (onSendCommandRef.current) {
          onSendCommandRef.current(finalText, 'voice')
        }
      }
    }

    recognition.onerror = (e) => {
      console.warn('SpeechRecognition error:', e.error)
      if (e.error === 'not-allowed') {
        setMicError('Microphone access denied. Please allow mic permission in browser settings.')
      } else if (e.error === 'audio-capture') {
        setMicError('No microphone found. Please connect a mic and try again.')
      } else if (e.error === 'network') {
        setMicError('Network error — speech recognition requires internet.')
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        setMicError(`Mic error: ${e.error}`)
      }
      if (e.error !== 'no-speech') setIsListening(false)
    }

    recognition.onend = () => {
      // If we got a final result, stop completely
      if (gotFinalRef.current) {
        setIsListening(false)
        recognitionRef.current = null
        return
      }
      // Auto-restart if user hasn't stopped manually (recognitionRef still set)
      // Use setTimeout to avoid Chrome bug where start() fails inside onend
      if (recognitionRef.current === recognition) {
        setTimeout(() => {
          if (recognitionRef.current === recognition) {
            try { recognition.start() } catch { setIsListening(false); recognitionRef.current = null }
          }
        }, 100)
      } else {
        setIsListening(false)
        recognitionRef.current = null
      }
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch (err) {
      setMicError(`Could not start mic: ${err.message}`)
      setIsListening(false)
    }
  }, [voiceLang])

  const stopVoice = useCallback(() => {
    const r = recognitionRef.current
    recognitionRef.current = null   // clear ref FIRST so onend won't auto-restart
    if (r) { try { r.stop() } catch {} }
    setIsListening(false)
  }, [])

  const handleManualSend = useCallback(() => {
    const text = commandText.trim()
    if (!text) return
    setTranscript(text)
    setCommandText('')
    onSendCommand(text, 'text')
  }, [commandText, onSendCommand])

  // ── Morse code decoded ──────────────────────────────────────
  const onMorseDecode = useCallback((text) => {
    if (text.trim()) onSendCommand(text, 'morse')
  }, [onSendCommand])

  // ── Quick action (demo gesture commands) ────────────────────
  const onQuickAction = useCallback((command) => {
    onSendCommand(command, 'gesture')
  }, [onSendCommand])

  return (
    <div className="interaction-screen">
      {/* Avatar + camera */}
      <VideoCallPanel
        avatarId={avatarId}
        aiResponse={aiResponse}
        isSpeaking={isSpeaking}
        speechTick={speechTick}
        gestureState={gestureState}
        cameraEnabled={cameraEnabled}
        onToggleCamera={() => setCameraEnabled((p) => !p)}
        onMicClick={startVoice}
        onStopMic={stopVoice}
        isListening={isListening}
        onGestureEvent={onGestureEvent}
        onVideoReady={(videoEl) => { userVideoElRef.current = videoEl; setVideoReadyTick((p) => p + 1) }}
        cameraContrast={cameraContrast}
        cameraBrightness={cameraBrightness}
      />

      {/* Command Bar — always visible */}
      <div className="command-bar">
        <button
          className={`command-mic-btn ${isListening ? 'listening' : ''}`}
          onClick={isListening ? stopVoice : startVoice}
          title={isListening ? 'Stop listening' : 'Start voice input'}
        >
          {isListening ? '⏹' : '🎤'}
        </button>
        <input
          type="text"
          className="command-input"
          placeholder={isListening ? 'Listening...' : 'Type a command or tap mic to speak...'}
          value={commandText}
          onChange={(e) => setCommandText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleManualSend() }}
          readOnly={isListening}
        />
      </div>

      {/* Live Transcript Panel */}
      {(isListening || interimText || transcript || micError) && (
        <div className="transcript-live-area">
          {isListening && !interimText && <div className="transcript-display listening-indicator">🔴 Listening… speak now</div>}
          {interimText && <div className="transcript-display interim"><span className="transcript-label">Hearing:</span> {interimText}</div>}
          {transcript && <div className="transcript-display final"><span className="transcript-label">You said:</span> {transcript}</div>}
          {micError && <div className="transcript-display error"><span className="transcript-label">Error:</span> {micError}</div>}
        </div>
      )}

      {/* Input Mode Tabs */}
      <div className="input-mode-hub">
        <div className="input-mode-tabs">
          {INPUT_MODES.map((m) => (
            <button
              key={m.id}
              className={`input-mode-tab ${inputMode === m.id ? 'active' : ''}`}
              onClick={() => setInputMode(m.id)}
            >
              <span className="input-mode-icon">{m.icon}</span>
              <span className="input-mode-label">{m.label}</span>
            </button>
          ))}
        </div>

        {/* Voice Panel */}
        {inputMode === 'voice' && (
          <div className="input-panel voice-panel">
            <div className="voice-controls">
              <span className="voice-lang-badge">{voiceLang}</span>
              <button
                className={`mic-btn ${isListening ? 'listening' : ''}`}
                onClick={isListening ? stopVoice : startVoice}
              >
                {isListening ? (
                  <svg viewBox="0 0 24 24" width="24" height="24"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-5 9a1 1 0 01-1-1v-1.07A7.007 7.007 0 015 11H3a9 9 0 0018 0h-2a7.007 7.007 0 01-6 6.93V19a1 1 0 01-1 1z" fill="currentColor"/></svg>
                )}
                <span>{isListening ? 'Stop' : 'Speak'}</span>
              </button>
            </div>
            {isListening && <div className="voice-wave"><div className="wave-dot"/><div className="wave-dot"/><div className="wave-dot"/><div className="wave-dot"/><div className="wave-dot"/></div>}
          </div>
        )}

        {/* Nova Sonic Voice Stream Panel */}
        {inputMode === 'sonic' && (
          <div className="input-panel sonic-panel">
            <VoiceStreamingPanel
              voiceLang={voiceLang}
              onTranscript={(text) => { setTranscript(text); setCommandText(text); }}
              onResponse={(text) => { setAiResponse(text); speak(text); }}
            />
          </div>
        )}

        {/* Sign & Gesture Panel (merged) */}
        {inputMode === 'sign' && (
          <div className="input-panel sign-panel">
            <div className="sign-status">
              <div className="sign-indicator">
                <div className={`sign-pulse ${cameraEnabled ? 'active' : ''}`} />
                <span>{cameraEnabled ? 'Camera active — detecting signs & gestures' : 'Enable camera to use sign language & gestures'}</span>
              </div>
              {signDetected && (
                <div className="sign-detected">
                  <span className="sign-detected-label">Detected:</span>
                  <span className="sign-detected-value">{signDetected}</span>
                </div>
              )}
            </div>

            {!showTutorial && (
              <button className="tutorial-start-btn" onClick={() => setShowTutorial(true)}>
                📖 Gesture Tutorial — Learn all gestures
              </button>
            )}

            {showTutorial && (
              <GestureTutorial
                onClose={() => setShowTutorial(false)}
                onTryGesture={(gesture) => onGestureEvent(gesture)}
              />
            )}

            <h4 className="quick-actions-title">Gesture Controls</h4>
            <div className="gesture-grid">
              {DEMO_GESTURES.map((g) => (
                <button key={g.name} className="gesture-card" onClick={() => onGestureEvent(g.name)}>
                  <span className="gesture-emoji">{g.emoji}</span>
                  <span className="gesture-name">{g.label}</span>
                  <span className="gesture-desc">{g.desc}</span>
                </button>
              ))}
            </div>

            <h4 className="quick-actions-title">Quick Actions</h4>
            <div className="quick-actions-grid">
              {DEMO_QUICK_ACTIONS.map((a) => (
                <button key={a.label} className="quick-action-card" onClick={() => onQuickAction(a.command)}>
                  <span className="qa-emoji">{a.emoji}</span>
                  <span className="qa-label">{a.label}</span>
                </button>
              ))}
            </div>

            <h4 className="quick-actions-title">Finger Sign Shortcuts</h4>
            <div className="gesture-grid">
              <div className="gesture-card">
                <span className="gesture-emoji">☝️</span>
                <span className="gesture-name">Index Finger</span>
                <span className="gesture-desc">Open YouTube</span>
              </div>
              <div className="gesture-card">
                <span className="gesture-emoji">🖕</span>
                <span className="gesture-name">Middle Finger</span>
                <span className="gesture-desc">Open WhatsApp</span>
              </div>
              <div className="gesture-card">
                <span className="gesture-emoji">🤟</span>
                <span className="gesture-name">3 Fingers</span>
                <span className="gesture-desc">Open New Tab</span>
              </div>
              <div className="gesture-card" onClick={() => { setShowTransferPanel(true); loadTransferDevices() }} style={{ cursor: 'pointer' }}>
                <span className="gesture-emoji">🤙</span>
                <span className="gesture-name">Pinky Finger</span>
                <span className="gesture-desc">Device Transfer</span>
              </div>
            </div>
            <p className="input-hint">Show index, middle, 3 fingers, or pinky to camera for instant actions. Pinky opens device transfer. Also supports ASL signs + gesture types.</p>
          </div>
        )}

        {/* Morse Code Panel */}
        {inputMode === 'morse' && (
          <div className="input-panel morse-panel">
            <MorseCodeInput onDecode={onMorseDecode} enableEyeBlink={cameraEnabled} videoEl={userVideoElRef.current} />
          </div>
        )}
      </div>

      {/* Camera Enhancement Controls */}
      {cameraEnabled && (
        <div className="camera-enhance-controls">
          <label className="enhance-label">
            ☀️ Brightness
            <input type="range" min="0.5" max="2.5" step="0.1" value={cameraBrightness}
              onChange={(e) => setCameraBrightness(parseFloat(e.target.value))} />
            <span className="enhance-value">{cameraBrightness.toFixed(1)}</span>
          </label>
          <label className="enhance-label">
            🔲 Contrast
            <input type="range" min="0.5" max="2.5" step="0.1" value={cameraContrast}
              onChange={(e) => setCameraContrast(parseFloat(e.target.value))} />
            <span className="enhance-value">{cameraContrast.toFixed(1)}</span>
          </label>
        </div>
      )}

      {/* AI Response */}
      {aiResponse && (
        <section className="ai-response-banner">
          <p>{aiResponse}</p>
          {screenshotImg && (
            <div className="screenshot-preview">
              <img src={screenshotImg} alt="Screenshot" className="screenshot-img" />
              <button className="screenshot-close" onClick={() => setScreenshotImg(null)}>✕</button>
            </div>
          )}
        </section>
      )}

      {/* ── Transfer Panel Overlay ─────────────────────────── */}
      {showTransferPanel && (
        <div className="transfer-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowTransferPanel(false) }}>
          <div className="transfer-panel">
            <div className="transfer-header">
              <h3>📲 Device Transfer</h3>
              <button className="transfer-close" onClick={() => setShowTransferPanel(false)}>✕</button>
            </div>

            {/* Send / Receive tab toggle */}
            <div className="transfer-tabs">
              <button className={`transfer-tab ${transferTab === 'send' ? 'active' : ''}`} onClick={() => setTransferTab('send')}>
                🚀 Send
              </button>
              <button className={`transfer-tab ${transferTab === 'receive' ? 'active' : ''}`} onClick={() => { setTransferTab('receive'); loadIncomingTransfers() }}>
                📥 Receive
                {incomingTransfers.filter(t => t.status === 'pending').length > 0 && (
                  <span className="transfer-tab-badge">{incomingTransfers.filter(t => t.status === 'pending').length}</span>
                )}
              </button>
            </div>

            <div className="transfer-body">
              {/* ── SEND TAB ─────────────────────────── */}
              {transferTab === 'send' && (<>
              {/* Target device selector */}
              <label className="transfer-label">Send to:</label>
              <div className="transfer-device-list">
                {transferDevices.length === 0 && <p className="transfer-hint">No devices found. Pair a device in Settings first.</p>}
                {transferDevices.map(d => (
                  <button
                    key={d.id}
                    className={`transfer-device-btn ${transferTarget === d.id ? 'active' : ''}`}
                    onClick={() => setTransferTarget(d.id)}
                  >
                    <span className="td-icon">{d.type === 'mobile' ? '📱' : d.type === 'wifi' ? '📶' : d.type === 'bluetooth' ? '🔵' : '💻'}</span>
                    <span className="td-name">{d.name}</span>
                  </button>
                ))}
              </div>

              {/* File picker */}
              <label className="transfer-label">Files, Folders & Pictures:</label>
              <div className="transfer-file-area"
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over') }}
                onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
                <span className="transfer-file-placeholder">
                  📎 Click or drag files & folders here
                </span>
              </div>
              {(transferFiles.length > 0 || transferFolders.length > 0) && (
                <div className="transfer-file-list">
                  {transferFolders.map((folder, i) => (
                    <div key={`folder-${i}`} className="transfer-file-item transfer-folder-item">
                      <span className="tf-icon">📁</span>
                      <span className="tf-name">{folder.name}</span>
                      <span className="tf-size">{folder.files.length} file{folder.files.length !== 1 ? 's' : ''}</span>
                      <button className="tf-remove" onClick={(e) => { e.stopPropagation(); removeTransferFolder(i) }}>✕</button>
                    </div>
                  ))}
                  {transferFiles.map((f, i) => (
                    <div key={`file-${i}`} className="transfer-file-item">
                      <span className="tf-icon">{f.type?.startsWith('image/') ? '🖼️' : '📄'}</span>
                      <span className="tf-name">{f.name}</span>
                      <span className="tf-size">{(f.size / 1024).toFixed(0)} KB</span>
                      <button className="tf-remove" onClick={(e) => { e.stopPropagation(); removeTransferFile(i) }}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Link input */}
              <label className="transfer-label">Link / URL:</label>
              <input
                type="url"
                className="transfer-link-input"
                placeholder="https://example.com"
                value={transferLink}
                onChange={(e) => setTransferLink(e.target.value)}
              />

              {/* Send button */}
              <button className="transfer-send-btn" onClick={sendTransfer} disabled={!transferTarget || (transferStatus === 'Sending...')}>
                {transferStatus === 'Sending...' ? '⏳ Uploading...' : '🚀 Send Transfer'}
              </button>

              {/* Transfer progress bar */}
              {transferProgress && (
                <div className="transfer-progress">
                  <div className="transfer-progress-header">
                    <span className="transfer-progress-file">{transferProgress.fileName}</span>
                    <span className="transfer-progress-pct">{transferProgress.overallPct}%</span>
                  </div>
                  <div className="transfer-progress-track">
                    <div className="transfer-progress-fill" style={{ width: `${transferProgress.overallPct}%` }} />
                  </div>
                  {transferProgress.totalFiles > 1 && (
                    <span className="transfer-progress-meta">File {transferProgress.fileIndex} of {transferProgress.totalFiles}</span>
                  )}
                </div>
              )}

              {transferStatus && <div className={`transfer-status ${transferStatus.startsWith('✓') ? 'success' : ''}`}>{transferStatus}</div>}

              {/* Recent transfers */}
              {transferHistory.length > 0 && (
                <div className="transfer-history">
                  <h4>Recent Transfers</h4>
                  {transferHistory.map(t => (
                    <div key={t.id} className="transfer-history-item">
                      <span className="th-icon">{t.type === 'link' ? '🔗' : t.type === 'folder' ? '📁' : '📄'}</span>
                      <span className="th-name">{t.type === 'link' ? t.title || t.url : t.type === 'folder' ? `${t.folder_name} (${t.file_count} files)` : t.filename}</span>
                      <span className="th-dir">{t.source_device} → {t.target_device}</span>
                      <span className={`th-status ${t.status}`}>{t.status}</span>
                    </div>
                  ))}
                </div>
              )}
              </>)}

              {/* ── RECEIVE TAB ──────────────────────── */}
              {transferTab === 'receive' && (<>
              <div className="incoming-transfers">
                {incomingTransfers.length === 0 && (
                  <div className="incoming-empty">
                    <span className="incoming-empty-icon">📭</span>
                    <p>No incoming transfers</p>
                    <small>Files and links sent to this device will appear here</small>
                  </div>
                )}
                {incomingTransfers.map(t => (
                  <div key={t.id} className={`incoming-item incoming-${t.status}`}>
                    <div className="incoming-item-header">
                      <span className="incoming-icon">{t.type === 'link' ? '🔗' : t.type === 'folder' ? '📁' : '📄'}</span>
                      <div className="incoming-info">
                        <span className="incoming-name">
                          {t.type === 'link' ? (t.title || t.url) : t.type === 'folder' ? `${t.folder_name} (${t.file_count} files)` : t.filename}
                        </span>
                        <span className="incoming-meta">
                          From <strong>{t.source_device}</strong> · {t.size ? `${(t.size / 1024).toFixed(0)} KB` : 'Link'} · {new Date(t.created_at * 1000).toLocaleTimeString()}
                        </span>
                      </div>
                      <span className={`incoming-status incoming-status-${t.status}`}>{t.status}</span>
                    </div>
                    <div className="incoming-actions">
                      {t.status === 'pending' && (
                        <>
                          <button className="incoming-btn incoming-accept" onClick={() => acceptTransfer(t.id)}>✓ Accept</button>
                          <button className="incoming-btn incoming-decline" onClick={() => declineTransfer(t.id)}>✗ Decline</button>
                        </>
                      )}
                      {(t.status === 'accepted' || t.status === 'pending') && (
                        <button className="incoming-btn incoming-download" onClick={() => downloadTransfer(t)}>
                          {t.type === 'link' ? '🔗 Open Link' : '⬇ Download'}
                        </button>
                      )}
                      {t.status === 'downloaded' && (
                        <button className="incoming-btn incoming-download" onClick={() => downloadTransfer(t)}>
                          {t.type === 'link' ? '🔗 Open Again' : '⬇ Download Again'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              </>)}
            </div>
          </div>
        </div>
      )}

      {/* Task Activity Log */}
      {taskLog.length > 0 && (
        <section className="task-log">
          <div className="task-log-header">
            <h4>Activity Log</h4>
            <button className="task-log-clear" onClick={() => setTaskLog([])}>Clear</button>
          </div>
          <div className="task-log-list">
            {taskLog.slice(0, 10).map((entry, i) => (
              <div key={i} className={`task-log-item ${entry.type}`}>
                <span className="task-log-time">{entry.ts}</span>
                <span className={`task-log-badge ${entry.type}`}>
                  {entry.type === 'input' ? (entry.modality || 'input') : entry.type}
                </span>
                <span className="task-log-text">{entry.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Transfer Notification Toasts */}
      {transferNotifications.length > 0 && (
        <div className="transfer-toast-container">
          {transferNotifications.map(n => (
            <div key={n.id} className={`transfer-toast ${n._event === 'receipt' ? 'transfer-toast-receipt' : ''}`}>
              <span className="transfer-toast-icon">{n._event === 'receipt' ? (n._receipt_action === 'accepted' ? '✅' : n._receipt_action === 'downloaded' ? '⬇️' : '❌') : n.type === 'link' ? '🔗' : n.type === 'folder' ? '📁' : '📥'}</span>
              <div className="transfer-toast-body">
                <strong>{n._event === 'receipt' ? `${n._label} by ${n._receipt_by}` : n.type === 'link' ? 'Link received' : n.type === 'folder' ? 'Folder received' : 'File received'}</strong>
                <span className="transfer-toast-detail">
                  {n.type === 'link' ? (n.title || n.url) : n.type === 'folder' ? `${n.folder_name} (${n.file_count} files)` : n.filename}
                  {!n._event && <small> from {n.source_device}</small>}
                </span>
              </div>
              <button className="transfer-toast-dismiss" onClick={() => setTransferNotifications(prev => prev.filter(x => x.id !== n.id))}>✕</button>
              <button className="transfer-toast-open" onClick={() => { setShowTransferPanel(true); loadTransferDevices(); setTransferNotifications(prev => prev.filter(x => x.id !== n.id)) }}>Open</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
