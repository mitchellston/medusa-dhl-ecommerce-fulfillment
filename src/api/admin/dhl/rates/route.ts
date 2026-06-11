import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { z } from 'zod'
import { PostDHLRate, PostDHLRatesBulk, GetDHLRatesQuery, DeleteDHLRatesBulk } from '../validator'
import { DHL_SETTINGS_MODULE } from '../../../../modules/setting'
import type DHLSettingsModuleService from '../../../../modules/setting/service'

export type RateInput = z.infer<typeof PostDHLRate>
export type RatesBulkInput = z.infer<typeof PostDHLRatesBulk>
export type RatesQuery = z.infer<typeof GetDHLRatesQuery>
export type RatesBulkDeleteInput = z.infer<typeof DeleteDHLRatesBulk>

type RateResponse = {
  id: string
  shipping_option_key: string
  rate_type: 'parcel_type' | 'weight'
  country_code: string
  parcel_type_key: string | null
  max_weight_kg: number | null
  price: number
}

type ListRatesResponse = {
  rates: RateResponse[]
}

type CreateRateResponse = {
  rate: RateResponse
}

type CreateRatesBulkResponse = {
  rates: RateResponse[]
}

type ErrorResponse = {
  error: string
  details?: unknown
}

/**
 * GET /admin/dhl/rates - List all rates with optional filters
 */
export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse<ListRatesResponse | ErrorResponse>,
) => {
  try {
    const queryResult = GetDHLRatesQuery.safeParse(req.query)
    if (!queryResult.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: queryResult.error.errors,
      })
    }

    const settingsService = req.scope.resolve<DHLSettingsModuleService>(DHL_SETTINGS_MODULE)
    const rates = await settingsService.listRates(queryResult.data)

    res.json({
      rates: rates.map((rate) => ({
        id: rate.id,
        shipping_option_key: rate.shipping_option_key,
        rate_type: rate.rate_type as 'parcel_type' | 'weight',
        country_code: rate.country_code,
        parcel_type_key: rate.parcel_type_key,
        max_weight_kg: rate.max_weight_kg,
        price: Number(rate.price),
      })),
    })
  } catch (error) {
    console.error('Error listing DHL rates:', error)
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}

/**
 * POST /admin/dhl/rates - Create a single rate or bulk create rates
 * Body: { rates: [...] } for bulk, or single rate object for single creation
 */
export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse<CreateRateResponse | CreateRatesBulkResponse | ErrorResponse>,
) => {
  try {
    const settingsService = req.scope.resolve<DHLSettingsModuleService>(DHL_SETTINGS_MODULE)

    const body = req.body as Record<string, unknown>

    // Check if this is a bulk request
    if ('rates' in body && Array.isArray(body.rates)) {
      const bulkResult = PostDHLRatesBulk.safeParse(req.body)
      if (!bulkResult.success) {
        return res.status(400).json({
          error: 'Invalid rate data',
          details: bulkResult.error.errors,
        })
      }

      const rates = await settingsService.createRatesBulk(bulkResult.data.rates)

      return res.status(201).json({
        rates: rates.map((rate) => ({
          id: rate.id,
          shipping_option_key: rate.shipping_option_key,
          rate_type: rate.rate_type as 'parcel_type' | 'weight',
          country_code: rate.country_code,
          parcel_type_key: rate.parcel_type_key,
          max_weight_kg: rate.max_weight_kg,
          price: Number(rate.price),
        })),
      })
    }

    // Single rate creation
    const singleResult = PostDHLRate.safeParse(req.body)
    if (!singleResult.success) {
      return res.status(400).json({
        error: 'Invalid rate data',
        details: singleResult.error.errors,
      })
    }

    const rate = await settingsService.createRate(singleResult.data)

    res.status(201).json({
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
    console.error('Error creating DHL rate:', error)
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}

/**
 * DELETE /admin/dhl/rates - Bulk delete rates
 * Body: { ids: [...] }
 */
export const DELETE = async (
  req: MedusaRequest,
  res: MedusaResponse<{ success: boolean } | ErrorResponse>,
) => {
  try {
    const deleteResult = DeleteDHLRatesBulk.safeParse(req.body)
    if (!deleteResult.success) {
      return res.status(400).json({
        error: 'Invalid delete request',
        details: deleteResult.error.errors,
      })
    }

    const settingsService = req.scope.resolve<DHLSettingsModuleService>(DHL_SETTINGS_MODULE)
    await settingsService.deleteRatesBulk(deleteResult.data.ids)

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting DHL rates:', error)
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}
