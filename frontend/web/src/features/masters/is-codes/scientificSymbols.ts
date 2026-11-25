/** Scientific symbols a requirement or test name may need (owner, 25 Nov 2026: "symbols insert ka button"). */
export const SYMBOL_GROUPS: Array<{ label: string; symbols: string[] }> = [
  { label: 'Maths', symbols: ['±', '×', '÷', '−', '√', '∛', '∑', '∞', '≈', '≠', '≡', '∝', 'π', '∠', '⊥', '∥', '·'] },
  { label: 'Comparison', symbols: ['≤', '≥', '<', '>', '≪', '≫'] },
  { label: 'Units', symbols: ['°', '℃', '℉', 'µ', 'Ω', 'Å', '%', '‰', '′', '″'] },
  { label: 'Superscript', symbols: ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹', '⁺', '⁻', 'ⁿ'] },
  { label: 'Subscript', symbols: ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉', '₊', '₋'] },
  {
    label: 'Greek',
    symbols: ['α', 'β', 'γ', 'δ', 'ε', 'η', 'θ', 'κ', 'λ', 'µ', 'ν', 'ρ', 'σ', 'τ', 'φ', 'χ', 'ψ', 'ω', 'Δ', 'Σ', 'Φ', 'Ω'],
  },
  { label: 'Fractions and Arrows', symbols: ['½', '⅓', '⅔', '¼', '¾', '→', '←', '↑', '↓', '↔', '•'] },
]

/**
 * Puts `text` into an input at its cursor (replacing a selection) the way typing would, so React's onChange runs and
 * the cursor lands after the inserted text.
 */
export function insertIntoInput(el: HTMLInputElement, text: string) {
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? start
  const next = el.value.slice(0, start) + text + el.value.slice(end)
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, next)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.focus()
  const caret = start + text.length
  requestAnimationFrame(() => el.setSelectionRange(caret, caret))
}
