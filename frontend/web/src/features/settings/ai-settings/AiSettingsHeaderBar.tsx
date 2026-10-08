import { cn } from '@/lib/utils'
import { limsPrimaryBtnClass, limsDarkBarSearchClass, limsDarkBarFieldClass, limsDarkBarBtnClass, limsAiTriggerClass } from '@/lib/limsThemeUi'
import { Plus, Save, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'

export type AiSettingsTab = 'models' | 'skills' | 'general'

type AiSettingsHeaderBarProps = {
  activeTab: AiSettingsTab
  searchQuery: string
  onSearchChange: (value: string) => void
  onPrimaryAction: () => void
  saving?: boolean
}

export function AiSettingsHeaderBar({
  activeTab,
  searchQuery,
  onSearchChange,
  onPrimaryAction,
  saving = false,
}: AiSettingsHeaderBarProps) {
  const showSearch = activeTab === 'models' || activeTab === 'skills'

  return (
    <div className="space-y-4 relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 text-white shadow-sm ring-1 ring-amber-700/20 px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="shrink-0 text-lg font-semibold tracking-tight text-white">AI Settings</h1>

        <div className="flex w-full flex-col gap-3 sm:max-w-xl sm:flex-1 sm:flex-row sm:items-center sm:justify-end">
          {showSearch ? (
            <div className="relative w-full sm:max-w-sm">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                aria-hidden
              />
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder=""
                className={cn(limsDarkBarSearchClass, 'pl-9')}
                aria-label="Search AI settings"
              />
            </div>
          ) : null}

          {activeTab === 'models' ? (
            <Button type="button" className={cn('gap-2 shrink-0', limsPrimaryBtnClass)} size="sm" onClick={onPrimaryAction} aria-label="Add Model">
              <Plus size={14} />
              Add Model
            </Button>
          ) : null}

          {activeTab === 'skills' ? (
            <Button type="button" className={cn('gap-2 shrink-0', limsPrimaryBtnClass)} size="sm" onClick={onPrimaryAction} aria-label="Add Skill">
              <Plus size={14} />
              Add Skill
            </Button>
          ) : null}

          {activeTab === 'general' ? (
            <Button
              type="button"
              className={cn('gap-2 shrink-0', limsPrimaryBtnClass)}
              size="sm"
              onClick={onPrimaryAction}
              disabled={saving}
              aria-label="Save Settings"
            >
              <Save size={14} />
              {saving ? 'Saving…' : 'Save Settings'}
            </Button>
          ) : null}
        </div>
      </div>

      <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-lg bg-muted/60 p-1">
        <TabsTrigger value="models" className="text-xs sm:text-sm">
          AI Models
        </TabsTrigger>
        <TabsTrigger value="skills" className="text-xs sm:text-sm">
          Skills
        </TabsTrigger>
        <TabsTrigger value="general" className="text-xs sm:text-sm">
          General Setting
        </TabsTrigger>
      </TabsList>
    </div>
  )
}
