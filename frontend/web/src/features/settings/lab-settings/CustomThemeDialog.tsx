import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  makeCustomThemeId,
  normalizeHexColor,
  type CustomThemeDef,
  type CustomThemeMode,
} from '@/lib/appTheme'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

export function CustomThemeDialog({
  open,
  onOpenChange,
  themes,
  onSave,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  themes: CustomThemeDef[]
  onSave: (def: CustomThemeDef) => void
  onDelete: (id: string) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [accent, setAccent] = useState('#0d9488')
  const [mode, setMode] = useState<CustomThemeMode>('light')

  useEffect(() => {
    if (!open) {
      setEditingId(null)
      return
    }
    if (editingId) {
      const existing = themes.find((t) => t.id === editingId)
      if (existing) {
        setName(existing.name)
        setAccent(existing.accent)
        setMode(existing.mode)
        return
      }
    }
    setName('')
    setAccent('#0d9488')
    setMode('light')
  }, [open, editingId, themes])

  const canSave = name.trim().length > 0

  const handleSave = () => {
    if (!canSave) return
    const def: CustomThemeDef = {
      id: editingId ?? makeCustomThemeId(name),
      name: name.trim(),
      accent: normalizeHexColor(accent),
      mode,
    }
    onSave(def)
    setEditingId(null)
    setName('')
    setAccent('#0d9488')
    setMode('light')
    onOpenChange(false)
  }

  return (
    <DialogContent
      className={cn(limsDialogClass, 'flex max-h-[90vh] w-[min(92vw,32rem)] flex-col gap-0 p-0')}
    >
      <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
        <DialogHeader className="relative pr-8 text-left">
          <DialogTitle className="text-base font-semibold tracking-tight text-white">
            {editingId ? 'Edit Custom Theme' : 'Create Custom Theme'}
          </DialogTitle>
        </DialogHeader>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="custom-theme-name">Theme Name</Label>
          <Input
            id="custom-theme-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Lab Blue"
          />
        </div>

        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="custom-theme-accent">Accent Color</Label>
            <Input
              id="custom-theme-accent"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              placeholder="#0d9488"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="custom-theme-accent-picker">Pick</Label>
            <Input
              id="custom-theme-accent-picker"
              type="color"
              value={normalizeHexColor(accent)}
              onChange={(e) => setAccent(e.target.value)}
              className="!h-8 w-14 cursor-pointer p-1"
              aria-label="Pick accent color"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="custom-theme-mode">Mode</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as CustomThemeMode)}>
            <SelectTrigger id="custom-theme-mode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div
          className="rounded-none border-2 border-stone-500 p-3"
          style={{
            background: normalizeHexColor(accent),
            color: mode === 'dark' ? '#f8fafc' : '#0f172a',
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide opacity-90">Preview</p>
          <p className="mt-1 text-sm font-medium">{name.trim() || 'Custom Theme'}</p>
          <p className="mt-0.5 text-xs opacity-80">
            {normalizeHexColor(accent)} · {mode === 'dark' ? 'Dark' : 'Light'}
          </p>
        </div>

        {themes.length > 0 ? (
          <div className="space-y-2 border-t border-stone-300 pt-4">
            <Label>Saved Custom Themes</Label>
            <ul className="space-y-2">
              {themes.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 border border-stone-400 bg-stone-50 px-2 py-1.5"
                >
                  <span
                    className="h-5 w-5 shrink-0 border border-stone-500"
                    style={{ backgroundColor: t.accent }}
                    aria-hidden
                  />
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-sm text-foreground hover:underline"
                    onClick={() => setEditingId(t.id)}
                  >
                    {t.name}{' '}
                    <span className="text-xs text-muted-foreground">
                      ({t.mode === 'dark' ? 'Dark' : 'Light'})
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn('h-7 w-7 shrink-0 p-0', limsOutlineBtnClass)}
                    aria-label={`Delete ${t.name}`}
                    onClick={() => onDelete(t.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-stone-50 px-4 py-3 sm:justify-end">
        <Button
          type="button"
          variant="outline"
          className={limsOutlineBtnClass}
          onClick={() => {
            setEditingId(null)
            onOpenChange(false)
          }}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className={limsPrimaryBtnClass}
          disabled={!canSave}
          onClick={handleSave}
        >
          {editingId ? 'Update & Apply' : 'Save & Apply'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
