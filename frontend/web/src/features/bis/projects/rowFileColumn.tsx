import type { ReactNode } from 'react'
import type { BisPrintDocumentKind } from '../print/printBisDocument'
import type { BisProjectViewFile } from './bisProjectFilesApi'
import { fetchBisModulePayload, saveBisModulePayload } from './bisModuleDataApi'
import { FileAttachButton } from './RowFileAttachment'

type Rec = Record<string, unknown>

/** A file attached to a table row, stored on the row as { id, file_name, storage_path }. */
export function rowFile(value: unknown): BisProjectViewFile | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Rec
  const id = typeof v.id === 'string' ? v.id : ''
  const file_name = typeof v.file_name === 'string' ? v.file_name : ''
  const storage_path = typeof v.storage_path === 'string' ? v.storage_path : ''
  return id && storage_path ? { id, file_name, storage_path } : null
}

/**
 * EditableRows column holding one PDF per row. On the input row the file rides on the draft (saved with "+");
 * on saved rows it is written to the stored payload straight away.
 */
export function fileColumn({
  projectId,
  kind,
  rowsKey = 'rows',
  key,
  label,
  docKind,
  onChanged,
}: {
  projectId: string
  kind: BisPrintDocumentKind
  rowsKey?: string
  key: string
  label: string
  docKind: string
  onChanged: () => void
}): {
  label: string
  compact: boolean
  render: (row: Rec, index: number) => ReactNode
  renderDraft: (draft: Rec, patchDraft: (patch: Rec) => void) => ReactNode
} {
  return {
    label,
    compact: true,
    renderDraft: (draft, patchDraft) => (
      <FileAttachButton
        projectId={projectId}
        docKind={docKind}
        label={label}
        file={rowFile(draft[key])}
        onChange={(file) => patchDraft({ [key]: file })}
      />
    ),
    render: (row, index) => (
      <FileAttachButton
        projectId={projectId}
        docKind={docKind}
        label={label}
        file={rowFile(row[key])}
        onChange={async (file) => {
          const current = (await fetchBisModulePayload(projectId, kind)) ?? {}
          const list = Array.isArray(current[rowsKey]) ? [...(current[rowsKey] as Rec[])] : []
          if (!list[index]) return
          list[index] = { ...list[index], [key]: file }
          await saveBisModulePayload(projectId, kind, { ...current, [rowsKey]: list })
          onChanged()
        }}
      />
    ),
  }
}
