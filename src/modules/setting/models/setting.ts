import { model } from '@medusajs/framework/utils'

export const DHLSetting = model.define('dhl_setting', {
  id: model.id().primaryKey(),
  is_enabled: model.boolean(),
  user_id: model.text(),
  api_key: model.text(),
  account_id: model.text(),
  enable_logs: model.boolean(),
  item_dimensions_unit: model.enum(['mm', 'cm']).default('mm'),
  item_weight_unit: model.enum(['g', 'kg']).default('g'),
})
