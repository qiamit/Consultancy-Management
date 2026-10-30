import * as React from 'react'
import { cn } from '@/lib/utils'
import { DateInput } from '@/components/ui/date-input'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    // Date fields go through DateInput: no half-typed years (0027) reach the form state.
    const Element = type === 'date' ? DateInput : 'input'
    return (
      <Element
        type={type}
        className={cn(
          'flex h-8 w-full rounded-none border border-input bg-stone-50 px-3 py-1 text-sm shadow-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-amber-600 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'

export { Input }
