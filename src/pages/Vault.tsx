import { PageHeader } from '../components/ui'
import VaultPanel from '../components/VaultPanel'

export default function Vault() {
  return (
    <>
      <PageHeader title="Vault" sub="Logins, passwords and recovery codes for clients, FRX and your personal accounts. Locked with a shared passphrase." />
      <VaultPanel />
    </>
  )
}
