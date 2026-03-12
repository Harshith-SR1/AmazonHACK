import { Capacitor } from '@capacitor/core'

async function queryPermission(name) {
  if (!navigator.permissions?.query) {
    return 'unknown'
  }
  try {
    const status = await navigator.permissions.query({ name })
    return status.state
  } catch {
    return 'unknown'
  }
}

export async function getPermissionStatus() {
  const camera = await queryPermission('camera')
  const microphone = await queryPermission('microphone')
  return {
    platform: Capacitor.getPlatform(),
    isNative: Capacitor.isNativePlatform(),
    camera,
    microphone
  }
}

export async function requestBrowserMediaPermissions() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    stream.getTracks().forEach((t) => t.stop())
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export async function requestSinglePermission(permissionKey) {
  try {
    const constraints =
      permissionKey === 'camera'
        ? { video: true, audio: false }
        : permissionKey === 'microphone'
          ? { video: false, audio: true }
          : { video: true, audio: true }
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    stream.getTracks().forEach((t) => t.stop())
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
