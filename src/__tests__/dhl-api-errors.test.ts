import { afterEach, describe, it, expect, vi } from 'vitest'
import { getAuthToken } from '../dhl-api/auth'
import { getShipmentStatusesByTrackerCodes } from '../dhl-api/get-shipment-statuses-by-tracker-codes'

const mockFetch = (response: Response) => {
  const fetchMock = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getAuthToken', () => {
  it('reports the HTTP status when DHL rejects the credentials with an empty body', async () => {
    mockFetch(new Response('', { status: 401, statusText: 'Unauthorized' }))

    await expect(getAuthToken('https://dhl.test', 'user', 'key', 'account')).rejects.toThrow(
      /^DHL auth request failed \(check the credentials saved in the admin DHL settings.*\) \[401 Unauthorized\]$/,
    )
  })

  it('returns the access token on success', async () => {
    mockFetch(
      new Response(JSON.stringify({ accessToken: 'token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(getAuthToken('https://dhl.test', 'user', 'key', 'account')).resolves.toBe('token')
  })
})

describe('getShipmentStatusesByTrackerCodes', () => {
  it('sends all tracker codes as one comma-separated key', async () => {
    const fetchMock = mockFetch(
      new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )

    await getShipmentStatusesByTrackerCodes('https://dhl.test', 'token', ['A1', 'B2'])

    expect(fetchMock).toHaveBeenCalledWith(
      'https://dhl.test/track-trace?key=A1%2CB2&role=shipper',
      expect.anything(),
    )
  })

  it('includes the status and JSON body in the error', async () => {
    mockFetch(
      new Response(JSON.stringify({ message: 'Invalid key' }), {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(
      getShipmentStatusesByTrackerCodes('https://dhl.test', 'token', ['A1']),
    ).rejects.toThrow(
      'DHL get shipment statuses by tracker codes failed [400 Bad Request]: {"message":"Invalid key"}',
    )
  })
})
