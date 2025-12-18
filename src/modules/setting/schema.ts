import { z } from "zod"

export const DhlBoxSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  inner_cm: z.object({
    length: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  max_weight_kg: z.number().positive().optional(),
  dhl_parcel_type: z.string().min(1).max(100),
})

export type DhlBox = z.infer<typeof DhlBoxSchema>

export const DhlSettingsSchema = z.object({
  is_enabled: z.boolean(),
  user_id: z.string().min(2).max(100),
  api_key: z.string().min(2).max(100),
  account_id: z.string().min(2).max(100),
  enable_logs: z.boolean(),
  boxes: z.array(DhlBoxSchema).default([]),
})

export type DhlSettingsInput = z.infer<typeof DhlSettingsSchema>


