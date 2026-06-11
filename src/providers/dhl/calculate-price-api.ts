import {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceDTO,
  CartLineItemDTO,
  Logger,
  ProductVariantDTO,
} from '@medusajs/framework/types'
import { getAuthToken } from '../../dhl-api/auth'
import { calculateBestFulfillment } from '../../dhl-api/calculate-best-fulfillment'
import { getFulfillmentOptions } from '../../dhl-api/get-fulfillment-options'
import { DHLFulfillmentOptionAddress } from '../../dhl-api/types'
import { SetupCredentialsInput } from '../../api/admin/dhl/route'

type CalculatePriceApiParams = {
  credentials: SetupCredentialsInput
  baseUrl: string
  optionData: CalculateShippingOptionPriceDTO['optionData']
  context: CalculateShippingOptionPriceDTO['context']
  logger: Logger
}

/**
 * Calculates shipping price using the DHL API (Capabilities API).
 * This is the API-based pricing mode that requires API access.
 *
 * @param params The calculation parameters.
 * @returns The calculated shipping price.
 */
export async function calculatePriceApi(
  params: CalculatePriceApiParams,
): Promise<CalculatedShippingOptionPrice> {
  const { credentials, baseUrl, optionData, context, logger } = params

  const token = await getAuthToken(
    baseUrl,
    credentials.user_id,
    credentials.api_key,
    credentials.account_id,
  )

  // Get the selected DHL option key from optionData, fallback to DOOR
  const option = typeof optionData?.carrier_key === 'string' ? optionData.carrier_key : 'DOOR'

  if (!context.items || context.items.length === 0) {
    throw new Error('Cart is empty')
  }

  // Validate customer address
  if (!context.shipping_address) {
    throw new Error('Missing shipping address in context')
  }

  if (!context.shipping_address.postal_code) {
    throw new Error('Missing shipping address postal code in context')
  }

  if (!context.shipping_address.country_code) {
    throw new Error('Missing shipping address country code in context')
  }

  // Validate store address
  if (!context.from_location) {
    throw new Error('Missing store address in context')
  }

  if (!context.from_location.address) {
    throw new Error('Missing store address in context')
  }

  if (!context.from_location.address.postal_code) {
    throw new Error('Missing store address zip in context')
  }

  if (!context.from_location.address.country_code) {
    throw new Error('Missing store address country in context')
  }

  const originAddress: DHLFulfillmentOptionAddress = {
    postalCode: context.from_location.address.postal_code,
    countryCode: context.from_location.address.country_code,
  }

  const destinationAddress: DHLFulfillmentOptionAddress = {
    postalCode: context.shipping_address.postal_code,
    countryCode: context.shipping_address.country_code,
  }

  const shippingOptions = await getFulfillmentOptions(
    token,
    baseUrl,
    credentials.account_id,
    originAddress,
    destinationAddress,
    context.shipping_address.company !== undefined && context.shipping_address.company !== ''
      ? true
      : false,
    [option],
    credentials.enable_logs ? logger : undefined,
  )

  const fulfillmentOptionsDimensions = shippingOptions
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
  const dimensionDivisor = credentials.item_dimensions_unit === 'mm' ? 10 : 1
  const weightMultiplier = credentials.item_weight_unit === 'kg' ? 1000 : 1
  const itemDimensions = context.items.map(
    (item: CartLineItemDTO & { variant?: ProductVariantDTO }) => {
      return {
        weight: (item.variant?.weight ?? 0) * weightMultiplier,
        height: (item.variant?.height ?? 0) / dimensionDivisor,
        width: (item.variant?.width ?? 0) / dimensionDivisor,
        length: (item.variant?.length ?? 0) / dimensionDivisor,
        quantity: Number(item.quantity),
      }
    },
  )

  if (credentials.enable_logs) {
    logger.info(
      `API pricing: item dimensions (after conversion): ${JSON.stringify(itemDimensions, null, 2)}`,
    )
  }

  // Calculate the best shipping option using bin packing
  const bestFulfillment = calculateBestFulfillment(itemDimensions, fulfillmentOptionsDimensions)

  if (bestFulfillment.length === 0) {
    logger.error('DHL rate quote: no suitable fulfillment options found')
    throw new Error('No suitable shipping options found for the items')
  }

  if (credentials.enable_logs) {
    logger.info(
      `API pricing: best fulfillment packages: ${bestFulfillment.map((f) => `${f.quantity}x ${f.fulfillmentOption.key} @ €${(f.fulfillmentOption.price / 100).toFixed(2)}`).join(', ')}`,
    )
  }

  // Calculate total price from all required packages
  const totalPrice = bestFulfillment.reduce((sum, { fulfillmentOption, quantity }) => {
    return sum + fulfillmentOption.price * quantity
  }, 0)

  if (credentials.enable_logs) {
    logger.info(`API pricing: total price = €${(totalPrice / 100).toFixed(2)} (raw: ${totalPrice})`)
  }

  return {
    calculated_amount: totalPrice,
    is_calculated_price_tax_inclusive: true,
  }
}

/**
 * Calculates the best fulfillment for API mode and returns the parcel type key.
 * Used by manual pricing to determine which parcel type rate to look up.
 *
 * @param params The calculation parameters.
 * @returns The best fulfillment result with parcel type keys.
 */
export async function getBestFulfillmentForManualPricing(params: CalculatePriceApiParams): Promise<
  {
    parcelTypeKey: string
    quantity: number
  }[]
> {
  const { credentials, baseUrl, optionData, context, logger } = params

  const token = await getAuthToken(
    baseUrl,
    credentials.user_id,
    credentials.api_key,
    credentials.account_id,
  )

  const option = typeof optionData?.carrier_key === 'string' ? optionData.carrier_key : 'DOOR'

  if (!context.items || context.items.length === 0) {
    throw new Error('Cart is empty')
  }

  if (!context.shipping_address?.postal_code || !context.shipping_address?.country_code) {
    throw new Error('Missing shipping address in context')
  }

  if (
    !context.from_location?.address?.postal_code ||
    !context.from_location?.address?.country_code
  ) {
    throw new Error('Missing store address in context')
  }

  const originAddress: DHLFulfillmentOptionAddress = {
    postalCode: context.from_location.address.postal_code,
    countryCode: context.from_location.address.country_code,
  }

  const destinationAddress: DHLFulfillmentOptionAddress = {
    postalCode: context.shipping_address.postal_code,
    countryCode: context.shipping_address.country_code,
  }

  const shippingOptions = await getFulfillmentOptions(
    token,
    baseUrl,
    credentials.account_id,
    originAddress,
    destinationAddress,
    context.shipping_address.company !== undefined && context.shipping_address.company !== ''
      ? true
      : false,
    [option],
    credentials.enable_logs ? logger : undefined,
  )

  const fulfillmentOptionsDimensions = shippingOptions
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
          price: 0, // Price doesn't matter for manual pricing lookup
        }
      }
      return undefined
    })
    .filter((opt): opt is NonNullable<typeof opt> => opt !== undefined)

  const dimensionDivisor = credentials.item_dimensions_unit === 'mm' ? 10 : 1
  const weightMultiplier = credentials.item_weight_unit === 'kg' ? 1000 : 1
  const itemDimensions = context.items.map(
    (item: CartLineItemDTO & { variant?: ProductVariantDTO }) => {
      return {
        weight: (item.variant?.weight ?? 0) * weightMultiplier,
        height: (item.variant?.height ?? 0) / dimensionDivisor,
        width: (item.variant?.width ?? 0) / dimensionDivisor,
        length: (item.variant?.length ?? 0) / dimensionDivisor,
        quantity: Number(item.quantity),
      }
    },
  )

  const bestFulfillment = calculateBestFulfillment(itemDimensions, fulfillmentOptionsDimensions)

  return bestFulfillment.map(({ fulfillmentOption, quantity }) => ({
    parcelTypeKey: fulfillmentOption.key,
    quantity,
  }))
}
