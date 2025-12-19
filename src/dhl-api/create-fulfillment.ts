import { MedusaError } from '@medusajs/framework/utils'
import { randomUUID } from 'crypto'
import { DHLClient } from './client'
import {
  DHLAddress,
  DHLCreateLabelRequest,
  DHLCreateLabelResponse,
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

  // Root-level fields: DHL requires parcelTypeKey and commonly uses quantity/weight at root.
  // For multi-piece shipments, we also send `pieces`.
  const firstPiece = input.pieces[0]
  const parcelTypeKey = firstPiece.parcelType || 'SMALL'

  const totalQuantity = input.pieces.reduce((sum, p) => sum + Number(p.quantity || 0), 0)
  const totalWeight = input.pieces.reduce((sum, p) => sum + Number(p.weight || 0), 0)

  // Build the label request with all required root-level fields
  const labelRequest: Omit<DHLCreateLabelRequest, 'accountId'> = {
    labelId: randomUUID(), // Required: Generate a unique label ID
    labelFormat: 'pdf',
    orderReference: input.orderReference,
    parcelTypeKey, // Required: Parcel type at root level
    receiver: toDHLAddress(input.receiver),
    shipper: toDHLAddress(input.shipper),
    options: (input.options as DHLShipmentOption[]) || [], // Required: Must be an array
    returnLabel: input.returnLabel,
    quantity: totalQuantity > 0 ? totalQuantity : firstPiece.quantity,
    weight: totalWeight > 0 ? totalWeight : firstPiece.weight,
    product: input.product,
  }

  // Add pieces for multi-piece shipments (multi-collo).
  if (input.pieces.length > 1) {
    labelRequest.pieces = input.pieces.map((p) => ({
      parcelType: p.parcelType || parcelTypeKey,
      quantity: p.quantity,
      weight: p.weight,
      dimensions: p.dimensions,
    }))
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
