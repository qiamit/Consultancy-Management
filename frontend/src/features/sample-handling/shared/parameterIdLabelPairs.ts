/**
 * test_parameter_summary and test_parameter_ids can drift into different orders
 * (clause sort vs alphabetical). Never pair labels[i] with ids[i] by index —
 * Mass/Marking are an exact reverse under those two sorts.
 */

export function uniqueParameterIds(
  ...sources: Array<ReadonlyArray<string | null | undefined> | null | undefined>
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const src of sources) {
    if (!src) continue
    for (const raw of src) {
      const id = String(raw ?? '').trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

/** Resolve display labels from master names keyed by test_parameter id. */
export function labelsForParameterIds(
  ids: ReadonlyArray<string>,
  nameById: ReadonlyMap<string, string>,
): string[] {
  return ids.map((id) => {
    const name = nameById.get(id)?.trim()
    return name || id
  })
}

export function summaryFromParameterIds(
  ids: ReadonlyArray<string>,
  nameById: ReadonlyMap<string, string>,
): string {
  return labelsForParameterIds(ids, nameById).join(', ')
}
