import { DHLClient } from './client'
import { DHLCapabilitiesResponse, DHLCapability } from './types'

/**
 * Countries supported by DHL Parcel NL for shipping
 * Includes Netherlands and major EU destinations
 */
export const DHL_SUPPORTED_COUNTRIES = [
  'NL', // Netherlands (domestic)
  'BE', // Belgium
  'DE', // Germany
  'FR', // France
  'LU', // Luxembourg
  'AT', // Austria
  'ES', // Spain
  'IT', // Italy
  'PT', // Portugal
  'PL', // Poland
  'CZ', // Czech Republic
  'DK', // Denmark
  'SE', // Sweden
  'FI', // Finland
  'IE', // Ireland
  'GB', // United Kingdom
] as const

export type SupportedCountry = (typeof DHL_SUPPORTED_COUNTRIES)[number]

export type FulfillmentOption = {
  id: string
  name: string
  product_key: string
  product_code: string
  parcel_type: string
  min_weight_kg: number
  max_weight_kg: number
  price?: {
    with_tax?: number
    without_tax?: number
    vat_rate?: number
    currency?: string
  }
  supported_countries: string[]
  options: {
    key: string
    description: string
    input_type?: string
    price?: {
      with_tax?: number
      without_tax?: number
      vat_rate?: number
      currency?: string
    }
  }[]
}

/**
 * Parcel type weight ranges for automatic selection
 */
export type ParcelTypeConfig = {
  key: string
  min_weight_kg: number
  max_weight_kg: number
}

/**
 * Get available fulfillment options from DHL eCommerce for a single route
 *
 * API Endpoint: GET https://api-gw.dhlparcel.nl/capabilities/business
 * Documentation: https://api-gw.dhlparcel.nl/docs/#/Capabilities
 *
 * @param client - DHL API client instance
 * @param fromCountry - Origin country code (e.g., "NL")
 * @param toCountry - Destination country code (e.g., "NL", "DE", "BE")
 * @param toBusiness - Whether the receiver is a business (default: true)
 */
export async function getFulfillmentOptions(
  client: DHLClient,
  fromCountry: string,
  toCountry: string,
  toBusiness = true,
): Promise<FulfillmentOption[]> {
  const capabilities = await client.getCapabilities(fromCountry, toCountry, toBusiness)

  return mapCapabilitiesToFulfillmentOptions(capabilities, [toCountry])
}

/**
 * Get available fulfillment options for all supported destination countries
 * Deduplicates options that are available across multiple countries
 *
 * @param client - DHL API client instance
 * @param fromCountry - Origin country code (e.g., "NL")
 * @param toBusiness - Whether the receiver is a business (default: true)
 * @param toCountries - Optional array of specific countries to fetch (defaults to all supported)
 */
export async function getAllFulfillmentOptions(
  client: DHLClient,
  fromCountry: string,
  toBusiness = true,
  toCountries: string[] = [...DHL_SUPPORTED_COUNTRIES],
): Promise<FulfillmentOption[]> {
  // Fetch capabilities for all destination countries in parallel
  const capabilitiesPromises = toCountries.map(async (toCountry) => {
    try {
      const capabilities = await client.getCapabilities(fromCountry, toCountry, toBusiness)
      return { toCountry, capabilities }
    } catch {
      // If a country fails, continue with others
      return { toCountry, capabilities: [] as DHLCapabilitiesResponse }
    }
  })

  const results = await Promise.all(capabilitiesPromises)

  // Map to track unique options and their supported countries
  const optionsMap = new Map<string, FulfillmentOption>()

  for (const { toCountry, capabilities } of results) {
    for (const capability of capabilities) {
      const id = `${capability.product.key}__${capability.parcelType.key}`

      if (optionsMap.has(id)) {
        // Add country to existing option's supported countries
        const existing = optionsMap.get(id)!
        if (!existing.supported_countries.includes(toCountry)) {
          existing.supported_countries.push(toCountry)
        }
      } else {
        // Create new option
        optionsMap.set(id, {
          id,
          name: `${capability.product.label} (${capability.parcelType.key})`,
          product_key: capability.product.key,
          product_code: capability.product.code,
          parcel_type: capability.parcelType.key,
          min_weight_kg: capability.parcelType.minWeightKg,
          max_weight_kg: capability.parcelType.maxWeightKg,
          price: capability.parcelType.price
            ? {
                with_tax: capability.parcelType.price.withTax,
                without_tax: capability.parcelType.price.withoutTax,
                vat_rate: capability.parcelType.price.vatRate,
                currency: capability.parcelType.price.currency,
              }
            : undefined,
          supported_countries: [toCountry],
          options: capability.options.map((opt) => ({
            key: opt.key,
            description: opt.description,
            input_type: opt.inputType,
            price: opt.price
              ? {
                  with_tax: opt.price.withTax,
                  without_tax: opt.price.withoutTax,
                  vat_rate: opt.price.vatRate,
                  currency: opt.price.currency,
                }
              : undefined,
          })),
        })
      }
    }
  }

  return Array.from(optionsMap.values())
}

/**
 * Select the optimal parcel type based on total weight
 *
 * @param parcelTypes - Available parcel type configurations
 * @param weightKg - Total weight in kilograms
 * @returns The optimal parcel type key, or undefined if no suitable type found
 */
export function selectOptimalParcelType(
  parcelTypes: ParcelTypeConfig[],
  weightKg: number,
): string | undefined {
  // Sort by max weight ascending to find the smallest suitable parcel
  const sorted = [...parcelTypes].sort((a, b) => a.max_weight_kg - b.max_weight_kg)

  // Find the first parcel type that can handle the weight
  const suitable = sorted.find((pt) => weightKg >= pt.min_weight_kg && weightKg <= pt.max_weight_kg)

  return suitable?.key
}

/**
 * Get parcel type configurations for a specific product from fulfillment options
 *
 * @param options - Available fulfillment options
 * @param productKey - The product key to filter by
 * @returns Array of parcel type configurations for the product
 */
export function getParcelTypesForProduct(
  options: FulfillmentOption[],
  productKey: string,
): ParcelTypeConfig[] {
  return options
    .filter((opt) => opt.product_key === productKey)
    .map((opt) => ({
      key: opt.parcel_type,
      min_weight_kg: opt.min_weight_kg,
      max_weight_kg: opt.max_weight_kg,
    }))
}

/**
 * Map DHL capabilities response to fulfillment options
 */
function mapCapabilitiesToFulfillmentOptions(
  capabilities: DHLCapabilitiesResponse,
  supportedCountries: string[] = [],
): FulfillmentOption[] {
  return capabilities.map((capability: DHLCapability) => ({
    id: `${capability.product.key}__${capability.parcelType.key}`,
    name: `${capability.product.label} (${capability.parcelType.key})`,
    product_key: capability.product.key,
    product_code: capability.product.code,
    parcel_type: capability.parcelType.key,
    min_weight_kg: capability.parcelType.minWeightKg,
    max_weight_kg: capability.parcelType.maxWeightKg,
    price: capability.parcelType.price
      ? {
          with_tax: capability.parcelType.price.withTax,
          without_tax: capability.parcelType.price.withoutTax,
          vat_rate: capability.parcelType.price.vatRate,
          currency: capability.parcelType.price.currency,
        }
      : undefined,
    supported_countries: supportedCountries,
    options: capability.options.map((opt) => ({
      key: opt.key,
      description: opt.description,
      input_type: opt.inputType,
      price: opt.price
        ? {
            with_tax: opt.price.withTax,
            without_tax: opt.price.withoutTax,
            vat_rate: opt.price.vatRate,
            currency: opt.price.currency,
          }
        : undefined,
    })),
  }))
}

/**
 * Get all available shipment options (e.g., signature, evening delivery, etc.)
 */
export async function getShipmentOptions(
  client: DHLClient,
): Promise<{ key: string; description: string }[]> {
  return client.getShipmentOptions()
}
