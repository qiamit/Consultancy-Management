import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Calendar, FileText, Laptop, Plus, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { RemoteLookupCombobox } from '@/features/bis/shared/RemoteLookupCombobox'
import { searchLaboratoryMasterOptions } from '@/features/masters/laboratories/laboratoriesApi'
import { limsFieldAddBtnClass, limsFieldClass, limsOutlineBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  downloadCmpf311MasterFile,
  generateCmpf311Section,
  loadCmpf311MasterData,
  type Cmpf311MasterFileOption,
  type Cmpf311GenerateTarget,
  type Cmpf311ModulePayload,
  type Cmpf311TestRow,
  extractProductManualText,
  emptyCmpf311TestRow,
  formatCmpf311Requirement,
} from './cmpf311Model'

type GenerateTarget = Cmpf311GenerateTarget | 'all'
type ContentTab = 'annexure-c' | 'test-table' | 'notes'

const issueDateInputClass = 'min-w-0 border-0 bg-transparent pr-1 tabular-nums shadow-none focus-visible:ring-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:h-0 [&::-webkit-calendar-picker-indicator]:w-0 [&::-webkit-calendar-picker-indicator]:opacity-0'

function openCmpf311DatePicker() {
  const input = document.getElementById('cmpf311-reference-letter-date')
  if (!(input instanceof HTMLInputElement) || input.disabled) return
  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker()
      return
    }
  } catch {
    // Fall back to focusing the native date input if showPicker is unavailable.
  }
  input.focus()
}

/**
 * A table cell that shows its whole text (the box grows or shrinks with the content and the column width) and is read-only
 * until it is double-clicked; it stops editing on blur, Enter or Escape.
 */
function Cell({ label, value, onChange, editing, onEdit, onDone, onCommit, disabled, left, numeric, placeholder }: {
  label: string
  value: string
  onChange: (next: string) => void
  editing?: boolean
  onEdit?: () => void
  onDone?: () => void
  onCommit?: (value: string) => void
  disabled?: boolean
  left?: boolean
  numeric?: boolean
  placeholder?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const fit = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }
  useLayoutEffect(fit, [value])
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let width = el.clientWidth
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== width) { width = el.clientWidth; fit() }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const el = ref.current
    if (editing && onEdit && el && document.activeElement !== el) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [editing])
  const finish = () => { onCommit?.(value); onDone?.() }
  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label={label}
      placeholder={placeholder}
      inputMode={numeric ? 'numeric' : undefined}
      value={value}
      readOnly={disabled || !editing}
      title={editing || disabled ? undefined : 'Double-Click to Edit'}
      onDoubleClick={onEdit}
      onChange={(event) => onChange(event.target.value.replace(/\n/g, ' '))}
      onBlur={() => { if (editing) finish() }}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); event.currentTarget.blur() } }}
      className={cn(
        'block w-full min-w-0 resize-none overflow-hidden whitespace-pre-wrap break-words rounded-none border px-1.5 py-1 text-xs leading-5 text-foreground shadow-none outline-none',
        left ? 'text-left' : 'text-center',
        editing ? 'border-amber-600 bg-card ring-2 ring-amber-500/20' : 'cursor-default border-stone-400 bg-stone-50 text-stone-700',
      )}
    />
  )
}

const TARGET_LABELS: Record<GenerateTarget, string> = {
  'annexure-c': 'Annexure C',
  'test-table': 'SIT Test Table',
  notes: 'Notes',
  all: 'All Documents',
}

export function Cmpf311ModuleFields({
  value,
  onChange,
  disabled = false,
  isCodeId,
  isNumber,
  productTitle,
}: {
  value: Cmpf311ModulePayload
  onChange: (next: Cmpf311ModulePayload) => void
  disabled?: boolean
  isCodeId: string | null
  isNumber: string
  productTitle: string
}) {
  const manualInputRef = useRef<HTMLInputElement | null>(null)
  const [masterData, setMasterData] = useState<{
    isCodeId: string
    productManualNumber: string
    fileName: string
    fileId: string | null
    file: File | null
    availableFiles: Cmpf311MasterFileOption[]
  } | null>(null)
  const [selectedManuals, setSelectedManuals] = useState<{ isCodeId: string; files: Array<{ fileName: string; fileId: string | null; file: File }> } | null>(null)
  const [manualPickerOpen, setManualPickerOpen] = useState(false)
  const [downloadingMasterFileId, setDownloadingMasterFileId] = useState<string | null>(null)
  const [generateTarget, setGenerateTarget] = useState<GenerateTarget>('all')
  const [generating, setGenerating] = useState(false)
  const [generatingLabel, setGeneratingLabel] = useState('')
  const [newTestRow, setNewTestRow] = useState<Cmpf311TestRow>(() => emptyCmpf311TestRow())
  const [contentTab, setContentTab] = useState<ContentTab>('annexure-c')
  const [newAnnexure, setNewAnnexure] = useState({ title: '', content: '' })
  const [newNote, setNewNote] = useState({ title: '', description: '' })
  // The one cell being edited: double-click a cell to edit it; every other cell stays read-only.
  const [editCell, setEditCell] = useState<string | null>(null)
  const cellEdit = (key: string) => ({
    editing: editCell === key,
    onEdit: () => { if (!disabled) setEditCell(key) },
    onDone: () => setEditCell((cur) => (cur === key ? null : cur)),
  })
  const currentMasterData = masterData?.isCodeId === isCodeId ? masterData : null
  const masterManualNumber = currentMasterData?.productManualNumber ?? ''
  const defaultMasterFile = currentMasterData?.file
    ? [{ fileName: currentMasterData.fileName, fileId: currentMasterData.fileId, file: currentMasterData.file }]
    : []
  const manualFiles = selectedManuals?.isCodeId === isCodeId ? selectedManuals.files : defaultMasterFile

  useEffect(() => {
    let active = true
    if (!isCodeId) return () => { active = false }
    void loadCmpf311MasterData(isCodeId)
      .then(({ productManualNumber, productManualFile, productManualFileId, availableFiles }) => {
        if (!active) return
        setMasterData({
          isCodeId,
          productManualNumber,
          fileName: productManualFile?.name ?? '',
          fileId: productManualFileId,
          file: productManualFile,
          availableFiles,
        })
      })
      .catch((error: unknown) => {
        if (active) toast.error(error instanceof Error ? error.message : 'Could not load the Product Manual from IS Code master.')
      })
    return () => { active = false }
  // The master lookup is tied to the selected IS Code.
  }, [isCodeId])

  const patch = <K extends keyof Cmpf311ModulePayload>(key: K, next: Cmpf311ModulePayload[K]) => {
    onChange({ ...value, [key]: next })
  }

  const selectMasterFile = async (option: Cmpf311MasterFileOption) => {
    const alreadySelected = manualFiles.some((file) => file.fileId === option.id)
    if (alreadySelected) {
      if (isCodeId) setSelectedManuals({ isCodeId, files: manualFiles.filter((file) => file.fileId !== option.id) })
      return
    }
    setDownloadingMasterFileId(option.id)
    try {
      const file = await downloadCmpf311MasterFile(option)
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        toast.error('Select a PDF file. Only PDF Product Manuals can be used for AI generation.')
        return
      }
      if (!isCodeId) return
      setSelectedManuals({ isCodeId, files: [...manualFiles, { fileName: option.fileName, fileId: option.id, file }] })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not load ${option.fileName}.`)
    } finally {
      setDownloadingMasterFileId(null)
    }
  }

  const selectComputerFiles = (files: File[]) => {
    if (!files.length || !isCodeId) return
    const invalidFile = files.find((file) => !file.name.toLowerCase().endsWith('.pdf'))
    if (invalidFile) {
      toast.error(`${invalidFile.name} is not a PDF. Choose PDF files for Own SIT generation.`)
      return
    }
    const existingKeys = new Set(manualFiles.map((file) => `${file.file.name}:${file.file.size}:${file.file.lastModified}`))
    const additions = files
      .filter((file) => !existingKeys.has(`${file.name}:${file.size}:${file.lastModified}`))
      .map((file) => ({ fileName: file.name, fileId: null, file }))
    setSelectedManuals({ isCodeId, files: [...manualFiles, ...additions] })
  }

  const removeSelectedManual = (fileIndex: number) => {
    if (isCodeId) setSelectedManuals({ isCodeId, files: manualFiles.filter((_, index) => index !== fileIndex) })
  }

  const generate = async () => {
    if (!manualFiles.length) {
      toast.error('No Product Manual PDF is attached to this IS Code. Add it in IS Code master first.')
      return
    }
    setGenerating(true)
    try {
      const manualText = (await Promise.all(manualFiles.map(async ({ fileName, file }) =>
        `SOURCE FILE: ${fileName}\n${await extractProductManualText(file)}`,
      ))).join('\n\n--- NEXT PRODUCT MANUAL PDF ---\n\n')
      if (manualText.length > 120_000) {
        throw new Error('The selected PDFs contain more than 120,000 characters of text. Select fewer or shorter PDFs so the AI can review every page.')
      }
      const targets: Cmpf311GenerateTarget[] = generateTarget === 'all'
        ? ['annexure-c', 'test-table', 'notes']
        : [generateTarget]
      let nextValue: Cmpf311ModulePayload = {
        ...value,
        productManualNumber: value.productManualNumber.trim() || masterManualNumber,
      }
      const failures: string[] = []
      for (const target of targets) {
        setGeneratingLabel(TARGET_LABELS[target])
        try {
          const generated = await generateCmpf311Section({
            target,
            productManualNumber: nextValue.productManualNumber,
            isNumber,
            productTitle,
            manualText,
          })
          const generatedField = target === 'annexure-c'
            ? { annexureSections: generated.annexureSections }
            : target === 'test-table'
              ? { testRows: generated.testRows }
              : { notes: generated.notes }
          nextValue = { ...nextValue, ...generatedField }
          onChange(nextValue)
        } catch (error) {
          failures.push(`${TARGET_LABELS[target]}: ${error instanceof Error ? error.message : 'AI generation failed.'}`)
        }
      }
      if (failures.length) {
        toast.error(`Some sections could not be generated. ${failures.join(' | ')}`)
      } else {
        toast.success(`${TARGET_LABELS[generateTarget]} generated. Review the extracted content before saving.`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not generate content from the Product Manual.')
    } finally {
      setGenerating(false)
      setGeneratingLabel('')
    }
  }

  const patchTestRow = (index: number, key: keyof Cmpf311TestRow, next: string) => {
    patch('testRows', value.testRows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: next } : row))
  }

  const addTestRow = () => {
    patch('testRows', [...value.testRows, { ...newTestRow, requirement: formatCmpf311Requirement(newTestRow.requirement) }])
    setNewTestRow(emptyCmpf311TestRow())
  }

  const addAnnexureRow = () => {
    patch('annexureSections', [...value.annexureSections, newAnnexure])
    setNewAnnexure({ title: '', content: '' })
  }

  const addNoteRow = () => {
    patch('notes', [...value.notes, newNote])
    setNewNote({ title: '', description: '' })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-2 sm:p-3">
      {/* SIT type and Product Manual number are chosen on the application step (Select SIT row). */}
      {value.mode === 'bis-sit' ? (
        <section className="flex flex-wrap items-end gap-3 border border-stone-300 bg-[#fffcf7] p-3">
        <label className="flex w-56 shrink-0 flex-col gap-1 text-xs font-semibold text-stone-700">
          Reference Letter Number
          <Input className={cn(limsFieldClass, 'h-9')} value={value.referenceLetterNo} disabled={disabled} onChange={(event) => patch('referenceLetterNo', event.target.value)} />
        </label>
        <label className="flex w-56 shrink-0 flex-col gap-1 text-xs font-semibold text-stone-700">
          Reference Letter Date
          <LimsFieldWithAdd addButton={<button type="button" className={limsFieldAddBtnClass} aria-label="Open Calendar" title="Pick Date" disabled={disabled} onClick={openCmpf311DatePicker}><Calendar size={14} strokeWidth={2.25} aria-hidden /></button>}>
            <Input id="cmpf311-reference-letter-date" type="date" aria-label="Reference Letter Date" className={issueDateInputClass} value={value.referenceLetterDate} disabled={disabled} onChange={(event) => patch('referenceLetterDate', event.target.value)} />
          </LimsFieldWithAdd>
        </label>
        </section>
      ) : null}

      {value.mode === 'bis-sit' ? (
        <div className="border border-stone-300 bg-white p-3 text-sm text-stone-700">
          BIS SIT acceptance uses the Product Manual Number maintained on the selected IS Code. The acceptance letter will be available in Preview.
        </div>
      ) : (
        <>
          <section className="flex flex-wrap items-end gap-3 border border-stone-300 bg-[#fffcf7] p-3">
        <label className="flex w-56 shrink-0 flex-col gap-1 text-xs font-semibold text-stone-700">
          Reference Letter Number
          <Input className={cn(limsFieldClass, 'h-9')} value={value.referenceLetterNo} disabled={disabled} onChange={(event) => patch('referenceLetterNo', event.target.value)} />
        </label>
        <label className="flex w-56 shrink-0 flex-col gap-1 text-xs font-semibold text-stone-700">
          Reference Letter Date
          <LimsFieldWithAdd addButton={<button type="button" className={limsFieldAddBtnClass} aria-label="Open Calendar" title="Pick Date" disabled={disabled} onClick={openCmpf311DatePicker}><Calendar size={14} strokeWidth={2.25} aria-hidden /></button>}>
            <Input id="cmpf311-reference-letter-date" type="date" aria-label="Reference Letter Date" className={issueDateInputClass} value={value.referenceLetterDate} disabled={disabled} onChange={(event) => patch('referenceLetterDate', event.target.value)} />
          </LimsFieldWithAdd>
        </label>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" className={cn(limsOutlineBtnClass, 'h-8')} disabled={disabled || generating} onClick={() => setManualPickerOpen(true)}>
              Use Another PDF
            </Button>
            {/* The chosen PDFs are shown in the picker; no need to list them here. */}
            <span className="min-w-0 flex-1" />
            <select className={cn(limsFieldClass, 'h-8 w-44')} value={generateTarget} disabled={disabled || generating} onChange={(event) => setGenerateTarget(event.target.value as GenerateTarget)}>
              <option value="all">All Documents</option>
              <option value="annexure-c">Annexure C</option>
              <option value="test-table">SIT Test Table</option>
              <option value="notes">Notes</option>
            </select>
            <Button type="button" size="sm" className="h-8 rounded-none bg-amber-700 text-white hover:bg-amber-800" disabled={disabled || generating || !manualFiles.length} onClick={() => void generate()}>
              <Sparkles className="mr-1.5 h-4 w-4" aria-hidden /> {generating ? `Generating ${generatingLabel}…` : 'Generate'}
            </Button>
            </div>
          </section>

          <Dialog open={manualPickerOpen} onOpenChange={setManualPickerOpen}>
            <DialogContent className="max-w-xl overflow-hidden rounded-none border border-stone-500 p-0" layer="nested">
              <DialogHeader className="border-b border-amber-700 bg-stone-900 px-4 py-3 text-left text-white">
                <DialogTitle className="text-base font-semibold">Choose Product Manual PDFs</DialogTitle>
              </DialogHeader>
              <div className="max-h-[55vh] space-y-2 overflow-y-auto p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Files in IS Code Master</p>
                {currentMasterData?.availableFiles.length ? currentMasterData.availableFiles.map((file) => {
                  const isPdf = file.fileName.toLowerCase().endsWith('.pdf')
                  const isCurrent = manualFiles.some((selectedFile) => selectedFile.fileId === file.id)
                  return (
                    <button
                      key={file.id}
                      type="button"
                      disabled={!isPdf || disabled || generating || downloadingMasterFileId !== null}
                      onClick={() => void selectMasterFile(file)}
                      className={cn(
                        'flex w-full items-center gap-3 border px-3 py-2 text-left text-sm',
                        isCurrent ? 'border-amber-700 bg-amber-50' : 'border-stone-300 bg-white hover:bg-stone-50',
                        (!isPdf || disabled || generating || downloadingMasterFileId !== null) && 'cursor-not-allowed opacity-55',
                      )}
                    >
                      <FileText className="h-4 w-4 shrink-0 text-amber-800" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{file.fileName}</span>
                        <span className="block text-xs text-stone-500">{file.documentKind}{isPdf ? ' · PDF' : ' · Not a PDF'}</span>
                      </span>
                      {downloadingMasterFileId === file.id ? <span className="text-xs text-stone-500">Loading…</span> : null}
                      <span
                        role="switch"
                        aria-checked={isCurrent}
                        aria-label={`${isCurrent ? 'Selected' : 'Not selected'}: ${file.fileName}`}
                        className={cn('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors', isCurrent ? 'border-amber-700 bg-amber-700' : 'border-stone-400 bg-stone-200')}
                      >
                        <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform', isCurrent ? 'translate-x-[18px]' : 'translate-x-0.5')} />
                      </span>
                    </button>
                  )
                }) : <p className="border border-dashed border-stone-300 p-3 text-sm text-stone-500">{!currentMasterData && isCodeId ? 'Loading IS Code Master files…' : 'No files are attached to this IS Code in the master.'}</p>}
                {manualFiles.length ? <div className="space-y-1 border-t border-stone-200 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Selected PDFs ({manualFiles.length})</p>
                  {manualFiles.map((file, index) => <div key={`${file.fileName}-${file.fileId ?? index}`} className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-amber-800" aria-hidden />
                    <span className="min-w-0 flex-1 truncate" title={file.fileName}>{file.fileName}</span>
                    <Button type="button" variant="outline" size="sm" className="h-7 rounded-none px-2 text-red-700" disabled={disabled || generating} onClick={() => removeSelectedManual(index)}>Remove</Button>
                  </div>)}
                </div> : null}
                <div className="flex items-center gap-2 border-t border-stone-200 pt-3">
                  <input
                    ref={manualInputRef}
                    type="file"
                    multiple
                    accept="application/pdf,.pdf"
                    className="hidden"
                    disabled={disabled || generating}
                    onChange={(event) => {
                      selectComputerFiles(Array.from(event.target.files ?? []))
                      event.target.value = ''
                    }}
                  />
                  <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'h-9 min-w-0 flex-1 justify-center px-3')} title="Browse Multiple PDF Files from This Computer" disabled={disabled || generating} onClick={() => manualInputRef.current?.click()}>
                    <Laptop className="mr-2 h-4 w-4" aria-hidden /> Browse
                  </Button>
                  <Button type="button" className="h-9 min-w-0 flex-1 rounded-none border border-amber-700 bg-amber-700 px-3 text-white hover:bg-amber-800" disabled={disabled || generating || !manualFiles.length} onClick={() => setManualPickerOpen(false)}>
                    Use Selected PDFs ({manualFiles.length})
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <div className="flex flex-col gap-2 border-b border-stone-300 sm:flex-row sm:items-start sm:justify-between">
            <nav className="flex flex-wrap gap-2" aria-label="Own SIT Document Sections">
              {([['annexure-c', 'Annexure C'], ['test-table', 'SIT Table'], ['notes', 'Notes']] as const).map(([tab, label]) => (
                <button key={tab} type="button" className={cn('border border-b-0 px-4 py-2 text-sm font-semibold', contentTab === tab ? 'border-amber-700 bg-stone-800 text-amber-200' : 'border-stone-300 bg-[#fffcf7] text-stone-700 hover:bg-stone-100')} aria-current={contentTab === tab ? 'page' : undefined} onClick={() => setContentTab(tab)}>{label}</button>
              ))}
            </nav>
            <div className="w-full pb-2 sm:max-w-[480px]">
              <div className="border border-stone-400 bg-white">
                <RemoteLookupCombobox
                  inputId="cmpf311-subcontracted-laboratory"
                  listId="cmpf311-subcontracted-laboratory-options"
                  placeholder="Search Laboratory Master"
                  inputClassName="h-8 border-0 px-2 shadow-none focus-visible:ring-0"
                  label={value.subcontractedLaboratoryName}
                  selectedId={value.subcontractedLaboratoryId}
                  search={searchLaboratoryMasterOptions}
                  disabled={disabled}
                  onChange={({ id, label }) => onChange({ ...value, subcontractedLaboratoryId: id, subcontractedLaboratoryName: label })}
                />
              </div>
            </div>
          </div>

          {contentTab === 'annexure-c' ? <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-600">Annexure C — Laboratory, Marking &amp; Disposal</h3>
            <div className="overflow-x-auto border border-stone-300"><table className="w-full table-fixed border-collapse text-xs">
              <colgroup><col style={{ width: '15%' }} /><col style={{ width: '75%' }} /><col style={{ width: '10%' }} /></colgroup>
              <thead className="bg-stone-800 text-amber-200"><tr>{['Title', 'Description', 'Action'].map((label) => <th key={label} className="border border-stone-600 px-2 py-2 text-center">{label}</th>)}</tr></thead>
              <tbody>
                <tr className="bg-[#fffcf7]">
                  <td className="border border-stone-300 p-1 align-top"><Cell label="New Annexure C Title" editing value={newAnnexure.title} disabled={disabled} onChange={(v) => setNewAnnexure({ ...newAnnexure, title: v })} /></td>
                  <td className="border border-stone-300 p-1 align-top"><Cell label="New Annexure C Description" editing value={newAnnexure.content} disabled={disabled} onChange={(v) => setNewAnnexure({ ...newAnnexure, content: v })} /></td>
                  <td className="border border-stone-300 p-1 text-center"><div className="flex justify-center gap-1"><Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Add Annexure C Row" disabled={disabled} onClick={addAnnexureRow}><Plus className="h-4 w-4" aria-hidden /></Button><Button type="button" variant="outline" size="icon" className="h-8 w-8 text-red-700" aria-label="Clear New Annexure C Row" disabled={disabled} onClick={() => setNewAnnexure({ title: '', content: '' })}><Trash2 className="h-4 w-4" aria-hidden /></Button></div></td>
                </tr>
                {value.annexureSections.map((section, index) => <tr key={`annexure-${index}`} className="bg-white">
                  <td className="border border-stone-300 p-1 align-top"><Cell label={`Annexure C title ${index + 1}`} value={section.title} disabled={disabled} {...cellEdit(`a-${index}-t`)} onChange={(v) => patch('annexureSections', value.annexureSections.map((item, i) => i === index ? { ...item, title: v } : item))} /></td>
                  <td className="border border-stone-300 p-1 align-top"><Cell label={`Annexure C description ${index + 1}`} value={section.content} disabled={disabled} {...cellEdit(`a-${index}-d`)} onChange={(v) => patch('annexureSections', value.annexureSections.map((item, i) => i === index ? { ...item, content: v } : item))} /></td>
                  <td className="border border-stone-300 p-1 text-center align-top"><div className="flex justify-center gap-1"><Button type="button" variant="outline" size="icon" className="h-8 w-8 text-red-700" aria-label={`Remove Annexure C row ${index + 1}`} disabled={disabled} onClick={() => patch('annexureSections', value.annexureSections.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" aria-hidden /></Button></div></td>
                </tr>)}
              </tbody>
            </table></div>
          </section> : null}

          {contentTab === 'test-table' ? <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-600">Test Requirements</h3>
            <div className="overflow-x-auto border border-stone-300">
              <table className="w-full table-fixed border-collapse text-center text-xs [&_input]:text-center">
                <colgroup>
                  <col style={{ width: '7.2333%' }} />
                  <col style={{ width: '16.3333%' }} />
                  <col style={{ width: '13.6%' }} />
                  <col style={{ width: '8.1%' }} />
                  <col style={{ width: '9.0667%' }} />
                  <col style={{ width: '11.3333%' }} />
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '6.3333%' }} />
                </colgroup>
                <thead className="bg-stone-800 text-amber-200">
                  <tr>
                    <th colSpan={3} className="border border-stone-600 px-2 py-1.5 text-center">Test Details</th>
                    <th rowSpan={2} className="border border-stone-600 px-2 py-2 text-center">Test<br />Equipment<br />R / S</th>
                    <th colSpan={3} className="border border-stone-600 px-2 py-1.5 text-center">Level of Control</th>
                    <th rowSpan={2} className="border border-stone-600 px-2 py-2 text-center">Action</th>
                  </tr>
                  <tr>{['Clause', 'Requirements', 'Test Method & Clause No', 'No of Samples', 'Frequency', 'Remarks'].map((label) => <th key={label} className="border border-stone-600 px-2 py-2 text-center">{label}</th>)}</tr>
                </thead>
                <tbody>
                  <tr className="bg-[#fffcf7]">
                    <td className="border border-stone-300 p-1 align-top"><Cell label="New Clause" editing value={newTestRow.clause} disabled={disabled} onChange={(v) => setNewTestRow({ ...newTestRow, clause: v })} /></td>
                    <td className="border border-stone-300 p-1 align-top"><Cell label="New Requirement" editing left value={newTestRow.requirement} disabled={disabled} onCommit={(v) => setNewTestRow((r) => ({ ...r, requirement: formatCmpf311Requirement(v) }))} onChange={(v) => setNewTestRow({ ...newTestRow, requirement: v })} /></td>
                    <td className="border border-stone-300 p-1 align-top"><Cell label="New Test Method and Clause Number" editing value={[newTestRow.testMethod, newTestRow.testMethodClause].filter(Boolean).join(' — ')} disabled={disabled} onChange={(v) => setNewTestRow({ ...newTestRow, testMethod: v, testMethodClause: '' })} /></td>
                    <td className="border border-stone-300 p-1 align-top"><Cell label="New Equipment Requirement R or S" editing placeholder="R / S" value={newTestRow.testEquipmentRequirement} disabled={disabled} onChange={(v) => setNewTestRow({ ...newTestRow, testEquipmentRequirement: v })} /></td>
                    <td className="border border-stone-300 p-1 align-top"><Cell label="New Number of Samples" editing numeric value={newTestRow.noOfSample} disabled={disabled} onChange={(v) => setNewTestRow({ ...newTestRow, noOfSample: v.replace(/\D/g, '') })} /></td>
                    <td className="border border-stone-300 p-1 align-top"><Cell label="New Frequency" editing value={newTestRow.frequency} disabled={disabled} onChange={(v) => setNewTestRow({ ...newTestRow, frequency: v })} /></td>
                    <td className="border border-stone-300 p-1 align-top"><Cell label="New Remarks" editing value={newTestRow.remarks} disabled={disabled} onChange={(v) => setNewTestRow({ ...newTestRow, remarks: v })} /></td>
                    <td className="border border-stone-300 p-1 text-center align-top"><div className="flex justify-center gap-1"><Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Add Test Requirement Row" disabled={disabled || generating} onClick={addTestRow}><Plus className="h-4 w-4" aria-hidden /></Button><Button type="button" variant="outline" size="icon" className="h-8 w-8 text-red-700" aria-label="Clear New Test Requirement Row" disabled={disabled || generating} onClick={() => setNewTestRow(emptyCmpf311TestRow())}><Trash2 className="h-4 w-4" aria-hidden /></Button></div></td>
                  </tr>
                  {value.testRows.map((row, index) => <tr key={`test-${index}`} className="bg-white">
                    <td className="border border-stone-300 p-1 align-top"><Cell label={`Clause row ${index + 1}`} value={row.clause} disabled={disabled} {...cellEdit(`t-${index}-c`)} onChange={(v) => patchTestRow(index, 'clause', v)} /></td>
                    <td className="border border-stone-300 p-1 align-top"><Cell label={`Requirements row ${index + 1}`} left value={row.requirement} disabled={disabled} {...cellEdit(`t-${index}-r`)} onCommit={(v) => patchTestRow(index, 'requirement', formatCmpf311Requirement(v))} onChange={(v) => patchTestRow(index, 'requirement', v)} /></td>
                    <td className="border border-stone-300 p-1 align-top"><Cell label={`Test method and clause number row ${index + 1}`} value={[row.testMethod, row.testMethodClause].filter(Boolean).join(' — ')} disabled={disabled} {...cellEdit(`t-${index}-m`)} onChange={(v) => patch('testRows', value.testRows.map((item, i) => i === index ? { ...item, testMethod: v, testMethodClause: '' } : item))} /></td>
                    <td className="border border-stone-300 p-1 align-top"><Cell label={`Test equipments R or S row ${index + 1}`} value={row.testEquipmentRequirement} disabled={disabled} {...cellEdit(`t-${index}-e`)} placeholder="R / S" onChange={(v) => patchTestRow(index, 'testEquipmentRequirement', v)} /></td>
                    <td className="border border-stone-300 p-1 align-top"><Cell label={`Number of samples row ${index + 1}`} numeric value={row.noOfSample} disabled={disabled} {...cellEdit(`t-${index}-n`)} onChange={(v) => patchTestRow(index, 'noOfSample', v.replace(/\D/g, ''))} /></td>
                    <td className="border border-stone-300 p-1 align-top"><Cell label={`Frequency row ${index + 1}`} value={row.frequency} disabled={disabled} {...cellEdit(`t-${index}-f`)} onChange={(v) => patchTestRow(index, 'frequency', v)} /></td>
                    <td className="border border-stone-300 p-1 align-top"><Cell label={`Remarks row ${index + 1}`} value={row.remarks} disabled={disabled} {...cellEdit(`t-${index}-k`)} onChange={(v) => patchTestRow(index, 'remarks', v)} /></td>
                    <td className="border border-stone-300 p-1 text-center align-top"><div className="flex justify-center gap-0.5"><Button type="button" variant="outline" size="icon" className="h-7 w-7 text-red-700" aria-label={`Remove test requirement row ${index + 1}`} disabled={disabled} onClick={() => patch('testRows', value.testRows.filter((_, i) => i !== index))}><Trash2 className="h-3.5 w-3.5" aria-hidden /></Button></div></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </section> : null}

          {contentTab === 'notes' ? <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-600">Notes — Subcontracted Laboratory &amp; Process</h3>
            <div className="overflow-x-auto border border-stone-300"><table className="w-full table-fixed border-collapse text-xs">
              <colgroup><col style={{ width: '15%' }} /><col style={{ width: '75%' }} /><col style={{ width: '10%' }} /></colgroup>
              <thead className="bg-stone-800 text-amber-200"><tr>{['Title', 'Description', 'Action'].map((label) => <th key={label} className="border border-stone-600 px-2 py-2 text-center">{label}</th>)}</tr></thead>
              <tbody>
                <tr className="bg-[#fffcf7]">
                  <td className="border border-stone-300 p-1 align-top"><Cell label="New Note Title" editing value={newNote.title} disabled={disabled} onChange={(v) => setNewNote({ ...newNote, title: v })} /></td>
                  <td className="border border-stone-300 p-1 align-top"><Cell label="New Note Description" editing value={newNote.description} disabled={disabled} onChange={(v) => setNewNote({ ...newNote, description: v })} /></td>
                  <td className="border border-stone-300 p-1 text-center align-top"><div className="flex justify-center gap-1"><Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Add Note Row" disabled={disabled} onClick={addNoteRow}><Plus className="h-4 w-4" aria-hidden /></Button><Button type="button" variant="outline" size="icon" className="h-8 w-8 text-red-700" aria-label="Clear New Note Row" disabled={disabled} onClick={() => setNewNote({ title: '', description: '' })}><Trash2 className="h-4 w-4" aria-hidden /></Button></div></td>
                </tr>
                {value.notes.map((note, index) => <tr key={`note-${index}`} className="bg-white">
                  <td className="border border-stone-300 p-1 align-top"><Cell label={`Note title ${index + 1}`} value={note.title} disabled={disabled} {...cellEdit(`n-${index}-t`)} onChange={(v) => patch('notes', value.notes.map((item, i) => i === index ? { ...item, title: v } : item))} /></td>
                  <td className="border border-stone-300 p-1 align-top"><Cell label={`Note description ${index + 1}`} value={note.description} disabled={disabled} {...cellEdit(`n-${index}-d`)} onChange={(v) => patch('notes', value.notes.map((item, i) => i === index ? { ...item, description: v } : item))} /></td>
                  <td className="border border-stone-300 p-1 text-center align-top"><div className="flex justify-center gap-1"><Button type="button" variant="outline" size="icon" className="h-8 w-8 text-red-700" aria-label={`Remove note row ${index + 1}`} disabled={disabled} onClick={() => patch('notes', value.notes.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" aria-hidden /></Button></div></td>
                </tr>)}
              </tbody>
            </table></div>
          </section> : null}
        </>
      )}
    </div>
  )
}
