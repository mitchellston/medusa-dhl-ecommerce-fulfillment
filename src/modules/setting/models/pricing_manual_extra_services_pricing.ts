import { model } from '@medusajs/framework/utils'

// This model is used to store extra pricing for manual pricing (Extra 50 kG above the base price for example)
export const PricingManualExtraServicesPricing = model.define(
  'pricing_manual_extra_services_pricing',
  {
    id: model.id().primaryKey(),
    service: model.text(), // age_check, door, expresser
    price: model.number(), // price is without tax
  },
)
