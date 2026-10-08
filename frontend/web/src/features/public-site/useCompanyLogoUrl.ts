import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

const LOGO_BUCKET = 'laboratory-files'

export function useCompanyLogoUrl() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const { data, error } = await supabase.rpc('get_public_company_brand')
        if (error) throw error

        const row = Array.isArray(data) ? data[0] : data
        const path =
          row && typeof row === 'object' && 'logo_path' in row
            ? String((row as { logo_path?: unknown }).logo_path ?? '').trim()
            : ''
        if (!path) {
          if (!cancelled) setLogoUrl(null)
          return
        }
        if (/^https?:\/\//i.test(path)) {
          if (!cancelled) setLogoUrl(path)
          return
        }

        const signed = await supabase.storage.from(LOGO_BUCKET).createSignedUrl(path, 60 * 60)
        if (cancelled) return
        setLogoUrl(signed.data?.signedUrl ?? null)
      } catch {
        if (!cancelled) setLogoUrl(null)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return logoUrl
}
