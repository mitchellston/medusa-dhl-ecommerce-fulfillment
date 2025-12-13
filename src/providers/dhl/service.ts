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
import {
  getAllFulfillmentOptions,
  getParcelTypesForProduct,
  selectOptimalParcelType,
  FulfillmentOption as DHLFulfillmentOption,
} from '../../dhl-api/get-fulfillment-options'
import { createFulfillment, CreateFulfillmentInput } from '../../dhl-api/create-fulfillment'
import getDhlCredentialsWorkflow from '../../workflows/get-credentials'
import getStockLocationWorkflow from '../../workflows/get-stock-location'
import { SetupCredentialsInput } from '../../api/admin/dhl/route'

type InjectedDependencies = {
  logger: Logger
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
  async getCredentials(): Promise<SetupCredentialsInput> {
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
      }
    }

    return result
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
      const client = await this.createClient()
      // Fetch capabilities for all supported destination countries
      const dhlOptions: DHLFulfillmentOption[] = await getAllFulfillmentOptions(
        client,
        'NL', // fromCountry - origin is Netherlands
        true, // toBusiness
      )

      return dhlOptions.map((option) => ({
        id: option.id,
        name: option.name,
        carrier_code: 'DHL',
        carrier_name: 'DHL eCommerce',
        service_code: option.product_code,
        product_key: option.product_key,
        parcel_type: option.parcel_type,
        min_weight_kg: option.min_weight_kg,
        max_weight_kg: option.max_weight_kg,
        supported_countries: option.supported_countries,
      }))
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

    // DHL eCommerce doesn't have a public rate API
    // Return the price set in the shipping option configuration
    // Or implement custom pricing logic based on weight/destination
    const configuredPrice = optionData.price ?? data.price

    if (typeof configuredPrice === 'number') {
      return {
        calculated_amount: configuredPrice,
        is_calculated_price_tax_inclusive: true,
      }
    }

    // If no configured price, log warning and return 0
    if (credentials.enable_logs) {
      this.logger_.warn('DHL: No price configured for shipping option, returning 0')
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

      // Get the product key from the shipping option data
      const productKey = data.product_key as string | undefined

      // Determine the optimal parcel type based on weight
      let parcelType = data.parcel_type as string | undefined

      if (productKey && totalWeightKg > 0) {
        // Fetch available parcel types for this product
        const fulfillmentOptions = await getAllFulfillmentOptions(client, 'NL', true, [
          shippingAddress.country_code?.toUpperCase() || 'NL',
        ])
        const parcelTypes = getParcelTypesForProduct(fulfillmentOptions, productKey)

        if (parcelTypes.length > 0) {
          const optimalParcelType = selectOptimalParcelType(parcelTypes, totalWeightKg)
          if (optimalParcelType) {
            parcelType = optimalParcelType
            if (credentials.enable_logs) {
              this.logger_.info(
                `DHL: Selected parcel type '${parcelType}' for weight ${totalWeightKg}kg`,
              )
            }
          }
        }
      }

      // Fallback to SMALL if no parcel type determined
      if (!parcelType) {
        parcelType = 'SMALL'
        if (credentials.enable_logs) {
          this.logger_.info(`DHL: Using default parcel type 'SMALL'`)
        }
      }

      // Build pieces - using a single piece with total weight and optimal parcel type
      const pieces = [
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
        product: data.product_key as string | undefined,
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
      return {
        data: {
          shipment_id:
            typeof response.shipmentId === 'object'
              ? response.shipmentId.id
              : String(response.shipmentId),
          label_id: response.labelId,
          tracker_code: response.trackerCode,
          parcel_type: response.parcelType,
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
