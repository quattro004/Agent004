/**
 * Mic availability detection service.
 * Probes navigator.mediaDevices.getUserMedia for audio access.
 * Catches NotAllowedError and NotFoundError gracefully.
 */

export async function probeMic(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return false;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop all tracks immediately — we only needed to check availability
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

/**
 * Reactive helper: returns whether mic is available as a simple check.
 */
export function isMicAvailable(): boolean {
  return !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Subscribe to devicechange events for dynamic mic availability updates.
 * Returns an unsubscribe function.
 */
export function onMicChange(callback: () => void): () => void {
  if (!navigator.mediaDevices) {
    return () => {};
  }
  navigator.mediaDevices.addEventListener('devicechange', callback);
  return () => {
    navigator.mediaDevices.removeEventListener('devicechange', callback);
  };
}
