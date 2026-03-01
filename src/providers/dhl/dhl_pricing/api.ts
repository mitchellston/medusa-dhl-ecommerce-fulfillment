import { CartLineItemDTO, FulfillmentItemDTO, ProductVariantDTO } from '@medusajs/framework/types'
import { getFulfillmentOptions } from '../../../dhl-api/get-fulfillment-options'
import { calculateBestFulfillment } from '../../../dhl-api/calculate-best-fulfillment'

export async function getBestFulfillmentBasedOnPriceViaApi(
  fulfillmentOptions: Awaited<ReturnType<typeof getFulfillmentOptions>>,
  items:
    | (CartLineItemDTO & { variant?: ProductVariantDTO })[]
    | (Partial<Omit<FulfillmentItemDTO, 'fulfillment'>> & {
        variant?: ProductVariantDTO | undefined
      })[],
  option: string,
  weightUnitOfMeasure: number,
  dimensionUnitOfMeasure: number,
) {
  type PricingItem = (typeof items)[number]

  const fulfillmentOptionsDimensions = fulfillmentOptions
    .map((fulfillment) => {
      const fulfillmentOption = fulfillment.options.find(
        (fulfillmentOption) => fulfillmentOption.key == option,
      )

      if (fulfillmentOption) {
        return {
          key: fulfillment.parcelType.key,
          maxWeight: fulfillment.parcelType.maxWeightGrams,
          minWeight: fulfillment.parcelType.minWeightGrams,
          height: fulfillment.parcelType.dimensions.maxHeightCm,
          width: fulfillment.parcelType.dimensions.maxWidthCm,
          length: fulfillment.parcelType.dimensions.maxLengthCm,
          sum: fulfillment.parcelType.dimensions.maxSumCm ?? 0,
          price: fulfillmentOption.price?.withTax ?? 0,
        }
      }
      return undefined
    })
    .filter((opt): opt is NonNullable<typeof opt> => opt !== undefined)

  // Find the best shipping option for the items
  // Convert dimensions to cm if configured as mm (DHL expects cm)
  // Convert weight to grams if configured as kg (DHL expects grams)

  const itemDimensions = items.map((item: PricingItem) => {
    return {
      weight: (item.variant?.weight ?? 0) * weightUnitOfMeasure,
      height: (item.variant?.height ?? 0) / dimensionUnitOfMeasure,
      width: (item.variant?.width ?? 0) / dimensionUnitOfMeasure,
      length: (item.variant?.length ?? 0) / dimensionUnitOfMeasure,
      quantity: Number(item.quantity ?? 0),
    }
  })

  // Calculate the best shipping option using bin packing
  const bestFulfillment = calculateBestFulfillment(itemDimensions, fulfillmentOptionsDimensions)
  return bestFulfillment
}

export async function calculatePriceViaApi(
  fulfillmentOptions: Awaited<ReturnType<typeof getFulfillmentOptions>>,
  items: (CartLineItemDTO & { variant?: ProductVariantDTO })[],
  option: string,
  weightUnitOfMeasure: number,
  dimensionUnitOfMeasure: number,
) {
  const bestFulfillment = await getBestFulfillmentBasedOnPriceViaApi(
    fulfillmentOptions,
    items,
    option,
    weightUnitOfMeasure,
    dimensionUnitOfMeasure,
  )

  if (bestFulfillment.length === 0) {
    this.logger_.error('DHL rate quote: no suitable fulfillment options found')
    throw new Error('No suitable shipping options found for the items')
  }

  // Calculate total price from all required packages
  const totalPrice = bestFulfillment.reduce((sum, { fulfillmentOption, quantity }) => {
    return sum + fulfillmentOption.price * quantity
  }, 0)

  return totalPrice
}
