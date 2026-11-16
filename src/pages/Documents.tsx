import { useState } from 'react'
import { Download, Plus, Trash2 } from 'lucide-react'
import { resolveFileUrl, uploadFile, useTable } from '../lib/db'
import { create, partnerName, remove } from '../lib/services'
import { DOC_CATEGORIES } from '../lib/constants'
import { fmtDate } from '../lib/util'
import { Badge, Button, ClientSelect, Empty, Field, inputCls, Modal, PageHeader, ProjectSelect, Select, useToast } from '../components/ui'
import { DataTable } from '../components/Entity'

export default function Documents() {
  const docs = useTable('documents'), leads = useTable('leads'), clients = useTable('clients'), projects = useTable('projects'), invoices = useTable('invoices')
  const toast = useToast()
  const [cat, setCat] = useState('')
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [f, setF] = useState({ name: '', category: 'Other', lead_id: '', client_id: '', project_id: '', invoice_id: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const rows = cat ? docs.filter((d) => d.category === cat) : docs
  const target = (d: any) => leads.find((x) => x.id === d.lead_id)?.business_name || clients.find((x) => x.id === d.client_id)?.company || projects.find((x) => x.id === d.project_id)?.name || invoices.find((x) => x.id === d.invoice_id)?.number || '—'
  const size = (n: number) => (n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB')

  async function upload() {
    if (!file) return toast('Choose a file', 'err')
    setBusy(true)
    try {
      const url = await uploadFile(file)
      await create('documents', { name: f.name || file.name, category: f.category, file_url: url, mime: file.type, size: file.size, notes: f.notes, lead_id: f.lead_id || null, client_id: f.client_id || null, project_id: f.project_id || null, invoice_id: f.invoice_id || null })
      toast('Document uploaded'); setOpen(false); setFile(null); setF({ ...f, name: '', notes: '' })
    } catch (e: any) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  return (
    <>
      <PageHeader title="Documents" sub="Contracts, proposals, receipts and assets — attach them to leads, clients, projects or invoices" actions={<Button onClick={() => setOpen(true)}><Plus size={15} /> Upload</Button>} />
      <DataTable rows={rows} exportName="documents" searchKeys={['name', 'category', 'notes', 'mime']} initialSort={{ key: 'created_at', dir: -1 }}
        extraToolbar={<Select className="!w-auto" value={cat} onChange={setCat} placeholder="All categories" options={DOC_CATEGORIES} />}
        empty={<Empty title="No documents yet" hint="Upload your first file." action={<Button onClick={() => setOpen(true)}><Plus size={14} /> Upload</Button>} />}
        columns={[
          { key: 'name', label: 'Name', render: (r) => <span className="font-medium text-[#0B1F3A]">{r.name}</span> }, { key: 'category', label: 'Category', render: (r) => <Badge>{r.category}</Badge> },
          { key: 'target', label: 'Attached to', render: target, sortValue: target, csv: target }, { key: 'size', label: 'Size', render: (r) => (r.size ? size(r.size) : '—') },
          { key: 'created_by', label: 'Uploaded by', render: (r) => partnerName(r.created_by) }, { key: 'created_at', label: 'Date', render: (r) => fmtDate(r.created_at) },
          { key: 'actions', label: '', render: (r) => (
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              <button className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#2563EB]" title="Open" onClick={async () => { const u = await resolveFileUrl(r.file_url); if (u) window.open(u, '_blank'); else toast('Could not open file', 'err') }}><Download size={14} /></button>
              <button className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete" onClick={() => { if (window.confirm(`Delete "${r.name}" permanently?`)) remove('documents', r.id).then(() => toast('Deleted')) }}><Trash2 size={14} /></button>
            </div>) },
        ]} />
      <Modal open={open} onClose={() => setOpen(false)} title="Upload document" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} onClick={upload}>Upload</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="File *" className="sm:col-span-2"><input type="file" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#2563EB]" onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field>
          <Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={file?.name} /></Field>
          <Field label="Category"><Select value={f.category} onChange={(v) => setF({ ...f, category: v })} options={DOC_CATEGORIES} /></Field>
          <Field label="Attach to lead"><Select value={f.lead_id} onChange={(v) => setF({ ...f, lead_id: v })} placeholder="None" options={leads.map((l) => ({ value: l.id, label: l.business_name }))} /></Field>
          <Field label="Attach to client"><ClientSelect value={f.client_id} onChange={(v) => setF({ ...f, client_id: v })} placeholder="None" /></Field>
          <Field label="Attach to project"><ProjectSelect value={f.project_id} onChange={(v) => setF({ ...f, project_id: v })} placeholder="None" /></Field>
          <Field label="Attach to invoice"><Select value={f.invoice_id} onChange={(v) => setF({ ...f, invoice_id: v })} placeholder="None" options={invoices.map((l) => ({ value: l.id, label: l.number }))} /></Field>
          <Field label="Notes" className="sm:col-span-2"><input className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div>
      </Modal>
    </>
  )
}
