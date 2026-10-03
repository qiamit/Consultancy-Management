import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileUpload } from '@/components/ui/file-upload'
import {
  limsDarkBarGlowStyle,
  limsDeleteBtnClass,
  limsDialogClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { AccreditationCard } from './types'
import { LabSettingsPanel } from './labSettingsUi'

type RegistrationDocumentsTabProps = {
  saveMessage: string | null
  saveLoading: boolean
  onSave: () => void

  accreditationDialogOpen: boolean
  setAccreditationDialogOpen: (open: boolean) => void
  newAccreditationName: string
  setNewAccreditationName: (value: string) => void
  onAddAccreditationCard: () => void

  accreditationCards: AccreditationCard[]
  setAccreditationCards: React.Dispatch<React.SetStateAction<AccreditationCard[]>>

  accreditationDeleteTarget: { id: string; name: string } | null
  setAccreditationDeleteTarget: (target: { id: string; name: string } | null) => void
  onDeleteAccreditationCard: () => void
}

export function RegistrationDocumentsTab(props: RegistrationDocumentsTabProps) {
  return (
    <LabSettingsPanel>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-stone-800">Accreditation Certificate Numbers</h3>
          <Dialog open={props.accreditationDialogOpen} onOpenChange={props.setAccreditationDialogOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-stone-500 bg-stone-100 text-amber-800 shadow-sm transition-colors hover:bg-amber-500/15 hover:text-amber-950"
                aria-label="Add accreditation registration"
                title="Add New"
              >
                <Plus size={14} strokeWidth={2.25} aria-hidden />
              </button>
            </DialogTrigger>
            <DialogContent
              persistOnFocusLoss
              aria-describedby={undefined}
              className={cn(limsDialogClass, 'max-w-lg p-0')}
            >
              <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
                <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
                <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
                <DialogHeader className="relative pr-10 text-left">
                  <DialogTitle className="text-base font-semibold tracking-tight text-white">
                    Add Accreditation Registration
                  </DialogTitle>
                </DialogHeader>
              </div>

              <div className="space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="accreditation-name"
                    className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                  >
                    Accreditation Name
                  </Label>
                  <Input
                    id="accreditation-name"
                    placeholder="e.g., QAI Testing"
                    value={props.newAccreditationName}
                    onChange={(e) => props.setNewAccreditationName(e.target.value)}
                    className={limsFieldClass}
                  />
                </div>
              </div>

              <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
                <Button
                  type="button"
                  className={cn(limsPrimaryBtnClass, 'h-9 min-w-[8.5rem]')}
                  onClick={props.onAddAccreditationCard}
                  disabled={!props.newAccreditationName.trim()}
                >
                  Save & Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {props.accreditationCards.map((card) => (
            <div
              key={card.id}
              className="space-y-3 rounded-none border-2 border-stone-400 bg-white/90 p-4 shadow-sm ring-1 ring-amber-700/10"
            >
              <div className="flex items-start justify-between gap-2">
                <Label htmlFor={card.inputId} className="min-w-0 truncate">
                  {card.inputLabel}
                </Label>
                <button
                  type="button"
                  onClick={() => props.setAccreditationDeleteTarget({ id: card.id, name: card.inputLabel })}
                  className="shrink-0 text-red-600 hover:text-red-800"
                  aria-label={`Delete ${card.inputLabel}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <Input
                id={card.inputId}
                placeholder="Enter Certificate Number"
                value={card.certificateNo}
                onChange={(e) =>
                  props.setAccreditationCards((prev) =>
                    prev.map((entry) =>
                      entry.id === card.id ? { ...entry, certificateNo: e.target.value } : entry,
                    ),
                  )
                }
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`${card.id}-valid-from`}>Validity Start</Label>
                  <Input
                    id={`${card.id}-valid-from`}
                    type="date"
                    value={card.validityStart ?? ''}
                    onChange={(e) =>
                      props.setAccreditationCards((prev) =>
                        prev.map((entry) =>
                          entry.id === card.id
                            ? { ...entry, validityStart: e.target.value || null }
                            : entry,
                        ),
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${card.id}-valid-to`}>Validity End</Label>
                  <Input
                    id={`${card.id}-valid-to`}
                    type="date"
                    value={card.validityEnd ?? ''}
                    onChange={(e) =>
                      props.setAccreditationCards((prev) =>
                        prev.map((entry) =>
                          entry.id === card.id
                            ? { ...entry, validityEnd: e.target.value || null }
                            : entry,
                        ),
                      )
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <FileUpload
                  label={card.certificateLabel}
                  accept="image/*,.pdf"
                  value={card.certificateFilePath ?? undefined}
                  bucket="laboratory-files"
                  pathPrefix="accreditation"
                  onChange={(_file, storagePath) =>
                    props.setAccreditationCards((prev) =>
                      prev.map((entry) =>
                        entry.id === card.id
                          ? {
                              ...entry,
                              certificateFilePath: storagePath ?? entry.certificateFilePath,
                            }
                          : entry,
                      ),
                    )
                  }
                />
                <FileUpload
                  label={card.scopeLabel}
                  accept="image/*,.pdf"
                  value={card.scopeFilePath ?? undefined}
                  bucket="laboratory-files"
                  pathPrefix="accreditation"
                  onChange={(_file, storagePath) =>
                    props.setAccreditationCards((prev) =>
                      prev.map((entry) =>
                        entry.id === card.id
                          ? { ...entry, scopeFilePath: storagePath ?? entry.scopeFilePath }
                          : entry,
                      ),
                    )
                  }
                />
                <FileUpload
                  label={card.logoLabel}
                  accept="image/*"
                  value={card.logoFilePath ?? undefined}
                  bucket="laboratory-files"
                  pathPrefix="accreditation"
                  onChange={(_file, storagePath) =>
                    props.setAccreditationCards((prev) =>
                      prev.map((entry) =>
                        entry.id === card.id
                          ? { ...entry, logoFilePath: storagePath ?? entry.logoFilePath }
                          : entry,
                      ),
                    )
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog
        open={!!props.accreditationDeleteTarget}
        onOpenChange={(open) => !open && props.setAccreditationDeleteTarget(null)}
      >
        <DialogContent aria-describedby={undefined} className={cn(limsDialogClass, 'max-w-md p-0')}>
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">
                Delete Accreditation Card
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
            <DialogDescription className="text-sm text-stone-700">
              Are you sure you want to delete &quot;{props.accreditationDeleteTarget?.name}&quot;? This action cannot be
              undone.
            </DialogDescription>
          </div>
          <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end gap-2">
            <Button
              type="button"
              className={cn(limsOutlineBtnClass, 'h-9')}
              onClick={() => props.setAccreditationDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button type="button" className={cn(limsDeleteBtnClass, 'h-9')} onClick={props.onDeleteAccreditationCard}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LabSettingsPanel>
  )
}
