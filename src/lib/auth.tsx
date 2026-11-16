import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { IS_DEMO, supabase, loadAll, rawInsert, snapshot, resetRealtime, clearCache, useTable, type Row } from './db'
import { setCurrentUserId } from './services'
import { lockVault } from './vault'

type Ctx = { user: Row | null; loading: boolean; error: string | null; mfaPending: boolean; verifyMfa: (code: string) => Promise<string | null>; signIn: (email: string, pw: string) => Promise<string | null>; demoSignIn: (shortName: string) => Promise<void>; signOut: () => Promise<void> }
const AuthCtx = createContext<Ctx>(null as any)
export const useAuth = () => useContext(AuthCtx)

const DEMO_SESSION = 'frxos:demo:session' // sessionStorage: each tab can be a different partner

async function ensureDemoProfiles() {
  if (snapshot('profiles').length) return
  await rawInsert('profiles', { id: 'feroze', full_name: 'Feroze Mohiuddin', short_name: 'Feroze', email: 'feroze@demo.local', role_title: 'Founder & CEO', avatar_color: '#2563EB' })
  await rawInsert('profiles', { id: 'raaef', full_name: 'Raaef Usman', short_name: 'Raaef', email: 'raaef@demo.local', role_title: 'Co-founder & Director', avatar_color: '#0EA5E9' })
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mfa, setMfa] = useState<{ factorId: string } | null>(null)
  const profiles = useTable('profiles')

  async function boot(id: string | null) {
    if (!id) { setUserId(null); setCurrentUserId(undefined); setMfa(null); setLoading(false); return }
    // Two-step verification: if this account has an authenticator app set up, hold the session at the code screen
    // until the 6-digit code has been verified. No business data is loaded before that.
    if (!IS_DEMO) {
      try {
        const { data: a } = await supabase!.auth.mfa.getAuthenticatorAssuranceLevel()
        if (a && a.nextLevel === 'aal2' && a.currentLevel !== 'aal2') {
          const { data: f } = await supabase!.auth.mfa.listFactors()
          const fac = f?.totp?.find((x) => x.status === 'verified')
          if (fac) { setMfa({ factorId: fac.id }); setUserId(null); setLoading(false); return }
        }
      } catch { /* if assurance level cannot be read, fall through; the database still enforces access */ }
    }
    setMfa(null)
    try { await loadAll() } catch (e: any) {
      setError(/schema cache|does not exist|PGRST205/i.test(e?.message || '') ? 'setup' : e?.message || 'Could not load data')
      if (!IS_DEMO) await supabase!.auth.signOut()
      setUserId(null); setCurrentUserId(undefined); setLoading(false); return
    }
    if (IS_DEMO) await ensureDemoProfiles()
    else if (!snapshot('profiles').some((p) => p.id === id)) {
      setError('not-partner'); await supabase!.auth.signOut(); resetRealtime(); setUserId(null); setCurrentUserId(undefined); setLoading(false); return
    }
    setError(null)
    setCurrentUserId(id)
    setUserId(id)
    setLoading(false)
  }

  useEffect(() => {
    if (IS_DEMO) {
      ;(async () => {
        await loadAll(); await ensureDemoProfiles()
        const s = sessionStorage.getItem(DEMO_SESSION)
        await boot(s)
      })()
    } else {
      supabase!.auth.getSession().then(({ data }) => boot(data.session?.user.id ?? null))
      const { data: sub } = supabase!.auth.onAuthStateChange((_e, session) => { boot(session?.user.id ?? null) })
      return () => sub.subscription.unsubscribe()
    }
  }, [])

  const user = userId ? profiles.find((p) => p.id === userId) ?? null : null
  // Signed in to Auth but not listed as a partner => no access (RLS also blocks every read).
  const value: Ctx = {
    user, loading, error, mfaPending: !!mfa,
    verifyMfa: async (code) => {
      if (!mfa) return 'Nothing to verify'
      const { data: ch, error: e1 } = await supabase!.auth.mfa.challenge({ factorId: mfa.factorId })
      if (e1) return e1.message
      const { error: e2 } = await supabase!.auth.mfa.verify({ factorId: mfa.factorId, challengeId: ch.id, code: code.trim() })
      if (e2) return 'That code is not right, or it has expired. Wait for the next one and try again.'
      const { data } = await supabase!.auth.getSession()
      await boot(data.session?.user.id ?? null)
      return null
    },
    signIn: async (email, pw) => {
      setError(null)
      const { error } = await supabase!.auth.signInWithPassword({ email, password: pw })
      return error ? error.message : null
    },
    demoSignIn: async (short) => {
      const p = snapshot('profiles').find((x) => x.short_name === short)
      if (!p) return
      sessionStorage.setItem(DEMO_SESSION, p.id)
      await boot(p.id)
    },
    signOut: async () => {
      lockVault(); clearCache(); setMfa(null)
      if (IS_DEMO) sessionStorage.removeItem(DEMO_SESSION)
      else await supabase!.auth.signOut()
      resetRealtime(); setUserId(null); setCurrentUserId(undefined)
    },
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}
