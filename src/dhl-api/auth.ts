import { Api, HttpResponse } from './swagger/Api'

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

  const response = await api.authenticate
    .apiKey({
      userId: userId,
      key: apiKey,
      accountNumbers: [accountNumber],
    })
    .catch((error: unknown) => {
      const hint =
        isHttpResponse(error) && (error.status === 401 || error.status === 403)
          ? ' (check the credentials saved in the admin DHL settings; they take precedence over the provider options)'
          : ''
      throw toDhlApiError(`DHL auth request failed${hint}`, error)
    })

  const { accessToken } = response.data
  return accessToken
}

const isHttpResponse = (error: unknown): error is HttpResponse<unknown, unknown> =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as { status?: unknown }).status === 'number'

/**
 * The generated swagger client throws the raw Response on non-2xx, which
 * serializes to `{"data":null,"error":{}}` and hides the status. Turn it into
 * an Error that carries the HTTP status and (truncated) response body.
 */
export const toDhlApiError = (prefix: string, error: unknown): Error => {
  if (error instanceof Error) {
    return error
  }
  if (isHttpResponse(error)) {
    // `error` is the parsed JSON body, or the parse Error when the body isn't JSON (e.g. empty 401s).
    const parsedBody = error.error
    const body =
      parsedBody === null || parsedBody === undefined || parsedBody instanceof Error
        ? ''
        : typeof parsedBody === 'string'
          ? parsedBody
          : JSON.stringify(parsedBody)
    const detail = body ? `: ${body.slice(0, 500)}` : ''
    return new Error(`${prefix} [${error.status} ${error.statusText}]${detail}`)
  }
  return new Error(`${prefix}: ${String(error)}`)
}
