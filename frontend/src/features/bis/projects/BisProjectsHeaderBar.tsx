import { Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { limsDarkBarFieldClass, limsDarkBarSearchClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const PAGE_SIZES = [10, 20, 50, 100]

export function BisProjectsHeaderBar({
  title,
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  onNew,
  addLabel = 'Add New License',
  searchPlaceholder = 'Search client, IS code, CM/L…',
  searchAriaLabel = 'Search by client, IS code, CM/L number or title',
}: {
  title: string
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  onNew: () => void
  addLabel?: string
  searchPlaceholder?: string
  searchAriaLabel?: string
}) {
  const pageSizeSelect = (
    <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
      <SelectTrigger
        className={cn(limsDarkBarFieldClass, 'h-9 w-[6.5rem] shrink-0 sm:w-[7.5rem]')}
        aria-label="Rows per page"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PAGE_SIZES.map((n) => (
          <SelectItem key={n} value={String(n)}>
            {n} / Page
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  const searchLabel = searchAriaLabel

  return (
    <div className="relative flex flex-col gap-3 overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-3 text-white shadow-sm ring-1 ring-amber-700/20 sm:px-5 sm:py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 md:gap-4">
          <h1 className="min-w-0 max-w-[50%] truncate text-base font-semibold tracking-tight text-white sm:max-w-none sm:shrink-0 sm:text-lg">
            {title}
          </h1>
          <div className="relative hidden min-w-0 flex-1 sm:block sm:max-w-xs md:max-w-sm lg:max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className={cn(limsDarkBarSearchClass, 'pl-9')}
              aria-label={searchLabel}
            />
          </div>
          <div className="hidden sm:block">{pageSizeSelect}</div>
        </div>

        <Button
          type="button"
          className={cn('shrink-0 gap-2', limsPrimaryBtnClass)}
          size="sm"
          onClick={onNew}
          aria-label={addLabel}
        >
          <Plus size={14} />
          <span className="hidden sm:inline">{addLabel}</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      <div className="flex w-full items-center gap-2 sm:hidden">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className={cn(limsDarkBarSearchClass, 'pl-9')}
            aria-label={searchLabel}
          />
        </div>
        {pageSizeSelect}
      </div>
    </div>
  )
}
