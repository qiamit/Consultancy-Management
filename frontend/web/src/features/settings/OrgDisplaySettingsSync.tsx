import { useEffect, useEffectEvent, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabaseClient'
import { useAppTheme } from '@/lib/AppThemeProvider'
import { useAppDateFormat } from '@/lib/AppDateFormatProvider'
import { useAppCurrency } from '@/lib/AppCurrencyProvider'
import { isAppThemeId, normalizeAppThemeId } from '@/lib/appTheme'
import { fetchOrgDisplaySettings, type OrgDisplaySettings } from './lab-settings/labSettingsDb'

/**
 * Owner, 25 Nov 2026: "Jo Theme Admin Select karo wo hi Sab par Apply ho". The theme, date / time format and currency
 * are kept in each browser (localStorage), and used to be read from the database only when Company Settings was
 * opened, so Inspection Engineers and other staff without that module kept their own device's look. Once per
 * signed-in user (each app load), this reads the admin's saved values and applies them. The admin can still try a
 * theme in Company Settings; it reaches everyone after Save, on their next load.
 */
export function OrgDisplaySettingsSync() {
  const { user, role, profileReady } = useAuth()
  const { setTheme, saveCustomTheme } = useAppTheme()
  const { setDateFormat, setTimeFormat } = useAppDateFormat()
  const { setCurrency } = useAppCurrency()
  const appliedFor = useRef<string | null>(null)
  const userId = user?.id ?? null

  const apply = useEffectEvent((org: OrgDisplaySettings) => {
    const themeId = org.theme.toLowerCase()
    if (org.customTheme && org.customTheme.id === themeId) saveCustomTheme(org.customTheme)
    else if (themeId && isAppThemeId(themeId)) setTheme(normalizeAppThemeId(themeId))
    if (org.dateFormat) setDateFormat(org.dateFormat)
    if (org.timeFormat) setTimeFormat(org.timeFormat)
    if (org.currency) setCurrency(org.currency)
  })

  useEffect(() => {
    if (!userId) {
      appliedFor.current = null
      return
    }
    // Customers (portal) cannot read lab_settings; their portal keeps the device's own look.
    if (!profileReady || role === 'customer' || appliedFor.current === userId) return
    let canceled = false
    void fetchOrgDisplaySettings(supabase).then((org) => {
      if (canceled || !org) return
      appliedFor.current = userId
      apply(org)
    })
    return () => {
      canceled = true
    }
  }, [userId, profileReady, role])

  return null
}
