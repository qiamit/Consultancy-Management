import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { BookOpen, ExternalLink, FileText, Globe, KeyRound, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { loadIsCodeFileLinks, type IsCodeFileLink } from '@/features/masters/is-codes/loadIsCodeFileLinks'
import { usePdfViewer } from '@/components/ui/usePdfViewer'
import { cn } from '@/lib/utils'
import { fetchBisProjectById } from '../projects/bisProjectsApi'
import { isQeExtensionPresent, openBsbPortalLogin, openManakEbisAssist } from '../projects/manakExtensionBridge'
import { isFmcsProject, manakLoginFromProject } from '../projects/types'

const EXTENSION_MISSING_MSG =
  'QE Consultancy extension is not connected to this tab. If you just reloaded the extension, refresh this page (Cmd/Ctrl + R) and try again; otherwise reload the extension from chrome://extensions.'

const toolBtn =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-amber-500/40 bg-stone-800/80 text-amber-100 transition-colors hover:bg-amber-500/20 hover:text-amber-50 disabled:opacity-40'

const isManualName = (name: string) => /product[_\s-]*manual|\bmanual\b|\bpm\b|^pm[_\s-]/i.test(name)

/** The IS Code's specification (standard) or product manual among its attached files. */
function pickIsFile(files: IsCodeFileLink[], kind: 'manual' | 'standard'): IsCodeFileLink | null {
  const usable = files.filter((f) => Boolean(f.url?.trim()))
  const pool = usable.length > 0 ? usable : files
  if (pool.length === 0) return null
  return kind === 'manual'
    ? pool.find((f) => isManualName(f.file_name)) ?? null
    : pool.find((f) => !isManualName(f.file_name)) ?? null
}

/** Opens BIS Product Manuals online; the QE extension searches the IS number when installed. */
function openProductManualOnline(isNumber: string, setBusy: (busy: boolean) => void) {
  const url = 'https://standards.bis.gov.in/website/product-manuals'
  const selected = isNumber.trim()
  if (!selected) {
    window.open(url, '_blank', 'noopener,noreferrer')
    toast.warning('Product Manuals Opened. There Is No IS Number to Search.')
    return
  }
  if (!isQeExtensionPresent()) {
    window.open(url, '_blank', 'noopener,noreferrer')
    toast.warning('Reload the QE Consultancy Extension to Auto-Search the IS Number.')
    return
  }
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  setBusy(true)
  let done = false
  const finish = (message: string, isError: boolean) => {
    if (done) return
    done = true
    window.clearTimeout(timer)
    window.removeEventListener('message', onResult)
    setBusy(false)
    if (isError) toast.error(message)
    else toast.success(message)
  }
  const onResult = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin) return
    const data = event.data
    if (data?.type !== 'QE_PRODUCT_MANUAL_SEARCH_RESULT' || data.requestId !== requestId) return
    finish(String(data.message || (data.ok ? 'Product Manual search started.' : 'Could not search Product Manuals.')), !data.ok)
  }
  const timer = window.setTimeout(() => finish('The QE Consultancy extension did not respond. Reload it and try again.', true), 60000)
  window.addEventListener('message', onResult)
  window.postMessage({ type: 'QE_PRODUCT_MANUAL_SEARCH', requestId, isNumber: selected }, window.location.origin)
}

/**
 * Standard and portal shortcuts for the header bar of every BIS module window (application steps, licence,
 * inclusion, renewal, non-conformity, surveillance and the module pages inside them): the IS specification and
 * product manual, the standard online, the BIS Standards website, the BIS Portal (BSB Edge) login with the
 * company's saved login, and the Manak login of this licence's firm.
 * Missing IS Code / IS Number are read from the licence when only `projectId` is given.
 */
export function BisQuickTools({
  projectId,
  isCodeId,
  isNumber,
  className,
}: {
  projectId?: string | null
  isCodeId?: string | null
  isNumber?: string | null
  className?: string
}) {
  const [viewFile, viewer] = usePdfViewer()
  const [projectIs, setProjectIs] = useState<{ isCodeId: string; isNumber: string } | null>(null)
  // Files of the IS Code they were loaded for; a different IS Code shows as loading until its files arrive.
  const [loadedFiles, setLoadedFiles] = useState<{ codeId: string; files: IsCodeFileLink[] } | null>(null)
  const [searchBusy, setSearchBusy] = useState(false)
  const [loginBusy, setLoginBusy] = useState<'manak' | 'bsb' | null>(null)

  const id = (projectId ?? '').trim()
  const needsProject = Boolean(id) && (!(isCodeId ?? '').trim() || !(isNumber ?? '').trim())
  useEffect(() => {
    if (!needsProject) return
    let cancelled = false
    void fetchBisProjectById(id)
      .then((row) => {
        if (!cancelled && row) setProjectIs({ isCodeId: row.is_code_id ?? '', isNumber: row.is_code?.is_number ?? '' })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [id, needsProject])

  const codeId = (isCodeId ?? '').trim() || projectIs?.isCodeId || ''
  const number = (isNumber ?? '').trim() || projectIs?.isNumber || ''

  useEffect(() => {
    if (!codeId) return
    let cancelled = false
    void loadIsCodeFileLinks(codeId).then((files) => {
      if (!cancelled) setLoadedFiles({ codeId, files })
    })
    return () => {
      cancelled = true
    }
  }, [codeId])
  const isFiles = codeId && loadedFiles?.codeId === codeId ? loadedFiles.files : []
  const filesLoading = Boolean(codeId) && loadedFiles?.codeId !== codeId

  const standardFile = pickIsFile(isFiles, 'standard')
  const manualFile = pickIsFile(isFiles, 'manual')

  const manakLogin = async () => {
    if (!id) return
    setLoginBusy('manak')
    try {
      const row = await fetchBisProjectById(id)
      const { extensionUsed } = await openManakEbisAssist({
        portalUserId: row ? manakLoginFromProject(row).userId : '',
        projectId: id,
        fmcs: row ? isFmcsProject(row) : false,
      })
      if (extensionUsed) toast.success('Opening Manak Login — Type the Captcha and Click Login')
      else toast.warning('Extension Not Detected — Opened the Manak Login in a New Tab', { description: EXTENSION_MISSING_MSG })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could Not Open Manak')
    } finally {
      setLoginBusy(null)
    }
  }

  const bsbLogin = async () => {
    setLoginBusy('bsb')
    try {
      const { filled, message } = await openBsbPortalLogin()
      if (filled) toast.success(message || 'BIS Portal Login Opened — Type the Captcha and Click Sign In')
      else toast.warning(message)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could Not Open the BIS Portal Login')
    } finally {
      setLoginBusy(null)
    }
  }

  return (
    <div className={cn('flex shrink-0 flex-wrap items-center justify-end gap-1', className)}>
      <button
        type="button"
        className={toolBtn}
        disabled={filesLoading || !standardFile?.url}
        title={standardFile?.file_name ? `View Specification: ${standardFile.file_name}` : codeId ? 'No Specification Attached to This IS Code' : 'No IS Code'}
        aria-label="View Specification"
        onClick={() => viewFile(standardFile?.url, standardFile?.file_name || 'Specification', 'Specification File Not Found for This IS Code.')}
      >
        <BookOpen size={15} aria-hidden />
      </button>
      <button
        type="button"
        className={toolBtn}
        disabled={filesLoading || !manualFile?.url}
        title={manualFile?.file_name ? `View Product Manual: ${manualFile.file_name}` : codeId ? 'No Product Manual Attached to This IS Code' : 'No IS Code'}
        aria-label="View Product Manual"
        onClick={() => viewFile(manualFile?.url, manualFile?.file_name || 'Product Manual', 'Product Manual File Not Found for This IS Code.')}
      >
        <FileText size={15} aria-hidden />
      </button>
      <button
        type="button"
        className={toolBtn}
        disabled={searchBusy}
        title="Open the Standard / Product Manual Online (BIS) and Search This IS Number"
        aria-label="Open Standard Online"
        onClick={() => openProductManualOnline(number, setSearchBusy)}
      >
        <ExternalLink size={15} aria-hidden />
      </button>
      <a
        className={toolBtn}
        href="https://standards.bis.gov.in/website"
        target="_blank"
        rel="noopener noreferrer"
        title="BIS Standards Website (standards.bis.gov.in)"
        aria-label="BIS Standards Website"
      >
        <Globe size={15} aria-hidden />
      </a>
      <button
        type="button"
        className={toolBtn}
        disabled={loginBusy === 'bsb'}
        title="BIS Portal Login (standardsbis.bsbedge.com) — Company Login From Company Settings"
        aria-label="BIS Portal Login"
        onClick={() => void bsbLogin()}
      >
        <KeyRound size={15} aria-hidden />
      </button>
      <button
        type="button"
        className={toolBtn}
        disabled={!id || loginBusy === 'manak'}
        title={id ? 'Manak Login' : 'Manak Login — Save the Licence First'}
        aria-label="Manak Login"
        onClick={() => void manakLogin()}
      >
        <LogIn size={15} aria-hidden />
      </button>
      {viewer}
    </div>
  )
}

type BisQuickToolsTarget = { projectId?: string | null; isCodeId?: string | null; isNumber?: string | null }

const BisQuickToolsContext = createContext<BisQuickToolsTarget | null>(null)

/** The licence / application whose tools every popup inside this window shows (see BisContextQuickTools). */
export function BisQuickToolsProvider({ value, children }: { value: BisQuickToolsTarget; children: ReactNode }) {
  return <BisQuickToolsContext.Provider value={value}>{children}</BisQuickToolsContext.Provider>
}

/** BisQuickTools for the licence of the surrounding window (BisQuickToolsProvider); nothing outside one. */
export function BisContextQuickTools({ className }: { className?: string }) {
  const target = useContext(BisQuickToolsContext)
  if (!target) return null
  return <BisQuickTools {...target} className={cn('hidden sm:flex', className)} />
}
