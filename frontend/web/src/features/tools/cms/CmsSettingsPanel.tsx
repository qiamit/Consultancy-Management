import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { loadCompanyPrintContext } from '@/features/bis/print/loadCompanyPrintContext'
import { supabase } from '@/lib/supabaseClient'
import { limsFieldClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { CmsSettingsRow } from './cmsTypes'

type FormState = Omit<Record<keyof CmsSettingsRow, string>, 'id'>

const emptyForm: FormState = {
  company_name: '',
  logo_url: '',
  contact_email: '',
  contact_phone: '',
  address: '',
  about_text: '',
  facebook_url: '',
  linkedin_url: '',
  instagram_url: '',
  twitter_url: '',
}

export default function CmsSettingsPanel() {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filling, setFilling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.from('website_settings').select('*').eq('id', 1).maybeSingle()
    if (err) {
      setError(err.message)
    } else if (data) {
      const row = data as CmsSettingsRow
      setForm({
        company_name: row.company_name ?? '',
        logo_url: row.logo_url ?? '',
        contact_email: row.contact_email ?? '',
        contact_phone: row.contact_phone ?? '',
        address: row.address ?? '',
        about_text: row.about_text ?? '',
        facebook_url: row.facebook_url ?? '',
        linkedin_url: row.linkedin_url ?? '',
        instagram_url: row.instagram_url ?? '',
        twitter_url: row.twitter_url ?? '',
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const set = (key: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const fillFromCompanySettings = async () => {
    setFilling(true)
    try {
      const company = await loadCompanyPrintContext()
      const addressParts = [
        company.address,
        [company.district, company.state].filter(Boolean).join(', '),
        company.pinCode ? `PIN ${company.pinCode}` : '',
        company.country,
      ]
        .map((p) => p.trim())
        .filter(Boolean)
      setForm((prev) => ({
        ...prev,
        company_name: company.companyName || prev.company_name,
        contact_email: company.email || prev.contact_email,
        contact_phone: company.phone || prev.contact_phone,
        address: addressParts.join('\n') || prev.address,
        logo_url: company.logoUrl || prev.logo_url,
      }))
      toast.success('Filled from Lab / Company Settings. Review and Save.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to load company settings')
    } finally {
      setFilling(false)
    }
  }

  const save = async () => {
    setSaving(true)
    const payload: Record<string, string | number | null> = { id: 1, updated_at: new Date().toISOString() }
    for (const [k, v] of Object.entries(form)) payload[k] = v.trim() || null
    const { error: err } = await supabase.from('website_settings').upsert(payload, { onConflict: 'id' })
    setSaving(false)
    if (err) {
      toast.error(err.message)
      return
    }
    toast.success('Site settings saved')
  }

  const field = (key: keyof FormState, label: string, type = 'text') => (
    <div className="space-y-1">
      <Label htmlFor={`cms-${key}`}>{label}</Label>
      <Input id={`cms-${key}`} type={type} className={limsFieldClass} value={form[key]} onChange={set(key)} />
    </div>
  )

  if (loading) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="space-y-5 p-4">
      <h2 className="font-jakarta text-lg font-semibold text-foreground">Site Settings</h2>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <h3 className="border-b border-stone-300 pb-1 text-sm font-semibold uppercase tracking-wide text-amber-800">
            Company &amp; Contact
          </h3>
          {field('company_name', 'Company name')}
          {field('logo_url', 'Logo URL / path')}
          {field('contact_email', 'Email address', 'email')}
          {field('contact_phone', 'Phone number')}
          <div className="space-y-1">
            <Label htmlFor="cms-address">Address</Label>
            <Textarea
              id="cms-address"
              rows={3}
              className="rounded-none border-stone-500 bg-stone-50"
              value={form.address}
              onChange={set('address')}
            />
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="border-b border-stone-300 pb-1 text-sm font-semibold uppercase tracking-wide text-amber-800">
            Social Links
          </h3>
          {field('linkedin_url', 'LinkedIn URL', 'url')}
          {field('facebook_url', 'Facebook URL', 'url')}
          {field('instagram_url', 'Instagram URL', 'url')}
          {field('twitter_url', 'Twitter / X URL', 'url')}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="cms-about">About us text</Label>
        <Textarea
          id="cms-about"
          rows={8}
          className="rounded-none border-stone-500 bg-stone-50"
          value={form.about_text}
          onChange={set('about_text')}
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-300 pt-3">
        <Button
          type="button"
          variant="outline"
          className="rounded-none border-stone-500"
          disabled={saving || filling}
          onClick={() => void fillFromCompanySettings()}
        >
          {filling ? 'Loading…' : 'Fill from Company Settings'}
        </Button>
        <Button type="button" className={limsPrimaryBtnClass} disabled={saving || filling} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )
}
