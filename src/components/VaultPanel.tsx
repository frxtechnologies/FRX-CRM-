import { useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Copy, Download, ExternalLink, Eye, EyeOff, KeyRound, Lock, Pencil, Plus, Search, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { missingTables, useTable, type Row } from '../lib/db'
import { create, getCurrentUserId, logActivity, partnerName, remove, saveSetting, update, useSetting } from '../lib/services'
import { decryptJSON, encryptJSON, lockVault, setupVault, unlockVault, useVaultUnlocked } from '../lib/vault'
import { cn, downloadBlob, fmtDate, safeUrl, toCSV, today } from '../lib/util'
import { loadLogo } from '../lib/pdf'
import { Badge, Button, Card, ClientSelect, Empty, Field, inputCls, Modal, PartnerSelect, Select, useToast } from './ui'

export const VAULT_CATEGORIES = ['Login', 'Hosting & domain', 'Email', 'Social media', 'Payment / bank', 'API key / token', 'Recovery codes', 'Other']
type Secret = { password?: string; recovery_codes?: string; notes?: string; _bad?: boolean }
const IDLE_MS = 10 * 60 * 1000

const randomPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^*-_'
  const r = crypto.getRandomValues(new Uint32Array(20))
  return Array.from(r, (n) => chars[n % chars.length]).join('')
}

function Gate({ cfg }: { cfg: { salt?: string; verifier?: string; iter?: number } }) {
  const toast = useToast()
  const [pass, setPass] = useState(''), [again, setAgain] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const isSetup = !cfg.salt
  async function go(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (isSetup) {
      if (pass.length < 12) return setErr('Use at least 12 characters. Four unrelated words works well.')
      if (/^(.)\1+$/.test(pass) || /^(password|123456|qwerty|letmein|admin)/i.test(pass)) return setErr('That passphrase is too easy to guess.')
      if (pass !== again) return setErr('The two passphrases do not match.')
      setBusy(true)
      try { const v = await setupVault(pass); await saveSetting('vault', v); toast('Vault created and unlocked') } catch (x: any) { setErr(x.message) } finally { setBusy(false) }
    } else {
      setBusy(true)
      const ok = await unlockVault(pass, cfg.salt!, cfg.verifier!, cfg.iter || 250_000)
      setBusy(false)
      if (!ok) setErr('That passphrase is not right.')
    }
  }
  return (
    <Card className="mx-auto max-w-md p-7 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0B1F3A] text-[#60A5FA]"><KeyRound size={26} /></div>
      <h2 className="text-xl font-bold text-[#0B1F3A]">{isSetup ? 'Create your vault passphrase' : 'Unlock the vault'}</h2>
      <p className="mt-1 text-sm text-slate-500">{isSetup ? 'Passwords are scrambled in your browser with this passphrase before they are saved. Both partners use the same one.' : 'Enter the shared vault passphrase to see logins and recovery codes.'}</p>
      <form onSubmit={go} className="mt-5 space-y-3 text-left">
        <input type="password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Vault passphrase" className={cn(inputCls, '!py-3 !text-base')} autoComplete="off" />
        {isSetup && <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} placeholder="Type it again" className={cn(inputCls, '!py-3 !text-base')} autoComplete="off" />}
        {err && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{err}</p>}
        <Button type="submit" loading={busy} className="w-full !py-3 !text-base">{isSetup ? 'Create vault' : 'Unlock'}</Button>
      </form>
      {isSetup && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-left text-xs text-amber-900"><b>Write this passphrase down and share it with your partner in person.</b> It is never saved anywhere, so if you both forget it the saved passwords cannot be recovered — not even by us.</p>}
    </Card>
  )
}

export default function VaultPanel({ clientId }: { clientId?: string }) {
  const toast = useToast()
  const unlocked = useVaultUnlocked()
  const cfg = useSetting<{ salt?: string; verifier?: string; iter?: number }>('vault', {})
  const items = useTable('vault_items'), clients = useTable('clients')
  const [secrets, setSecrets] = useState<Record<string, Secret>>({})
  const [tab, setTab] = useState<'all' | 'client' | 'company' | 'personal'>('all')
  const [q, setQ] = useState(''), [cat, setCat] = useState(''), [cl, setCl] = useState('')
  const [editing, setEditing] = useState<Row | 'new' | null>(null)
  const [shown, setShown] = useState<Record<string, boolean>>({})

  // decrypt everything once unlocked (and whenever items change)
  useEffect(() => {
    if (!unlocked) { setSecrets({}); setShown({}); return }
    let dead = false
    ;(async () => {
      const out: Record<string, Secret> = {}
      for (const it of items) { if (!it.secret_enc) continue; try { out[it.id] = await decryptJSON(it.secret_enc) } catch { out[it.id] = { _bad: true } } }
      if (!dead) setSecrets(out)
    })()
    return () => { dead = true }
  }, [items, unlocked])

  // auto-lock after 10 minutes without activity
  useEffect(() => {
    if (!unlocked) return
    let t = setTimeout(lockVault, IDLE_MS)
    const reset = () => { clearTimeout(t); t = setTimeout(lockVault, IDLE_MS) }
    const ev = ['mousemove', 'keydown', 'click', 'scroll']
    ev.forEach((e) => window.addEventListener(e, reset))
    return () => { clearTimeout(t); ev.forEach((e) => window.removeEventListener(e, reset)) }
  }, [unlocked])

  const belongs = (i: Row) => (i.scope === 'client' ? clients.find((c) => c.id === i.client_id)?.company || 'Client' : i.scope === 'company' ? 'FRX (company)' : `Personal — ${partnerName(i.owner_id)}`)
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return items.filter((i) => (clientId ? i.client_id === clientId : (tab === 'all' || i.scope === tab) && (!cl || i.client_id === cl)) && (!cat || i.category === cat)
      && (!s || [i.title, i.username, i.url, i.category, belongs(i)].some((v) => String(v ?? '').toLowerCase().includes(s))))
      .sort((a, b) => belongs(a).localeCompare(belongs(b)) || a.title.localeCompare(b.title))
  }, [items, clients, tab, q, cat, cl, clientId])

  if (missingTables.has('vault_items')) return (
    <Card className="mx-auto max-w-xl p-6 text-sm"><h2 className="font-semibold text-[#0B1F3A]">One more database step</h2><p className="mt-2 text-slate-600">The vault needs its own table. In Supabase → SQL Editor, paste and run <code className="rounded bg-slate-100 px-1">supabase/4-vault.sql</code>, then reload this page.</p></Card>
  )
  if (!unlocked) return <Gate cfg={cfg} />

  const copy = async (text: string, label: string) => { try { await navigator.clipboard.writeText(text); toast(`${label} copied`) } catch { toast('Could not copy — select and copy it manually', 'err') } }
  const exportRows = () => list.map((i) => ({ belongs: belongs(i), title: i.title, category: i.category, url: i.url || '', username: i.username || '', password: secrets[i.id]?.password || '', recovery: (secrets[i.id]?.recovery_codes || '').replace(/\n/g, ' '), notes: (secrets[i.id]?.notes || '').replace(/\n/g, ' ') }))
  const warn = () => window.confirm(`This file will contain ${list.length} login${list.length === 1 ? '' : 's'} with passwords in READABLE form.\n\nKeep it somewhere safe and delete it when you're done. Continue?`)
  const csv = async () => { if (!warn()) return; downloadBlob(`frx-vault-${today()}.csv`, toCSV(exportRows(), [['belongs', 'Belongs to'], ['title', 'Title'], ['category', 'Category'], ['url', 'URL'], ['username', 'Username / email'], ['password', 'Password'], ['recovery', 'Recovery codes'], ['notes', 'Notes']].map(([key, label]) => ({ key, label }))), 'text/csv;charset=utf-8'); await logActivity(`downloaded a vault export (${list.length} items, CSV)`, 'vault_items') }
  const pdf = async () => {
    if (!warn()) return
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }); const W = doc.internal.pageSize.getWidth()
    doc.setFillColor(7, 20, 38); doc.rect(0, 0, W, 24, 'F'); doc.setFillColor(37, 99, 235); doc.rect(0, 24, W, 1, 'F')
    const logo = await loadLogo(); if (logo) doc.addImage(logo, 'PNG', 10, 3, 18, 18)
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text('FRX Technologies - Access & credentials', 32, 12)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(96, 165, 250); doc.text(`CONFIDENTIAL  |  generated ${today()}  |  ${list.length} items`, 32, 18)
    const rows = exportRows()
    autoTable(doc, { startY: 31, head: [['Belongs to', 'Title', 'Category', 'URL', 'Username / email', 'Password', 'Recovery codes', 'Notes']], body: rows.map((r) => [r.belongs, r.title, r.category, r.url, r.username, r.password, r.recovery, r.notes]), styles: { fontSize: 7.5, cellPadding: 1.8, overflow: 'linebreak' }, headStyles: { fillColor: [11, 31, 58], textColor: 255 }, alternateRowStyles: { fillColor: [247, 249, 252] }, margin: { left: 10, right: 10 } })
    doc.save(`frx-vault-${today()}.pdf`); await logActivity(`downloaded a vault export (${list.length} items, PDF)`, 'vault_items')
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {!clientId && (
          <div className="flex rounded-xl border border-slate-200 bg-white p-0.5">
            {([['all', 'Everything'], ['client', 'Clients'], ['company', 'FRX'], ['personal', 'Personal']] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cn('rounded-lg px-3.5 py-2 text-sm font-medium', tab === k ? 'bg-[#0B1F3A] text-white' : 'text-slate-600')}>{l}</button>)}
          </div>
        )}
        <div className="relative min-w-48 flex-1 sm:max-w-xs"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, username, site…" className={cn(inputCls, '!rounded-xl !py-2.5 pl-9')} /></div>
        <Select className="!w-auto !rounded-xl !py-2.5" value={cat} onChange={setCat} placeholder="Any type" options={VAULT_CATEGORIES} />
        {!clientId && (tab === 'all' || tab === 'client') && <Select className="!w-auto !rounded-xl !py-2.5" value={cl} onChange={setCl} placeholder="Any client" options={clients.map((c) => ({ value: c.id, label: c.company || c.name }))} />}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={csv} disabled={!list.length}><Download size={14} /> CSV</Button>
          <Button variant="secondary" size="sm" onClick={pdf} disabled={!list.length}><Download size={14} /> PDF</Button>
          <Button variant="secondary" size="sm" onClick={lockVault}><Lock size={14} /> Lock</Button>
          <Button onClick={() => setEditing('new')}><Plus size={15} /> Add login</Button>
        </div>
      </div>

      {list.length === 0 ? (
        <Card><Empty title={items.length === 0 ? 'Nothing saved yet' : 'Nothing matches'} hint={items.length === 0 ? 'Save website logins, hosting, social accounts, recovery codes and more — for clients, for FRX, or personal.' : 'Try clearing the search or filters.'} action={items.length === 0 ? <Button onClick={() => setEditing('new')}><Plus size={14} /> Add the first one</Button> : undefined} /></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((i) => {
            const s = secrets[i.id] || {}
            const open = !!shown[i.id]
            return (
              <Card key={i.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="text-[17px] font-semibold text-[#0B1F3A]">{i.title}</h3><Badge tone="blue">{i.category}</Badge></div>
                    <div className="mt-0.5 text-sm text-slate-500">{belongs(i)}{i.url && <> · {safeUrl(i.url) ? <a href={safeUrl(i.url)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#2563EB] hover:underline">{i.url.replace(/^https?:\/\//, '').slice(0, 34)}<ExternalLink size={11} /></a> : <span>{i.url.slice(0, 34)}</span>}</>}</div>
                  </div>
                  <button className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#2563EB]" onClick={() => setEditing(i)} title="Edit"><Pencil size={15} /></button>
                  <button className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete" onClick={() => { if (window.confirm(`Delete "${i.title}" permanently?`)) remove('vault_items', i.id).then(() => toast('Deleted')) }}><Trash2 size={15} /></button>
                </div>
                <dl className="mt-3 space-y-2 text-sm">
                  {i.username && <div className="flex items-center gap-2"><dt className="w-20 shrink-0 text-slate-400">Username</dt><dd className="min-w-0 flex-1 truncate font-medium text-slate-800">{i.username}</dd><button onClick={() => copy(i.username, 'Username')} className="rounded p-1 text-slate-400 hover:text-[#2563EB]" title="Copy"><Copy size={14} /></button></div>}
                  {s._bad ? <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">Could not decrypt this item (saved with a different passphrase).</p> : <>
                    {s.password && <div className="flex items-center gap-2"><dt className="w-20 shrink-0 text-slate-400">Password</dt><dd className="min-w-0 flex-1 truncate font-mono text-[13px] text-slate-800">{open ? s.password : '••••••••••'}</dd>
                      <button onClick={() => setShown({ ...shown, [i.id]: !open })} className="rounded p-1 text-slate-400 hover:text-[#2563EB]" title={open ? 'Hide' : 'Show'}>{open ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                      <button onClick={() => copy(s.password!, 'Password')} className="rounded p-1 text-slate-400 hover:text-[#2563EB]" title="Copy"><Copy size={14} /></button></div>}
                    {s.recovery_codes && <div className="flex gap-2"><dt className="w-20 shrink-0 pt-0.5 text-slate-400">Recovery</dt><dd className="min-w-0 flex-1"><pre className="whitespace-pre-wrap break-all font-mono text-[12px] text-slate-800">{open ? s.recovery_codes : s.recovery_codes.split('\n').filter(Boolean).length + ' code(s) hidden — press the eye'}</pre></dd>
                      <button onClick={() => copy(s.recovery_codes!, 'Recovery codes')} className="self-start rounded p-1 text-slate-400 hover:text-[#2563EB]" title="Copy all"><Copy size={14} /></button></div>}
                    {s.notes && <div className="flex gap-2"><dt className="w-20 shrink-0 text-slate-400">Notes</dt><dd className="min-w-0 flex-1 whitespace-pre-wrap text-slate-600">{open ? s.notes : '••• hidden'}</dd></div>}
                  </>}
                </dl>
                <p className="mt-3 text-[11px] text-slate-400">Added by {partnerName(i.created_by)} · {fmtDate(i.created_at)}{i.updated_by && i.updated_at !== i.created_at ? ` · updated by ${partnerName(i.updated_by)}` : ''}</p>
              </Card>
            )
          })}
        </div>
      )}
      <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400"><ShieldCheck size={13} /> Encrypted in your browser before saving. Locks itself after 10 minutes of inactivity.</p>
      {editing && <ItemForm item={editing === 'new' ? null : editing} secret={editing === 'new' ? {} : secrets[(editing as Row).id] || {}} clientId={clientId} defaultScope={tab === 'company' ? 'company' : tab === 'personal' ? 'personal' : 'client'} onClose={() => setEditing(null)} />}
    </>
  )
}

function ItemForm({ item, secret, clientId, defaultScope, onClose }: { item: Row | null; secret: Secret; clientId?: string; defaultScope: string; onClose: () => void }) {
  const toast = useToast()
  const [f, setF] = useState({
    scope: item?.scope || (clientId ? 'client' : defaultScope), client_id: item?.client_id || clientId || '', owner_id: item?.owner_id || getCurrentUserId() || '',
    title: item?.title || '', category: item?.category || 'Login', url: item?.url || '', username: item?.username || '',
    password: secret.password || '', recovery_codes: secret.recovery_codes || '', notes: secret.notes || '',
  })
  const [reveal, setReveal] = useState(false), [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }))
  async function save() {
    if (!f.title.trim()) return toast('Give it a title, e.g. "Hosting login"', 'err')
    if (f.scope === 'client' && !f.client_id) return toast('Choose which client this belongs to', 'err')
    setBusy(true)
    try {
      const secret_enc = await encryptJSON({ password: f.password, recovery_codes: f.recovery_codes, notes: f.notes })
      const row = { scope: f.scope, client_id: f.scope === 'client' ? f.client_id : null, owner_id: f.scope === 'personal' ? f.owner_id : null, title: f.title.trim(), category: f.category, url: f.url.trim(), username: f.username.trim(), secret_enc }
      if (item) await update('vault_items', item.id, row); else await create('vault_items', row)
      toast(item ? 'Saved' : 'Added to the vault'); onClose()
    } catch (e: any) { toast(e.message || 'Could not save', 'err') } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={item ? 'Edit login' : 'Add login'} wide footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        {!clientId && <Field label="This belongs to"><Select value={f.scope} onChange={(v) => set('scope', v)} options={[{ value: 'client', label: 'A client' }, { value: 'company', label: 'FRX (company)' }, { value: 'personal', label: 'Personal' }]} /></Field>}
        {f.scope === 'client' && !clientId && <Field label="Client *"><ClientSelect value={f.client_id} onChange={(v) => set('client_id', v)} placeholder="Choose client…" /></Field>}
        {f.scope === 'personal' && <Field label="Whose?"><PartnerSelect value={f.owner_id} onChange={(v) => set('owner_id', v)} /></Field>}
        <Field label="Title *" className="sm:col-span-2"><input className={inputCls} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Hostinger login, Instagram, Namecheap domain" autoFocus /></Field>
        <Field label="Type"><Select value={f.category} onChange={(v) => set('category', v)} options={VAULT_CATEGORIES} /></Field>
        <Field label="Website / link"><input className={inputCls} value={f.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" /></Field>
        <Field label="Username / email"><input className={inputCls} value={f.username} onChange={(e) => set('username', e.target.value)} autoComplete="off" /></Field>
        <Field label="Password">
          <div className="flex gap-1.5"><input className={cn(inputCls, 'font-mono')} type={reveal ? 'text' : 'password'} value={f.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
            <button type="button" onClick={() => setReveal(!reveal)} className="rounded-lg border border-slate-200 px-2.5 text-slate-500 hover:bg-slate-50" title="Show / hide">{reveal ? <EyeOff size={15} /> : <Eye size={15} />}</button>
            <button type="button" onClick={() => { set('password', randomPassword()); setReveal(true) }} className="rounded-lg border border-slate-200 px-2.5 text-slate-500 hover:bg-slate-50" title="Generate a strong password"><Sparkles size={15} /></button></div>
        </Field>
        <Field label="Recovery codes / backup codes (one per line)" className="sm:col-span-2"><textarea rows={3} className={cn(inputCls, 'font-mono text-[13px]')} value={f.recovery_codes} onChange={(e) => set('recovery_codes', e.target.value)} /></Field>
        <Field label="Notes (2FA phone, security answers, anything else)" className="sm:col-span-2"><textarea rows={3} className={inputCls} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
      <p className="mt-3 text-xs text-slate-400">Password, recovery codes and notes are encrypted before they leave this browser.</p>
    </Modal>
  )
}
