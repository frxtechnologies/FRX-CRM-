import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, UserCheck, FolderKanban, CheckSquare, Wallet, FileText, Repeat, BarChart3, Files, History, Settings,
  ChevronDown, ChevronsLeft, ChevronsRight, Bell, Search, LogOut, Menu, CalendarClock, FileBarChart, MoreHorizontal,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useTable } from '../lib/db'
import { update } from '../lib/services'
import { Avatar } from './ui'
import { timeAgo, cn, today } from '../lib/util'
import { IS_DEMO } from '../lib/db'

type Item = { to: string; label: string; icon: any; match?: (p: string) => boolean; badge?: 'followups'; children?: { to: string; label: string; icon: any }[] }
const NAV: Item[] = [
  { to: '/', label: 'Today', icon: LayoutDashboard },
  { to: '/leads', label: 'Leads', icon: Users, match: (p) => p.startsWith('/leads') && p !== '/leads/follow-ups' },
  { to: '/leads/follow-ups', label: 'Follow-ups', icon: CalendarClock, badge: 'followups' },
  { to: '/clients', label: 'Clients', icon: UserCheck },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/finance/pnl', label: 'Money', icon: Wallet, match: (p) => p.startsWith('/finance') },
  { to: '/invoices', label: 'Invoices', icon: FileText },
  { to: '/more', label: 'More', icon: MoreHorizontal, children: [
    { to: '/overview', label: 'Business overview', icon: LayoutDashboard },
    { to: '/subscriptions', label: 'Subscriptions', icon: Repeat },
    { to: '/analytics', label: 'Sales analytics', icon: BarChart3 },
    { to: '/documents', label: 'Documents', icon: Files },
    { to: '/reports', label: 'Reports', icon: FileBarChart },
    { to: '/activity', label: 'Activity log', icon: History },
    { to: '/settings', label: 'Settings', icon: Settings },
  ] },
]

const CRUMBS: Record<string, string> = {
  leads: 'Leads', local: 'Local Leads', international: 'International Leads', 'follow-ups': 'Follow-up Center', clients: 'Clients', projects: 'Projects',
  tasks: 'Tasks', finance: 'Finance', income: 'Income', expenses: 'Expenses', investments: 'Investments', pnl: 'Profit & Loss', invoices: 'Invoices',
  subscriptions: 'Subscriptions', analytics: 'Sales Analytics', documents: 'Documents', activity: 'Activity Log', settings: 'Settings', reports: 'Reports',
  notifications: 'Notifications', new: 'New', overview: 'Business overview', more: 'More',
}

function GlobalSearch() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const leads = useTable('leads'), clients = useTable('clients'), projects = useTable('projects'), invoices = useTable('invoices'), tasks = useTable('business_tasks')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ref.current?.focus() } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 2) return []
    const m = (...v: any[]) => v.some((x) => String(x ?? '').toLowerCase().includes(s))
    return [
      ...leads.filter((l) => m(l.business_name, l.contact_person, l.email, l.phone)).slice(0, 5).map((l) => ({ k: 'Lead', t: l.business_name, to: `/leads/${l.id}` })),
      ...clients.filter((c) => m(c.name, c.company, c.email)).slice(0, 4).map((c) => ({ k: 'Client', t: c.company || c.name, to: `/clients/${c.id}` })),
      ...projects.filter((p) => m(p.name)).slice(0, 4).map((p) => ({ k: 'Project', t: p.name, to: `/projects/${p.id}` })),
      ...invoices.filter((i) => m(i.number, i.client_name, i.client_company)).slice(0, 4).map((i) => ({ k: 'Invoice', t: `${i.number} — ${i.client_company || i.client_name || ''}`, to: `/invoices/${i.id}` })),
      ...tasks.filter((t) => m(t.title)).slice(0, 4).map((t) => ({ k: 'Task', t: t.title, to: '/tasks' })),
    ]
  }, [q, leads, clients, projects, invoices, tasks])
  return (
    <div className="relative w-full max-w-md">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search leads, clients, projects, invoices…  (Ctrl K)" className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#2563EB] focus:bg-white" />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-11 z-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl animate-in">
          {results.length === 0 ? <p className="p-4 text-sm text-slate-500">No matches.</p> : results.map((r, i) => (
            <button key={i} onMouseDown={() => { nav(r.to); setQ('') }} className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-slate-50">
              <span className="w-14 text-[10px] font-semibold uppercase tracking-wide text-[#2563EB]">{r.k}</span><span className="truncate">{r.t}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function NotificationBell() {
  const { user } = useAuth()
  const all = useTable('notifications')
  const mine = useMemo(() => all.filter((n) => !n.user_id || n.user_id === user?.id).sort((a, b) => b.created_at.localeCompare(a.created_at)), [all, user])
  const unread = mine.filter((n) => !(n.read_by || []).includes(user?.id))
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const markRead = (n: any) => update('notifications', n.id, { read_by: [...(n.read_by || []), user!.id] }, { silent: true })
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100">
        <Bell size={18} />
        {unread.length > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#2563EB] px-1 text-[10px] font-semibold text-white">{unread.length > 99 ? '99+' : unread.length}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-40 w-[22rem] max-w-[90vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl animate-in">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="text-sm font-semibold text-[#0B1F3A]">Notifications</span>
              {unread.length > 0 && <button className="text-xs text-[#2563EB]" onClick={() => unread.forEach(markRead)}>Mark all read</button>}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {mine.length === 0 && <p className="p-6 text-center text-sm text-slate-500">You're all caught up.</p>}
              {mine.slice(0, 30).map((n) => {
                const isUnread = !(n.read_by || []).includes(user?.id)
                return (
                  <button key={n.id} onClick={() => { if (isUnread) markRead(n); setOpen(false); if (n.link) nav(n.link) }} className={cn('block w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50', isUnread && 'bg-blue-50/50')}>
                    <div className="flex items-start gap-2">{isUnread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#2563EB]" />}<div className="min-w-0"><p className="text-sm font-medium text-slate-800">{n.title}</p>{n.body && <p className="truncate text-xs text-slate-500">{n.body}</p>}<p className="mt-0.5 text-[11px] text-slate-400">{timeAgo(n.created_at)}</p></div></div>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function Layout() {
  const { user, signOut } = useAuth()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('frxos:sb') === '1')
  const [mobile, setMobile] = useState(false)
  const [menu, setMenu] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const loc = useLocation()
  const fuAll = useTable('follow_ups')
  const dueCount = fuAll.filter((f) => f.status === 'pending' && f.due_date <= today()).length
  useEffect(() => { setMobile(false) }, [loc.pathname])
  useEffect(() => localStorage.setItem('frxos:sb', collapsed ? '1' : '0'), [collapsed])

  const crumbs = loc.pathname.split('/').filter(Boolean)
  const w = collapsed ? 'lg:w-[68px]' : 'lg:w-64'

  const sidebar = (
    <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[#071426] text-slate-300 transition-all duration-200 lg:translate-x-0', w, mobile ? 'translate-x-0' : '-translate-x-full')}>
      <div className="flex h-16 items-center gap-3 border-b border-white/5 px-4">
        <img src="/frx-logo.webp" alt="FRX" className="h-8 w-8 shrink-0 rounded object-contain bg-black" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
        {!collapsed && <div className="leading-tight"><div className="text-sm font-semibold tracking-wide text-white">FRX Business OS</div><div className="text-[10px] uppercase tracking-[0.2em] text-[#60A5FA]">Technologies</div></div>}
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
        {NAV.map((it) => {
          const active = it.match ? it.match(loc.pathname) : it.children ? it.children.some((c) => loc.pathname.startsWith(c.to)) : it.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(it.to)
          if (!it.children) {
            return (
              <NavLink key={it.to} to={it.to} end={it.to === '/'} title={it.label} className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition', active ? 'bg-[#2563EB] text-white shadow' : 'hover:bg-white/5 hover:text-white')}>
                <it.icon size={18} className="shrink-0" />{!collapsed && <span className="flex-1">{it.label}</span>}
                {it.badge === 'followups' && dueCount > 0 && <span className={cn('rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white', collapsed && 'absolute -mt-5 ml-4')}>{dueCount}</span>}
              </NavLink>
            )
          }
          const open = openGroups[it.to] ?? active
          return (
            <div key={it.to}>
              <button onClick={() => (collapsed ? undefined : setOpenGroups({ ...openGroups, [it.to]: !open }))} title={it.label} className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition', active ? 'text-white' : 'hover:bg-white/5 hover:text-white')}>
                <it.icon size={17} className="shrink-0" />
                {!collapsed && <><span className="flex-1 text-left">{it.label}</span><ChevronDown size={14} className={cn('transition', open && 'rotate-180')} /></>}
              </button>
              {(open || collapsed) && (
                <div className={cn('space-y-0.5', !collapsed && 'ml-4 border-l border-white/10 pl-2.5')}>
                  {it.children.map((c) => (
                    <NavLink key={c.to} to={c.to} title={c.label} className={({ isActive }) => cn('flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] transition', isActive ? 'bg-[#2563EB] text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white')}>
                      <c.icon size={15} className="shrink-0" />{!collapsed && c.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>
      <button onClick={() => setCollapsed(!collapsed)} className="hidden items-center gap-2 border-t border-white/5 px-5 py-3 text-xs text-slate-400 hover:text-white lg:flex">
        {collapsed ? <ChevronsRight size={15} /> : <><ChevronsLeft size={15} /> Collapse</>}
      </button>
    </aside>
  )

  return (
    <div className="min-h-full">
      {sidebar}
      {mobile && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobile(false)} />}
      <div className={cn('transition-all duration-200', collapsed ? 'lg:pl-[68px]' : 'lg:pl-64')}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setMobile(true)}><Menu size={20} /></button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <div className="relative">
              <button onClick={() => setMenu(!menu)} className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-slate-100">
                <Avatar name={user?.short_name} color={user?.avatar_color} size={30} />
                <div className="hidden text-left leading-tight sm:block"><div className="text-sm font-medium text-slate-800">{user?.short_name}</div><div className="text-[11px] text-slate-500">{user?.role_title}</div></div>
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 top-12 z-40 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl animate-in">
                    <div className="border-b border-slate-100 px-4 py-2.5"><p className="text-sm font-medium">{user?.full_name}</p><p className="truncate text-xs text-slate-500">{user?.email}</p></div>
                    <Link to="/settings" onClick={() => setMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50"><Settings size={14} /> Settings</Link>
                    <button onClick={signOut} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"><LogOut size={14} /> Sign out</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        {IS_DEMO && <div className="border-b border-amber-200 bg-amber-50 px-6 py-1.5 text-center text-xs text-amber-800">Demo mode — data is stored only in this browser. Add Supabase keys in <code>.env.local</code> to use the shared partner workspace.</div>}
        <main className="mx-auto max-w-[1500px] p-4 sm:p-6">
          {crumbs.length > 0 && (
            <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500">
              <Link to="/" className="hover:text-[#2563EB]">Home</Link>
              {crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1.5">/<span className={i === crumbs.length - 1 ? 'font-medium text-slate-700' : ''}>{CRUMBS[c] || (c.length > 20 ? 'Details' : c)}</span></span>
              ))}
            </nav>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
