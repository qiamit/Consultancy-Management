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

/** Detect `!filter` at cursor (e.g. `!lims` or `!`). */
export function parseSkillTrigger(text: string, caret: number): SkillTriggerMatch | null {
  const before = text.slice(0, caret)
  const m = before.match(/!([^\s!]*)$/)
  if (!m) return null
  return {
    filter: m[1].toLowerCase(),
    start: before.length - m[0].length,
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
