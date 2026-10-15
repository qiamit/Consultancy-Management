export function normalizeIsUnitLabel(value: string): string {
  return value.trim().replace(/\bsquare\s+metres?\b/gi, 'Sq Meter')
}
