/**
 * Mobile utilities for Capacitor native integration.
 * Handles permissions, platform detection, haptic feedback, and deep links.
 */

/** Check if running inside a Capacitor native app */
export function isNativePlatform() {
  return typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()
}

/** Get current platform: 'android' | 'ios' | 'web' */
export function getPlatform() {
  if (!window.Capacitor) return 'web'
  return window.Capacitor.getPlatform?.() || 'web'
}

/** Request camera permission (Capacitor or browser) */
export async function requestCameraPermission() {
  if (isNativePlatform()) {
    try {
      // Capacitor Camera plugin handles permissions automatically
      // but we can prompt the user via getUserMedia as fallback
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      stream.getTracks().forEach((t) => t.stop())
      return true
    } catch {
      return false
    }
  }
  // Web: just try getUserMedia
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true })
    stream.getTracks().forEach((t) => t.stop())
    return true
  } catch {
    return false
  }
}

/** Request microphone permission */
export async function requestMicPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((t) => t.stop())
    return true
  } catch {
    return false
  }
}

/** Trigger haptic feedback (for Morse code key press, etc.) */
export async function hapticFeedback(style = 'medium') {
  if (isNativePlatform()) {
    try {
      const { Haptics } = await import('@capacitor/haptics')
      if (style === 'light') await Haptics.impact({ style: 'Light' })
      else if (style === 'heavy') await Haptics.impact({ style: 'Heavy' })
      else await Haptics.impact({ style: 'Medium' })
    } catch {
      // Haptics plugin not installed, use vibrate API as fallback
      navigator.vibrate?.(style === 'light' ? 20 : style === 'heavy' ? 80 : 40)
    }
  } else {
    navigator.vibrate?.(style === 'light' ? 20 : style === 'heavy' ? 80 : 40)
  }
}

/** Handle Android back button */
export function setupBackButton(callback) {
  if (!isNativePlatform()) return () => {}
  
  const handler = () => {
    if (callback) callback()
  }

  document.addEventListener('backbutton', handler)
  return () => document.removeEventListener('backbutton', handler)
}

/**
 * Keep screen awake during active sessions (camera/voice).
 * Falls back to a no-op if KeepAwake plugin isn't installed.
 */
export async function keepScreenAwake(awake = true) {
  if (!isNativePlatform()) return
  try {
    const { KeepAwake } = await import('@capacitor/keep-awake')
    if (awake) await KeepAwake.keepAwake()
    else await KeepAwake.allowSleep()
  } catch {
    // Plugin not installed — no-op
  }
}

/** Open a URL in the device's default browser */
export async function openExternalUrl(url) {
  if (isNativePlatform()) {
    try {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url })
      return
    } catch { /* fallback below */ }
  }
  window.open(url, '_blank', 'noopener')
}

/** Safe area insets for notch/island devices */
export function getSafeAreaInsets() {
  const style = getComputedStyle(document.documentElement)
  return {
    top: parseInt(style.getPropertyValue('env(safe-area-inset-top)') || '0', 10),
    bottom: parseInt(style.getPropertyValue('env(safe-area-inset-bottom)') || '0', 10),
    left: parseInt(style.getPropertyValue('env(safe-area-inset-left)') || '0', 10),
    right: parseInt(style.getPropertyValue('env(safe-area-inset-right)') || '0', 10),
  }
}
