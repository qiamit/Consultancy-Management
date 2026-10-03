import { cn } from '@/lib/utils'

/** App-wide Client Master theme — visual only; do not encode business logic here. */

export const limsPageShellClass =
  'mx-auto w-full min-w-0 max-w-[1600px] space-y-3 bg-gradient-to-b from-stone-100/90 to-stone-50 p-2 sm:space-y-4 sm:p-3 lg:space-y-5 lg:p-[1%]'

export const limsPanelClass =
  'min-w-0 overflow-hidden rounded-none border-2 border-stone-500 bg-card text-card-foreground shadow-sm ring-1 ring-amber-700/20'

export const limsDarkBarClass =
  'relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 text-white'

export const limsDarkBarAccentClass =
  'absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent'

export const limsDarkBarGlowStyle = {
  backgroundImage:
    'radial-gradient(circle at 12% 20%, rgb(var(--color-amber-600) / 0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgb(var(--color-amber-400) / 0.25), transparent 35%)',
} as const

export const limsFieldClass =
  'h-8 rounded-none border border-stone-500 bg-stone-50 text-foreground shadow-none focus-visible:border-amber-600 focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-amber-500/20'

export const limsPrimaryBtnClass =
  'h-8 rounded-none bg-amber-700 px-4 text-white shadow-sm hover:bg-amber-800'

export const limsOutlineBtnClass =
  'h-8 rounded-none border-stone-500 bg-stone-50 text-foreground hover:bg-stone-100 hover:text-foreground'

/** Outline / action buttons on dark stone header & footer bars (Import, Export, Print, Jump, AI, etc.) */
export const limsDarkBarBtnClass =
  'h-8 rounded-none border border-amber-500/40 bg-stone-800/80 text-amber-100 shadow-none hover:bg-amber-500/20 hover:text-amber-50 disabled:opacity-50'

/** Inputs / selects on dark stone bars (page size, jump-to-page) */
export const limsDarkBarFieldClass =
  'h-8 rounded-none border border-stone-500 bg-stone-800/80 text-white shadow-none placeholder:text-stone-400 focus-visible:border-amber-500 focus-visible:bg-stone-900 focus-visible:ring-2 focus-visible:ring-amber-500/25'

/** Search field on dark header — always light island for contrast in every theme */
export const limsDarkBarSearchClass =
  'h-8 rounded-none border border-amber-500/50 bg-amber-50 text-[#1c1917] shadow-none placeholder:text-stone-500 focus-visible:border-amber-600 focus-visible:ring-2 focus-visible:ring-amber-500/20'

/** QI Assistant icon trigger on dark bars */
export const limsAiTriggerClass =
  'rounded-none border-amber-500/45 bg-stone-800/80 text-amber-200 shadow-none hover:bg-amber-500/20 hover:text-amber-100'

/** Destructive delete on dark footer */
export const limsDeleteBtnClass =
  'h-8 gap-1.5 rounded-none border border-red-500/50 bg-red-700 text-white hover:bg-red-600 disabled:opacity-50'

export const limsTableClass =
  'w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[rgb(var(--lims-paper-border))]'

export const limsTableHeadClass =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

export const limsTableBodyToneClass = 'bg-lims-paper text-foreground'

export const limsDialogClass = cn(
  'gap-0 max-h-[92dvh] overflow-hidden rounded-none border-4 border-stone-700 bg-card text-card-foreground p-0 shadow-2xl',
  'ring-2 ring-amber-700/40 sm:rounded-none',
  '[&>button]:!rounded-none [&>button]:opacity-100',
)

export const limsAddLinkClass =
  'inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-amber-800 hover:text-amber-950 hover:underline'

/** + button attached to the right edge of an input/select (Client Master field strip) */
export const limsFieldAddBtnClass =
  'inline-flex h-full w-9 shrink-0 items-center justify-center border-l border-stone-500 bg-stone-100 text-amber-800 transition-colors hover:bg-amber-500/15 hover:text-amber-950 disabled:pointer-events-none'

/** Outer shell that wraps a control + limsFieldAddBtnClass button */
export const limsFieldWithAddShellClass =
  'flex h-8 min-w-0 items-stretch overflow-hidden rounded-none border border-stone-500 bg-stone-50 text-foreground focus-within:border-amber-600 focus-within:bg-card focus-within:ring-2 focus-within:ring-amber-500/20'

/** Strip borders from nested input/select when inside limsFieldWithAddShellClass */
export const limsFieldWithAddControlClass = cn(
  'min-w-0 flex-1',
  '[&_input]:h-full [&_input]:rounded-none [&_input]:border-0 [&_input]:bg-transparent [&_input]:shadow-none',
  '[&_input]:focus-visible:border-transparent [&_input]:focus-visible:bg-transparent [&_input]:focus-visible:ring-0',
  '[&_button[role=combobox]]:h-full [&_button[role=combobox]]:w-full [&_button[role=combobox]]:rounded-none',
  '[&_button[role=combobox]]:!border-0 [&_button[role=combobox]]:!bg-transparent [&_button[role=combobox]]:shadow-none',
  '[&_button[role=combobox]]:text-foreground',
  '[&_button[role=combobox]]:focus:!border-transparent [&_button[role=combobox]]:focus:!bg-transparent',
  '[&_button[role=combobox]]:focus:ring-0 [&_button[role=combobox]]:focus:ring-offset-0',
)

/** Soft filled form fields — registry / manage dialogs
 * Control height matches Equipment Code field (h-8 / 32px).
 * Label→field gap ≈ 0.5mm (space-y-0.5).
 */
export const limsRegistryFormClass = cn(
  'lims-registry-form',
  '[&_label]:text-[11px] [&_label]:font-semibold [&_label]:uppercase [&_label]:tracking-wide [&_label]:text-stone-600',
  /* Label / field stack spacing (~0.5mm) */
  '[&_.space-y-2]:!space-y-0.5 [&_.space-y-1]:!space-y-0.5',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:!h-8',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:rounded-none',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:border',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:border-stone-500',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:bg-stone-50',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:text-foreground',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:px-3',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:shadow-none',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:transition-colors',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:placeholder:text-stone-400',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:focus-visible:border-amber-600',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:focus-visible:bg-card',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:focus-visible:ring-2',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:focus-visible:ring-amber-500/20',
  '[&_button[role=combobox]]:!h-8',
  '[&_button[role=combobox]]:rounded-none',
  '[&_button[role=combobox]]:border',
  '[&_button[role=combobox]]:border-stone-500',
  '[&_button[role=combobox]]:bg-stone-50',
  '[&_button[role=combobox]]:text-foreground',
  '[&_button[role=combobox]]:px-3',
  '[&_button[role=combobox]]:shadow-none',
  '[&_button[role=combobox]]:transition-colors',
  '[&_button[role=combobox]]:focus:border-amber-600',
  '[&_button[role=combobox]]:focus:bg-card',
  '[&_button[role=combobox]]:focus:ring-2',
  '[&_button[role=combobox]]:focus:ring-amber-500/20',
  '[&_button[role=combobox]]:focus:ring-offset-0',
  /* Action buttons inside forms match field height */
  '[&_button:not([role=option]):not([role=menuitem]):not([role=menuitemcheckbox])]:!h-8',
  '[&_button.w-10]:!w-8',
  '[&_div.flex.h-10]:!h-8',
  '[&_textarea]:!min-h-8',
  '[&_textarea]:rounded-none',
  '[&_textarea]:border',
  '[&_textarea]:border-stone-500',
  '[&_textarea]:bg-stone-50',
  '[&_textarea]:text-foreground',
  '[&_textarea]:px-3',
  '[&_textarea]:py-1.5',
  '[&_textarea]:shadow-none',
  '[&_textarea]:transition-colors',
  '[&_textarea]:placeholder:text-stone-400',
  '[&_textarea]:focus-visible:border-amber-600',
  '[&_textarea]:focus-visible:bg-card',
  '[&_textarea]:focus-visible:ring-2',
  '[&_textarea]:focus-visible:ring-amber-500/20',
  '[&_textarea]:focus-visible:ring-offset-0',
)
