import { useState, useRef, useCallback, useEffect } from 'react'

const MORSE_TABLE = {
  '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E',
  '..-.': 'F', '--.': 'G', '....': 'H', '..': 'I', '.---': 'J',
  '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O',
  '.--.': 'P', '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T',
  '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X', '-.--': 'Y',
  '--..': 'Z', '.----': '1', '..---': '2', '...--': '3', '....-': '4',
  '.....': '5', '-....': '6', '--...': '7', '---..': '8', '----.': '9',
  '-----': '0', '.-.-.-': '.', '--..--': ',', '..--..': '?',
  '.----.': "'", '-.-.--': '!', '-..-.': '/', '-.--.': '(',
  '-.--.-': ')', '.-...': '&', '---...': ':', '-.-.-.': ';',
  '-...-': '=', '.-.-.': '+', '-....-': '-', '..--.-': '_',
  '.-..-.': '"', '...-..-': '$', '.--.-.': '@',
}

const DOT_THRESHOLD = 200 // ms: press shorter than this = dot, longer = dash
const CHAR_GAP = 600      // ms: pause between signals to finalize a character
const WORD_GAP = 1400     // ms: pause to insert a space

/* ── Eye-blink detection constants ────────────────────────────── */
const EYE_BLINK_DOT = 350   // blink shorter than this = dot
const EYE_CHECK_INTERVAL = 60 // ms between eye checks

export default function MorseCodeInput({ onDecode, enableEyeBlink = false, videoEl = null }) {
  const [currentSignals, setCurrentSignals] = useState('')
  const [decodedText, setDecodedText] = useState('')
  const [isPressed, setIsPressed] = useState(false)
  const [displayMorse, setDisplayMorse] = useState('')
  const [eyeBlinkMode, setEyeBlinkMode] = useState(false)
  const [blinkState, setBlinkState] = useState('open') // 'open' | 'closed'

  const pressStartRef = useRef(0)
  const charTimerRef = useRef(null)
  const wordTimerRef = useRef(null)
  const signalsRef = useRef('')
  const textRef = useRef('')

  // Eye blink refs
  const eyeCanvasRef = useRef(null)
  const eyeIntervalRef = useRef(null)
  const blinkStartRef = useRef(0)
  const blinkActiveRef = useRef(false)
  const eyeCharTimerRef = useRef(null)
  const eyeWordTimerRef = useRef(null)

  const finalizeChar = useCallback(() => {
    const signals = signalsRef.current
    if (!signals) return
    const letter = MORSE_TABLE[signals] || '?'
    textRef.current += letter
    setDecodedText(textRef.current)
    signalsRef.current = ''
    setCurrentSignals('')
  }, [])

  const addWordGap = useCallback(() => {
    finalizeChar()
    textRef.current += ' '
    setDecodedText(textRef.current)
  }, [finalizeChar])

  const addSignal = useCallback((signal) => {
    signalsRef.current += signal
    setCurrentSignals(signalsRef.current)
    setDisplayMorse((prev) => prev + signal)

    if (eyeCharTimerRef.current) clearTimeout(eyeCharTimerRef.current)
    if (eyeWordTimerRef.current) clearTimeout(eyeWordTimerRef.current)
    eyeCharTimerRef.current = setTimeout(finalizeChar, CHAR_GAP)
    eyeWordTimerRef.current = setTimeout(addWordGap, WORD_GAP)
  }, [finalizeChar, addWordGap])

  const handleDown = useCallback(() => {
    setIsPressed(true)
    pressStartRef.current = Date.now()
    if (charTimerRef.current) clearTimeout(charTimerRef.current)
    if (wordTimerRef.current) clearTimeout(wordTimerRef.current)
  }, [])

  const handleUp = useCallback(() => {
    setIsPressed(false)
    const duration = Date.now() - pressStartRef.current
    const signal = duration < DOT_THRESHOLD ? '.' : '-'
    signalsRef.current += signal
    setCurrentSignals(signalsRef.current)
    setDisplayMorse((prev) => prev + signal)

    charTimerRef.current = setTimeout(finalizeChar, CHAR_GAP)
    wordTimerRef.current = setTimeout(addWordGap, WORD_GAP)
  }, [finalizeChar, addWordGap])

  // Keyboard support: spacebar
  useEffect(() => {
    const onKeyDown = (e) => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); handleDown() } }
    const onKeyUp = (e) => { if (e.code === 'Space') { e.preventDefault(); handleUp() } }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) }
  }, [handleDown, handleUp])

  /* ── Eye-blink detection via brightness analysis ─────────────
     Uses the user's camera video element. We capture a small region
     around the eye area, compute average brightness, and detect blinks
     as brightness drops (eyes closing = darker pixel region).
     Short blink = dot, long blink = dash. */
  useEffect(() => {
    if (!eyeBlinkMode || !enableEyeBlink || !videoEl) {
      if (eyeIntervalRef.current) { clearInterval(eyeIntervalRef.current); eyeIntervalRef.current = null }
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = 80
    canvas.height = 30
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    eyeCanvasRef.current = canvas

    // Baseline brightness (calibrate over first second)
    let baseline = null
    let calibrationFrames = 0
    let calibrationSum = 0
    const CALIBRATION_COUNT = 15
    const BLINK_THRESHOLD_RATIO = 0.7 // below 70% of baseline = blink

    const getEyeRegionBrightness = () => {
      if (!videoEl || videoEl.readyState < 2) return null
      // Sample from the upper-middle area where eyes typically are
      const vw = videoEl.videoWidth || 640
      const vh = videoEl.videoHeight || 360
      const sx = vw * 0.3, sy = vh * 0.2, sw = vw * 0.4, sh = vh * 0.15
      try {
        ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, 80, 30)
        const imageData = ctx.getImageData(0, 0, 80, 30)
        const data = imageData.data
        let sum = 0
        for (let i = 0; i < data.length; i += 4) {
          sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 // luminance
        }
        return sum / (data.length / 4)
      } catch { return null }
    }

    eyeIntervalRef.current = setInterval(() => {
      const brightness = getEyeRegionBrightness()
      if (brightness === null) return

      // Calibration phase
      if (calibrationFrames < CALIBRATION_COUNT) {
        calibrationSum += brightness
        calibrationFrames++
        if (calibrationFrames === CALIBRATION_COUNT) {
          baseline = calibrationSum / CALIBRATION_COUNT
        }
        return
      }

      const isClosed = brightness < baseline * BLINK_THRESHOLD_RATIO

      if (isClosed && !blinkActiveRef.current) {
        // Blink started
        blinkActiveRef.current = true
        blinkStartRef.current = Date.now()
        setBlinkState('closed')
      } else if (!isClosed && blinkActiveRef.current) {
        // Blink ended
        blinkActiveRef.current = false
        setBlinkState('open')
        const duration = Date.now() - blinkStartRef.current
        if (duration > 80) { // ignore very short noise
          const signal = duration < EYE_BLINK_DOT ? '.' : '-'
          addSignal(signal)
        }
      }

      // Continuously re-calibrate baseline slowly (adaptive)
      if (!isClosed) {
        baseline = baseline * 0.98 + brightness * 0.02
      }
    }, EYE_CHECK_INTERVAL)

    return () => {
      if (eyeIntervalRef.current) { clearInterval(eyeIntervalRef.current); eyeIntervalRef.current = null }
    }
  }, [eyeBlinkMode, enableEyeBlink, videoEl, addSignal])

  const handleSend = () => {
    finalizeChar()
    setTimeout(() => {
      const text = textRef.current.trim()
      if (text && onDecode) onDecode(text)
    }, 100)
  }

  const handleClear = () => {
    signalsRef.current = ''
    textRef.current = ''
    setCurrentSignals('')
    setDecodedText('')
    setDisplayMorse('')
    if (charTimerRef.current) clearTimeout(charTimerRef.current)
    if (wordTimerRef.current) clearTimeout(wordTimerRef.current)
    if (eyeCharTimerRef.current) clearTimeout(eyeCharTimerRef.current)
    if (eyeWordTimerRef.current) clearTimeout(eyeWordTimerRef.current)
  }

  return (
    <div className="morse-input">
      <div className="morse-instructions">
        <span>Tap the key or press <kbd>Space</kbd>:</span>
        <span className="morse-legend">Short tap = <strong>dot (.)</strong> &nbsp; Long tap = <strong>dash (-)</strong></span>
      </div>

      {/* Eye Blink Mode Toggle */}
      {enableEyeBlink && (
        <div className="eye-blink-toggle">
          <button
            className={`eye-blink-btn ${eyeBlinkMode ? 'active' : ''}`}
            onClick={() => setEyeBlinkMode((p) => !p)}
          >
            👁️ {eyeBlinkMode ? 'Eye Blink Mode ON' : 'Enable Eye Blink Mode'}
          </button>
          {eyeBlinkMode && (
            <div className="eye-blink-info">
              <span className={`eye-indicator ${blinkState}`}>
                {blinkState === 'closed' ? '😑' : '👁️'}
              </span>
              <span>Short blink = dot &nbsp; Long blink = dash</span>
            </div>
          )}
        </div>
      )}

      <button
        className={`morse-key ${isPressed ? 'pressed' : ''}`}
        onMouseDown={handleDown}
        onMouseUp={handleUp}
        onMouseLeave={() => isPressed && handleUp()}
        onTouchStart={(e) => { e.preventDefault(); handleDown() }}
        onTouchEnd={(e) => { e.preventDefault(); handleUp() }}
      >
        <div className="morse-key-inner">
          <span className="morse-key-symbol">●</span>
          <span className="morse-key-label">{isPressed ? 'HOLD for dash' : 'TAP for dot'}</span>
        </div>
      </button>

      <div className="morse-display">
        <div className="morse-signals">
          <span className="morse-display-label">Morse:</span>
          <span className="morse-display-value">{displayMorse || '—'}</span>
          {currentSignals && <span className="morse-current"> ({currentSignals})</span>}
        </div>
        <div className="morse-decoded">
          <span className="morse-display-label">Decoded:</span>
          <span className="morse-decoded-value">{decodedText || '—'}</span>
        </div>
      </div>

      <div className="morse-actions">
        <button className="morse-send" onClick={handleSend} disabled={!decodedText.trim()}>
          Send Command
        </button>
        <button className="morse-clear" onClick={handleClear}>Clear</button>
      </div>

      <div className="morse-reference">
        <details>
          <summary>Morse Code Reference</summary>
          <div className="morse-ref-grid">
            {Object.entries(MORSE_TABLE).slice(0, 36).map(([code, char]) => (
              <div key={code} className="morse-ref-item">
                <span className="morse-ref-char">{char}</span>
                <span className="morse-ref-code">{code}</span>
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  )
}
