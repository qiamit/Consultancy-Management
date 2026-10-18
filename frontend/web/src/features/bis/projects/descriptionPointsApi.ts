import { fetchBisModulePayload, saveBisModulePayload } from './bisModuleDataApi'

/** Process Description points live in the Process Flow Chart payload, which the Process Description document prints from. */
const PAYLOAD_KIND = 'process-flow-chart'

/** Saved points, without blanks. */
export const cleanDescriptionPoints = (points: unknown): string[] =>
  Array.isArray(points) ? points.map((p) => String(p ?? '').trim()).filter(Boolean) : []

/** Rewrites the saved points (re-read first so other Process Flow Chart data is kept). */
export async function saveDescriptionPoints(projectId: string, mutate: (points: string[]) => string[]): Promise<void> {
  const current = (await fetchBisModulePayload(projectId, PAYLOAD_KIND)) ?? {}
  await saveBisModulePayload(projectId, PAYLOAD_KIND, {
    ...current,
    descriptionPoints: mutate(cleanDescriptionPoints(current.descriptionPoints)),
  })
}
