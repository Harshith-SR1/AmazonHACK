import { useEffect, useState } from 'react'
import { jsonFetch } from '../apiClient'

export default function DeviceControlScreen() {
  const [devices, setDevices] = useState([])
  const [health, setHealth] = useState(null)

  useEffect(() => {
    jsonFetch('/api/devices')
      .then((res) => res.json())
      .then(setDevices)
      .catch(console.error)
  }, [])

  return (
    <div>
      <h2>Device Control</h2>
      <p>Select connected execution devices.</p>
      <button
        onClick={async () => {
          const res = await jsonFetch('/api/mobile/health')
          const data = await res.json()
          setHealth(data)
        }}
      >
        Run Mobile Reliability Check
      </button>
      <ul>
        {devices.map((d) => (
          <li key={d.id}>
            {d.name} ({d.type}) - {d.online ? 'Online' : 'Offline'}
          </li>
        ))}
      </ul>
      {health && <pre>{JSON.stringify(health, null, 2)}</pre>}
    </div>
  )
}
