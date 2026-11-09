import { Check, ChevronDown } from 'lucide-react'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { limsDarkBarFieldClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { APPLICATION_STAGES, AUTO_APPLICATION_STAGES } from './types'

/** BIS New Application list: show the applications of one, some or all stages (default all). */
export function ApplicationStageFilter({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const all = value.length === 0 || value.length === APPLICATION_STAGES.length
  const picked = all ? [...APPLICATION_STAGES] : value
  const label = all ? 'All Stages' : picked.length === 1 ? picked[0] : `${picked.length} Stages`
  const toggle = (stage: string, on: boolean) => {
    const next = on ? [...picked, stage] : picked.filter((s) => s !== stage)
    // In the order of the stages; none ticked shows all again.
    onChange(next.length ? APPLICATION_STAGES.filter((s) => next.includes(s)) : [...APPLICATION_STAGES])
  }
  const box = (on: boolean) => (
    <span
      aria-hidden
      className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center border', on ? 'border-amber-700 bg-amber-600 text-white' : 'border-stone-400 bg-white')}
    >
      {on ? <Check className="h-3 w-3" /> : null}
    </span>
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          limsDarkBarFieldClass,
          'bis-projects-filter-trigger flex h-8 w-[min(100%,10.5rem)] shrink-0 items-center justify-between gap-1 px-2 text-left text-[11px] sm:w-[12rem] sm:text-xs',
        )}
        aria-label="Filter by Application Stage"
        title="Show the Applications of the Ticked Stages"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem] rounded-none">
        <DropdownMenuCheckboxItem
          className="gap-2 pl-2 font-semibold [&>span:first-child]:hidden"
          checked={all}
          onCheckedChange={() => onChange([...APPLICATION_STAGES])}
          onSelect={(e) => e.preventDefault()}
        >
          {box(all)}
          All Stages
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {APPLICATION_STAGES.map((stage) => (
          <DropdownMenuCheckboxItem
            key={stage}
            className="gap-2 pl-2 [&>span:first-child]:hidden"
            checked={!all && picked.includes(stage)}
            onCheckedChange={(on) => (all ? onChange([stage]) : toggle(stage, on === true))}
            onSelect={(e) => e.preventDefault()}
          >
            {box(!all && picked.includes(stage))}
            <span className="flex-1">{stage}</span>
            {AUTO_APPLICATION_STAGES.includes(stage) ? <span className="text-[10px] uppercase tracking-wide text-stone-400">Auto</span> : null}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
