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
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'
import {
  clientAiTriggerClass,
  clientDarkBarFieldClass,
  clientDarkBarSearchClass,
  clientPanelClass,
  clientPrimaryBtnClass,
} from './clientsFormUi'
import { cn } from '@/lib/utils'

export function ClientsHeaderBar({
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  onNew,
  assistantContext,
  onAssistantDataChanged,
}: {
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  onNew: () => void
  assistantContext: string
  onAssistantDataChanged?: () => void
}) {
  const pageSizeSelect = (
    <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
      <SelectTrigger
        className={cn(clientDarkBarFieldClass, 'h-9 w-[6.5rem] shrink-0 sm:w-[7.5rem]')}
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
    <div className={cn(clientPanelClass)}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)',
          }}
        />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

        <div className="relative flex flex-col gap-2.5 sm:gap-3">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <h1 className="min-w-0 truncate text-base font-semibold tracking-tight text-white sm:text-lg">
              Client Directory
            </h1>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <QiAssistant
                page="clients"
                pageTitle="Client Directory"
                contextSummary={assistantContext}
                suggestedQuestions={[
                  'Add a new client ABC Labs Pvt Ltd with Dr balance',
                  'Summarize clients in the current list',
                  'Update payment term for a client by company name',
                  'What is the difference between Dr and Cr balance?',
                ]}
                onDataChanged={onAssistantDataChanged}
                triggerVariant="icon"
                triggerClassName={clientAiTriggerClass}
              />
              <Button
                type="button"
                className={cn('gap-1.5 shrink-0 sm:gap-2', clientPrimaryBtnClass)}
                size="sm"
                onClick={onNew}
                aria-label="Add New Client"
              >
                <Plus size={14} />
                <span className="hidden sm:inline">Add New Client</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </div>
          </div>

          <div className="flex w-full min-w-0 items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-md md:max-w-lg">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                aria-hidden
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search Clients"
                className={cn(clientDarkBarSearchClass, 'pl-9')}
                aria-label="Search Clients"
              />
            </div>
            {pageSizeSelect}
          </div>
        </div>
      </div>
    </div>
  )
}
