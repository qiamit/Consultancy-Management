import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { emptyIsCodeForm, type IsCodeForm } from '@/features/masters/is-codes/types'
import { IsCodesForm } from '@/features/masters/is-codes/IsCodesForm'
import {
  limsDarkBarGlowStyle,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

function parseIsCodeLabelInput(label: string): Partial<IsCodeForm> {
  const raw = label.trim()
  if (!raw) return {}
  if (raw.includes(':')) {
    const [numberPart, rest] = raw.split(':')
    return {
      isNumber: numberPart.trim(),
      revisionYear: (rest ?? '').trim().replace(/[^0-9]/g, '').slice(0, 4),
    }
  }
  return { isNumber: raw }
}

/** Client Master–style shell: dark header, stone body, centered in main area (excl. sidebar). */
const addIsCodeOverlayClass = 'lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto'

const addIsCodeDialogClass = cn(
  'max-h-[92vh] w-[calc(100vw-1rem)] max-w-3xl gap-0 overflow-hidden rounded-none border-4 border-stone-700 bg-white p-0 shadow-2xl ring-2 ring-amber-700/40 sm:w-full sm:rounded-none',
  '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
  'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 lg:w-[min(48rem,calc(100vw-268px-2rem))] lg:max-w-[min(48rem,calc(100vw-268px-2rem))] md:!-translate-x-1/2 md:!-translate-y-1/2',
)

export function AddIsCodeDialog({
  open,
  onOpenChange,
  onSaved,
  initialLabel,
  nested = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (id: string) => void
  initialLabel?: string
  nested?: boolean
}) {
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [form, setForm] = useState<IsCodeForm>(emptyIsCodeForm)
  const [aspects, setAspects] = useState<Array<{ id: string; label: string }>>([
    { id: 'default-spec', label: 'Specification' },
  ])
  const [aspectDialogOpen, setAspectDialogOpen] = useState(false)
  const [newAspect, setNewAspect] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({ ...emptyIsCodeForm(), ...parseIsCodeLabelInput(initialLabel ?? '') })
    setSaveMessage(null)
    setAspectDialogOpen(false)
    setNewAspect('')
  }, [open, initialLabel])

  useEffect(() => {
    if (!open) return
    const load = async () => {
      try {
        const { data, error } = await supabase.from('is_codes').select('aspect')
        if (error) throw error
        const list = Array.isArray(data) ? data : []
        const uniq = new Map<string, { id: string; label: string }>()
        list.forEach((r: { aspect?: string }) => {
          const a = (r.aspect ?? 'Specification').trim()
          if (a && !uniq.has(a.toLowerCase())) uniq.set(a.toLowerCase(), { id: `aspect-${a}`, label: a })
        })
        setAspects(Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label)))
      } catch {
        setAspects([{ id: 'default-spec', label: 'Specification' }])
      }
    }
    void load()
  }, [open])

  const onAddAspect = async () => {
    const name = newAspect.trim()
    if (!name) return
    setAspects((prev) => {
      const merged = [...prev, { id: `new-${name}`, label: name }]
      const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
      return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
    })
    setForm((prev) => ({ ...prev, aspect: name }))
    setNewAspect('')
    setAspectDialogOpen(false)
  }

  const handleSave = async () => {
    setSaveMessage(null)
    setSaveLoading(true)
    try {
      const payload = {
        is_number: form.isNumber.trim(),
        revision_year: form.revisionYear.trim() || null,
        reaffirmation_year: form.reaffirmationYear.trim() || null,
        amendment_number: form.amendmentNumber.trim() || null,
        title: form.title.trim(),
        aspect: form.aspect,
        testing_charges: form.testingCharges ? Number(form.testingCharges) : null,
        remarks: form.remarks.trim() || null,
      }
      const { data, error } = await supabase.from('is_codes').insert(payload).select('id').single()
      if (error) throw error
      const id = (data as { id: string } | null)?.id
      if (id) {
        onSaved(id)
        onOpenChange(false)
        setForm(emptyIsCodeForm())
      }
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Failed to save IS Code')
    } finally {
      setSaveLoading(false)
    }
  }

  const canSave = form.isNumber.trim().length > 0 && form.title.trim().length > 0 && !saveLoading

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        layer={nested ? 'nested' : 'default'}
        overlayClassName={addIsCodeOverlayClass}
        className={addIsCodeDialogClass}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Add New IS Code
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="max-h-[min(72vh,720px)] overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5">
          {saveMessage ? (
            <p className="mb-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {saveMessage}
            </p>
          ) : null}
          <IsCodesForm
            form={form}
            onChange={setForm}
            canSave={canSave}
            saveLoading={saveLoading}
            onSave={handleSave}
            onPickFiles={() => {}}
            onOpenFiles={() => {}}
            onDeleteFiles={() => {}}
            aspectOptions={aspects}
            aspectDialogOpen={aspectDialogOpen}
            setAspectDialogOpen={setAspectDialogOpen}
            newAspect={newAspect}
            setNewAspect={setNewAspect}
            onAddAspect={onAddAspect}
            onUpdateAspect={() => {}}
            onDeleteAspect={() => {}}
            hideFooter
          />
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-stone-50 px-4 py-3 sm:justify-end sm:px-6">
          <Button
            type="button"
            variant="outline"
            className={limsOutlineBtnClass}
            onClick={() => onOpenChange(false)}
            disabled={saveLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            onClick={() => void handleSave()}
            disabled={!canSave}
          >
            {saveLoading ? 'Saving…' : 'Save IS Code'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
