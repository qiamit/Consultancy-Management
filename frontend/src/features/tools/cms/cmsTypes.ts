export type CmsServiceRow = {
  id: string
  title: string
  description: string
  icon_name: string | null
  is_active: boolean
  created_at?: string | null
}

export type CmsNewsRow = {
  id: string
  title: string
  content: string
  image_url: string | null
  published_date: string | null
  created_at?: string | null
}

export type CmsSettingsRow = {
  id: number
  company_name: string | null
  logo_url: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  about_text: string | null
  facebook_url: string | null
  linkedin_url: string | null
  instagram_url: string | null
  twitter_url: string | null
}

export function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatPublished(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}
