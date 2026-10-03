import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  designation: string
  departmentName: string
  division: string
  profileName: string
  profileReady: boolean
}

const AuthContext = createContext<AuthState | null>(null)

function clearAuthStorage() {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i)
      if (k) keys.push(k)
    }

    for (const k of keys) {
      if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
        localStorage.removeItem(k)
      }
    }
  } catch {
    // ignore
  }
}

function sameUserId(prev: User | null, next: User | null): boolean {
  return Boolean(prev?.id && next?.id && prev.id === next.id)
}

function sameSession(prev: Session | null, next: Session | null): boolean {
  if (!prev || !next) return prev === next
  return (
    prev.access_token === next.access_token &&
    prev.refresh_token === next.refresh_token &&
    prev.user?.id === next.user?.id
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [designation, setDesignation] = useState('')
  const [departmentName, setDepartmentName] = useState('')
  const [division, setDivision] = useState('')
  const [profileName, setProfileName] = useState('')
  const [profileReady, setProfileReady] = useState(false)
  const profileUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    let canceled = false

    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) {
          const message = String((error as { message?: unknown }).message ?? '')
          if (message.toLowerCase().includes('refresh token')) {
            clearAuthStorage()
          }

          if (!canceled) {
            setSession(null)
            setUser(null)
            setLoading(false)
          }
          return
        }

        if (!canceled) {
          setSession(data.session)
          setUser(data.session?.user ?? null)
          setLoading(false)
        }
      } catch {
        clearAuthStorage()
        if (!canceled) {
          setSession(null)
          setUser(null)
          setLoading(false)
        }
      }
    }

    void init()

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (String(event) === 'TOKEN_REFRESH_FAILED') {
        clearAuthStorage()
        profileUserIdRef.current = null
        setSession(null)
        setUser(null)
        setLoading(false)
        return
      }

      setSession((prev) => {
        const next = newSession
        if (sameSession(prev, next)) return prev
        return next
      })
      setUser((prev) => {
        const next = newSession?.user ?? null
        if (sameUserId(prev, next)) return prev
        return next
      })
      setLoading(false)
    })

    return () => {
      canceled = true
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const userId = user?.id ?? null

    if (!userId || !user) {
      profileUserIdRef.current = null
      setDesignation('')
      setDepartmentName('')
      setDivision('')
      setProfileName('')
      setProfileReady(true)
      try {
        localStorage.removeItem('userDesignation')
        localStorage.removeItem('userDepartment')
        localStorage.removeItem('userDivision')
      } catch { /* ignore */ }
      return
    }

    const isSameUser = profileUserIdRef.current === userId
    if (!isSameUser) {
      setProfileReady(false)
    }

    let canceled = false

    const meta = user.user_metadata as Record<string, unknown>
    const metaDes = typeof meta?.designation === 'string' ? meta.designation.trim() : ''
    const metaDeptRaw =
      typeof meta?.department_name === 'string'
        ? meta.department_name
        : typeof meta?.department === 'string'
          ? meta.department
          : ''
    const metaDept = metaDeptRaw.trim()
    const metaDivision = typeof meta?.division === 'string' ? meta.division.trim() : ''
    const metaName = typeof meta?.full_name === 'string' ? meta.full_name.trim() : ''

    const applyFromProfile = (
      profileDes: string,
      profileDept: string,
      profileDivision: string,
      profileNameVal: string,
    ) => {
      if (canceled) return
      profileUserIdRef.current = userId
      setDesignation(profileDes)
      setDepartmentName(profileDept || metaDept)
      setDivision(profileDivision || metaDivision)
      setProfileName(profileNameVal || metaName || user?.email || '')
      setProfileReady(true)
      const dept = profileDept || metaDept
      const div = profileDivision || metaDivision
      if (profileDes) {
        try { localStorage.setItem('userDesignation', profileDes) } catch { /* ignore */ }
      }
      if (dept) {
        try { localStorage.setItem('userDepartment', dept) } catch { /* ignore */ }
      }
      if (div) {
        try { localStorage.setItem('userDivision', div) } catch { /* ignore */ }
      }
    }

    const cachedDesignation = (() => {
      try {
        return localStorage.getItem('userDesignation')
      } catch {
        return null
      }
    })()

    const cachedDepartment = (() => {
      try {
        return localStorage.getItem('userDepartment')
      } catch {
        return null
      }
    })()

    const cachedDivision = (() => {
      try {
        return localStorage.getItem('userDivision')
      } catch {
        return null
      }
    })()

    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('designation, department_name, division, full_name')
        .eq('id', userId)
        .maybeSingle()

      if (canceled) return
      if (error) {
        applyFromProfile(
          String(cachedDesignation ?? ''),
          metaDept || String(cachedDepartment ?? ''),
          metaDivision || String(cachedDivision ?? ''),
          metaName || user.email || '',
        )
        return
      }

      const row = data as {
        designation?: unknown
        department_name?: unknown
        division?: unknown
        full_name?: unknown
      } | null
      const profileDes = typeof row?.designation === 'string' ? row.designation.trim() : ''
      const profileDept =
        typeof row?.department_name === 'string' ? row.department_name.trim() : ''
      const profileDivision = typeof row?.division === 'string' ? row.division.trim() : ''
      const profileFullName = typeof row?.full_name === 'string' ? row.full_name.trim() : ''
      const finalDes = profileDes || String(cachedDesignation ?? '')
      const finalDept = profileDept || metaDept || String(cachedDepartment ?? '')
      const finalDivision = profileDivision || metaDivision || String(cachedDivision ?? '')
      applyFromProfile(
        finalDes,
        finalDept,
        finalDivision,
        profileFullName || metaName || user.email || '',
      )
    }

    void fetchProfile()

    return () => {
      canceled = true
    }
  }, [user?.id])

  const value: AuthState = useMemo(
    () => ({
      user,
      session,
      loading,
      designation,
      departmentName,
      division,
      profileName,
      profileReady,
    }),
    [user, session, loading, designation, departmentName, division, profileName, profileReady],
  )

  return createElement(AuthContext.Provider, { value }, children)
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signUp(
  email: string,
  password: string,
  metadata?: Record<string, unknown>,
) {
  return supabase.auth.signUp({
    email,
    password,
    options: metadata ? { data: metadata } : undefined,
  })
}

export async function signOut() {
  return supabase.auth.signOut()
}
