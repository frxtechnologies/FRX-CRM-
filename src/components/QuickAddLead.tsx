import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { create, getCurrentUserId, partnerName } from '../lib/services'
import { findDuplicates } from '../lib/leadOps'
import { type Row } from '../lib/db'
import { cn } from '../lib/util'
import { Button, useToast } from './ui'

/** The fastest way to store a lead: name + number + Enter. Everything else can be filled in later. */
export default function QuickAddLead({ market, onMore, onSaved }: { market?: 'local' | 'international'; onMore?: () => void; onSaved?: () => void }) {
  const toast = useToast()
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [picked, setPicked] = useState<'local' | 'international' | null>(null)
  const [dupes, setDupes] = useState<{ lead: Row; reason: string }[] | null>(null)
  const [busy, setBusy] = useState(false)

  // Pakistani numbers (+92 / 03xx) are almost always local leads; otherwise international.
  const guess: 'local' | 'international' = /^(\+?92|0?3\d{2})/.test(phone.replace(/[\s-]/g, '')) ? 'local' : 'international'
  const mkt = market || picked || guess

  async function add(force = false) {
    if (!name.trim()) { nameRef.current?.focus(); return }
    const payload = {
      market: mkt, business_name: name.trim(), phone: phone.trim(), whatsapp: phone.trim(), website: website.trim(), country: mkt === 'local' ? 'Pakistan' : '',
      status: 'New Lead', priority: 'medium', assigned_to: getCurrentUserId(), currency: mkt === 'local' ? 'PKR' : 'USD', deal_value: 0, services: [], tags: [], dedupe_key: name.trim().toLowerCase(),
    }
    const d = findDuplicates(payload)
    if (d.length && !force) { setDupes(d); return }
    setBusy(true)
    try {
      await create('leads', payload)
      toast(`Saved "${name.trim()}" — ${mkt === 'local' ? 'Local' : 'International'} lead`)
      setName(''); setPhone(''); setWebsite(''); setPicked(null); setDupes(null)
      nameRef.current?.focus()
      onSaved?.()
    } catch (e: any) { toast(e.message || 'Could not save', 'err') } finally { setBusy(false) }
  }

  const chip = (k: 'local' | 'international', label: string) => (
    <button type="button" onClick={() => setPicked(k)} className={cn('rounded-full px-3 py-1.5 text-sm font-medium transition', mkt === k ? 'bg-[#0B1F3A] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>{label}</button>
  )

  return (
    <div className="rounded-2xl border-2 border-[#2563EB]/25 bg-white p-4 shadow-sm">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[#0B1F3A]">Add a lead</h2>
        {!market && <div className="flex items-center gap-1.5"><span className="text-xs text-slate-400">Market</span>{chip('local', 'Pakistan')}{chip('international', 'International')}</div>}
      </div>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); add() }}>
        <input ref={nameRef} value={name} onChange={(e) => { setName(e.target.value); setDupes(null) }} placeholder="Business name" autoFocus
          className="min-w-52 flex-[2] rounded-xl border border-slate-200 px-4 py-3 text-base outline-none placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone / WhatsApp" inputMode="tel"
          className="min-w-44 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-base outline-none placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10" />
        <input value={website} onChange={(e) => { setWebsite(e.target.value); setDupes(null) }} placeholder="Website link" inputMode="url" autoCapitalize="none"
          className="min-w-52 flex-[2] rounded-xl border border-slate-200 px-4 py-3 text-base outline-none placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10" />
        <Button type="submit" loading={busy} className="rounded-xl px-6 py-3 text-base"><Plus size={18} /> Save lead</Button>
      </form>
      <p className="mt-2 text-xs text-slate-400">Press Enter to save. You can add email, industry, notes and follow-ups afterwards{onMore && <> — or <button className="text-[#2563EB] underline" onClick={onMore}>fill in full details now</button></>}.</p>
      {dupes && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm animate-in">
          <p className="font-medium text-amber-900">This looks like a lead you already have:</p>
          {dupes.slice(0, 3).map(({ lead, reason }) => (
            <p key={lead.id} className="mt-1 text-amber-900"><Link to={`/leads/${lead.id}`} className="font-semibold underline">{lead.business_name}</Link> <span className="text-amber-700">— {reason}, owned by {partnerName(lead.assigned_to)}</span></p>
          ))}
          <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => add(true)}>It's different — add anyway</Button><Button size="sm" variant="secondary" onClick={() => setDupes(null)}>Cancel</Button></div>
        </div>
      )}
    </div>
  )
}
