import { defineRouteConfig } from '@medusajs/admin-sdk'
import { sdk } from '../../../lib/sdk'
import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import type * as React from 'react'

type BoxForm = {
  id: string
  name: string
  inner_cm: { length: number; width: number; height: number }
  max_weight_kg?: number
}

const initialState = {
  is_enabled: true,
  user_id: '',
  api_key: '',
  account_id: '',
  enable_logs: false,
  boxes: [] as BoxForm[],
}

const queryClient = new QueryClient()

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ')

const labelClass = 'text-sm font-medium text-ui-fg-base'
const hintClass = 'text-xs text-ui-fg-subtle'
const inputClass =
  'mt-1 w-full rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ui-border-interactive'
const cardClass = 'rounded-lg border border-ui-border-base bg-ui-bg-base'

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
      const rawBoxes = (data as { boxes?: unknown }).boxes
      setForm((prev) => ({
        ...prev,
        ...data,
        boxes: Array.isArray(rawBoxes) ? (rawBoxes as BoxForm[]) : [],
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

  const updateBox = (
    index: number,
    patch: Partial<(typeof initialState)['boxes'][number]>,
  ): void => {
    setForm((prev) => ({
      ...prev,
      boxes: prev.boxes.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    }))
  }

  const removeBox = (index: number): void => {
    setForm((prev) => ({
      ...prev,
      boxes: prev.boxes.filter((_, i) => i !== index),
    }))
  }

  const addBox = (): void => {
    const id = `box_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    setForm((prev) => ({
      ...prev,
      boxes: [
        ...prev.boxes,
        {
          id,
          name: '',
          inner_cm: { length: 0, width: 0, height: 0 },
        },
      ],
    }))
  }

  if (isLoading) {
    return (
      <div className={cx(cardClass, 'divide-y p-0')}>
        <div className="px-6 py-4">Loading...</div>
      </div>
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
    <div className={cx(cardClass, 'divide-y p-0')}>
      {alert && (
        <div className="px-6 py-2">
          <div
            className={cx(
              'rounded-md px-4 py-3 text-sm',
              alert.type === 'success'
                ? 'bg-emerald-50 text-emerald-900'
                : 'bg-rose-50 text-rose-900',
            )}
          >
            <div className="alert">{alert.message}</div>
          </div>
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
        <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">
          eCommerce
        </span>
      </div>
      <div className="flex items-center justify-between px-6 py-4 bg-amber-50">
        <p className="text-ui-fg-subtle text-sm">
          Configure your DHL eCommerce API credentials. Get your credentials from the{' '}
          <a
            href="https://my.dhlecommerce.nl/business/settings/api-keys/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-700 hover:underline font-semibold"
          >
            DHL Ecommerce portal
          </a>
          .
        </p>
      </div>
      <form className="flex flex-col gap-y-6 px-6 py-4">
        <div>
          <div className="flex items-center justify-between">
            <label className={labelClass} htmlFor="is_enabled">
              Enabled
            </label>
            <input
              id="is_enabled"
              name="is_enabled"
              type="checkbox"
              checked={form.is_enabled}
              onChange={(e) => setForm((prev) => ({ ...prev, is_enabled: e.target.checked }))}
              className="h-4 w-4"
            />
          </div>
          <p className={cx(hintClass, 'mb-2 mt-1')}>
            Enable or disable the DHL eCommerce integration.
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="user_id">
            User ID
          </label>
          <p className={cx(hintClass, 'mt-1 block pb-1')}>
            Your DHL API User ID for authentication.
          </p>
          <input
            id="user_id"
            name="user_id"
            className={inputClass}
            autoComplete="off"
            value={form.user_id}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="api_key">
            API Key
          </label>
          <p className={cx(hintClass, 'mt-1 block pb-1')}>Your DHL API Key for authentication.</p>
          <input
            id="api_key"
            name="api_key"
            type="password"
            className={inputClass}
            autoComplete="off"
            value={form.api_key}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="account_id">
            Account ID
          </label>
          <p className={cx(hintClass, 'mt-1 block pb-1')}>
            Your DHL Account ID used for creating shipments and labels.
          </p>
          <input
            id="account_id"
            name="account_id"
            className={inputClass}
            autoComplete="off"
            value={form.account_id}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className={labelClass} htmlFor="enable_logs">
              Enable Logs
            </label>
            <input
              id="enable_logs"
              name="enable_logs"
              type="checkbox"
              checked={form.enable_logs}
              onChange={(e) => setForm((prev) => ({ ...prev, enable_logs: e.target.checked }))}
              className="h-4 w-4"
            />
          </div>
          <p className={cx(hintClass, 'mb-2 mt-1')}>
            Enable logging for debugging DHL API requests and responses.
          </p>
        </div>

        <div className="pt-2">
          <div className="flex items-center justify-between">
            <span className={labelClass}>Boxes</span>
            <button
              type="button"
              onClick={addBox}
              className="rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm"
            >
              Add box
            </button>
          </div>
          <p className={cx(hintClass, 'mb-2 mt-1')}>
            Define your packaging. The fulfillment flow will choose the smallest fitting box for
            packing/visibility. DHL parcel type is derived from DHL capabilities + weight (not
            configured manually).
          </p>

          <div className="flex flex-col gap-y-4">
            {form.boxes.length === 0 ? (
              <p className={cx(hintClass, 'text-sm')}>No boxes configured yet.</p>
            ) : (
              form.boxes.map((box, idx) => (
                <div key={box.id} className="rounded-md border border-ui-border-base p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Box {idx + 1}</p>
                    <button
                      type="button"
                      onClick={() => removeBox(idx)}
                      className="rounded-md bg-rose-600 px-3 py-2 text-sm text-white"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <span className={labelClass}>Id</span>
                      <input className={inputClass} value={box.id} disabled />
                    </div>
                    <div>
                      <span className={labelClass}>Name</span>
                      <input
                        className={inputClass}
                        value={box.name}
                        onChange={(e) => updateBox(idx, { name: e.target.value })}
                      />
                    </div>
                    <div>
                      <span className={labelClass}>Max weight (kg) (optional)</span>
                      <input
                        className={inputClass}
                        value={box.max_weight_kg ?? ''}
                        onChange={(e) =>
                          updateBox(idx, {
                            max_weight_kg: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <span className={labelClass}>Inner dimensions (cm)</span>
                    <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-3">
                      <input
                        placeholder="Length"
                        value={box.inner_cm.length || ''}
                        className={inputClass}
                        onChange={(e) =>
                          updateBox(idx, {
                            inner_cm: { ...box.inner_cm, length: Number(e.target.value) },
                          })
                        }
                      />
                      <input
                        placeholder="Width"
                        value={box.inner_cm.width || ''}
                        className={inputClass}
                        onChange={(e) =>
                          updateBox(idx, {
                            inner_cm: { ...box.inner_cm, width: Number(e.target.value) },
                          })
                        }
                      />
                      <input
                        placeholder="Height"
                        value={box.inner_cm.height || ''}
                        className={inputClass}
                        onChange={(e) =>
                          updateBox(idx, {
                            inner_cm: { ...box.inner_cm, height: Number(e.target.value) },
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={!isValid}
          className={cx(
            'mt-4 w-fit rounded-md px-4 py-2 text-sm font-medium',
            isValid
              ? 'bg-ui-button-inverted text-ui-fg-on-inverted'
              : 'bg-ui-bg-subtle text-ui-fg-muted',
          )}
        >
          Save
        </button>
      </form>
    </div>
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
