function resolveApiBase() {
  const envBase = import.meta.env.VITE_API_BASE
  if (envBase && typeof envBase === 'string' && envBase.trim()) {
    return envBase.replace(/\/$/, '')
  }

  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
    return `${protocol}//${host}:8001`
  }

  return 'http://localhost:8001'
}

export const API_BASE = resolveApiBase()

export function getApiHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': localStorage.getItem('unison_api_key') || 'dev-key',
    'x-user-id': localStorage.getItem('unison_user_id') || 'demo-user',
  }
}

/* ── Offline cache & command queue ────────────────────────────── */
const CACHE_KEY = 'unison_offline_cache'
const QUEUE_KEY = 'unison_offline_queue'

function getCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}

function setCache(key, data) {
  const cache = getCache()
  cache[key] = { data, ts: Date.now() }
  // keep cache under 50 entries
  const keys = Object.keys(cache)
  if (keys.length > 50) {
    keys.sort((a, b) => cache[a].ts - cache[b].ts)
    keys.slice(0, keys.length - 50).forEach(k => delete cache[k])
  }
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
}

export function getOfflineQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] }
}

function pushToQueue(path, options) {
  const queue = getOfflineQueue()
  queue.push({ path, options, ts: Date.now() })
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

function clearQueue() {
  localStorage.removeItem(QUEUE_KEY)
}

export function isOnline() {
  return navigator.onLine !== false
}

export async function flushOfflineQueue() {
  if (!isOnline()) return
  const queue = getOfflineQueue()
  if (!queue.length) return
  clearQueue()
  for (const item of queue) {
    try {
      const headers = { ...getApiHeaders(), ...(item.options?.headers || {}) }
      await fetch(`${API_BASE}${item.path}`, { ...item.options, headers })
    } catch { /* best-effort */ }
  }
}

// Auto-flush when coming back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flushOfflineQueue())
}

export function jsonFetch(path, options = {}) {
  const headers = { ...getApiHeaders(), ...(options.headers || {}) }
  const method = (options.method || 'GET').toUpperCase()
  const isGet = method === 'GET'

  if (!isOnline()) {
    // For non-GET, queue the request for later
    if (!isGet) {
      pushToQueue(path, options)
      return Promise.resolve(new Response(JSON.stringify({ queued: true, offline: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }))
    }
    // For GET, serve from cache if available
    const cached = getCache()[path]
    if (cached) {
      return Promise.resolve(new Response(JSON.stringify(cached.data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }))
    }
    return Promise.reject(new Error('Offline and no cached data available'))
  }

  const req = fetch(`${API_BASE}${path}`, { ...options, headers })

  // Cache successful GET responses
  if (isGet) {
    return req.then(async (res) => {
      if (res.ok) {
        const clone = res.clone()
        try {
          const data = await clone.json()
          setCache(path, data)
        } catch { /* not JSON, skip cache */ }
      }
      return res
    })
  }

  return req
}
