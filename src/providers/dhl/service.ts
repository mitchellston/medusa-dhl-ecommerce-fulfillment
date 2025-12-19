import { AbstractFulfillmentProviderService } from '@medusajs/framework/utils'
import {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceDTO,
  CreateFulfillmentResult,
  FulfillmentDTO,
  FulfillmentItemDTO,
  FulfillmentOption,
  FulfillmentOrderDTO,
  Logger,
} from '@medusajs/framework/types'
import { DHLClient } from '../../dhl-api/client'
import { DHLCapabilitiesResponse } from '../../dhl-api/types'
import {
  selectOptimalParcelType,
  selectParcelTypeForPackagesFromCapabilities,
} from '../../dhl-api/get-fulfillment-options'
import { createFulfillment, CreateFulfillmentInput } from '../../dhl-api/create-fulfillment'
import getDhlCredentialsWorkflow from '../../workflows/get-credentials'
import getStockLocationWorkflow from '../../workflows/get-stock-location'
import { DhlSettingsInput } from '../../modules/setting/schema'
import registerTrackingWorkflow from '../../workflows/register-tracking'
import { packItemsIntoBoxes } from './box-selection'

type InjectedDependencies = {
  logger: Logger
}

const DHL_CAPABILITIES_CACHE_TTL_MS = 60_000
const dhlCapabilitiesCache = new Map<
  string,
  { expires_at: number; capabilities: DHLCapabilitiesResponse }
>()

type WeightableLineItem = {
  quantity?: number
  variant?: { weight?: number }
  product?: { weight?: number }
}

type WeightableItem = WeightableLineItem & {
  line_item?: WeightableLineItem
}

function toMinorUnits(amount: number, currency?: string): number {
  const cur = (currency ?? 'EUR').toUpperCase()
  // Most currencies we care about here are 2-decimal (EUR). Add more if needed.
  const factor = cur === 'JPY' || cur === 'KRW' ? 1 : 100
  return Math.round(Number(amount) * factor)
}

function getItemWeightGrams(item: unknown): number {
  const it = item as Partial<WeightableItem>
  const weight =
    it.variant?.weight ??
    it.product?.weight ??
    it.line_item?.variant?.weight ??
    it.line_item?.product?.weight ??
    0
  const quantity = it.quantity ?? it.line_item?.quantity ?? 1
  return Number(weight || 0) * Number(quantity || 1)
}

type Options = {
  isEnabled: boolean
  userId: string
  apiKey: string
  accountId: string
  enableLogs: boolean
}

class DhlProviderService extends AbstractFulfillmentProviderService {
  static identifier = 'dhl'

  protected logger_: Logger
  protected options_: Options

  /**
   * Create a new DHL provider service.
   * @param logger - The logger instance.
   * @param options - The DHL options.
   */
  constructor({ logger }: InjectedDependencies, options: Options) {
    super()
    this.logger_ = logger
    this.options_ = options
  }

  /**
   * Get DHL credentials from database or options fallback.
   */
  async getCredentials(): Promise<DhlSettingsInput> {
    const { result, errors } = await getDhlCredentialsWorkflow().run({
      input: {},
    })

    if (errors && errors.length > 0) {
      this.logger_.error('Error getting DHL credentials:' + JSON.stringify(errors, null, 2))
    }

    // If not provided in the admin we use from the options
    if (!result || !result.account_id || !result.user_id || !result.api_key) {
      return {
        user_id: this.options_.userId,
        api_key: this.options_.apiKey,
        account_id: this.options_.accountId,
        enable_logs: this.options_.enableLogs,
        is_enabled: this.options_.isEnabled,
        boxes: [],
      }
    }

    return {
      ...result,
      boxes: result.boxes ?? [],
    }
  }

  /**
   * Create a DHL API client instance.
   */
  async createClient(): Promise<DHLClient> {
    const credentials = await this.getCredentials()
    return new DHLClient({
      userId: credentials.user_id,
      key: credentials.api_key,
      accountId: credentials.account_id,
      enableLogs: credentials.enable_logs,
    })
  }

  /**
   * Check if the DHL provider can calculate shipping rates.
   */
  async canCalculate(): Promise<boolean> {
    const credentials = await this.getCredentials()
    return (
      credentials.is_enabled &&
      !!(credentials.user_id && credentials.api_key && credentials.account_id)
    )
  }

  /**
   * Get fulfillment options from the DHL API.
   * This returns available shipping products and parcel types for all supported countries.
   * @returns {Promise<FulfillmentOption[]>}
   */
  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    try {
      // Do NOT fetch DHL capabilities here.
      // At this stage we don't know the customer's destination country yet, so any "product options"
      // would be wrong/over-eager. We only expose the customer type selection.
      return [
        {
          id: 'B2C',
          name: 'Consumer',
          carrier_code: 'DHL',
          carrier_name: 'DHL eCommerce',
          service_code: 'DHL_B2C',
          to_business: false,
        } as unknown as FulfillmentOption,
        {
          id: 'B2B',
          name: 'Business',
          carrier_code: 'DHL',
          carrier_name: 'DHL eCommerce',
          service_code: 'DHL_B2B',
          to_business: true,
        } as unknown as FulfillmentOption,
      ]
    } catch (error) {
      this.logger_.error('Error getting DHL fulfillment options:', error)
      throw new Error('Failed to retrieve DHL fulfillment options')
    }
  }

  /**
   * Calculate shipping price.
   * Prices are typically based on contracted rates with DHL.
   * This implementation returns a fixed price or can be extended to use custom logic.
   */
  async calculatePrice(
    optionData: CalculateShippingOptionPriceDTO['optionData'],
    data: CalculateShippingOptionPriceDTO['data'],
    context: CalculateShippingOptionPriceDTO['context'],
  ): Promise<CalculatedShippingOptionPrice> {
    const credentials = await this.getCredentials()

    if (!context.items || context.items.length === 0) {
      throw new Error('Cart is empty')
    }

    // Validate customer address
    if (!context.shipping_address) {
      throw new Error('Missing shipping address in context')
    }

    if (!context.shipping_address.postal_code) {
      throw new Error('Missing shipping address postal code in context')
    }

    if (!context.shipping_address.country_code) {
      throw new Error('Missing shipping address country code in context')
    }

    // If you configured a fixed price for this option, keep honoring it.
    const configuredPrice = optionData?.price ?? data?.price

    if (typeof configuredPrice === 'number') {
      return {
        calculated_amount: configuredPrice,
        is_calculated_price_tax_inclusive: true,
      }
    }

    // Dynamic price: fetch DHL capabilities (which include pricing) for the cart destination.
    try {
      const client = await this.createClient()

      const toCountry = String(context.shipping_address.country_code).toUpperCase()
      const fromCountry = 'NL'
      const optionDataRec = (optionData ?? {}) as Record<string, unknown>
      const dataRec = (data ?? {}) as Record<string, unknown>
      const toBusiness = Boolean(
        (optionDataRec['to_business'] ?? dataRec['to_business']) as unknown,
      )

      const cacheKey = `${fromCountry}__${toCountry}__${toBusiness}`
      const now = Date.now()
      const cached = dhlCapabilitiesCache.get(cacheKey)
      const capabilities =
        cached && cached.expires_at > now
          ? cached.capabilities
          : await client.getCapabilities(fromCountry, toCountry, toBusiness)

      if (!cached || cached.expires_at <= now) {
        dhlCapabilitiesCache.set(cacheKey, {
          expires_at: now + DHL_CAPABILITIES_CACHE_TTL_MS,
          capabilities,
        })
      }

      if (!capabilities || capabilities.length === 0) {
        throw new Error(`No DHL capabilities returned for route ${fromCountry}→${toCountry}`)
      }

      // Product selection: prefer DOOR (home delivery), fallback to first available.
      const explicitProductKey =
        (dataRec['product_key'] as string | undefined) ??
        (optionDataRec['product_key'] as string | undefined) ??
        undefined
      const door = capabilities.find((c) => c.product.key === 'DOOR')?.product.key
      const productKey = explicitProductKey ?? door ?? capabilities[0]?.product.key

      const rawItems = (context.items ?? []) as unknown[]

      // Multi-box packing (soft-fallback if boxes not configured or dims missing)
      const packing = packItemsIntoBoxes(rawItems, credentials.boxes ?? [])
      const packageCount = packing.packages.length > 0 ? packing.packages.length : 1

      // Parcel type: prefer capability-based selection that respects (optional) dimension limits + per-piece weight.
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
          : [
              {
                weight_kg:
                  rawItems.reduce<number>((sum, item) => sum + getItemWeightGrams(item), 0) / 1000,
              },
            ]

      let parcelType =
        selectParcelTypeForPackagesFromCapabilities(
          capabilities,
          productKey,
          packagesForSelection,
        ) ?? undefined

      // Soft fallback to weight-only selection if we couldn't pick a parcel type by constraints.
      if (!parcelType) {
        const totalWeightGrams = rawItems.reduce<number>(
          (sum, item) => sum + getItemWeightGrams(item),
          0,
        )
        const totalWeightKg = totalWeightGrams / 1000
        if (productKey && totalWeightKg > 0) {
          const parcelTypes = capabilities
            .filter((c) => c.product.key === productKey)
            .map((c) => ({
              key: c.parcelType.key,
              min_weight_kg: c.parcelType.minWeightKg,
              max_weight_kg: c.parcelType.maxWeightKg,
            }))
          parcelType = selectOptimalParcelType(parcelTypes, totalWeightKg)
        }
      }

      // Final fallback to the first parcel type DHL returned for this product/route.
      if (!parcelType) {
        parcelType =
          capabilities.find((c) => c.product.key === productKey)?.parcelType.key ??
          capabilities[0]?.parcelType.key ??
          'SMALL'
      }

      const matched =
        capabilities.find((c) => c.product.key === productKey && c.parcelType.key === parcelType) ??
        capabilities.find((c) => c.parcelType.key === parcelType) ??
        capabilities[0]

      const withTax = matched?.parcelType?.price?.withTax
      const withoutTax = matched?.parcelType?.price?.withoutTax
      const currency = matched?.parcelType?.price?.currency ?? 'EUR'

      let amount =
        typeof withTax === 'number'
          ? withTax
          : typeof withoutTax === 'number'
            ? withoutTax
            : undefined

      if (typeof amount !== 'number') {
        throw new Error(
          `Missing DHL price for product=${matched?.product?.key ?? 'n/a'} parcelType=${matched?.parcelType?.key ?? 'n/a'}`,
        )
      }

      // Optional: add prices for selected shipment options (if provided in optionData/data)
      const selectedOptions =
        (dataRec['shipment_options'] as unknown) ??
        (optionDataRec['shipment_options'] as unknown) ??
        (dataRec['options'] as unknown) ??
        (optionDataRec['options'] as unknown) ??
        []

      let optionsAmount = 0
      if (Array.isArray(selectedOptions) && matched?.options?.length) {
        const keys = selectedOptions
          .map((o) => {
            if (!o || typeof o !== 'object') return undefined
            if (!('key' in o)) return undefined
            const k = (o as { key?: unknown }).key
            return typeof k === 'string' ? k : undefined
          })
          .filter((k): k is string => typeof k === 'string')
        for (const k of keys) {
          const opt = matched.options.find((o) => o.key === k)
          const optPrice = opt?.price?.withTax ?? opt?.price?.withoutTax
          if (typeof optPrice === 'number') optionsAmount += optPrice
        }
      }

      // Multiply by number of packages (multi-box)
      amount = (amount + optionsAmount) * packageCount

      if (credentials.enable_logs) {
        const fallbackMsg =
          packing.diagnostics.used_fallback_largest || packing.diagnostics.unplaced_units > 0
            ? ` (packing fallback: used_fallback_largest=${packing.diagnostics.used_fallback_largest}, unplaced_units=${packing.diagnostics.unplaced_units})`
            : ''
        this.logger_.info(
          `DHL: Price calc product=${productKey ?? 'n/a'} parcelType=${parcelType} packages=${packageCount}${fallbackMsg}`,
        )
      }

      return {
        calculated_amount: toMinorUnits(amount, currency),
        is_calculated_price_tax_inclusive: typeof withTax === 'number',
      }
    } catch (e) {
      if (credentials.enable_logs) {
        this.logger_.warn(
          `DHL: Failed to calculate dynamic price, returning 0. ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }

    return {
      calculated_amount: 0,
      is_calculated_price_tax_inclusive: true,
    }
  }

  /**
   * Validate the fulfillment data for a given shipping option.
   * @returns A promise that resolves to a boolean indicating whether the fulfillment data is valid.
   */
  async validateFulfillmentData(): Promise<boolean> {
    return Promise.resolve(true)
  }

  /**
   * Create a fulfillment for a given order - generates DHL shipping label.
   * Automatically selects the optimal parcel type based on total order weight.
   * @param data - The fulfillment data.
   * @param items - The line items to fulfill.
   * @param order - The order to fulfill.
   * @param fulfillment - The fulfillment information.
   * @returns A promise that resolves to the fulfillment result.
   */
  async createFulfillment(
    data: Record<string, unknown>,
    items: Partial<Omit<FulfillmentItemDTO, 'fulfillment'>>[],
    order: Partial<FulfillmentOrderDTO> | undefined,
    fulfillment: Partial<Omit<FulfillmentDTO, 'provider_id' | 'data' | 'items'>>,
  ): Promise<CreateFulfillmentResult> {
    const credentials = await this.getCredentials()

    try {
      const locationId = fulfillment.location_id

      if (!locationId) {
        this.logger_.error('DHL create fulfillment failed: Missing location ID')
        throw new Error('DHL create fulfillment failed: Missing location ID')
      }

      const client = await this.createClient()

      // Fetch the stock location to get the shipper address using workflow
      const { result: stockLocation, errors } = await getStockLocationWorkflow().run({
        input: { locationId },
      })

      if (errors && errors.length > 0) {
        this.logger_.error('Error fetching stock location: ' + JSON.stringify(errors, null, 2))
        throw new Error('DHL create fulfillment failed: Error fetching stock location')
      }

      if (!stockLocation) {
        throw new Error('DHL create fulfillment failed: Stock location not found')
      }

      if (!stockLocation.address) {
        throw new Error('DHL create fulfillment failed: Stock location address not configured')
      }

      // Use shipper_address from data if provided (backward compatibility), otherwise use stock location
      const shipperAddressData = data.shipper_address as Record<string, unknown> | undefined
      const shipperAddress = {
        first_name: shipperAddressData?.first_name ?? stockLocation.name ?? 'Shipper',
        last_name: shipperAddressData?.last_name ?? '',
        company: shipperAddressData?.company ?? stockLocation.name,
        address_1: shipperAddressData?.address_1 ?? stockLocation.address.address_1,
        address_2: shipperAddressData?.address_2 ?? stockLocation.address.address_2,
        postal_code: shipperAddressData?.postal_code ?? stockLocation.address.postal_code,
        city: shipperAddressData?.city ?? stockLocation.address.city,
        country_code: shipperAddressData?.country_code ?? stockLocation.address.country_code,
        email: shipperAddressData?.email,
        phone: shipperAddressData?.phone ?? stockLocation.address.phone,
      }

      if (!shipperAddress.postal_code || !shipperAddress.country_code) {
        throw new Error(
          'DHL create fulfillment failed: Missing shipper address. ' +
            'Please configure the address on your stock location.',
        )
      }

      // Build receiver address from order shipping address
      const shippingAddress = order?.shipping_address

      if (!shippingAddress) {
        throw new Error('DHL create fulfillment failed: Missing receiver address')
      }

      // Calculate total weight from items (weight should be in grams, convert to kg)
      type ItemWithLineItem = {
        line_item?: {
          variant?: { weight?: number }
          product?: { weight?: number }
        }
        quantity?: number
      }
      const totalWeightGrams = items.reduce((sum, item) => {
        const lineItem = (item as ItemWithLineItem).line_item
        const weight = lineItem?.variant?.weight ?? lineItem?.product?.weight ?? 0
        const quantity = item.quantity ?? 1
        return sum + weight * quantity
      }, 0)
      const totalWeightKg = totalWeightGrams / 1000

      // Shipping option should only select whether the receiver is a business.
      // Product selection depends on destination country and is computed at runtime.
      const toBusiness = Boolean(data.to_business)

      const toCountry = String(shippingAddress.country_code || 'NL').toUpperCase()
      const capabilities = await client.getCapabilities('NL', toCountry, toBusiness)

      if (!capabilities || capabilities.length === 0) {
        throw new Error(`No DHL capabilities returned for route NL→${toCountry}`)
      }

      // Prefer DOOR for home delivery; fallback to first available product.
      const explicitProductKey = (data.product_key as string | undefined) ?? undefined // backward compat
      const door = capabilities.find((c) => c.product.key === 'DOOR')?.product.key
      const productKey = explicitProductKey ?? door ?? capabilities[0]?.product.key

      // Pack into multiple boxes (soft fallback if boxes not configured / dims missing).
      const packing = packItemsIntoBoxes(items as unknown[], credentials.boxes ?? [])
      const selectedBox = packing.packages[0]?.box // keep legacy single-box field for backwards compat/admin display
      const used_fallback_largest = packing.diagnostics.used_fallback_largest

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

      let parcelType =
        selectParcelTypeForPackagesFromCapabilities(
          capabilities,
          productKey,
          packagesForSelection,
        ) ?? undefined

      // Soft fallback: weight-only parcel type selection.
      if (!parcelType && productKey && totalWeightKg > 0) {
        const parcelTypes = capabilities
          .filter((c) => c.product.key === productKey)
          .map((c) => ({
            key: c.parcelType.key,
            min_weight_kg: c.parcelType.minWeightKg,
            max_weight_kg: c.parcelType.maxWeightKg,
          }))
        const optimal = selectOptimalParcelType(parcelTypes, totalWeightKg)
        if (optimal) parcelType = optimal
      }

      // Final fallback: first parcel type DHL returned for this product/route.
      if (!parcelType) {
        parcelType =
          capabilities.find((c) => c.product.key === productKey)?.parcelType.key ??
          capabilities[0]?.parcelType.key ??
          'SMALL'
      }

      // Final guard: ensure parcelType exists for selected productKey; otherwise take first capability for that product.
      if (
        productKey &&
        !capabilities.some((c) => c.product.key === productKey && c.parcelType.key === parcelType)
      ) {
        parcelType =
          capabilities.find((c) => c.product.key === productKey)?.parcelType.key ??
          capabilities[0]?.parcelType.key ??
          'SMALL'
      }

      // Safety: if this product is mono-collo only, don't send multi-piece.
      const isMonoCollo = Boolean(
        productKey
          ? capabilities.find((c) => c.product.key === productKey)?.product.monoColloProduct
          : false,
      )

      if (credentials.enable_logs) {
        const pkgCount = packing.packages.length > 0 ? packing.packages.length : 1
        const fallbackMsg =
          packing.diagnostics.used_fallback_largest || packing.diagnostics.unplaced_units > 0
            ? ` (packing fallback: used_fallback_largest=${packing.diagnostics.used_fallback_largest}, unplaced_units=${packing.diagnostics.unplaced_units})`
            : ''
        const monoMsg =
          isMonoCollo && pkgCount > 1 ? ' (mono-collo product; collapsing to single piece)' : ''
        this.logger_.info(
          `DHL: Selected parcel type '${parcelType}' (toCountry=${toCountry}, product '${productKey ?? 'n/a'}', toBusiness=${toBusiness}, packages=${pkgCount})${fallbackMsg}${monoMsg}`,
        )
      }

      const pieces: CreateFulfillmentInput['pieces'] =
        !isMonoCollo && packing.packages.length > 1
          ? packing.packages.map((p) => ({
              parcelType,
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
                parcelType,
                quantity: 1,
                weight: totalWeightKg > 0 ? totalWeightKg : (data.weight as number | undefined),
              },
            ]

      const fulfillmentInput: CreateFulfillmentInput = {
        orderReference: order?.id,
        shipper: {
          firstName: String(shipperAddress.first_name || 'Shipper'),
          lastName: String(shipperAddress.last_name || ''),
          companyName: shipperAddress.company ? String(shipperAddress.company) : undefined,
          street: String(shipperAddress.address_1 || ''),
          number: shipperAddress.address_2 ? String(shipperAddress.address_2) : undefined,
          postalCode: String(shipperAddress.postal_code || ''),
          city: String(shipperAddress.city || ''),
          countryCode: String(shipperAddress.country_code || 'NL').toUpperCase(),
          email: shipperAddress.email ? String(shipperAddress.email) : undefined,
          phoneNumber: shipperAddress.phone ? String(shipperAddress.phone) : undefined,
        },
        receiver: {
          firstName: shippingAddress.first_name || '',
          lastName: shippingAddress.last_name || '',
          companyName: shippingAddress.company || undefined,
          street: shippingAddress.address_1 || '',
          number: shippingAddress.address_2 || undefined,
          postalCode: shippingAddress.postal_code || '',
          city: shippingAddress.city || '',
          countryCode: shippingAddress.country_code || 'NL',
          email: (order as { email?: string })?.email,
          phoneNumber: shippingAddress.phone || undefined,
        },
        pieces,
        product: productKey,
        options: data.shipment_options as CreateFulfillmentInput['options'],
      }

      if (credentials.enable_logs) {
        this.logger_.info(
          'DHL create fulfillment input: ' + JSON.stringify(fulfillmentInput, null, 2),
        )
      }

      const response = await createFulfillment(client, fulfillmentInput)

      if (credentials.enable_logs) {
        this.logger_.info('DHL create fulfillment response: ' + JSON.stringify(response, null, 2))
      }

      // Fetch the label PDF using the labelId
      let labelPdfBase64 = response.pdf
      if (!labelPdfBase64 && response.labelId) {
        try {
          if (credentials.enable_logs) {
            this.logger_.info(`DHL: Fetching PDF for label ${response.labelId}`)
          }
          labelPdfBase64 = await client.getLabelPdf(response.labelId)
        } catch (pdfError) {
          this.logger_.warn(
            `DHL: Failed to fetch label PDF: ${pdfError instanceof Error ? pdfError.message : String(pdfError)}`,
          )
        }
      }

      // Return the fulfillment data with tracking info
      // DHL API returns a flat object for single labels
      // Also register this shipment for automated tracking sync (shipped/delivered)
      if (response.trackerCode && shippingAddress.postal_code && fulfillment.id) {
        try {
          await registerTrackingWorkflow().run({
            input: {
              fulfillment_id: fulfillment.id as string,
              order_id: order?.id as string | undefined,
              tracker_code: response.trackerCode,
              postal_code: shippingAddress.postal_code,
            },
          })
        } catch (e) {
          // Don't fail fulfillment creation if tracking registration fails
          if (credentials.enable_logs) {
            this.logger_.warn(
              `DHL: Failed to register tracking for automation: ${
                e instanceof Error ? e.message : String(e)
              }`,
            )
          }
        }
      }

      return {
        data: {
          shipment_id:
            typeof response.shipmentId === 'object'
              ? response.shipmentId.id
              : String(response.shipmentId),
          label_id: response.labelId,
          tracker_code: response.trackerCode,
          parcel_type: response.parcelType,
          selected_box: selectedBox
            ? {
                id: selectedBox.id,
                name: selectedBox.name,
                used_fallback_largest,
              }
            : undefined,
          selected_boxes:
            packing.packages.length > 0
              ? packing.packages.map((p) => ({
                  id: p.box.id,
                  name: p.box.name,
                  inner_cm: p.box.inner_cm,
                  max_weight_kg: p.box.max_weight_kg,
                  weight_kg: p.weight_kg,
                  units: p.units,
                }))
              : undefined,
          packing_diagnostics: packing.diagnostics,
          piece_number: response.pieceNumber,
          routing_code: response.routingCode,
        },
        labels: [
          {
            tracking_number: response.trackerCode,
            tracking_url: `https://www.dhlparcel.nl/nl/volg-uw-zending-0?tt=${response.trackerCode}`,
            label_url: labelPdfBase64 ? `data:application/pdf;base64,${labelPdfBase64}` : '',
          },
        ],
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger_.error(`DHL create fulfillment failed: ${errorMessage}`)
      throw new Error(`DHL create fulfillment failed: ${errorMessage}`)
    }
  }
}

export default DhlProviderService
