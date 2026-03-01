import { Button, Drawer, Input, Label, Select, Switch, Hint, toast } from '@medusajs/ui'
import { useState, useEffect } from 'react'
import { sdk } from '../../../../lib/sdk'
import type { PricingRecord, TarrifType } from '../types'

interface PricingFormModalProps {
  open: boolean
  record: PricingRecord | null
  onClose: () => void
  onSaved: () => void
  endpoint: string
}

interface FormState {
  forConsument: boolean
  tarrifType: TarrifType
  tariffValue: string
  provider: string
  fromCountry: string
  toCountry: string
  price: string
  validFrom: string
  validTo: string
  rateSheetCode: string
}

const EMPTY_FORM: FormState = {
  forConsument: false,
  tarrifType: 'weight',
  tariffValue: '',
  provider: '',
  fromCountry: '',
  toCountry: '',
  price: '',
  validFrom: new Date().toISOString().slice(0, 16),
  validTo: '',
  rateSheetCode: '',
}

function toFormState(record: PricingRecord): FormState {
  return {
    forConsument: record.forConsument,
    tarrifType: record.tarrifType,
    tariffValue: record.tariffValue,
    provider: record.provider,
    fromCountry: record.fromCountry,
    toCountry: record.toCountry,
    price: String(record.price),
    validFrom: record.validFrom ? record.validFrom.slice(0, 16) : '',
    validTo: record.validTo ? record.validTo.slice(0, 16) : '',
    rateSheetCode: record.rateSheetCode ?? '',
  }
}

export function PricingFormModal({
  open,
  record,
  onClose,
  onSaved,
  endpoint,
}: PricingFormModalProps) {
  const isEdit = !!record
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      setForm(record ? toFormState(record) : EMPTY_FORM)
      setErrors({})
    }
  }, [open, record])

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!form.tariffValue.trim()) newErrors.tariffValue = 'Required'
    if (!form.provider.trim()) newErrors.provider = 'Required'
    if (!form.fromCountry.trim()) newErrors.fromCountry = 'Required'
    if (!form.toCountry.trim()) newErrors.toCountry = 'Required'
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) < 0)
      newErrors.price = 'Must be a number >= 0'
    if (!form.validFrom) newErrors.validFrom = 'Required'
    if (form.validTo && form.validFrom && new Date(form.validTo) < new Date(form.validFrom))
      newErrors.validTo = 'Must be >= Valid From'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const body = {
        forConsument: form.forConsument,
        tarrifType: form.tarrifType,
        tariffValue: form.tariffValue.trim(),
        provider: form.provider.trim(),
        fromCountry: form.fromCountry.trim(),
        toCountry: form.toCountry.trim(),
        price: Number(form.price),
        validFrom: new Date(form.validFrom).toISOString(),
        validTo: form.validTo ? new Date(form.validTo).toISOString() : null,
        rateSheetCode: form.rateSheetCode.trim() || null,
      }

      if (isEdit && record) {
        await sdk.client.fetch(`${endpoint}/${record.id}`, {
          method: 'POST',
          body,
        })
        toast.success('Rate updated')
      } else {
        await sdk.client.fetch(endpoint, {
          method: 'POST',
          body,
        })
        toast.success('Rate created')
      }
      onSaved()
    } catch {
      toast.error(isEdit ? 'Failed to update rate' : 'Failed to create rate')
    } finally {
      setSaving(false)
    }
  }

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key])
      setErrors((e) => {
        const next = { ...e }
        delete next[key]
        return next
      })
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>{isEdit ? 'Edit Rate' : 'New Rate'}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-4 p-4 overflow-y-auto">
          <div className="flex items-center justify-between">
            <Label htmlFor="forConsument">Consumer (B2C)</Label>
            <Switch
              id="forConsument"
              checked={form.forConsument}
              onCheckedChange={(v) => updateField('forConsument', v)}
            />
          </div>

          <div>
            <Label htmlFor="tarrifType">Tariff Type</Label>
            <Select
              value={form.tarrifType}
              onValueChange={(v) => updateField('tarrifType', v as TarrifType)}
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="packet_type">Packet Type</Select.Item>
                <Select.Item value="weight">Weight (kg)</Select.Item>
                <Select.Item value="pallet">Pallet</Select.Item>
              </Select.Content>
            </Select>
          </div>

          <div>
            <Label htmlFor="tariffValue">Tariff Value</Label>
            <Hint className="text-xs mt-0.5 mb-1">
              Weight (e.g. 50, 100), size (e.g. S, M, L), or pallet count
            </Hint>
            <Input
              id="tariffValue"
              value={form.tariffValue}
              onChange={(e) => updateField('tariffValue', e.target.value)}
            />
            {errors.tariffValue && <Hint variant="error">{errors.tariffValue}</Hint>}
          </div>

          <div>
            <Label htmlFor="provider">Provider</Label>
            <Input
              id="provider"
              placeholder="e.g. DHL Europlus Pakketten"
              value={form.provider}
              onChange={(e) => updateField('provider', e.target.value)}
            />
            {errors.provider && <Hint variant="error">{errors.provider}</Hint>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="fromCountry">From Country</Label>
              <Input
                id="fromCountry"
                placeholder="Nederland"
                value={form.fromCountry}
                onChange={(e) => updateField('fromCountry', e.target.value)}
              />
              {errors.fromCountry && <Hint variant="error">{errors.fromCountry}</Hint>}
            </div>
            <div>
              <Label htmlFor="toCountry">To Country</Label>
              <Input
                id="toCountry"
                placeholder="België"
                value={form.toCountry}
                onChange={(e) => updateField('toCountry', e.target.value)}
              />
              {errors.toCountry && <Hint variant="error">{errors.toCountry}</Hint>}
            </div>
          </div>

          <div>
            <Label htmlFor="price">Price (excl. VAT)</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0"
              value={form.price}
              onChange={(e) => updateField('price', e.target.value)}
            />
            {errors.price && <Hint variant="error">{errors.price}</Hint>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="validFrom">Valid From</Label>
              <Input
                id="validFrom"
                type="datetime-local"
                value={form.validFrom}
                onChange={(e) => updateField('validFrom', e.target.value)}
              />
              {errors.validFrom && <Hint variant="error">{errors.validFrom}</Hint>}
            </div>
            <div>
              <Label htmlFor="validTo">Valid To</Label>
              <Input
                id="validTo"
                type="datetime-local"
                value={form.validTo}
                onChange={(e) => updateField('validTo', e.target.value)}
              />
              {errors.validTo && <Hint variant="error">{errors.validTo}</Hint>}
            </div>
          </div>

          <div>
            <Label htmlFor="rateSheetCode">Rate Sheet Code</Label>
            <Hint className="text-xs mt-0.5 mb-1">Optional DHL account/sheet identifier</Hint>
            <Input
              id="rateSheetCode"
              value={form.rateSheetCode}
              onChange={(e) => updateField('rateSheetCode', e.target.value)}
            />
          </div>
        </Drawer.Body>
        <Drawer.Footer>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} isLoading={saving}>
            {isEdit ? 'Update' : 'Create'}
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}
