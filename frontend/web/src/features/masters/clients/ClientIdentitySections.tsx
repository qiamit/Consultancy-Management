import { useEffect, useRef, useState } from 'react'
import { Calendar, Eye, Plus, Trash2, Upload } from 'lucide-react'
import { LimsFieldAddButton, LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { FilterCombobox } from '@/features/sample-handling/receiving/FilterCombobox'
import { limsFieldAddBtnClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { isValidGstin as isValidGst, isValidPan } from '@/lib/indiaValidators'
import { ClientManageDialogContent } from './ClientManageDialogContent'
import type { ClientCertificateFile, ClientCertificateInput } from './clientsApi'

type DraftDocument = {
  key: string
  name: string
  title: string
  issuedOn: string
  documentNumber: string
}

const documentIconBtnClass =
  'inline-flex !h-8 !w-8 shrink-0 items-center justify-center rounded-none border-stone-500 bg-stone-50 p-0 text-amber-900 hover:bg-amber-100 hover:text-amber-950'

const issueDateInputClass =
  'min-w-0 border-0 bg-transparent pr-1 tabular-nums shadow-none focus-visible:ring-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:h-0 [&::-webkit-calendar-picker-indicator]:w-0 [&::-webkit-calendar-picker-indicator]:opacity-0'

function openIssueDatePicker(id: string) {
  const el = document.getElementById(id)
  if (!(el instanceof HTMLInputElement) || el.disabled) return
  try {
    if (typeof el.showPicker === 'function') {
      el.showPicker()
      return
    }
  } catch {
    // The browser blocks showPicker outside a user gesture.
  }
  el.focus()
}

const DOCUMENT_NAME_CATEGORY = 'document_name'

type NameOption = { id: string; label: string }

function sortDocumentNames(rows: NameOption[]): NameOption[] {
  const uniq = new Map<string, NameOption>()
  for (const item of rows) {
    const key = item.label.trim().toLowerCase()
    if (key) uniq.set(key, item)
  }
  return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
}

function todayIsoDate() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function blankDraft(): DraftDocument {
  return { key: crypto.randomUUID(), name: '', title: '', issuedOn: todayIsoDate(), documentNumber: '' }
}

function isGstCertificate(name: string) {
  return name.trim().toLowerCase() === 'gst certificate'
}

function isPanCard(name: string) {
  return /^pan(\s*card)?$/i.test(name.trim())
}

export function ClientIdentitySections({
  certificates,
  gstNumber,
  onGstNumberChange,
  pan = '',
  onPanChange,
  onUploadCertificate,
  onUpdateCertificate,
  onDeleteCertificate,
  onOpenCertificate,
}: {
  certificates: ClientCertificateFile[]
  gstNumber: string
  onGstNumberChange: (value: string) => void
  /** PAN is edited on the "PAN" document row. */
  pan?: string
  onPanChange?: (value: string) => void
  onUploadCertificate: (input: ClientCertificateInput) => Promise<void>
  onUpdateCertificate: (row: ClientCertificateFile, input: Pick<ClientCertificateInput, 'certName' | 'documentNumber' | 'issuedOn' | 'docTitle'>) => Promise<void>
  onDeleteCertificate: (row: ClientCertificateFile) => void
  onOpenCertificate: (row: ClientCertificateFile) => void
}) {
  const [drafts, setDrafts] = useState<DraftDocument[]>([blankDraft()])
  const [selected, setSelected] = useState<string[]>([])
  const [savedEdits, setSavedEdits] = useState<Record<string, { name?: string; title?: string; documentNumber?: string }>>({})
  const [documentNames, setDocumentNames] = useState<NameOption[]>([])
  const [openNameKey, setOpenNameKey] = useState<string | null>(null)
  const [nameDialogOpen, setNameDialogOpen] = useState(false)
  const [nameDialogRowKey, setNameDialogRowKey] = useState<string | null>(null)
  const [newDocumentName, setNewDocumentName] = useState('')
  const typedNameRef = useRef<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('client_master_options')
      .select('id, label')
      .eq('category', DOCUMENT_NAME_CATEGORY)
      .order('label', { ascending: true })
      .then(({ data }) => {
        if (cancelled || !Array.isArray(data)) return
        setDocumentNames(sortDocumentNames(data as NameOption[]))
      })
    return () => {
      cancelled = true
    }
  }, [])
  const rows = [
    ...certificates.map((row) => ({ kind: 'saved' as const, key: row.id, row })),
    ...drafts.map((draft) => ({ kind: 'draft' as const, key: draft.key, draft })),
  ]
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.key))

  const toggle = (key: string) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]))
  }

  const addDraft = () => setDrafts((prev) => [...prev, blankDraft()])

  const removeDraft = (key: string) => {
    setDrafts((prev) => {
      const next = prev.filter((draft) => draft.key !== key)
      return next.length > 0 ? next : [blankDraft()]
    })
    setSelected((prev) => prev.filter((item) => item !== key))
  }

  const patchDraft = (key: string, patch: Partial<DraftDocument>) => {
    setDrafts((prev) => prev.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)))
  }

  const applyDocumentName = (key: string, label: string) => {
    const saved = certificates.find((row) => row.id === key)
    const currentNumber = saved
      ? (savedEdits[saved.id]?.documentNumber ?? saved.document_number)
      : (drafts.find((draft) => draft.key === key)?.documentNumber ?? '')
    const linked = isGstCertificate(label)
    if (isPanCard(label) && onPanChange && !pan.trim() && currentNumber.trim()) onPanChange(currentNumber.toUpperCase().replace(/\s/g, '').slice(0, 10))
    if (linked && !gstNumber.trim() && currentNumber.trim()) onGstNumberChange(currentNumber)
    const documentNumber = linked && gstNumber.trim() ? gstNumber : currentNumber
    if (!saved) {
      patchDraft(key, { name: label, ...(linked ? { documentNumber } : {}) })
      return
    }
    setSavedEdits((prev) => ({ ...prev, [saved.id]: { ...prev[saved.id], name: label, ...(linked ? { documentNumber } : {}) } }))
    if (label.trim() === saved.cert_name && (!linked || documentNumber === saved.document_number)) return
    void onUpdateCertificate(saved, { certName: label, documentNumber, issuedOn: saved.issued_on }).then(() => {
      setSavedEdits((prev) => {
        const copy = { ...prev }
        delete copy[saved.id]
        return copy
      })
    })
  }

  const rememberDocumentName = async (label: string, id?: string, close = true) => {
    const name = label.trim()
    if (!name) return
    if (id) {
      const { error } = await supabase.from('client_master_options').update({ label: name, value: name }).eq('id', id)
      if (error) return
      setDocumentNames((prev) => sortDocumentNames(prev.map((item) => (item.id === id ? { ...item, label: name } : item))))
    } else {
      const { data, error } = await supabase
        .from('client_master_options')
        .insert({ category: DOCUMENT_NAME_CATEGORY, label: name, value: name })
        .select('id')
        .single()
      if (error) return
      const nextId = (data as { id: string } | null)?.id ?? `tmp-${name}`
      setDocumentNames((prev) => sortDocumentNames([...prev, { id: nextId, label: name }]))
    }
    if (nameDialogRowKey) applyDocumentName(nameDialogRowKey, name)
    setNewDocumentName('')
    if (close) setNameDialogOpen(false)
  }

  const uploadFile = (input: ClientCertificateInput, draftKey?: string) => {
    void onUploadCertificate(input).then(() => {
      if (!draftKey) return
      setDrafts((prev) => {
        const next = prev.filter((draft) => draft.key !== draftKey)
        return next.length > 0 ? next : [blankDraft()]
      })
    }).catch(() => undefined)
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-800">Legal Documents</h2>
        <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
        <div className="w-full min-w-0">
          <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-600 xl:hidden">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={allSelected}
              aria-label="Select all documents"
              onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.key))}
            />
            Select all
          </label>
          <div className="hidden grid-cols-[2.5rem_minmax(0,1.2fr)_minmax(0,1.2fr)_11rem_minmax(0,1fr)_7.25rem_5rem] bg-stone-800 text-center text-[11px] font-bold uppercase leading-tight tracking-wide text-amber-200 xl:grid">
            <div className="flex items-center justify-center border border-stone-700 px-1 py-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={allSelected}
                aria-label="Select all documents"
                onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.key))}
              />
            </div>
            <div className="border border-stone-700 px-1.5 py-2">Type of Document</div>
            <div className="border border-stone-700 px-1.5 py-2">Name of the Document</div>
            <div className="border border-stone-700 px-1.5 py-2">Date of Issue</div>
            <div className="border border-stone-700 px-1.5 py-2">Documents Number</div>
            <div className="border border-stone-700 px-1 py-2">Documents</div>
            <div className="border border-stone-700 px-1 py-2">Action</div>
          </div>
          <div className="space-y-2 xl:space-y-0">
              {rows.map((entry) => {
                const saved = entry.kind === 'saved' ? entry.row : null
                const draft = entry.kind === 'draft' ? entry.draft : null
                const name = saved ? (savedEdits[saved.id]?.name ?? saved.cert_name) : (draft?.name ?? '')
                const issuedOn = saved?.issued_on ?? draft?.issuedOn ?? ''
                const ownDocumentNumber = saved ? (savedEdits[saved.id]?.documentNumber ?? saved.document_number) : (draft?.documentNumber ?? '')
                const title = saved ? (savedEdits[saved.id]?.title ?? saved.doc_title) : (draft?.title ?? '')
                const linkedGst = isGstCertificate(name)
                const linkedPan = isPanCard(name) && Boolean(onPanChange)
                const documentNumber = linkedGst ? gstNumber : linkedPan ? pan : ownDocumentNumber
                const numberInvalid =
                  documentNumber.trim().length > 0 &&
                  ((linkedGst && !isValidGst(documentNumber)) || (linkedPan && !isValidPan(documentNumber)))
                const hasFile = Boolean(saved?.storage_path)
                return (
                  <div key={entry.key} className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2 border border-stone-300 bg-white p-2 xl:grid-cols-[2.5rem_minmax(0,1.2fr)_minmax(0,1.2fr)_11rem_minmax(0,1fr)_7.25rem_5rem] xl:gap-0 xl:border-0 xl:p-0">
                    <div className="flex items-center justify-center xl:h-full xl:border xl:border-stone-300">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selected.includes(entry.key)}
                        aria-label={`Select ${name || 'document'}`}
                        onChange={() => toggle(entry.key)}
                      />
                    </div>
                    <div className="min-w-0 xl:border xl:border-stone-300 xl:px-1.5 xl:py-1.5">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500 xl:hidden">Type of Document</p>
                      <LimsFieldWithAdd
                        addButton={
                          <DialogTrigger asChild>
                            <LimsFieldAddButton
                              aria-label="Add document type"
                              title="Add document type"
                              onClick={() => {
                                setNameDialogRowKey(entry.key)
                                setNewDocumentName(name)
                              }}
                            />
                          </DialogTrigger>
                        }
                      >
                        <FilterCombobox
                          value={name}
                          onValueChange={(next) => {
                            typedNameRef.current[entry.key] = next
                            const linked = isGstCertificate(next)
                            if (draft) patchDraft(draft.key, { name: next, ...(linked ? { documentNumber: gstNumber } : {}) })
                            if (saved) setSavedEdits((prev) => ({ ...prev, [saved.id]: { ...prev[saved.id], name: next, ...(linked ? { documentNumber: gstNumber } : {}) } }))
                          }}
                          options={documentNames
                            .filter((item) => {
                              const query = name.trim().toLowerCase()
                              return !query || item.label.toLowerCase().includes(query)
                            })
                            .map((item) => ({ id: item.id, label: item.label }))}
                          onSelectOption={(option) => applyDocumentName(entry.key, option.label)}
                          open={openNameKey === entry.key}
                          onOpenChange={(open) => {
                            setOpenNameKey(open ? entry.key : null)
                            if (open || !saved) return
                            const next = (typedNameRef.current[entry.key] ?? saved.cert_name).trim()
                            if (!next || next === saved.cert_name) return
                            void onUpdateCertificate(saved, { certName: next, documentNumber, issuedOn }).then(() => {
                              setSavedEdits((prev) => {
                                const copy = { ...prev }
                                delete copy[saved.id]
                                return copy
                              })
                            })
                          }}
                          placeholder="Type of Document"
                          showSerialNumbers={false}
                          listId={`document-name-${entry.key}`}
                          inputId={`document-name-${entry.key}`}
                          inputClassName="h-8 border-0 bg-transparent px-3 shadow-none focus-visible:ring-0"
                        />
                      </LimsFieldWithAdd>
                    </div>
                    <div className="col-span-2 min-w-0 xl:col-span-1 xl:border xl:border-stone-300 xl:px-1.5 xl:py-1.5">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500 xl:hidden">Name of the Document</p>
                      <Input
                        value={title}
                        aria-label="Name of the Document"
                        placeholder="Name of the Document"
                        onChange={(event) => {
                          const next = event.target.value
                          if (draft) patchDraft(draft.key, { title: next })
                          if (saved) setSavedEdits((prev) => ({ ...prev, [saved.id]: { ...prev[saved.id], title: next } }))
                        }}
                        onBlur={(event) => {
                          if (!saved) return
                          const next = event.target.value
                          if (next === saved.doc_title) return
                          void onUpdateCertificate(saved, { certName: name, documentNumber, issuedOn, docTitle: next }).then(() => {
                            setSavedEdits((prev) => {
                              const copy = { ...prev }
                              delete copy[saved.id]
                              return copy
                            })
                          })
                        }}
                      />
                    </div>
                    <div className="col-span-2 min-w-0 xl:col-span-1 xl:border xl:border-stone-300 xl:px-1.5 xl:py-1.5">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500 xl:hidden">Date of Issue</p>
                      <LimsFieldWithAdd
                        addButton={
                          <button
                            type="button"
                            className={limsFieldAddBtnClass}
                            aria-label="Open calendar"
                            title="Pick date"
                            onClick={() => openIssueDatePicker(`document-issued-${entry.key}`)}
                          >
                            <Calendar size={14} strokeWidth={2.25} aria-hidden />
                          </button>
                        }
                      >
                        <Input
                          id={`document-issued-${entry.key}`}
                          type="date"
                          value={issuedOn}
                          aria-label="Date of Issue"
                          className={issueDateInputClass}
                          onChange={(event) => {
                            const next = event.target.value
                            if (draft) patchDraft(draft.key, { issuedOn: next })
                            if (saved) void onUpdateCertificate(saved, { certName: name, documentNumber, issuedOn: next })
                          }}
                        />
                      </LimsFieldWithAdd>
                    </div>
                    <div className="col-span-2 min-w-0 xl:col-span-1 xl:border xl:border-stone-300 xl:px-1.5 xl:py-1.5">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500 xl:hidden">Documents Number</p>
                      <Input
                        value={documentNumber}
                        aria-label="Documents Number"
                        placeholder="Documents Number"
                        maxLength={linkedGst ? 15 : linkedPan ? 10 : undefined}
                        aria-invalid={numberInvalid}
                        className={numberInvalid ? '!border-red-600 !bg-red-50' : undefined}
                        onChange={(event) => {
                          if (linkedPan && onPanChange) {
                            const next = event.target.value.toUpperCase().replace(/\s/g, '').slice(0, 10)
                            onPanChange(next)
                            if (draft) patchDraft(draft.key, { documentNumber: next })
                            if (saved) setSavedEdits((prev) => ({ ...prev, [saved.id]: { ...prev[saved.id], documentNumber: next } }))
                            return
                          }
                          if (linkedGst) {
                            const next = event.target.value.toUpperCase().replace(/\s/g, '').slice(0, 15)
                            onGstNumberChange(next)
                            if (draft) patchDraft(draft.key, { documentNumber: next })
                            if (saved) setSavedEdits((prev) => ({ ...prev, [saved.id]: { ...prev[saved.id], documentNumber: next } }))
                            return
                          }
                          const next = event.target.value
                          if (draft) patchDraft(draft.key, { documentNumber: next })
                          if (saved) setSavedEdits((prev) => ({ ...prev, [saved.id]: { ...prev[saved.id], documentNumber: next } }))
                        }}
                        onBlur={(event) => {
                          if (!saved) return
                          const next = linkedGst ? gstNumber : linkedPan ? pan : event.target.value
                          if (next === saved.document_number) return
                          void onUpdateCertificate(saved, { certName: name, documentNumber: next, issuedOn }).then(() => {
                            setSavedEdits((prev) => {
                              const copy = { ...prev }
                              delete copy[saved.id]
                              return copy
                            })
                          })
                        }}
                      />
                      {numberInvalid ? (
                        <p className="mt-0.5 text-[11px] text-red-700">
                          {linkedGst ? 'Invalid GST number' : 'Invalid PAN'}
                        </p>
                      ) : null}
                    </div>
                    <div className="col-span-2 grid grid-cols-2 gap-3 xl:contents">
                    <div className="min-w-0 xl:border xl:border-stone-300 xl:px-0.5 xl:py-1.5">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500 xl:hidden">Documents</p>
                      <div className="flex w-full items-center justify-start gap-1 xl:justify-center xl:gap-0.5">
                        <input
                          id={`document-file-${entry.key}`}
                          type="file"
                          accept="application/pdf,image/jpeg,image/png,image/webp"
                          className="sr-only"
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            event.target.value = ''
                            if (!file || !name.trim()) return
                            uploadFile(
                              { certName: name, documentNumber, issuedOn, docTitle: title, file, existing: saved ?? undefined },
                              draft?.key,
                            )
                          }}
                        />
                        <Button type="button" variant="outline" className={documentIconBtnClass} title="Upload" aria-label="Upload document" disabled={!name.trim()} onClick={() => document.getElementById(`document-file-${entry.key}`)?.click()}>
                          <Upload size={15} aria-hidden />
                        </Button>
                        <Button type="button" variant="outline" className={documentIconBtnClass} title="View" aria-label="View document" disabled={!hasFile || !saved} onClick={() => saved && onOpenCertificate(saved)}>
                          <Eye size={15} aria-hidden />
                        </Button>
                        <Button type="button" variant="outline" className={documentIconBtnClass} title="Delete" aria-label="Delete document" disabled={!hasFile || !saved} onClick={() => saved && onDeleteCertificate(saved)}>
                          <Trash2 size={15} aria-hidden />
                        </Button>
                      </div>
                    </div>
                    <div className="min-w-0 xl:border xl:border-stone-300 xl:px-0.5 xl:py-1.5">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500 xl:hidden">Action</p>
                      <div className="flex w-full items-center justify-start gap-1 xl:justify-center xl:gap-0.5">
                        <Button type="button" variant="outline" className={documentIconBtnClass} title="Add row" aria-label="Add document row" onClick={addDraft}>
                          <Plus size={15} aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className={`${documentIconBtnClass} text-red-700 hover:bg-red-50 hover:text-red-800`}
                          title="Delete"
                          aria-label="Delete row"
                          onClick={() => {
                            if (saved) onDeleteCertificate(saved)
                            else if (draft) removeDraft(draft.key)
                          }}
                        >
                          <Trash2 size={15} aria-hidden />
                        </Button>
                      </div>
                    </div>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
        <ClientManageDialogContent
          open={nameDialogOpen}
          title="Manage Document Names"
          addLabel="Add Document Name"
          inputId="new-document-name"
          placeholder="e.g., GST Certificate"
          value={newDocumentName}
          onValueChange={setNewDocumentName}
          inlineAdd
          onInlineAdd={() => void rememberDocumentName(newDocumentName, undefined, false)}
          onSave={() => void rememberDocumentName(newDocumentName)}
          onUpdate={(id) => void rememberDocumentName(newDocumentName, id)}
          saveDisabled={!newDocumentName.trim()}
          items={documentNames}
          canDelete={() => true}
          onDelete={(id) => {
            void supabase.from('client_master_options').delete().eq('id', id).then(({ error }) => {
              if (error) return
              setDocumentNames((prev) => prev.filter((item) => item.id !== id))
            })
          }}
        />
        </Dialog>
      </section>
    </div>
  )
}
