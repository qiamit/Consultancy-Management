/**
 * App-wide visual theme (Lab Settings → Theme), including user custom themes.
 *
 * Since 24 Nov 2026 the default look is iPhone (iOS): `light` = iOS Light, `dark` = iOS Dark, `system` = iOS
 * Automatic (follows the phone / Mac setting, the default for every device). The former warm stone + amber look
 * is kept as `amber` (Classic Amber) and `amber-night` (Amber Night).
 */

export const APP_THEME_STORAGE_KEY = 'consultancy.appTheme'
export const CUSTOM_THEMES_STORAGE_KEY = 'consultancy.customThemes'
/** Set once a device has been moved to the iOS default (see migrateToIosDefault). */
export const IOS_DEFAULT_STORAGE_KEY = 'consultancy.appTheme.iosDefault'

export const DEFAULT_APP_THEME = 'system'

export const BUILTIN_THEME_IDS = [
  'light',
  'dark',
  'system',
  'amber',
  'amber-night',
  'ocean',
  'forest',
  'steel',
  'copper',
  'teal',
  'rose',
] as const

export type BuiltinThemeId = (typeof BUILTIN_THEME_IDS)[number]

/** Builtin id, or `custom_<slug>` for user themes. */
export type AppThemeId = BuiltinThemeId | (string & {})

export type ResolvedAppThemeId = Exclude<AppThemeId, 'system'>

export type CustomThemeMode = 'light' | 'dark'

export type CustomThemeDef = {
  id: string
  name: string
  accent: string
  mode: CustomThemeMode
}

export const APP_THEME_OPTIONS: Array<{ value: BuiltinThemeId; label: string }> = [
  { value: 'system', label: 'iOS (Automatic)' },
  { value: 'light', label: 'iOS Light' },
  { value: 'dark', label: 'iOS Dark' },
  { value: 'amber', label: 'Classic Amber' },
  { value: 'amber-night', label: 'Amber Night' },
  { value: 'ocean', label: 'Ocean Blue' },
  { value: 'forest', label: 'Forest Green' },
  { value: 'steel', label: 'Slate Steel' },
  { value: 'copper', label: 'Copper Bronze' },
  { value: 'teal', label: 'Industrial Teal' },
  { value: 'rose', label: 'Soft Rose' },
]

const BUILTIN_SET = new Set<string>(BUILTIN_THEME_IDS)

export function isBuiltinThemeId(value: string): value is BuiltinThemeId {
  return BUILTIN_SET.has(value)
}

/** The iPhone look: iOS Light / iOS Dark (and Automatic, which resolves to one of them). */
export function isIosResolvedTheme(resolved: string): boolean {
  return resolved === 'light' || resolved === 'dark'
}

export function isCustomThemeId(value: string): boolean {
  return value.startsWith('custom_')
}

export function isAppThemeId(value: string): boolean {
  return isBuiltinThemeId(value) || isCustomThemeId(value)
}

export function slugifyThemeName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)
  return slug || `theme_${Date.now().toString(36)}`
}

export function makeCustomThemeId(name: string): string {
  return `custom_${slugifyThemeName(name)}_${Math.random().toString(36).slice(2, 7)}`
}

export function normalizeHexColor(value: string, fallback = '#0d9488'): string {
  const raw = String(value ?? '').trim()
  const short = /^#([0-9a-f]{3})$/i.exec(raw)
  if (short) {
    const [r, g, b] = short[1]!.split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  const full = /^#([0-9a-f]{6})$/i.exec(raw)
  if (full) return `#${full[1]!}`.toLowerCase()
  return fallback
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeHexColor(hex)
  const m = /^#([0-9a-f]{6})$/i.exec(n)
  if (!m) return null
  const v = parseInt(m[1]!, 16)
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 }
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return { h: h * 360, s: s * 100, l: l * 100 }
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hn = ((h % 360) + 360) % 360 / 360
  const sn = Math.min(100, Math.max(0, s)) / 100
  const ln = Math.min(100, Math.max(0, l)) / 100
  if (sn === 0) {
    const v = Math.round(ln * 255)
    return { r: v, g: v, b: v }
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn
  const p = 2 * ln - q
  const hue2rgb = (t: number) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  return {
    r: Math.round(hue2rgb(hn + 1 / 3) * 255),
    g: Math.round(hue2rgb(hn) * 255),
    b: Math.round(hue2rgb(hn - 1 / 3) * 255),
  }
}

function rgbChannels(r: number, g: number, b: number): string {
  return `${r} ${g} ${b}`
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

/** Build stone + amber CSS variable map from an accent color. */
export function buildCustomThemeCssVars(
  accentHex: string,
  mode: CustomThemeMode,
): Record<string, string> {
  const rgb = hexToRgb(accentHex) ?? { r: 13, g: 148, b: 136 }
  const { h, s } = rgbToHsl(rgb.r, rgb.g, rgb.b)
  const sat = clamp(s, 35, 85)

  const amber = (lightness: number, satMul = 1) => {
    const c = hslToRgb(h, clamp(sat * satMul, 20, 90), lightness)
    return rgbChannels(c.r, c.g, c.b)
  }

  const stoneLight = {
    50: '250 250 249',
    100: '245 245 244',
    200: '231 229 228',
    300: '214 211 209',
    400: '168 162 158',
    500: '120 113 108',
    600: '87 83 78',
    700: '68 64 60',
    800: '41 37 36',
    900: '28 25 23',
    950: '12 10 9',
  }

  const stoneDark = {
    50: '45 41 38',
    100: '55 49 45',
    200: '72 64 58',
    300: '90 82 76',
    400: '130 120 112',
    500: '168 158 150',
    600: '196 186 176',
    700: '220 212 204',
    800: '22 19 17',
    900: '14 12 11',
    950: '8 7 6',
  }

  const stone = mode === 'dark' ? stoneDark : stoneLight
  const paperRgb = mode === 'dark' ? hslToRgb(h, 8, 14) : hslToRgb(h, 12, 96)
  const paperBorderRgb = mode === 'dark' ? hslToRgb(h, 8, 28) : hslToRgb(h, 10, 88)

  return {
    '--color-stone-50': stone[50],
    '--color-stone-100': stone[100],
    '--color-stone-200': stone[200],
    '--color-stone-300': stone[300],
    '--color-stone-400': stone[400],
    '--color-stone-500': stone[500],
    '--color-stone-600': stone[600],
    '--color-stone-700': stone[700],
    '--color-stone-800': stone[800],
    '--color-stone-900': stone[900],
    '--color-stone-950': stone[950],
    '--color-amber-50': mode === 'dark' ? amber(92, 0.35) : amber(96, 0.45),
    '--color-amber-100': mode === 'dark' ? amber(85, 0.45) : amber(90, 0.55),
    '--color-amber-200': amber(78, 0.75),
    '--color-amber-300': amber(68, 0.85),
    '--color-amber-400': amber(58, 0.95),
    '--color-amber-500': amber(48),
    '--color-amber-600': amber(40),
    '--color-amber-700': amber(32),
    '--color-amber-800': amber(26),
    '--color-amber-900': amber(20),
    '--color-amber-950': amber(12),
    '--lims-paper': rgbChannels(paperRgb.r, paperRgb.g, paperRgb.b),
    '--lims-paper-border': rgbChannels(paperBorderRgb.r, paperBorderRgb.g, paperBorderRgb.b),
    '--background': mode === 'dark' ? `${h.toFixed(0)} 12% 9%` : `${h.toFixed(0)} 20% 97%`,
    '--foreground': mode === 'dark' ? `${h.toFixed(0)} 10% 94%` : `${h.toFixed(0)} 20% 12%`,
    '--card': mode === 'dark' ? `${h.toFixed(0)} 12% 12%` : `${h.toFixed(0)} 30% 99%`,
    '--card-foreground': mode === 'dark' ? `${h.toFixed(0)} 10% 94%` : `${h.toFixed(0)} 20% 12%`,
    '--popover': mode === 'dark' ? `${h.toFixed(0)} 12% 12%` : `0 0% 100%`,
    '--popover-foreground': mode === 'dark' ? `${h.toFixed(0)} 10% 94%` : `${h.toFixed(0)} 20% 12%`,
    '--primary': `${h.toFixed(0)} ${sat.toFixed(0)}% ${mode === 'dark' ? 48 : 36}%`,
    '--primary-foreground': mode === 'dark' ? `${h.toFixed(0)} 12% 8%` : `0 0% 100%`,
    '--ring': `${h.toFixed(0)} ${sat.toFixed(0)}% 45%`,
    '--sidebar': mode === 'dark' ? `${h.toFixed(0)} 14% 7%` : `${h.toFixed(0)} 20% 12%`,
    '--sidebar-foreground': `${h.toFixed(0)} 15% 92%`,
    '--sidebar-accent': `${h.toFixed(0)} ${sat.toFixed(0)}% 44%`,
    '--sidebar-accent-foreground': `0 0% 100%`,
    '--sidebar-border': mode === 'dark' ? `${h.toFixed(0)} 10% 18%` : `${h.toFixed(0)} 10% 22%`,
    '--sidebar-muted': mode === 'dark' ? `${h.toFixed(0)} 10% 12%` : `${h.toFixed(0)} 10% 16%`,
    '--sidebar-ring': `${h.toFixed(0)} ${sat.toFixed(0)}% 44%`,
    '--border': mode === 'dark' ? `${h.toFixed(0)} 10% 28%` : `${h.toFixed(0)} 10% 75%`,
    '--input': mode === 'dark' ? `${h.toFixed(0)} 10% 28%` : `${h.toFixed(0)} 10% 72%`,
  }
}

const CUSTOM_STYLE_ID = 'consultancy-custom-theme-vars'

export function clearCustomThemeCssVars() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const style = document.getElementById(CUSTOM_STYLE_ID)
  if (style) style.remove()
  // Remove previously set inline vars that might linger
  ;[
    ...Object.keys(buildCustomThemeCssVars('#0d9488', 'light')),
  ].forEach((key) => {
    root.style.removeProperty(key)
  })
}

export function applyCustomThemeCssVars(def: CustomThemeDef) {
  if (typeof document === 'undefined') return
  const vars = buildCustomThemeCssVars(def.accent, def.mode)
  let style = document.getElementById(CUSTOM_STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = CUSTOM_STYLE_ID
    document.head.appendChild(style)
  }
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}: ${v};`)
    .join('\n  ')
  style.textContent = `[data-app-theme='custom'] {\n  color-scheme: ${def.mode};\n  ${body}\n}`
}

export function readCustomThemes(): CustomThemeDef[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map(parseCustomThemeDef).filter((x): x is CustomThemeDef => Boolean(x))
  } catch {
    return []
  }
}

/** A custom theme definition from storage or the database, or null when it is not one. */
export function parseCustomThemeDef(item: unknown): CustomThemeDef | null {
  if (!item || typeof item !== 'object') return null
  const row = item as Record<string, unknown>
  const id = String(row.id ?? '')
  const name = String(row.name ?? '').trim()
  if (!isCustomThemeId(id) || !name) return null
  return {
    id,
    name,
    accent: normalizeHexColor(String(row.accent ?? '#0d9488')),
    mode: row.mode === 'dark' ? 'dark' : 'light',
  }
}

export function persistCustomThemes(themes: CustomThemeDef[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(themes))
  } catch {
    /* ignore */
  }
}

export function upsertCustomTheme(def: CustomThemeDef, list = readCustomThemes()): CustomThemeDef[] {
  const next = [...list]
  const idx = next.findIndex((t) => t.id === def.id)
  if (idx >= 0) next[idx] = def
  else next.push(def)
  persistCustomThemes(next)
  return next
}

export function deleteCustomTheme(id: string, list = readCustomThemes()): CustomThemeDef[] {
  const next = list.filter((t) => t.id !== id)
  persistCustomThemes(next)
  return next
}

export function findCustomTheme(id: string, list = readCustomThemes()): CustomThemeDef | undefined {
  return list.find((t) => t.id === id)
}

export function normalizeAppThemeId(value: string | null | undefined): AppThemeId {
  const raw = String(value ?? '').trim().toLowerCase()
  if (isBuiltinThemeId(raw)) return raw
  if (isCustomThemeId(raw) && findCustomTheme(raw)) return raw
  return DEFAULT_APP_THEME
}

export function resolveAppThemeId(
  preference: AppThemeId,
  prefersDark = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false,
): ResolvedAppThemeId {
  if (preference === 'system') return prefersDark ? 'dark' : 'light'
  return preference
}

export function isDarkResolvedTheme(resolved: ResolvedAppThemeId, customs = readCustomThemes()): boolean {
  if (resolved === 'dark' || resolved === 'amber-night') return true
  if (isCustomThemeId(String(resolved))) {
    return findCustomTheme(String(resolved), customs)?.mode === 'dark'
  }
  return false
}

/**
 * One-time move of a device to the iOS default (24 Nov 2026): a device still on the old default (`light`, which was
 * Classic Amber) goes to iOS Automatic. Any other choice (iOS Dark, Ocean Blue, a custom theme …) is kept.
 * index.html does the same before React mounts.
 */
export function migrateToIosDefault() {
  if (typeof window === 'undefined') return
  try {
    if (window.localStorage.getItem(IOS_DEFAULT_STORAGE_KEY)) return
    const stored = window.localStorage.getItem(APP_THEME_STORAGE_KEY)
    if (!stored || stored === 'light') window.localStorage.setItem(APP_THEME_STORAGE_KEY, DEFAULT_APP_THEME)
    window.localStorage.setItem(IOS_DEFAULT_STORAGE_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function readStoredAppTheme(): AppThemeId {
  if (typeof window === 'undefined') return DEFAULT_APP_THEME
  try {
    migrateToIosDefault()
    return normalizeAppThemeId(window.localStorage.getItem(APP_THEME_STORAGE_KEY))
  } catch {
    return DEFAULT_APP_THEME
  }
}

/** Browser / PWA bar colour per theme (iOS: the grouped background, so the status bar blends in). */
const THEME_COLOR: Record<string, string> = {
  light: '#f2f2f7',
  dark: '#000000',
  amber: '#0c416a',
  'amber-night': '#0c0a09',
}

function applyThemeColorMeta(resolved: string) {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR[resolved] ?? '#0c416a')
}

export function persistAppTheme(theme: AppThemeId) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
}

/** Apply theme attributes on <html>. Safe to call before React mounts. */
export function applyAppTheme(preference: AppThemeId, customs = readCustomThemes()) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const resolved = resolveAppThemeId(preference)

  if (isCustomThemeId(String(resolved))) {
    const def = findCustomTheme(String(resolved), customs)
    if (def) {
      root.setAttribute('data-app-theme-pref', preference)
      root.setAttribute('data-app-theme', 'custom')
      root.setAttribute('data-custom-theme-id', def.id)
      root.classList.toggle('dark', def.mode === 'dark')
      root.removeAttribute('data-ui')
      applyThemeColorMeta('custom')
      applyCustomThemeCssVars(def)
      persistAppTheme(preference)
      return
    }
  }

  clearCustomThemeCssVars()
  root.removeAttribute('data-custom-theme-id')
  root.setAttribute('data-app-theme-pref', preference)
  root.setAttribute('data-app-theme', String(resolved))
  root.classList.toggle('dark', isDarkResolvedTheme(resolved, customs))
  if (isIosResolvedTheme(String(resolved))) root.setAttribute('data-ui', 'ios')
  else root.removeAttribute('data-ui')
  applyThemeColorMeta(String(resolved))
  persistAppTheme(preference)
}

export function getThemeSelectOptions(
  customs = readCustomThemes(),
): Array<{ value: string; label: string }> {
  return [
    ...APP_THEME_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    ...customs.map((c) => ({
      value: c.id,
      label: `${c.name} (Custom)`,
    })),
  ]
}
