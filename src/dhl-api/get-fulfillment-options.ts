import { Logger } from '@medusajs/framework/types'
import { Api } from './swagger/Api'
import { DHLAddress, DHLFulfillmentOptionAddress } from './types'

/**
 * Get DHL capabilities for pricing and bin-packing.
 *
 * This calls the DHL Capabilities API (/capabilities/business) to retrieve
 * parcel types and their pricing for a specific origin/destination pair.
 * Used for calculating shipping prices based on package dimensions.
 *
 * Note: For fetching available shipment option keys (DOOR, PS, etc.),
 * use `getShipmentOptions` from `./get-shipment-options.ts` instead.
 *
 * @param token - The DHL API authentication token.
 * @param baseUrl - The base URL for the DHL API.
 * @param accountNumber - The DHL account number.
 * @param sender - The sender's address (country code and postal code).
 * @param receiver - The receiver's address (country code and postal code).
 * @param toBusiness - Whether the shipment is to a business.
 * @param options - The shipment options to filter by (DOOR, BOUW, etc.)
 * @param logger - Optional logger instance.
 * @returns The DHL capabilities response with parcel types and pricing.
 */
export const getFulfillmentOptions = async (
  token: string,
  baseUrl: string,
  accountNumber: string,
  sender: DHLFulfillmentOptionAddress | DHLAddress,
  receiver: DHLFulfillmentOptionAddress | DHLAddress,
  toBusiness: boolean,
  options: string[],
  logger?: Logger,
) => {
  const api = new Api({
    baseUrl: baseUrl,
    baseApiParams: { headers: { Authorization: `Bearer ${token}` } },
  })

  const response = await api.capabilities.capabilitiesBusiness({
    accountNumber: [accountNumber],
    fromCountry: 'address' in sender ? sender.address.countryCode : sender.countryCode,
    toCountry: 'address' in receiver ? receiver.address.countryCode : receiver.countryCode,
    toBusiness: toBusiness,
    fromPostalCode: 'address' in sender ? sender.address.postalCode : sender.postalCode,
    toPostalCode: 'address' in receiver ? receiver.address.postalCode : receiver.postalCode,
    option: options,
  })

  if (!response.ok) {
    const text = await response.text()
    if (logger) {
      logger.error(`DHL capabilities failed [${response.status}]: ${text}`)
    }
    throw new Error(`DHL capabilities failed: ${response.statusText}`)
  }

  const result = response.data
  if (logger) {
    logger.debug('DHL capabilities response: \n' + JSON.stringify(result, null, 2))
  }
  return result
}
