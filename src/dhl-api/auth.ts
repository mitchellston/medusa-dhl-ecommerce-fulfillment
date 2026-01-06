import { Api } from './swagger/Api'

/**
 * Get the DHL authentication token.
 * @param baseUrl - The base URL for the DHL API.
 * @param userId - The DHL user ID.
 * @param apiKey - The DHL api key.
 * @param accountNumber - The DHL account number.
 * @returns The DHL authentication token.
 */
export const getAuthToken = async (
  baseUrl: string,
  userId: string,
  apiKey: string,
  accountNumber: string,
): Promise<string> => {
  const api = new Api({ baseUrl: baseUrl })

  if (!userId) {
    throw new Error('DHL user ID is required in database settings')
  }
  if (!apiKey) {
    throw new Error('DHL api key is required in database settings')
  }
  if (!accountNumber) {
    throw new Error('DHL account number is required in database settings')
  }

  const response = await api.authenticate.apiKey({
    userId: userId,
    key: apiKey,
    accountNumbers: [accountNumber],
  })

  if (!response.ok) {
    throw new Error(`DHL auth request failed: ${response.statusText}`)
  }

  const { accessToken } = response.data
  return accessToken
}
