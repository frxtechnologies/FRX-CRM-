import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'

export type Row = { id: string; created_at: string; updated_at: string; created_by?: string; updated_by?: string; [k: string]: any }

export const TABLES = [
  'profiles', 'leads', 'lead_activities', 'lead_notes', 'follow_ups', 'clients', 'projects', 'project_tasks',
  'business_tasks', 'business_notes', 'income_transactions', 'expense_transactions', 'investments', 'invoices',
  'invoice_items', 'invoice_payments', 'subscriptions', 'documents', 'notifications', 'activity_logs',
  'exchange_rates', 'app_settings', 'vault_items', 'personal_expenses', 'messages',
] as const
export type TableName = (typeof TABLES)[number]

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const IS_DEMO = !(url && key)
export const supabase: SupabaseClient | null = IS_DEMO ? null : createClient(url!, key!)

// ---------- in-memory cache (all business data is small enough to hold client-side) ----------
const data: Record<string, Row[]> = {}
const listeners = new Set<() => void>()
let version = 0
const emit = () => { version++; listeners.forEach((l) => l()) }
for (const t of TABLES) data[t] = []

const LS = (t: string) => `frxos:demo:v1:${t}`
const readLocal = (t: string): Row[] => {
  try { return JSON.parse(localStorage.getItem(LS(t)) || '[]') } catch { return [] }
}
const writeLocal = (t: string, rows: Row[]) => localStorage.setItem(LS(t), JSON.stringify(rows))

export async function loadTable(t: TableName) {
  if (IS_DEMO) data[t] = readLocal(t)
  else {
    const { data: rows, error } = await supabase!.from(t).select('*').order('created_at', { ascending: true }).limit(10000)
    if (error) throw error
    data[t] = (rows || []) as Row[]
  }
  emit()
}

let realtimeStarted = false
/** Tables added later by an optional SQL migration. If one is missing the app still loads; its page explains what to run. */
const OPTIONAL = new Set<string>(['vault_items', 'personal_expenses', 'messages'])
export const missingTables = new Set<string>()
export async function loadAll() {
  missingTables.clear()
  await Promise.all(TABLES.map((t) => loadTable(t).catch((e) => { if (OPTIONAL.has(t) && !IS_DEMO) { missingTables.add(t); return } throw e })))
  if (realtimeStarted) return
  realtimeStarted = true
  if (IS_DEMO) {
    // Another browser tab acting as the other partner: pick up its writes instantly.
    window.addEventListener('storage', (e) => {
      const t = TABLES.find((x) => LS(x) === e.key)
      if (t) { data[t] = readLocal(t); emit() }
    })
  } else {
    const ch = supabase!.channel('frx-all')
    for (const t of TABLES) if (!missingTables.has(t)) ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => { loadTable(t) })
    ch.subscribe()
  }
}

export function resetRealtime() { realtimeStarted = false }
/** Drop all business data from memory (called on sign-out so the next person on this computer never sees it). */
export function clearCache() { for (const t of TABLES) data[t] = []; emit() }

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))
const now = () => new Date().toISOString()

export async function rawInsert(t: TableName, values: Record<string, any>, userId?: string): Promise<Row> {
  if (IS_DEMO) {
    const row: Row = { id: values.id || uid(), created_at: now(), updated_at: now(), created_by: userId, updated_by: userId, ...values }
    data[t] = [...data[t], row]
    writeLocal(t, data[t])
    emit()
    return row
  }
  const payload = { ...values, created_by: userId, updated_by: userId }
  const { data: row, error } = await supabase!.from(t).insert(payload).select().single()
  if (error) throw error
  data[t] = [...data[t], row as Row]
  emit()
  return row as Row
}

export async function rawUpdate(t: TableName, id: string, patch: Record<string, any>, userId?: string): Promise<Row> {
  if (IS_DEMO) {
    let out: Row | undefined
    data[t] = data[t].map((r) => (r.id === id ? (out = { ...r, ...patch, updated_at: now(), updated_by: userId }) : r))
    if (!out) throw new Error('Record not found')
    writeLocal(t, data[t])
    emit()
    return out
  }
  const { data: row, error } = await supabase!.from(t).update({ ...patch, updated_by: userId }).eq('id', id).select().single()
  if (error) throw error
  data[t] = data[t].map((r) => (r.id === id ? (row as Row) : r))
  emit()
  return row as Row
}

export async function rawRemove(t: TableName, id: string) {
  if (IS_DEMO) {
    data[t] = data[t].filter((r) => r.id !== id)
    writeLocal(t, data[t])
    emit()
    return
  }
  const { error } = await supabase!.from(t).delete().eq('id', id)
  if (error) throw error
  data[t] = data[t].filter((r) => r.id !== id)
  emit()
}

export const snapshot = (t: TableName): Row[] => data[t]
export const byId = (t: TableName, id?: string | null) => (id ? data[t].find((r) => r.id === id) : undefined)

export function useTable(t: TableName): Row[] {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => data[t],
  )
}
/** Re-render on any table change (for cross-table computed views). */
export function useVersion(): number {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => version)
}

// ---------- file storage ----------
const BLOCKED_FILE = /\.(html?|xhtml|svg|js|mjs|exe|bat|cmd|com|ps1|msi|scr|vbs|jar|dll|sh|apk|app|lnk)$/i
export const MAX_UPLOAD = 10 * 1024 * 1024
export async function uploadFile(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD) throw new Error('That file is over 10 MB.')
  if (BLOCKED_FILE.test(file.name)) throw new Error('This file type is blocked for safety (web pages, scripts and programs are not allowed).')
  if (IS_DEMO) {
    if (file.size > 2_500_000) throw new Error('Demo mode stores files in the browser; keep files under 2.5 MB (Supabase mode has no such limit).')
    return await new Promise((res, rej) => {
      const fr = new FileReader()
      fr.onload = () => res(String(fr.result))
      fr.onerror = () => rej(fr.error)
      fr.readAsDataURL(file)
    })
  }
  const path = `${uid()}-${file.name.replace(/[^\w.\-]+/g, '_')}`
  const { error } = await supabase!.storage.from('frx-files').upload(path, file)
  if (error) throw error
  return `storage:${path}`
}
export async function resolveFileUrl(ref?: string | null): Promise<string | null> {
  if (!ref) return null
  if (!ref.startsWith('storage:')) return ref.startsWith('data:') ? ref : null // never follow arbitrary URLs stored in a record
  const { data: d, error } = await supabase!.storage.from('frx-files').createSignedUrl(ref.slice(8), 3600)
  if (error) return null
  return d.signedUrl
}
