import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { DHL_SETTINGS_MODULE } from '../../../../../modules/setting'
import { PricingManualCreateSchema } from '../validator'
import type DHLSettingsModuleService from '../../../../../modules/setting/service'
import type { PricingRecord } from '../../../../../types/pricing'

interface ListResponse {
  records: PricingRecord[]
  count: number
}

interface CreateResponse {
  record: PricingRecord
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
    const filters: Record<string, string | boolean> = {}

    const { provider, forConsument, tarrifType, fromCountry, toCountry } = req.query as Record<
      string,
      string | undefined
    >

    if (provider) filters.provider = provider
    if (forConsument !== undefined) filters.forConsument = forConsument === 'true'
    if (tarrifType) filters.tarrifType = tarrifType
    if (fromCountry) filters.fromCountry = fromCountry
    if (toCountry) filters.toCountry = toCountry

    const [records, count] = await service.listAndCountPricingManualExtras(filters)

    res.json({ records: records as PricingRecord[], count })
  } catch (error) {
    console.error('Error listing pricing manual extras:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}

export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse<CreateResponse | ErrorResponse>,
) => {
  try {
    const parsed = PricingManualCreateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ message: 'Validation error', errors: parsed.error.flatten() })
      return
    }

    const service = req.scope.resolve(DHL_SETTINGS_MODULE) as DHLSettingsModuleService
    const { validFrom, validTo, ...rest } = parsed.data
    const record = await service.createPricingManualExtras({
      ...rest,
      validFrom: new Date(validFrom),
      validTo: validTo ? new Date(validTo) : null,
    })

    res.status(201).json({ record: record as PricingRecord })
  } catch (error) {
    console.error('Error creating pricing manual extra:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}
