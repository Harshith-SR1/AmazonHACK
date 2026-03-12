import { useCallback, useEffect, useRef, useState } from 'react'
import { API_BASE } from '../apiClient'

/**
 * VoiceStreamingPanel — Bidirectional speech-to-speech via WebSocket + Nova Sonic.
 *
 * Records user mic audio (PCM16 @ 16kHz), streams to /ws/voice/sonic,
 * receives text + audio responses, and plays them back in real-time.
 */

const SAMPLE_RATE = 16000
const WS_RECONNECT_DELAY = 2000

function getWsUrl() {
  const base = API_BASE.replace(/^http/, 'ws')
  return `${base}/ws/voice/sonic`
}

export default function VoiceStreamingPanel({ voiceLang = 'en-US', onTranscript, onResponse }) {
  const [connected, setConnected] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [status, setStatus] = useState('idle') // idle | connecting | ready | recording | processing | speaking | error
  const [userTranscript, setUserTranscript] = useState('')
  const [responseText, setResponseText] = useState('')
  const [responseChunks, setResponseChunks] = useState([])
  const [error, setError] = useState('')
  const [latency, setLatency] = useState(null)
  const [conversation, setConversation] = useState([])
  const [textInput, setTextInput] = useState('')

  const wsRef = useRef(null)
  const audioContextRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const processorRef = useRef(null)
  const sourceRef = useRef(null)
  const audioQueueRef = useRef([])
  const isPlayingRef = useRef(false)
  const recordStartRef = useRef(0)

  // ── WebSocket connection ────────────────────────────────────
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')
    setError('')
    const ws = new WebSocket(getWsUrl())

    ws.onopen = () => {
      setConnected(true)
      setStatus('ready')
      // Send config
      ws.send(JSON.stringify({ type: 'config', voice_id: 'tiffany', language: voiceLang }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        handleServerMessage(msg)
      } catch { /* ignore non-JSON */ }
    }

    ws.onerror = () => {
      setError('WebSocket connection error')
      setStatus('error')
    }

    ws.onclose = () => {
      setConnected(false)
      if (status !== 'error') setStatus('idle')
      wsRef.current = null
    }

    wsRef.current = ws
  }, [voiceLang, status])

  const disconnect = useCallback(() => {
    stopRecording()
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setConnected(false)
    setStatus('idle')
  }, [])

  // ── Handle server messages ──────────────────────────────────
  const handleServerMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'config_ack':
        break

      case 'transcript_partial':
        setUserTranscript(msg.text || '')
        break

      case 'transcript_final':
        setUserTranscript(msg.text || '')
        if (msg.text) {
          onTranscript?.(msg.text)
          setConversation((prev) => [...prev, { role: 'user', text: msg.text, ts: Date.now() }])
        }
        break

      case 'response_text':
        setResponseText((prev) => prev + (msg.text || ''))
        setResponseChunks((prev) => [...prev, msg.text || ''])
        setStatus('speaking')
        if (recordStartRef.current) {
          setLatency(Date.now() - recordStartRef.current)
          recordStartRef.current = 0
        }
        break

      case 'audio':
        if (msg.data) {
          queueAudioPlayback(msg.data)
        }
        break

      case 'action':
        // Action was executed on backend
        break

      case 'done': {
        const fullResponse = responseChunks.join('') + (responseText || '')
        if (fullResponse) {
          onResponse?.(fullResponse)
          setConversation((prev) => [...prev, { role: 'assistant', text: fullResponse, ts: Date.now() }])
        }
        setResponseText('')
        setResponseChunks([])
        setStatus('ready')
        break
      }

      case 'error':
        setError(msg.error || 'Unknown error')
        setStatus('ready')
        break

      default:
        break
    }
  }, [onTranscript, onResponse, responseChunks, responseText])

  // ── Audio recording (mic → PCM16 16kHz) ─────────────────────
  const startRecording = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected. Click Connect first.')
      return
    }

    setError('')
    setUserTranscript('')
    setResponseText('')
    setResponseChunks([])
    recordStartRef.current = Date.now()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      mediaStreamRef.current = stream

      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE })
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)
      sourceRef.current = source

      // ScriptProcessor for raw PCM access (AudioWorklet is better but needs separate file)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        if (!streaming) return
        const float32 = e.inputBuffer.getChannelData(0)
        // Convert Float32 → Int16 PCM
        const int16 = new Int16Array(float32.length)
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]))
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }
        // Send as base64
        const bytes = new Uint8Array(int16.buffer)
        const b64 = btoa(String.fromCharCode(...bytes))
        try {
          wsRef.current?.send(JSON.stringify({ type: 'audio', data: b64 }))
        } catch { /* ws closed */ }
      }

      source.connect(processor)
      processor.connect(audioContext.destination) // Required for ScriptProcessor to fire

      setStreaming(true)
      setStatus('recording')
    } catch (err) {
      setError(`Mic error: ${err.message}`)
      setStatus('error')
    }
  }, [streaming])

  const stopRecording = useCallback(() => {
    // Stop mic
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect()
      sourceRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
    }

    setStreaming(false)

    // Signal end of speech to server
    try {
      wsRef.current?.send(JSON.stringify({ type: 'end' }))
    } catch { /* ws closed */ }

    setStatus('processing')
  }, [])

  // ── Text input (type instead of speak) ──────────────────────
  const sendTextMessage = useCallback(() => {
    const text = textInput.trim()
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    setTextInput('')
    setUserTranscript(text)
    setResponseText('')
    setResponseChunks([])
    recordStartRef.current = Date.now()

    wsRef.current.send(JSON.stringify({ type: 'text', text }))
    setStatus('processing')
  }, [textInput])

  // ── Audio playback (PCM16 base64 → Web Audio API) ───────────
  const queueAudioPlayback = useCallback((b64Data) => {
    audioQueueRef.current.push(b64Data)
    if (!isPlayingRef.current) {
      playNextChunk()
    }
  }, [])

  const playNextChunk = useCallback(async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false
      return
    }

    isPlayingRef.current = true
    const b64 = audioQueueRef.current.shift()

    try {
      const binary = atob(b64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

      // Interpret as Int16 PCM
      const int16 = new Int16Array(bytes.buffer)
      const float32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 0x8000
      }

      const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE })
      const buffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE)
      buffer.getChannelData(0).set(float32)

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.onended = () => {
        ctx.close().catch(() => {})
        playNextChunk()
      }
      source.start()
    } catch {
      // Skip bad chunk, continue playing
      playNextChunk()
    }
  }, [])

  // ── Cleanup on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  // ── Status indicator ────────────────────────────────────────
  const statusConfig = {
    idle: { label: 'Disconnected', color: '#777', icon: '⚪' },
    connecting: { label: 'Connecting...', color: '#f0ad4e', icon: '🔄' },
    ready: { label: 'Ready', color: '#50c878', icon: '🟢' },
    recording: { label: 'Recording...', color: '#ff4444', icon: '🔴' },
    processing: { label: 'Processing...', color: '#3ad1ff', icon: '⏳' },
    speaking: { label: 'Speaking...', color: '#9b59b6', icon: '🔊' },
    error: { label: 'Error', color: '#ff4444', icon: '❌' },
  }
  const statusInfo = statusConfig[status] || statusConfig.idle

  return (
    <div className="voice-streaming-panel">
      {/* Header */}
      <div className="vsp-header">
        <div className="vsp-title">
          <span className="vsp-icon">🎙️</span>
          <div>
            <h4>Nova Sonic Voice Stream</h4>
            <span className="vsp-subtitle">Bidirectional speech-to-speech</span>
          </div>
        </div>
        <div className="vsp-status" style={{ color: statusInfo.color }}>
          {statusInfo.icon} {statusInfo.label}
          {latency && status === 'ready' && <span className="vsp-latency">{latency}ms</span>}
        </div>
      </div>

      {/* Connection controls */}
      <div className="vsp-connection-row">
        {!connected ? (
          <button className="vsp-connect-btn" onClick={connect} disabled={status === 'connecting'}>
            {status === 'connecting' ? '⏳ Connecting...' : '🔌 Connect to Nova Sonic'}
          </button>
        ) : (
          <button className="vsp-disconnect-btn" onClick={disconnect}>
            Disconnect
          </button>
        )}
        <span className="vsp-lang-badge">{voiceLang}</span>
      </div>

      {error && <div className="vsp-error">{error}</div>}

      {/* Recording controls */}
      {connected && (
        <div className="vsp-record-section">
          <button
            className={`vsp-record-btn ${streaming ? 'recording' : ''}`}
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={streaming ? stopRecording : undefined}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            disabled={status === 'processing' || status === 'speaking'}
          >
            {streaming ? (
              <>
                <span className="vsp-record-pulse" />
                Release to send
              </>
            ) : (
              '🎤 Hold to speak'
            )}
          </button>

          {streaming && (
            <div className="vsp-wave">
              <div className="vsp-wave-bar" /><div className="vsp-wave-bar" /><div className="vsp-wave-bar" />
              <div className="vsp-wave-bar" /><div className="vsp-wave-bar" />
            </div>
          )}

          {/* Text input alternative */}
          <div className="vsp-text-input-row">
            <input
              className="vsp-text-input"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendTextMessage() }}
              placeholder="Or type a message..."
              disabled={!connected || status === 'processing' || status === 'speaking'}
            />
            <button
              className="vsp-send-btn"
              onClick={sendTextMessage}
              disabled={!textInput.trim() || !connected || status === 'processing'}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Live transcripts */}
      {(userTranscript || responseText) && (
        <div className="vsp-live-area">
          {userTranscript && (
            <div className="vsp-live-user">
              <span className="vsp-live-label">You:</span> {userTranscript}
            </div>
          )}
          {responseText && (
            <div className="vsp-live-ai">
              <span className="vsp-live-label">Nova:</span> {responseText}
              {status === 'speaking' && <span className="vsp-typing-dot">●</span>}
            </div>
          )}
        </div>
      )}

      {/* Conversation history */}
      {conversation.length > 0 && (
        <div className="vsp-conversation">
          <h5>Conversation</h5>
          <div className="vsp-messages">
            {conversation.map((msg, i) => (
              <div key={i} className={`vsp-msg ${msg.role}`}>
                <span className="vsp-msg-role">{msg.role === 'user' ? '🗣️' : '🤖'}</span>
                <span className="vsp-msg-text">{msg.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
