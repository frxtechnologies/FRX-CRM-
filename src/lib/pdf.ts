import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Row } from './db'
import { num } from './util'

const NAVY: [number, number, number] = [7, 20, 38]
const BLUE: [number, number, number] = [37, 99, 235]
const LIGHT: [number, number, number] = [96, 165, 250]
const GREY: [number, number, number] = [100, 116, 139]
const INK: [number, number, number] = [15, 23, 42]

export const pdfMoney = (n: number, cur: string) => `${cur} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const d = (iso?: string) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-')

/** jsPDF needs PNG/JPEG; the brand logo ships as WebP, so rasterise it once. */
let logoCache: Promise<string | null> | null = null
export function loadLogo(): Promise<string | null> {
  logoCache ||= new Promise((res) => {
    const img = new Image()
    img.onload = () => { const S = 320; const c = document.createElement('canvas'); c.width = S; c.height = S; const x = c.getContext('2d')!; x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, S, S); res(c.toDataURL('image/png')) }
    img.onerror = () => res(null)
    img.src = '/frx-logo.webp'
  })
  return logoCache
}

export type InvoicePdfInput = {
  invoice: Row; items: Row[]; payments: Row[]
  company: { name: string; website: string; email: string; phone: string }
  footer?: string
}

export async function buildInvoicePdf({ invoice: inv, items, payments, company, footer }: InvoicePdfInput): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  // each invoice keeps the "From" details it was created with; fall back to the current company settings
  const co = { ...company, ...Object.fromEntries(Object.entries((inv.company_info as Record<string, string>) || {}).filter(([, v]) => v)) } as typeof company & { address?: string }
  const W = 210, M = 16
  const logo = await loadLogo()
  const cur = inv.currency as string

  // ---- header band ----
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 44, 'F')
  doc.setFillColor(...BLUE); doc.rect(0, 44, W, 1.6, 'F')
  if (logo) doc.addImage(logo, 'PNG', M - 2, 6, 32, 32)
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(17)
  doc.text(co.name, logo ? M + 34 : M, 22)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...LIGHT)
  doc.text([co.website, co.email, co.phone, co.address || ''].filter(Boolean), logo ? M + 34 : M, 28.5)
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(26)
  doc.text('INVOICE', W - M, 21, { align: 'right' })
  doc.setFontSize(10); doc.setTextColor(...LIGHT)
  doc.text(inv.number, W - M, 29, { align: 'right' })
  const status = inv.status as string
  doc.setFontSize(8.5); doc.setTextColor(255, 255, 255); doc.text(status.toUpperCase(), W - M, 35.5, { align: 'right' })

  // ---- meta + bill to ----
  let y = 58
  doc.setTextColor(...GREY); doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  doc.text('BILL TO', M, y); doc.text('INVOICE DETAILS', 125, y)
  doc.setTextColor(...INK); doc.setFontSize(11); doc.text(inv.client_company || inv.client_name || '-', M, y + 6)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  const billLines = [inv.client_company && inv.client_name ? inv.client_name : '', inv.client_email, inv.client_phone, ...(String(inv.client_address || '').split('\n'))].filter(Boolean)
  doc.setTextColor(...GREY); doc.text(doc.splitTextToSize(billLines.join('\n'), 95), M, y + 11.5)
  const meta: [string, string][] = [['Invoice date', d(inv.issue_date)], ['Due date', d(inv.due_date)], ['Currency', cur]]
  if (inv.project_name) meta.push(['Project', inv.project_name])
  for (const x of ((inv.extra_fields as { label: string; value: string }[]) || [])) if (x.label && x.value) meta.push([x.label, x.value])
  meta.forEach(([k, v], i) => {
    doc.setTextColor(...GREY); doc.text(k, 125, y + 6 + i * 5.5)
    doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.text(String(v), W - M, y + 6 + i * 5.5, { align: 'right', maxWidth: 55 }); doc.setFont('helvetica', 'normal')
  })

  // ---- items ----
  autoTable(doc, {
    startY: Math.max(y + 36, y + 6 + meta.length * 5.5 + 6, y + 11.5 + billLines.length * 4.4 + 6), margin: { left: M, right: M },
    head: [['#', 'Description', 'Qty', 'Unit price', 'Amount']],
    body: [...items].sort((a, b) => num(a.position) - num(b.position)).map((it, i) => [String(i + 1), it.description as string, String(num(it.quantity)), pdfMoney(num(it.unit_price), cur), pdfMoney(num(it.quantity) * num(it.unit_price), cur)]),
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, textColor: INK, lineColor: [226, 232, 240], lineWidth: 0 },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: { 0: { cellWidth: 9, textColor: GREY }, 2: { halign: 'right', cellWidth: 16 }, 3: { halign: 'right', cellWidth: 34 }, 4: { halign: 'right', cellWidth: 36, fontStyle: 'bold' } },
    didParseCell: (h) => { if (h.section === 'head' && [2, 3, 4].includes(h.column.index)) h.cell.styles.halign = 'right' },
    didDrawPage: () => drawFooter(doc, co, footer),
  })

  // ---- summary ----
  let sy = (doc as any).lastAutoTable.finalY + 8
  if (sy > 235) { doc.addPage(); sy = 24 }
  const sx = 118, sw = W - M - sx
  const rows: [string, string, boolean?][] = [['Subtotal', pdfMoney(num(inv.subtotal), cur)]]
  if (num(inv.discount) > 0) rows.push(['Discount', '- ' + pdfMoney(num(inv.discount), cur)])
  if (num(inv.tax_rate) > 0) rows.push([`Tax (${num(inv.tax_rate)}%)`, pdfMoney(num(inv.tax_amount), cur)])
  rows.push(['Total', pdfMoney(num(inv.total), cur), true])
  if (num(inv.amount_paid) > 0) rows.push(['Amount paid', '- ' + pdfMoney(num(inv.amount_paid), cur)])
  doc.setFontSize(9.5)
  rows.forEach(([k, v, bold]) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setTextColor(...(bold ? INK : GREY)); doc.text(k, sx, sy)
    doc.setTextColor(...INK); doc.text(v, W - M, sy, { align: 'right' }); sy += 6.5
  })
  doc.setFillColor(...BLUE); doc.roundedRect(sx - 3, sy - 3, sw + 6, 12, 1.5, 1.5, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text(num(inv.balance) <= 0 && num(inv.total) > 0 ? 'PAID IN FULL' : 'BALANCE DUE', sx, sy + 4.7)
  doc.setFontSize(12); doc.text(pdfMoney(num(inv.balance), cur), W - M, sy + 4.9, { align: 'right' })
  sy += 18

  if (payments.length) {
    doc.setTextColor(...GREY); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('PAYMENTS RECEIVED', M, sy - 6)
    autoTable(doc, { startY: sy - 3, margin: { left: M, right: 100 }, head: [['Date', 'Method', 'Amount']], body: payments.map((p) => [d(p.date), p.method || '-', pdfMoney(num(p.amount), cur)]),
      styles: { fontSize: 8, cellPadding: 1.8, textColor: INK }, headStyles: { fillColor: [241, 245, 249], textColor: GREY, fontSize: 7.5 }, columnStyles: { 2: { halign: 'right' } }, didDrawPage: () => drawFooter(doc, co, footer) })
    sy = Math.max(sy, (doc as any).lastAutoTable.finalY + 8)
  }

  const block = (title: string, text: string) => {
    if (!text?.trim()) return
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    const lines = doc.splitTextToSize(text, W - 2 * M)
    if (sy + 8 + lines.length * 4.2 > 272) { doc.addPage(); sy = 22 }
    doc.setTextColor(...BLUE); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.text(title.toUpperCase(), M, sy)
    doc.setTextColor(...INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(lines, M, sy + 5.5)
    sy += 9 + lines.length * 4.2
  }
  sy = Math.max(sy, (doc as any).lastAutoTable.finalY + 8)
  block('Payment instructions', inv.payment_instructions)
  block('Payment terms', inv.payment_terms)
  block('Notes', inv.notes)

  // ---- terms & conditions ----
  const terms = (inv.terms as { title: string; body: string }[]) || []
  if (terms.length) {
    doc.addPage(); sy = 24
    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text('Terms & Conditions', M, sy); sy += 3
    doc.setDrawColor(...BLUE); doc.setLineWidth(0.8); doc.line(M, sy, M + 24, sy); sy += 8
    terms.forEach((t, i) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8)
      const lines = doc.splitTextToSize(t.body, W - 2 * M - 6)
      if (sy + 10 + lines.length * 4 > 272) { doc.addPage(); sy = 22 }
      doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.text(`${i + 1}. ${t.title}`, M, sy)
      doc.setTextColor(...GREY); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); doc.text(lines, M + 6, sy + 5)
      sy += 8.5 + lines.length * 4
    })
  }

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) { doc.setPage(i); drawFooter(doc, co, footer, i, pages) }
  return doc
}

function drawFooter(doc: jsPDF, c: { name: string; website: string; email: string; phone: string }, footer?: string, page?: number, pages?: number) {
  const W = 210, H = 297
  doc.setFillColor(...NAVY); doc.rect(0, H - 14, W, 14, 'F')
  doc.setFillColor(...BLUE); doc.rect(0, H - 14, W, 0.8, 'F')
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(203, 213, 225)
  doc.text(`${c.name}  |  ${c.website}  |  ${c.email}  |  ${c.phone}`, 16, H - 6)
  if (page && pages) doc.text(`Page ${page} of ${pages}`, W - 16, H - 6, { align: 'right' })
  if (footer && page === 1) { doc.setTextColor(...GREY); doc.text(footer, W / 2, H - 18, { align: 'center' }) }
}

export const invoiceFileName = (inv: Row) => `${inv.number}${inv.client_company ? ' - ' + inv.client_company : ''}.pdf`.replace(/[\\/:*?"<>|]/g, '_')
