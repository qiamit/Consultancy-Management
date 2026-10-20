import { useLayoutEffect, useRef, type ComponentProps } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/** A textarea whose height follows its content (no inner scrollbar until `maxHeight`), as tall as the text needs. */
export function AutoGrowTextarea({ className, value, maxHeight = '60vh', style, ...props }: ComponentProps<typeof Textarea> & { maxHeight?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value])
  return <Textarea ref={ref} rows={1} value={value} style={{ maxHeight, ...style }} className={cn('min-h-[2.25rem] resize-none overflow-y-auto', className)} {...props} />
}
