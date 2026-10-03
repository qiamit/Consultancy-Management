import { limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

type LabSettingsHeaderBarProps = {
  labName?: string
  saveLoading: boolean
  saveMessage: string | null
  onSave: () => void
}

const tabTriggerClass = cn(
  'shrink-0 whitespace-nowrap rounded-none border border-transparent px-3 py-2 text-xs font-medium',
  'text-stone-300 shadow-none transition-colors',
  'hover:bg-stone-800/80 hover:text-amber-50',
  'focus-visible:ring-2 focus-visible:ring-amber-500/25 focus-visible:ring-offset-0',
  'data-[state=active]:border-amber-500/40 data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-50',
  'data-[state=active]:shadow-none sm:text-[13px]',
)

export function LabSettingsHeaderBar({
  saveLoading,
  saveMessage,
  onSave,
}: LabSettingsHeaderBarProps) {
  return (
    <div className="relative space-y-0 overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
      <div className="relative bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-3 text-white sm:px-5 sm:py-4">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)',
          }}
        />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-lg font-semibold tracking-tight text-white">Lab Setting</h1>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {saveMessage ? (
              <p
                className={cn(
                  'text-sm',
                  saveMessage.toLowerCase().includes('saved') ? 'text-emerald-300' : 'text-red-300',
                )}
              >
                {saveMessage}
              </p>
            ) : null}
            <Button
              type="button"
              size="sm"
              className={cn('gap-2 shrink-0', limsPrimaryBtnClass)}
              onClick={onSave}
              disabled={saveLoading}
              aria-label="Save lab settings"
            >
              <Save size={14} />
              {saveLoading ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        <div className="relative mt-3 border-t border-stone-700/80 pt-3">
          <TabsList
            className={cn(
              'flex h-auto w-full flex-nowrap items-center justify-start gap-1 overflow-x-auto',
              'rounded-none border border-stone-500 bg-stone-950/40 p-1 text-stone-300',
              '[-webkit-overflow-scrolling:touch]',
            )}
          >
            <TabsTrigger value="laboratory-details" className={tabTriggerClass}>
              Laboratory Details
            </TabsTrigger>
            <TabsTrigger value="bank-details" className={tabTriggerClass}>
              Bank Details
            </TabsTrigger>
            <TabsTrigger value="legal-documents" className={tabTriggerClass}>
              Legal Documents
            </TabsTrigger>
            <TabsTrigger value="logos-signatures" className={tabTriggerClass}>
              Registration Documents
            </TabsTrigger>
            <TabsTrigger value="prefixes" className={tabTriggerClass}>
              Prefix&apos;s
            </TabsTrigger>
            <TabsTrigger value="letterhead" className={tabTriggerClass}>
              Letter Head Templates
            </TabsTrigger>
            <TabsTrigger value="settings" className={tabTriggerClass}>
              Setting
            </TabsTrigger>
          </TabsList>
        </div>
      </div>
    </div>
  )
}
