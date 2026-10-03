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
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileUpload } from '@/components/ui/file-upload'
import type { FileTemplate, TermsTemplate, WatermarkTemplate } from './types'
import { LabSettingsPanel } from './labSettingsUi'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

type LetterheadTabProps = {
  saveMessage: string | null
  saveLoading: boolean
  onSave: () => void

  headerDialogOpen: boolean
  setHeaderDialogOpen: (open: boolean) => void
  newHeaderName: string
  setNewHeaderName: (value: string) => void
  onAddHeaderTemplate: () => void
  headerTemplates: FileTemplate[]
  setHeaderTemplates: React.Dispatch<React.SetStateAction<FileTemplate[]>>
  headerDeleteTarget: { id: string; name: string } | null
  setHeaderDeleteTarget: (target: { id: string; name: string } | null) => void
  onDeleteHeaderTemplate: () => void

  footerDialogOpen: boolean
  setFooterDialogOpen: (open: boolean) => void
  newFooterName: string
  setNewFooterName: (value: string) => void
  onAddFooterTemplate: () => void
  footerTemplates: FileTemplate[]
  setFooterTemplates: React.Dispatch<React.SetStateAction<FileTemplate[]>>
  footerDeleteTarget: { id: string; name: string } | null
  setFooterDeleteTarget: (target: { id: string; name: string } | null) => void
  onDeleteFooterTemplate: () => void

  termsTemplates: TermsTemplate[]
  setTermsTemplates: React.Dispatch<React.SetStateAction<TermsTemplate[]>>
  newTermsName: string
  setNewTermsName: (value: string) => void
  termsDialogOpen: boolean
  setTermsDialogOpen: (open: boolean) => void
  onAddTermsTemplate: () => void
  termsDeleteTarget: { id: string; name: string } | null
  setTermsDeleteTarget: (target: { id: string; name: string } | null) => void
  onDeleteTermsTemplate: () => void

  watermarkTemplates: WatermarkTemplate[]
  setWatermarkTemplates: React.Dispatch<React.SetStateAction<WatermarkTemplate[]>>
  watermarkDialogOpen: boolean
  setWatermarkDialogOpen: (open: boolean) => void
  newWatermarkType: 'image' | 'text'
  setNewWatermarkType: (value: 'image' | 'text') => void
  newWatermarkName: string
  setNewWatermarkName: (value: string) => void
  onAddWatermarkTemplate: () => void
  watermarkDeleteTarget: { id: string; name: string } | null
  setWatermarkDeleteTarget: (target: { id: string; name: string } | null) => void
  onDeleteWatermarkTemplate: () => void
}

export function LetterheadTab(props: LetterheadTabProps) {
  return (
    <LabSettingsPanel>
        <div className="space-y-8">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="mb-1 block">Header Templates</Label>
              </div>
              <Dialog open={props.headerDialogOpen} onOpenChange={props.setHeaderDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2">
                    <Plus size={14} />
                    Add New Header
                  </Button>
                </DialogTrigger>
                <DialogContent
                  persistOnFocusLoss
                  layer="stacked"
                  aria-describedby={undefined}
                  className={cn(limsDialogClass, 'max-w-lg p-0')}
                >
                  <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
                    <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
                    <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
                    <DialogHeader className="relative pr-10 text-left">
                      <DialogTitle className="text-base font-semibold tracking-tight text-white">
                        Add Header Template
                      </DialogTitle>
                    </DialogHeader>
                  </div>

                  <div className="space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
                    <div className="space-y-2">
                      <Label
                        htmlFor="header-name"
                        className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                      >
                        Template Name
                      </Label>
                      <Input
                        id="header-name"
                        placeholder="e.g., Default Header"
                        value={props.newHeaderName}
                        onChange={(e) => props.setNewHeaderName(e.target.value)}
                        className={limsFieldClass}
                      />
                    </div>
                  </div>

                  <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
                    <Button
                      type="button"
                      className={cn(limsPrimaryBtnClass, 'h-9 min-w-[8.5rem]')}
                      onClick={props.onAddHeaderTemplate}
                      disabled={!props.newHeaderName.trim()}
                    >
                      Save & Close
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {props.headerTemplates.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {props.headerTemplates.map((template) => (
                  <div key={template.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`header-${template.id}`}>{template.name}</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => props.setHeaderDeleteTarget({ id: template.id, name: template.name })}
                        aria-label={`Delete ${template.name}`}
                      >
                        <Trash2 size={16} className="text-destructive" />
                      </Button>
                    </div>
                    <FileUpload
                      label="Upload Template"
                      accept="image/*"
                      value={template.fileUrl ?? undefined}
                      bucket="laboratory-files"
                      pathPrefix="letterheads"
                      onChange={(_file, storagePath) =>
                        props.setHeaderTemplates((prev) =>
                          prev.map((entry) =>
                            entry.id === template.id
                              ? { ...entry, fileUrl: storagePath ?? entry.fileUrl }
                              : entry,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No Header Templates Added Yet.</p>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="mb-1 block">Footer Templates</Label>
              </div>
              <Dialog open={props.footerDialogOpen} onOpenChange={props.setFooterDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2">
                    <Plus size={14} />
                    Add New Footer
                  </Button>
                </DialogTrigger>
                <DialogContent
                  persistOnFocusLoss
                  layer="stacked"
                  aria-describedby={undefined}
                  className={cn(limsDialogClass, 'max-w-lg p-0')}
                >
                  <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
                    <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
                    <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
                    <DialogHeader className="relative pr-10 text-left">
                      <DialogTitle className="text-base font-semibold tracking-tight text-white">
                        Add Footer Template
                      </DialogTitle>
                    </DialogHeader>
                  </div>

                  <div className="space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
                    <div className="space-y-2">
                      <Label
                        htmlFor="footer-name"
                        className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                      >
                        Template Name
                      </Label>
                      <Input
                        id="footer-name"
                        placeholder="e.g., Default Footer"
                        value={props.newFooterName}
                        onChange={(e) => props.setNewFooterName(e.target.value)}
                        className={limsFieldClass}
                      />
                    </div>
                  </div>

                  <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
                    <Button
                      type="button"
                      className={cn(limsPrimaryBtnClass, 'h-9 min-w-[8.5rem]')}
                      onClick={props.onAddFooterTemplate}
                      disabled={!props.newFooterName.trim()}
                    >
                      Save & Close
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {props.footerTemplates.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {props.footerTemplates.map((template) => (
                  <div key={template.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`footer-${template.id}`}>{template.name}</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => props.setFooterDeleteTarget({ id: template.id, name: template.name })}
                        aria-label={`Delete ${template.name}`}
                      >
                        <Trash2 size={16} className="text-destructive" />
                      </Button>
                    </div>
                    <FileUpload
                      label="Upload Template"
                      accept="image/*"
                      value={template.fileUrl ?? undefined}
                      bucket="laboratory-files"
                      pathPrefix="letterheads"
                      onChange={(_file, storagePath) =>
                        props.setFooterTemplates((prev) =>
                          prev.map((entry) =>
                            entry.id === template.id
                              ? { ...entry, fileUrl: storagePath ?? entry.fileUrl }
                              : entry,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No Feader Templates Added Yet.</p>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="mb-1 block">Terms & Conditions</Label>
              </div>
              <Dialog open={props.termsDialogOpen} onOpenChange={props.setTermsDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2">
                    <Plus size={14} />
                    Add Terms Template
                  </Button>
                </DialogTrigger>
                <DialogContent
                  persistOnFocusLoss
                  layer="stacked"
                  aria-describedby={undefined}
                  className={cn(limsDialogClass, 'max-w-lg p-0')}
                >
                  <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
                    <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
                    <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
                    <DialogHeader className="relative pr-10 text-left">
                      <DialogTitle className="text-base font-semibold tracking-tight text-white">
                        Add Terms & Conditions Template
                      </DialogTitle>
                    </DialogHeader>
                  </div>

                  <div className="space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
                    <div className="space-y-2">
                      <Label
                        htmlFor="terms-name"
                        className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                      >
                        Template Name
                      </Label>
                      <Input
                        id="terms-name"
                        placeholder="e.g., Standard Terms"
                        value={props.newTermsName}
                        onChange={(e) => props.setNewTermsName(e.target.value)}
                        className={limsFieldClass}
                      />
                    </div>
                  </div>

                  <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
                    <Button
                      type="button"
                      className={cn(limsPrimaryBtnClass, 'h-9 min-w-[8.5rem]')}
                      onClick={props.onAddTermsTemplate}
                      disabled={!props.newTermsName.trim()}
                    >
                      Save & Close
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {props.termsTemplates.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {props.termsTemplates.map((template) => (
                  <div key={template.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`terms-${template.id}`}>{template.name}</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => props.setTermsDeleteTarget({ id: template.id, name: template.name })}
                        aria-label={`Delete ${template.name}`}
                      >
                        <Trash2 size={16} className="text-destructive" />
                      </Button>
                    </div>
                    <Textarea
                      id={`terms-${template.id}`}
                      rows={4}
                      className="!h-auto !min-h-[88px] resize-y rounded-md border border-slate-300 bg-white focus-visible:ring-teal-600/30"
                      placeholder="Enter terms and conditions"
                      value={template.text}
                      onChange={(e) =>
                        props.setTermsTemplates((prev) =>
                          prev.map((entry) =>
                            entry.id === template.id
                              ? { ...entry, text: e.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No Term & Condition Templates Added Yet.</p>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="mb-1 block">Water Mark Templete</Label>
              </div>
              <Dialog open={props.watermarkDialogOpen} onOpenChange={props.setWatermarkDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2">
                    <Plus size={14} />
                    Add New Water Mark
                  </Button>
                </DialogTrigger>
                <DialogContent
                  persistOnFocusLoss
                  layer="stacked"
                  aria-describedby={undefined}
                  className={cn(limsDialogClass, 'max-w-lg p-0')}
                >
                  <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
                    <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
                    <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
                    <DialogHeader className="relative pr-10 text-left">
                      <DialogTitle className="text-base font-semibold tracking-tight text-white">
                        Add New Water Mark
                      </DialogTitle>
                    </DialogHeader>
                  </div>

                  <div className="space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label
                          htmlFor="watermark-name"
                          className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                        >
                          Water Mark Name
                        </Label>
                        <Input
                          id="watermark-name"
                          placeholder="e.g., Confidential"
                          value={props.newWatermarkName}
                          onChange={(e) => props.setNewWatermarkName(e.target.value)}
                          className={limsFieldClass}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label
                          htmlFor="watermark-type"
                          className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                        >
                          Water Mark Type
                        </Label>
                        <Select
                          value={props.newWatermarkType}
                          onValueChange={(v) => props.setNewWatermarkType(v as 'image' | 'text')}
                        >
                          <SelectTrigger id="watermark-type" className={limsFieldClass}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="image">Image</SelectItem>
                            <SelectItem value="text">Text</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
                    <Button
                      type="button"
                      className={cn(limsPrimaryBtnClass, 'h-9 min-w-[8.5rem]')}
                      onClick={props.onAddWatermarkTemplate}
                      disabled={!props.newWatermarkName.trim()}
                    >
                      Save & Close
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {props.watermarkTemplates.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {props.watermarkTemplates.map((wm) => (
                  <div key={wm.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`watermark-${wm.id}`}>{wm.name}</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => props.setWatermarkDeleteTarget({ id: wm.id, name: wm.name })}
                        aria-label={`Delete ${wm.name}`}
                      >
                        <Trash2 size={16} className="text-destructive" />
                      </Button>
                    </div>

                    {wm.type === 'image' ? (
                      <FileUpload
                        label="Upload Water Mark"
                        accept="image/*"
                        value={wm.imagePath ?? undefined}
                        bucket="laboratory-files"
                        pathPrefix="letterheads"
                        onChange={(_file, storagePath) =>
                          props.setWatermarkTemplates((prev) =>
                            prev.map((entry) =>
                              entry.id === wm.id
                                ? { ...entry, imagePath: storagePath ?? entry.imagePath }
                                : entry,
                            ),
                          )
                        }
                      />
                    ) : (
                      <Textarea
                        id={`watermark-${wm.id}`}
                        rows={4}
                        className="!h-auto !min-h-[88px] resize-y rounded-md border border-slate-300 bg-white focus-visible:ring-teal-600/30"
                        placeholder="Enter watermark text"
                        value={wm.text ?? ''}
                        onChange={(e) =>
                          props.setWatermarkTemplates((prev) =>
                            prev.map((entry) =>
                              entry.id === wm.id ? { ...entry, text: e.target.value } : entry,
                            ),
                          )
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No Water Mark Templates Added Yet.</p>
            )}
          </section>
        </div>

        <Dialog open={!!props.headerDeleteTarget} onOpenChange={(open) => !open && props.setHeaderDeleteTarget(null)}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Delete Header Template</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{props.headerDeleteTarget?.name}"? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => props.setHeaderDeleteTarget(null)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={props.onDeleteHeaderTemplate}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!props.footerDeleteTarget} onOpenChange={(open) => !open && props.setFooterDeleteTarget(null)}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Delete Footer Template</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{props.footerDeleteTarget?.name}"? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => props.setFooterDeleteTarget(null)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={props.onDeleteFooterTemplate}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!props.termsDeleteTarget} onOpenChange={(open) => !open && props.setTermsDeleteTarget(null)}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Delete Terms Template</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{props.termsDeleteTarget?.name}"? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => props.setTermsDeleteTarget(null)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={props.onDeleteTermsTemplate}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!props.watermarkDeleteTarget} onOpenChange={(open) => !open && props.setWatermarkDeleteTarget(null)}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Delete Water Mark</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{props.watermarkDeleteTarget?.name}"? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => props.setWatermarkDeleteTarget(null)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={props.onDeleteWatermarkTemplate}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </LabSettingsPanel>
  )
}
