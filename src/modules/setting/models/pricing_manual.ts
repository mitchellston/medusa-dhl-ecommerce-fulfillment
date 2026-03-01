import { model } from '@medusajs/framework/utils'

export const PricingManual = model.define('pricing_manual', {
  id: model.id().primaryKey(),
  forConsument: model.boolean(),
  tarrifType: model.enum(['packet_type', 'weight', 'pallet']),
  tariffValue: model.text(), // 50, 100 for weight, Envelop/S/M for packet type, 5 for pallet
  provider: model.text(), // DHL Europlus Expresser Pakketten, DHL Europlus Pakketten, DHL For You
  fromCountry: model.text(),
  toCountry: model.text(),
  price: model.number(), // price is without tax
  validFrom: model.dateTime(),
  validTo: model.dateTime().nullable(),
  rateSheetCode: model.text().nullable(),
})
