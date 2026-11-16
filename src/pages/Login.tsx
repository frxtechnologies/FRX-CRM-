import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { IS_DEMO } from '../lib/db'
import { Button, inputCls, Label } from '../components/ui'

export default function Login() {
  const { signIn, demoSignIn, error: authError } = useAuth()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <div className="flex min-h-full items-center justify-center bg-[#071426] p-4" style={{ backgroundImage: 'radial-gradient(60% 50% at 70% 10%, rgba(37,99,235,.35), transparent)' }}>
      <div className="w-full max-w-md animate-in">
        <div className="mb-8 text-center">
          <img src="/frx-logo.webp" alt="FRX Technologies" className="mx-auto h-28 w-28 rounded-2xl object-contain" />
          <h1 className="mt-4 text-2xl font-semibold text-white">FRX Business OS</h1>
          <p className="mt-1 text-sm text-slate-400">Private workspace for FRX Technologies partners</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-2xl">
          {IS_DEMO ? (
            <>
              <div className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                <b>Demo mode.</b> Supabase isn't configured, so data lives only in this browser. Pick a partner below — open a second tab and sign in as the other partner to see live sync. Production sign-in uses individual passwords via Supabase Auth.
              </div>
              <p className="mb-3 text-sm font-medium text-slate-700">Continue as</p>
              <div className="grid gap-2.5">
                <Button onClick={() => demoSignIn('Feroze')} className="justify-start py-3">Feroze Mohiuddin <span className="ml-auto text-xs opacity-70">Founder &amp; CEO</span></Button>
                <Button variant="secondary" onClick={() => demoSignIn('Raaef')} className="justify-start py-3">Raaef Usman <span className="ml-auto text-xs opacity-60">Co-founder &amp; Director</span></Button>
              </div>
            </>
          ) : (
            <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(await signIn(email, pw)); setBusy(false) }}>
              <div><Label>Email</Label><input className={inputCls} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></div>
              <div><Label>Password</Label><input className={inputCls} type="password" required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></div>
              {authError === 'setup' && <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><b>The database isn't set up yet.</b> Open your Supabase project → SQL Editor, paste the contents of <code>supabase/schema.sql</code> and run it. Then create the two partner users and add their profile rows (see the README).</div>}
              {authError === 'not-partner' && <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><b>This account isn't a partner yet.</b> Its sign-in works, but it has no row in the <code>profiles</code> table. Add one (README → Going live, step 3).</div>}
              {authError && authError !== 'setup' && authError !== 'not-partner' && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{authError}</p>}
              {err && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{err}</p>}
              <Button type="submit" loading={busy} className="w-full py-2.5">Sign in</Button>
            </form>
          )}
          <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-slate-400"><ShieldCheck size={12} /> Access restricted to FRX partners</p>
        </div>
      </div>
    </div>
  )
}
