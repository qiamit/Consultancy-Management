import { Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsDarkBarSearchClass,
  limsPanelClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  BisLicenseStatusFilter,
  BisProjectKindFilter,
  BisQeManagedFilter,
} from './bisProjectsApi'

const PAGE_SIZES = [10, 20, 50, 100]

export function BisProjectsHeaderBar({
  title,
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  onNew,
  addLabel = 'Add New License',
  searchPlaceholder = 'Search Clients | IS Codes | CM/L Numbers | Validity',
  searchAriaLabel = 'Search Clients, IS Codes, CM/L Numbers, or Validity',
  qeManagedFilter = 'managed',
  onQeManagedFilterChange,
  projectKindFilter = 'all',
  onProjectKindFilterChange,
  licenseStatusFilter = 'all',
  onLicenseStatusFilterChange,
  showListFilters = true,
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
  qeManagedFilter?: BisQeManagedFilter
  onQeManagedFilterChange?: (value: BisQeManagedFilter) => void
  projectKindFilter?: BisProjectKindFilter
  onProjectKindFilterChange?: (value: BisProjectKindFilter) => void
  licenseStatusFilter?: BisLicenseStatusFilter
  onLicenseStatusFilterChange?: (value: BisLicenseStatusFilter) => void
  /** Hide QE / Type filters on dedicated Applications / Inclusion pages. */
  showListFilters?: boolean
}) {
  const filterSelects =
    showListFilters &&
    onQeManagedFilterChange &&
    onProjectKindFilterChange &&
    onLicenseStatusFilterChange ? (
      <>
        <Select
          value={qeManagedFilter}
          onValueChange={(v) => onQeManagedFilterChange(v as BisQeManagedFilter)}
        >
          <SelectTrigger
            className={cn(
              limsDarkBarFieldClass,
              'h-8 w-[min(100%,11.5rem)] shrink-0 px-2 text-[11px] sm:w-[12.5rem] sm:text-xs',
            )}
            aria-label="Filter by QE management"
            title="Managed by QE / Not Managed by QE"
          >
            <SelectValue placeholder="QE Management" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="all">All QE Status</SelectItem>
            <SelectItem value="managed">Managed by QE</SelectItem>
            <SelectItem value="not_managed">Not Managed by QE</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={projectKindFilter}
          onValueChange={(v) => onProjectKindFilterChange(v as BisProjectKindFilter)}
        >
          <SelectTrigger
            className={cn(
              limsDarkBarFieldClass,
              'h-8 w-[min(100%,9.5rem)] shrink-0 px-2 text-[11px] sm:w-[10.5rem] sm:text-xs',
            )}
            aria-label="Filter by type of project"
            title="Application / License"
          >
            <SelectValue placeholder="Type of Project" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="Application">Application</SelectItem>
            <SelectItem value="Licence">License</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={licenseStatusFilter}
          onValueChange={(v) => onLicenseStatusFilterChange(v as BisLicenseStatusFilter)}
        >
          <SelectTrigger
            className={cn(
              limsDarkBarFieldClass,
              'h-8 w-[min(100%,9.5rem)] shrink-0 px-2 text-[11px] sm:w-[10.5rem] sm:text-xs',
            )}
            aria-label="Filter by license status"
            title="Operative / Renewal / Deferred / Expired"
          >
            <SelectValue placeholder="License Status" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="all">All License</SelectItem>
            <SelectItem value="operative">Operative</SelectItem>
            <SelectItem value="renewal">Renewal</SelectItem>
            <SelectItem value="deferred">Deferred</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </>
    ) : null

  return (
    <div className={cn(limsPanelClass)}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-2 py-2 text-white sm:px-4 sm:py-2.5 md:px-5">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={limsDarkBarGlowStyle}
        />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

        {/* lg+ (~10″): one row. Below lg: filters wrap to a second line. */}
        <div className="relative flex min-w-0 flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-2.5">
          <div className="flex min-w-0 flex-nowrap items-center gap-1 sm:gap-1.5 md:gap-2.5 lg:min-w-0 lg:flex-1">
            <h1
              className="shrink-0 max-w-[4.5rem] truncate text-sm font-semibold tracking-tight text-white sm:max-w-[9rem] sm:text-base md:max-w-none md:text-lg"
              title={title}
            >
              {title}
            </h1>

            <div className="relative min-w-0 flex-1 basis-0">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400 sm:left-3 sm:h-4 sm:w-4"
                aria-hidden
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className={cn(limsDarkBarSearchClass, 'h-8 min-w-0 pl-7 text-xs sm:pl-9 sm:text-sm')}
                aria-label={searchAriaLabel}
              />
            </div>

            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger
                className={cn(
                  limsDarkBarFieldClass,
                  'h-8 w-[3.5rem] shrink-0 px-1 text-[11px] tabular-nums sm:w-[4.25rem] sm:px-2 sm:text-xs',
                )}
                aria-label="Rows per page"
                title={`${pageSize} per page`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {PAGE_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              className={cn('h-8 shrink-0 gap-1 px-2 sm:gap-1.5 sm:px-3', limsPrimaryBtnClass)}
              size="sm"
              onClick={onNew}
              aria-label={addLabel}
              title={addLabel}
            >
              <Plus size={14} className="shrink-0" />
              <span className="hidden lg:inline">{addLabel}</span>
              <span className="hidden sm:inline lg:hidden">Add</span>
            </Button>
          </div>

          {filterSelects ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1 sm:gap-1.5 lg:shrink-0">
              {filterSelects}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
