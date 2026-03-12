import { useEffect, useRef, useState } from 'react'
import { jsonFetch } from '../apiClient'

const EXAMPLE_TASKS = [
  'Search Google for "accessibility tools" and click the first result',
  'Open YouTube and search for "Nova AI demo"',
  'Navigate to Wikipedia and search for "screen reader"',
  'Go to Amazon and search for "wireless headphones"',
  'Open GitHub and navigate to the trending page',
]

export default function BrowserAutomationScreen() {
  const [devices, setDevices] = useState([])
  const [goal, setGoal] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [mode, setMode] = useState('autonomous') // 'single' | 'autonomous'
  const [maxSteps, setMaxSteps] = useState(5)
  const [running, setRunning] = useState(false)
  const [steps, setSteps] = useState([])
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])
  const stepsEndRef = useRef(null)

  useEffect(() => {
    jsonFetch('/api/devices')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setDevices(data)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [steps])

  const runTask = async () => {
    if (!goal.trim()) { setError('Enter a goal first.'); return }
    setRunning(true)
    setSteps([])
    setResult(null)
    setError('')

    try {
      const body = {
        goal: goal.trim(),
        autonomous: mode === 'autonomous',
        max_steps: maxSteps,
      }
      if (deviceId) body.device_id = deviceId

      const res = await jsonFetch('/api/act/analyze', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!data.ok) {
        setError(data.error || 'Task failed.')
        setResult(data)
      } else {
        setResult(data)
        const taskSteps = data.result?.steps || []
        setSteps(taskSteps)

        // Add to history
        setHistory((prev) => [{
          id: Date.now(),
          goal: goal.trim(),
          mode: data.mode,
          totalSteps: data.result?.total_steps || taskSteps.length,
          success: taskSteps.length > 0 && taskSteps[taskSteps.length - 1]?.executed_action?.action === 'done',
          timestamp: new Date().toLocaleTimeString(),
        }, ...prev].slice(0, 20))
      }
    } catch {
      setError('Failed to reach backend. Is the server running?')
    } finally {
      setRunning(false)
    }
  }

  const stopTask = () => {
    // Can't abort an in-flight fetch easily, but we flag UI
    setRunning(false)
    setError('Task aborted by user.')
  }

  const actionIcon = (action) => {
    switch (action) {
      case 'click': return '🖱️'
      case 'type': return '⌨️'
      case 'scroll': return '📜'
      case 'wait': return '⏳'
      case 'done': return '✅'
      default: return '⚡'
    }
  }

  return (
    <div className="browser-automation">
      <h2>🌐 Browser Automation</h2>
      <p className="automation-subtitle">
        Powered by Amazon Nova Act — describe a web task and let AI execute it step by step.
      </p>

      {/* Goal input */}
      <div className="auto-goal-section">
        <label className="auto-label">Task Goal</label>
        <textarea
          className="auto-goal-input"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Describe what you want the browser to do..."
          rows={3}
          disabled={running}
        />
        <div className="auto-examples">
          {EXAMPLE_TASKS.map((ex, i) => (
            <button key={i} className="auto-example-chip" onClick={() => setGoal(ex)} disabled={running}>
              {ex.length > 45 ? ex.slice(0, 45) + '…' : ex}
            </button>
          ))}
        </div>
      </div>

      {/* Config row */}
      <div className="auto-config-row">
        <div className="auto-config-group">
          <label className="auto-label">Target Device</label>
          <select
            className="auto-select"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            disabled={running}
          >
            <option value="">This Computer (Desktop)</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.type}) {d.online ? '🟢' : '⚪'}
              </option>
            ))}
          </select>
        </div>

        <div className="auto-config-group">
          <label className="auto-label">Mode</label>
          <div className="auto-mode-toggle">
            <button
              className={`auto-mode-btn ${mode === 'single' ? 'active' : ''}`}
              onClick={() => setMode('single')}
              disabled={running}
            >
              Single Step
            </button>
            <button
              className={`auto-mode-btn ${mode === 'autonomous' ? 'active' : ''}`}
              onClick={() => setMode('autonomous')}
              disabled={running}
            >
              Autonomous
            </button>
          </div>
        </div>

        {mode === 'autonomous' && (
          <div className="auto-config-group">
            <label className="auto-label">Max Steps: {maxSteps}</label>
            <input
              type="range"
              min={2}
              max={10}
              value={maxSteps}
              onChange={(e) => setMaxSteps(Number(e.target.value))}
              className="auto-slider"
              disabled={running}
            />
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="auto-action-row">
        {!running ? (
          <button className="auto-run-btn" onClick={runTask} disabled={!goal.trim()}>
            🚀 Run Task
          </button>
        ) : (
          <button className="auto-stop-btn" onClick={stopTask}>
            ⏹️ Stop
          </button>
        )}
        {running && <span className="auto-running-indicator"><span className="auto-running-dot" /> Running...</span>}
      </div>

      {error && <div className="auto-error">{error}</div>}

      {/* Live steps display */}
      {steps.length > 0 && (
        <div className="auto-steps-panel">
          <h4>Execution Steps ({steps.length})</h4>
          <div className="auto-steps-list">
            {steps.map((step, i) => {
              const action = step.executed_action || {}
              const isLast = i === steps.length - 1
              const isDone = action.action === 'done'
              const isFail = step.ok === false

              return (
                <div key={i} className={`auto-step ${isDone ? 'done' : ''} ${isFail ? 'fail' : ''} ${isLast ? 'latest' : ''}`}>
                  <div className="auto-step-header">
                    <span className="auto-step-num">Step {(step.step ?? i) + 1}</span>
                    <span className="auto-step-action">
                      {actionIcon(action.action)} {action.action || 'error'}
                    </span>
                  </div>
                  {action.element && (
                    <div className="auto-step-detail">
                      <span className="auto-step-label">Target:</span> {action.element}
                    </div>
                  )}
                  {action.text && (
                    <div className="auto-step-detail">
                      <span className="auto-step-label">Text:</span> <code>{action.text}</code>
                    </div>
                  )}
                  {action.reason && (
                    <div className="auto-step-reason">{action.reason}</div>
                  )}
                  {isFail && step.error && (
                    <div className="auto-step-error">{step.error}</div>
                  )}
                </div>
              )
            })}
            <div ref={stepsEndRef} />
          </div>
        </div>
      )}

      {/* Result summary */}
      {result && !running && (
        <div className={`auto-result ${result.ok ? 'success' : 'failure'}`}>
          <div className="auto-result-header">
            {result.ok ? '✅ Task Complete' : '❌ Task Failed'}
          </div>
          <div className="auto-result-meta">
            Mode: <strong>{result.mode}</strong> · Steps: <strong>{result.result?.total_steps || 0}</strong>
            {result.result?.steps?.length > 0 && (() => {
              const last = result.result.steps[result.result.steps.length - 1]
              const act = last.executed_action?.action
              return act === 'done' ? ' · Goal achieved' : ` · Last action: ${act || 'unknown'}`
            })()}
          </div>
        </div>
      )}

      {/* Task history */}
      {history.length > 0 && (
        <div className="auto-history">
          <h4>Task History</h4>
          {history.map((h) => (
            <div key={h.id} className="auto-history-item" onClick={() => setGoal(h.goal)}>
              <div className="auto-history-goal">
                {h.success ? '✅' : '⚠️'} {h.goal}
              </div>
              <div className="auto-history-meta">
                {h.mode} · {h.totalSteps} steps · {h.timestamp}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
