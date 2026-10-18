export type UndertakingLine = {
  id: string
  text: string | null
  templateIndex?: number
  source: string
  clause: string
  agreementRequired: boolean
}

export function parseUndertakingLines(value: unknown): UndertakingLine[] | null {
  if (!Array.isArray(value)) return null
  return value.filter((item) => item && typeof item === 'object').map((item, index) => {
    const row = item as Record<string, unknown>
    return {
      id: typeof row.id === 'string' && row.id ? row.id : `line-${index}`,
      text: row.text === null ? null : String(row.text ?? ''),
      ...(Number.isInteger(row.templateIndex) && Number(row.templateIndex) >= 0 ? { templateIndex: Number(row.templateIndex) } : {}),
      source: String(row.source ?? ''), clause: String(row.clause ?? ''),
      agreementRequired: row.agreementRequired === true,
    }
  })
}

export function resolvedUndertakingLine(line: UndertakingLine, defaults: string[]): string {
  return line.text === null && line.templateIndex != null ? defaults[line.templateIndex] ?? '' : line.text ?? ''
}

export function defaultUndertakingLines(defaults: string[]): UndertakingLine[] {
  return defaults.map((_, index) => ({ id: `template-${index}`, templateIndex: index, text: null, source: '', clause: '', agreementRequired: false }))
}
