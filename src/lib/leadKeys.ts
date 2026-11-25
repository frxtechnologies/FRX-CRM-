/** Normalisers used to decide whether two leads are the same business (shared by manual add and spreadsheet import). */
export const digits9 = (s?: string) => (s || '').replace(/\D/g, '').replace(/^0+/, '').slice(-9)
export const domainOf = (s?: string) => (s || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim()
export const nameKeyOf = (s?: string) => (s || '').toLowerCase().replace(/\b(pvt|ltd|llc|inc|co|company|limited|private|the)\b/g, '').replace(/[^a-z0-9]/g, '')
export const cityKeyOf = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
