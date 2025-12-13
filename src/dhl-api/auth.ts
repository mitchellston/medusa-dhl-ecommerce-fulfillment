import { MedusaError } from '@medusajs/framework/utils'
import { DHLAuthResponse, DHLErrorResponse } from './types'

const DHL_API_BASE_URL = 'https://api-gw.dhlparcel.nl'

export type DHLAuthCredentials = {
  userId: string
  key: string
}

let cachedToken: {
  accessToken: string
  expiresAt: number
} | null = null

export async function getAccessToken(credentials: DHLAuthCredentials): Promise<string> {
  // Check if we have a valid cached token (with 5 minute buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.accessToken
  }

  const response = await fetch(`${DHL_API_BASE_URL}/authenticate/api-key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      userId: credentials.userId,
      key: credentials.key,
    }),
  })

  if (!response.ok) {
    const error = (await response.json()) as DHLErrorResponse
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `DHL Authentication failed (${response.status}): ${error.message || response.statusText}`,
    )
  }

  const data = (await response.json()) as DHLAuthResponse

  // Cache the token
  cachedToken = {
    accessToken: data.accessToken,
    expiresAt: data.accessTokenExpiration,
  }

  return data.accessToken
}

export function clearTokenCache(): void {
  cachedToken = null
}
