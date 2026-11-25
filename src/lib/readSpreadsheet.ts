import { parseDelimited } from './delimited'
import type { RawSheet } from './leadImport'

export const MAX_IMPORT_BYTES = 8 * 1024 * 1024

/** Read an uploaded .xlsx / .csv / .tsv / .txt into raw sheets. Runs entirely in the browser. */
export async function readSpreadsheet(file: File): Promise<RawSheet[]> {
  const name = file.name.toLowerCase()
  if (file.size > MAX_IMPORT_BYTES) throw new Error('That file is bigger than 8 MB. Split it into smaller files and import them one by one.')
  if (/\.(csv|tsv|txt)$/.test(name)) return [{ name: file.name.replace(/\.[^.]+$/, ''), rows: parseDelimited(await file.text()) }]
  if (/\.xls$/.test(name)) throw new Error('Old .xls files are not supported. Open it in Excel or Google Sheets and save it as .xlsx or .csv, then upload again.')
  if (/\.xlsx$/.test(name)) {
    const { default: readExcel } = await import('read-excel-file/browser')
    const sheets = await readExcel(file)
    return sheets.map((s: { sheet: string; data: unknown[][] }) => ({ name: s.sheet, rows: s.data }))
  }
  throw new Error('Upload an Excel (.xlsx) or CSV file.')
}
