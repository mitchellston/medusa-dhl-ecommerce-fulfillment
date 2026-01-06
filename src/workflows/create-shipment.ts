import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
  transform,
} from '@medusajs/framework/workflows-sdk'
import {
  StockLocationDTO,
  IStockLocationService,
  IOrderModuleService,
  IProductModuleService,
  FulfillmentDTO,
  FulfillmentItemDTO,
  FulfillmentOrderDTO,
  CreateFulfillmentResult,
  Logger,
  ProductVariantDTO,
} from '@medusajs/framework/types'
import { calculateBestFulfillment } from '../dhl-api/calculate-best-fulfillment'
import { Modules } from '@medusajs/framework/utils'
import { DHLShipmentResponse, DHLShipmentPiece, DHLAddress } from '../dhl-api/types'
import { createShipment } from '../dhl-api/create-shipment'
import { getFulfillmentOptions } from '../dhl-api/get-fulfillment-options'
import { extractAddressComponents, parseAddress } from '../utils/parse-address'
import { v5 as uuidv5 } from 'uuid'

// DHL namespace UUID for generating deterministic shipment IDs
const DHL_NAMESPACE = 'd7109c1b-2b80-400a-9aec-fff7dfdf5eb1'

type WorkflowInput = {
  token: string
  baseUrl: string
  accountNumber: string
  locationId: string
  data: Record<string, unknown>
  items: (Partial<Omit<FulfillmentItemDTO, 'fulfillment'>> & { variant?: ProductVariantDTO })[]
  order: Partial<FulfillmentOrderDTO> | undefined
  fulfillment: Partial<Omit<FulfillmentDTO, 'provider_id' | 'data' | 'items'>>
  dimensionUnitOfMeasure: 'mm' | 'cm'
  weightUnitOfMeasure: 'g' | 'kg'
  fulfillmentOptionKey: string
  debug?: boolean
  _logger?: Logger
}

/**
 * Step to create a DHL shipment.
 */
const createDHLShipment = createStep(
  'create-dhl-shipment',
  async (
    input: WorkflowInput,
    { container },
  ): Promise<StepResponse<{ labels: DHLShipmentResponse[] }>> => {
    if (input.debug && input._logger) {
      input._logger?.log('DHL create fulfillment started')
    }

    // Get variant data using Order and Product modules
    const orderService = container.resolve<IOrderModuleService>(Modules.ORDER)
    const productService = container.resolve<IProductModuleService>(Modules.PRODUCT)

    // Get variant IDs from items
    const variantIds = input.items
      .map((item) => item.inventory_item_id)
      .filter((id): id is string => id !== undefined)

    // If we have variant IDs, fetch the variants directly
    let enrichedItems = input.items
    if (variantIds.length > 0) {
      // First, try to get order line items to find variant IDs
      const lineItemIds = input.items
        .map((item) => item.line_item_id)
        .filter((id): id is string => id !== undefined)

      if (lineItemIds.length > 0 && input.order?.id) {
        // Get order with line items
        const order = await orderService.retrieveOrder(input.order.id, {
          relations: ['items'],
        })

        // Extract variant IDs from order items
        const orderVariantIds =
          order.items
            ?.filter((item) => lineItemIds.includes(item.id))
            .map((item) => item.variant_id)
            .filter((id): id is string => id !== undefined) ?? []

        if (orderVariantIds.length > 0) {
          // Get variants from product service
          const variants = await productService.listProductVariants(
            { id: orderVariantIds },
            { select: ['id', 'weight', 'height', 'width', 'length'] },
          )

          // Enrich items with variant data
          enrichedItems = input.items.map((item) => {
            const orderItem = order.items?.find((oi) => oi.id === item.line_item_id)
            const variant = variants.find((v) => v.id === orderItem?.variant_id)
            return {
              ...item,
              variant: variant as ProductVariantDTO | undefined,
            }
          })
        }
      }
    }

    // Update input items with enriched variant data
    input = { ...input, items: enrichedItems }

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
    if (input.debug && input._logger) {
      input._logger?.log(`Stock Location : ${JSON.stringify(location, null, 2)}`)
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

    const recipient: FulfillmentOrderDTO['billing_address'] =
      input.order?.shipping_address ||
      (input.data['to_address'] as unknown as FulfillmentOrderDTO['billing_address']) ||
      undefined

    if (!recipient) {
      throw new Error('Recipient address not found')
    }

    // Extract structured address components from recipient
    // First checks metadata for structured data, then falls back to parsing address_1
    const recipientParsed = extractAddressComponents(
      { address_1: recipient.address_1, metadata: recipient.metadata },
      recipient.country_code,
    )

    if (input.debug && input._logger) {
      input._logger?.log(`Recipient address_1: ${recipient.address_1}`)
      input._logger?.log(`Recipient parsed: ${JSON.stringify(recipientParsed, null, 2)}`)
    }

    const destinationAddress: DHLAddress = {
      name: {
        companyName: recipient.company,
        firstName: recipient.first_name,
        lastName: recipient.last_name,
      },
      address: {
        countryCode: recipient.country_code,
        postalCode: recipient.postal_code,
        city: recipient.city || '',
        number: recipientParsed.number,
        addition: recipientParsed.addition,
        additionalAddressLine: recipient.address_2 || '',
        street: recipientParsed.street,
      },
    }

    // Extract structured address components from stock location
    const locationParsed = parseAddress(location.address.address_1, location.address.country_code)

    if (input.debug && input._logger) {
      input._logger?.log(`Location address_1: ${location.address.address_1}`)
      input._logger?.log(`Location parsed: ${JSON.stringify(locationParsed, null, 2)}`)
    }

    const originAddress: DHLAddress = {
      name: {
        companyName: location.name || 'Warehouse',
      },
      address: {
        countryCode: location.address.country_code,
        postalCode: location.address.postal_code,
        city: location.address.city || '',
        number: locationParsed.number,
        addition: locationParsed.addition,
        additionalAddressLine: location.address.address_2 || '',
        street: locationParsed.street,
      },
    }

    if (input.debug && input._logger) {
      input._logger?.log(`Origin Address : ${JSON.stringify(originAddress, null, 2)}`)
      input._logger?.log(`Destination Address : ${JSON.stringify(destinationAddress, null, 2)}`)
    }

    const shippingOptions = await getFulfillmentOptions(
      input.token,
      input.baseUrl,
      input.accountNumber,
      originAddress,
      destinationAddress,
      // TODO: Add business flag
      false,
      [input.fulfillmentOptionKey],
      input.debug ? input._logger : undefined,
    )

    const fulfillmentOptionsDimensions = shippingOptions
      .map((fulfillment) => {
        const fulfillmentOption = fulfillment.options.find(
          (fulfillmentOption) => fulfillmentOption.key == input.fulfillmentOptionKey,
        )

        if (fulfillmentOption) {
          return {
            key: fulfillment.parcelType.key,
            maxWeight: fulfillment.parcelType.maxWeightGrams,
            minWeight: fulfillment.parcelType.minWeightGrams,
            height: fulfillment.parcelType.dimensions.maxHeightCm,
            width: fulfillment.parcelType.dimensions.maxWidthCm,
            length: fulfillment.parcelType.dimensions.maxLengthCm,
            sum: fulfillment.parcelType.dimensions.maxSumCm ?? 0,
            price: fulfillmentOption.price?.withTax ?? 0,
          }
        }
        return undefined
      })
      .filter((opt): opt is NonNullable<typeof opt> => opt !== undefined)

    if (input.debug && input._logger) {
      input._logger?.log(
        `Fulfillment options dimensions: ${JSON.stringify(fulfillmentOptionsDimensions, null, 2)}`,
      )
    }

    // Find the best shipping option for the items
    // Convert dimensions to cm if configured as mm (DHL expects cm)
    // Convert weight to grams if configured as kg (DHL expects grams)
    const dimensionDivisor = input.dimensionUnitOfMeasure === 'mm' ? 10 : 1
    const weightMultiplier = input.weightUnitOfMeasure === 'kg' ? 1000 : 1
    const itemDimensions = input.items.map((item) => {
      return {
        weight: (item.variant?.weight ?? 0) * weightMultiplier,
        height: (item.variant?.height ?? 0) / dimensionDivisor,
        width: (item.variant?.width ?? 0) / dimensionDivisor,
        length: (item.variant?.length ?? 0) / dimensionDivisor,
        quantity: Number(item.quantity),
      }
    })

    console.log(input.items)

    if (input.debug && input._logger) {
      input._logger?.log(`Order Items dimensions: ${JSON.stringify(itemDimensions, null, 2)}`)
    }

    const orderPieces = calculateBestFulfillment(itemDimensions, fulfillmentOptionsDimensions)

    if (input.debug && input._logger) {
      input._logger?.log(`Order Pieces: ${JSON.stringify(orderPieces, null, 2)}`)
    }

    const pieces: DHLShipmentPiece[] = orderPieces.map((piece) => {
      return {
        parcelType: piece.fulfillmentOption.key,
        quantity: piece.quantity,
      }
    })

    const shipment = await createShipment(
      input.baseUrl,
      input.token,
      input.accountNumber,
      uuidv5(input.fulfillment.id ?? '', DHL_NAMESPACE),
      originAddress,
      destinationAddress,
      pieces,
      input.fulfillmentOptionKey,
      input.debug ? input._logger : undefined,
    )

    return new StepResponse({ labels: shipment })
  },
)

/**
 * Workflow to create a DHL shipment and generate a shipping label.
 */
const createShipmentWorkflow = createWorkflow(
  'create-dhl-shipment-and-label',
  (input: WorkflowInput): WorkflowResponse<{ shipment: CreateFulfillmentResult }> => {
    // Items already have variant data enriched from the service
    const { labels } = createDHLShipment(input)

    const fulfillmentResponse = transform({ labels }, (data) => {
      return {
        labels: (data.labels ?? []).map((label) => ({
          tracking_url: label.trackingUrl,
          label_url: label.label,
          tracking_number: label.trackingNumber,
          parcel_type: label.parcelType,
        })),
        data: {
          labels: data.labels,
        },
      } as CreateFulfillmentResult
    })

    return new WorkflowResponse({
      shipment: fulfillmentResponse,
    })
  },
)

export default createShipmentWorkflow
