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
import { DHLCreateLabelResponse } from '../dhl-api/types'
import {
  selectOptimalParcelType,
  selectParcelTypeForPackagesFromCapabilities,
} from '../dhl-api/get-fulfillment-options'
import getCredentialsWorkflow from './get-credentials'
import { packItemsIntoBoxes } from '../providers/dhl/box-selection'

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
    const recipient =
      input.order?.shipping_address ||
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

    // Get the DHL product type from shipping option data.
    // (Note: in the provider flow we use `data.product_key`; this workflow is legacy and uses `carrier_code`.)
    const dhlProduct = shippingOption.data?.carrier_code?.toString() || 'DOOR'

    // Determine parcel type from DHL capabilities + total shipment weight (never from a manually configured value).
    let selectedParcelType = 'SMALL'
    let client: DHLClient | undefined
    try {
      const toCountry = (recipient.country_code || '').toString().toUpperCase()
      const fromCountry = location.address.country_code.toUpperCase()
      const toBusiness = Boolean(
        (shippingOption.data as Record<string, unknown> | undefined)?.to_business,
      )

      // Create DHL client (needed to fetch capabilities)
      client = new DHLClient({
        userId: input.userId,
        key: input.apiKey,
        accountId: input.accountId,
      })

      const capabilities = await client.getCapabilities(fromCountry, toCountry, toBusiness)

      const totalWeightGrams = input.items.reduce<number>((sum, item) => {
        const anyItem = item as FulfillmentItemDTO & { variant?: ProductVariantDTO }
        const weight = anyItem.variant?.weight ?? 0 // grams
        const quantity = item.quantity || 1
        return sum + weight * quantity
      }, 0)
      const totalWeightKg = totalWeightGrams / 1000

      // Pack items into configured boxes (best-effort). If boxes are not configured, this returns no packages.
      const { result: settings } = await getCredentialsWorkflow().run({ input: {} })
      const packing = packItemsIntoBoxes(input.items as unknown[], settings?.boxes ?? [])
      const packagesForSelection =
        packing.packages.length > 0
          ? packing.packages.map((p) => ({
              weight_kg: p.weight_kg,
              dimensions_cm: {
                length: p.box.inner_cm.length,
                width: p.box.inner_cm.width,
                height: p.box.inner_cm.height,
              },
            }))
          : [{ weight_kg: totalWeightKg }]

      const byConstraints = selectParcelTypeForPackagesFromCapabilities(
        capabilities,
        dhlProduct,
        packagesForSelection,
      )

      const parcelTypes = capabilities
        .filter((c) => c.product.key === dhlProduct)
        .map((c) => ({
          key: c.parcelType.key,
          min_weight_kg: c.parcelType.minWeightKg,
          max_weight_kg: c.parcelType.maxWeightKg,
        }))

      const optimal =
        parcelTypes.length > 0 ? selectOptimalParcelType(parcelTypes, totalWeightKg) : undefined

      selectedParcelType =
        byConstraints ??
        optimal ??
        capabilities.find((c) => c.product.key === dhlProduct)?.parcelType.key ??
        capabilities[0]?.parcelType.key ??
        'SMALL'
    } catch {
      // keep default SMALL if capabilities fail
    }
    if (!client) {
      client = new DHLClient({
        userId: input.userId,
        key: input.apiKey,
        accountId: input.accountId,
      })
    }

    // Build pieces from packed packages (one piece per box). If boxes aren't configured, fall back to single piece.
    let pieces: CreateFulfillmentInput['pieces']
    try {
      const { result: settings } = await getCredentialsWorkflow().run({ input: {} })
      const packing = packItemsIntoBoxes(input.items as unknown[], settings?.boxes ?? [])
      pieces =
        packing.packages.length > 0
          ? packing.packages.map((p) => ({
              parcelType: selectedParcelType,
              quantity: 1,
              weight: p.weight_kg,
              dimensions: {
                length: p.box.inner_cm.length,
                width: p.box.inner_cm.width,
                height: p.box.inner_cm.height,
              },
            }))
          : [
              {
                parcelType: selectedParcelType,
                quantity: 1,
                weight:
                  input.items.reduce((sum, item) => {
                    const anyItem = item as FulfillmentItemDTO & { variant?: ProductVariantDTO }
                    const weight = anyItem.variant?.weight ?? 0 // grams
                    const quantity = item.quantity || 1
                    return sum + (weight * quantity) / 1000
                  }, 0) || undefined,
              },
            ]
    } catch {
      // Last-resort: a single piece without weight (DHL may reject, but keeps legacy path working)
      pieces = [{ parcelType: selectedParcelType, quantity: 1 }]
    }

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

    // Create the shipment
    const shipment = await createFulfillment(client, fulfillmentInput)

    if (input.debug) {
      console.log(`DHL Shipment Response : ${JSON.stringify(shipment, null, 2)}`)
    }

    return new StepResponse({ shipment })
  },
)

/**
 * Step to transform DHL response into CreateFulfillmentResult format.
 * DHL API returns a single label object, not an array of pieces.
 */
const transformDhlResponse = createStep(
  'transform-dhl-response',
  async (input: {
    shipment: DHLCreateLabelResponse
  }): Promise<StepResponse<{ shipment: CreateFulfillmentResult }>> => {
    const { shipment } = input

    // DHL returns a single label object
    const shipmentId =
      typeof shipment.shipmentId === 'object' ? shipment.shipmentId.id : shipment.shipmentId

    const fulfillmentResponse: CreateFulfillmentResult = {
      labels: [
        {
          tracking_number: shipment.trackerCode,
          tracking_url: `${DHL_TRACKING_BASE_URL}?tc=${shipment.trackerCode}`,
          label_url: shipment.labelId, // Label ID can be used to fetch PDF via getLabelPdf
        },
      ],
      data: {
        shipment_id: shipmentId,
        tracking_number: shipment.trackerCode,
        tracking_url: `${DHL_TRACKING_BASE_URL}?tc=${shipment.trackerCode}`,
        label_id: shipment.labelId,
        parcel_type: shipment.parcelType,
        piece_number: shipment.pieceNumber,
        routing_code: shipment.routingCode,
      },
    }

    return new StepResponse({ shipment: fulfillmentResponse })
  },
)

/**
 * Workflow to create a DHL eCommerce shipment and generate a shipping label.
 */
const createShipmentWorkflow = createWorkflow(
  'create-dhl-shipment-and-label',
  (input: WorkflowInput): WorkflowResponse<{ shipment: CreateFulfillmentResult }> => {
    const { shipment } = createDhlShipment(input)
    const result = transformDhlResponse({ shipment })

    return new WorkflowResponse({
      shipment: result.shipment,
    })
  },
)

export default createShipmentWorkflow
