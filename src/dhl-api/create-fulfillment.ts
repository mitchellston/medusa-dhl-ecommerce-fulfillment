import { MedusaError } from '@medusajs/framework/utils'
import { DHLClient } from './client'
import {
  DHLAddress,
  DHLCreateLabelRequest,
  DHLCreateLabelResponse,
  DHLPiece,
  DHLShipmentOption,
} from './types'

export type CreateFulfillmentInput = {
  orderReference?: string
  shipper: {
    firstName: string
    lastName: string
    companyName?: string
    street: string
    number?: string
    addition?: string
    postalCode: string
    city: string
    countryCode: string
    email?: string
    phoneNumber?: string
  }
  receiver: {
    firstName: string
    lastName: string
    companyName?: string
    street: string
    number?: string
    addition?: string
    postalCode: string
    city: string
    countryCode: string
    email?: string
    phoneNumber?: string
  }
  pieces: {
    parcelType?: string
    quantity: number
    weight?: number // in kg
    dimensions?: {
      length: number
      width: number
      height: number
    }
  }[]
  options?: {
    key: string
    input?: string
  }[]
  product?: string
  returnLabel?: boolean
}

/**
 * Convert our internal address format to DHL API format
 */
function toDHLAddress(address: CreateFulfillmentInput['shipper']): DHLAddress {
  return {
    name: {
      firstName: address.firstName,
      lastName: address.lastName,
      companyName: address.companyName,
    },
    address: {
      countryCode: address.countryCode.toUpperCase(),
      postalCode: address.postalCode,
      city: address.city,
      street: address.street,
      number: address.number,
      addition: address.addition,
      isBusiness: !!address.companyName,
    },
    email: address.email,
    phoneNumber: address.phoneNumber,
  }
}

/**
 * Convert pieces to DHL format
 */
function toDHLPieces(pieces: CreateFulfillmentInput['pieces']): DHLPiece[] {
  return pieces.map((piece) => ({
    parcelType: piece.parcelType || 'SMALL', // Default parcel type
    quantity: piece.quantity,
    weight: piece.weight,
    dimensions: piece.dimensions,
  }))
}

/**
 * Create a DHL eCommerce fulfillment (shipping label)
 *
 * API Endpoint: POST https://api-gw.dhlparcel.nl/labels
 * Documentation: https://api-gw.dhlparcel.nl/docs/#/Labels
 *
 * @param client - DHL API client instance
 * @param input - Fulfillment input data
 * @returns DHL label response with tracking codes
 */
export async function createFulfillment(
  client: DHLClient,
  input: CreateFulfillmentInput,
): Promise<DHLCreateLabelResponse> {
  // Validate required fields
  if (!input.receiver) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      'Receiver address is required for DHL fulfillment',
    )
  }

  if (!input.shipper) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      'Shipper address is required for DHL fulfillment',
    )
  }

  if (!input.pieces?.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      'At least one piece is required for DHL fulfillment',
    )
  }

  // Build the label request
  const labelRequest: Omit<DHLCreateLabelRequest, 'accountId'> = {
    orderReference: input.orderReference,
    receiver: toDHLAddress(input.receiver),
    shipper: toDHLAddress(input.shipper),
    pieces: toDHLPieces(input.pieces),
    options: input.options as DHLShipmentOption[],
    product: input.product,
    returnLabel: input.returnLabel,
  }

  // Create the label via DHL API
  const response = await client.createLabel(labelRequest)

  return response
}

/**
 * Create a return label for an existing shipment
 */
export async function createReturnLabel(
  client: DHLClient,
  input: Omit<CreateFulfillmentInput, 'returnLabel'>,
): Promise<DHLCreateLabelResponse> {
  return createFulfillment(client, {
    ...input,
    // Swap shipper and receiver for return label
    shipper: input.receiver,
    receiver: input.shipper,
    returnLabel: true,
    options: [...(input.options || []), { key: 'ADD_RETURN_LABEL' }],
  })
}
