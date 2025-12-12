import { Container, Hint, Input, Label, Switch, Button, Alert, Badge, Text } from '@medusajs/ui'
import { defineRouteConfig } from '@medusajs/admin-sdk'
import { sdk } from '../../../lib/sdk'
import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'

const initialState = {
  is_enabled: true,
  user_id: '',
  api_key: '',
  account_id: '',
  enable_logs: false,
}

const queryClient = new QueryClient()

const DHLSettingsPageInner = () => {
  // Fetch config from the backend
  const { data, isLoading } = useQuery({
    queryFn: () => sdk.client.fetch('/admin/dhl'),
    queryKey: ['dhl-config'],
  })

  // Merge fetched data with initial state
  const [form, setForm] = useState(initialState)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    if (data) {
      setForm((prev) => ({
        ...prev,
        ...data,
      }))
    }
  }, [data])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const isValid = form.user_id.trim() && form.api_key.trim() && form.account_id.trim()

  if (isLoading) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">Loading...</div>
      </Container>
    )
  }

  async function handleSave(event: React.MouseEvent<HTMLButtonElement, MouseEvent>): Promise<void> {
    event.preventDefault()
    try {
      await sdk.client.fetch('/admin/dhl', {
        method: 'POST',
        body: form,
        headers: {
          'Content-Type': 'application/json',
        },
      })
      setAlert({ type: 'success', message: 'DHL settings saved successfully.' })
      document.querySelector('.alert')?.scrollIntoView({ behavior: 'smooth' })
    } catch (error) {
      setAlert({ type: 'error', message: 'Failed to save DHL settings.' })
      document.querySelector('.alert')?.scrollIntoView({ behavior: 'smooth' })
      console.error(error)
    }
  }

  return (
    <Container className="divide-y p-0">
      {alert && (
        <div className="px-6 py-2">
          <Alert variant={alert.type === 'success' ? 'success' : 'error'} dismissible={true}>
            {alert.message}
          </Alert>
        </div>
      )}
      <div className="flex items-center justify-between px-6 py-4">
        {/* DHL Logo */}
        <svg height="60" viewBox="0 0 200 40" xmlns="http://www.w3.org/2000/svg">
          <rect width="200" height="40" fill="#FFCC00" rx="4" />
          <text
            x="100"
            y="28"
            textAnchor="middle"
            fontFamily="Arial Black, sans-serif"
            fontSize="24"
            fontWeight="bold"
            fill="#D40511"
          >
            DHL
          </text>
        </svg>
        <Badge color="orange" size="small">
          eCommerce
        </Badge>
      </div>
      <div className="flex items-center justify-between px-6 py-4 bg-amber-50">
        <Text className="text-ui-fg-subtle">
          Configure your DHL eCommerce API credentials. Get your credentials from the{' '}
          <a
            href="https://api-gw.dhlparcel.nl/docs/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-700 hover:underline font-semibold"
          >
            DHL Developer Portal
          </a>
          .
        </Text>
      </div>
      <form className="flex flex-col gap-y-6 px-6 py-4">
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="is_enabled">Enabled</Label>
            <Switch
              id="is_enabled"
              name="is_enabled"
              checked={form.is_enabled}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, is_enabled: checked }))}
            />
          </div>
          <Hint className="mb-2 mt-1">Enable or disable the DHL eCommerce integration.</Hint>
        </div>

        <div>
          <Label htmlFor="user_id">User ID</Label>
          <Hint className="mt-1 block pb-1">Your DHL API User ID for authentication.</Hint>
          <Input
            id="user_id"
            name="user_id"
            className="mt-1"
            autoComplete="off"
            value={form.user_id}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <Label htmlFor="api_key">API Key</Label>
          <Hint className="mt-1 block pb-1">Your DHL API Key for authentication.</Hint>
          <Input
            id="api_key"
            name="api_key"
            type="password"
            className="mt-1"
            autoComplete="off"
            value={form.api_key}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <Label htmlFor="account_id">Account ID</Label>
          <Hint className="mt-1 block pb-1">
            Your DHL Account ID used for creating shipments and labels.
          </Hint>
          <Input
            id="account_id"
            name="account_id"
            className="mt-1"
            autoComplete="off"
            value={form.account_id}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="enable_logs">Enable Logs</Label>
            <Switch
              id="enable_logs"
              name="enable_logs"
              checked={form.enable_logs}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enable_logs: checked }))}
            />
          </div>
          <Hint className="mb-2 mt-1">
            Enable logging for debugging DHL API requests and responses.
          </Hint>
        </div>

        <Button type="button" onClick={handleSave} disabled={!isValid} className="mt-4 w-fit">
          Save
        </Button>
      </form>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: 'DHL eCommerce',
})

const DHLSettingsPage = () => (
  <QueryClientProvider client={queryClient}>
    <DHLSettingsPageInner />
  </QueryClientProvider>
)

export default DHLSettingsPage
