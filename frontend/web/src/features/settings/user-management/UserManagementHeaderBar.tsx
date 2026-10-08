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
import {
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsDarkBarSearchClass,
  limsPanelClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

type UserManagementHeaderBarProps = {
  searchQuery: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  setUserDialogOpen: (open: boolean) => void
}

export function UserManagementHeaderBar({
  searchQuery,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  setUserDialogOpen,
}: UserManagementHeaderBarProps) {
  return (
    <div className={cn(limsPanelClass)}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
        <div className="relative flex flex-wrap items-center gap-2 lg:flex-nowrap sm:gap-3">
          <h1 className="shrink-0 text-base font-semibold tracking-tight text-white sm:text-lg">
            User Management
          </h1>

          <div className="order-3 flex w-full min-w-0 items-center gap-2 sm:order-none sm:mx-1 sm:w-auto sm:max-w-none sm:flex-none">
            <div className="relative min-w-0 flex-1 sm:w-[70%] sm:max-w-[19.5rem] sm:flex-none">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                aria-hidden
              />
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search Team Members"
                className={cn(limsDarkBarSearchClass, 'pl-9')}
                aria-label="Search Team Members"
              />
            </div>
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger
                className={cn(limsDarkBarFieldClass, 'h-9 w-[7.5rem] shrink-0')}
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
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button
              type="button"
              className={cn('gap-2 shrink-0', limsPrimaryBtnClass)}
              size="sm"
              onClick={() => setUserDialogOpen(true)}
              aria-label="Add User"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Add User</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
