/**
 * Automatic renewal reminder emails (functions service, renewalReminders.mjs): settings, today's plan,
 * history per licence and the manual "send now".
 */
import { supabase } from '@/lib/supabaseClient'

export type RenewalReminderSettings = {
  enabled: boolean
  stages: number[]
  sendHourIst: number
  lastRunOn: string | null
}

export type RenewalReminderPlanItem = {
  projectId: string
  firm: string
  email: string
  cml: string
  isLabel: string
  validity: string
  daysLeft: number
  paused: boolean
  stage: number
  /** send: goes out in today's run; done: this stage already went; wait: no stage yet; skip: see reason. */
  action: 'send' | 'done' | 'wait' | 'skip'
  reason: string
  sentStages: number[]
}

export type RenewalReminderPlan = { settings: RenewalReminderSettings; today: string; items: RenewalReminderPlanItem[] }

export type RenewalReminderRow = {
  id: number
  project_id: string
  validity_date: string
  stage: number
  status: 'sending' | 'sent' | 'failed' | 'skipped'
  recipient: string | null
  error: string | null
  created_at: string
}

async function callFunctions<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Session expired. Please sign in again.')
  let response: Response
  try {
    response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1${path}`, {
      ...init,
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        Authorization: `Bearer ${token}`,
        'X-User-Jwt': token,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
  } catch {
    throw new Error('Unable to reach the reminder service. Confirm the Railway functions service is running.')
  }
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null
  if (!response.ok) throw new Error(body?.error || `Reminder service failed (${response.status})`)
  return body as T
}

export const fetchRenewalReminderPlan = () => callFunctions<RenewalReminderPlan>('/renewal-reminders/preview')

export async function sendRenewalReminderNow(projectId: string, to?: string): Promise<{ recipient: string; subject: string }> {
  return callFunctions('/renewal-reminders/send', { method: 'POST', body: JSON.stringify({ projectId, ...(to ? { to } : {}) }) })
}

/** Admin: turn automatic reminders on; reminders already due today are marked skipped (no backlog mail). */
export const enableRenewalReminders = () => callFunctions<{ skipped: number }>('/renewal-reminders/enable', { method: 'POST', body: '{}' })

export async function setRenewalRemindersEnabled(enabled: boolean): Promise<void> {
  const { data: user } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('bis_renewal_reminder_settings')
    .update({ enabled, updated_by: user.user?.id ?? null, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Only an admin can turn automatic reminders on or off.')
}

export async function setRenewalRemindersPaused(projectId: string, paused: boolean): Promise<void> {
  const { error } = await supabase.from('bis_projects').update({ renewal_reminders_paused: paused }).eq('id', projectId)
  if (error) throw new Error(error.message)
}

/** Reminder rows for these licences, newest first. */
export async function fetchRenewalReminderHistory(projectIds: string[]): Promise<RenewalReminderRow[]> {
  if (!projectIds.length) return []
  const { data, error } = await supabase
    .from('bis_renewal_reminders')
    .select('id, project_id, validity_date, stage, status, recipient, error, created_at')
    .in('project_id', projectIds)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)
  return (data ?? []) as RenewalReminderRow[]
}

export const reminderStageLabel = (stage: number) => (stage > 0 ? `${stage}-day` : 'Manual')
