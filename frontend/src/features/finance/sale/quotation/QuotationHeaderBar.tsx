import { cn } from '@/lib/utils'
import {
  limsPrimaryBtnClass,
  limsDarkBarSearchClass,
  limsDarkBarFieldClass,
} from '@/lib/limsThemeUi'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function QuotationHeaderBar({
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  onNew,
  title = 'Quotation',
  addLabel = 'Add New Quotation',
  searchAriaLabel = 'Search quotations',
}: {
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  onNew: () => void
  title?: string
  addLabel?: string
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
        <SelectItem value="5">5 / Page</SelectItem>
        <SelectItem value="10">10 / Page</SelectItem>
        <SelectItem value="20">20 / Page</SelectItem>
        <SelectItem value="50">50 / Page</SelectItem>
      </SelectContent>
    </Select>
  )

  return (
    <div className="relative flex flex-col gap-3 overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-3 text-white shadow-sm ring-1 ring-amber-700/20 sm:px-5 sm:py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 md:gap-4">
          <h1 className="shrink-0 text-base font-semibold tracking-tight text-white sm:text-lg">
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
              placeholder=""
              className={cn(limsDarkBarSearchClass, 'pl-9')}
              aria-label={searchAriaLabel}
            />
          </div>
          <div className="hidden sm:block">{pageSizeSelect}</div>
        </div>

        <Button
          type="button"
          className={cn('gap-2 shrink-0', limsPrimaryBtnClass)}
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
            placeholder={`Search ${title.toLowerCase()}…`}
            className={cn(limsDarkBarSearchClass, 'pl-9')}
            aria-label={searchAriaLabel}
          />
        </div>
        {pageSizeSelect}
      </div>
    </div>
  )
}
