import { limsPageShellClass, limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

type Props = {
  title: string
  description?: string
}

/** Temporary shell while domain screens are ported from Consultancy Pro. */
export default function ModulePlaceholderPage({ title, description }: Props) {
  return (
    <div className={cn(limsPageShellClass, 'space-y-4 p-4 md:p-6')}>
      <div className={cn(limsPanelClass, 'p-6')}>
        <h1 className="font-jakarta text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {description ??
            'This module is on the Qirlpl LIMS Railway stack. Full workflow screens are being ported next.'}
        </p>
      </div>
    </div>
  )
}
