import { useEffect, useState } from 'react'
import { API_BASE, jsonFetch } from '../apiClient'
import { getPermissionStatus, requestSinglePermission } from '../mobilePermissions'
import DeviceControlScreen from './DeviceControlScreen'
import GestureTrainingScreen from './GestureTrainingScreen'
import BrowserAutomationScreen from './BrowserAutomationScreen'
import { WORLD_LANGUAGES } from '../languages'

/* ── Avatar theme presets ──────────────────────────────────────── */
const AVATAR_THEMES = [
  { id: 'default', label: 'Classic Blue', shell: '#8fa2c7', accent: '#3ad1ff', core: '#314566' },
  { id: 'emerald', label: 'Emerald', shell: '#8ed5c3', accent: '#1ff2c6', core: '#255c5a' },
  { id: 'sunset', label: 'Sunset Orange', shell: '#c7a08f', accent: '#ff8a3a', core: '#66413b' },
  { id: 'lavender', label: 'Lavender', shell: '#b8a2d4', accent: '#c084fc', core: '#443566' },
  { id: 'neon', label: 'Neon Green', shell: '#8fc7a2', accent: '#39ff14', core: '#1a4d2e' },
]

const AVATAR_EXPRESSIONS = [
  { id: 'friendly', label: 'Friendly' },
  { id: 'professional', label: 'Professional' },
  { id: 'energetic', label: 'Energetic' },
  { id: 'calm', label: 'Calm' },
]

const SPEECH_SPEEDS = [
  { value: 0.75, label: 'Slow' },
  { value: 1.0, label: 'Normal' },
  { value: 1.25, label: 'Fast' },
  { value: 1.5, label: 'Very Fast' },
]

export default function SettingsScreen({ avatarId, setAvatarId, voiceLang = 'en-US', setVoiceLang }) {
  const [section, setSection] = useState('general')
  const [voiceName, setVoiceName] = useState('en-US-Neural2-A')
  const [status, setStatus] = useState('')
  const [permStatus, setPermStatus] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  // Avatar settings
  const [avatarTheme, setAvatarTheme] = useState('default')
  const [avatarExpression, setAvatarExpression] = useState('friendly')
  const [avatarName, setAvatarName] = useState('Nova')
  const [speechSpeed, setSpeechSpeed] = useState(1.0)
  const [avatarAnimations, setAvatarAnimations] = useState(true)

  // Device linking & discovery
  const [linkMethod, setLinkMethod] = useState('wifi')
  const [pairingCode, setPairingCode] = useState('')
  const [linkedDevices, setLinkedDevices] = useState([])
  const [linkStatus, setLinkStatus] = useState('')
  const [scanResults, setScanResults] = useState([])
  const [isScanning, setIsScanning] = useState(false)
  const [scanView, setScanView] = useState('paired') // 'paired' | 'scan'

  // AWS credentials
  const [awsAccessKey, setAwsAccessKey] = useState('')
  const [awsSecretKey, setAwsSecretKey] = useState('')
  const [awsSessionToken, setAwsSessionToken] = useState('')
  const [awsRegion, setAwsRegion] = useState('us-east-1')
  const [awsStatus, setAwsStatus] = useState(null) // from backend
  const [awsTesting, setAwsTesting] = useState(false)
  const [awsSaving, setAwsSaving] = useState(false)
  const [awsMessage, setAwsMessage] = useState('')
  const [awsShowSecret, setAwsShowSecret] = useState(false)

  const statusTone = status.toLowerCase().includes('failed') ? 'error' : 'ok'

  const save = async () => {
    try {
      setIsSaving(true)
      const res = await jsonFetch('/api/settings/avatar', {
        method: 'POST',
        body: JSON.stringify({
          avatar_id: avatarId,
          voice_name: voiceName,
          theme: avatarTheme,
          expression: avatarExpression,
          avatar_name: avatarName,
          speech_speed: speechSpeed,
          animations_enabled: avatarAnimations,
        })
      })
      const data = await res.json()
      setStatus(data.ok ? 'Settings saved successfully.' : 'Failed to save settings.')
    } catch (error) {
      setStatus(`Failed to save settings: ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    getPermissionStatus().then(setPermStatus).catch(() => setPermStatus(null))
  }, [])

  const refreshPermissions = async () => {
    setPermStatus(await getPermissionStatus())
  }

  const handlePermissionToggle = async (permissionKey, nextEnabled) => {
    if (nextEnabled) {
      const result = await requestSinglePermission(permissionKey)
      setStatus(result.ok ? 'Permission granted.' : `Permission denied: ${result.error}`)
      await refreshPermissions()
      return
    }
    setStatus('To revoke a permission, open your browser\'s site settings (click the lock icon in the address bar) and change it there.')
    await refreshPermissions()
  }

  // Load linked devices from backend on mount
  useEffect(() => {
    jsonFetch('/api/devices').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setLinkedDevices(data.map(d => ({ ...d, method: d.type, status: d.online ? 'online' : 'offline' })))
    }).catch(() => {})
  }, [])

  const generatePairingCode = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase()
    setPairingCode(code)
    setLinkStatus(`Pairing code generated: ${code}. Share this with the other device.`)
  }

  const handleLinkDevice = async () => {
    if (!pairingCode.trim()) {
      setLinkStatus('Enter or generate a pairing code first.')
      return
    }
    setLinkStatus(`Searching for device via ${linkMethod === 'wifi' ? 'Wi-Fi' : 'Bluetooth'}...`)
    try {
      const res = await jsonFetch('/api/devices/pair', {
        method: 'POST',
        body: JSON.stringify({ method: linkMethod, pairing_code: pairingCode })
      })
      const data = await res.json()
      if (data.ok) {
        setLinkedDevices((prev) => [...prev, { id: data.device_id || pairingCode, name: data.device_name || 'Unknown Device', method: linkMethod, status: 'connected' }])
        setLinkStatus(`Device paired successfully via ${linkMethod === 'wifi' ? 'Wi-Fi' : 'Bluetooth'}.`)
        setPairingCode('')
      } else {
        setLinkStatus(data.detail || 'Pairing failed. Make sure both devices are on the same network.')
      }
    } catch {
      setLinkedDevices((prev) => [...prev, { id: pairingCode, name: `Device-${pairingCode}`, method: linkMethod, status: 'connected' }])
      setLinkStatus(`Device paired (demo mode) via ${linkMethod === 'wifi' ? 'Wi-Fi' : 'Bluetooth'}.`)
      setPairingCode('')
    }
  }

  const scanForDevices = async () => {
    setIsScanning(true)
    setScanResults([])
    setLinkStatus(`Scanning for ${linkMethod === 'wifi' ? 'Wi-Fi' : 'Bluetooth'} devices...`)
    setScanView('scan')

    try {
      // For Bluetooth in browsers, try Web Bluetooth API first
      if (linkMethod === 'bluetooth' && navigator.bluetooth) {
        try {
          const webBtDevice = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: ['generic_access'],
          })
          if (webBtDevice) {
            setScanResults([{
              address: webBtDevice.id,
              name: webBtDevice.name || `BLE-${webBtDevice.id.slice(-5)}`,
              type: 'unknown',
              method: 'bluetooth',
              rssi: null,
            }])
            setLinkStatus('Bluetooth device selected via browser.')
            setIsScanning(false)
            return
          }
        } catch {
          // User cancelled or Web Bluetooth unavailable — fall back to backend scan
        }
      }

      // Backend scan
      const res = await jsonFetch(`/api/devices/scan/${linkMethod}`, { method: 'POST' })
      const data = await res.json()
      if (data.ok && data.devices) {
        setScanResults(data.devices)
        setLinkStatus(data.count > 0 ? `Found ${data.count} device(s).` : 'No devices found. Make sure devices are on the same network.')
      } else {
        setLinkStatus('Scan completed — no devices found.')
      }
    } catch {
      setLinkStatus('Scan failed. Backend may be offline.')
    } finally {
      setIsScanning(false)
    }
  }

  const pairDiscoveredDevice = async (device) => {
    setLinkStatus(`Pairing with ${device.name}...`)
    try {
      const res = await jsonFetch('/api/devices/pair-discovered', {
        method: 'POST',
        body: JSON.stringify({
          method: device.method,
          address: device.address,
          name: device.name,
          device_type: device.type || 'unknown',
        })
      })
      const data = await res.json()
      if (data.ok) {
        setLinkedDevices((prev) => [...prev.filter(d => d.id !== data.device_id), {
          id: data.device_id,
          name: data.device_name,
          method: data.method,
          status: 'connected',
        }])
        setScanResults((prev) => prev.filter(d => d.address !== device.address))
        setLinkStatus(`${data.device_name} paired successfully.`)
      } else {
        setLinkStatus('Pairing failed.')
      }
    } catch {
      setLinkStatus('Pairing failed — backend may be offline.')
    }
  }

  const removeLinkedDevice = async (deviceId) => {
    try {
      await jsonFetch(`/api/devices/${deviceId}`, { method: 'DELETE' })
    } catch {
      // Continue with local removal even if backend fails
    }
    setLinkedDevices((prev) => prev.filter((d) => d.id !== deviceId))
    setLinkStatus('Device removed.')
  }

  return (
    <section className="settings-screen">
      <div className="settings-head">
        <h2>Settings</h2>
      </div>

      <div className="settings-section-tabs">
        <button className={section === 'general' ? 'active' : ''} onClick={() => setSection('general')}>General</button>
        <button className={section === 'avatar' ? 'active' : ''} onClick={() => setSection('avatar')}>Avatar</button>
        <button className={section === 'linking' ? 'active' : ''} onClick={() => setSection('linking')}>Device Link</button>
        <button className={section === 'device' ? 'active' : ''} onClick={() => setSection('device')}>Device</button>
        <button className={section === 'gesture' ? 'active' : ''} onClick={() => setSection('gesture')}>Gesture</button>
        <button className={section === 'browser' ? 'active' : ''} onClick={() => setSection('browser')}>Browser AI</button>
        <button className={section === 'aws' ? 'active' : ''} onClick={() => setSection('aws')}>AWS</button>
      </div>

      {/* ── Device Control ──────────────────────────── */}
      {section === 'device' && (
        <article className="settings-card settings-card-wide">
          <DeviceControlScreen />
        </article>
      )}

      {/* ── Gesture Training ────────────────────────── */}
      {section === 'gesture' && (
        <article className="settings-card settings-card-wide">
          <GestureTrainingScreen />
        </article>
      )}

      {/* ── Browser AI (Nova Act) ───────────────────── */}
      {section === 'browser' && (
        <article className="settings-card settings-card-wide">
          <BrowserAutomationScreen />
        </article>
      )}

      {/* ── Avatar Settings ─────────────────────────── */}
      {section === 'avatar' && (
        <div className="settings-grid">
          <article className="settings-card">
            <h3>Avatar Identity</h3>
            <p>Customize your AI assistant's appearance and personality.</p>

            <label>Avatar Name</label>
            <input
              className="settings-input"
              value={avatarName}
              onChange={(e) => setAvatarName(e.target.value)}
              placeholder="e.g. Nova, Aria, Jarvis"
            />

            <label>Expression Style</label>
            <div className="avatar-option-chips">
              {AVATAR_EXPRESSIONS.map((expr) => (
                <button
                  key={expr.id}
                  className={`option-chip ${avatarExpression === expr.id ? 'active' : ''}`}
                  onClick={() => setAvatarExpression(expr.id)}
                >
                  {expr.label}
                </button>
              ))}
            </div>
          </article>

          <article className="settings-card">
            <h3>Color Theme</h3>
            <p>Pick a visual style for the avatar.</p>

            <div className="avatar-theme-grid">
              {AVATAR_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  className={`avatar-theme-card ${avatarTheme === theme.id ? 'active' : ''}`}
                  onClick={() => setAvatarTheme(theme.id)}
                >
                  <div className="theme-swatch">
                    <span style={{ background: theme.shell }} />
                    <span style={{ background: theme.accent }} />
                    <span style={{ background: theme.core }} />
                  </div>
                  <span className="theme-label">{theme.label}</span>
                </button>
              ))}
            </div>
          </article>

          <article className="settings-card">
            <h3>Voice & Animation</h3>
            <p>Configure speech and motion behavior.</p>

            <label>Voice Profile</label>
            <input
              className="settings-input"
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              placeholder="e.g. en-US-Neural2-A"
            />

            <label>Speech Speed</label>
            <div className="avatar-option-chips">
              {SPEECH_SPEEDS.map((s) => (
                <button
                  key={s.value}
                  className={`option-chip ${speechSpeed === s.value ? 'active' : ''}`}
                  onClick={() => setSpeechSpeed(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <label className="toggle-row">
              <span>Enable Animations</span>
              <label className="permission-switch">
                <input type="checkbox" checked={avatarAnimations} onChange={(e) => setAvatarAnimations(e.target.checked)} />
                <span className="permission-slider" />
                <span className={`permission-state ${avatarAnimations ? 'on' : 'off'}`}>{avatarAnimations ? 'ON' : 'OFF'}</span>
              </label>
            </label>
          </article>

          <article className="settings-card">
            <h3>Avatar Selection</h3>
            <p>Choose between available avatar models.</p>

            <select className="settings-select" value={avatarId} onChange={(e) => setAvatarId(e.target.value)}>
              <option value="671f8f176e34f8f3f9dc7f4b">Avatar 1 — Standard</option>
              <option value="671f8f2f6e34f8f3f9dc7f4c">Avatar 2 — Alternate</option>
            </select>
          </article>

          <div className="settings-footer">
            <button onClick={save} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Avatar Settings'}</button>
            {status && <span className={`settings-status ${statusTone}`}>{status}</span>}
          </div>
        </div>
      )}

      {/* ── Device Linking (BT / Wi-Fi) ─────────────── */}
      {section === 'linking' && (
        <div className="settings-grid">
          <article className="settings-card settings-card-wide">
            <h3>Device Discovery</h3>
            <p>Scan for nearby devices on your network or via Bluetooth, then pair them instantly.</p>

            <div className="link-method-row">
              <button className={`link-method-btn ${linkMethod === 'wifi' ? 'active' : ''}`} onClick={() => { setLinkMethod('wifi'); setScanResults([]); }}>
                📶 Wi-Fi
              </button>
              <button className={`link-method-btn ${linkMethod === 'bluetooth' ? 'active' : ''}`} onClick={() => { setLinkMethod('bluetooth'); setScanResults([]); }}>
                🔵 Bluetooth
              </button>
            </div>

            <button className={`scan-btn ${isScanning ? 'scanning' : ''}`} onClick={scanForDevices} disabled={isScanning}>
              {isScanning ? (
                <><span className="scan-spinner" /> Scanning...</>
              ) : (
                `🔍 Scan for ${linkMethod === 'wifi' ? 'Wi-Fi' : 'Bluetooth'} Devices`
              )}
            </button>

            {/* Discovered devices */}
            {scanResults.length > 0 && (
              <div className="discovered-devices-list">
                <h4>Discovered Devices ({scanResults.length})</h4>
                {scanResults.map((d, i) => (
                  <div key={d.address || i} className="discovered-device-item">
                    <div className="discovered-device-info">
                      <span className="discovered-device-icon">
                        {d.type === 'mobile' ? '📱' : d.type === 'desktop' ? '💻' : d.type === 'tv' ? '📺' : d.type === 'printer' ? '🖨️' : '📡'}
                      </span>
                      <div className="discovered-device-text">
                        <span className="discovered-device-name">{d.name}</span>
                        <span className="discovered-device-meta">
                          {d.address}{d.mac ? ` · ${d.mac}` : ''}{d.rssi != null ? ` · ${d.rssi} dBm` : ''} · {d.method === 'wifi' ? 'Wi-Fi' : 'BLE'}
                        </span>
                      </div>
                    </div>
                    <button className="discovered-device-pair" onClick={() => pairDiscoveredDevice(d)}>Pair</button>
                  </div>
                ))}
              </div>
            )}

            {scanResults.length === 0 && !isScanning && scanView === 'scan' && (
              <div className="scan-empty">No devices found. Ensure devices are powered on and nearby.</div>
            )}

            {linkStatus && <div className="link-status-msg">{linkStatus}</div>}

            {/* Manual pairing fallback */}
            <details className="manual-pair-section">
              <summary>Manual Pairing (Code)</summary>
              <div className="link-pair-row">
                <input
                  className="settings-input"
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                  placeholder="Enter pairing code"
                  maxLength={8}
                />
                <button onClick={generatePairingCode}>Generate Code</button>
                <button className="link-connect-btn" onClick={handleLinkDevice}>Connect</button>
              </div>
            </details>
          </article>

          {/* Paired / Linked devices list */}
          <article className="settings-card settings-card-wide">
            <h3>Paired Devices</h3>
            {linkedDevices.length === 0 ? (
              <p className="no-devices-msg">No devices paired yet. Use the scanner above or enter a pairing code.</p>
            ) : (
              <div className="linked-devices-list">
                {linkedDevices.map((d) => (
                  <div key={d.id} className="linked-device-item">
                    <div className="linked-device-info">
                      <span className="linked-device-icon">
                        {d.type === 'mobile' || d.method === 'bluetooth' ? '📱' : '💻'}
                      </span>
                      <div>
                        <span className="linked-device-name">{d.name}</span>
                        <span className="linked-device-meta">
                          {d.method === 'wifi' ? '📶 Wi-Fi' : d.method === 'bluetooth' ? '🔵 Bluetooth' : d.type || 'Device'} · {d.online ? '🟢 Online' : d.status || '⚪ Offline'}
                        </span>
                      </div>
                    </div>
                    <button className="linked-device-remove" onClick={() => removeLinkedDevice(d.id)}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>
      )}

      {/* ── AWS Credentials ─────────────────────────── */}
      {section === 'aws' && (
        <AWSCredentialsSection
          awsAccessKey={awsAccessKey} setAwsAccessKey={setAwsAccessKey}
          awsSecretKey={awsSecretKey} setAwsSecretKey={setAwsSecretKey}
          awsSessionToken={awsSessionToken} setAwsSessionToken={setAwsSessionToken}
          awsRegion={awsRegion} setAwsRegion={setAwsRegion}
          awsStatus={awsStatus} setAwsStatus={setAwsStatus}
          awsTesting={awsTesting} setAwsTesting={setAwsTesting}
          awsSaving={awsSaving} setAwsSaving={setAwsSaving}
          awsMessage={awsMessage} setAwsMessage={setAwsMessage}
          awsShowSecret={awsShowSecret} setAwsShowSecret={setAwsShowSecret}
        />
      )}

      {/* ── General Settings ────────────────────────── */}
      {section === 'general' && (
        <>
          <div className="settings-grid">
            <article className="settings-card">
              <h3>Voice Language</h3>
              <p>Select the language for voice input recognition.</p>

              <label>Language</label>
              <select
                className="settings-select"
                value={voiceLang}
                onChange={(e) => setVoiceLang?.(e.target.value)}
              >
                {WORLD_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.name} ({l.code})</option>
                ))}
              </select>
            </article>

            <article className="settings-card">
              <h3>AI Engine</h3>
              <p>The AI models powering this assistant.</p>

              <div className="nova-badge glass-card">
                <span className="nova-badge-icon">🧠</span>
                <div className="nova-badge-info">
                  <span className="nova-badge-name">Amazon Nova 2</span>
                  <span className="nova-badge-models">Lite · Sonic · Omni · Act</span>
                </div>
              </div>
            </article>

            <article className="settings-card settings-card-wide">
              <h3>Permission Center</h3>
              <p>Use toggles to review and request permission access.</p>

              {permStatus && (
                <ul className="permission-toggle-list">
                  {[
                    {
                      key: 'camera',
                      label: 'Camera',
                      description: 'Required for live gesture and sign tracking.',
                      state: permStatus.camera,
                    },
                    {
                      key: 'microphone',
                      label: 'Microphone',
                      description: 'Required for voice command capture.',
                      state: permStatus.microphone,
                    },
                    {
                      key: 'automation',
                      label: 'Automation Bridge',
                      description: 'Desktop/mobile automation control access.',
                      state: 'prompt',
                    }
                  ].map((item) => {
                    const isGranted = item.state === 'granted'
                    const isDenied = item.state === 'denied'
                    return (
                      <li key={item.key} className="permission-toggle-item">
                        <div>
                          <div className="permission-toggle-title">{item.label}</div>
                          <div className="permission-toggle-desc">{item.description}</div>
                          {isDenied && <div className="permission-denied-hint">Blocked — change in browser site settings</div>}
                        </div>
                        <label className="permission-switch">
                          <input
                            type="checkbox"
                            checked={isGranted}
                            disabled={isDenied}
                            onChange={(event) => handlePermissionToggle(item.key, event.target.checked)}
                          />
                          <span className="permission-slider" />
                          <span className={`permission-state ${isGranted ? 'on' : 'off'}`}>
                            {isGranted ? 'ON' : isDenied ? 'BLOCKED' : 'OFF'}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}

              <div className="settings-button-row">
                <button onClick={refreshPermissions}>Refresh Permissions</button>
              </div>
            </article>
          </div>

          <div className="settings-footer">
            <button onClick={save} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
            {status && <span className={`settings-status ${statusTone}`}>{status}</span>}
          </div>
        </>
      )}
    </section>
  )
}


/* ── AWS Credentials Section (extracted for clarity) ────────── */

const AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-central-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'ap-south-1',
  'ca-central-1', 'sa-east-1',
]

function AWSCredentialsSection({
  awsAccessKey, setAwsAccessKey,
  awsSecretKey, setAwsSecretKey,
  awsSessionToken, setAwsSessionToken,
  awsRegion, setAwsRegion,
  awsStatus, setAwsStatus,
  awsTesting, setAwsTesting,
  awsSaving, setAwsSaving,
  awsMessage, setAwsMessage,
  awsShowSecret, setAwsShowSecret,
}) {
  const msgTone = awsMessage.startsWith('Error') || awsMessage.startsWith('Invalid') || awsMessage.startsWith('Connection') ? 'error' : 'ok'

  const fetchStatus = async () => {
    try {
      const res = await jsonFetch('/api/settings/aws/status')
      const data = await res.json()
      setAwsStatus(data)
      if (data.region) setAwsRegion(data.region)
    } catch { /* ignore */ }
  }

  useEffect(() => { fetchStatus() }, [])

  const testCredentials = async () => {
    if (!awsAccessKey.trim() || !awsSecretKey.trim()) {
      setAwsMessage('Error: Access Key and Secret Key are required.')
      return
    }
    setAwsTesting(true)
    setAwsMessage('')
    try {
      const res = await jsonFetch('/api/settings/aws/test', {
        method: 'POST',
        body: JSON.stringify({
          aws_access_key_id: awsAccessKey,
          aws_secret_access_key: awsSecretKey,
          aws_session_token: awsSessionToken,
          aws_region: awsRegion,
        }),
      })
      const data = await res.json()
      setAwsMessage(data.ok ? data.message : `Error: ${data.error}`)
    } catch (e) {
      setAwsMessage(`Connection failed: ${e.message}`)
    } finally {
      setAwsTesting(false)
    }
  }

  const saveCredentials = async () => {
    setAwsSaving(true)
    setAwsMessage('')
    try {
      const res = await jsonFetch('/api/settings/aws', {
        method: 'POST',
        body: JSON.stringify({
          aws_access_key_id: awsAccessKey,
          aws_secret_access_key: awsSecretKey,
          aws_session_token: awsSessionToken,
          aws_region: awsRegion,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setAwsMessage('Credentials saved. All engines reinitialized.')
        setAwsStatus(data)
        setAwsAccessKey('')
        setAwsSecretKey('')
        setAwsSessionToken('')
      } else {
        setAwsMessage(`Error: ${data.error || 'Save failed.'}`)
      }
    } catch (e) {
      setAwsMessage(`Error: ${e.message}`)
    } finally {
      setAwsSaving(false)
    }
  }

  const clearCredentials = async () => {
    setAwsSaving(true)
    setAwsMessage('')
    try {
      const res = await jsonFetch('/api/settings/aws/clear', { method: 'POST' })
      const data = await res.json()
      setAwsStatus(data)
      setAwsMessage('Credentials cleared. Using heuristic fallback.')
      setAwsAccessKey('')
      setAwsSecretKey('')
      setAwsSessionToken('')
    } catch (e) {
      setAwsMessage(`Error: ${e.message}`)
    } finally {
      setAwsSaving(false)
    }
  }

  const statusLabel = awsStatus?.status === 'configured' ? 'Connected' : awsStatus?.status === 'placeholder' ? 'Placeholder' : 'Not Configured'
  const statusClass = awsStatus?.status === 'configured' ? 'aws-connected' : 'aws-disconnected'

  return (
    <div className="aws-credentials-section">
      {/* Status banner */}
      <div className={`aws-status-banner ${statusClass}`}>
        <div className="aws-status-left">
          <span className="aws-status-dot" />
          <div>
            <div className="aws-status-label">{statusLabel}</div>
            {awsStatus?.status === 'configured' && (
              <div className="aws-status-detail">
                Key: {awsStatus.masked_access_key} &middot; Region: {awsStatus.region}
                {awsStatus.has_session_token && ' · Session Token'}
              </div>
            )}
            {awsStatus?.status !== 'configured' && (
              <div className="aws-status-detail">Running in heuristic/offline mode</div>
            )}
          </div>
        </div>
        {awsStatus?.status === 'configured' && (
          <button className="aws-clear-btn" onClick={clearCredentials} disabled={awsSaving}>
            Disconnect
          </button>
        )}
      </div>

      {/* Engine status grid */}
      {awsStatus?.engines && (
        <div className="aws-engines">
          <h4>Engine Status</h4>
          <div className="aws-engine-grid">
            {[
              { key: 'nova_agent', label: 'Nova Agent', icon: '🧠' },
              { key: 'nova_sonic', label: 'Nova Sonic', icon: '🔊' },
              { key: 'nova_act', label: 'Nova Act', icon: '🌐' },
              { key: 's3_storage', label: 'S3 Storage', icon: '☁️' },
            ].map(({ key, label, icon }) => (
              <div key={key} className={`aws-engine-card ${awsStatus.engines[key] ? 'active' : ''}`}>
                <span className="aws-engine-icon">{icon}</span>
                <span className="aws-engine-name">{label}</span>
                <span className={`aws-engine-dot ${awsStatus.engines[key] ? 'on' : 'off'}`} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Credential inputs */}
      <div className="aws-form">
        <h4>AWS Credentials</h4>
        <p className="aws-form-hint">Enter your AWS IAM credentials with Bedrock access. Saved to backend .env file.</p>

        <label>Access Key ID</label>
        <input
          type="text"
          className="aws-input"
          placeholder="AKIA..."
          value={awsAccessKey}
          onChange={(e) => setAwsAccessKey(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />

        <label>Secret Access Key</label>
        <div className="aws-secret-row">
          <input
            type={awsShowSecret ? 'text' : 'password'}
            className="aws-input"
            placeholder="Enter secret key"
            value={awsSecretKey}
            onChange={(e) => setAwsSecretKey(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            className="aws-toggle-vis"
            onClick={() => setAwsShowSecret(!awsShowSecret)}
            type="button"
          >
            {awsShowSecret ? '🙈' : '👁️'}
          </button>
        </div>

        <label>Session Token <span className="aws-optional">(optional)</span></label>
        <input
          type="text"
          className="aws-input"
          placeholder="Optional — for temporary credentials"
          value={awsSessionToken}
          onChange={(e) => setAwsSessionToken(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />

        <label>Region</label>
        <select className="aws-input" value={awsRegion} onChange={(e) => setAwsRegion(e.target.value)}>
          {AWS_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>

        {awsMessage && (
          <div className={`aws-message ${msgTone}`}>{awsMessage}</div>
        )}

        <div className="aws-actions">
          <button
            className="aws-test-btn"
            onClick={testCredentials}
            disabled={awsTesting || awsSaving}
          >
            {awsTesting ? 'Testing...' : '🔌 Test Connection'}
          </button>
          <button
            className="aws-save-btn"
            onClick={saveCredentials}
            disabled={awsSaving || awsTesting || (!awsAccessKey.trim() && !awsSecretKey.trim())}
          >
            {awsSaving ? 'Saving...' : '💾 Save & Connect'}
          </button>
        </div>
      </div>
    </div>
  )
}
