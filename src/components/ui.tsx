import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { X, CheckCircle2, AlertCircle, Inbox, Loader2 } from 'lucide-react'
import { cn } from '../lib/util'
import { useTable } from '../lib/db'

// ---------- toast ----------
type T = { id: number; msg: string; kind: 'ok' | 'err' }
const ToastCtx = createContext<(msg: string, kind?: 'ok' | 'err') => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([])
  const push = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, msg, kind }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === 'err' ? 6000 : 3000)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {items.map((i) => (
          <div key={i.id} className={cn('flex max-w-sm items-start gap-2 rounded-lg px-4 py-3 text-sm text-white shadow-lg animate-in', i.kind === 'ok' ? 'bg-[#0B1F3A]' : 'bg-red-600')}>
            {i.kind === 'ok' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#60A5FA]" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
            <span>{i.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

// ---------- primitives ----------
export function Button({ variant = 'primary', size = 'md', loading, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; loading?: boolean }) {
  const v = {
    primary: 'bg-[#2563EB] text-white hover:bg-[#1d4ed8] shadow-sm',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-white text-red-600 border border-red-200 hover:bg-red-50',
  }[variant]
  return (
    <button {...p} disabled={p.disabled || loading} className={cn('inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:opacity-50', size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm', v, className)}>
      {loading && <Loader2 size={14} className="animate-spin" />}{children}
    </button>
  )
}

export const Card = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>{children}</div>
)
export const CardHeader = ({ title, action, sub }: { title: string; action?: ReactNode; sub?: string }) => (
  <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
    <div><h3 className="text-sm font-semibold text-[#0B1F3A]">{title}</h3>{sub && <p className="text-xs text-slate-500">{sub}</p>}</div>{action}
  </div>
)

const TONES: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700', blue: 'bg-blue-50 text-blue-700', green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-700', violet: 'bg-violet-50 text-violet-700', sky: 'bg-sky-50 text-sky-700',
}
export const Badge = ({ tone = 'slate', children }: { tone?: keyof typeof TONES | string; children: ReactNode }) => (
  <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium', TONES[tone] || TONES.slate)}>{children}</span>
)
export function statusTone(s?: string): string {
  const x = (s || '').toLowerCase()
  if (['won / converted', 'paid', 'completed', 'active', 'done', 'received'].includes(x)) return 'green'
  if (['lost', 'not interested', 'overdue', 'expired', 'cancelled', 'high'].includes(x)) return 'red'
  if (['interested', 'negotiation', 'proposal sent', 'meeting scheduled', 'in progress', 'partially paid', 'sent', 'medium', 'expiring soon', 'waiting', 'revision', 'testing'].includes(x)) return 'amber'
  if (['follow-up required', 'contacted', 'called', 'email sent', 'whatsapp sent', 'dm sent', 'planning', 'onboarding'].includes(x)) return 'blue'
  return 'slate'
}

export const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15'
export const Label = ({ children }: { children: ReactNode }) => <label className="mb-1 block text-xs font-medium text-slate-600">{children}</label>
export const Field = ({ label, children, className }: { label: string; children: ReactNode; className?: string }) => (
  <div className={className}><Label>{label}</Label>{children}</div>
)
export const Select = ({ value, onChange, options, placeholder, className }: { value: any; onChange: (v: string) => void; options: (string | { value: string; label: string })[]; placeholder?: string; className?: string }) => (
  <select className={cn(inputCls, className)} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
    {placeholder !== undefined && <option value="">{placeholder}</option>}
    {options.map((o) => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
)
export function PartnerSelect({ value, onChange, placeholder = 'Unassigned', className }: { value: any; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const ps = useTable('profiles')
  return <Select className={className} value={value} onChange={onChange} placeholder={placeholder} options={ps.map((p) => ({ value: p.id, label: p.short_name }))} />
}
export function ClientSelect({ value, onChange, placeholder = 'No client' }: { value: any; onChange: (v: string) => void; placeholder?: string }) {
  const cs = useTable('clients')
  return <Select value={value} onChange={onChange} placeholder={placeholder} options={cs.map((c) => ({ value: c.id, label: c.company || c.name }))} />
}
export function ProjectSelect({ value, onChange, clientId, placeholder = 'No project' }: { value: any; onChange: (v: string) => void; clientId?: string; placeholder?: string }) {
  const ps = useTable('projects')
  return <Select value={value} onChange={onChange} placeholder={placeholder} options={ps.filter((p) => !clientId || p.client_id === clientId).map((p) => ({ value: p.id, label: p.name }))} />
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    // stop the page behind a sheet from scrolling
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = prev }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#071426]/50 sm:items-start sm:overflow-y-auto sm:p-8 sm:backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cn('flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl animate-sheet sm:max-h-none sm:animate-in sm:rounded-xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-xl')}>
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-300 sm:hidden" />
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3.5 sm:py-4">
          <h2 className="text-base font-semibold text-[#0B1F3A]">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:overflow-visible">{children}</div>
        {footer && <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 px-5 pt-3 sm:flex sm:justify-end sm:pb-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>{footer}</div>}
      </div>
    </div>
  )
}

export const Empty = ({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) => (
  <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
    <div className="mb-3 rounded-full bg-blue-50 p-3 text-[#2563EB]"><Inbox size={22} /></div>
    <p className="text-sm font-medium text-slate-800">{title}</p>
    {hint && <p className="mt-1 max-w-sm text-xs text-slate-500">{hint}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
)

export const PageHeader = ({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div><h1 className="text-xl font-semibold tracking-tight text-[#0B1F3A]">{title}</h1>{sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}</div>
    <div className="flex flex-wrap items-center gap-2">{actions}</div>
  </div>
)

export const Stat = ({ label, value, sub, tone, icon }: { label: string; value: ReactNode; sub?: string; tone?: 'green' | 'red' | 'blue'; icon?: ReactNode }) => (
  <Card className="p-4">
    <div className="flex items-center justify-between text-xs font-medium text-slate-500"><span>{label}</span><span className="text-slate-400">{icon}</span></div>
    <div className={cn('mt-1.5 text-xl font-semibold tracking-tight', tone === 'green' ? 'text-emerald-600' : tone === 'red' ? 'text-red-600' : 'text-[#0B1F3A]')}>{value}</div>
    {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
  </Card>
)

export const Tabs = ({ tabs, value, onChange }: { tabs: { id: string; label: string; count?: number }[]; value: string; onChange: (id: string) => void }) => (
  <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
    {tabs.map((t) => (
      <button key={t.id} onClick={() => onChange(t.id)} className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition', value === t.id ? 'border-[#2563EB] text-[#2563EB]' : 'border-transparent text-slate-500 hover:text-slate-800')}>
        {t.label}{t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{t.count}</span>}
      </button>
    ))}
  </div>
)

export const Avatar = ({ name, color = '#2563EB', size = 28 }: { name?: string; color?: string; size?: number }) => (
  <span className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}>{(name || '?').slice(0, 1).toUpperCase()}</span>
)
export function PartnerChip({ id }: { id?: string | null }) {
  const ps = useTable('profiles')
  const p = ps.find((x) => x.id === id)
  if (!p) return <span className="text-xs text-slate-400">Unassigned</span>
  return <span className="inline-flex items-center gap-1.5 text-xs text-slate-700"><Avatar name={p.short_name} color={p.avatar_color} size={18} />{p.short_name}</span>
}
