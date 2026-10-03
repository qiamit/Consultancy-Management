import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { CmsNewsRow, CmsServiceRow, CmsSettingsRow } from '@/features/tools/cms/cmsTypes'
import { formatPublished } from '@/features/tools/cms/cmsTypes'

export type PublicWebsiteContent = {
  settings: CmsSettingsRow | null
  services: CmsServiceRow[]
  news: CmsNewsRow[]
}

const EMPTY: PublicWebsiteContent = {
  settings: null,
  services: [],
  news: [],
}

function asSettings(value: unknown): CmsSettingsRow | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (row.id == null) return null
  return row as unknown as CmsSettingsRow
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

export function usePublicWebsiteContent() {
  const [content, setContent] = useState<PublicWebsiteContent>(EMPTY)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const { data, error } = await supabase.rpc('get_public_website_content')
        if (error) throw error
        if (cancelled) return

        const payload =
          data && typeof data === 'object' && !Array.isArray(data)
            ? (data as Record<string, unknown>)
            : {}

        setContent({
          settings: asSettings(payload.settings),
          services: asArray<CmsServiceRow>(payload.services),
          news: asArray<CmsNewsRow>(payload.news),
        })
      } catch {
        if (!cancelled) setContent(EMPTY)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return { ...content, loaded }
}

export { formatPublished }
