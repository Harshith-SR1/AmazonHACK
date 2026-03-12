import { useMemo } from 'react'

const paletteByAvatar = {
  '671f8f176e34f8f3f9dc7f4b': { shell: '#8fa2c7', accent: '#3ad1ff', core: '#314566' },
  '671f8f2f6e34f8f3f9dc7f4c': { shell: '#8ed5c3', accent: '#1ff2c6', core: '#255c5a' }
}

const gestureLabel = {
  idle: 'Idle',
  capture_context: 'Capturing Context',
  release_context: 'Releasing Context',
  confirm: 'Confirmed',
  cancel: 'Cancelled'
}

export default function AvatarStage({ avatarId, isSpeaking, speechTick, gestureState, aiResponse }) {
  const theme = useMemo(
    () => paletteByAvatar[avatarId] || { shell: '#8fa2c7', accent: '#3ad1ff', core: '#314566' },
    [avatarId]
  )

  const mouthOpen = isSpeaking ? 6 + (speechTick % 4) * 2 : 2
  const wave1 = isSpeaking ? 15 + (speechTick % 4) * 8 : 8
  const wave2 = isSpeaking ? 8 + (speechTick % 3) * 7 : 8
  const wave3 = isSpeaking ? 12 + (speechTick % 5) * 6 : 8
  const antennaGlow = isSpeaking ? 0.95 : 0.55
  const eyeShift = isSpeaking ? (speechTick % 6) - 3 : 0

  const leftHandY = gestureState === 'confirm' ? 148 : gestureState === 'cancel' ? 198 : 174
  const rightHandY = gestureState === 'capture_context' ? 146 : gestureState === 'release_context' ? 204 : 174
  const armTilt = gestureState === 'release_context' ? 8 : gestureState === 'capture_context' ? -8 : 0

  return (
    <div className="avatar-stage-wrap">
      <svg viewBox="0 0 340 260" className="avatar-svg" role="img" aria-label="AI avatar stage">
        <defs>
          <linearGradient id="avatarBg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#101726" />
            <stop offset="100%" stopColor="#08111f" />
          </linearGradient>
          <linearGradient id="robotShell" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.shell} />
            <stop offset="100%" stopColor={theme.core} />
          </linearGradient>
          <radialGradient id="coreLight" cx="0.5" cy="0.4" r="0.7">
            <stop offset="0%" stopColor={theme.accent} />
            <stop offset="100%" stopColor="#0f2a4a" />
          </radialGradient>
        </defs>

        <rect x="0" y="0" width="340" height="260" rx="14" fill="url(#avatarBg)" />

        <circle cx="170" cy="40" r="6" fill={theme.accent} opacity={antennaGlow} />
        <rect x="167" y="48" width="6" height="18" rx="3" fill={theme.shell} />

        <rect x="113" y="74" width="114" height="86" rx="30" fill="url(#robotShell)" />
        <rect x="124" y="90" width="92" height="36" rx="18" fill="#0d1a2f" />
        <circle cx={150 + eyeShift} cy="108" r="8" fill={theme.accent} />
        <circle cx={190 + eyeShift} cy="108" r="8" fill={theme.accent} />
        <circle cx={150 + eyeShift} cy="108" r="2.5" fill="#dff8ff" />
        <circle cx={190 + eyeShift} cy="108" r="2.5" fill="#dff8ff" />

        <rect x="152" y="131" width="36" height="10" rx="5" fill="#122238" />
        <ellipse cx="170" cy="136" rx="14" ry={mouthOpen} fill={theme.accent} opacity="0.82" />

        <rect x="128" y="160" width="84" height="70" rx="22" fill="url(#robotShell)" />
        <circle cx="170" cy="194" r="20" fill="url(#coreLight)" opacity="0.85" />
        <circle cx="170" cy="194" r="11" fill="#97f7ff" opacity={antennaGlow} />

        <g transform={`rotate(${armTilt} 101 168)`}>
          <rect x="86" y="156" width="34" height="12" rx="6" fill={theme.shell} />
          <circle cx="101" cy={leftHandY} r="13" fill="#6e8cb9" />
        </g>
        <g transform={`rotate(${-armTilt} 239 168)`}>
          <rect x="220" y="156" width="34" height="12" rx="6" fill={theme.shell} />
          <circle cx="239" cy={rightHandY} r="13" fill="#6e8cb9" />
        </g>

        <rect x="148" y="232" width="10" height="14" rx="4" fill={theme.shell} />
        <rect x="182" y="232" width="10" height="14" rx="4" fill={theme.shell} />

        <g transform="translate(18, 215)">
          <rect width="12" height={wave1} x="0" y={26 - wave1} rx="3" fill={theme.accent} />
          <rect width="12" height={wave2} x="16" y={26 - wave2} rx="3" fill={theme.accent} />
          <rect width="12" height={wave3} x="32" y={26 - wave3} rx="3" fill={theme.accent} />
        </g>

        <text x="82" y="230" fill="#e6e8ef" fontSize="12">{isSpeaking ? 'Synthesizing...' : 'Listening...'}</text>
      </svg>

      <div className="avatar-status-row">
        <span className={`status-pill ${isSpeaking ? 'speaking' : ''}`}>{isSpeaking ? 'Voice ON' : 'Voice OFF'}</span>
        <span className="status-pill">Gesture: {gestureLabel[gestureState] || 'Idle'}</span>
      </div>

      <div className="ai-response">{aiResponse || 'AI response will appear here...'}</div>
    </div>
  )
}
