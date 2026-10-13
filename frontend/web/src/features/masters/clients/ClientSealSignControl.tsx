import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  loadClientSealSignSettings,
  setClientSealSignEnabled,
  uploadClientSealSignImage,
  type ClientSealSignSettings,
} from './clientsApi'

export function ClientSealSignControl({ clientId }: { clientId: string | null }) {
  const [settings, setSettings] = useState<ClientSealSignSettings>({ enabled: false, storagePath: null, signedUrl: null })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    if (!clientId) return () => { active = false }
    void loadClientSealSignSettings(clientId)
      .then((value) => { if (active) setSettings(value) })
      .catch((error: unknown) => { if (active) toast.error(error instanceof Error ? error.message : 'Could not load the seal/sign image.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [clientId])

  if (!clientId) {
    return <p className="mt-4 text-sm text-stone-600">Save this client first to add an optional Form 1 seal/sign image.</p>
  }

  async function refresh() {
    if (!clientId) return
    setSettings(await loadClientSealSignSettings(clientId))
  }

  async function toggleEnabled(enabled: boolean) {
    if (!clientId || (enabled && !settings.storagePath)) return
    setSaving(true)
    try {
      await setClientSealSignEnabled(clientId, enabled)
      setSettings((current) => ({ ...current, enabled }))
      toast.success(enabled ? 'Seal/sign image will print on Form 1.' : 'Form 1 will leave the seal box blank.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the seal/sign setting.')
    } finally {
      setSaving(false)
    }
  }

  async function upload(file?: File) {
    if (!clientId || !file) return
    setSaving(true)
    try {
      await uploadClientSealSignImage(clientId, file)
      await refresh()
      toast.success('Client seal/sign image uploaded.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload the seal/sign image.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-5 rounded-sm border border-stone-300 bg-stone-50 p-3" aria-labelledby="client-seal-sign-heading">
      <h3 id="client-seal-sign-heading" className="text-sm font-semibold text-stone-900">Form 1 Client Seal / Sign</h3>
      <p className="mt-1 text-xs text-stone-600">This image prints only for this client and only when enabled. Otherwise, the box stays blank for a physical stamp.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-sm font-medium text-stone-800">
          <input
            type="checkbox"
            checked={settings.enabled}
            disabled={loading || saving || !settings.storagePath}
            onChange={(event) => void toggleEnabled(event.target.checked)}
            className="size-4 accent-amber-700"
          />
          Print uploaded image on Form 1
        </label>
        <Label htmlFor="client-seal-sign-upload" className="sr-only">Upload seal/sign image</Label>
        <Input
          id="client-seal-sign-upload"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={saving}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.currentTarget.value = ''
            void upload(file)
          }}
          className="h-auto max-w-md cursor-pointer bg-white text-xs file:mr-3 file:rounded-none file:border-0 file:bg-stone-200 file:px-3 file:py-2 file:text-xs"
        />
        {settings.storagePath ? <span className="text-xs text-emerald-800">Image uploaded</span> : null}
        {loading || saving ? <span className="text-xs text-stone-500">{loading ? 'Loading…' : 'Saving…'}</span> : null}
      </div>
      {settings.signedUrl ? (
        <img src={settings.signedUrl} alt="Client seal or sign preview" className="mt-3 max-h-24 max-w-48 border border-stone-300 bg-white object-contain p-1" />
      ) : null}
      {settings.enabled && !settings.storagePath ? <p className="mt-2 text-xs text-amber-800">Upload an image before enabling it for print.</p> : null}
    </section>
  )
}
