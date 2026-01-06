import { Logger } from '@medusajs/framework/types'
import { Api } from './swagger/Api'
import { DHLAddress, DHLFulfillmentOptionAddress } from './types'

/**
 * Get the DHL fulfillment options.
 * @param token - The DHL API authentication token.
 * @param baseUrl - The base URL for the DHL API.
 * @param accountNumber - The DHL account number.
 * @param fromCountry - The sender's country.
 * @param fromPostalCode - The sender's postal code.
 * @param toCountry - The receiver's country.
 * @param toPostalCode - The receiver's postal code.
 * @param toBusiness - Is being shipped to a business.
 * @param options - The options (DOOR, BOUW, etc.)
 * @param logger - The logger instance.
 * @returns The DHL fulfillment options.
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
