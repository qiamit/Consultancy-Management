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
  return (
    <div className={cn(clientPanelClass)}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-2 py-2 text-white sm:px-4 sm:py-2.5 md:px-5">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)',
          }}
        />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

        <div className="relative flex min-w-0 flex-nowrap items-center gap-1 sm:gap-1.5 md:gap-2.5">
          <h1
            className="shrink-0 max-w-[4.5rem] truncate text-sm font-semibold tracking-tight text-white sm:max-w-[9rem] sm:text-base md:max-w-none md:text-lg"
            title="Client Directory"
          >
            <span className="md:hidden">Clients</span>
            <span className="hidden md:inline">Client Directory</span>
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
              placeholder="Search Client | Address | Email | Mobile | Scale | Type"
              className={cn(clientDarkBarSearchClass, 'h-8 min-w-0 pl-7 text-xs sm:pl-9 sm:text-sm')}
              aria-label="Search by client, address, email, mobile, scale, or type"
            />
          </div>

          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger
              className={cn(
                clientDarkBarFieldClass,
                'h-8 w-[3.5rem] shrink-0 px-1 text-[11px] tabular-nums sm:w-[4.25rem] sm:px-2 sm:text-xs',
              )}
              aria-label="Rows per page"
              title={`${pageSize} per page`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>

          <QiAssistant
            page="clients"
            pageTitle="Client Directory"
            contextSummary={assistantContext}
            suggestedQuestions={[
              'Save this business card photo as a new client',
              'Add a new client ABC Labs Pvt Ltd with Dr balance',
              'Summarize clients in the current list',
              'Update payment term for a client by company name',
            ]}
            onDataChanged={onAssistantDataChanged}
            enableImageImport
            imageAttachHint="business card or company photo"
            triggerVariant="icon"
            triggerClassName={cn(clientAiTriggerClass, 'h-8 w-8 shrink-0')}
          />

          <Button
            type="button"
            className={cn('h-8 shrink-0 gap-1 px-2 sm:gap-1.5 sm:px-3', clientPrimaryBtnClass)}
            size="sm"
            onClick={onNew}
            aria-label="Add New Client"
            title="Add New Client"
          >
            <Plus size={14} className="shrink-0" />
            <span className="hidden lg:inline">Add New Client</span>
            <span className="hidden sm:inline lg:hidden">Add</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
