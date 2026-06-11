import { z } from 'zod'

export const PostDHLSettings = z.object({
  is_enabled: z.boolean(),
  user_id: z.string().min(2).max(100),
  api_key: z.string().min(2).max(100),
  account_id: z.string().min(2).max(100),
  enable_logs: z.boolean(),
  item_dimensions_unit: z.enum(['mm', 'cm']).default('mm'),
  item_weight_unit: z.enum(['g', 'kg']).default('g'),
  webhook_api_key: z.string().min(50).max(150).nullable().optional(),
  webhook_api_key_header: z.string().min(1).max(100).default('Authorization'),
  pricing_mode: z.enum(['api', 'manual']).default('api'),
})

// Valid parcel type keys from DHL API
export const ParcelTypeKeys = [
  'ENVELOPE',
  'MAILBOX_PACKAGE',
  'SMALL',
  'MEDIUM',
  'LARGE',
  'XLARGE',
  'XXLARGE',
] as const

// Single rate schema
export const PostDHLRate = z
  .object({
    shipping_option_key: z.string().min(1).max(50),
    rate_type: z.enum(['parcel_type', 'weight']),
    country_code: z.string().length(2).toUpperCase(),
    parcel_type_key: z.enum(ParcelTypeKeys).nullable().optional(),
    max_weight_kg: z.number().positive().nullable().optional(),
    price: z.number().int().nonnegative(), // Price in cents
  })
  .refine(
    (data) => {
      // If rate_type is parcel_type, parcel_type_key is required
      if (data.rate_type === 'parcel_type') {
        return data.parcel_type_key !== null && data.parcel_type_key !== undefined
      }
      return true
    },
    { message: 'parcel_type_key is required when rate_type is parcel_type', path: ['parcel_type_key'] },
  )
  .refine(
    (data) => {
      // If rate_type is weight, max_weight_kg is required
      if (data.rate_type === 'weight') {
        return data.max_weight_kg !== null && data.max_weight_kg !== undefined
      }
      return true
    },
    { message: 'max_weight_kg is required when rate_type is weight', path: ['max_weight_kg'] },
  )

// Bulk rate creation schema
export const PostDHLRatesBulk = z.object({
  rates: z.array(PostDHLRate).min(1),
})

// Rate update schema (partial)
export const PutDHLRate = z.object({
  shipping_option_key: z.string().min(1).max(50).optional(),
  rate_type: z.enum(['parcel_type', 'weight']).optional(),
  country_code: z.string().length(2).toUpperCase().optional(),
  parcel_type_key: z.enum(ParcelTypeKeys).nullable().optional(),
  max_weight_kg: z.number().positive().nullable().optional(),
  price: z.number().int().nonnegative().optional(),
})

// Rate filter schema for querying
export const GetDHLRatesQuery = z.object({
  shipping_option_key: z.string().optional(),
  rate_type: z.enum(['parcel_type', 'weight']).optional(),
  country_code: z.string().length(2).toUpperCase().optional(),
})

// Bulk delete schema
export const DeleteDHLRatesBulk = z.object({
  ids: z.array(z.string()).min(1),
})
