import { Container, Heading, Button, Toaster, clx } from '@medusajs/ui'
import { defineRouteConfig } from '@medusajs/admin-sdk'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { PricingTable } from './_components/pricing-table'
import { ExtraServicesTable } from './_components/extra-services-table'
import { ImportDialog } from './_components/import-dialog'

const queryClient = new QueryClient()

type Tab = 'base' | 'extra' | 'services'

const TABS: { key: Tab; label: string }[] = [
  { key: 'base', label: 'Base Rates' },
  { key: 'extra', label: 'Extra Rates' },
  { key: 'services', label: 'Extra Services' },
]

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clx(
        'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
        active
          ? 'border-ui-fg-base text-ui-fg-base'
          : 'border-transparent text-ui-fg-muted hover:text-ui-fg-subtle',
      )}
    >
      {children}
    </button>
  )
}

const DHLPricingPageInner = () => {
  const [activeTab, setActiveTab] = useState<Tab>('base')
  const [importOpen, setImportOpen] = useState(false)

  const handleImported = () => {
    queryClient.invalidateQueries()
    setImportOpen(false)
  }

  return (
    <>
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <Heading level="h1">DHL Manual Pricing</Heading>
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            Import DHL PDF
          </Button>
        </div>

        <div className="flex border-b px-6">
          {TABS.map((tab) => (
            <TabButton
              key={tab.key}
              active={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </TabButton>
          ))}
        </div>

        <div className="px-6 py-4">
          {activeTab === 'base' && (
            <PricingTable
              endpoint="/admin/dhl/pricing/base"
              queryKey="dhl-pricing-base"
              title="Base Rates"
            />
          )}
          {activeTab === 'extra' && (
            <PricingTable
              endpoint="/admin/dhl/pricing/extra"
              queryKey="dhl-pricing-extra"
              title="Extra Rates"
            />
          )}
          {activeTab === 'services' && <ExtraServicesTable />}
        </div>
      </Container>

      {importOpen && (
        <ImportDialog onClose={() => setImportOpen(false)} onImported={handleImported} />
      )}
      <Toaster />
    </>
  )
}

export const config = defineRouteConfig({
  label: 'DHL Pricing',
})

const DHLPricingPage = () => (
  <QueryClientProvider client={queryClient}>
    <DHLPricingPageInner />
  </QueryClientProvider>
)

export default DHLPricingPage
