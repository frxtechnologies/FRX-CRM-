import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, Check, CheckCheck, ClipboardList, Copy, CornerUpLeft, FileText, FolderKanban, CheckSquare, Link2, MessageCircle, Paperclip, Pencil, Search, Send, Trash2, UserCheck, Users, X, ChevronRight } from 'lucide-react'
import { missingTables, resolveFileUrl, uploadFile, useTable, type Row } from '../lib/db'
import { create, notify, update } from '../lib/services'
import { addDays, cn, fmtDate, fmtTime, isoDate, safeUrl, today } from '../lib/util'
import { Avatar, Card, Modal, inputCls, useToast } from '../components/ui'
import { useAuth } from '../lib/auth'

type RefType = 'lead' | 'client' | 'project' | 'invoice' | 'task'
const REF_ICON: Record<RefType, any> = { lead: Users, client: UserCheck, project: FolderKanban, invoice: FileText, task: CheckSquare }
const REF_PATH: Record<RefType, (id: string) => string> = { lead: (id) => `/leads/${id}`, client: (id) => `/clients/${id}`, project: (id) => `/projects/${id}`, invoice: (id) => `/invoices/${id}`, task: () => '/tasks' }
const REF_WORD: Record<RefType, string> = { lead: 'Lead', client: 'Client', project: 'Project', invoice: 'Invoice', task: 'Task' }

const dayKey = (iso: string) => isoDate(new Date(iso))
const dayLabel = (k: string) => (k === today() ? 'Today' : k === addDays(today(), -1) ? 'Yesterday' : fmtDate(k))
const preview = (m: Row) => (m.deleted ? 'Message deleted' : m.body ? String(m.body).slice(0, 100) : m.attachment_name ? `\u{1F4CE} ${m.attachment_name}` : m.ref_label ? `\u{1F517} ${m.ref_label}` : '')

function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g)
  return <>{parts.map((p, i) => (/^https?:\/\//.test(p) && safeUrl(p) ? <a key={i} href={safeUrl(p)!} target="_blank" rel="noopener noreferrer" className="break-all underline">{p}</a> : <span key={i}>{p}</span>))}</>
}

function Attachment({ m, mine }: { m: Row; mine: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { let on = true; resolveFileUrl(m.attachment_url).then((u) => on && setUrl(u)); return () => { on = false } }, [m.attachment_url])
  const isImg = String(m.attachment_mime || '').startsWith('image/')
  if (isImg) return url ? <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={m.attachment_name || 'photo'} className="mb-1 max-h-72 w-full rounded-xl object-cover" /></a> : <div className="mb-1 h-32 animate-pulse rounded-xl bg-black/10" />
  return (
    <a href={url || '#'} target="_blank" rel="noopener noreferrer" className={cn('mb-1 flex items-center gap-2.5 rounded-xl p-2.5 text-sm', mine ? 'bg-white/15' : 'bg-slate-100')}>
      <FileText size={22} className="shrink-0" /><span className="min-w-0 flex-1 truncate font-medium">{m.attachment_name || 'File'}</span>
    </a>
  )
}

function RecordPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (r: { type: RefType; id: string; label: string }) => void }) {
  const [kind, setKind] = useState<RefType>('lead')
  const [q, setQ] = useState('')
  const leads = useTable('leads'), clients = useTable('clients'), projects = useTable('projects'), invoices = useTable('invoices'), tasks = useTable('business_tasks')
  const items = useMemo(() => {
    const src: Record<RefType, { id: string; label: string; sub?: string }[]> = {
      lead: leads.map((r) => ({ id: r.id, label: r.business_name, sub: r.status })),
      client: clients.map((r) => ({ id: r.id, label: r.company || r.name, sub: r.category })),
      project: projects.map((r) => ({ id: r.id, label: r.name, sub: r.status })),
      invoice: invoices.map((r) => ({ id: r.id, label: `${r.number}${r.client_company ? ' · ' + r.client_company : ''}`, sub: r.status })),
      task: tasks.filter((r) => !['Completed', 'Cancelled'].includes(r.status)).map((r) => ({ id: r.id, label: r.title, sub: r.status })),
    }
    const s = q.trim().toLowerCase()
    return src[kind].filter((i) => !s || i.label.toLowerCase().includes(s)).slice(0, 40)
  }, [kind, q, leads, clients, projects, invoices, tasks])
  return (
    <Modal open={open} onClose={onClose} title="Share a record">
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {(Object.keys(REF_WORD) as RefType[]).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={cn('shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium', kind === k ? 'border-[#0B1F3A] bg-[#0B1F3A] text-white' : 'border-slate-200 text-slate-600')}>{REF_WORD[k]}s</button>
        ))}
      </div>
      <div className="relative mb-2"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${REF_WORD[kind].toLowerCase()}s…`} className={cn(inputCls, 'pl-9')} /></div>
      <div className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
        {items.length === 0 && <p className="p-5 text-center text-sm text-slate-500">Nothing found.</p>}
        {items.map((i) => (
          <button key={i.id} onClick={() => { onPick({ type: kind, id: i.id, label: `${REF_WORD[kind]}: ${i.label}` }); setQ('') }} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50">
            <div className="min-w-0 flex-1"><div className="truncate font-medium text-slate-800">{i.label}</div>{i.sub && <div className="text-xs text-slate-500">{i.sub}</div>}</div><ChevronRight size={16} className="text-slate-300" />
          </button>
        ))}
      </div>
    </Modal>
  )
}

export default function Messages() {
  const { user } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const msgs = useTable('messages'), profiles = useTable('profiles')
  const me = user?.id || ''
  const partner = profiles.find((p) => p.id !== me)

  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<Row | null>(null)
  const [editing, setEditing] = useState<Row | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [attach, setAttach] = useState<{ url: string; name: string; mime: string; size: number } | null>(null)
  const [share, setShare] = useState<{ type: RefType; id: string; label: string } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [limit, setLimit] = useState(150)
  const [atBottom, setAtBottom] = useState(true)
  const [newBelow, setNewBelow] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const lastCount = useRef(0)
  const firstUnread = useRef<string | null | undefined>(undefined)

  const all = useMemo(() => [...msgs].sort((a, b) => a.created_at.localeCompare(b.created_at)), [msgs])
  const byId = useMemo(() => new Map(all.map((m) => [m.id, m])), [all])
  const visible = all.slice(-limit)
  const unreadIds = all.filter((m) => m.sender_id !== me && !m.read_at && !m.deleted).map((m) => m.id)

  // remember where the "new messages" line goes (once, from what was unread when the chat was opened)
  if (firstUnread.current === undefined && me && (all.length || profiles.length)) firstUnread.current = all.find((m) => m.sender_id !== me && !m.read_at)?.id ?? null

  // mark messages from your partner as read while you are looking at the chat
  useEffect(() => {
    if (!me) return
    const mark = () => {
      if (document.visibilityState !== 'visible') return
      for (const id of unreadIds) update('messages', id, { read_at: new Date().toISOString() }, { silent: true }).catch(() => {})
    }
    mark()
    document.addEventListener('visibilitychange', mark)
    return () => document.removeEventListener('visibilitychange', mark)
  }, [unreadIds.join(','), me])

  const scrollBottom = (smooth = false) => { const b = boxRef.current; if (b) b.scrollTo({ top: b.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); setNewBelow(0) }
  useLayoutEffect(() => { scrollBottom() }, [])
  useEffect(() => {
    const n = all.length
    if (n > lastCount.current && lastCount.current !== 0) {
      const last = all[n - 1]
      if (atBottom || last.sender_id === me) scrollBottom(true); else setNewBelow((x) => x + (n - lastCount.current))
    } else if (lastCount.current === 0) scrollBottom()
    lastCount.current = n
  }, [all.length])
  useEffect(() => { const t = taRef.current; if (t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 140) + 'px' } }, [text])

  if (missingTables.has('messages')) return (
    <Card className="mx-auto mt-4 max-w-xl p-6 text-sm"><h2 className="font-semibold text-[#0B1F3A]">One more database step</h2><p className="mt-2 text-slate-600">Chat needs its own table. In Supabase → SQL Editor, run <code className="rounded bg-slate-100 px-1">supabase/10-messages.sql</code>, then reload this page.</p></Card>
  )
  if (profiles.length && !partner) return <Card className="mt-4 p-6 text-sm text-slate-600">Chat needs two partner accounts. Only one is set up so far.</Card>

  async function pickFile(f?: File | null) {
    if (!f) return
    setUploading(true)
    try { const url = await uploadFile(f); setAttach({ url, name: f.name, mime: f.type, size: f.size }) } catch (e: any) { toast(e.message || 'Could not attach that file', 'err') } finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function send() {
    const body = text.trim()
    if (!body && !attach && !share) return
    if (busy) return
    setBusy(true)
    try {
      if (editing) {
        await update('messages', editing.id, { body, edited: true }, { silent: true })
        setEditing(null)
      } else {
        const row = await create('messages', {
          sender_id: me, body, reply_to: replyTo?.id ?? null,
          ...(attach ? { attachment_url: attach.url, attachment_name: attach.name, attachment_mime: attach.mime, attachment_size: attach.size } : {}),
          ...(share ? { ref_type: share.type, ref_id: share.id, ref_label: share.label } : {}),
        }, { silent: true })
        // phone alert for your partner (the database turns this notification into a push)
        if (partner) await notify({ title: user?.short_name || 'FRX Business OS', body: preview(row), link: '/messages', user_id: partner.id, kind: 'message' })
      }
      setText(''); setReplyTo(null); setAttach(null); setShare(null)
      taRef.current?.focus()
    } catch (e: any) { toast(e.message || 'Message not sent', 'err') } finally { setBusy(false) }
  }

  async function makeTask(m: Row, forId: string) {
    const t = String(m.body || '').trim()
    try {
      await create('business_tasks', { title: t.slice(0, 80), description: t.length > 80 ? t : '', assigned_to: forId, priority: 'medium', category: 'Other', status: 'To Do', due_date: null })
      if (forId !== me) await notify({ title: `New task for you: ${t.slice(0, 60)}`, body: `From ${user?.short_name} (chat)`, link: '/tasks', user_id: forId, kind: 'task' })
      toast('Task created'); setSelected(null)
    } catch (e: any) { toast(e.message || 'Could not create the task', 'err') }
  }

  async function remove(m: Row) {
    if (!window.confirm('Delete this message for both of you?')) return
    try { await update('messages', m.id, { deleted: true, body: '', attachment_url: null, attachment_name: null, attachment_mime: null, attachment_size: null, ref_type: null, ref_id: null, ref_label: null }, { silent: true }); setSelected(null) } catch (e: any) { toast(e.message || 'Could not delete', 'err') }
  }

  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  const canSend = (text.trim() || attach || share) && !busy && !uploading

  let lastDay = ''
  return (
    <div className="fixed inset-x-0 bottom-0 top-[calc(env(safe-area-inset-top)+3.5rem)] z-20 flex flex-col bg-[#E9EFF7] lg:static lg:inset-auto lg:h-[calc(100vh-7rem)] lg:overflow-hidden lg:rounded-2xl lg:border lg:border-slate-200">
      {/* header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <Avatar name={partner?.short_name} color={partner?.avatar_color} size={38} />
        <div className="min-w-0 flex-1 leading-tight"><div className="truncate font-semibold text-[#0B1F3A]">{partner?.full_name || 'Your partner'}</div><div className="truncate text-xs text-slate-500">{partner?.role_title} {'·'} private chat between the two of you</div></div>
      </div>

      {/* messages */}
      <div ref={boxRef} onScroll={(e) => { const b = e.currentTarget; const near = b.scrollHeight - b.scrollTop - b.clientHeight < 120; setAtBottom(near); if (near) setNewBelow(0) }} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5">
        {all.length > limit && <div className="mb-3 text-center"><button onClick={() => setLimit(limit + 150)} className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-[#2563EB] shadow-sm">Show earlier messages</button></div>}
        {all.length === 0 && (
          <div className="mx-auto mt-10 max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
            <MessageCircle size={30} className="mx-auto text-[#2563EB]" />
            <p className="mt-2 font-semibold text-[#0B1F3A]">Your private partner chat</p>
            <p className="mt-1 text-sm text-slate-500">Say hello to {partner?.short_name || 'your partner'}. You can send photos, files and CRM records, and every message arrives as a phone alert.</p>
            <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">Don't send passwords here. Keep them in the Vault.</p>
          </div>
        )}
        {visible.map((m) => {
          const mine = m.sender_id === me
          const k = dayKey(m.created_at)
          const showDay = k !== lastDay; lastDay = k
          const quoted = m.reply_to ? byId.get(m.reply_to) : null
          const isSel = selected === m.id
          const RefIcon = m.ref_type ? REF_ICON[m.ref_type as RefType] : null
          return (
            <div key={m.id}>
              {showDay && <div className="my-3 text-center"><span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm">{dayLabel(k)}</span></div>}
              {firstUnread.current === m.id && <div className="my-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-[#2563EB]"><span className="h-px flex-1 bg-[#2563EB]/30" />New messages<span className="h-px flex-1 bg-[#2563EB]/30" /></div>}
              <div className={cn('mb-1.5 flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[85%] sm:max-w-[68%]')}>
                  <button onClick={() => !m.deleted && setSelected(isSel ? null : m.id)} className={cn('block w-full rounded-2xl px-3 py-2 text-left text-[15px] shadow-sm', mine ? 'rounded-br-md bg-[#2563EB] text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800', m.deleted && '!bg-slate-100 !text-slate-400 italic')}>
                    {quoted && !m.deleted && (
                      <div className={cn('mb-1.5 rounded-lg border-l-4 px-2.5 py-1.5 text-xs', mine ? 'border-white/60 bg-white/15' : 'border-[#2563EB] bg-slate-50')}>
                        <div className="font-semibold">{quoted.sender_id === me ? 'You' : partner?.short_name}</div><div className="truncate opacity-80">{preview(quoted)}</div>
                      </div>
                    )}
                    {m.deleted ? <span>This message was deleted</span> : (
                      <>
                        {m.attachment_url && <Attachment m={m} mine={mine} />}
                        {m.ref_id && RefIcon && (
                          <span onClick={(e) => { e.stopPropagation(); nav(REF_PATH[m.ref_type as RefType](m.ref_id)) }} className={cn('mb-1 flex cursor-pointer items-center gap-2.5 rounded-xl p-2.5', mine ? 'bg-white/15' : 'bg-blue-50 text-[#0B1F3A]')}>
                            <RefIcon size={20} className="shrink-0" /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.ref_label}</span><span className="shrink-0 text-xs font-medium opacity-80">Open</span>
                          </span>
                        )}
                        {m.body && <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]"><Linkified text={m.body} /></div>}
                      </>
                    )}
                    <div className={cn('mt-0.5 flex items-center justify-end gap-1 text-[11px]', mine && !m.deleted ? 'text-blue-100' : 'text-slate-400')}>
                      {m.edited && !m.deleted && <span>edited</span>}<span>{fmtTime(m.created_at)}</span>
                      {mine && !m.deleted && (m.read_at ? <CheckCheck size={15} className="text-sky-200" aria-label="Seen" /> : <Check size={15} className="opacity-70" aria-label="Sent" />)}
                    </div>
                  </button>
                  {isSel && !m.deleted && (
                    <div className={cn('mt-1 flex flex-wrap gap-1.5', mine ? 'justify-end' : 'justify-start')}>
                      {([
                        ['Reply', CornerUpLeft, () => { setReplyTo(m); setEditing(null); setSelected(null); taRef.current?.focus() }, true],
                        ['Copy', Copy, () => { navigator.clipboard?.writeText(m.body); toast('Copied'); setSelected(null) }, !!m.body],
                        ['Task for me', ClipboardList, () => makeTask(m, me), !!m.body],
                        [`Task for ${partner?.short_name || 'partner'}`, ClipboardList, () => partner && makeTask(m, partner.id), !!m.body && !!partner],
                        ['Edit', Pencil, () => { setEditing(m); setReplyTo(null); setText(m.body); setSelected(null); taRef.current?.focus() }, mine && !!m.body],
                        ['Delete', Trash2, () => remove(m), mine],
                      ] as [string, any, () => void, boolean][]).filter((a) => a[3]).map(([label, Icon, fn]) => (
                        <button key={label} onClick={fn} className={cn('flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-xs font-medium shadow-sm', label === 'Delete' ? 'border-red-100 text-red-600' : 'border-slate-200 text-slate-700')}><Icon size={13} />{label}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {!atBottom && (
          <button onClick={() => scrollBottom(true)} className="sticky bottom-2 left-full -mr-1 ml-auto flex h-11 items-center gap-1.5 rounded-full bg-white px-3.5 text-xs font-semibold text-[#2563EB] shadow-lg">
            <ArrowDown size={16} />{newBelow > 0 ? `${newBelow} new` : 'Latest'}
          </button>
        )}
      </div>

      {/* composer */}
      <div className="shrink-0 border-t border-slate-200 bg-white px-3 pt-2" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        {(replyTo || editing || attach || share) && (
          <div className="mb-2 space-y-1.5">
            {replyTo && <div className="flex items-center gap-2 rounded-xl border-l-4 border-[#2563EB] bg-slate-50 px-3 py-1.5 text-xs"><div className="min-w-0 flex-1"><div className="font-semibold text-[#2563EB]">Replying to {replyTo.sender_id === me ? 'yourself' : partner?.short_name}</div><div className="truncate text-slate-600">{preview(replyTo)}</div></div><button onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="p-1 text-slate-400"><X size={16} /></button></div>}
            {editing && <div className="flex items-center gap-2 rounded-xl border-l-4 border-amber-400 bg-amber-50 px-3 py-1.5 text-xs"><div className="min-w-0 flex-1 font-semibold text-amber-800">Editing message</div><button onClick={() => { setEditing(null); setText('') }} aria-label="Cancel edit" className="p-1 text-amber-700"><X size={16} /></button></div>}
            {attach && <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-1.5 text-xs"><Paperclip size={15} className="shrink-0 text-slate-500" /><span className="min-w-0 flex-1 truncate font-medium text-slate-700">{attach.name}</span><button onClick={() => setAttach(null)} aria-label="Remove attachment" className="p-1 text-slate-400"><X size={16} /></button></div>}
            {share && <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-1.5 text-xs"><Link2 size={15} className="shrink-0 text-[#2563EB]" /><span className="min-w-0 flex-1 truncate font-medium text-[#0B1F3A]">{share.label}</span><button onClick={() => setShare(null)} aria-label="Remove record" className="p-1 text-slate-400"><X size={16} /></button></div>}
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <input ref={fileRef} type="file" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
          <button onClick={() => fileRef.current?.click()} disabled={!!editing || uploading} aria-label="Attach a photo or file" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 active:bg-slate-100 disabled:opacity-40"><Paperclip size={21} className={uploading ? 'animate-pulse' : ''} /></button>
          <button onClick={() => setPickerOpen(true)} disabled={!!editing} aria-label="Share a CRM record" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 active:bg-slate-100 disabled:opacity-40"><Link2 size={21} /></button>
          <textarea ref={taRef} value={text} rows={1} onChange={(e) => setText(e.target.value)} placeholder={`Message ${partner?.short_name || ''}`.trim()}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !coarse) { e.preventDefault(); send() } }}
            className="max-h-36 min-h-11 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-base outline-none placeholder:text-slate-400 focus:border-[#2563EB] focus:bg-white" />
          <button onClick={send} disabled={!canSend} aria-label="Send" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-white shadow active:scale-95 disabled:bg-slate-300"><Send size={19} /></button>
        </div>
        <p className="mt-1 hidden text-center text-[11px] text-slate-400 lg:block">Enter to send {'·'} Shift+Enter for a new line {'·'} click a message for reply, copy, make a task</p>
      </div>
      <RecordPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={(r) => { setShare(r); setPickerOpen(false); taRef.current?.focus() }} />
    </div>
  )
}
