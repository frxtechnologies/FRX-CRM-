import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Globe2, Undo2, Upload } from 'lucide-react'
import { snapshot, useTable } from '../lib/db'
import { getCurrentUserId, importLeads, undoImportLeads } from '../lib/services'
import { leadToRow, planImport, type ImportPlan } from '../lib/leadImport'
import { readSpreadsheet } from '../lib/readSpreadsheet'
import { cn } from '../lib/util'
import { Button, Modal, PartnerSelect, useToast } from './ui'

type Result = { ids: string[]; label: string; count: number }

/** "Import leads" button + drop-a-file-anywhere. Reads Excel/CSV, detects the country of each lead, shows a short review, then saves. */
export default function ImportLeads({ compact }: { compact?: boolean }) {
  const toast = useToast()
  const profiles = useTable('profiles')
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [plans, setPlans] = useState<ImportPlan[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [assignTo, setAssignTo] = useState<string>(getCurrentUserId() || '')
  const [keepUnknown, setKeepUnknown] = useState(true)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [dragging, setDragging] = useState(false)

  async function load(files: File[]) {
    setOpen(true); setResult(null); setPlans([]); setErrors([]); setBusy('Reading your file…'); setAssignTo(getCurrentUserId() || '')
    const out: ImportPlan[] = [], errs: string[] = []
    const seen = snapshot('leads').map((l) => ({ business_name: l.business_name, city: l.city, phone: l.phone, whatsapp: l.whatsapp, email: l.email, website: l.website }))
    for (const file of files) {
      try {
        const sheets = await readSpreadsheet(file)
        const plan = planImport(sheets, file.name, seen)
        plan.leads.forEach((l) => seen.push({ business_name: l.business_name, city: l.city, phone: l.phone, whatsapp: l.whatsapp, email: l.email, website: l.website }))
        out.push(plan)
      } catch (e: any) { errs.push(`${file.name}: ${e?.message || 'could not be read'}`) }
    }
    setPlans(out); setErrors(errs); setBusy('')
  }

  // drag a file anywhere onto the page
  useEffect(() => {
    let depth = 0
    const has = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files')
    const enter = (e: DragEvent) => { if (has(e)) { depth++; setDragging(true) } }
    const leave = (e: DragEvent) => { if (has(e) && --depth <= 0) { depth = 0; setDragging(false) } }
    const over = (e: DragEvent) => { if (has(e)) e.preventDefault() }
    const drop = (e: DragEvent) => {
      if (!has(e)) return
      e.preventDefault(); depth = 0; setDragging(false)
      const files = Array.from(e.dataTransfer?.files || [])
      if (files.length) load(files)
    }
    window.addEventListener('dragenter', enter); window.addEventListener('dragleave', leave); window.addEventListener('dragover', over); window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragenter', enter); window.removeEventListener('dragleave', leave); window.removeEventListener('dragover', over); window.removeEventListener('drop', drop) }
  }, [])

  const all = useMemo(() => plans.flatMap((p) => p.leads.map((l) => ({ l, file: p.fileName }))), [plans])
  const chosen = useMemo(() => all.filter((x) => keepUnknown || x.l.countryCode), [all, keepUnknown])
  const byCountry = useMemo(() => {
    const m = new Map<string, number>(); chosen.forEach((x) => m.set(x.l.country || 'Country unknown', (m.get(x.l.country || 'Country unknown') || 0) + 1))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [chosen])
  const dups = plans.reduce((n, p) => n + p.duplicates.length, 0)
  const unknown = all.filter((x) => !x.l.countryCode).length
  const bad = plans.reduce((n, p) => n + p.badPhones, 0)
  const label = plans.length === 1 ? `"${plans[0].fileName}"` : `${plans.length} files`

  const partnerId = (hint: string) => {
    const h = hint.trim().toLowerCase()
    if (!h) return ''
    return profiles.find((p) => [p.short_name, p.full_name, p.name].some((n) => n && String(n).toLowerCase().split(/\s+/)[0] === h.split(/\s+/)[0]))?.id || ''
  }

  async function save() {
    if (!chosen.length) return
    setBusy('Saving leads…'); setProgress(0)
    try {
      const rows = chosen.map((x) => leadToRow(x.l, partnerId(x.l.assigned_hint) || assignTo || getCurrentUserId() || undefined))
      const made = await importLeads(rows, label, setProgress)
      setResult({ ids: made.map((m) => m.id), label, count: made.length })
    } catch (e: any) {
      toast(`Import stopped: ${e?.message || 'something went wrong'}. Leads already saved are kept; you can import the file again and duplicates will be skipped.`, 'err')
    } finally { setBusy('') }
  }
  async function undo() {
    if (!result) return
    setBusy('Removing the imported leads…')
    try { await undoImportLeads(result.ids, result.label); toast(`Removed ${result.count} imported leads`); close() } catch (e: any) { toast(e?.message || 'Could not undo', 'err') } finally { setBusy('') }
  }
  const close = () => { if (!busy) { setOpen(false); setPlans([]); setErrors([]); setResult(null) } }

  const usable = plans.some((p) => p.leads.length)
  return (
    <>
      <input ref={input} type="file" multiple accept=".xlsx,.csv,.tsv,.txt,.xls" hidden onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length) load(f); e.target.value = '' }} />
      <Button variant="secondary" size="sm" onClick={() => input.current?.click()} title="Upload an Excel or CSV file of leads"><Upload size={14} /><span className={compact ? 'hidden sm:inline' : ''}>Import leads</span></Button>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[80] grid place-items-center bg-[#0B1F3A]/70 p-6 backdrop-blur-sm">
          <div className="rounded-3xl border-2 border-dashed border-white/70 bg-white/10 px-10 py-12 text-center text-white">
            <FileSpreadsheet size={42} className="mx-auto mb-3" />
            <div className="text-xl font-semibold">Drop your lead file here</div>
            <div className="mt-1 text-sm text-white/80">Excel or CSV. We find the country and save the leads for you.</div>
          </div>
        </div>
      )}

      <Modal open={open} onClose={close} wide title={result ? 'Leads imported' : 'Import leads'}
        footer={result ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Button variant="danger" size="sm" onClick={undo} loading={!!busy}><Undo2 size={14} />Undo this import</Button>
            <Button onClick={close}>Done</Button>
          </div>
        ) : usable ? (
          <div className="flex w-full items-center justify-end gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
            <Button variant="secondary" onClick={close} disabled={!!busy}>Cancel</Button>
            <Button onClick={save} loading={!!busy} disabled={!chosen.length}>{busy ? `Saving ${progress}/${chosen.length}…` : `Add ${chosen.length} lead${chosen.length === 1 ? '' : 's'}`}</Button>
          </div>
        ) : <div className="flex w-full justify-end"><Button variant="secondary" onClick={close}>Close</Button></div>}>
        {busy && !plans.length && !result ? <p className="py-10 text-center text-slate-500">{busy}</p> : result ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800"><CheckCircle2 className="mt-0.5 shrink-0" size={20} />
              <div><div className="font-semibold">{result.count} lead{result.count === 1 ? '' : 's'} added to your CRM</div><div className="text-sm">Your partner can see them now and has been told. Every lead is tagged with its country and the import date.</div></div></div>
            <CountryChips items={byCountry} />
            <p className="text-sm text-slate-500">Wrong file? Use <b>Undo this import</b> and the leads from this upload are removed. After you close this window you can still delete leads from the list.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {errors.map((e) => <div key={e} className="flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{e}</div>)}
            {plans.flatMap((p) => p.warnings).map((w) => <div key={w} className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{w}</div>)}
            {usable && <>
              <div>
                <div className="text-3xl font-bold text-[#0B1F3A]">{chosen.length} <span className="text-base font-medium text-slate-500">lead{chosen.length === 1 ? '' : 's'} ready to add from {label}</span></div>
                <div className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-600"><Globe2 size={15} />Detected countries</div>
                <div className="mt-2"><CountryChips items={byCountry} /></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Give these leads to</span><PartnerSelect value={assignTo} onChange={setAssignTo} placeholder="Nobody yet" /></label>
                {unknown > 0 && <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" className="mt-0.5 accent-[#2563EB]" checked={keepUnknown} onChange={(e) => setKeepUnknown(e.target.checked)} />
                  <span><b>Also add {unknown} with no country</b><span className="block text-slate-500">No country, state, postcode or phone code in the file. They get a "Country unknown" tag.</span></span></label>}
              </div>
              {(dups > 0 || bad > 0) && <ul className="space-y-1 text-sm text-slate-600">
                {dups > 0 && <li>• <b>{dups}</b> skipped because they are already in your CRM or repeated in the file{plans.flatMap((p) => p.duplicates).slice(0, 3).length ? ` (e.g. ${plans.flatMap((p) => p.duplicates).slice(0, 3).map((d) => d.name).join(', ')})` : ''}.</li>}
                {bad > 0 && <li>• <b>{bad}</b> phone number{bad === 1 ? '' : 's'} look{bad === 1 ? 's' : ''} incomplete. They are saved as written with a note.</li>}
              </ul>}
              <details className="rounded-xl border border-slate-200 p-3 text-sm">
                <summary className="cursor-pointer font-medium text-slate-700">What we found in the file</summary>
                <div className="mt-3 space-y-3">
                  {plans.map((p) => <div key={p.fileName}>
                    {plans.length > 1 && <div className="mb-1 font-medium text-slate-800">{p.fileName}</div>}
                    {p.sheets.map((s) => <div key={s.name} className="border-t border-slate-100 py-2 first:border-0">
                      <div className="flex flex-wrap items-center gap-2"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', s.used && s.leads ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{s.used && s.leads ? 'Used' : 'Skipped'}</span><b>{s.name}</b><span className="text-slate-500">{s.reason}</span></div>
                      {s.used && s.leads > 0 && <div className="mt-1 text-xs text-slate-500">Matched: {s.mapping.map((m) => `${m.header} → ${m.field.replace('_', ' ')}`).slice(0, 14).join(', ')}{s.keptInNotes.length ? `. Kept in notes: ${s.keptInNotes.slice(0, 8).join(', ')}${s.keptInNotes.length > 8 ? '…' : ''}` : ''}</div>}
                    </div>)}
                  </div>)}
                </div>
              </details>
              <div>
                <div className="mb-2 text-sm font-medium text-slate-700">Preview</div>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {chosen.slice(0, 5).map(({ l }, i) => <div key={i} className="flex items-start justify-between gap-3 p-3 text-sm">
                    <div className="min-w-0"><div className="truncate font-semibold text-[#0B1F3A]">{l.business_name}</div><div className="truncate text-slate-500">{[l.contact_person, l.city, l.industry].filter(Boolean).join(' · ') || '—'}</div><div className="truncate text-slate-500">{[l.phone, l.email].filter(Boolean).join(' · ') || 'No phone or email'}</div></div>
                    <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{l.countryCode || '?'}</span>
                  </div>)}
                </div>
              </div>
            </>}
            {!usable && !errors.length && !busy && <p className="py-6 text-center text-slate-500">Nothing new to add. Everything in this file is already in your CRM.</p>}
          </div>
        )}
      </Modal>
    </>
  )
}

function CountryChips({ items }: { items: [string, number][] }) {
  return <div className="flex flex-wrap gap-2">{items.map(([name, n]) => <span key={name} className={cn('rounded-full border px-3 py-1 text-sm font-medium', name === 'Country unknown' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-700')}>{name} <b className="ml-1 text-[#0B1F3A]">{n}</b></span>)}</div>
}
