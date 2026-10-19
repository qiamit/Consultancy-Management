import { useState, type ReactNode } from 'react'
import { CalendarCheck, Check, ChevronDown, FileDown, Pencil, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { triggerPdfDownload } from '@/lib/playwrightPdfClient'
import { cn } from '@/lib/utils'
import { undertakingGeneralDefaultPoints } from '../print/undertakingGeneralHtml'
import { parseUndertakingGeneralPayload } from './undertakingPayloadModels'
import type { BisPrintDocumentKind } from '../print/printBisDocument'
import { fetchBisModulePayload, saveBisModulePayload } from './bisModuleDataApi'
import { rowToBisApplicationDetailsForm, type BisProjectRow } from './types'
import { AuthorizationLetterDialog } from './AuthorizationLetterDialog'
import { APPLICATION_DECLARATION_KIND } from './manakModuleKinds'
import { ManakComponentsTable, type StepComponent, type YesNo } from './ManakComponentsTable'
import { ManakDocumentActions } from './ManakDocumentActions'
import { buildMergedBisProjectFilesPdf } from './mergeBisProjectFilesPdf'
import { FileAttachButton } from './RowFileAttachment'
import { AiFilePickerDialog, type PickedFile } from './AiFilePickerDialog'
import { ApplicationDocumentsAutoTable } from './ApplicationDocumentsAutoTable'
import { otherInformationUploadChoice } from './applicationDocuments'
import { EditableRows } from './ManakManagementStep'
import { fileColumn } from './rowFileColumn'
import { useShowAiButtons } from '@/hooks/useShowAiAssistant'
import { UndertakingEditorDialog, type EditableUndertakingKind } from './UndertakingEditorDialog'
import {
  declarationFileFromProjectFile,
  declarationFileToProjectFile,
  type DeclarationFile,
} from './manakDeclarationFiles'

/* Step 7 — Declaration / Undertaking, laid out like Steps 3–6: one component table whose Applicable choices
   save at once, documents edited in their own editors, uploads with the red / green file button. */

type Rec = Record<string, unknown>
type SupportingKind = 'otherInformation' | 'otherRequest'
type Payload = Rec | null | undefined

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
/** Upload-only rows are not generated documents; they have no bundle select box. */
const UPLOAD_ROW_KIND = APPLICATION_DECLARATION_KIND

const labelCls = 'w-[1%] whitespace-nowrap border border-[#e7e0d4] bg-[#f7f3eb] px-3 py-2 text-left align-middle text-sm font-bold text-stone-800'
const tdCls = 'border border-[#e7e0d4] px-2 py-1.5 align-middle text-stone-700'
const controlCls = 'h-9 rounded-none border-stone-400 bg-white px-2 text-sm'

const text = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))
const yesNoOf = (v: unknown): YesNo | null => (v === 'Yes' || v === 'No' ? v : null)

function fileRef(value: unknown): DeclarationFile | null {
  if (!value || typeof value !== 'object') return null
  const f = value as Partial<DeclarationFile>
  return f.id && f.fileName && f.storagePath ? { id: f.id, fileName: f.fileName, storagePath: f.storagePath } : null
}

/** Supporting rows as saved by the popup: { fileName, file: { id, file_name, storage_path } } (older rows used upload). */
function supportingRows(value: unknown): Rec[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as Rec
    const legacy = fileRef(row.upload)
    const file = row.file && typeof row.file === 'object' ? row.file : legacy ? declarationFileToProjectFile(legacy) : null
    return [{ ...row, fileName: text(row.fileName), file }]
  })
}

const rowPath = (row: Rec) => (row.file && typeof row.file === 'object' ? text((row.file as Rec).storage_path) : '')

/** "Sunday" / "Saturday and Sunday" / "Friday, Saturday and Sunday" for the General Undertaking. */
function daysSentence(days: string[]): string {
  if (days.length <= 1) return days[0] ?? ''
  return `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`
}

async function patchDeclaration(projectId: string, patch: Rec) {
  const current = (await fetchBisModulePayload(projectId, APPLICATION_DECLARATION_KIND)) ?? {}
  await saveBisModulePayload(projectId, APPLICATION_DECLARATION_KIND, { ...current, ...patch })
}

export function ManakDeclarationStep({
  projectRow,
  payload,
  defaultName,
  defaultDesignation,
  onChanged,
  onEdit,
  renderDocActions,
  selection,
  onManagementChanged,
}: {
  projectRow: BisProjectRow
  /** Saved application-declaration payload. */
  payload: Payload
  defaultName: string
  defaultDesignation: string
  onChanged: () => void
  onEdit: (kind: BisPrintDocumentKind) => void
  renderDocActions?: (kind: BisPrintDocumentKind, onModuleEdit: () => void) => ReactNode
  selection?: { has: (kind: BisPrintDocumentKind) => boolean; set: (kind: BisPrintDocumentKind, selected: boolean) => void }
  onManagementChanged?: () => void
}) {
  const projectId = projectRow.id
  const [name, setName] = useState<string | null>(null)
  const [designation, setDesignation] = useState<string | null>(null)
  const shownName = name ?? (text(payload?.submitterName) || defaultName)
  const shownDesignation = designation ?? (text(payload?.submitterDesignation) || defaultDesignation)

  const [pendingWeekly, setPendingWeekly] = useState<{ weeklyOffs: YesNo; offDays: string[] } | null>(null)
  const weeklyOffs: YesNo = pendingWeekly?.weeklyOffs ?? (yesNoOf(payload?.weeklyOffs) ?? 'No')
  const offDays = pendingWeekly?.offDays ?? (Array.isArray(payload?.offDays) ? DAYS.filter((d) => (payload!.offDays as unknown[]).includes(d)) : [])

  const [authOpen, setAuthOpen] = useState(false)
  const [undertaking, setUndertaking] = useState<EditableUndertakingKind | null>(null)
  const [aiFor, setAiFor] = useState<SupportingKind | null>(null)
  const showAiButtons = useShowAiButtons()
  const [downloading, setDownloading] = useState(false)

  const statutoryFile = fileRef(payload?.statutoryPermissionFile)
  const otherInformationRows = supportingRows(payload?.otherInformationRows)
  const otherRequestRows = supportingRows(payload?.otherRequestRows)

  const saveSubmitter = async (patch: Rec) => {
    try {
      await patchDeclaration(projectId, patch)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save')
    }
  }

  /** Weekly offs are saved here and copied into the General Undertaking ("Our weekly off day is …"). */
  const saveWeekly = async (next: { weeklyOffs: YesNo; offDays: string[] }) => {
    setPendingWeekly(next)
    try {
      await patchDeclaration(projectId, next)
      const general = (await fetchBisModulePayload(projectId, 'undertaking-general')) ?? {}
      const weeklyOff = next.weeklyOffs === 'Yes' ? daysSentence(next.offDays) || 'Sunday' : 'None'
      // The weekly-off undertaking line goes back to its template so it follows the new days.
      const weeklyIndex = undertakingGeneralDefaultPoints({ ...parseUndertakingGeneralPayload(general), weeklyOff, isNumber: '' }).findIndex((line) =>
        /weekly off|all days of the week/i.test(line),
      )
      const lines = Array.isArray(general.lines)
        ? (general.lines as Rec[]).map((line) => (line && line.templateIndex === weeklyIndex ? { ...line, text: null } : line))
        : general.lines
      if (general.weeklyOff !== weeklyOff || lines !== general.lines) await saveBisModulePayload(projectId, 'undertaking-general', { ...general, weeklyOff, lines })
      onChanged()
    } catch (err) {
      setPendingWeekly(null)
      toast.error(err instanceof Error ? err.message : 'Could not save weekly offs')
    }
  }

  const downloadSupporting = async (rows: Rec[], label: string) => {
    const paths = rows.map(rowPath).filter(Boolean)
    if (!paths.length) {
      toast.error(`Upload a file for ${label} first.`)
      return
    }
    setDownloading(true)
    try {
      const bytes = await buildMergedBisProjectFilesPdf(projectId, ['application-declaration'], { strict: true, storagePaths: paths })
      if (!bytes) throw new Error('No attached PDF or image files were found.')
      const owned = new Uint8Array(bytes.byteLength)
      owned.set(bytes)
      triggerPdfDownload(new Blob([owned.buffer], { type: 'application/pdf' }), `${label}.pdf`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not download the attachments.')
    } finally {
      setDownloading(false)
    }
  }

  /** Other Information / Other Request: file name + PDF per row, Import from another application, AI file search. */
  const supportingComponent = (key: SupportingKind, label: string, rows: Rec[]): StepComponent => {
    const rowsKey = `${key}Rows`
    return {
      key,
      label,
      printKind: UPLOAD_ROW_KIND,
      selectable: false,
      // Other Information carries every application document by default.
      defaultApplicable: key === 'otherInformation' ? 'Yes' : 'No',
      importTable: { kind: APPLICATION_DECLARATION_KIND, rowsKey, idKeys: ['fileName'] },
      popupHeaderExtra: showAiButtons
        ? () => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 shrink-0 rounded-none border border-amber-500/60 bg-stone-800 p-0 text-amber-200 shadow-sm transition-colors hover:border-amber-400 hover:bg-amber-600 hover:text-white"
              title="Find files with AI (from any application of this client)"
              aria-label="Find files with AI"
              onClick={() => setAiFor(key)}
            >
              <Sparkles size={15} aria-hidden />
            </Button>
          )
        : undefined,
      popup: () => (
        <>
        <EditableRows
          projectId={projectId}
          kind={APPLICATION_DECLARATION_KIND}
          rowsKey={rowsKey}
          fields={[{ key: 'fileName', label: 'File Name', alignLeft: true, placeholder: 'File Name' }]}
          extraColumns={[fileColumn({ projectId, kind: APPLICATION_DECLARATION_KIND, rowsKey, key: 'file', label: 'Upload File', docKind: 'application-declaration', onChanged })]}
          blank={() => ({ fileName: '', file: null })}
          saved={rows}
          onChanged={onChanged}
          addLabel={`Add ${label} file`}
        />
        {key === 'otherInformation' ? (
          <ApplicationDocumentsAutoTable
            projectRow={projectRow}
            choice={otherInformationUploadChoice(payload)}
            onChoiceChange={async (next) => {
              await patchDeclaration(projectId, { otherInformationExcluded: next.excluded, otherInformationIncluded: next.included })
              onChanged()
            }}
          />
        ) : null}
        </>
      ),
      actions: (edit) => (
        <ManakDocumentActions
          disabled={downloading}
          actions={[
            { label: `Edit — ${label}`, icon: Pencil, onClick: edit },
            { label: `Download PDF — ${label}`, icon: FileDown, onClick: () => void downloadSupporting(rows, label), disabled: !rows.some(rowPath) },
          ]}
        />
      ),
    }
  }

  /** AI-picked files become new rows of that section. */
  const addPicked = async (key: SupportingKind, picked: PickedFile[]) => {
    const rowsKey = `${key}Rows`
    const current = (await fetchBisModulePayload(projectId, APPLICATION_DECLARATION_KIND)) ?? {}
    const existing = supportingRows(current[rowsKey]).filter((r) => text(r.fileName).trim())
    await saveBisModulePayload(projectId, APPLICATION_DECLARATION_KIND, {
      ...current,
      [rowsKey]: [...existing, ...picked.map((p) => ({ fileName: p.fileName, file: p.file }))],
    })
    onChanged()
  }

  // Earlier saves stored the choice per field (e.g. statutoryPermissions: "Yes"); they stay the default.
  const legacy = (key: string, fallback: YesNo): YesNo => yesNoOf(payload?.[key]) ?? fallback
  const option2 = rowToBisApplicationDetailsForm(projectRow).applicationProcess === 'simplified'

  const components: StepComponent[] = [
    {
      key: 'statutoryPermissions',
      label: 'Statutory Permissions for the Product Category',
      printKind: UPLOAD_ROW_KIND,
      selectable: false,
      defaultApplicable: 'No',
      actions: () => (
        <FileAttachButton
          projectId={projectId}
          docKind="application-declaration"
          label="Statutory Permissions"
          file={statutoryFile ? declarationFileToProjectFile(statutoryFile) : null}
          onChange={async (file) => {
            await patchDeclaration(projectId, { statutoryPermissionFile: file ? declarationFileFromProjectFile(file) : null })
            onChanged()
          }}
        />
      ),
    },
    supportingComponent('otherInformation', 'Other Information', otherInformationRows),
    supportingComponent('otherRequest', 'Other Request for Consideration', otherRequestRows),
    {
      key: 'authorizationLetter',
      label: 'Authorization Letter of Person Submitting the Application',
      printKind: 'authorization-letter',
      defaultApplicable: legacy('authorizationLetter', 'Yes'),
      onEdit: () => setAuthOpen(true),
    },
    {
      key: 'undertakingOption2',
      label: 'Undertaking for Option 2',
      printKind: 'undertaking-option-2',
      editKind: 'undertaking-option-2',
      // Step 1 → Application Process: Option 2 (simplified procedure) needs this undertaking.
      defaultApplicable: legacy('undertakingOption2', option2 ? 'Yes' : 'No'),
    },
    {
      key: 'undertakingGeneral',
      label: 'Undertaking for General',
      printKind: 'undertaking-general',
      defaultApplicable: legacy('undertakingGeneral', 'Yes'),
      onEdit: () => setUndertaking('undertaking-general'),
    },
    {
      key: 'undertakingIndianStandards',
      label: 'Undertaking as per Indian Standards',
      printKind: 'undertaking-indian-standards',
      defaultApplicable: legacy('undertakingIndianStandards', 'No'),
      onEdit: () => setUndertaking('undertaking-indian-standards'),
    },
    {
      key: 'undertakingOther',
      label: 'Undertaking Other if Required',
      printKind: 'undertaking-other',
      defaultApplicable: 'No',
      onEdit: () => setUndertaking('undertaking-other'),
    },
  ]

  return (
    <>
      <div className="manak-kv mb-3 overflow-x-auto border border-stone-300 bg-white">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <tbody>
            <tr>
              <th className={labelCls}>
                Name of Person Submitting the Application <span className="text-red-600">*</span>
              </th>
              <td className={tdCls}>
                <Input
                  aria-label="Name of Person Submitting the Application"
                  className={controlCls}
                  value={shownName}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => name !== null && void saveSubmitter({ submitterName: name.trim() })}
                />
              </td>
              <th className={labelCls}>
                Designation <span className="text-red-600">*</span>
              </th>
              <td className={tdCls}>
                <Input
                  aria-label="Designation"
                  className={controlCls}
                  value={shownDesignation}
                  onChange={(e) => setDesignation(e.target.value)}
                  onBlur={() => designation !== null && void saveSubmitter({ submitterDesignation: designation.trim() })}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ManakComponentsTable
        title="Declaration and Undertaking"
        componentHeading="Document Name"
        componentsKind={APPLICATION_DECLARATION_KIND}
        components={components}
        projectId={projectId}
        projectRow={projectRow}
        payloads={{ [APPLICATION_DECLARATION_KIND]: payload }}
        onChanged={onChanged}
        onEdit={onEdit}
        renderDocActions={renderDocActions}
        selection={selection}
        after={
          <div className="overflow-x-auto border border-stone-300 bg-white">
            <table className="wo-table w-full border-collapse text-sm">
              <tbody>
                <tr>
                  <th className={labelCls}>
                    Weekly Offs <span className="text-red-600">*</span>
                  </th>
                  <td className={cn('w-[1%]', tdCls)}>
                    <Select
                      value={weeklyOffs}
                      onValueChange={(v) => void saveWeekly({ weeklyOffs: v as YesNo, offDays: v === 'Yes' ? (offDays.length ? offDays : ['Sunday']) : [] })}
                    >
                      <SelectTrigger className="h-8 w-24 rounded-none border-stone-300 bg-white text-sm" aria-label="Weekly Offs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Yes">Yes</SelectItem>
                        <SelectItem value="No">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className={tdCls}>
                    {weeklyOffs === 'Yes' ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline" aria-label="Off Days" className="h-8 min-w-48 justify-between gap-4 rounded-none border-stone-300 bg-white text-sm font-normal">
                            <span className="truncate">{offDays.join(', ') || 'Select Off Days'}</span>
                            <ChevronDown size={14} className="shrink-0" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="min-w-48 rounded-none">
                          {DAYS.map((day) => (
                            <DropdownMenuCheckboxItem
                              key={day}
                              className="gap-4 rounded-none pl-2 [&>span:first-child]:hidden"
                              checked={offDays.includes(day)}
                              onSelect={(e) => e.preventDefault()}
                              onCheckedChange={(checked) => {
                                const next = DAYS.filter((d) => (d === day ? checked === true : offDays.includes(d)))
                                if (next.length === 0) {
                                  toast.error('Select at least one weekly off day, or choose No.')
                                  return
                                }
                                void saveWeekly({ weeklyOffs: 'Yes', offDays: next })
                              }}
                            >
                              {day}
                              {offDays.includes(day) ? <Check size={14} className="ml-auto" aria-hidden /> : null}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span className="inline-flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800">
                        <CalendarCheck size={15} className="shrink-0 text-emerald-600" aria-hidden />
                        The firm works on all days of the week.
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        }
      />

      <AuthorizationLetterDialog
        projectRow={projectRow}
        legacyFile={fileRef(payload?.authorizationFile)}
        open={authOpen}
        onOpenChange={setAuthOpen}
        onManagementChanged={onManagementChanged}
        onSaved={(person) => {
          // The person authorized in the letter is the one submitting the application.
          setName(null)
          setDesignation(null)
          void saveSubmitter({ submitterName: person.name, submitterDesignation: person.designation })
        }}
      />
      {undertaking ? (
        <UndertakingEditorDialog
          key={`${projectId}-${undertaking}`}
          row={projectRow}
          kind={undertaking}
          open
          onOpenChange={(open) => {
            if (!open) {
              setUndertaking(null)
              onChanged()
            }
          }}
        />
      ) : null}
      {aiFor ? (
        <AiFilePickerDialog
          open
          onOpenChange={(open) => !open && setAiFor(null)}
          projectRow={projectRow}
          title={aiFor === 'otherInformation' ? 'Other Information' : 'Other Request for Consideration'}
          onAdd={(picked) => addPicked(aiFor, picked)}
        />
      ) : null}
    </>
  )
}
