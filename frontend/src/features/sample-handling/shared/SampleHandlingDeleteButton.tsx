import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useIsLaboratoryDirector } from '@/components/lims/LaboratoryDirectorOnly'
import { limsDeleteBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

export function SampleHandlingDeleteButton({
  disabled,
  onClick,
}: {
  disabled?: boolean
  onClick: () => void
}) {
  const isLaboratoryDirector = useIsLaboratoryDirector()
  if (!isLaboratoryDirector) return null

  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      aria-label="Delete selected"
      className={cn(limsDeleteBtnClass)}
    >
      <Trash2 size={14} /> Delete
    </Button>
  )
}
