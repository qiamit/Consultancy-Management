import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsDialogSidebarOverlayClass,
  limsDialogSidebarPortalClass,
  limsOutlineBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { ClientRow } from './types'

function formatError(err: unknown): string {
  if (!err) return 'Unknown error'
  if (typeof err === 'string') return err
  const anyErr = err as { message?: string; details?: string; hint?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

function display(value: string | number | null | undefined): string {
  if (value == null) return '—'
  const text = String(value).trim()
  return text.length > 0 ? text : '—'
}

function DetailCard({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'min-w-0 border border-stone-400 bg-white px-3 py-2.5 shadow-sm ring-1 ring-amber-700/10',
        className,
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold leading-snug text-[#1c1917]">{value}</p>
    </div>
  )
}

/**
 * Read-only Client details view, centered in the main content area (sidebar stays visible).
 */
export function ClientDetailsDialog({
  open,
  onOpenChange,
  clientId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string | null
  /** Kept for callers; view dialog does not save. */
  onSaved?: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [row, setRow] = useState<ClientRow | null>(null)

  useEffect(() => {
    if (!open || !clientId) {
      setRow(null)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('clients')
          .select('*')
          .eq('id', clientId)
          .maybeSingle()
        if (cancelled) return
        if (fetchError) throw fetchError
        if (!data) {
          setError('Client not found.')
          setRow(null)
          return
        }
        setRow(data as ClientRow)
      } catch (err) {
        if (!cancelled) {
          setError(formatError(err))
          setRow(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, clientId])

  const title = row?.company_name?.trim() || 'Client Details'
  const mobile =
    row == null
      ? '—'
      : [row.country_code, row.mobile].map((p) => (p ?? '').trim()).filter(Boolean).join(' ') || '—'
  const openingBalance =
    row == null
      ? '—'
      : `${display(row.opening_balance)} ${display(row.balance_type)}`.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          limsDialogClass,
          'max-w-[51.2rem] bg-white',
          'w-[min(51.2rem,calc(100vw-1.5rem))]',
        )}
        aria-describedby={undefined}
        persistOnFocusLoss
        overlayClassName={limsDialogSidebarOverlayClass}
        portalClassName={limsDialogSidebarPortalClass}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="truncate text-base font-semibold tracking-tight text-white sm:text-lg">
              {title}
            </DialogTitle>
            <p className="mt-0.5 text-xs text-stone-300">Client details (view only)</p>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-3 py-3 sm:px-5 sm:py-4 md:px-6 md:py-5">
          {loading ? <p className="text-sm text-stone-600">Loading client details…</p> : null}
          {error ? (
            <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {!loading && !error && row ? (
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-900">
                Client details
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <DetailCard label="GST Number" value={display(row.gst_number)} />
                <DetailCard label="Company Type" value={display(row.company_type)} />
                <DetailCard label="Company Scale" value={display(row.company_scale)} />
                <DetailCard label="Name of the Company" value={display(row.company_name)} className="sm:col-span-2" />
                <DetailCard label="Email ID" value={display(row.email)} />
                <DetailCard label="Address of the Company" value={display(row.address)} className="sm:col-span-3" />
                <DetailCard label="PIN Code" value={display(row.pin_code)} />
                <DetailCard label="District" value={display(row.district)} />
                <DetailCard label="State" value={display(row.state)} />
                <DetailCard label="Country" value={display(row.country)} />
                <DetailCard label="Contact Person" value={display(row.contact_person_name)} />
                <DetailCard label="Mobile Number" value={mobile} />
                <DetailCard label="Opening Balance" value={openingBalance} />
                <DetailCard label="Payment Term" value={display(row.payment_term)} />
                <DetailCard label="Remark" value={display(row.remark)} className="sm:col-span-2" />
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end sm:px-5">
          <Button
            type="button"
            variant="outline"
            className={limsOutlineBtnClass}
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
