import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { limsFieldClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

type PasswordInputProps = {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: 'current-password' | 'new-password'
  autoFocus?: boolean
  className?: string
}

/** Password field with a show / hide toggle. The value is never trimmed. */
export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input
        id={props.id}
        type={visible ? 'text' : 'password'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete ?? 'new-password'}
        autoFocus={props.autoFocus}
        className={cn(limsFieldClass, 'pr-10', props.className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 transition-colors hover:text-stone-800"
        aria-label={visible ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}
