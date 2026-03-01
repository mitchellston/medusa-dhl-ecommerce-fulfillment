import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { DHL_SETTINGS_MODULE } from '../../../../../../modules/setting'
import { ImportParseSchema } from '../../validator'
import { parseDhlPdf, markDuplicates } from '../../../../../../utils/pdf-parser'
import type DHLSettingsModuleService from '../../../../../../modules/setting/service'
import type { ParseResult, PricingRecord } from '../../../../../../types/pricing'

interface ErrorResponse {
  message: string
  errors?: unknown
}

export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse<ParseResult | ErrorResponse>,
) => {
  try {
    const parsed = ImportParseSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ message: 'Validation error', errors: parsed.error.flatten() })
      return
    }

    const { pdfBase64 } = parsed.data
    const pdfBuffer = Buffer.from(pdfBase64, 'base64')

    const result = await parseDhlPdf(pdfBuffer)

    if (result.globalErrors.length > 0 && result.rows.length === 0) {
      res.status(422).json({
        message: 'PDF parsing failed',
        errors: result.globalErrors,
      })
      return
    }

    const service = req.scope.resolve(DHL_SETTINGS_MODULE) as DHLSettingsModuleService

    const [existingBase] = await service.listAndCountPricingManuals()
    const [existingExtra] = await service.listAndCountPricingManualExtras()

    const allExisting = [
      ...(existingBase as PricingRecord[]),
      ...(existingExtra as PricingRecord[]),
    ].map((r) => ({
      provider: r.provider,
      tarrifType: r.tarrifType,
      tariffValue: r.tariffValue,
      fromCountry: r.fromCountry,
      toCountry: r.toCountry,
      rateSheetCode: r.rateSheetCode,
    }))

    result.rows = markDuplicates(result.rows, allExisting)

    res.json(result)
  } catch (error) {
    console.error('Error parsing DHL PDF:', error)
    res.status(500).json({ message: 'Failed to parse PDF. Ensure the file is a valid DHL rate sheet.' })
  }
}
