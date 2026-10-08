import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useShowAiButtons } from '@/hooks/useShowAiAssistant'
import { limsOutlineBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { MaintenanceCheckpointRow } from './maintenanceChecklist'
import {
  generateMaintenanceChecklist,
  type MaintenanceEquipmentContext,
} from './generateMaintenanceChecklist'

export function ConductMaintenanceAssistant({
  equipment,
  onApplyChecklist,
  onStatusMessage,
  disabled,
}: {
  equipment: MaintenanceEquipmentContext
  onApplyChecklist: (nextRows: MaintenanceCheckpointRow[]) => void
  onStatusMessage?: (message: string | null, isError?: boolean) => void
  disabled?: boolean
}) {
  const showAiButtons = useShowAiButtons()
  const [loading, setLoading] = useState(false)

  const handleGenerate = async () => {
    if (loading) return
    setLoading(true)
    onStatusMessage?.('Generating maintenance checklist…', false)

    try {
      const rows = await generateMaintenanceChecklist(equipment)
      onApplyChecklist(rows)
      onStatusMessage?.(`Generated ${rows.length} check point(s) with OK status.`, false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate checklist.'
      onStatusMessage?.(msg, true)
    } finally {
      setLoading(false)
    }
  }

  if (!showAiButtons) return null

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn('h-8 gap-1.5', limsOutlineBtnClass)}
      disabled={disabled || loading}
      onClick={() => void handleGenerate()}
      aria-label="Generate maintenance checklist with AI"
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="text-primary" />}
      {loading ? 'Generating…' : 'AI Assistant'}
    </Button>
  )
}
