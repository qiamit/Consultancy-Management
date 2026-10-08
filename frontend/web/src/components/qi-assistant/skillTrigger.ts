export type AiSkillPick = {
  id: string
  name: string
  description: string | null
  trigger_keywords: string[] | null
  sort_order: number
}

export type SkillTriggerMatch = {
  filter: string
  start: number
  end: number
}

/**
 * Detect `/filter` at cursor (slash-command style), e.g. `/lims` or `/`.
 * Also accepts legacy `!filter`. Ignores `http://` / `https://`.
 */
export function parseSkillTrigger(text: string, caret: number): SkillTriggerMatch | null {
  const before = text.slice(0, caret)
  const slash = before.match(/(?:^|[\s])(\/([^\s/]*))$/)
  if (slash) {
    const token = slash[1]!
    return {
      filter: (slash[2] ?? '').toLowerCase(),
      start: before.length - token.length,
      end: caret,
    }
  }
  const bang = before.match(/(!([^\s!]*))$/)
  if (!bang) return null
  return {
    filter: (bang[2] ?? '').toLowerCase(),
    start: before.length - bang[1]!.length,
    end: caret,
  }
}

/** Detect `@filter` at cursor for file attach, e.g. `@` or `@pdf`. */
export function parseAttachTrigger(text: string, caret: number): SkillTriggerMatch | null {
  const before = text.slice(0, caret)
  const m = before.match(/(?:^|[\s])(@([^\s@]*))$/)
  if (!m) return null
  return {
    filter: (m[2] ?? '').toLowerCase(),
    start: before.length - m[1]!.length,
    end: caret,
  }
}

export function filterSkillsForTrigger(skills: AiSkillPick[], filter: string): AiSkillPick[] {
  const q = filter.trim().toLowerCase()
  if (!q) return skills
  return skills.filter((s) => {
    const name = s.name.toLowerCase()
    const desc = (s.description ?? '').toLowerCase()
    const keys = (s.trigger_keywords ?? []).join(' ').toLowerCase()
    return name.includes(q) || desc.includes(q) || keys.includes(q)
  })
}
