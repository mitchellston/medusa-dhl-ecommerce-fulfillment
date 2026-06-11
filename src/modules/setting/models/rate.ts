import { model } from '@medusajs/framework/utils'

export const DHLRate = model.define('dhl_rate', {
  id: model.id().primaryKey(),
  shipping_option_key: model.text(),
  rate_type: model.enum(['parcel_type', 'weight']),
  country_code: model.text(),
  parcel_type_key: model.text().nullable(),
  max_weight_kg: model.float().nullable(),
  price: model.bigNumber(),
})
