import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { DHL_SETTINGS_MODULE } from '../../../../../modules/setting'
import { ExtraServiceCreateSchema } from '../validator'
import type DHLSettingsModuleService from '../../../../../modules/setting/service'
import type { ExtraServiceRecord } from '../../../../../types/pricing'

interface ListResponse {
  records: ExtraServiceRecord[]
  count: number
}

interface CreateResponse {
  record: ExtraServiceRecord
}

interface ErrorResponse {
  message: string
  errors?: unknown
}

export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse<ListResponse | ErrorResponse>,
) => {
  try {
    const service = req.scope.resolve(DHL_SETTINGS_MODULE) as DHLSettingsModuleService
    const [records, count] = await service.listAndCountPricingManualExtraServicesPricings()

    res.json({ records: records as ExtraServiceRecord[], count })
  } catch (error) {
    console.error('Error listing extra services pricing:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}

export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse<CreateResponse | ErrorResponse>,
) => {
  try {
    const parsed = ExtraServiceCreateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ message: 'Validation error', errors: parsed.error.flatten() })
      return
    }

    const service = req.scope.resolve(DHL_SETTINGS_MODULE) as DHLSettingsModuleService
    const record = await service.createPricingManualExtraServicesPricings(parsed.data)

    res.status(201).json({ record: record as ExtraServiceRecord })
  } catch (error) {
    console.error('Error creating extra services pricing:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}
