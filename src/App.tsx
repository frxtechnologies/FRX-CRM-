import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AuthProvider, useAuth } from './lib/auth'
import { IS_DEMO } from './lib/db'
import { runAutomations } from './lib/services'
import { ToastProvider } from './components/ui'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Home from './pages/Home'
import Leads from './pages/Leads'
import LeadDetail from './pages/LeadDetail'
import FollowUps from './pages/FollowUps'
import Clients from './pages/Clients'
import ClientDetail from './pages/ClientDetail'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Tasks from './pages/Tasks'
import { Income, Expenses, Investments, ProfitLoss } from './pages/Finance'
import Invoices from './pages/Invoices'
import InvoiceEditor from './pages/InvoiceEditor'
import InvoiceDetail from './pages/InvoiceDetail'
import Subscriptions from './pages/Subscriptions'
import Analytics from './pages/Analytics'
import Documents from './pages/Documents'
import ActivityLog from './pages/ActivityLog'
import Reports from './pages/Reports'
import SettingsPage from './pages/Settings'
import Vault from './pages/Vault'
import Personal from './pages/Personal'

function Gate() {
  const { user, loading, signOut } = useAuth()
  // Shared or unattended computer: sign out automatically after 30 minutes with no activity (live mode).
  useEffect(() => {
    if (!user || IS_DEMO) return
    const MAX = 30 * 60 * 1000
    let t = setTimeout(() => { signOut() }, MAX)
    const reset = () => { clearTimeout(t); t = setTimeout(() => { signOut() }, MAX) }
    const ev = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    ev.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    return () => { clearTimeout(t); ev.forEach((e) => window.removeEventListener(e, reset)) }
  }, [user?.id])
  useEffect(() => {
    if (!user) return
    runAutomations().catch(() => {})
    const t = setInterval(() => runAutomations().catch(() => {}), 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [user?.id])
  if (loading) return <div className="flex h-full items-center justify-center text-[#2563EB]"><Loader2 className="animate-spin" /></div>
  if (!user) return <Login />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="overview" element={<Dashboard />} />
        <Route path="leads" element={<Leads />} />
        <Route path="leads/local" element={<Leads market="local" />} />
        <Route path="leads/international" element={<Leads market="international" />} />
        <Route path="leads/follow-ups" element={<FollowUps />} />
        <Route path="leads/:id" element={<LeadDetail />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:id" element={<ClientDetail />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="finance" element={<Navigate to="/finance/pnl" replace />} />
        <Route path="finance/income" element={<Income />} />
        <Route path="finance/expenses" element={<Expenses />} />
        <Route path="finance/investments" element={<Investments />} />
        <Route path="finance/pnl" element={<ProfitLoss />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="invoices/new" element={<InvoiceEditor />} />
        <Route path="invoices/:id/edit" element={<InvoiceEditor />} />
        <Route path="invoices/:id" element={<InvoiceDetail />} />
        <Route path="vault" element={<Vault />} />
        <Route path="personal" element={<Personal />} />
        <Route path="subscriptions" element={<Subscriptions />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="documents" element={<Documents />} />
        <Route path="reports" element={<Reports />} />
        <Route path="activity" element={<ActivityLog />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
