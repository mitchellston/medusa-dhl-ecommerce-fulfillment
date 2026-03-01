import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { DHL_SETTINGS_MODULE } from '../../../../../../modules/setting'
import { PricingManualUpdateSchema } from '../../validator'
import type DHLSettingsModuleService from '../../../../../../modules/setting/service'
import type { PricingRecord } from '../../../../../../types/pricing'

interface UpdateResponse {
  record: PricingRecord
}

interface ErrorResponse {
  message: string
  errors?: unknown
}

export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse<{ record: PricingRecord } | ErrorResponse>,
) => {
  try {
    const { id } = req.params
    const service = req.scope.resolve(DHL_SETTINGS_MODULE) as DHLSettingsModuleService
    const record = await service.retrievePricingManualExtra(id)
    res.json({ record: record as PricingRecord })
  } catch (error) {
    console.error('Error retrieving pricing manual extra:', error)
    res.status(404).json({ message: 'Record not found' })
  }
}

export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse<UpdateResponse | ErrorResponse>,
) => {
  try {
    const { id } = req.params
    const parsed = PricingManualUpdateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ message: 'Validation error', errors: parsed.error.flatten() })
      return
    }

    const service = req.scope.resolve(DHL_SETTINGS_MODULE) as DHLSettingsModuleService
    const { validFrom, validTo, ...rest } = parsed.data
    const record = await service.updatePricingManualExtras({
      id,
      ...rest,
      ...(validFrom !== undefined && { validFrom: new Date(validFrom) }),
      ...(validTo !== undefined && { validTo: validTo ? new Date(validTo) : null }),
    })

    res.json({ record: record as PricingRecord })
  } catch (error) {
    console.error('Error updating pricing manual extra:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}

export const DELETE = async (
  req: MedusaRequest,
  res: MedusaResponse<{ success: boolean } | ErrorResponse>,
) => {
  try {
    const { id } = req.params
    const service = req.scope.resolve(DHL_SETTINGS_MODULE) as DHLSettingsModuleService
    await service.deletePricingManualExtras([id])
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting pricing manual extra:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}
