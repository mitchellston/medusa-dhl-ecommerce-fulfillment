import { MedusaError } from '@medusajs/framework/utils'
import { getAccessToken, DHLAuthCredentials } from './auth'
import {
  DHLCreateLabelRequest,
  DHLCreateLabelResponse,
  DHLCapabilitiesResponse,
  DHLTrackingResponse,
  DHLErrorResponse,
} from './types'

const DHL_API_BASE_URL = 'https://api-gw.dhlparcel.nl'

export type DHLClientOptions = {
  userId: string
  key: string
  accountId: string
  enableLogs?: boolean
}

export class DHLClient {
  private credentials: DHLAuthCredentials
  private accountId: string
  private enableLogs: boolean

  constructor(options: DHLClientOptions) {
    this.credentials = {
      userId: options.userId,
      key: options.key,
    }
    this.accountId = options.accountId
    this.enableLogs = options.enableLogs ?? false
  }

  private async sendRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${DHL_API_BASE_URL}${endpoint}`

    // Log request details for debugging (mask sensitive data)
    if (this.enableLogs) {
      console.log('[DHL API] Request:', {
        url,
        method: options?.method || 'GET',
        userId: this.credentials.userId ? `${this.credentials.userId.slice(0, 4)}...` : '(empty)',
        apiKey: this.credentials.key ? `${this.credentials.key.slice(0, 4)}...` : '(empty)',
        accountId: this.accountId || '(empty)',
      })
    }

    const accessToken = await getAccessToken(this.credentials)

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })

    const contentType = response.headers.get('content-type')

    if (!response.ok) {
      let errorMessage = response.statusText
      let errorDetails = ''

      if (contentType?.includes('application/json')) {
        const error = (await response.json()) as DHLErrorResponse
        errorMessage =
          error.message || error.errors?.map((e) => e.message).join(', ') || errorMessage
        errorDetails = JSON.stringify(error, null, 2)
      }

      if (this.enableLogs) {
        console.error('[DHL API] Error Response:', {
          status: response.status,
          statusText: response.statusText,
          url,
          errorDetails,
        })
      }

      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `DHL API error (${response.status}): ${errorMessage}`,
      )
    }

    if (contentType?.includes('application/json')) {
      return (await response.json()) as T
    }

    return (await response.text()) as unknown as T
  }

  /**
   * Get available shipping capabilities/options for a route
   * @param fromCountry - ISO country code (e.g., "NL")
   * @param toCountry - ISO country code (e.g., "NL", "DE")
   * @param toBusiness - Whether the receiver is a business (default: true)
   */
  async getCapabilities(
    fromCountry: string,
    toCountry: string,
    toBusiness = true,
  ): Promise<DHLCapabilitiesResponse> {
    const params = new URLSearchParams({
      fromCountry,
      toCountry,
      toBusiness: String(toBusiness),
      accountNumber: this.accountId,
    })
    return this.sendRequest<DHLCapabilitiesResponse>(`/capabilities/business?${params.toString()}`)
  }

  /**
   * Create a shipping label
   */
  async createLabel(
    data: Omit<DHLCreateLabelRequest, 'accountId'>,
  ): Promise<DHLCreateLabelResponse> {
    return this.sendRequest<DHLCreateLabelResponse>('/labels', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        accountId: this.accountId,
      }),
    })
  }

  /**
   * Get label PDF by label ID
   */
  async getLabelPdf(labelId: string): Promise<string> {
    const accessToken = await getAccessToken(this.credentials)

    const response = await fetch(`${DHL_API_BASE_URL}/labels/${labelId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/pdf',
      },
    })

    if (!response.ok) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Failed to retrieve DHL label PDF: ${response.statusText}`,
      )
    }

    const buffer = await response.arrayBuffer()
    return Buffer.from(buffer).toString('base64')
  }

  /**
   * Track a shipment
   * @param trackerCode - The tracker code from label creation
   * @param postalCode - Receiver's postal code
   */
  async trackShipment(trackerCode: string, postalCode: string): Promise<DHLTrackingResponse> {
    const key = encodeURIComponent(`${trackerCode}+${postalCode}`)
    return this.sendRequest<DHLTrackingResponse>(`/track-trace?key=${key}`)
  }

  /**
   * Get shipment options available
   */
  async getShipmentOptions(): Promise<{ key: string; description: string }[]> {
    return this.sendRequest<{ key: string; description: string }[]>('/shipment-options')
  }
}
