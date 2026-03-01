import { z } from 'zod'

const tarrifTypeEnum = z.enum(['packet_type', 'weight', 'pallet'])

export const PricingManualCreateSchema = z
  .object({
    forConsument: z.boolean(),
    tarrifType: tarrifTypeEnum,
    tariffValue: z.string().min(1, 'tariffValue is required'),
    provider: z.string().min(1, 'provider is required'),
    fromCountry: z.string().min(1, 'fromCountry is required'),
    toCountry: z.string().min(1, 'toCountry is required'),
    price: z.number().min(0, 'price must be >= 0'),
    validFrom: z.string().refine((v) => !isNaN(Date.parse(v)), 'validFrom must be a valid date'),
    validTo: z
      .string()
      .refine((v) => !isNaN(Date.parse(v)), 'validTo must be a valid date')
      .nullable()
      .optional(),
    rateSheetCode: z.string().nullable().optional(),
  })
  .refine((data) => !data.validTo || new Date(data.validTo) >= new Date(data.validFrom), {
    message: 'validTo must be >= validFrom',
    path: ['validTo'],
  })

export type PricingManualCreateInput = z.infer<typeof PricingManualCreateSchema>

export const PricingManualUpdateSchema = z
  .object({
    forConsument: z.boolean().optional(),
    tarrifType: tarrifTypeEnum.optional(),
    tariffValue: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
    fromCountry: z.string().min(1).optional(),
    toCountry: z.string().min(1).optional(),
    price: z.number().min(0).optional(),
    validFrom: z
      .string()
      .refine((v) => !isNaN(Date.parse(v)), 'validFrom must be a valid date')
      .optional(),
    validTo: z
      .string()
      .refine((v) => !isNaN(Date.parse(v)), 'validTo must be a valid date')
      .nullable()
      .optional(),
    rateSheetCode: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.validTo && data.validFrom) {
        return new Date(data.validTo) >= new Date(data.validFrom)
      }
      return true
    },
    { message: 'validTo must be >= validFrom', path: ['validTo'] },
  )

export type PricingManualUpdateInput = z.infer<typeof PricingManualUpdateSchema>

export const ExtraServiceCreateSchema = z.object({
  service: z.string().min(1, 'service is required'),
  price: z.number().min(0, 'price must be >= 0'),
})

export type ExtraServiceCreateInput = z.infer<typeof ExtraServiceCreateSchema>

export const ExtraServiceUpdateSchema = z.object({
  service: z.string().min(1).optional(),
  price: z.number().min(0).optional(),
})

export type ExtraServiceUpdateInput = z.infer<typeof ExtraServiceUpdateSchema>

export const ImportParseSchema = z.object({
  pdfBase64: z.string().min(1, 'PDF data is required'),
})

export const ImportCommitSchema = z.object({
  mode: z.enum(['upsert', 'new_version']),
  rateSheetCode: z.string().optional().default(''),
  validFrom: z.string().optional().default(''),
  validTo: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), 'validTo must be a valid date')
    .nullable()
    .optional()
    .default(null),
  rows: z.array(
    z.object({
      forConsument: z.boolean(),
      tarrifType: tarrifTypeEnum,
      tariffValue: z.string().min(1),
      provider: z.string().min(1),
      fromCountry: z.string().min(1),
      toCountry: z.string().min(1),
      price: z.number().min(0),
      validFrom: z.string(),
      validTo: z.string().nullable().optional().default(null),
      rateSheetCode: z.string().optional().default(''),
      targetTable: z.enum(['pricing_manual', 'pricing_manual_extra']),
    }),
  ),
})

export type ImportCommitInput = z.infer<typeof ImportCommitSchema>

export const PricingListQuerySchema = z.object({
  provider: z.string().optional(),
  forConsument: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  tarrifType: tarrifTypeEnum.optional(),
  fromCountry: z.string().optional(),
  toCountry: z.string().optional(),
  activeOn: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), 'activeOn must be a valid date')
    .optional(),
})

export type PricingListQuery = z.infer<typeof PricingListQuerySchema>
