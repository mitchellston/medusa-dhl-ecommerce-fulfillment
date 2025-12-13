import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from '@medusajs/framework/workflows-sdk'
import {
  StockLocationDTO,
  IStockLocationService,
  FulfillmentDTO,
  FulfillmentItemDTO,
  FulfillmentOrderDTO,
  ProductVariantDTO,
  CreateFulfillmentResult,
  IFulfillmentModuleService,
  ShippingOptionDTO,
} from '@medusajs/framework/types'
import { Modules } from '@medusajs/framework/utils'
import { DHLClient } from '../dhl-api/client'
import { createFulfillment, CreateFulfillmentInput } from '../dhl-api/create-fulfillment'
import { DHLCreateLabelResponse, DHLLabelPiece } from '../dhl-api/types'

type WorkflowInput = {
  userId: string
  apiKey: string
  accountId: string
  locationId: string
  data: Record<string, unknown>
  items: Partial<Omit<FulfillmentItemDTO, 'fulfillment'>>[]
  order: Partial<FulfillmentOrderDTO> | undefined
  fulfillment: Partial<Omit<FulfillmentDTO, 'provider_id' | 'data' | 'items'>>
  debug?: boolean
}

const DHL_TRACKING_BASE_URL = 'https://www.dhlparcel.nl/nl/particulier/ontvangen/volg-je-pakket'

/**
 * Parse address components from a full address line
 * DHL requires street, number, and addition separately
 */
function parseAddressLine(addressLine: string): {
  street: string
  number?: string
  addition?: string
} {
  if (!addressLine) return { street: '' }

  // Try to extract street number and addition from the address
  // Match pattern: street name, followed by number, optionally followed by addition
  const match = addressLine.match(/^(.+?)\s+(\d+[\w]*)\s*(.*)$/)

  if (match) {
    return {
      street: match[1].trim(),
      number: match[2].trim(),
      addition: match[3]?.trim() || undefined,
    }
  }

  // If no number found, return the whole address as street
  return { street: addressLine }
}

/**
 * Step to create a DHL eCommerce shipment.
 */
const createDhlShipment = createStep(
  'create-dhl-shipment',
  async (
    input: WorkflowInput,
    { container },
  ): Promise<StepResponse<{ shipment: DHLCreateLabelResponse }>> => {
    if (input.debug) {
      console.log('DHL eCommerce create fulfillment started')
    }

    // Get stock location for shipper address
    const stockLocationService = container.resolve<IStockLocationService>(Modules.STOCK_LOCATION)
    const locations = await stockLocationService.listStockLocations(
      { id: [input.locationId] },
      {
        relations: ['address'],
      },
    )

    if (locations.length === 0) {
      throw new Error('Location not found')
    }

    const location: StockLocationDTO = locations[0]

    if (input.debug) {
      console.log(`Stock Location : ${JSON.stringify(location, null, 2)}`)
    }

    if (!location.address) {
      throw new Error('Location address not found')
    }

    if (!location.address.postal_code) {
      throw new Error('Location address postal code not found')
    }

    if (!location.address.country_code) {
      throw new Error('Location address country code not found')
    }

    // Get recipient address from order
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recipient =
      (input.order as any)?.shipping_address ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (input.data as any)['to_address'] ||
      {}

    if (input.debug) {
      console.log(`Recipient : ${JSON.stringify(recipient, null, 2)}`)
    }

    // Parse shipper address
    const shipperParsed = parseAddressLine(location.address.address_1 || '')

    // Parse receiver address
    const receiverParsed = parseAddressLine(recipient.address_1 || '')

    // Get shipping option for product type
    const shippingMethodId = input.fulfillment.shipping_option_id

    if (!shippingMethodId) {
      throw new Error('DHL create fulfillment failed: Missing shipping method id')
    }

    const fulfillmentService = container.resolve<IFulfillmentModuleService>(Modules.FULFILLMENT)

    const shippingOption: ShippingOptionDTO =
      await fulfillmentService.retrieveShippingOption(shippingMethodId)

    if (input.debug) {
      console.log(`Shipping Option: ${JSON.stringify(shippingOption, null, 2)}`)
    }

    // Get the DHL product type from shipping option data (e.g., "DOOR", "BP", "PS")
    const dhlProduct = shippingOption.data?.carrier_code?.toString() || 'DOOR'

    // Build pieces from order items
    const pieces: CreateFulfillmentInput['pieces'] = input.items.map(
      (item: FulfillmentItemDTO & { variant?: ProductVariantDTO }) => ({
        parcelType: 'SMALL', // Default parcel type, can be overridden by shipping option
        quantity: item.quantity || 1,
        weight: item.variant?.weight ? item.variant.weight / 1000 : undefined, // Convert g to kg if needed
        dimensions:
          item.variant?.length && item.variant?.width && item.variant?.height
            ? {
                length: item.variant.length,
                width: item.variant.width,
                height: item.variant.height,
              }
            : undefined,
      }),
    )

    if (input.debug) {
      console.log(`Pieces : ${JSON.stringify(pieces, null, 2)}`)
    }

    // Build fulfillment input for DHL
    const fulfillmentInput: CreateFulfillmentInput = {
      orderReference: input.order?.id,
      shipper: {
        firstName: location.name || 'Store',
        lastName: '',
        companyName: location.name,
        street: shipperParsed.street,
        number: shipperParsed.number,
        addition: shipperParsed.addition || location.address.address_2 || undefined,
        postalCode: location.address.postal_code,
        city: location.address.city || '',
        countryCode: location.address.country_code.toUpperCase(),
        phoneNumber: location.address.phone || undefined,
      },
      receiver: {
        firstName: recipient.first_name || '',
        lastName: recipient.last_name || '',
        companyName: recipient.company || undefined,
        street: receiverParsed.street,
        number: receiverParsed.number,
        addition: receiverParsed.addition || recipient.address_2 || undefined,
        postalCode: recipient.postal_code || '',
        city: recipient.city || '',
        countryCode: (recipient.country_code || '').toUpperCase(),
        email: recipient.email || undefined,
        phoneNumber: recipient.phone || undefined,
      },
      pieces,
      product: dhlProduct,
      // Add options from shipping option data if available
      options: shippingOption.data?.options as CreateFulfillmentInput['options'],
    }

    if (input.debug) {
      console.log(`DHL Fulfillment Input : ${JSON.stringify(fulfillmentInput, null, 2)}`)
    }

    // Create DHL client
    const client = new DHLClient({
      userId: input.userId,
      key: input.apiKey,
      accountId: input.accountId,
    })

    // Create the shipment
    const shipment = await createFulfillment(client, fulfillmentInput)

    if (input.debug) {
      console.log(`DHL Shipment Response : ${JSON.stringify(shipment, null, 2)}`)
    }

    return new StepResponse({ shipment })
  },
)

/**
 * Workflow to create a DHL eCommerce shipment and generate a shipping label.
 */
const createShipmentWorkflow = createWorkflow(
  'create-dhl-shipment-and-label',
  (input: WorkflowInput): WorkflowResponse<{ shipment: CreateFulfillmentResult }> => {
    const { shipment } = createDhlShipment(input)

    // Get the first piece for tracking info (DHL returns per-piece tracking)
    const firstPiece = shipment.pieces[0]

    const fulfillmentResponse: CreateFulfillmentResult = {
      labels: shipment.pieces.map((piece: DHLLabelPiece) => ({
        tracking_number: piece.trackerCode,
        tracking_url: `${DHL_TRACKING_BASE_URL}?tc=${piece.trackerCode}`,
        label_url: piece.labelId, // Label ID can be used to fetch PDF via getLabelPdf
      })),
      data: {
        shipment_id: shipment.shipmentId,
        tracking_number: firstPiece?.trackerCode,
        tracking_url: firstPiece
          ? `${DHL_TRACKING_BASE_URL}?tc=${firstPiece.trackerCode}`
          : undefined,
        label_id: firstPiece?.labelId,
        pieces: shipment.pieces,
      },
    }

    return new WorkflowResponse({
      shipment: fulfillmentResponse,
    })
  },
)

export default createShipmentWorkflow
