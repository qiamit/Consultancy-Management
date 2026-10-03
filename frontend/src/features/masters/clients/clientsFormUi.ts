import { cn } from '@/lib/utils'
import {
  limsAddLinkClass,
  limsAiTriggerClass,
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDarkBarSearchClass,
  limsDeleteBtnClass,
  limsDialogClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPageShellClass,
  limsPanelClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'

export {
  limsAiTriggerClass as clientAiTriggerClass,
  limsDarkBarBtnClass as clientDarkBarBtnClass,
  limsDarkBarFieldClass as clientDarkBarFieldClass,
  limsDarkBarSearchClass as clientDarkBarSearchClass,
  limsDeleteBtnClass as clientDeleteBtnClass,
}

/** Soft filled + outlined fields — Client Registry dialog only (not shared lab underline theme). */
export const clientRegistryFormClass = limsRegistryFormClass

export const clientAddLinkClass = limsAddLinkClass

export {
  limsFieldAddBtnClass as clientFieldAddBtnClass,
  limsFieldWithAddShellClass as clientFieldWithAddShellClass,
} from '@/lib/limsThemeUi'

/** Client Directory page shell — matches Client Form stone/amber theme */
export const clientPageShellClass = limsPageShellClass

export const clientPanelClass = limsPanelClass

export const clientFieldClass = limsFieldClass

export const clientPrimaryBtnClass = limsPrimaryBtnClass

export const clientOutlineBtnClass = limsOutlineBtnClass

/** Nested “Manage …” dialogs (Districts, States, etc.) — match Client Form shell */
export const clientManageDialogClass = cn(
  limsDialogClass,
  'max-w-lg',
)

export const clientManageListItemClass =
  'flex items-center justify-between rounded-none border border-stone-500 bg-stone-50 px-3 py-1.5 text-sm text-black'
