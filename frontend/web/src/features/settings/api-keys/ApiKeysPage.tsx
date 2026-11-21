import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, KeyRound, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useConfirmDialog } from '@/components/ui/useConfirmDialog'
import {
  limsDarkBarAccentClass,
  limsDarkBarBtnClass,
  limsDarkBarClass,
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsPageShellClass,
  limsPanelClass,
  limsTableBodyToneClass,
  limsTableClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { createApiKey, fetchApiKeys, libraryApiBase, revokeApiKey, type LibraryApiKey } from './apiKeysApi'

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      className="h-8 rounded-none"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true)
          window.setTimeout(() => setDone(false), 1500)
        })
      }}
    >
      {done ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      {done ? 'Copied' : label}
    </Button>
  )
}

/**
 * Settings → API Keys (admin only): keys for the Library API that the owner's own apps (qirlpl.com) call. A key is
 * shown once when it is made; only its hash is kept. Revoking stops it at once.
 */
export default function ApiKeysPage() {
  const [keys, setKeys] = useState<LibraryApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [newKey, setNewKey] = useState<{ name: string; apiKey: string } | null>(null)
  const [confirm, confirmDialog] = useConfirmDialog()

  const [reloadKey, setReloadKey] = useState(0)

  // loading is switched on by load(); the first load starts with loading = true.
  useEffect(() => {
    let cancelled = false
    fetchApiKeys()
      .then((rows) => {
        if (cancelled) return
        setKeys(rows)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could Not Load the API Keys.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const load = useCallback(() => {
    setLoading(true)
    setReloadKey((k) => k + 1)
  }, [])

  const create = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give the Key a Name, e.g. "qirlpl.com".')
      return
    }
    setBusy(true)
    try {
      const made = await createApiKey(trimmed)
      setNewKey({ name: trimmed, apiKey: made.apiKey })
      setName('')
      setError(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The Key Could Not Be Made.')
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (key: LibraryApiKey) => {
    const ok = await confirm(`Revoke "${key.name}" (${key.key_prefix}…)? Apps using it stop working at once. This cannot be undone.`, {
      title: 'Revoke API Key',
      confirmLabel: 'Revoke',
    })
    if (!ok) return
    try {
      await revokeApiKey(key.id)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The Key Could Not Be Revoked.')
    }
  }

  const base = libraryApiBase()
  const example = `curl -X POST ${base}/search \\
  -H "X-API-Key: qelib_..." -H "Content-Type: application/json" \\
  -d '{"query": "Fe 500D elongation TS/YS ratio", "folders": ["IS 1786"]}'`

  return (
    <div className={limsPageShellClass}>
      <div className={cn(limsPanelClass, limsDarkBarClass, 'px-3 py-3 sm:px-4')}>
        <div className="pointer-events-none absolute inset-0 opacity-90" style={limsDarkBarGlowStyle} />
        <div className={limsDarkBarAccentClass} />
        <div className="relative flex flex-wrap items-center gap-2">
          <KeyRound className="h-5 w-5 text-amber-300" aria-hidden />
          <h1 className="mr-auto text-base font-semibold tracking-wide">API Keys</h1>
          <input
            aria-label="Key Name"
            placeholder="Key Name, e.g. qirlpl.com"
            className={cn(limsDarkBarFieldClass, 'w-56 px-2 text-sm')}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void create()
            }}
          />
          <Button type="button" variant="outline" className={limsDarkBarBtnClass} disabled={busy} onClick={() => void create()}>
            <Plus className="h-4 w-4" aria-hidden />
            Create Key
          </Button>
          <Button type="button" variant="outline" className={limsDarkBarBtnClass} onClick={load}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden />
            Refresh
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {newKey ? (
        <div className={cn(limsPanelClass, 'space-y-2 border-amber-400 bg-amber-50 p-4')}>
          <p className="text-sm font-semibold text-stone-900">New Key for “{newKey.name}”: Copy It Now</p>
          <p className="text-xs text-stone-700">
            This Key Is Shown Only Once. Only Its Fingerprint Is Kept, So It Cannot Be Shown Again; If It Is Lost, Revoke It and
            Create a New One. Keep It on the Other App's Server, Never in a Web Page.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-white px-2 py-1 text-sm text-stone-900 ring-1 ring-stone-300">{newKey.apiKey}</code>
            <CopyButton text={newKey.apiKey} label="Copy Key" />
            <Button type="button" variant="outline" className="h-8 rounded-none" onClick={() => setNewKey(null)}>
              Done
            </Button>
          </div>
        </div>
      ) : null}

      <div className={cn(limsPanelClass, 'overflow-x-auto')}>
        <Table className={cn(limsTableClass, 'list-cards')}>
          <TableHeader>
            <TableRow>
              <TableHead className={limsTableHeadClass}>Name</TableHead>
              <TableHead className={limsTableHeadClass}>Key</TableHead>
              <TableHead className={limsTableHeadClass}>Status</TableHead>
              <TableHead className={limsTableHeadClass}>Created</TableHead>
              <TableHead className={limsTableHeadClass}>Last Used</TableHead>
              <TableHead className={limsTableHeadClass}>Uses</TableHead>
              <TableHead className={limsTableHeadClass}>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={limsTableBodyToneClass}>
            {keys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                  {loading ? 'Loading…' : 'No API Keys Yet. Give a Name Above and Press Create Key.'}
                </TableCell>
              </TableRow>
            ) : (
              keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="lc-title text-sm font-medium">{key.name}</TableCell>
                  <TableCell data-label="Key" className="whitespace-nowrap font-mono text-xs">{key.key_prefix}…</TableCell>
                  <TableCell data-label="Status" className="text-center">
                    <span
                      className={cn(
                        'inline-flex rounded-md px-2 py-0.5 text-xs font-medium',
                        key.active ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-600',
                      )}
                    >
                      {key.active ? 'Active' : `Revoked ${formatWhen(key.revoked_at)}`}
                    </span>
                  </TableCell>
                  <TableCell data-label="Created" className="whitespace-nowrap text-xs">{formatWhen(key.created_at)}</TableCell>
                  <TableCell data-label="Last Used" className="whitespace-nowrap text-xs">{formatWhen(key.last_used_at)}</TableCell>
                  <TableCell data-label="Uses" className="text-center text-xs">{key.use_count}</TableCell>
                  <TableCell data-label="Action" className="text-center">
                    {key.active ? (
                      <Button type="button" variant="outline" className="h-8 rounded-none text-red-700" onClick={() => void revoke(key)}>
                        Revoke
                      </Button>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className={cn(limsPanelClass, 'space-y-3 p-4 text-sm text-stone-800')}>
        <h2 className="text-sm font-semibold text-stone-900">How the Library API Works</h2>
        <p>
          Another app of yours (e.g. qirlpl.com) calls these addresses from its server with the header{' '}
          <code className="rounded bg-stone-100 px-1">X-API-Key</code>. The API returns the matching passages of the Standards
          Library (standard, Part, document, clause or table, page, text) and PDF links; it does not write an answer. PDF links work for
          1 hour without a key, so show them only to that app's signed-in users. Each key may make 120 requests a minute.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <code className="rounded bg-stone-100 px-1">POST {base}/search</code>: {'{'}query, folders (standard numbers, optional,
            e.g. "IS 1786", "IS 3025 Part 11", "ASTM D445"), include_old, limit (up to 40), per_doc{'}'}. Passages with Part,
            edition year and PDF links; names not in the library come back in not_found.
          </li>
          <li>
            <code className="rounded bg-stone-100 px-1">POST {base}/documents</code>: {'{'}query: "IS 1786"{'}'} (or "IS 3025 Part
            11", "ISO/IEC 17025"), extra_references (optional). Every document of that standard with PDF links, and groups as
            in IS Files: the current Standard, its Amendments, the Product Manual, older editions and the Reference Standards,
            with the title; count 0 when it is not in the library.
          </li>
          <li>
            <code className="rounded bg-stone-100 px-1">POST {base}/standards</code>: {'{'}query: "1608"{'}'}. Standards whose number
            matches, the latest edition of each Part, with title (for an Add Reference search).
          </li>
          <li>
            <code className="rounded bg-stone-100 px-1">POST {base}/file-link</code>: {'{'}relpath, page{'}'}. A fresh PDF link.
          </li>
        </ul>
        <div className="flex flex-wrap items-start gap-2">
          <pre className="max-w-full overflow-x-auto rounded bg-stone-900 p-3 text-xs text-stone-100">{example}</pre>
          <CopyButton text={example} label="Copy Example" />
        </div>
      </div>
      {confirmDialog}
    </div>
  )
}
