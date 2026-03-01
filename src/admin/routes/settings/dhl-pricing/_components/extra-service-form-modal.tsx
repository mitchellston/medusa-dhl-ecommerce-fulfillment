import { Button, Drawer, Input, Label, Hint, toast } from '@medusajs/ui'
import { useState, useEffect } from 'react'
import { sdk } from '../../../../lib/sdk'
import type { ExtraServiceRecord } from '../types'

const ENDPOINT = '/admin/dhl/pricing/extra-services'

interface ExtraServiceFormModalProps {
  open: boolean
  record: ExtraServiceRecord | null
  onClose: () => void
  onSaved: () => void
}

interface FormState {
  service: string
  price: string
}

const EMPTY_FORM: FormState = { service: '', price: '' }

export function ExtraServiceFormModal({
  open,
  record,
  onClose,
  onSaved,
}: ExtraServiceFormModalProps) {
  const isEdit = !!record
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      setForm(record ? { service: record.service, price: String(record.price) } : EMPTY_FORM)
      setErrors({})
    }
  }, [open, record])

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!form.service.trim()) newErrors.service = 'Required'
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) < 0)
      newErrors.price = 'Must be a number >= 0'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const body = {
        service: form.service.trim(),
        price: Number(form.price),
      }

      if (isEdit && record) {
        await sdk.client.fetch(`${ENDPOINT}/${record.id}`, { method: 'POST', body })
        toast.success('Extra service updated')
      } else {
        await sdk.client.fetch(ENDPOINT, { method: 'POST', body })
        toast.success('Extra service created')
      }
      onSaved()
    } catch {
      toast.error(isEdit ? 'Failed to update' : 'Failed to create')
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
          <Drawer.Title>{isEdit ? 'Edit Extra Service' : 'New Extra Service'}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-4 p-4">
          <div>
            <Label htmlFor="service">Service Name</Label>
            <Hint className="text-xs mt-0.5 mb-1">e.g. age_check, door, expresser</Hint>
            <Input
              id="service"
              value={form.service}
              onChange={(e) => updateField('service', e.target.value)}
            />
            {errors.service && <Hint variant="error">{errors.service}</Hint>}
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
