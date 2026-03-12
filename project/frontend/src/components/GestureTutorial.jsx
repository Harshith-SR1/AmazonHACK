import { useState, useCallback } from 'react'

const TUTORIAL_STEPS = [
  {
    gesture: 'fist',
    emoji: '✊',
    title: 'Fist — Capture Context',
    instruction: 'Close all fingers into a fist. This gesture captures the current context for the AI to analyze.',
    tip: 'Keep your hand steady and visible to the camera.',
  },
  {
    gesture: 'open_palm',
    emoji: '🖐️',
    title: 'Open Palm — Release / Send',
    instruction: 'Spread all five fingers wide open. This confirms and sends the current action.',
    tip: 'Make sure all fingers are clearly separated.',
  },
  {
    gesture: 'thumbs_up',
    emoji: '👍',
    title: 'Thumbs Up — Confirm',
    instruction: 'Raise only your thumb while keeping other fingers folded. This confirms the current action.',
    tip: 'Point your thumb straight up for best detection.',
  },
  {
    gesture: 'two_fingers',
    emoji: '✌️',
    title: 'Two Fingers — Cancel / Back',
    instruction: 'Raise your index and middle fingers in a peace sign. This cancels or goes back.',
    tip: 'Keep your ring and pinky fingers tucked in.',
  },
  {
    gesture: 'one_finger',
    emoji: '☝️',
    title: 'Index Finger — Open YouTube',
    instruction: 'Raise only your index finger. This is a shortcut to open YouTube instantly.',
    tip: 'Hold the gesture for about 1 second.',
  },
  {
    gesture: 'middle_finger',
    emoji: '🖕',
    title: 'Middle Finger — Open WhatsApp',
    instruction: 'Raise only your middle finger. This opens WhatsApp directly.',
    tip: 'Make sure only the middle finger is extended.',
  },
  {
    gesture: 'three_fingers',
    emoji: '🤟',
    title: 'Three Fingers — Open New Tab',
    instruction: 'Raise your index, middle, and ring fingers together. This opens a new browser tab.',
    tip: 'Keep your pinky finger down.',
  },
  {
    gesture: 'pinky_finger',
    emoji: '🤙',
    title: 'Pinky Finger — Device Transfer',
    instruction: 'Raise only your pinky finger. This opens the device transfer panel to send files between devices.',
    tip: 'Hold steady — the transfer panel will pop up.',
  },
]

export default function GestureTutorial({ onClose, onTryGesture }) {
  const [step, setStep] = useState(0)
  const current = TUTORIAL_STEPS[step]
  const isLast = step === TUTORIAL_STEPS.length - 1

  const next = useCallback(() => {
    if (isLast) { onClose(); return }
    setStep(s => s + 1)
  }, [isLast, onClose])

  const prev = useCallback(() => {
    setStep(s => Math.max(0, s - 1))
  }, [])

  return (
    <div className="gesture-tutorial">
      <div className="tutorial-header">
        <h4>Gesture Tutorial</h4>
        <span className="tutorial-progress">{step + 1} / {TUTORIAL_STEPS.length}</span>
        <button className="tutorial-close" onClick={onClose}>✕</button>
      </div>

      <div className="tutorial-progress-bar">
        <div className="tutorial-progress-fill" style={{ width: `${((step + 1) / TUTORIAL_STEPS.length) * 100}%` }} />
      </div>

      <div className="tutorial-step">
        <div className="tutorial-emoji">{current.emoji}</div>
        <h5 className="tutorial-step-title">{current.title}</h5>
        <p className="tutorial-instruction">{current.instruction}</p>
        <div className="tutorial-tip">💡 {current.tip}</div>
      </div>

      {onTryGesture && (
        <button className="tutorial-try-btn" onClick={() => onTryGesture(current.gesture)}>
          Try it now →
        </button>
      )}

      <div className="tutorial-nav">
        <button className="tutorial-nav-btn" onClick={prev} disabled={step === 0}>
          ← Previous
        </button>
        <button className="tutorial-nav-btn primary" onClick={next}>
          {isLast ? 'Finish ✓' : 'Next →'}
        </button>
      </div>
    </div>
  )
}
