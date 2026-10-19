// In-memory fixed-window limiter. The service runs as one Railway instance.
const windows = new Map()

/** Counts one hit for key; false once more than `max` hits fall in the current window. */
export function hit(key, max, windowSec) {
  const now = Date.now()
  const slot = windows.get(key)
  if (!slot || slot.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowSec * 1000 })
    return true
  }
  slot.count += 1
  return slot.count <= max
}

setInterval(() => {
  const now = Date.now()
  for (const [key, slot] of windows) if (slot.resetAt <= now) windows.delete(key)
}, 60_000).unref()
