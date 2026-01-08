import { Container, Hint, Select, Input, Label, Switch, Button, Alert } from '@medusajs/ui'
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
  item_dimensions_unit: 'mm' as 'mm' | 'cm',
  item_weight_unit: 'g' as 'g' | 'kg',
  webhook_api_key: '' as string | null,
  webhook_api_key_header: 'Authorization',
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
      // Optionally, show a success message or refetch config
      setAlert({ type: 'success', message: 'DHL settings saved successfully.' })

      // Focus on the alert component
      document.querySelector('.alert')?.scrollIntoView({ behavior: 'smooth' })
    } catch (error) {
      // Optionally, show an error message
      setAlert({ type: 'error', message: 'Failed to save DHL settings.' })
      // Focus on the alert component
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
        <svg
          height="72"
          width="120"
          viewBox="0 0 240 144"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="DHL eCommerce"
        >
          <rect width="240" height="144" rx="16" fill="#FFCC00" />
          <text
            x="120"
            y="86"
            textAnchor="middle"
            fontSize="72"
            fontWeight="800"
            fontFamily="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
            fill="#D40511"
          >
            DHL
          </text>
          <text
            x="120"
            y="122"
            textAnchor="middle"
            fontSize="28"
            fontWeight="700"
            fontFamily="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
            fill="#D40511"
          >
            eCommerce
          </text>
        </svg>
      </div>
      <div className="flex items-center justify-between px-6 py-4">
        <p className="block">
          You can also configure the DHL credentials on the medusa-config.ts file as described on{' '}
          <a
            href="https://github.com/mitchellston/medusa-dhl-ecommerce-fulfillment/blob/main/README.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline font-bold"
          >
            the documentation.
          </a>{' '}
          If the credentials are set up here they will be used over the medusa-config.ts file.
        </p>
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
          <Hint className="mb-2 mt-1">Enable or disable the DHL integration.</Hint>
        </div>

        <div>
          <Label htmlFor="user_id">User ID</Label>
          <Hint className="mt-1 block pb-1">Your DHL User ID for authentication.</Hint>
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
          <Hint className="mt-1 block pb-1">Your DHL account ID used for shipments.</Hint>
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
            Enable logging for debugging DHL requests and responses.
          </Hint>
        </div>
        <div>
          <Label htmlFor="item_dimensions_unit">Item Dimensions Unit</Label>
          <Hint className="mt-1 block pb-1">
            The unit of measurement for product dimensions in Medusa. DHL expects centimeters.
          </Hint>
          <Select
            value={form.item_dimensions_unit}
            onValueChange={(value) =>
              setForm((prev) => ({ ...prev, item_dimensions_unit: value as 'mm' | 'cm' }))
            }
          >
            <Select.Trigger>
              <Select.Value placeholder="Select unit" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="mm">Millimeters (mm)</Select.Item>
              <Select.Item value="cm">Centimeters (cm)</Select.Item>
            </Select.Content>
          </Select>
        </div>
        <div>
          <Label htmlFor="item_weight_unit">Item Weight Unit</Label>
          <Hint className="mt-1 block pb-1">
            The unit of measurement for product weight in Medusa. DHL expects grams.
          </Hint>
          <Select
            value={form.item_weight_unit}
            onValueChange={(value) =>
              setForm((prev) => ({ ...prev, item_weight_unit: value as 'g' | 'kg' }))
            }
          >
            <Select.Trigger>
              <Select.Value placeholder="Select unit" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="g">Grams (g)</Select.Item>
              <Select.Item value="kg">Kilograms (kg)</Select.Item>
            </Select.Content>
          </Select>
        </div>

        <div className="border-t pt-6 mt-2">
          <h3 className="font-semibold mb-4">Webhook Settings (Track &amp; Trace Pusher)</h3>
          <p className="text-sm text-gray-600 mb-4">
            Configure these settings to receive real-time shipment status updates from DHL via
            webhooks. The API key will be used to authenticate incoming webhook requests.
          </p>
        </div>

        <div>
          <Label htmlFor="webhook_api_key">Webhook API Key</Label>
          <Hint className="mt-1 block pb-1">
            The API key provided by DHL for authenticating webhook requests. This should be at least
            50 characters long.
          </Hint>
          <Input
            id="webhook_api_key"
            name="webhook_api_key"
            type="password"
            className="mt-1"
            autoComplete="off"
            value={form.webhook_api_key ?? ''}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                webhook_api_key: e.target.value || null,
              }))
            }
          />
        </div>
        <div>
          <Label htmlFor="webhook_api_key_header">Webhook API Key Header</Label>
          <Hint className="mt-1 block pb-1">
            The HTTP header name that DHL uses to send the API key. Default is
            &quot;Authorization&quot;.
          </Hint>
          <Input
            id="webhook_api_key_header"
            name="webhook_api_key_header"
            className="mt-1"
            autoComplete="off"
            value={form.webhook_api_key_header}
            onChange={handleChange}
          />
        </div>
        <Button type="button" onClick={handleSave} disabled={!isValid} className="mt-4 w-fit">
          Save
        </Button>
      </form>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: 'DHL',
})

const DHLSettingsPage = () => (
  <QueryClientProvider client={queryClient}>
    <DHLSettingsPageInner />
  </QueryClientProvider>
)

export default DHLSettingsPage
