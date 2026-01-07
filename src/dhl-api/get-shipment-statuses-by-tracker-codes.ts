import { Logger } from '@medusajs/framework/types'
import { DHLShipmentStatusResponse } from './types'
import { Api } from './swagger/Api'

/**
 * Gets the shipment statuses by tracker codes from the DHL API.
 *
 * @param baseUrl - The base URL of the DHL API.
 * @param token - The Bearer token used for authentication with the DHL API.
 * @param trackerCodes - An array of tracker codes to get the shipment statuses for.
 * @param logger - (Optional) Logger instance for logging debug and error information.
 * @returns A promise that resolves to an array of DHLShipmentStatusResponse objects.
 * @throws Will throw an error if the DHL API request fails or returns a non-OK response.
 */
export const getShipmentStatusesByTrackerCodes = async (
  baseUrl: string,
  token: string,
  trackerCodes: string[],
  logger?: Logger | Console,
): Promise<DHLShipmentStatusResponse[]> => {
  const api = new Api({
    baseUrl: baseUrl,
    baseApiParams: { headers: { Authorization: `Bearer ${token}` } },
  })

  const response = await api.trackTrace.getTrackAndTrace({
    key: trackerCodes,
    role: 'shipper',
  })

  if (!response.ok) {
    const text = await response.text()
    if (logger) {
      logger.error(
        `DHL get shipment statuses by tracker codes failed [${response.status}]: ${text}`,
      )
    }
    throw new Error(`DHL get shipment statuses by tracker codes failed: ${response.statusText}`)
  }
  const result = response.data
  if (logger) {
    logger.log(
      `DHL get shipment statuses by tracker codes response: ${JSON.stringify(result, null, 2)}`,
    )
  }

  return result
}
