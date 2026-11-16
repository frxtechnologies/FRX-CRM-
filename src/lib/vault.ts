import { useSyncExternalStore } from 'react'

/**
 * Vault encryption. Secrets (passwords, recovery codes, notes) are encrypted IN THE BROWSER with AES-256-GCM,
 * using a key derived from a shared vault passphrase (PBKDF2-SHA256, 600k iterations). The database only ever
 * stores ciphertext. The passphrase and key live in memory only: they are never saved or sent anywhere.
 */
let key: CryptoKey | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export const useVaultUnlocked = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => key !== null)
export const lockVault = () => { key = null; emit() }

const enc = new TextEncoder(), dec = new TextDecoder()
const b64 = (buf: ArrayBuffer | Uint8Array) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s) }
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export const KDF_ITERATIONS = 600_000 // OWASP 2023 guidance for PBKDF2-HMAC-SHA256
async function derive(pass: string, salt: Uint8Array, iterations = KDF_ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function encryptJSON(obj: unknown, k: CryptoKey | null = key): Promise<string> {
  if (!k) throw new Error('Vault is locked')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(JSON.stringify(obj)))
  return `${b64(iv)}.${b64(ct)}`
}
export async function decryptJSON<T = any>(s: string, k: CryptoKey | null = key): Promise<T> {
  if (!k) throw new Error('Vault is locked')
  const [iv, ct] = s.split('.')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) as BufferSource }, k, unb64(ct) as BufferSource)
  return JSON.parse(dec.decode(pt))
}

/** First-time setup: returns the public parameters to store (salt + a verifier that proves the passphrase is right). */
export async function setupVault(pass: string): Promise<{ salt: string; verifier: string; iter: number }> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const k = await derive(pass, salt, KDF_ITERATIONS)
  const verifier = await encryptJSON({ ok: 'frx-vault' }, k)
  key = k; emit()
  return { salt: b64(salt), verifier, iter: KDF_ITERATIONS }
}

export async function unlockVault(pass: string, salt: string, verifier: string, iter = 250_000): Promise<boolean> {
  try {
    const k = await derive(pass, unb64(salt), iter)
    const v = await decryptJSON<{ ok: string }>(verifier, k)
    if (v.ok !== 'frx-vault') return false
    key = k; emit(); return true
  } catch { return false }
}
