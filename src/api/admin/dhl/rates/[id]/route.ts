import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { PutDHLRate } from '../../validator'
import { DHL_SETTINGS_MODULE } from '../../../../../modules/setting'
import type DHLSettingsModuleService from '../../../../../modules/setting/service'

type RateResponse = {
  id: string
  shipping_option_key: string
  rate_type: 'parcel_type' | 'weight'
  country_code: string
  parcel_type_key: string | null
  max_weight_kg: number | null
  price: number
}

type GetRateResponse = {
  rate: RateResponse
}

type UpdateRateResponse = {
  rate: RateResponse
}

type ErrorResponse = {
  error: string
  details?: unknown
}

/**
 * GET /admin/dhl/rates/:id - Get a single rate by ID
 */
export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse<GetRateResponse | ErrorResponse>,
) => {
  try {
    const { id } = req.params

    const settingsService = req.scope.resolve<DHLSettingsModuleService>(DHL_SETTINGS_MODULE)
    const rate = await settingsService.getRate(id)

    if (!rate) {
      return res.status(404).json({ error: 'Rate not found' })
    }

    res.json({
      rate: {
        id: rate.id,
        shipping_option_key: rate.shipping_option_key,
        rate_type: rate.rate_type as 'parcel_type' | 'weight',
        country_code: rate.country_code,
        parcel_type_key: rate.parcel_type_key,
        max_weight_kg: rate.max_weight_kg,
        price: Number(rate.price),
      },
    })
  } catch (error) {
    console.error('Error getting DHL rate:', error)
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}

/**
 * PUT /admin/dhl/rates/:id - Update a single rate
 */
export const PUT = async (
  req: MedusaRequest,
  res: MedusaResponse<UpdateRateResponse | ErrorResponse>,
) => {
  try {
    const { id } = req.params

    const validationResult = PutDHLRate.safeParse(req.body)
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid rate data',
        details: validationResult.error.errors,
      })
    }

    const settingsService = req.scope.resolve<DHLSettingsModuleService>(DHL_SETTINGS_MODULE)

    // Check if rate exists
    const existingRate = await settingsService.getRate(id)
    if (!existingRate) {
      return res.status(404).json({ error: 'Rate not found' })
    }

    const rate = await settingsService.updateRate(id, validationResult.data)

    res.json({
      rate: {
        id: rate.id,
        shipping_option_key: rate.shipping_option_key,
        rate_type: rate.rate_type as 'parcel_type' | 'weight',
        country_code: rate.country_code,
        parcel_type_key: rate.parcel_type_key,
        max_weight_kg: rate.max_weight_kg,
        price: Number(rate.price),
      },
    })
  } catch (error) {
    console.error('Error updating DHL rate:', error)
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}

/**
 * DELETE /admin/dhl/rates/:id - Delete a single rate
 */
export const DELETE = async (
  req: MedusaRequest,
  res: MedusaResponse<{ success: boolean } | ErrorResponse>,
) => {
  try {
    const { id } = req.params

    const settingsService = req.scope.resolve<DHLSettingsModuleService>(DHL_SETTINGS_MODULE)

    // Check if rate exists
    const existingRate = await settingsService.getRate(id)
    if (!existingRate) {
      return res.status(404).json({ error: 'Rate not found' })
    }

    await settingsService.deleteRate(id)

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting DHL rate:', error)
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}
