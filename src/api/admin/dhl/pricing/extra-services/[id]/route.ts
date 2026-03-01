import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { DHL_SETTINGS_MODULE } from '../../../../../../modules/setting'
import { ExtraServiceUpdateSchema } from '../../validator'
import type DHLSettingsModuleService from '../../../../../../modules/setting/service'
import type { ExtraServiceRecord } from '../../../../../../types/pricing'

interface UpdateResponse {
  record: ExtraServiceRecord
}

interface ErrorResponse {
  message: string
  errors?: unknown
}

export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse<{ record: ExtraServiceRecord } | ErrorResponse>,
) => {
  try {
    const { id } = req.params
    const service = req.scope.resolve(DHL_SETTINGS_MODULE) as DHLSettingsModuleService
    const record = await service.retrievePricingManualExtraServicesPricing(id)
    res.json({ record: record as ExtraServiceRecord })
  } catch (error) {
    console.error('Error retrieving extra services pricing:', error)
    res.status(404).json({ message: 'Record not found' })
  }
}

export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse<UpdateResponse | ErrorResponse>,
) => {
  try {
    const { id } = req.params
    const parsed = ExtraServiceUpdateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ message: 'Validation error', errors: parsed.error.flatten() })
      return
    }

    const service = req.scope.resolve(DHL_SETTINGS_MODULE) as DHLSettingsModuleService
    const record = await service.updatePricingManualExtraServicesPricings({
      id,
      ...parsed.data,
    })

    res.json({ record: record as ExtraServiceRecord })
  } catch (error) {
    console.error('Error updating extra services pricing:', error)
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
    await service.deletePricingManualExtraServicesPricings([id])
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting extra services pricing:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}
