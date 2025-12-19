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

export type PackageConstraints = {
  /** Package (piece) weight in kg */
  weight_kg: number
  /** Optional package dimensions (cm). When omitted, dimension validation is skipped. */
  dimensions_cm?: { length: number; width: number; height: number }
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

function sort3(a: number, b: number, c: number): [number, number, number] {
  const s = [a, b, c].sort((x, y) => x - y)
  return [s[0], s[1], s[2]]
}

function dimsFit(
  capDims: { maxLengthCm: number; maxWidthCm: number; maxHeightCm: number } | undefined,
  pkgDims: { length: number; width: number; height: number } | undefined,
): boolean {
  if (!capDims || !pkgDims) return true
  const cap = sort3(capDims.maxLengthCm, capDims.maxWidthCm, capDims.maxHeightCm)
  const pkg = sort3(pkgDims.length, pkgDims.width, pkgDims.height)
  return pkg[0] <= cap[0] && pkg[1] <= cap[1] && pkg[2] <= cap[2]
}

/**
 * Select a parcel type key from DHL capabilities that can handle the given packages.
 *
 * Rules:
 * - Weight constraints are validated against the *heaviest* package (piece), since DHL parcel types apply per piece.
 * - Dimension constraints (when present in capabilities and provided by caller) are validated against the *largest* package dims.
 * - If no parcel type satisfies constraints, returns undefined (caller can soft-fallback).
 */
export function selectParcelTypeForPackagesFromCapabilities(
  capabilities: DHLCapabilitiesResponse,
  productKey: string | undefined,
  packages: PackageConstraints[],
): string | undefined {
  if (!capabilities?.length) return undefined
  if (!packages?.length) return undefined

  const relevant = productKey
    ? capabilities.filter((c) => c.product.key === productKey)
    : capabilities
  if (!relevant.length) return undefined

  const maxWeightKg = Math.max(...packages.map((p) => p.weight_kg || 0))

  // If any package has dimensions, enforce dims against the “max dims” package.
  const packagesWithDims = packages.filter((p) => p.dimensions_cm)
  const maxDims =
    packagesWithDims.length > 0
      ? {
          length: Math.max(...packagesWithDims.map((p) => p.dimensions_cm!.length)),
          width: Math.max(...packagesWithDims.map((p) => p.dimensions_cm!.width)),
          height: Math.max(...packagesWithDims.map((p) => p.dimensions_cm!.height)),
        }
      : undefined

  // Find smallest suitable parcel type by maxWeightKg (ascending)
  const sorted = [...relevant].sort((a, b) => a.parcelType.maxWeightKg - b.parcelType.maxWeightKg)

  const suitable = sorted.find((c: DHLCapability) => {
    const minW = c.parcelType.minWeightKg
    const maxW = c.parcelType.maxWeightKg
    if (typeof maxWeightKg === 'number' && maxWeightKg > 0) {
      if (maxWeightKg < minW || maxWeightKg > maxW) return false
    }
    if (!dimsFit(c.parcelType.dimensions, maxDims)) return false
    return true
  })

  return suitable?.parcelType?.key
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
