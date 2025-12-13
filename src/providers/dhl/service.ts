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
  getFulfillmentOptions,
  FulfillmentOption as DHLFulfillmentOption,
} from '../../dhl-api/get-fulfillment-options'
import { createFulfillment, CreateFulfillmentInput } from '../../dhl-api/create-fulfillment'
import getDhlCredentialsWorkflow from '../../workflows/get-credentials'
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
   * This returns available shipping products and parcel types.
   * @returns {Promise<FulfillmentOption[]>}
   */
  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    try {
      const client = await this.createClient()
      // Default to NL -> NL for capabilities, can be customized per use case
      const dhlOptions: DHLFulfillmentOption[] = await getFulfillmentOptions(
        client,
        'NL',
        'NL',
        'business',
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
    const configuredPrice = optionData.price || data.price

    if (configuredPrice !== undefined) {
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

      // Build shipper address from data (should be passed from stock location or configuration)
      // Note: fulfillment.delivery_address is the RECIPIENT address, NOT the shipper address
      const shipperAddress = data.shipper_address as CreateFulfillmentInput['shipper'] | undefined

      if (!shipperAddress) {
        throw new Error(
          'DHL create fulfillment failed: Missing shipper address. ' +
            'Please provide shipper_address in the fulfillment data from your stock location configuration.',
        )
      }

      // Build receiver address from order shipping address
      const shippingAddress = order?.shipping_address

      if (!shippingAddress) {
        throw new Error('DHL create fulfillment failed: Missing receiver address')
      }

      // Build pieces from items
      const pieces = items.map(() => ({
        parcelType: (data.parcel_type as string) || 'SMALL',
        quantity: 1,
        weight: data.weight as number | undefined,
      }))

      const fulfillmentInput: CreateFulfillmentInput = {
        orderReference: order?.id,
        shipper: {
          firstName: (shipperAddress as any).first_name || 'Shipper',
          lastName: (shipperAddress as any).last_name || '',
          companyName: (shipperAddress as any).company,
          street: (shipperAddress as any).address_1 || '',
          number: (shipperAddress as any).address_2,
          postalCode: (shipperAddress as any).postal_code || '',
          city: (shipperAddress as any).city || '',
          countryCode: (shipperAddress as any).country_code || 'NL',
          email: (shipperAddress as any).email,
          phoneNumber: (shipperAddress as any).phone,
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
          email: (order as any)?.email,
          phoneNumber: shippingAddress.phone || undefined,
        },
        pieces,
        product: data.product_key as string | undefined,
        options: data.shipment_options as CreateFulfillmentInput['options'],
      }

      if (credentials.enable_logs) {
        this.logger_.info(
          'DHL create fulfillment input:',
          JSON.stringify(fulfillmentInput, null, 2),
        )
      }

      const response = await createFulfillment(client, fulfillmentInput)

      if (credentials.enable_logs) {
        this.logger_.info('DHL create fulfillment response:', JSON.stringify(response, null, 2))
      }

      // Return the fulfillment data with tracking info
      return {
        data: {
          shipment_id: response.shipmentId,
          pieces: response.pieces,
          tracker_codes: response.pieces.map((p) => p.trackerCode),
          label_ids: response.pieces.map((p) => p.labelId),
        },
        labels: response.pieces.map((piece) => ({
          tracking_number: piece.trackerCode,
          tracking_url: `https://www.dhlparcel.nl/nl/volg-uw-zending-0?tt=${piece.trackerCode}`,
          label_url: piece.pdf ? `data:application/pdf;base64,${piece.pdf}` : undefined,
        })),
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger_.error(`DHL create fulfillment failed: ${errorMessage}`)
      throw new Error(`DHL create fulfillment failed: ${errorMessage}`)
    }
  }
}

export default DhlProviderService
