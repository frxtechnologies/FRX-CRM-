import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, UserCheck, FolderKanban, CheckSquare, Wallet, FileText, Repeat, BarChart3, Files, History, Settings,
  ChevronDown, ChevronsLeft, ChevronsRight, Bell, Search, LogOut, CalendarClock, FileBarChart, MoreHorizontal, KeyRound, PiggyBank,
  ArrowLeft, Plus, X, ChevronRight, MessageCircle,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useTable } from '../lib/db'
import { update } from '../lib/services'
import { Avatar, Modal } from './ui'
import QuickAddLead from './QuickAddLead'
import { timeAgo, cn, today } from '../lib/util'
import { IS_DEMO } from '../lib/db'

type Item = { to: string; label: string; icon: any; match?: (p: string) => boolean; badge?: 'followups' | 'messages'; children?: { to: string; label: string; icon: any }[] }
const NAV: Item[] = [
  { to: '/', label: 'Today', icon: LayoutDashboard },
  { to: '/messages', label: 'Messages', icon: MessageCircle, badge: 'messages' },
  { to: '/leads', label: 'Leads', icon: Users, match: (p) => p.startsWith('/leads') && p !== '/leads/follow-ups' },
  { to: '/leads/follow-ups', label: 'Follow-ups', icon: CalendarClock, badge: 'followups' },
  { to: '/clients', label: 'Clients', icon: UserCheck },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/finance/pnl', label: 'Money', icon: Wallet, match: (p) => p.startsWith('/finance') },
  { to: '/invoices', label: 'Invoices', icon: FileText },
  { to: '/vault', label: 'Vault', icon: KeyRound },
  { to: '/personal', label: 'Personal', icon: PiggyBank },
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

// Phone layout: four tabs you use all day + a "More" sheet for everything else.
const navBy = (to: string) => NAV.find((i) => i.to === to)!
const TABS = ['/', '/leads', '/leads/follow-ups', '/messages'].map(navBy)
const MORE_ITEMS = [...['/clients', '/projects', '/tasks', '/finance/pnl', '/invoices', '/vault', '/personal'].map(navBy), ...(navBy('/more').children || []).map((c) => ({ ...c, match: undefined as undefined }))] as { to: string; label: string; icon: any; match?: (p: string) => boolean }[]

const CRUMBS: Record<string, string> = {
  leads: 'Leads', local: 'Local Leads', international: 'International Leads', 'follow-ups': 'Follow-ups', clients: 'Clients', projects: 'Projects',
  tasks: 'Tasks', finance: 'Money', income: 'Money in', expenses: 'Money out', investments: 'Investments', pnl: 'Profit & Loss', invoices: 'Invoices',
  subscriptions: 'Subscriptions', analytics: 'Sales Analytics', documents: 'Documents', activity: 'Activity Log', settings: 'Settings', reports: 'Reports',
  notifications: 'Notifications', messages: 'Messages', new: 'New', overview: 'Business overview', vault: 'Vault', personal: 'Personal spending', more: 'More',
}
const DETAIL_TITLE: Record<string, string> = { leads: 'Lead', clients: 'Client', projects: 'Project', invoices: 'Invoice' }

function useSearchResults(q: string) {
  const leads = useTable('leads'), clients = useTable('clients'), projects = useTable('projects'), invoices = useTable('invoices'), tasks = useTable('business_tasks')
  return useMemo(() => {
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
}

function GlobalSearch() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ref.current?.focus() } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])
  const results = useSearchResults(q)
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

/** Full-screen search for phones. */
function MobileSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const nav = useNavigate()
  const results = useSearchResults(q)
  useEffect(() => { if (!open) setQ('') }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white lg:hidden" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex items-center gap-2 border-b border-slate-200 p-3">
        <Search size={18} className="shrink-0 text-slate-400" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads, clients, invoices…" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400" />
        <button onClick={onClose} className="rounded-lg p-2 text-slate-500" aria-label="Close search"><X size={20} /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {q.trim().length < 2 && <p className="p-6 text-center text-sm text-slate-400">Type at least 2 letters to search your leads, clients, projects, invoices and tasks.</p>}
        {q.trim().length >= 2 && results.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No matches.</p>}
        {results.map((r, i) => (
          <button key={i} onClick={() => { nav(r.to); onClose() }} className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-4 text-left active:bg-slate-50">
            <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[#2563EB]">{r.k}</span><span className="min-w-0 flex-1 truncate text-base">{r.t}</span><ChevronRight size={16} className="text-slate-300" />
          </button>
        ))}
      </div>
    </div>
  )
}

function NotificationBell() {
  const { user } = useAuth()
  const all = useTable('notifications')
  const mine = useMemo(() => all.filter((n) => n.kind !== 'message' && (!n.user_id || n.user_id === user?.id)).sort((a, b) => b.created_at.localeCompare(a.created_at)), [all, user])
  const unread = mine.filter((n) => !(n.read_by || []).includes(user?.id))
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const markRead = (n: any) => update('notifications', n.id, { read_by: [...(n.read_by || []), user!.id] }, { silent: true })
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} aria-label="Notifications" className="relative flex min-w-11 items-center justify-center rounded-lg p-2 text-slate-200 hover:bg-white/10 lg:text-slate-600 lg:hover:bg-slate-100">
        <Bell size={20} />
        {unread.length > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#2563EB] px-1 text-[10px] font-semibold text-white ring-2 ring-[#071426] lg:ring-white">{unread.length > 99 ? '99+' : unread.length}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+3.75rem)] z-40 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-xl animate-in lg:absolute lg:inset-x-auto lg:right-0 lg:top-11 lg:w-[22rem] lg:rounded-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="text-sm font-semibold text-[#0B1F3A]">Notifications</span>
              {unread.length > 0 && <button className="text-xs text-[#2563EB]" onClick={() => unread.forEach(markRead)}>Mark all read</button>}
            </div>
            <div className="max-h-[60vh] overflow-y-auto lg:max-h-96">
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
  const [menu, setMenu] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const loc = useLocation()
  const nav = useNavigate()
  const fuAll = useTable('follow_ups')
  const dueCount = fuAll.filter((f) => f.status === 'pending' && f.due_date <= today()).length
  const msgsAll = useTable('messages')
  const unreadMsgs = msgsAll.filter((m) => m.sender_id !== user?.id && !m.read_at && !m.deleted).length
  const badgeCount = (b?: string) => (b === 'followups' ? dueCount : b === 'messages' ? unreadMsgs : 0)
  const inChat = loc.pathname.startsWith('/messages')
  useEffect(() => { setMoreOpen(false); setQuickOpen(false); setSearchOpen(false); setMenu(false); window.scrollTo(0, 0) }, [loc.pathname])
  useEffect(() => localStorage.setItem('frxos:sb', collapsed ? '1' : '0'), [collapsed])

  const crumbs = loc.pathname.split('/').filter(Boolean)
  const last = crumbs[crumbs.length - 1]
  const isDetail = crumbs.length >= 2 && (!CRUMBS[last] || last === 'new') && !(crumbs[0] === 'leads' && crumbs.length === 2 && CRUMBS[last])
  const title = isDetail ? (last === 'new' ? `New ${DETAIL_TITLE[crumbs[0]]?.toLowerCase() || ''}`.trim() : last === 'edit' ? `Edit ${DETAIL_TITLE[crumbs[0]]?.toLowerCase() || ''}`.trim() : DETAIL_TITLE[crumbs[0]] || 'Details') : CRUMBS[last] || (loc.pathname === '/' ? 'Today' : 'FRX OS')
  const isActive = (it: { to: string; match?: (p: string) => boolean }) => (it.match ? it.match(loc.pathname) : it.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(it.to))
  const w = collapsed ? 'lg:w-[68px]' : 'lg:w-64'

  const sidebar = (
    <aside className={cn('fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-[#071426] text-slate-300 transition-all duration-200 lg:flex', w)}>
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
                {badgeCount(it.badge) > 0 && <span className={cn('rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white', collapsed && 'absolute -mt-5 ml-4')}>{badgeCount(it.badge)}</span>}
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
      <div className={cn('transition-all duration-200', collapsed ? 'lg:pl-[68px]' : 'lg:pl-64')}>
        <header className="sticky top-0 z-20 border-b border-white/10 bg-[#071426] text-white lg:border-slate-200 lg:bg-white/90 lg:text-slate-800 lg:backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="flex h-14 items-center gap-2 px-3 sm:px-6 lg:h-16 lg:gap-3 lg:px-6">
            {(isDetail || inChat)
              ? <button onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} aria-label="Back" className="-ml-1 rounded-lg p-2 text-white hover:bg-white/10 lg:hidden"><ArrowLeft size={22} /></button>
              : <img src="/frx-logo.webp" alt="" className="h-8 w-8 shrink-0 rounded bg-black object-contain lg:hidden" />}
            <div className="min-w-0 flex-1 truncate text-[17px] font-semibold lg:hidden">{title}</div>
            <div className="hidden w-full max-w-md lg:block"><GlobalSearch /></div>
            <div className="ml-auto flex shrink-0 items-center gap-0.5 lg:gap-1">
              <button onClick={() => setSearchOpen(true)} aria-label="Search" className="rounded-lg p-2 text-slate-200 hover:bg-white/10 lg:hidden"><Search size={20} /></button>
              <NotificationBell />
              <div className="relative">
                <button onClick={() => setMenu(!menu)} aria-label="Account" className="flex min-w-11 items-center justify-center gap-2 rounded-lg p-1.5 hover:bg-white/10 lg:hover:bg-slate-100">
                  <Avatar name={user?.short_name} color={user?.avatar_color} size={30} />
                  <div className="hidden text-left leading-tight lg:block"><div className="text-sm font-medium text-slate-800">{user?.short_name}</div><div className="text-[11px] text-slate-500">{user?.role_title}</div></div>
                </button>
                {menu && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                    <div className="absolute right-0 top-12 z-40 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-slate-800 shadow-xl animate-in">
                      <div className="border-b border-slate-100 px-4 py-2.5"><p className="text-sm font-medium text-slate-800">{user?.full_name}</p><p className="truncate text-xs text-slate-500">{user?.email}</p></div>
                      <Link to="/settings" onClick={() => setMenu(false)} className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-slate-50"><Settings size={15} /> Settings</Link>
                      <button onClick={signOut} className="flex w-full items-center gap-2 px-4 py-3 text-sm text-red-600 hover:bg-red-50"><LogOut size={15} /> Sign out</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>
        {IS_DEMO && <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800 sm:px-6">Demo mode — data stays in this browser<span className="hidden sm:inline">. Add Supabase keys in <code>.env.local</code> to use the shared partner workspace.</span></div>}
        <main className="mx-auto max-w-[1500px] px-4 pb-32 pt-4 sm:px-6 lg:p-6">
          {crumbs.length > 0 && (
            <nav className="mb-3 hidden items-center gap-1.5 text-xs text-slate-500 lg:flex">
              <Link to="/" className="hover:text-[#2563EB]">Home</Link>
              {crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1.5">/<span className={i === crumbs.length - 1 ? 'font-medium text-slate-700' : ''}>{CRUMBS[c] || (c.length > 20 ? 'Details' : c)}</span></span>
              ))}
            </nav>
          )}
          <Outlet />
        </main>
      </div>

      {/* ---------- phone only: quick add button + bottom tab bar ---------- */}
      {!isDetail && !inChat && <button onClick={() => setQuickOpen(true)} aria-label="Quick add" className="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-lg shadow-blue-900/30 active:scale-95 lg:hidden" style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
        <Plus size={28} />
      </button>}
      {!inChat && <nav data-mobile-nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-5">
          {TABS.map((it) => {
            const active = isActive(it)
            return (
              <NavLink key={it.to} to={it.to} end={it.to === '/'} className={cn('relative flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 text-[11px] font-medium', active ? 'text-[#2563EB]' : 'text-slate-500')}>
                <span className="relative"><it.icon size={23} strokeWidth={active ? 2.4 : 1.9} />{badgeCount(it.badge) > 0 && <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-4 text-white">{badgeCount(it.badge) > 99 ? '99+' : badgeCount(it.badge)}</span>}</span>
                {it.label}
              </NavLink>
            )
          })}
          <button onClick={() => setMoreOpen(true)} className={cn('flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 text-[11px] font-medium', MORE_ITEMS.some(isActive) ? 'text-[#2563EB]' : 'text-slate-500')}>
            <MoreHorizontal size={23} />More
          </button>
        </div>
      </nav>}

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Everything else">
        <div className="grid grid-cols-3 gap-2.5">
          {MORE_ITEMS.map((it) => (
            <NavLink key={it.to} to={it.to} className={cn('flex min-h-[5.25rem] flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 text-center text-xs font-medium', isActive(it) ? 'border-[#2563EB] bg-blue-50 text-[#2563EB]' : 'border-slate-200 bg-slate-50 text-slate-700 active:bg-slate-100')}>
              <it.icon size={24} />{it.label}
            </NavLink>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 p-3 text-sm"><div className="flex min-w-0 items-center gap-2.5"><Avatar name={user?.short_name} color={user?.avatar_color} size={34} /><div className="min-w-0"><div className="truncate font-medium text-slate-800">{user?.full_name}</div><div className="truncate text-xs text-slate-500">{user?.role_title}</div></div></div>
          <button onClick={signOut} className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 font-medium text-red-600"><LogOut size={16} /> Sign out</button></div>
      </Modal>

      <Modal open={quickOpen} onClose={() => setQuickOpen(false)} title="Quick add">
        <QuickAddLead onSaved={() => setQuickOpen(false)} />
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {([['New task', '/?task=1'], ['Personal expense', '/personal'], ['Business expense', '/finance/expenses'], ['New invoice', '/invoices/new']] as const).map(([l, to]) => (
            <button key={l} onClick={() => { setQuickOpen(false); nav(to) }} className="flex min-h-12 items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 text-left text-sm font-medium text-slate-700 active:bg-slate-100">{l}<ChevronRight size={16} className="text-slate-300" /></button>
          ))}
        </div>
      </Modal>

      <MobileSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
