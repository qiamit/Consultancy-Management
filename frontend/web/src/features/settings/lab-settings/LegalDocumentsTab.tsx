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
import type { RegistrationDocument } from './types'
import { LabSettingsPanel } from './labSettingsUi'

type LegalDocumentsTabProps = {
  saveMessage: string | null
  saveLoading: boolean
  onSave: () => void

  registrationDocs: RegistrationDocument[]
  setRegistrationDocs: React.Dispatch<React.SetStateAction<RegistrationDocument[]>>

  registrationDialogOpen: boolean
  setRegistrationDialogOpen: (open: boolean) => void
  newRegistrationName: string
  setNewRegistrationName: (value: string) => void
  onAddRegistrationDocument: () => void

  registrationDeleteTarget: { id: string; name: string } | null
  setRegistrationDeleteTarget: (target: { id: string; name: string } | null) => void
  onDeleteRegistrationCard: () => void
}

export function LegalDocumentsTab(props: LegalDocumentsTabProps) {
  return (
    <LabSettingsPanel>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-stone-800">Registration Documents</h3>
          <Dialog open={props.registrationDialogOpen} onOpenChange={props.setRegistrationDialogOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-stone-500 bg-stone-100 text-amber-800 transition-colors hover:bg-amber-500/15 hover:text-amber-950"
                aria-label="Add registration document"
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
                    Add Registration Document
                  </DialogTitle>
                </DialogHeader>
              </div>

              <div className="space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="registration-name"
                    className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                  >
                    Document Name
                  </Label>
                  <Input
                    id="registration-name"
                    placeholder="e.g., Fire Safety Certificate"
                    value={props.newRegistrationName}
                    onChange={(e) => props.setNewRegistrationName(e.target.value)}
                    className={limsFieldClass}
                  />
                </div>
              </div>

              <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
                <Button
                  type="button"
                  className={cn(limsPrimaryBtnClass, 'h-9 min-w-[8.5rem]')}
                  onClick={props.onAddRegistrationDocument}
                  disabled={!props.newRegistrationName.trim()}
                >
                  Save & Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {props.registrationDocs.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {props.registrationDocs.map((doc) => (
              <div
                key={doc.id}
                className="space-y-3 rounded-none border-2 border-stone-400 bg-white/90 p-4 shadow-sm ring-1 ring-amber-700/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Label htmlFor={`reg-${doc.id}`}>{doc.name} Number</Label>
                    <Input
                      id={`reg-${doc.id}`}
                      placeholder={`Enter ${doc.name} Number`}
                      value={doc.number}
                      onChange={(e) =>
                        props.setRegistrationDocs((prev) =>
                          prev.map((entry) =>
                            entry.id === doc.id ? { ...entry, number: e.target.value } : entry,
                          ),
                        )
                      }
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => props.setRegistrationDeleteTarget({ id: doc.id, name: doc.name })}
                    className="mt-1 shrink-0 text-red-600 hover:text-red-800"
                    aria-label={`Delete ${doc.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <FileUpload
                  label={`${doc.name} File`}
                  accept="image/*,.pdf"
                  value={doc.fileUrl ?? undefined}
                  bucket="laboratory-files"
                  pathPrefix="registration"
                  onChange={(_file, storagePath) =>
                    props.setRegistrationDocs((prev) =>
                      prev.map((entry) =>
                        entry.id === doc.id ? { ...entry, fileUrl: storagePath } : entry,
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={!!props.registrationDeleteTarget}
        onOpenChange={(open) => !open && props.setRegistrationDeleteTarget(null)}
      >
        <DialogContent
          aria-describedby={undefined}
          className={cn(limsDialogClass, 'max-w-md p-0')}
        >
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">
                Delete Registration Card
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
            <DialogDescription className="text-sm text-stone-700">
              Are you sure you want to delete &quot;{props.registrationDeleteTarget?.name}&quot;? This action cannot be
              undone.
            </DialogDescription>
          </div>
          <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end gap-2">
            <Button
              type="button"
              className={cn(limsOutlineBtnClass, 'h-9')}
              onClick={() => props.setRegistrationDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button type="button" className={cn(limsDeleteBtnClass, 'h-9')} onClick={props.onDeleteRegistrationCard}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LabSettingsPanel>
  )
}
