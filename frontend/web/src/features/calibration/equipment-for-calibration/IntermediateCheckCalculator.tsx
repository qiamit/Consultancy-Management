import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { IntermediateCheckDraft } from './intermediateCheck'

type Props = {
  draft: IntermediateCheckDraft
  onDraftChange: (next: IntermediateCheckDraft) => void
  acceptanceCriteria?: string
  masterEquipment?: unknown[]
  message?: string | null
}

/** Lightweight calculator surface used inside Conduct Intermediate Check. */
export function IntermediateCheckCalculator({
  draft,
  onDraftChange,
  acceptanceCriteria,
  message,
}: Props) {
  const reading = draft.readings[0] ?? { std: '', obs: '' }

  return (
    <div className="space-y-3 border border-stone-400 bg-stone-50 p-3">
      {message ? (
        <p className="border border-amber-600 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">{message}</p>
      ) : null}
      {acceptanceCriteria ? (
        <p className="text-xs text-stone-600">Acceptance: {acceptanceCriteria}</p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
            Std
          </Label>
          <Input
            value={reading.std}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                readings: [{ ...reading, std: e.target.value }],
              })
            }
            className="h-10"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
            Obs
          </Label>
          <Input
            value={reading.obs}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                readings: [{ ...reading, obs: e.target.value }],
              })
            }
            className="h-10"
          />
        </div>
      </div>
      <p className="text-[11px] text-stone-500">
        Masters selected: {draft.masterIds.length}. Use setup dialogs for full tables.
      </p>
    </div>
  )
}