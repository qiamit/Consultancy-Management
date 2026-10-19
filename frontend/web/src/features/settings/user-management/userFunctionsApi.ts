import { supabase } from '@/lib/supabaseClient'
import type { AccessRole } from './types'

/** POST to an admin-only functions endpoint with the caller's session (x-user-jwt). */
async function callUserFunction(name: string, body: Record<string, unknown>): Promise<unknown> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const accessToken = session?.access_token
  if (!accessToken) throw new Error('Session expired. Please log in again.')

  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'x-user-jwt': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const payload = (await response.json().catch(() => null)) as unknown
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'error' in payload
        ? String((payload as { error?: unknown }).error)
        : `${name} failed (${response.status})`
    throw new Error(message)
  }
  return payload
}

export type CreateUserInput = {
  email: string
  password: string
  full_name: string
  mobile: string
  designation: string
  department_name: string
  division: string
  role: AccessRole
}

export async function createTeamUser(input: CreateUserInput): Promise<void> {
  await callUserFunction('create-user', { ...input, status: 'Active' })
}

export async function deleteTeamUser(userId: string): Promise<void> {
  await callUserFunction('delete-user', { user_id: userId })
}

export async function setTeamUserPassword(
  userId: string,
  password: string,
  mustChange: boolean,
): Promise<void> {
  await callUserFunction('set-user-password', {
    user_id: userId,
    password,
    must_change: mustChange,
  })
}
