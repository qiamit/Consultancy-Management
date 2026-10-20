import { toast } from 'sonner'
import { openManakEbisAssist } from '../projects/manakExtensionBridge'
import { fetchBisProjectById } from '../projects/bisProjectsApi'
import { manakLoginFromProject } from '../projects/types'
import type { StopMarkingRow } from './types'

/** Manak Assist for a stop-marking case: opens Manak eBIS with the licence's login ready; the reply text is copied for pasting. */
const EXTENSION_MISSING_MSG =
  'QE Consultancy extension is not connected to this tab. If you just reloaded the extension, refresh this page (Cmd/Ctrl + R) and try again; otherwise reload the extension from chrome://extensions.'

export async function openStopMarkingManak(row: StopMarkingRow): Promise<void> {
  try {
    const project = row.bis_project_id ? await fetchBisProjectById(row.bis_project_id) : null
    if (row.reply_draft.trim()) {
      try {
        await navigator.clipboard.writeText(row.reply_draft)
        toast.info('The reply letter text is copied — paste it where Manak asks for the reply.')
      } catch {
        /* clipboard may be blocked; the letter is still available in the module */
      }
    }
    const { extensionUsed } = await openManakEbisAssist({
      portalUserId: project ? manakLoginFromProject(project).userId : '',
      projectId: row.bis_project_id,
    })
    if (extensionUsed) toast.success('Opening Manak in a new tab — type the captcha to sign in.')
    else toast.warning('Extension not detected — opened Manak eBIS in a new tab', { description: EXTENSION_MISSING_MSG })
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not open Manak')
  }
}
