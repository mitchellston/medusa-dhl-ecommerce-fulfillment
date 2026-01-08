import { Logger } from '@medusajs/framework/types'
import { Api } from './swagger/Api'
import { DHLShipmentOption } from './types'

/**
 * Get the DHL shipment options from /shipment-options/business.
 *
 * This endpoint returns the available shipment option keys (e.g., DOOR, PS, EXP)
 * for a given account. These are used as Medusa fulfillment options.
 *
 * @param token - The DHL API authentication token.
 * @param baseUrl - The base URL for the DHL API.
 * @param accountNumber - The DHL account number.
 * @param logger - Optional logger instance.
 * @returns The DHL shipment options.
 */
export const getShipmentOptions = async (
  token: string,
  baseUrl: string,
  accountNumber: string,
  logger?: Logger,
): Promise<DHLShipmentOption[]> => {
  const api = new Api({
    baseUrl: baseUrl,
    baseApiParams: { headers: { Authorization: `Bearer ${token}` } },
  })

  const response = await api.shipmentOptions.shipmentOptionsBusiness({
    accountNumber: [accountNumber],
  })

  if (!response.ok) {
    const text = await response.text()
    if (logger) {
      logger.error(`DHL shipment options failed [${response.status}]: ${text}`)
    }
    throw new Error(`DHL shipment options failed: ${response.statusText}`)
  }

  const result = response.data
  if (logger) {
    logger.debug('DHL shipment options response: \n' + JSON.stringify(result, null, 2))
  }

  return result
}
