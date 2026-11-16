export const cn = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

const pad = (n: number) => String(n).padStart(2, '0')
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = () => isoDate(new Date())
/** Value for <input type=datetime-local>, in the user's LOCAL time (toISOString would give UTC). */
export const nowLocalInput = () => { const d = new Date(); return `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}` }
export const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDate(d) }
export const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)
export const monthKey = (iso: string) => iso.slice(0, 7)

export const fmtDate = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
export const fmtTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '')
export const fmtDateTime = (iso?: string | null) => (iso ? `${fmtDate(iso)}, ${fmtTime(iso)}` : '—')

export const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
/** Money is rounded to 2 dp at every stored step to keep sums consistent with what the database stores (numeric(14,2)). */
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export const fmtMoney = (amount: number, currency = 'PKR') => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(amount)
  } catch { return `${currency} ${amount.toFixed(2)}` }
}
export const fmtCompact = (amount: number, currency = 'PKR') => {
  const abs = Math.abs(amount)
  const s = abs >= 1e6 ? (abs / 1e6).toFixed(2) + 'M' : abs >= 1e4 ? (abs / 1e3).toFixed(1) + 'K' : abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return `${amount < 0 ? '-' : ''}${currency} ${s}`
}

export const timeAgo = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return fmtDate(iso)
}

export function downloadBlob(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------- CSV ----------
// Spreadsheet formula injection: a cell that starts with = + - @ can run as a formula when opened in Excel/Sheets
// (e.g. a lead named "=HYPERLINK(...)" imported from a CSV). Prefix such TEXT with an apostrophe so it stays text.
// Real numbers, negative numbers and normal phone numbers (+92 300 ...) are left alone.
export const csvSafe = (s: string) => (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s) && !/^\+[\d\s().-]{5,}$/.test(s) ? `'${s}` : s)

const esc = (v: any) => {
  if (v == null) return ''
  const s = typeof v === 'number' ? String(v) : csvSafe(Array.isArray(v) ? v.join('; ') : String(v))
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export function toCSV(rows: Record<string, any>[], cols: { key: string; label: string }[]) {
  const head = cols.map((c) => esc(c.label)).join(',')
  const body = rows.map((r) => cols.map((c) => esc(r[c.key])).join(',')).join('\r\n')
  return '﻿' + head + '\r\n' + body // BOM so Excel opens UTF-8 correctly
}
export function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let cur: string[] = [], field = '', q = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++ } else q = false } else field += c
    } else if (c === '"') q = true
    else if (c === ',') { cur.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      cur.push(field); field = ''
      if (cur.some((x) => x.trim() !== '')) rows.push(cur)
      cur = []
    } else field += c
  }
  cur.push(field)
  if (cur.some((x) => x.trim() !== '')) rows.push(cur)
  if (!rows.length) return []
  const head = rows[0].map((h) => h.trim())
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])))
}

/** Only ever link out to http(s) addresses. Anything else (javascript:, data:, file:) is refused. */
export const safeUrl = (u?: string | null): string | null => {
  if (!u) return null
  const t = u.trim()
  try {
    const x = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`)
    return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null
  } catch { return null }
}
