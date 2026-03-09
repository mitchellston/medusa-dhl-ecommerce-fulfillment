import { model } from '@medusajs/framework/utils'

// This model is used to store extra pricing for manual pricing (Extra 50 kG above the base price for example)
export const PricingManualExtra = model.define('pricing_manual_extra', {
  id: model.id().primaryKey(),
  forConsument: model.boolean(),
  tarrifType: model.enum(['packet_type', 'weight', 'pallet']),
  tariffValue: model.text(), // 50, 100 for weight, Envelop/S/M for packet type, 5 for pallet
  provider: model.text(), // DHL Europlus Expresser Pakketten, DHL Europlus Pakketten, DHL For You
  fromCountry: model.text(),
  toCountry: model.text(),
  price: model.float(), // price in euros (excl. tax), as imported from rate sheets
  validFrom: model.dateTime(),
  validTo: model.dateTime().nullable(),
  rateSheetCode: model.text().nullable(),
})
