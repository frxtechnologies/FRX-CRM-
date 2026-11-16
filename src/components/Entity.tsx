import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Download, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { uploadFile, useTable, type Row, type TableName } from '../lib/db'
import { create, remove, update, currentRate, getCurrentUserId } from '../lib/services'
import { downloadBlob, num, toCSV, today, cn } from '../lib/util'
import { CURRENCIES } from '../lib/constants'
import { Button, Card, ClientSelect, Empty, Field, inputCls, Modal, PartnerSelect, ProjectSelect, Select, useToast } from './ui'

export type FieldDef = {
  key: string; label: string
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'multi' | 'checkbox' | 'partner' | 'client' | 'project' | 'currency' | 'file' | 'email'
  options?: string[]; required?: boolean; span?: 1 | 2; default?: any; placeholder?: string; hint?: string
}
export type Column = { key: string; label: string; render?: (r: Row) => ReactNode; sortValue?: (r: Row) => any; align?: 'right'; csv?: (r: Row) => any }

export function MultiPick({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = (value || []).includes(o)
        return <button type="button" key={o} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...(value || []), o])} className={cn('rounded-full border px-2.5 py-1 text-xs transition', on ? 'border-[#2563EB] bg-blue-50 text-[#2563EB]' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>{o}</button>
      })}
    </div>
  )
}

export function FormFields({ fields, values, set }: { fields: FieldDef[]; values: Record<string, any>; set: (k: string, v: any) => void }) {
  const toast = useToast()
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
      {fields.map((f) => {
        const v = values[f.key]
        let input: ReactNode
        switch (f.type) {
          case 'textarea': input = <textarea rows={3} className={inputCls} value={v ?? ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />; break
          case 'select': input = <Select value={v} onChange={(x) => set(f.key, x)} options={f.options || []} placeholder="Select…" />; break
          case 'multi': input = <MultiPick options={f.options || []} value={v || []} onChange={(x) => set(f.key, x)} />; break
          case 'checkbox': input = <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={!!v} onChange={(e) => set(f.key, e.target.checked)} className="h-4 w-4 accent-[#2563EB]" />{f.hint || 'Yes'}</label>; break
          case 'partner': input = <PartnerSelect value={v} onChange={(x) => set(f.key, x)} />; break
          case 'client': input = <ClientSelect value={v} onChange={(x) => set(f.key, x)} />; break
          case 'project': input = <ProjectSelect value={v} onChange={(x) => set(f.key, x)} clientId={values.client_id} />; break
          case 'currency': input = <Select value={v} onChange={(x) => { set(f.key, x); if ('rate_to_base' in values || f.key === 'currency') set('rate_to_base', currentRate(x)) }} options={[...CURRENCIES]} />; break
          case 'file': input = (
            <input type="file" className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#2563EB]"
              onChange={async (e) => {
                const file = e.target.files?.[0]; if (!file) return
                try { const url = await uploadFile(file); set(f.key, url); set('mime', file.type); set('size', file.size); if (!values.name) set('name', file.name) } catch (err: any) { toast(err.message, 'err'); e.target.value = '' }
              }} />
          ); break
          default: input = <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'} step={f.type === 'number' ? 'any' : undefined} className={inputCls} value={v ?? ''} onChange={(e) => set(f.key, f.type === 'number' ? e.target.value : e.target.value)} placeholder={f.placeholder} />
        }
        return <Field key={f.key} label={f.label + (f.required ? ' *' : '')} className={f.span === 2 || f.type === 'textarea' || f.type === 'multi' || f.type === 'file' ? 'sm:col-span-2' : ''}>{input}{f.hint && f.type !== 'checkbox' && <p className="mt-1 text-[11px] text-slate-400">{f.hint}</p>}</Field>
      })}
    </div>
  )
}

export function initialValues(fields: FieldDef[], base: Record<string, any> = {}) {
  const v: Record<string, any> = {}
  for (const f of fields) v[f.key] = f.default !== undefined ? (typeof f.default === 'function' ? f.default() : f.default) : f.type === 'multi' ? [] : f.type === 'checkbox' ? false : f.type === 'date' && f.key === 'date' ? today() : ''
  return { ...v, ...base }
}

export function normalize(fields: FieldDef[], values: Record<string, any>) {
  const out: Record<string, any> = { ...values }
  for (const f of fields) {
    if (f.type === 'number') out[f.key] = values[f.key] === '' || values[f.key] == null ? null : num(values[f.key])
    if (['date', 'partner', 'client', 'project'].includes(f.type || '') && out[f.key] === '') out[f.key] = null
  }
  return out
}

export function FormModal({ open, onClose, title, fields, initial, onSubmit, submitLabel = 'Save' }: { open: boolean; onClose: () => void; title: string; fields: FieldDef[]; initial: Record<string, any>; onSubmit: (v: Record<string, any>) => Promise<void>; submitLabel?: string }) {
  const [values, setValues] = useState(initial)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const [lastInit, setLastInit] = useState(initial)
  if (lastInit !== initial) { setLastInit(initial); setValues(initial) }
  const set = (k: string, v: any) => setValues((x) => ({ ...x, [k]: v }))
  async function submit() {
    const missing = fields.find((f) => f.required && (values[f.key] === '' || values[f.key] == null))
    if (missing) return toast(`${missing.label} is required`, 'err')
    setBusy(true)
    try { await onSubmit(normalize(fields, values)); onClose() } catch (e: any) { toast(e.message || 'Something went wrong', 'err') } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title={title} wide footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>{submitLabel}</Button></>}>
      <FormFields fields={fields} values={values} set={set} />
    </Modal>
  )
}

export function DataTable({ rows, columns, onRowClick, onEdit, onDelete, empty, initialSort, exportName, extraToolbar, searchKeys, rowClass, canEdit }: {
  rows: Row[]; columns: Column[]; onRowClick?: (r: Row) => void; onEdit?: (r: Row) => void; onDelete?: (r: Row) => void
  empty?: ReactNode; initialSort?: { key: string; dir: 1 | -1 }; exportName?: string; extraToolbar?: ReactNode; searchKeys?: string[]; rowClass?: (r: Row) => string; canEdit?: (r: Row) => boolean
}) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState(initialSort || { key: '', dir: 1 as 1 | -1 })
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    let out = s ? rows.filter((r) => (searchKeys || Object.keys(r)).some((k) => String(Array.isArray(r[k]) ? r[k].join(' ') : r[k] ?? '').toLowerCase().includes(s))) : rows
    const col = columns.find((c) => c.key === sort.key)
    if (col) out = [...out].sort((a, b) => {
      const va = col.sortValue ? col.sortValue(a) : a[col.key], vb = col.sortValue ? col.sortValue(b) : b[col.key]
      return (va == null ? 1 : vb == null ? -1 : va > vb ? 1 : va < vb ? -1 : 0) * sort.dir
    })
    return out
  }, [rows, q, sort, columns, searchKeys])
  const exportCsv = () => downloadBlob(`${exportName || 'export'}.csv`, toCSV(filtered.map((r) => Object.fromEntries(columns.map((c) => [c.key, c.csv ? c.csv(r) : r[c.key]]))), columns.map((c) => ({ key: c.key, label: c.label }))), 'text/csv;charset=utf-8')
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <div className="relative min-w-48 flex-1 sm:max-w-xs"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className={cn(inputCls, 'pl-8')} /></div>
        {extraToolbar}
        <span className="ml-auto text-xs text-slate-400">{filtered.length} record{filtered.length === 1 ? '' : 's'}</span>
        {exportName && <Button variant="secondary" size="sm" onClick={exportCsv}><Download size={13} /> CSV</Button>}
      </div>
      {filtered.length === 0 ? (empty || <Empty title="Nothing here yet" hint={q ? 'No records match your search.' : undefined} />) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {columns.map((c) => (
                <th key={c.key} className={cn('cursor-pointer select-none whitespace-nowrap px-4 py-2.5', c.align === 'right' && 'text-right')} onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? ((-s.dir) as 1 | -1) : 1 }))}>
                  <span className="inline-flex items-center gap-1">{c.label}{sort.key === c.key && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}</span>
                </th>
              ))}
              {(onEdit || onDelete) && <th className="w-20" />}
            </tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} onClick={() => onRowClick?.(r)} className={cn('border-b border-slate-50 transition hover:bg-slate-50/80', onRowClick && 'cursor-pointer', rowClass?.(r))}>
                  {columns.map((c) => <td key={c.key} className={cn('px-4 py-2.5 text-slate-700', c.align === 'right' && 'text-right tabular-nums')}>{c.render ? c.render(r) : (Array.isArray(r[c.key]) ? r[c.key].join(', ') : r[c.key]) ?? '—'}</td>)}
                  {(onEdit || onDelete) && (
                    <td className="px-2 text-right" onClick={(e) => e.stopPropagation()}>
                      {onEdit && (!canEdit || canEdit(r)) && <button className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#2563EB]" onClick={() => onEdit(r)}><Pencil size={14} /></button>}
                      {onDelete && (!canEdit || canEdit(r)) && <button className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => onDelete(r)}><Trash2 size={14} /></button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

/** Full CRUD page for a table: toolbar, searchable/sortable table, add/edit modal, delete confirm. */
export function EntityManager({ table, noun, fields, columns, defaults, beforeSave, afterSave, canDelete = true, onRowClick, toolbar, filterRows, searchKeys, initialSort, rowClass, createLabel, onDeleted }: {
  table: TableName; noun: string; fields: FieldDef[]; columns: Column[]; defaults?: Record<string, any>
  beforeSave?: (v: Record<string, any>, existing?: Row) => Record<string, any> | Promise<Record<string, any>>
  afterSave?: (row: Row, isNew: boolean) => Promise<void> | void
  canDelete?: boolean; onRowClick?: (r: Row) => void; toolbar?: ReactNode; filterRows?: (r: Row[]) => Row[]; searchKeys?: string[]
  initialSort?: { key: string; dir: 1 | -1 }; rowClass?: (r: Row) => string; createLabel?: string; onDeleted?: (r: Row) => Promise<void> | void
}) {
  const all = useTable(table)
  const rows = filterRows ? filterRows(all) : all
  const [editing, setEditing] = useState<Row | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState<Row | null>(null)
  const toast = useToast()
  const init = useMemo(() => initialValues(fields, { ...(defaults || {}), ...(editing || {}) }), [fields, defaults, editing, creating])
  return (
    <>
      <div className="mb-3 flex justify-end">{toolbar}<Button onClick={() => { setEditing(null); setCreating(true) }}><Plus size={15} /> {createLabel || `Add ${noun}`}</Button></div>
      <DataTable rows={rows} columns={columns} exportName={table} searchKeys={searchKeys} initialSort={initialSort} rowClass={rowClass}
        onRowClick={onRowClick} onEdit={(r) => { setCreating(false); setEditing(r) }} onDelete={canDelete ? setConfirm : undefined}
        empty={<Empty title={`No ${noun}s yet`} hint={`Add your first ${noun} to get started.`} action={<Button onClick={() => setCreating(true)}><Plus size={14} /> Add {noun}</Button>} />} />
      <FormModal open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null) }} title={editing ? `Edit ${noun}` : `Add ${noun}`} fields={fields} initial={init}
        onSubmit={async (v) => {
          const payload = beforeSave ? await beforeSave(v, editing || undefined) : v
          if (editing) { const row = await update(table, editing.id, payload); await afterSave?.(row, false); toast(`${noun[0].toUpperCase() + noun.slice(1)} updated`) }
          else { const row = await create(table, payload); await afterSave?.(row, true); toast(`${noun[0].toUpperCase() + noun.slice(1)} added`) }
        }} />
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={`Delete ${noun}?`} footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button><Button variant="danger" onClick={async () => { try { await remove(table, confirm!.id); await onDeleted?.(confirm!); toast(`${noun} deleted`); setConfirm(null) } catch (e: any) { toast(e.message, 'err') } }}>Delete permanently</Button></>}>
        <p className="text-sm text-slate-600">This permanently removes the {noun} and cannot be undone. The deletion is recorded in the activity log by {getCurrentUserId() ? 'you' : 'you'}.</p>
      </Modal>
    </>
  )
}
