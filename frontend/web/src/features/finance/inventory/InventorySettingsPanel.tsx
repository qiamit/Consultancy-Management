import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { loadInventorySettings, saveInventorySettings, type InventorySettings } from '../books/booksApi'

export function InventorySettingsPanel() {
  const [settings, setSettings] = useState<InventorySettings>({ trackFrom: 'none', warnLowStock: true })
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void loadInventorySettings()
      .then(setSettings)
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Inventory settings could not be loaded'))
  }, [])

  const save = () => {
    void saveInventorySettings(settings)
      .then(() => setMessage('Inventory settings saved.'))
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Save failed'))
  }

  return (
    <section className="space-y-3 border border-stone-300 p-3">
      <h3 className="text-sm font-semibold text-stone-800">Inventory</h3>
      <p className="text-xs text-stone-600">Stock starts from the product master. Tracking from the tax invoice stays off until you turn it on.</p>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={settings.trackFrom === 'invoice'}
          onChange={(e) => setSettings((prev) => ({ ...prev, trackFrom: e.target.checked ? 'invoice' : 'none' }))}
        />
        Reduce stock when a tax invoice is saved
      </label>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={settings.warnLowStock}
          onChange={(e) => setSettings((prev) => ({ ...prev, warnLowStock: e.target.checked }))}
        />
        Warn when stock is at or below the low-stock alert
      </label>
      <Button type="button" className="min-h-10" onClick={save}>Save Inventory Settings</Button>
      {message ? <p className="text-sm text-stone-700">{message}</p> : null}
    </section>
  )
}
