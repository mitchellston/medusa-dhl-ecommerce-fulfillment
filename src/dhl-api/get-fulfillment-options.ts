import { DHLClient } from './client'
import { DHLCapabilitiesResponse, DHLCapability } from './types'

export type FulfillmentOption = {
  id: string
  name: string
  product_key: string
  product_code: string
  parcel_type: string
  min_weight_kg: number
  max_weight_kg: number
  options: {
    key: string
    description: string
    input_type?: string
  }[]
}

/**
 * Get available fulfillment options from DHL eCommerce
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

  return mapCapabilitiesToFulfillmentOptions(capabilities)
}

/**
 * Map DHL capabilities response to fulfillment options
 */
function mapCapabilitiesToFulfillmentOptions(
  capabilities: DHLCapabilitiesResponse,
): FulfillmentOption[] {
  return capabilities.map((capability: DHLCapability) => ({
    id: `${capability.product.key}__${capability.parcelType.key}`,
    name: capability.product.label,
    product_key: capability.product.key,
    product_code: capability.product.code,
    parcel_type: capability.parcelType.key,
    min_weight_kg: capability.parcelType.minWeightKg,
    max_weight_kg: capability.parcelType.maxWeightKg,
    options: capability.options.map((opt) => ({
      key: opt.key,
      description: opt.description,
      input_type: opt.inputType,
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
