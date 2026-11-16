export const CURRENCIES = ['PKR', 'USD', 'GBP', 'AED', 'SAR', 'CAD', 'ZAR'] as const
export const BASE_DEFAULT = 'PKR'

export const LEAD_STATUSES = [
  'New Lead', 'Not Contacted', 'Ready to Contact', 'Called', 'Email Sent', 'WhatsApp Sent', 'DM Sent', 'Contacted',
  'No Response', 'Interested', 'Follow-up Required', 'Meeting Scheduled', 'Negotiation', 'Proposal Sent',
  'Won / Converted', 'Lost', 'Not Interested',
]
export const WON = 'Won / Converted'
export const LOST_STATUSES = ['Lost', 'Not Interested']
export const CONTACTED_STATUSES = ['Called', 'Email Sent', 'WhatsApp Sent', 'DM Sent', 'Contacted', 'No Response', 'Interested', 'Follow-up Required', 'Meeting Scheduled', 'Negotiation', 'Proposal Sent', WON]

export const ACTIVITY_TYPES = [
  'Called', 'Call Answered', 'Call Not Answered', 'Email Sent', 'Email Replied', 'WhatsApp Message Sent',
  'WhatsApp Replied', 'Instagram DM Sent', 'Meeting Completed', 'Proposal Sent', 'Price Discussed', 'Follow-up Completed',
]
export const LEAD_SOURCES = ['Cold Email', 'Cold Calling', 'WhatsApp', 'Instagram DMs', 'LinkedIn', 'Freelancing Platforms', 'Referrals', 'Organic Marketing']
export const INDUSTRIES_INTL = ['Construction Companies', 'Real Estate Businesses', 'Property Management', 'Dental Clinics', 'E-commerce Brands', 'Car Dealerships', 'Paint Protection Film Businesses']
export const INDUSTRIES_LOCAL = ['Real Estate', 'Solar Companies', 'Event Management', 'E-commerce', 'Clinics', 'Mobile and Laptop Shops', 'Glass Companies', 'Construction', 'Education and Teachers']
export const COUNTRIES = ['Pakistan', 'United States', 'United Kingdom', 'United Arab Emirates', 'Saudi Arabia', 'Canada', 'South Africa', 'Other']
export const SERVICES = ['Website Development', 'Web Applications', 'AI Automation', 'AI Chatbots', 'SaaS Development', 'Mobile Applications', 'UI/UX Design', 'Business Intelligence', 'Data Analytics']
export const PRIORITIES = ['low', 'medium', 'high']

export const CLIENT_CATEGORIES = ['New', 'Onboarding', 'Active', 'Ongoing Projects', 'Completed Projects', 'Retained', 'Inactive']
export const PAYMENT_STATUSES = ['Pending', 'Partially Paid', 'Paid', 'Overdue']
export const ONBOARDING_STEPS = ['Contract / agreement signed', 'Advance payment received', 'Requirements collected', 'Access & assets received', 'Kick-off call done', 'Project created']

export const PROJECT_STATUSES = ['Not Started', 'Planning', 'In Progress', 'Waiting for Client', 'Revision', 'Testing', 'Completed', 'On Hold', 'Cancelled']
export const TASK_CATEGORIES = ['Sales', 'Lead Research', 'Cold Calling', 'Follow-ups', 'Client Work', 'Development', 'Finance', 'Marketing', 'Administration', 'Business Planning', 'Other']
export const TASK_STATUSES = ['To Do', 'In Progress', 'Waiting', 'Completed', 'Cancelled']

export const EXPENSE_CATEGORIES = ['Software Subscriptions', 'Hosting and Domains', 'Marketing', 'Advertising', 'Development Tools', 'Client Project Expenses', 'Internet and Communication', 'Equipment', 'Business Registration', 'Education and Training', 'Other']
export const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Card', 'PayPal', 'Wise', 'Payoneer', 'JazzCash / Easypaisa', 'Crypto (received as fiat)', 'Other']
export const INVESTORS = ['Feroze', 'Raaef', 'Other Sources']

export const SUB_CATEGORIES = ['AI Tools', 'Hosting', 'Domains', 'Development Tools', 'Communication', 'Marketing', 'Productivity', 'Design Software', 'Other']
export const BILLING_CYCLES = ['Monthly', 'Quarterly', 'Yearly', 'One-time']
export const SUB_STATUSES = ['Active', 'Expiring Soon', 'Expired', 'Cancelled', 'Paused']

export const INVOICE_STATUSES = ['Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled']
export const DOC_CATEGORIES = ['Client Requirements', 'Contracts', 'Proposals', 'Invoices', 'Payment Receipts', 'Business Documents', 'Screenshots', 'Project Assets', 'Other']
export const NOTE_KINDS = ['note', 'decision', 'idea', 'announcement']

export const DEFAULT_TERMS: { title: string; body: string }[] = [
  { title: 'Payment Terms', body: 'Invoices are payable within the number of days stated on the invoice from the invoice date, by the payment method listed under Payment Instructions. All amounts are in the invoice currency.' },
  { title: 'Advance Payment Policy', body: 'Work begins after the agreed advance payment is received. The advance is applied against the total project amount and is non-transferable between projects.' },
  { title: 'Project Scope', body: 'The scope of work is limited to the services and deliverables itemised on this invoice and in any written proposal accepted by the client. Anything outside that scope is treated as additional work.' },
  { title: 'Revision Policy', body: 'The agreed number of revision rounds is included in the project price. Further revisions or changes in direction after approval may be billed at FRX Technologies’ standard rates.' },
  { title: 'Delivery Timeline', body: 'Delivery dates are estimates that depend on timely client feedback, content and access. Delays caused by late client input extend the timeline accordingly.' },
  { title: 'Client Responsibilities', body: 'The client agrees to provide required content, assets, credentials and approvals promptly, and to nominate one point of contact for decisions.' },
  { title: 'Additional Work', body: 'Requests beyond the agreed scope will be quoted separately and begin only after written approval from the client.' },
  { title: 'Cancellation and Refund Policy', body: 'If the client cancels, work completed up to the cancellation date remains payable. Advance payments are refundable only for work that has not started, unless otherwise agreed in writing.' },
  { title: 'Intellectual Property', body: 'Upon receipt of full payment, ownership of the final deliverables transfers to the client. FRX Technologies retains rights to its pre-existing tools, libraries and general know-how, and may reference the work in its portfolio unless the client objects in writing.' },
  { title: 'Late Payments', body: 'Invoices unpaid after the due date may pause ongoing work and delay delivery or handover until the balance is cleared. A late fee may apply if agreed in writing beforehand.' },
  { title: 'Project Approval', body: 'Deliverables are considered approved when the client confirms in writing, or when no feedback is received within the review period stated in the proposal.' },
  { title: 'General Agreement', body: 'Payment of this invoice constitutes acceptance of these terms. This is an editable business template, not jurisdiction-specific legal advice; have it reviewed by a qualified professional for your jurisdiction.' },
]

export const DEFAULT_COMPANY = {
  name: 'FRX Technologies', website: 'frxtechnologies.com', email: 'frx.technologies@gmail.com',
  phone: '+92 324 3439988', ceo: 'Feroze Mohiuddin', director: 'Raaef Usman',
}
export const DEFAULT_INVOICE_SETTINGS = {
  prefix: 'FRX-', next_number: 1001, digits: 4, year_in_number: true, payment_terms_days: 7, tax_rate: 0,
  payment_instructions: 'Please add your bank / payment account details in Settings → Invoice Settings.',
  footer: 'Thank you for your business.',
  terms: DEFAULT_TERMS,
}
/** Starting reference rates are NOT market data: they are placeholders the partners must update in Settings. */
export const DEFAULT_RATES: Record<string, number> = { PKR: 1, USD: 280, GBP: 355, AED: 76, SAR: 74.5, CAD: 205, ZAR: 15.5 }

export const MARKET_OF_COUNTRY = (c?: string) => (c === 'Pakistan' ? 'local' : 'international')
