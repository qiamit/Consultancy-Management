import { useCallback, useEffect, useState } from 'react'
import { Copy, Plug, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/hooks/useAuth'
import {
  limsDarkBarAccentClass,
  limsDarkBarBtnClass,
  limsDarkBarClass,
  limsDarkBarGlowStyle,
  limsPageShellClass,
  limsPanelClass,
  limsTableBodyToneClass,
  limsTableClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

export const MCP_CONNECTOR_URL = 'https://mcp.qengineering.in/mcp'

type Connection = {
  id: string
  user_id: string
  client_name: string
  created_at: string
  last_used_at: string | null
}

function when(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Tools → Claude Connector: how to connect Claude to Consultancy Pro, and the user's live connections. */
export default function ClaudeConnectorPage() {
  const { role, session } = useAuth()
  const isAdmin = role === 'admin'
  const myId = session?.user?.id ?? ''
  const [rows, setRows] = useState<Connection[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc('mcp_list_connections')
      if (cancelled) return
      if (rpcError) {
        setRows([])
        setError(rpcError.message)
      } else {
        setRows((data ?? []) as Connection[])
        setError(null)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  useEffect(() => {
    if (!isAdmin) return
    void supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .then(({ data }) => {
        const map = new Map<string, string>()
        for (const r of (data ?? []) as Array<{ id: string; full_name?: string | null; email?: string | null }>) {
          map.set(r.id, (r.full_name || r.email || r.id).trim())
        }
        setNames(map)
      })
  }, [isAdmin])

  const reload = useCallback(() => {
    setLoading(true)
    setReloadKey((k) => k + 1)
  }, [])

  const disconnect = async (id: string) => {
    setBusyId(id)
    try {
      const { error: rpcError } = await supabase.rpc('mcp_revoke_connection', { p_id: id })
      if (rpcError) throw rpcError
      toast.success('Disconnected. Claude must sign in again to use this account.')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not disconnect')
    } finally {
      setBusyId('')
    }
  }

  const copyUrl = () => {
    void navigator.clipboard.writeText(MCP_CONNECTOR_URL).then(
      () => toast.success('Connector URL copied'),
      () => toast.error('Copy failed — select the URL and copy it by hand'),
    )
  }

  return (
    <div className={limsPageShellClass}>
      <div className={cn(limsPanelClass, limsDarkBarClass, 'px-3 py-3 sm:px-4')}>
        <div className="pointer-events-none absolute inset-0 opacity-90" style={limsDarkBarGlowStyle} />
        <div className={limsDarkBarAccentClass} />
        <div className="relative flex flex-wrap items-center gap-2">
          <Plug className="h-5 w-5 text-amber-300" aria-hidden />
          <h1 className="mr-auto text-base font-semibold tracking-wide">Claude Connector</h1>
          <Button type="button" variant="outline" className={limsDarkBarBtnClass} onClick={reload}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden />
            Refresh
          </Button>
        </div>
      </div>

      <section className={cn(limsPanelClass, 'space-y-3 p-4 text-sm leading-relaxed text-stone-800')}>
        <p>
          Connect Claude to Consultancy Pro so it can look up clients, BIS licences and applications, IS codes and
          laboratories for you. Claude signs in as you and sees only what your Module Access allows. Every request is
          logged.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="break-all border border-stone-400 bg-stone-50 px-2 py-1 font-mono text-[13px]">{MCP_CONNECTOR_URL}</code>
          <Button type="button" variant="outline" className="h-8 rounded-none" onClick={copyUrl}>
            <Copy className="h-4 w-4" aria-hidden />
            Copy
          </Button>
        </div>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <strong>claude.ai or Claude Desktop:</strong> Settings → Connectors → Add custom connector → paste the URL →
            Connect. On a Team or Enterprise plan an owner adds it first.
          </li>
          <li>
            <strong>Claude Code:</strong> run <code className="font-mono">claude mcp add --transport http qe {MCP_CONNECTOR_URL}</code>,
            then <code className="font-mono">/mcp</code> to sign in.
          </li>
          <li>Sign in with your Consultancy Pro email and password on the Q Engineering page that opens.</li>
        </ol>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className={cn(limsPanelClass, 'overflow-x-auto')}>
        <Table className={limsTableClass}>
          <TableHeader>
            <TableRow>
              {isAdmin ? <TableHead className={limsTableHeadClass}>User</TableHead> : null}
              <TableHead className={limsTableHeadClass}>Connected app</TableHead>
              <TableHead className={limsTableHeadClass}>Connected</TableHead>
              <TableHead className={limsTableHeadClass}>Last used</TableHead>
              <TableHead className={limsTableHeadClass}>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={limsTableBodyToneClass}>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 5 : 4} className="py-6 text-center text-sm text-muted-foreground">
                  {loading ? 'Loading…' : 'No active connections.'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {isAdmin ? (
                    <TableCell className="text-sm">
                      {row.user_id === myId ? 'You' : names.get(row.user_id) || row.user_id}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-sm">{row.client_name}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{when(row.created_at)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{when(row.last_used_at)}</TableCell>
                  <TableCell className="text-center">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 rounded-none"
                      disabled={busyId === row.id}
                      onClick={() => void disconnect(row.id)}
                    >
                      Disconnect
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
