import {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceDTO,
  CartLineItemDTO,
  Logger,
  ProductVariantDTO,
} from '@medusajs/framework/types'
import { SetupCredentialsInput } from '../../api/admin/dhl/route'
import { getBestFulfillmentForManualPricing } from './calculate-price-api'
import getDhlRateWorkflow, { getConfiguredRateTypesWorkflow } from '../../workflows/get-rate'

type CalculatePriceManualParams = {
  credentials: SetupCredentialsInput
  baseUrl: string
  optionData: CalculateShippingOptionPriceDTO['optionData']
  context: CalculateShippingOptionPriceDTO['context']
  logger: Logger
}

/**
 * Calculates the total weight of items in the cart in kg.
 */
function calculateTotalWeightKg(
  items: CalculateShippingOptionPriceDTO['context']['items'],
  weightUnit: 'g' | 'kg',
): number {
  if (!items) return 0

  const weightDivisor = weightUnit === 'g' ? 1000 : 1

  return items.reduce((total, item: CartLineItemDTO & { variant?: ProductVariantDTO }) => {
    const weight = (item.variant?.weight ?? 0) / weightDivisor
    return total + weight * Number(item.quantity)
  }, 0)
}

/**
 * Calculates shipping price using manually configured rates.
 * This is the manual pricing mode for customers without API pricing access.
 *
 * The function determines the appropriate rate lookup method based on
 * what rates are configured in the database for the shipping option and country:
 * - Parcel type-based: Uses bin packing to determine parcel type, then looks up rate
 * - Weight-based: Calculates total weight and finds the smallest applicable bracket
 *
 * @param params The calculation parameters.
 * @returns The calculated shipping price.
 */
export async function calculatePriceManual(
  params: CalculatePriceManualParams,
): Promise<CalculatedShippingOptionPrice> {
  const { credentials, baseUrl, optionData, context, logger } = params

  const shippingOptionKey =
    typeof optionData?.carrier_key === 'string' ? optionData.carrier_key : 'DOOR'

  if (!context.items || context.items.length === 0) {
    throw new Error('Cart is empty')
  }

  if (!context.shipping_address?.country_code) {
    throw new Error('Missing shipping address country code in context')
  }

  const countryCode = context.shipping_address.country_code.toUpperCase()

  // Determine rate type from configured rates in the database
  // This replaces the hardcoded mapping and uses actual configured rates
  const { result: configuredRateTypes } = await getConfiguredRateTypesWorkflow().run({
    input: {
      shippingOptionKey,
      countryCode,
    },
  })

  if (!configuredRateTypes.hasParcelTypeRates && !configuredRateTypes.hasWeightRates) {
    throw new Error(
      `No rates configured for shipping option "${shippingOptionKey}" to ${countryCode}. ` +
        `Please configure manual rates in the DHL settings.`,
    )
  }

  // If both rate types are configured, prefer parcel_type as it's more precise
  // If only one type is configured, use that one
  const rateType: 'parcel_type' | 'weight' = configuredRateTypes.hasParcelTypeRates
    ? 'parcel_type'
    : 'weight'

  if (credentials.enable_logs) {
    logger.info(
      `Manual pricing: determined rate type "${rateType}" for ${shippingOptionKey} to ${countryCode} ` +
        `(parcel_type rates: ${configuredRateTypes.hasParcelTypeRates}, weight rates: ${configuredRateTypes.hasWeightRates})`,
    )
  }

  if (rateType === 'weight') {
    // Weight-based pricing lookup
    const totalWeightKg = calculateTotalWeightKg(context.items, credentials.item_weight_unit)

    if (credentials.enable_logs) {
      logger.info(
        `Manual pricing: weight-based lookup for ${shippingOptionKey} to ${countryCode}, weight: ${totalWeightKg}kg`,
      )
    }

    const { result: rate } = await getDhlRateWorkflow().run({
      input: {
        type: 'weight',
        shippingOptionKey,
        countryCode,
        weightKg: totalWeightKg,
      },
    })

    if (!rate) {
      throw new Error(
        `No rate configured for shipping option "${shippingOptionKey}" to ${countryCode} ` +
          `for weight ${totalWeightKg}kg. Please configure manual rates.`,
      )
    }

    if (credentials.enable_logs) {
      logger.info(
        `Manual pricing: weight rate found - max_weight_kg: ${rate.max_weight_kg}, price: ${rate.price}`,
      )
    }

    return {
      calculated_amount: Number(rate.price),
      is_calculated_price_tax_inclusive: true,
    }
  }

  // Parcel type-based pricing lookup
  // Use the bin packing algorithm to determine the best parcel type(s)
  const bestFulfillment = await getBestFulfillmentForManualPricing({
    credentials,
    baseUrl,
    optionData,
    context,
    logger,
  })

  if (bestFulfillment.length === 0) {
    throw new Error('No suitable parcel types found for the items')
  }

  if (credentials.enable_logs) {
    logger.info(
      `Manual pricing: parcel type-based lookup for ${shippingOptionKey} to ${countryCode}, ` +
        `parcels: ${bestFulfillment.map((f) => `${f.quantity}x ${f.parcelTypeKey}`).join(', ')}`,
    )
  }

  // Calculate total price by looking up each parcel type rate
  let totalPrice = 0

  for (const { parcelTypeKey, quantity } of bestFulfillment) {
    const { result: rate } = await getDhlRateWorkflow().run({
      input: {
        type: 'parcel_type',
        shippingOptionKey,
        countryCode,
        parcelTypeKey,
      },
    })

    if (!rate) {
      throw new Error(
        `No rate configured for shipping option "${shippingOptionKey}" to ${countryCode} ` +
          `for parcel type "${parcelTypeKey}". Please configure manual rates.`,
      )
    }

    if (credentials.enable_logs) {
      logger.info(
        `Manual pricing: ${parcelTypeKey} rate = ${rate.price}, quantity = ${quantity}, subtotal = ${Number(rate.price) * quantity}`,
      )
    }

    totalPrice += Number(rate.price) * quantity
  }

  if (credentials.enable_logs) {
    logger.info(`Manual pricing: total price = ${totalPrice}`)
  }

  return {
    calculated_amount: totalPrice,
    is_calculated_price_tax_inclusive: true,
  }
}
