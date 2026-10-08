/** Market-standard scientific / chemical / math symbols for test parameters. */
export const SCIENTIFIC_SYMBOLS = [
  // Operators & comparison
  '±',
  '×',
  '÷',
  '≤',
  '≥',
  '≈',
  '≠',
  '≡',
  '∝',
  '∞',
  '√',
  '∛',
  '∜',
  // Greek (common in chemistry / physics)
  'α',
  'β',
  'γ',
  'δ',
  'ε',
  'θ',
  'λ',
  'μ',
  'µ',
  'π',
  'ρ',
  'σ',
  'τ',
  'φ',
  'χ',
  'ψ',
  'ω',
  'η',
  'ν',
  'ξ',
  'κ',
  'ι',
  'Σ',
  'Π',
  'Δ',
  'Ω',
  'Λ',
  'Φ',
  'Ψ',
  'Γ',
  'Θ',
  // Powers / indices
  '⁰',
  '¹',
  '²',
  '³',
  '⁴',
  '⁵',
  '⁶',
  '⁷',
  '⁸',
  '⁹',
  'ⁿ',
  '⁺',
  '⁻',
  '₀',
  '₁',
  '₂',
  '₃',
  '₄',
  '₅',
  '₆',
  '₇',
  '₈',
  '₉',
  '₊',
  '₋',
  // Calculus / misc science
  '∫',
  '∂',
  '∇',
  '∑',
  '∏',
  'Å',
  'Å',
  '°',
  '℃',
  '℉',
  '‰',
  '‱',
  'Ø',
  '⊕',
  '⊗',
] as const

export const OTHER_SYMBOLS = [
  '·',
  '•',
  '…',
  '–',
  '—',
  '′',
  '″',
  '†',
  '‡',
  '№',
  '§',
  '¶',
  '✓',
  '✗',
  '✔',
  '✘',
  '½',
  '¼',
  '¾',
  '⅓',
  '⅔',
  '«',
  '»',
  '‹',
  '›',
  '‘',
  '’',
  '\u201C',
  '\u201D',
  '„',
  '‚',
  '₹',
  '$',
  '€',
  '£',
  '¥',
  '¢',
  '¤',
  '→',
  '←',
  '↑',
  '↓',
  '⇒',
  '⇔',
  '↔',
  '↦',
  '∈',
  '∉',
  '⊂',
  '⊃',
  '⊆',
  '⊇',
  '™',
  '®',
  '©',
] as const

const RECENTS_KEY = 'testParameter.symbolRecents'

export function loadSymbolRecents(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function saveSymbolRecents(symbols: string[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(symbols.slice(0, 10)))
  } catch {
    // ignore quota / private mode
  }
}

export function pushSymbolRecent(symbol: string, prev: string[]): string[] {
  const updated = [symbol, ...prev.filter((s) => s !== symbol)].slice(0, 10)
  saveSymbolRecents(updated)
  return updated
}

export function insertAtCaret(value: string, symbol: string, start: number, end: number): {
  next: string
  caret: number
} {
  const safeStart = Math.max(0, Math.min(start, value.length))
  const safeEnd = Math.max(safeStart, Math.min(end, value.length))
  return {
    next: value.slice(0, safeStart) + symbol + value.slice(safeEnd),
    caret: safeStart + symbol.length,
  }
}

export type SymbolTargetField = 'itemName' | 'unitValue' | 'specificRequirement'
export type SymbolTargetScope = 'inline' | 'edit'

export type SymbolCaretTarget = {
  field: SymbolTargetField
  scope: SymbolTargetScope
  start: number
  end: number
}
