/**
 * Smart lead-sheet importer (pure logic, no browser APIs, so it can be tested with real files).
 *  - finds the sheets that really contain leads and ignores summaries / scoring / instruction sheets
 *  - finds the header row and matches columns by header name, falling back to what the cells contain
 *  - works out the COUNTRY of every lead (country column, US state, UK postcode, phone format, website domain, sheet, file name)
 *  - cleans phones / emails / websites, treats "Not found" style placeholders as empty
 *  - keeps every other column in the lead's notes so nothing is lost
 *  - skips duplicates (within the file and against leads already in the CRM)
 */
import { INDUSTRIES_INTL, INDUSTRIES_LOCAL, LEAD_STATUSES, SERVICES } from './constants'
import { cityKeyOf, digits9, domainOf, nameKeyOf } from './leadKeys'

export type Cell = unknown
export type RawSheet = { name: string; rows: Cell[][] }
export type ExistingLead = { business_name?: string; city?: string; phone?: string; whatsapp?: string; email?: string; website?: string }

type Field = 'id' | 'business_name' | 'name_generic' | 'contact' | 'email' | 'phone' | 'whatsapp' | 'website' | 'country' | 'state' | 'region' | 'city' | 'address' | 'postcode'
  | 'industry' | 'business_type' | 'source' | 'priority' | 'score' | 'status' | 'deal_value' | 'currency' | 'assigned' | 'tags' | 'notes' | 'market' | 'last_contact' | 'next_follow_up' | 'services'

export type ParsedLead = {
  business_name: string; contact_person: string; email: string; phone: string; whatsapp: string; website: string
  country: string; countryCode: string; countryHow: string; city: string; industry: string; business_type: string; source: string
  priority: 'low' | 'medium' | 'high'; deal_value: number; currency: string; status: string; services: string[]; tags: string[]; notes: string
  market: 'local' | 'international'; last_contact: string | null; next_follow_up: string | null; assigned_hint: string; sheet: string; rowNo: number
}
export type SheetReport = { name: string; used: boolean; reason: string; headerRow: number; rows: number; leads: number; mapping: { header: string; field: string; how: 'header' | 'content' }[]; keptInNotes: string[] }
export type ImportPlan = {
  fileName: string; leads: ParsedLead[]; duplicates: { name: string; why: string }[]; sheets: SheetReport[]
  blankNames: number; badPhones: number; unknownCountry: number; byCountry: Record<string, number>; warnings: string[]
}

// ------------------------------------------------------------------ text helpers
const str = (v: Cell): string => {
  if (v == null) return ''
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  if (typeof v === 'object') { const o = v as Record<string, unknown>; return str(o.text ?? o.result ?? o.value ?? '') }
  return String(v).replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
}
const strKeepNewlines = (v: Cell) => (typeof v === 'string' ? v.replace(/ /g, ' ').trim() : str(v))

/** "Not found", "None found", "Not verified", "Not publicly available" ... are blanks, not data. */
const PLACEHOLDER = /^(n\/?a|none|nil|null|unknown|tbc|tba|-+|—|–|\?+|not (found|verified|available|provided|listed|named|visible|applicable|public\w*)\b.*|none (found|linked|listed|provided)\b.*|no (official )?(website|site|phone|email|number|contact|public\w*)\b.*|\[.*\]|listed on google.*|hidden .*)$/i
export const isEmptyish = (s: string) => !s || PLACEHOLDER.test(s.trim())
const norm = (h: string) => h.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, '')
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

// ------------------------------------------------------------------ header recognition
const RULES: [Field, (k: string) => boolean][] = [
  ['id', (k) => /^(id|leadid|ref|reference|refno|no|sno|srno|serial|serialno|index|rowid)$/.test(k)],
  ['whatsapp', (k) => /^(whatsapp|wa|whatsappno|whatsappnumber|whatsappnum|whatsappphone)$/.test(k)],
  ['phone', (k) => /^(phone|phonenumber|telephone|tel|telno|directphone|businessphone|publicphone|publicphonenumber|contactnumber|contactno|contactphone|landline|officephone|mainphone|mobile|mobilenumber|mobileno|ownersmobile|ownermobile|ownersmobilenumber|cell|cellphone|callnumber|phoneno|phonenum|number|phones)$/.test(k)],
  ['email', (k) => /^(email|emailaddress|emails|mail|businessemail|publicemail|contactemail|workemail|ownersemail|eaddress|emailid)$/.test(k)],
  ['website', (k) => /^(website|websiteurl|web|weburl|url|site|domain|webaddress|homepage|websitelink|link|websiteaddress)$/.test(k)],
  ['country', (k) => /^(country|nation|countryname|countryregion)$/.test(k)],
  ['state', (k) => /^(state|province|statecode|stateprovince|county|stateregion)$/.test(k)],
  ['region', (k) => k === 'region'],
  ['postcode', (k) => /^(postcode|postalcode|zip|zipcode|postal)$/.test(k)],
  ['city', (k) => /^(city|town|citytown|location|area|locality|cityname|townorcity|cityandstate)$/.test(k)],
  ['address', (k) => /^(address|fulladdress|streetaddress|postaladdress|businessaddress|address1|registeredaddress)$/.test(k)],
  ['services', (k) => /^(recommendedfrxservice|frxopportunity|recommendedservice|bestfitfrxservice|servicesinterestedin|services|service|opportunity|frxservice|bestfitservice)$/.test(k)],
  ['contact', (k) => /^(contactperson|contactname|contactfullname|contact|owner|ownername|ownercontact|ownerdecisionmaker|decisionmaker|keycontact|pointofcontact|fullname|person|director|manager|askfor|owneroperator|principal|contactperson1)$/.test(k) || k.startsWith('decisionmaker')],
  ['industry', (k) => /^(industry|sector|niche|trade|category|vertical|businesscategory|specialty|speciality|segment|industrytype)$/.test(k)],
  ['business_type', (k) => /^(businesstype|companytype|type|typeofbusiness)$/.test(k)],
  ['source', (k) => /^(source|leadsource|channel|origin|foundvia|foundon)$/.test(k)],
  ['priority', (k) => /^(priority|prioritylevel|tier|grade|temperature)$/.test(k)],
  ['score', (k) => /^(score|leadscore|totalscore)\d*$/.test(k) || k === 'total'],
  ['status', (k) => /^(status|leadstatus|stage|callstatus|pipelinestage|outreachstatus)$/.test(k)],
  ['deal_value', (k) => /^(dealvalue|estimateddealvalue|estimatedvalue|value|budget|dealsize|expectedvalue)$/.test(k)],
  ['currency', (k) => k === 'currency'],
  ['assigned', (k) => /^(assigned|assignedto|assignedpartner|salesrep|rep|agent|handler)$/.test(k)],
  ['tags', (k) => /^(tags|labels|tag)$/.test(k)],
  ['notes', (k) => /^(notes|note|comments|comment|remarks|businessnotes|internalnotes)$/.test(k)],
  ['market', (k) => k === 'market' || k === 'leadmarket'],
  ['last_contact', (k) => /^(lastcontact|lastcontacted|lastcontactdate|datecontacted)$/.test(k)],
  ['next_follow_up', (k) => /^(nextfollowup|followupdate|nextfollowupdate|nextcontact)$/.test(k)],
  ['business_name', (k) => /^(businessname|business|company|companyname|organisation|organization|organisationname|firm|tradingname|leadname|prospect|prospectname|account|accountname|practice|clinic|shop|store|companytrading)$/.test(k)],
  ['name_generic', (k) => k === 'name'],
]
const mapHeader = (raw: string): Field | null => {
  if (!raw || raw.length > 60) return null
  const k = norm(raw)
  if (!k) return null
  for (const [f, t] of RULES) if (t(k)) return f
  return null
}

// ------------------------------------------------------------------ countries
type Country = { name: string; code: string; dial: string; cur: string; tld: string[]; syn: string[] }
const COUNTRIES: Country[] = [
  { name: 'United Kingdom', code: 'UK', dial: '44', cur: 'GBP', tld: ['uk'], syn: ['uk', 'u.k.', 'united kingdom', 'great britain', 'gb', 'gbr', 'britain', 'england', 'scotland', 'wales', 'northern ireland'] },
  { name: 'United States', code: 'US', dial: '1', cur: 'USD', tld: [], syn: ['us', 'u.s.', 'usa', 'u.s.a.', 'united states', 'united states of america', 'america'] },
  { name: 'Pakistan', code: 'PK', dial: '92', cur: 'PKR', tld: ['pk'], syn: ['pakistan', 'pk', 'pak'] },
  { name: 'United Arab Emirates', code: 'UAE', dial: '971', cur: 'AED', tld: ['ae'], syn: ['uae', 'united arab emirates', 'dubai', 'abu dhabi', 'sharjah', 'emirates'] },
  { name: 'Saudi Arabia', code: 'KSA', dial: '966', cur: 'SAR', tld: ['sa'], syn: ['saudi arabia', 'ksa', 'saudi', 'riyadh', 'jeddah'] },
  { name: 'Canada', code: 'CA', dial: '1', cur: 'CAD', tld: ['ca'], syn: ['canada', 'can'] },
  { name: 'South Africa', code: 'ZA', dial: '27', cur: 'ZAR', tld: ['za'], syn: ['south africa', 'za', 'rsa'] },
  { name: 'Ireland', code: 'IE', dial: '353', cur: 'USD', tld: ['ie'], syn: ['ireland', 'ie', 'republic of ireland'] },
  { name: 'Australia', code: 'AU', dial: '61', cur: 'USD', tld: ['au'], syn: ['australia', 'au'] },
  { name: 'India', code: 'IN', dial: '91', cur: 'USD', tld: ['in'], syn: ['india'] },
  { name: 'Germany', code: 'DE', dial: '49', cur: 'USD', tld: ['de'], syn: ['germany', 'deutschland'] },
  { name: 'France', code: 'FR', dial: '33', cur: 'USD', tld: ['fr'], syn: ['france'] },
  { name: 'Netherlands', code: 'NL', dial: '31', cur: 'USD', tld: ['nl'], syn: ['netherlands', 'holland'] },
  { name: 'Qatar', code: 'QA', dial: '974', cur: 'USD', tld: ['qa'], syn: ['qatar'] },
  { name: 'Turkey', code: 'TR', dial: '90', cur: 'USD', tld: ['tr'], syn: ['turkey', 'turkiye'] },
  { name: 'New Zealand', code: 'NZ', dial: '64', cur: 'USD', tld: ['nz'], syn: ['new zealand'] },
]
const byName = (n: string) => COUNTRIES.find((c) => c.name === n)!
const US_STATES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '))
const CA_PROVINCES = new Set('AB BC MB NB NL NS NT NU ON PE QC SK YT'.split(' '))
const CA_AREA = new Set('204 226 236 249 250 257 263 289 306 343 354 365 367 368 382 403 416 418 431 437 438 450 468 474 506 514 519 548 579 581 584 587 604 613 639 647 672 683 705 709 742 753 778 780 782 807 819 825 867 873 879 902 905'.split(' '))
const UK_POSTCODE = /\b(GIR ?0AA|[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]? ?\d[ABD-HJLNP-UW-Z]{2})\b/i
const US_ZIP_STATE = /,\s*([A-Z]{2})\s+\d{5}(-\d{4})?\b/

function countryFromText(text: string, fuzzy = false): Country | null {
  const t = text.toLowerCase().replace(/[()]/g, ' ')
  if (!t.trim()) return null
  const tokens = t.split(/[,;/|\-–—]+/).map((x) => x.trim()).filter(Boolean)
  for (const tok of [...tokens].reverse().concat([t.trim()])) for (const c of COUNTRIES) if (c.syn.includes(tok)) return c
  if (fuzzy) { // file names and long text: look for whole words
    const words = t.split(/[^a-z.]+/).filter(Boolean)
    for (const c of COUNTRIES) for (const s of c.syn) if (s.length > 2 && (t.includes(s) || words.includes(s))) return c
    for (const c of COUNTRIES) if (words.some((w) => c.syn.includes(w) && w.length === 2 && ['uk', 'us', 'pk', 'za'].includes(w))) return c
  }
  return null
}

function countryFromPhone(raw: string, ukHint: boolean): { c: Country; how: string } | null {
  const d = raw.replace(/[^\d+]/g, '')
  if (!d) return null
  let intl = ''
  if (d.startsWith('+')) intl = d.slice(1)
  else if (d.startsWith('00')) intl = d.slice(2)
  if (intl) {
    if (intl.startsWith('1') && intl.length === 11) return { c: byName(CA_AREA.has(intl.slice(1, 4)) ? 'Canada' : 'United States'), how: 'phone' }
    let best: Country | null = null
    for (const c of COUNTRIES) if (c.dial !== '1' && intl.startsWith(c.dial) && (!best || c.dial.length > best.dial.length)) best = c
    return best ? { c: best, how: 'phone' } : null
  }
  const n = d.replace(/\D/g, '')
  if (/^0(7\d{9}|[12]\d{8,9}|800\d{6,7}|8\d{9})$/.test(n)) return { c: byName('United Kingdom'), how: 'phone' }
  if (/^03\d{9}$/.test(n)) return { c: byName(ukHint ? 'United Kingdom' : 'Pakistan'), how: 'phone' }
  if (/^0(21|42|51|52|91|61|41|55|71|99)\d{7,8}$/.test(n) && !ukHint) return { c: byName('Pakistan'), how: 'phone' }
  const us = n.length === 11 && n.startsWith('1') ? n.slice(1) : n
  if (us.length === 10 && /^[2-9]\d{2}[2-9]\d{6}$/.test(us)) return { c: byName(CA_AREA.has(us.slice(0, 3)) ? 'Canada' : 'United States'), how: 'phone' }
  return null
}

function countryFromDomain(url: string): Country | null {
  const host = domainOf(url)
  if (!host) return null
  const tld = host.split('.').pop() || ''
  return COUNTRIES.find((c) => c.tld.includes(tld)) || null
}

// ------------------------------------------------------------------ phones / emails / websites
function extractPhones(text: string): string[] {
  const out: string[] = []
  for (const seg of text.split(/[\/;,|\n]|\bor\b/i)) {
    const t = seg.trim()
    if (!t || isEmptyish(t)) continue
    const digits = t.replace(/\D/g, '')
    if (digits.length >= 6 && digits.length <= 15 && /^[+\d\s().\-ext]+$/i.test(t)) out.push(t)
  }
  return out
}
const isMobile = (n: string) => /^(\+?44|0)?7\d{9}$/.test(n.replace(/[^\d+]/g, '').replace(/^\+?440?/, '0').replace(/^00/, '')) || /^(\+?92|0)?3\d{9}$/.test(n.replace(/[^\d+]/g, '').replace(/^\+?92/, '0'))

function formatPhone(raw: string, c: Country | null): { value: string; ok: boolean } {
  let d = raw.replace(/[^\d+]/g, '')
  if (d.startsWith('00')) d = '+' + d.slice(2)
  const digits = d.replace(/\D/g, '')
  if (digits.length < 8) return { value: raw.trim(), ok: false }
  const group = (code: string, rest: string, a: number) => `+${code} ${rest.slice(0, a)} ${rest.slice(a)}`.trim()
  if (d.startsWith('+')) {
    const rest = digits
    if (rest.startsWith('44')) return { value: group('44', rest.slice(2), 4), ok: rest.length >= 12 && rest.length <= 13 }
    if (rest.startsWith('1') && rest.length === 11) return { value: `+1 ${rest.slice(1, 4)} ${rest.slice(4, 7)} ${rest.slice(7)}`, ok: true }
    if (rest.startsWith('92')) return { value: group('92', rest.slice(2), 3), ok: rest.length >= 12 }
    return { value: '+' + rest, ok: rest.length >= 9 }
  }
  if (c?.code === 'UK') {
    const n = digits.startsWith('0') ? digits : (digits.length === 10 ? '0' + digits : digits)
    const ok = n.startsWith('0') && (n.length === 11 || (n.length === 10 && /^0(1|2|3|8)/.test(n)))
    return ok ? { value: group('44', n.slice(1), 4), ok: true } : { value: raw.trim(), ok: false }
  }
  if (c?.code === 'US' || c?.code === 'CA') {
    const n = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
    return n.length === 10 ? { value: `+1 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`, ok: true } : { value: raw.trim(), ok: false }
  }
  if (c?.code === 'PK') {
    const n = digits.startsWith('0') ? digits.slice(1) : digits
    return { value: group('92', n, 3), ok: n.length === 10 || n.length === 9 }
  }
  return { value: raw.trim(), ok: digits.length >= 9 && digits.length <= 15 }
}

const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g
const extractEmails = (t: string) => [...new Set((t.match(EMAIL_RE) || []).map((e) => e.toLowerCase()))]
function cleanWebsite(t: string): string {
  const s = t.trim().split(/\s+/)[0] || ''
  if (isEmptyish(s) || !/\./.test(s)) return ''
  const withProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`
  try {
    const u = new URL(withProto)
    if (!/^https?:$/.test(u.protocol) || !u.hostname.replace(/^www\./, '').includes('.')) return ''
    return u.href.replace(/\/$/, '')
  } catch { return '' }
}

// ------------------------------------------------------------------ industry / priority / status / services
const INDUSTRY_RULES: [RegExp, { intl: string; local: string }][] = [
  [/dental|dentist|orthodont/i, { intl: 'Dental Clinics', local: 'Clinics' }],
  [/property manage|letting|lettings|landlord|tenant/i, { intl: 'Property Management', local: 'Real Estate' }],
  [/estate agent|real estate|realtor|realty|property|broker/i, { intl: 'Real Estate Businesses', local: 'Real Estate' }],
  [/ppf|paint protection|detailing|tint|wrap|ceramic/i, { intl: 'Paint Protection Film Businesses', local: 'Glass Companies' }],
  [/car (dealer|sales)|dealership|auto (sales|dealer)|motors?\b|used car|vehicle/i, { intl: 'Car Dealerships', local: 'Mobile and Laptop Shops' }],
  [/e-?commerce|online store|retail|boutique|shop\b|store\b|furniture|fashion/i, { intl: 'E-commerce Brands', local: 'E-commerce' }],
  [/solar/i, { intl: 'Construction Companies', local: 'Solar Companies' }],
  [/glass/i, { intl: 'Construction Companies', local: 'Glass Companies' }],
  [/event/i, { intl: 'E-commerce Brands', local: 'Event Management' }],
  [/clinic|medical|health|doctor|hospital/i, { intl: 'Dental Clinics', local: 'Clinics' }],
  [/teacher|tutor|education|school|academy|learning/i, { intl: 'E-commerce Brands', local: 'Education and Teachers' }],
  [/construct|build|roof|plaster|electric|plumb|joiner|carpent|contractor|renovat|extension|tiling|paint|decorat|landscap|fascia|window/i, { intl: 'Construction Companies', local: 'Construction' }],
]
function mapIndustry(text: string, local: boolean): { industry: string; type: string } {
  const t = text.trim()
  if (isEmptyish(t)) return { industry: '', type: '' }
  const list = local ? INDUSTRIES_LOCAL : INDUSTRIES_INTL
  const exact = list.find((x) => x.toLowerCase() === t.toLowerCase())
  if (exact) return { industry: exact, type: '' }
  for (const [re, m] of INDUSTRY_RULES) if (re.test(t)) { const pick = local ? m.local : m.intl; return { industry: pick, type: pick.toLowerCase() === t.toLowerCase() ? '' : clip(t, 120) } }
  return { industry: clip(t.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60), 60), type: '' }
}
function mapPriority(pri: string, score: number | null, scale: number): 'low' | 'medium' | 'high' {
  const p = pri.toLowerCase().trim()
  if (p) {
    if (/\bhigh\b|^hot$|^urgent$|^a$|^1$|^p1$|top/.test(p)) return 'high'
    if (/\bmed|^warm$|^b$|^2$|^p2$|normal/.test(p)) return 'medium'
    if (/\blow\b|^cold$|^c$|^d$|^3$|^p3$/.test(p)) return 'low'
  }
  if (score != null) { const s = scale === 10 ? score * 10 : score; return s >= 80 ? 'high' : s >= 65 ? 'medium' : 'low' }
  return 'medium'
}
const STATUS_SYN: [RegExp, string][] = [
  [/^(not called|new|uncontacted|not contacted|to call|todo|to do|pending|fresh)$/i, 'Not Contacted'],
  [/no (answer|response|reply)|voicemail|unreachable|not reachable/i, 'No Response'],
  [/call ?back|callback|follow[- ]?up|call later|ring back/i, 'Follow-up Required'],
  [/not interested|declined|do not call|dnc|unsubscribe|remove me/i, 'Not Interested'],
  [/^interested|hot lead/i, 'Interested'],
  [/meeting|appointment|booked/i, 'Meeting Scheduled'],
  [/proposal|quote sent/i, 'Proposal Sent'],
  [/negotiat/i, 'Negotiation'], [/^called$/i, 'Called'], [/email(ed)? sent|emailed/i, 'Email Sent'], [/whatsapp/i, 'WhatsApp Sent'], [/^contacted$/i, 'Contacted'], [/^lost$/i, 'Lost'],
]
function mapStatus(t: string): { status: string; dnc: boolean } {
  const s = t.trim()
  if (isEmptyish(s)) return { status: 'New Lead', dnc: false }
  const dnc = /do not call|dnc/i.test(s)
  const exact = LEAD_STATUSES.find((x) => x.toLowerCase() === s.toLowerCase())
  if (exact && exact !== 'Won / Converted') return { status: exact, dnc }
  for (const [re, st] of STATUS_SYN) if (re.test(s)) return { status: st, dnc }
  return { status: 'New Lead', dnc }
}
const SERVICE_RULES: [RegExp, string][] = [
  [/web ?app|portal|platform|dashboard|crm|booking system/i, 'Web Applications'], [/website|web site|redesign|rebuild|landing|storefront|shopify|e-?commerce/i, 'Website Development'],
  [/chat ?bot|ai (chat|assistant|concierge|agent|receptionist)|assistant/i, 'AI Chatbots'], [/automation|workflow|automate/i, 'AI Automation'],
  [/mobile app|ios|android/i, 'Mobile Applications'], [/ui\/?ux|design|branding|brand/i, 'UI/UX Design'], [/analytics|reporting|business intelligence|bi\b/i, 'Data Analytics'], [/saas/i, 'SaaS Development'],
]
const mapServices = (t: string): string[] => (isEmptyish(t) ? [] : [...new Set(SERVICE_RULES.filter(([re]) => re.test(t)).map(([, s]) => s))].filter((s) => (SERVICES as readonly string[]).includes(s)))

function parseDate(t: string): string | null {
  const s = t.trim()
  if (!s) return null
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(s)
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` }
  return null
}
const parseNumber = (t: string): number | null => { const m = /-?\d[\d,]*\.?\d*/.exec(t.replace(/\s/g, '')); if (!m) return null; const n = Number(m[0].replace(/,/g, '')); return Number.isFinite(n) ? n : null }

function cleanContact(t: string): { name: string; role: string } {
  const s = t.trim()
  if (isEmptyish(s)) return { name: '', role: '' }
  const m = /^(.+?)\s+[-–—|]\s+(.+)$/.exec(s)
  const name = (m ? m[1] : s.replace(/\s*\(.*$/, '')).trim()
  return { name: clip(name, 80), role: m ? clip(m[2], 120) : '' }
}

// ------------------------------------------------------------------ duplicates
const SHARED_HOSTS = ['facebook.com', 'instagram.com', 'linkedin.com', 'google.com', 'linktr.ee', 'business.site', 'wixsite.com', 'weebly.com', 'godaddysites.com', 'square.site', 'sites.google.com', 'wordpress.com', 'yell.com', 'checkatrade.com']
class DupIndex {
  names = new Map<string, Set<string>>(); phones = new Set<string>(); emails = new Set<string>(); domains = new Set<string>()
  constructor(existing: ExistingLead[]) { existing.forEach((l) => this.add(l)) }
  add(l: ExistingLead) {
    const nk = nameKeyOf(l.business_name)
    if (nk) { const s = this.names.get(nk) || new Set<string>(); s.add(cityKeyOf(l.city)); this.names.set(nk, s) }
    for (const p of [l.phone, l.whatsapp]) { const d = digits9(p); if (d.length >= 7) this.phones.add(d) }
    if (l.email) this.emails.add(l.email.toLowerCase().trim())
    const dm = domainOf(l.website); if (dm && !SHARED_HOSTS.some((h) => dm === h || dm.endsWith('.' + h))) this.domains.add(dm)
  }
  why(l: ExistingLead): string | null {
    const nk = nameKeyOf(l.business_name), ck = cityKeyOf(l.city)
    const cities = nk ? this.names.get(nk) : undefined
    if (cities && (!ck || cities.has('') || cities.has(ck))) return 'same business name'
    for (const p of [l.phone, l.whatsapp]) { const d = digits9(p); if (d.length >= 7 && this.phones.has(d)) return 'same phone number' }
    if (l.email && this.emails.has(l.email.toLowerCase().trim())) return 'same email'
    const dm = domainOf(l.website); if (dm && this.domains.has(dm)) return 'same website'
    return null
  }
}

// ------------------------------------------------------------------ sheets
const REFERENCE_SHEET = /^(summary|overview|method|how to|readme|read me|instructions?|dropdown|lookups?|score breakdown|call first|exclusions?|legend|about|cover)/i
type Col = { index: number; header: string; field: Field | null; how: 'header' | 'content' }

function pickHeaderRow(rows: Cell[][]): number {
  let best = -1, bestScore = 0
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cells = (rows[r] || []).map(str)
    if (cells.filter(Boolean).length < 2) continue
    const fields = new Set<Field>()
    cells.forEach((c) => { const f = mapHeader(c); if (f) fields.add(f) })
    const hasName = fields.has('business_name') || fields.has('name_generic')
    const hasContact = (['phone', 'email', 'website', 'whatsapp'] as Field[]).some((f) => fields.has(f))
    if (!hasName || !hasContact) continue
    if (fields.size > bestScore) { best = r; bestScore = fields.size }
  }
  return best
}

function sniffColumn(values: string[]): Field | null {
  const v = values.filter((x) => !isEmptyish(x)).slice(0, 60)
  if (v.length < 3) return null
  const share = (f: (s: string) => boolean) => v.filter(f).length / v.length
  if (share((s) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s.split(/[;,\s]/)[0] || s)) >= 0.6) return 'email'
  if (share((s) => /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s) && !/@/.test(s)) >= 0.6) return 'website'
  if (share((s) => /^[+\d\s().\-\/;]+$/.test(s) && s.replace(/\D/g, '').length >= 8) >= 0.6) return 'phone'
  return null
}

export function planImport(sheets: RawSheet[], fileName: string, existing: ExistingLead[], today = new Date().toISOString().slice(0, 10)): ImportPlan {
  const plan: ImportPlan = { fileName, leads: [], duplicates: [], sheets: [], blankNames: 0, badPhones: 0, unknownCountry: 0, byCountry: {}, warnings: [] }
  const idx = new DupIndex(existing)
  const fileIdx = new DupIndex([])
  const fileCountry = countryFromText(fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' '), true)

  for (const sh of sheets) {
    const rep: SheetReport = { name: sh.name, used: false, reason: '', headerRow: -1, rows: Math.max(0, sh.rows.length), leads: 0, mapping: [], keptInNotes: [] }
    plan.sheets.push(rep)
    if (REFERENCE_SHEET.test(sh.name.trim())) { rep.reason = 'Looks like a summary or instruction sheet, not a lead list'; continue }
    const hr = pickHeaderRow(sh.rows)
    if (hr < 0) { rep.reason = 'No lead columns found (needs a business name plus a phone, email or website column)'; continue }
    rep.headerRow = hr + 1

    // ---- map columns
    const headerCells = (sh.rows[hr] || []).map(str)
    const dataRows = sh.rows.slice(hr + 1).filter((r) => (r || []).some((c) => str(c) !== ''))
    const cols: Col[] = headerCells.map((h, index) => ({ index, header: h, field: h ? mapHeader(h) : null, how: 'header' as const })).filter((c) => c.header)
    const have = new Set(cols.map((c) => c.field).filter(Boolean) as Field[])
    if (have.has('business_name') && have.has('name_generic')) cols.forEach((c) => { if (c.field === 'name_generic') c.field = 'contact' })
    else if (!have.has('business_name')) cols.forEach((c) => { if (c.field === 'name_generic') c.field = 'business_name' })
    for (const c of cols) if (!c.field) {
      const f = sniffColumn(dataRows.map((r) => str(r[c.index])))
      if (f && !cols.some((o) => o.field === f && o !== c) ) { c.field = f; c.how = 'content' }
    }
    const colsOf = (f: Field) => cols.filter((c) => c.field === f)
    if (!colsOf('business_name').length) { rep.reason = 'Could not find the business name column'; continue }
    rep.used = true
    rep.mapping = cols.filter((c) => c.field && c.field !== 'name_generic').map((c) => ({ header: c.header, field: c.field as string, how: c.how }))
    const noteCols = cols.filter((c) => !c.field || ['id', 'region', 'address', 'score', 'state'].includes(c.field))
    rep.keptInNotes = noteCols.map((c) => c.header)

    // ---- score scale (0-10 or 0-100)
    const scoreCol = colsOf('score')[0]
    const scoreVals = scoreCol ? dataRows.map((r) => parseNumber(str(r[scoreCol.index]))).filter((n): n is number => n != null) : []
    const scoreScale = scoreCol && (/10$/.test(norm(scoreCol.header)) || (scoreVals.length > 0 && Math.max(...scoreVals) <= 10)) ? 10 : 100

    // ---- rows
    const sheetLeads: { lead: ParsedLead; signalled: boolean }[] = []
    const headerNameKey = norm(colsOf('business_name')[0].header)
    dataRows.slice(0, 20000).forEach((r, i) => {
      const cell = (c: Col) => str(r[c.index])
      const first = (f: Field) => { for (const c of colsOf(f)) { const v = cell(c); if (v && !isEmptyish(v)) return v } return '' }
      const name = clip(first('business_name'), 120)
      if (!name || norm(name) === headerNameKey) { plan.blankNames++; return }

      // contact details
      const phoneRaw = colsOf('phone').flatMap((c) => extractPhones(str(r[c.index])))
      const waRaw = colsOf('whatsapp').flatMap((c) => extractPhones(str(r[c.index])))
      const emails = colsOf('email').flatMap((c) => extractEmails(str(r[c.index])))
      const website = cleanWebsite(first('website'))
      const cityText = first('city'), stateText = first('state'), addrText = first('address'), postText = first('postcode'), regionText = first('region')

      // ---- country
      let country: Country | null = null, how = 'none'
      const ctext = first('country')
      if (ctext) { const c = countryFromText(ctext); if (c) { country = c; how = 'column' } }
      if (!country && stateText) {
        const st = stateText.trim().toUpperCase()
        if (US_STATES.has(st) && !CA_PROVINCES.has(st)) { country = byName('United States'); how = 'state' }
        else if (CA_PROVINCES.has(st) && !US_STATES.has(st)) { country = byName('Canada'); how = 'state' }
        else if (US_STATES.has(st)) { const p = phoneRaw.map((x) => countryFromPhone(x, false)).find(Boolean); country = p?.c.code === 'CA' ? byName('Canada') : byName('United States'); how = 'state' }
      }
      if (!country) {
        const blob = [cityText, addrText, postText, regionText].join(', ')
        const ct = countryFromText(blob)
        if (ct) { country = ct; how = 'address' }
        else if (UK_POSTCODE.test(blob)) { country = byName('United Kingdom'); how = 'postcode' }
        else { const z = US_ZIP_STATE.exec(blob); if (z && US_STATES.has(z[1])) { country = byName('United States'); how = 'address' } }
      }
      const ukHint = fileCountry?.code === 'UK' || country?.code === 'UK'
      if (!country) for (const p of [...phoneRaw, ...waRaw]) { const m = countryFromPhone(p, ukHint); if (m) { country = m.c; how = m.how; break } }
      if (!country) { const d = countryFromDomain(website) || emails.map((e) => countryFromDomain(e.split('@')[1])).find(Boolean) || null; if (d) { country = d; how = 'website' } }

      // ---- phones
      const primary = country ? formatPhone(phoneRaw[0] || '', country) : { value: phoneRaw[0] || '', ok: true }
      const extraNotes: string[] = []
      let phone = phoneRaw[0] ? primary.value : ''
      if (phoneRaw[0] && !primary.ok) { plan.badPhones++; extraNotes.push(`Phone looks incomplete: ${phoneRaw[0]}`) }
      let whatsapp = waRaw[0] ? formatPhone(waRaw[0], country).value : ''
      if (!whatsapp) { const mob = phoneRaw.find(isMobile); if (mob) whatsapp = formatPhone(mob, country).value }
      for (const extra of phoneRaw.slice(1)) { const f = formatPhone(extra, country); if (f.value !== phone && f.value !== whatsapp) extraNotes.push(`Other phone: ${f.value}${f.ok ? '' : ' (looks incomplete)'}`) }
      if (!phone && whatsapp) phone = whatsapp

      // ---- industry, priority, status, services
      const isLocal = country?.code === 'PK'
      const indText = first('industry'), typeText = first('business_type')
      const ind = mapIndustry(indText || typeText, isLocal)
      const scoreNum = scoreCol ? parseNumber(cell(scoreCol)) : null
      const priority = mapPriority(first('priority'), scoreNum, scoreScale)
      const st = mapStatus(first('status'))
      const services = [...new Set(colsOf('services').flatMap((c) => mapServices(str(r[c.index]))))]
      const contact = cleanContact(first('contact'))
      const currency = (colsOf('currency').map(cell).find((x) => /^[A-Z]{3}$/.test(x.trim().toUpperCase()) && !isEmptyish(x)) || '').toUpperCase() || country?.cur || 'USD'
      const dealVal = parseNumber(first('deal_value')) ?? 0
      const marketCell = first('market').toLowerCase()
      const market: 'local' | 'international' = country ? (country.code === 'PK' ? 'local' : 'international') : marketCell.startsWith('local') ? 'local' : 'international'

      // ---- notes: everything the CRM has no field for
      const lines: string[] = [`Imported from "${fileName}" › ${sh.name}`]
      if (contact.role) lines.push(`Role: ${contact.role}`)
      if (first('contact') && !isEmptyish(first('contact')) && first('contact') !== contact.name && first('contact').length > contact.name.length + 2 && !contact.role) lines.push(`Contact: ${clip(first('contact'), 200)}`)
      for (const x of extraNotes) lines.push(x)
      if (emails.length > 1) lines.push(`Other emails: ${emails.slice(1).join(', ')}`)
      if (scoreNum != null) lines.push(`Lead score: ${scoreNum}/${scoreScale}`)
      if (addrText) lines.push(`Address: ${clip(addrText, 200)}`)
      if (regionText) lines.push(`Region: ${regionText}`)
      if (stateText && !['US', 'CA'].includes(country?.code || '')) lines.push(`State: ${stateText}`)
      for (const c of colsOf('id')) { const v = cell(c); if (v && !isEmptyish(v)) lines.push(`${c.header}: ${v}`) }
      const free = colsOf('notes').map((c) => strKeepNewlines(r[c.index])).filter((v) => v && !isEmptyish(v))
      free.forEach((v) => lines.push(clip(v, 1500)))
      for (const c of cols) {
        if (c.field && !['notes'].includes(c.field)) { // spare columns of mapped fields (e.g. a second phone column)
          const list = colsOf(c.field)
          if (list.length > 1 && list[0] !== c && ['phone', 'email', 'website', 'whatsapp', 'contact'].includes(c.field)) { const v = cell(c); if (v && !isEmptyish(v)) lines.push(`${c.header}: ${clip(v, 300)}`) }
          continue
        }
        if (c.field) continue
        const v = cell(c)
        if (v && !isEmptyish(v)) lines.push(`${c.header}: ${clip(v, 1500)}`)
      }

      const tags = [] as string[]
      if (country) tags.push(country.code); else tags.push('Country unknown')
      tags.push(`Imported ${today}`)
      if (st.dnc) tags.push('Do not call')
      for (const t of first('tags').split(/[;,]/).map((x) => x.trim()).filter(Boolean)) tags.push(clip(t, 30))

      const lead: ParsedLead = {
        business_name: name, contact_person: contact.name, email: emails[0] || '', phone, whatsapp, website,
        country: country?.name || '', countryCode: country?.code || '', countryHow: how, city: clip(cityText && !isEmptyish(cityText) ? cityText : '', 80),
        industry: ind.industry, business_type: ind.type || (typeText && !isEmptyish(typeText) && typeText !== ind.industry ? clip(typeText, 120) : ''), source: first('source'),
        priority, deal_value: dealVal, currency, status: st.status, services, tags: [...new Set(tags)], notes: clip(lines.join('\n'), 6000),
        market, last_contact: parseDate(first('last_contact')), next_follow_up: parseDate(first('next_follow_up')), assigned_hint: first('assigned'), sheet: sh.name, rowNo: hr + 2 + i,
      }
      sheetLeads.push({ lead, signalled: how !== 'none' })
    })

    // ---- sheet-level fallback for leads with no country signal of their own
    const known = sheetLeads.filter((x) => x.signalled)
    if (sheetLeads.length && known.length / sheetLeads.length >= 0.5) {
      const tally = new Map<string, number>(); known.forEach((x) => tally.set(x.lead.countryCode, (tally.get(x.lead.countryCode) || 0) + 1))
      const [topCode, topN] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
      if (topN / known.length >= 0.7) {
        const c = COUNTRIES.find((k) => k.code === topCode)!
        sheetLeads.filter((x) => !x.signalled).forEach((x) => applyCountry(x.lead, c, 'sheet'))
      }
    }
    sheetLeads.filter((x) => x.lead.countryHow === 'none' && fileCountry).forEach((x) => applyCountry(x.lead, fileCountry!, 'file name'))

    // A tab that just repeats leads from an earlier tab of the same file (e.g. "All Leads" + one tab per industry) is ignored quietly.
    const mirrored = sheetLeads.filter((x) => fileIdx.why(x.lead)).length
    if (sheetLeads.length >= 3 && mirrored / sheetLeads.length >= 0.9) {
      rep.used = false; rep.reason = 'Same leads as another tab in this file, skipped'; continue
    }
    for (const { lead } of sheetLeads) {
      fileIdx.add(lead)
      const why = idx.why(lead)
      if (why) { plan.duplicates.push({ name: lead.business_name, why }); continue }
      idx.add(lead)
      plan.leads.push(lead); rep.leads++
      const key = lead.country || 'Country unknown'
      plan.byCountry[key] = (plan.byCountry[key] || 0) + 1
      if (!lead.countryCode) plan.unknownCountry++
    }
    if (!rep.leads) rep.reason = rep.reason || 'All leads on this sheet were duplicates'
    else rep.reason = `${rep.leads} lead${rep.leads === 1 ? '' : 's'}`
  }
  if (!plan.leads.length && !plan.sheets.some((s) => s.used)) plan.warnings.push('No lead sheet was recognised in this file. A lead sheet needs a business name column plus a phone, email or website column.')
  return plan
}

function applyCountry(l: ParsedLead, c: Country, how: string) {
  l.country = c.name; l.countryCode = c.code; l.countryHow = how
  l.tags = l.tags.filter((t) => t !== 'Country unknown'); if (!l.tags.includes(c.code)) l.tags.unshift(c.code)
  l.market = c.code === 'PK' ? 'local' : 'international'
  if (l.currency === 'USD' && c.cur !== 'USD') l.currency = c.cur
  const p = (v: string) => (v && !v.startsWith('+') ? formatPhone(v, c).value : v)
  l.phone = p(l.phone); l.whatsapp = p(l.whatsapp)
}

/** Convert to the shape stored in the `leads` table. */
export function leadToRow(l: ParsedLead, assignedTo?: string) {
  return {
    market: l.market, business_name: l.business_name, contact_person: l.contact_person, email: l.email, phone: l.phone, whatsapp: l.whatsapp, website: l.website,
    country: l.country, city: l.city, industry: l.industry, business_type: l.business_type, source: l.source, assigned_to: assignedTo || null, priority: l.priority,
    deal_value: l.deal_value, currency: l.currency, services: l.services, tags: l.tags, notes: l.notes, status: l.status, next_follow_up: l.next_follow_up, last_contact: l.last_contact,
    dedupe_key: l.business_name.toLowerCase().trim(),
  }
}
