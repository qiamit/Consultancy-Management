/** Legal / filler tokens ignored when building initials from laboratory name */
const INITIALS_STOP = new Set([
  'pvt',
  'ltd',
  'llp',
  'inc',
  'llc',
  'and',
  'the',
  'of',
  'for',
  'private',
  'limited',
  'company',
  'co',
])

/**
 * Initials from "Name of the Laboratory" field value.
 * e.g. "Qirlpl LIMS Lab" → "QLL"
 */
export function getCompanyInitials(name: string, fallback = 'QI'): string {
  const raw = name.trim()
  if (!raw) return fallback

  const words = raw
    .split(/[\s,/&.\-]+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter((w) => {
      const n = w.toLowerCase()
      return n.length > 0 && !INITIALS_STOP.has(n)
    })

  if (words.length === 0) return fallback

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase() || fallback
  }

  return words
    .slice(0, 3)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
}

/** Sidebar title — laboratory name as entered (truncated) */
export function getBrandShortName(name: string, fallback = 'QIRLPL'): string {
  const raw = name.trim()
  if (!raw) return fallback
  return raw.slice(0, 28)
}

export const LAB_NAME_STORAGE_KEY = 'labSettings.labName'
export const LAB_NAME_CHANGED_EVENT = 'qirlpl:lab-name-changed'

export function persistLabNameLocal(name: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LAB_NAME_STORAGE_KEY, name)
  window.dispatchEvent(new CustomEvent(LAB_NAME_CHANGED_EVENT, { detail: name }))
}
