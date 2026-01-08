import { AbstractFulfillmentProviderService } from "@medusajs/framework/utils";
import {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceDTO,
  CartLineItemDTO,
  CreateFulfillmentResult,
  FulfillmentDTO,
  FulfillmentItemDTO,
  FulfillmentOption,
  FulfillmentOrderDTO,
  Logger,
  ProductVariantDTO,
} from "@medusajs/framework/types";
import { getAuthToken } from "../../dhl-api/auth";
import { calculateBestFulfillment } from "../../dhl-api/calculate-best-fulfillment";
import { getFulfillmentOptions } from "../../dhl-api/get-fulfillment-options";
import { getShipmentOptions } from "../../dhl-api/get-shipment-options";
import createDHLShipmentWorkflow from "../../workflows/create-shipment";
import getDhlCredentials from "../../workflows/get-credentials";
import { SetupCredentialsInput } from "../../api/admin/dhl/route";
import { DHLFulfillmentOptionAddress } from "../../dhl-api/types";

type InjectedDependencies = {
  logger: Logger;
};

type Options = {
  isEnabled: boolean;
  userId: string;
  apiKey: string;
  accountId: string;
  enableLogs: boolean;
  itemDimensionsUnit?: "mm" | "cm";
  itemWeightUnit?: "g" | "kg";
  webhookApiKey?: string;
  webhookApiKeyHeader?: string;
};

class DHLProviderService extends AbstractFulfillmentProviderService {
  static identifier = "dhl";

  protected logger_: Logger;
  protected options_: Options;

  private formatUnknownErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown error";
    }
  }

  /**
   * Create a new DHL provider service.
   * @param logger - The logger instance.
   * @param options - The DHL options.
   */
  constructor({ logger }: InjectedDependencies, options: Options) {
    super();
    this.logger_ = logger;
    this.options_ = options;
  }

  /**
   * Get DHL credentials.
   * @returns {Promise<SetupCredentialsInput>}
   */
  async getCredentials(): Promise<SetupCredentialsInput> {
    const { result, errors } = await getDhlCredentials().run({
      input: {},
    });

    if (errors && errors.length > 0) {
      this.logger_.error(
        "Error getting DHL credentials:" + JSON.stringify(errors, null, 2)
      );
    }

    // If not provided in the admin we use from the options
    if (!result || !result.account_id || !result.user_id || !result.api_key) {
      return {
        user_id: this.options_.userId,
        api_key: this.options_.apiKey,
        account_id: this.options_.accountId,
        enable_logs: this.options_.enableLogs,
        is_enabled: this.options_.isEnabled,
        item_dimensions_unit: this.options_.itemDimensionsUnit ?? "mm",
        item_weight_unit: this.options_.itemWeightUnit ?? "g",
        webhook_api_key: this.options_.webhookApiKey,
        webhook_api_key_header:
          this.options_.webhookApiKeyHeader ?? "Authorization",
      };
    }

    return result;
  }

  /**
   * Get the base URL for the DHL API.
   * @returns The base URL for the DHL API.
   */
  getBaseUrl(): string {
    return "https://api-gw.dhlparcel.nl";
  }

  /**
   * Check if the DHL provider can calculate shipping rates.
   * @returns {Promise<boolean>}
   */
  async canCalculate(): Promise<boolean> {
    const credentials = await this.getCredentials();
    return (
      credentials.is_enabled &&
      !!(credentials.user_id && credentials.api_key && credentials.account_id)
    );
  }

  /**
   * Get fulfillment options from the DHL Shipment Options API.
   *
   * Fetches available shipment option keys (DOOR, PS, EXP, etc.) from DHL
   * and maps them to Medusa FulfillmentOption objects.
   *
   * @returns {Promise<FulfillmentOption[]>}
   */
  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    try {
      const credentials = await this.getCredentials();

      // This endpoint is called by the admin even when the provider isn't configured yet.
      // Returning an empty list prevents a hard 500 in the admin UI during initial setup.
      const hasCredentials = !!(
        credentials.is_enabled &&
        credentials.user_id &&
        credentials.api_key &&
        credentials.account_id
      );
      if (!hasCredentials) {
        if (credentials.enable_logs) {
          this.logger_.info(
            "DHL fulfillment options: provider not configured/enabled (missing credentials). Returning empty options."
          );
        }
        return [];
      }

      const baseUrl = this.getBaseUrl();
      const token = await getAuthToken(
        baseUrl,
        credentials.user_id,
        credentials.api_key,
        credentials.account_id
      );

      const shipmentOptions = await getShipmentOptions(
        token,
        baseUrl,
        credentials.account_id,
        credentials.enable_logs ? this.logger_ : undefined
      );

      // Map DHL shipment options to Medusa FulfillmentOption format
      return shipmentOptions.map((option) => ({
        id: option.key,
        carrier_key: option.key,
        description: option.description,
        rank: option.rank,
        code: option.code,
        optionType: option.optionType,
        inputType: option.inputType,
        exclusions: option.exclusions,
      }));
    } catch (error: unknown) {
      const message = this.formatUnknownErrorMessage(error);
      this.logger_.error(`Error getting DHL fulfillment options: ${message}`);
      throw new Error(`Failed to retrieve DHL fulfillment options: ${message}`);
    }
  }

  /**
   * Calculate shipping price using DHL API.
   * @param optionData - The shipping option data (contains the selected DHL option key).
   * @param data - The shipping data.
   * @param context - The context for the shipping request.
   * @returns The calculated shipping price.
   */
  async calculatePrice(
    optionData: CalculateShippingOptionPriceDTO["optionData"],
    data: CalculateShippingOptionPriceDTO["data"],
    context: CalculateShippingOptionPriceDTO["context"]
  ): Promise<CalculatedShippingOptionPrice> {
    const credentials = await this.getCredentials();
    const baseUrl = this.getBaseUrl();
    const token = await getAuthToken(
      baseUrl,
      credentials.user_id,
      credentials.api_key,
      credentials.account_id
    );
    // Get the selected DHL option key from optionData, fallback to DOOR
    const option =
      typeof optionData?.carrier_key === "string"
        ? optionData.carrier_key
        : "DOOR";

    if (!context.items || context.items.length === 0) {
      throw new Error("Cart is empty");
    }

    // Validate customer address
    if (!context.shipping_address) {
      throw new Error("Missing shipping address in context");
    }

    if (!context.shipping_address.postal_code) {
      throw new Error("Missing shipping address postal code in context");
    }

    if (!context.shipping_address.country_code) {
      throw new Error("Missing shipping address country code in context");
    }

    // Validate store address
    if (!context.from_location) {
      throw new Error("Missing store address in context");
    }

    if (!context.from_location.address) {
      throw new Error("Missing store address in context");
    }

    if (!context.from_location.address.postal_code) {
      throw new Error("Missing store address zip in context");
    }

    if (!context.from_location.address.country_code) {
      throw new Error("Missing store address country in context");
    }

    const originAddress: DHLFulfillmentOptionAddress = {
      postalCode: context.from_location.address.postal_code,
      countryCode: context.from_location.address.country_code,
    };

    const destinationAddress: DHLFulfillmentOptionAddress = {
      postalCode: context.shipping_address.postal_code,
      countryCode: context.shipping_address.country_code,
    };

    const shippingOptions = await getFulfillmentOptions(
      token,
      baseUrl,
      credentials.account_id,
      originAddress,
      destinationAddress,
      context.shipping_address.company !== undefined &&
        context.shipping_address.company !== ""
        ? true
        : false,
      [option],
      credentials.enable_logs ? this.logger_ : undefined
    );

    const fulfillmentOptionsDimensions = shippingOptions
      .map((fulfillment) => {
        const fulfillmentOption = fulfillment.options.find(
          (fulfillmentOption) => fulfillmentOption.key == option
        );

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
          };
        }
        return undefined;
      })
      .filter((opt): opt is NonNullable<typeof opt> => opt !== undefined);

    // Find the best shipping option for the items
    // Convert dimensions to cm if configured as mm (DHL expects cm)
    // Convert weight to grams if configured as kg (DHL expects grams)
    const dimensionDivisor = credentials.item_dimensions_unit === "mm" ? 10 : 1;
    const weightMultiplier = credentials.item_weight_unit === "kg" ? 1000 : 1;
    const itemDimensions = context.items.map(
      (item: CartLineItemDTO & { variant?: ProductVariantDTO }) => {
        return {
          weight: (item.variant?.weight ?? 0) * weightMultiplier,
          height: (item.variant?.height ?? 0) / dimensionDivisor,
          width: (item.variant?.width ?? 0) / dimensionDivisor,
          length: (item.variant?.length ?? 0) / dimensionDivisor,
          quantity: Number(item.quantity),
        };
      }
    );

    // Calculate the best shipping option using bin packing
    const bestFulfillment = calculateBestFulfillment(
      itemDimensions,
      fulfillmentOptionsDimensions
    );

    if (bestFulfillment.length === 0) {
      this.logger_.error(
        "DHL rate quote: no suitable fulfillment options found"
      );
      throw new Error("No suitable shipping options found for the items");
    }

    // Calculate total price from all required packages
    const totalPrice = bestFulfillment.reduce(
      (sum, { fulfillmentOption, quantity }) => {
        return sum + fulfillmentOption.price * quantity;
      },
      0
    );

    return {
      calculated_amount: totalPrice,
      is_calculated_price_tax_inclusive: true,
    };
  }

  /**
   * Validate the fulfillment data for a given shipping option.
   * @returns A promise that resolves to a boolean indicating whether the fulfillment data is valid.
   */
  async validateFulfillmentData(): Promise<boolean> {
    // Nothing to review and approve for now
    return Promise.resolve(true);
  }

  /**
   * Cancel a fulfillment.
   * @param fulfillment - The fulfillment to cancel.
   * @returns A promise that resolves when the fulfillment is cancelled.
   */
  async cancelFulfillment(fulfillment: Record<string, unknown>): Promise<void> {
    // DHL doesn't have a cancellation API, so we just acknowledge the cancellation
    // The shipment will need to be handled manually if already created
    this.logger_.info(
      `Cancelling DHL fulfillment: ${JSON.stringify(fulfillment)}`
    );
  }

  /**
   * Create a fulfillment for a given order.
   * @param data - The fulfillment data.
   * @param items - The line items to fulfill.
   * @param order - The order to fulfill.
   * @param fulfillment - The fulfillment information.
   * @returns A promise that resolves to the fulfillment result.
   */
  async createFulfillment(
    data: Record<string, unknown>,
    items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
    order: Partial<FulfillmentOrderDTO> | undefined,
    fulfillment: Partial<Omit<FulfillmentDTO, "provider_id" | "data" | "items">>
  ): Promise<CreateFulfillmentResult> {
    const credentials = await this.getCredentials();
    const baseUrl = this.getBaseUrl();

    const token = await getAuthToken(
      baseUrl,
      credentials.user_id,
      credentials.api_key,
      credentials.account_id
    );

    try {
      const locationId = fulfillment.location_id;
      const shippingOptionId = fulfillment.shipping_option_id;

      if (!locationId) {
        this.logger_.error(
          "DHL create fulfillment failed: Missing location ID"
        );
        throw new Error("DHL create fulfillment failed: Missing location ID");
      }

      if (!shippingOptionId) {
        this.logger_.error(
          "DHL create fulfillment failed: Missing shipping option ID"
        );
        throw new Error(
          "DHL create fulfillment failed: Missing shipping option ID"
        );
      }

      const { result } = await createDHLShipmentWorkflow().run({
        input: {
          token,
          baseUrl,
          accountNumber: credentials.account_id,
          locationId,
          shippingOptionId,
          data,
          items,
          order,
          fulfillment,
          dimensionUnitOfMeasure: credentials.item_dimensions_unit,
          weightUnitOfMeasure: credentials.item_weight_unit,
          debug: credentials.enable_logs,
        },
      });

      return result.shipment;
    } catch (error: unknown) {
      const message = this.formatUnknownErrorMessage(error);
      this.logger_.error(`DHL create fulfillment failed: ${message}`);
      throw new Error(`DHL create fulfillment failed: ${message}`);
    }
  }
}

export default DHLProviderService;
