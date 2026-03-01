import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { DHL_SETTINGS_MODULE } from '../../../../../../modules/setting'
import { ImportCommitSchema } from '../../validator'
import type DHLSettingsModuleService from '../../../../../../modules/setting/service'
import type { ImportCommitResult, PricingRecord } from '../../../../../../types/pricing'

interface ErrorResponse {
  message: string
  errors?: unknown
}

function buildLogicalKey(r: {
  provider: string
  tarrifType: string
  tariffValue: string
  fromCountry: string
  toCountry: string
  rateSheetCode: string | null
}): string {
  return `${r.provider}|${r.tarrifType}|${r.tariffValue}|${r.fromCountry}|${r.toCountry}|${r.rateSheetCode ?? ''}`
}

function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null
  return new Date(value)
}

function toDateOrNow(value: string | undefined): Date {
  if (!value || isNaN(Date.parse(value))) return new Date()
  return new Date(value)
}

export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse<ImportCommitResult | ErrorResponse>,
) => {
  try {
    const parsed = ImportCommitSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ message: 'Validation error', errors: parsed.error.flatten() })
      return
    }

    const { mode, rows, validTo } = parsed.data
    const service = req.scope.resolve(DHL_SETTINGS_MODULE) as DHLSettingsModuleService

    const result: ImportCommitResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    }

    const baseRows = rows.filter((r) => r.targetTable === 'pricing_manual')
    const extraRows = rows.filter((r) => r.targetTable === 'pricing_manual_extra')

    if (mode === 'upsert') {
      const [existingBase] = await service.listAndCountPricingManuals()
      const [existingExtra] = await service.listAndCountPricingManualExtras()

      const baseByKey = new Map(
        (existingBase as PricingRecord[]).map((r) => [buildLogicalKey(r), r]),
      )
      const extraByKey = new Map(
        (existingExtra as PricingRecord[]).map((r) => [buildLogicalKey(r), r]),
      )

      for (const row of baseRows) {
        try {
          const key = buildLogicalKey(row)
          const existing = baseByKey.get(key)
          const data = {
            forConsument: row.forConsument,
            tarrifType: row.tarrifType,
            tariffValue: row.tariffValue,
            provider: row.provider,
            fromCountry: row.fromCountry,
            toCountry: row.toCountry,
            price: row.price,
            validFrom: toDateOrNow(row.validFrom),
            validTo: toDateOrNull(validTo ?? row.validTo),
            rateSheetCode: row.rateSheetCode,
          }

          if (existing) {
            await service.updatePricingManuals({ id: existing.id, ...data })
            result.updated++
          } else {
            await service.createPricingManuals(data)
            result.created++
          }
        } catch (error) {
          result.failed++
          result.errors.push({
            rowIndex: rows.indexOf(row),
            message: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      for (const row of extraRows) {
        try {
          const key = buildLogicalKey(row)
          const existing = extraByKey.get(key)
          const data = {
            forConsument: row.forConsument,
            tarrifType: row.tarrifType,
            tariffValue: row.tariffValue,
            provider: row.provider,
            fromCountry: row.fromCountry,
            toCountry: row.toCountry,
            price: row.price,
            validFrom: toDateOrNow(row.validFrom),
            validTo: toDateOrNull(validTo ?? row.validTo),
            rateSheetCode: row.rateSheetCode,
          }

          if (existing) {
            await service.updatePricingManualExtras({ id: existing.id, ...data })
            result.updated++
          } else {
            await service.createPricingManualExtras(data)
            result.created++
          }
        } catch (error) {
          result.failed++
          result.errors.push({
            rowIndex: rows.indexOf(row),
            message: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }
    } else {
      for (const row of baseRows) {
        try {
          await service.createPricingManuals({
            forConsument: row.forConsument,
            tarrifType: row.tarrifType,
            tariffValue: row.tariffValue,
            provider: row.provider,
            fromCountry: row.fromCountry,
            toCountry: row.toCountry,
            price: row.price,
            validFrom: toDateOrNow(row.validFrom),
            validTo: toDateOrNull(validTo ?? row.validTo),
            rateSheetCode: row.rateSheetCode,
          })
          result.created++
        } catch (error) {
          result.failed++
          result.errors.push({
            rowIndex: rows.indexOf(row),
            message: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      for (const row of extraRows) {
        try {
          await service.createPricingManualExtras({
            forConsument: row.forConsument,
            tarrifType: row.tarrifType,
            tariffValue: row.tariffValue,
            provider: row.provider,
            fromCountry: row.fromCountry,
            toCountry: row.toCountry,
            price: row.price,
            validFrom: toDateOrNow(row.validFrom),
            validTo: toDateOrNull(validTo ?? row.validTo),
            rateSheetCode: row.rateSheetCode,
          })
          result.created++
        } catch (error) {
          result.failed++
          result.errors.push({
            rowIndex: rows.indexOf(row),
            message: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }
    }

    res.json(result)
  } catch (error) {
    console.error('Error committing import:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}
