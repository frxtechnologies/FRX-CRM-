/** Parse CSV / TSV / semicolon text into raw rows (no header handling). Picks the delimiter from the first lines. */
export function parseDelimited(text: string): string[][] {
  const s = text.replace(/^﻿/, '')
  const sample = s.split(/\r?\n/).slice(0, 8).join('\n')
  const count = (d: string) => (sample.match(new RegExp(d === '\t' ? '\\t' : d === '|' ? '\\|' : d, 'g')) || []).length
  const delim = [',', ';', '\t', '|'].map((d) => [d, count(d)] as const).sort((a, b) => b[1] - a[1])[0][0]
  const rows: string[][] = []
  let cur: string[] = [], field = '', q = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++ } else q = false } else field += c
    } else if (c === '"' && field === '') q = true
    else if (c === delim) { cur.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      cur.push(field); field = ''
      if (cur.some((x) => x.trim() !== '')) rows.push(cur)
      cur = []
    } else field += c
  }
  cur.push(field)
  if (cur.some((x) => x.trim() !== '')) rows.push(cur)
  return rows
}
