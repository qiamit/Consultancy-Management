import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsDarkBarGlowStyle, limsDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { askLibrary } from './isLibraryAsk'
import { StandardsAskPanel } from './StandardsAskPanel'

/** Ask AI over the whole Standards Library: any question, one or several IS numbers, answers with standard and page. */
export function LibraryAskDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="stacked"
        aria-describedby={undefined}
        className={cn(
          limsDialogClass,
          'flex !flex-col gap-0 overflow-hidden p-0',
          'h-[min(92dvh,860px)] w-[min(56rem,calc(100vw-1.5rem))] max-w-4xl bg-white',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              Ask the Standards Library<span className="font-normal text-stone-300"> · All Indian Standards</span>
            </DialogTitle>
          </DialogHeader>
        </div>
        <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
          {open ? (
            <StandardsAskPanel
              intro='Ask About Any Standard, or Several Together: "IS 1786 aur IS 2062 me tensile strength compare karo", "Which Standards Give the Sampling Plan for Steel Tubes?", "IS 4035 me marking kya honi chahiye?" The Answer Comes Only From the Library, With Standard, Clause and Page.'
              placeholder="Ask the Standards Library…"
              flagLabel="Include Older Editions (Superseded / Withdrawn)"
              ask={(question, history, includeOld, attached) => askLibrary({ question, history, includeOld, attached })}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
