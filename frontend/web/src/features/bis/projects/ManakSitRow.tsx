import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { saveBisModulePayload } from './bisModuleDataApi'
import { parseCmpf311Payload } from './cmpf311Model'
import { ProductManualValue } from './ManakVarietiesTable'

const labelCls =
  'w-1/4 whitespace-nowrap border border-[#e7e0d4] bg-[#f7f3eb] px-3 py-1.5 text-left align-middle text-sm font-bold text-stone-800'
const valueCls = 'w-1/4 border border-[#e7e0d4] px-2 py-1 align-middle text-sm text-stone-700'

/**
 * "Select SIT" line of the Indian Standard panel.
 * Yes = BIS SIT: the Product Manual number comes from the IS Code master and stays editable.
 * No = Own SIT: a button opens the Acceptance of SIT form (AI extraction of Annexure C, SIT table and notes).
 * Both choices are stored in the Acceptance of SIT module (cmpf-311).
 */
export function ManakSitRow({
  projectId,
  isCodeId,
  masterManualNumber,
  payload,
  onChanged,
  onOpenOwnSit,
}: {
  projectId: string | null
  isCodeId: string | null
  masterManualNumber: string
  payload: Record<string, unknown> | null
  onChanged: () => void
  onOpenOwnSit: () => void
}) {
  const saved = parseCmpf311Payload(payload)
  const bisSit = saved.mode === 'bis-sit'
  const storedNumber = payload ? saved.productManualNumber : ''
  const [number, setNumber] = useState(storedNumber || masterManualNumber)
  useEffect(() => {
    setNumber(storedNumber || masterManualNumber)
  }, [storedNumber, masterManualNumber])

  const save = async (next: Partial<typeof saved>) => {
    if (!projectId) return
    try {
      await saveBisModulePayload(projectId, 'cmpf-311', { ...saved, ...next })
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the SIT selection.')
    }
  }

  const ownSummary = [
    saved.annexureSections.length ? `Annexure C: ${saved.annexureSections.length}` : '',
    saved.testRows.length ? `SIT table: ${saved.testRows.length}` : '',
    saved.notes.length ? `Notes: ${saved.notes.length}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <table className="-mt-px w-full table-fixed border-collapse">
      <tbody>
        <tr>
          <th scope="row" className={labelCls}>
            Select SIT:
          </th>
          <td className={valueCls}>
            <Select
              value={bisSit ? 'yes' : 'no'}
              disabled={!projectId}
              onValueChange={(v) => {
                const mode = v === 'yes' ? 'bis-sit' : 'on-sit'
                void save({ mode, productManualNumber: mode === 'bis-sit' ? number || masterManualNumber : saved.productManualNumber })
              }}
            >
              <SelectTrigger className="h-8 rounded-none border-stone-300 bg-white text-sm" aria-label="Select SIT">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes (BIS SIT)</SelectItem>
                <SelectItem value="no">No (Own SIT)</SelectItem>
              </SelectContent>
            </Select>
          </td>
          {bisSit ? (
            <>
              <th scope="row" className={labelCls}>
                Product Manual:
              </th>
              <td className={valueCls}>
                <div className="flex items-center gap-2">
                <Input
                  className="h-8 min-w-0 flex-1 rounded-none border-stone-300 bg-white text-sm"
                  aria-label="Product Manual number"
                  value={number}
                  disabled={!projectId}
                  onChange={(e) => setNumber(e.target.value)}
                  onBlur={() => {
                    if (number.trim() !== (storedNumber || masterManualNumber)) void save({ mode: 'bis-sit', productManualNumber: number.trim() })
                  }}
                />
                <ProductManualValue isCodeId={isCodeId} buttonOnly />
                </div>
              </td>
            </>
          ) : (
            <>
              <th scope="row" className={labelCls}>
                Own SIT:
              </th>
              <td className={valueCls}>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" className="h-8 rounded-none bg-amber-700 text-white hover:bg-amber-800" onClick={onOpenOwnSit}>
                    <Sparkles className="mr-1.5 h-4 w-4" aria-hidden /> View / Generate
                  </Button>
                  <span className="text-xs text-stone-600">{ownSummary || 'Not generated yet'}</span>
                </div>
              </td>
            </>
          )}
        </tr>
      </tbody>
    </table>
  )
}
