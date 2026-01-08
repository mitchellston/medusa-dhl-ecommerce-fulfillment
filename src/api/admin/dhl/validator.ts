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
})
