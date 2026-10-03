import { FolderOpen, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'
import { buildIsCodeAssistantContext, formatIsCodeLabel } from './buildIsCodeAssistantContext'
import type { IsCodeRow } from './types'

const GRID_TABLE =
  'w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function IsCodesTable({
  rows,
  loading,
  error,
  searchActive,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onViewFiles,
  onAssistantDataChanged,
}: {
  rows: IsCodeRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: () => void
  onEdit: (row: IsCodeRow) => void
  onViewFiles: (row: IsCodeRow) => void
  onAssistantDataChanged?: () => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className="overflow-hidden overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
      {error ? <p className="px-5 pt-4 text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="m-4 rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {searchActive ? 'No IS codes match your search.' : 'No IS codes added yet.'}
          </p>
          {!searchActive ? (
            <p className="mt-1 text-xs text-muted-foreground">Use &quot;Add New IS Code&quot; to create your first record.</p>
          ) : null}
        </div>
      ) : (
        <Table className={GRID_TABLE}>
          <TableHeader>
            <TableRow className="bg-stone-800 hover:bg-stone-800">
              <TableHead className="w-14 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                <input
                  type="checkbox"
                  className={checkboxClass}
                  aria-label="Select all"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = !allChecked && someChecked
                  }}
                  onChange={onToggleAll}
                />
              </TableHead>
              <TableHead className="text-left text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">IS Details</TableHead>
              <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">IS Title</TableHead>
              <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">Reaffirmation / Amendment</TableHead>
              <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">Aspect &amp; Charges</TableHead>
              <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const checked = selectedIds.has(r.id)
              return (
                <TableRow key={r.id} data-state={checked ? 'selected' : undefined}>
                  <TableCell className="text-center align-middle">
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      aria-label={`Select ${r.is_number}`}
                      checked={checked}
                      onChange={() => onToggle(r.id)}
                    />
                  </TableCell>

                  <TableCell className="align-middle text-left">
                    <div className="min-w-[120px] space-y-0.5">
                      <p className="font-medium text-foreground">{formatIsCodeLabel(r)}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => onViewFiles(r)}
                        aria-label={`View files for ${r.is_number}`}
                      >
                        View Files
                        <FolderOpen size={12} />
                      </Button>
                    </div>
                  </TableCell>

                  <TableCell className="align-middle text-center">
                    <p className="font-medium text-foreground">{r.title}</p>
                  </TableCell>

                  <TableCell className="align-middle text-center">
                    <div className="space-y-0.5">
                      <p className="text-sm text-foreground">
                        {r.reaffirmation_year
                          ? r.reaffirmation_year.replace(/^RA(?=\d)/i, 'RA ')
                          : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground">Amendment: {r.amendment_number || '—'}</p>
                    </div>
                  </TableCell>

                  <TableCell className="align-middle text-center">
                    <div className="space-y-0.5">
                      <p className="text-sm text-foreground">{r.aspect}</p>
                      <p className="text-xs text-muted-foreground">
                        Rs {Number(r.testing_charges ?? 0).toFixed(2)}
                      </p>
                    </div>
                  </TableCell>

                  <TableCell className="align-middle text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(r)} aria-label="Edit">
                        <Pencil size={16} />
                      </Button>
                      <QiAssistant
                        page="is-codes"
                        pageTitle={formatIsCodeLabel(r)}
                        contextSummary={buildIsCodeAssistantContext(r)}
                        isCodeId={r.id}
                        triggerVariant="icon"
                        welcomeMessage={`I'm your **IS Code Assistant** for **${formatIsCodeLabel(r)}** — *${r.title}* (id: \`${r.id}\`). I can answer from uploaded PDFs and **update this IS** (e.g. change title) when you ask.`}
                        suggestedQuestions={[
                          'Summarize the scope of this standard',
                          'What are the main testing requirements?',
                          'Change the title of this IS code to Steel maap',
                          'List key clauses from the uploaded PDF',
                        ]}
                        onDataChanged={onAssistantDataChanged}
                        enablePdfImport={false}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
