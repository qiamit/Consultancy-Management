import type { ReactNode } from 'react'
import { Thermometer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { labRegistryFormClass } from '@/features/settings/lab-settings/labSettingsUi'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

const FULLSCREEN_OVERLAY = 'lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto'

const FULLSCREEN_DIALOG_CLASS = cn(
  limsDialogClass,
  '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
  'left-0 top-0',
  'lg:left-[268px] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
)

export function ConductIntermediateCheckDialog({
  open,
  onOpenChange,
  equipmentName,
  assetCode: _assetCode,
  acceptanceCriteria,
  children,
  onComplete,
  completeDisabled,
  onEnvironmentCondition,
  layer = 'default',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  equipmentName?: string
  assetCode?: string
  acceptanceCriteria?: string
  children: ReactNode
  onComplete?: () => boolean
  completeDisabled?: boolean
  onEnvironmentCondition?: () => void
  layer?: 'default' | 'nested' | 'stacked'
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer={layer === 'default' ? 'nested' : layer}
        overlayClassName={FULLSCREEN_OVERLAY}
        className={FULLSCREEN_DIALOG_CLASS}
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Conduct Intermediate Check
            </DialogTitle>
          </DialogHeader>
        </div>

        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5',
            labRegistryFormClass,
          )}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-none border-2 border-stone-400 bg-stone-50 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-stone-800">
                  {equipmentName || 'Equipment'}
                </p>
                <p className="text-[11px] text-stone-500">
                  Criteria:{' '}
                  <strong className="text-stone-800">
                    {acceptanceCriteria?.trim() || 'None'}
                  </strong>
                </p>
              </div>
              {onEnvironmentCondition ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn('h-8 shrink-0 gap-1.5', limsOutlineBtnClass)}
                  onClick={onEnvironmentCondition}
                  aria-label="Add environmental condition table"
                >
                  <Thermometer size={14} aria-hidden />
                  Environmental Condition
                </Button>
              ) : null}
            </div>
            {children}
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-white px-4 py-3 sm:px-5">
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            disabled={completeDisabled}
            onClick={() => {
              if (onComplete?.()) {
                onOpenChange(false)
              }
            }}
          >
            Save & Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
