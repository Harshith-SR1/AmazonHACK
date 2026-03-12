import { useEffect, useRef, useState } from 'react'
import AvatarStage from './AvatarStage'

export default function VideoCallPanel({
  avatarId,
  aiResponse,
  isSpeaking,
  speechTick,
  gestureState,
  onMicClick,
  onStopMic,
  isListening,
  onGestureEvent,
  onVideoReady,
  cameraEnabled,
  onToggleCamera,
  cameraContrast = 1.2,
  cameraBrightness = 1.3,
}) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [cameraMessage, setCameraMessage] = useState('')

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  useEffect(() => {
    const initCam = async () => {
      if (!cameraEnabled) {
        stopCamera()
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          if (onVideoReady) onVideoReady(videoRef.current)
        }
        setCameraMessage('')
      } catch (err) {
        stopCamera()
        setCameraMessage('Camera access is blocked or unavailable.')
        console.error(err)
      }
    }

    initCam()

    return () => {
      stopCamera()
    }
  }, [cameraEnabled])

  return (
    <div className="video-layout">
      <div className="pane pane-camera">
        <h3>User Camera</h3>
        <div className="camera-box">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="video"
            style={{
              filter: `brightness(${cameraBrightness}) contrast(${cameraContrast})`,
              transform: 'scaleX(-1)',
            }}
          />
          <div className="camera-overlay-controls">
            <button
              className={`cam-overlay-btn ${isListening ? 'listening-btn' : ''}`}
              onClick={isListening ? onStopMic : onMicClick}
              title={isListening ? 'Stop mic' : 'Start mic'}
            >
              {isListening ? '⏹' : '🎤'}
            </button>
            <button
              className="cam-overlay-btn"
              onClick={onToggleCamera}
              title={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
            >
              {cameraEnabled ? '📷' : '📷'}
              <span className={`cam-indicator ${cameraEnabled ? 'on' : 'off'}`} />
            </button>
          </div>
        </div>
      </div>
      <div className="pane">
        <h3>AI Avatar</h3>
        <AvatarStage
          avatarId={avatarId}
          aiResponse={aiResponse}
          isSpeaking={isSpeaking}
          speechTick={speechTick}
          gestureState={gestureState}
        />
      </div>
      {cameraMessage && <div className="gen-status">{cameraMessage}</div>}
    </div>
  )
}
