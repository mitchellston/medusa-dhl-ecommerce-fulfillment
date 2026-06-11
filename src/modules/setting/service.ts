import { DHLSetting } from './models/setting'
import { DHLRate } from './models/rate'
import { MedusaService } from '@medusajs/framework/utils'
import { SetupCredentialsInput } from '../../api/admin/dhl/route'

export type RateInput = {
  shipping_option_key: string
  rate_type: 'parcel_type' | 'weight'
  country_code: string
  parcel_type_key?: string | null
  max_weight_kg?: number | null
  price: number
}

export type RateFilter = {
  shipping_option_key?: string
  rate_type?: 'parcel_type' | 'weight'
  country_code?: string
  parcel_type_key?: string
  max_weight_kg?: number
}

class DHLSettingsModuleService extends MedusaService({
  DHLSetting,
  DHLRate,
}) {
  /**
   * Updates the DHL API credentials.
   * @param input The new credentials to set.
   * @returns True if the update was successful, false otherwise.
   */
  async updateCredentials(input: SetupCredentialsInput): Promise<boolean> {
    const dhlSettings = await this.listDHLSettings()
    if (dhlSettings.length) {
      // Update the existing DHL settings
      const result = await this.updateDHLSettings({
        ...input,
        id: dhlSettings[0].id,
      })
      return !!result
    } else {
      // Create new DHL settings
      const result = await this.createDHLSettings(input)
      return !!result
    }
  }

  /**
   * Retrieves the DHL API credentials.
   * @returns The DHL API credentials or null if not found.
   */
  async getCredentials(): Promise<SetupCredentialsInput | null> {
    const dhlSettings = await this.listDHLSettings()
    if (dhlSettings.length) {
      return dhlSettings[0]
    }
    return null
  }

  /**
   * Creates a new rate entry.
   * @param input The rate data to create.
   * @returns The created rate.
   */
  async createRate(input: RateInput) {
    return this.createDHLRates(input)
  }

  /**
   * Creates multiple rate entries in bulk.
   * @param inputs Array of rate data to create.
   * @returns The created rates.
   */
  async createRatesBulk(inputs: RateInput[]) {
    return this.createDHLRates(inputs)
  }

  /**
   * Updates an existing rate entry.
   * @param id The rate ID to update.
   * @param input The rate data to update.
   * @returns The updated rate.
   */
  async updateRate(id: string, input: Partial<RateInput>) {
    return this.updateDHLRates({ id, ...input })
  }

  /**
   * Deletes a rate entry.
   * @param id The rate ID to delete.
   */
  async deleteRate(id: string) {
    return this.deleteDHLRates(id)
  }

  /**
   * Deletes multiple rate entries.
   * @param ids Array of rate IDs to delete.
   */
  async deleteRatesBulk(ids: string[]) {
    return this.deleteDHLRates(ids)
  }

  /**
   * Lists rates with optional filters.
   * @param filter Optional filters to apply.
   * @returns Array of matching rates.
   */
  async listRates(filter?: RateFilter) {
    return this.listDHLRates(filter)
  }

  /**
   * Retrieves a single rate by ID.
   * @param id The rate ID to retrieve.
   * @returns The rate or null if not found.
   */
  async getRate(id: string) {
    return this.retrieveDHLRate(id)
  }

  /**
   * Finds a rate for parcel type-based pricing.
   * @param shippingOptionKey The shipping option key (e.g., DOOR, PS).
   * @param countryCode The destination country code.
   * @param parcelTypeKey The parcel type key (e.g., SMALL, MEDIUM).
   * @returns The matching rate or null.
   */
  async findRateByParcelType(
    shippingOptionKey: string,
    countryCode: string,
    parcelTypeKey: string,
  ) {
    const rates = await this.listDHLRates({
      shipping_option_key: shippingOptionKey,
      rate_type: 'parcel_type',
      country_code: countryCode,
      parcel_type_key: parcelTypeKey,
    })
    return rates.length > 0 ? rates[0] : null
  }

  /**
   * Finds a rate for weight-based pricing.
   * Finds the smallest weight bracket that accommodates the given weight.
   * @param shippingOptionKey The shipping option key (e.g., DOOR, PS).
   * @param countryCode The destination country code.
   * @param weightKg The total weight in kg.
   * @returns The matching rate or null.
   */
  async findRateByWeight(shippingOptionKey: string, countryCode: string, weightKg: number) {
    const rates = await this.listDHLRates({
      shipping_option_key: shippingOptionKey,
      rate_type: 'weight',
      country_code: countryCode,
    })

    // Filter rates where max_weight_kg >= weightKg and find the smallest bracket
    const applicableRates = rates
      .filter((rate) => rate.max_weight_kg !== null && rate.max_weight_kg >= weightKg)
      .sort((a, b) => (a.max_weight_kg ?? 0) - (b.max_weight_kg ?? 0))

    return applicableRates.length > 0 ? applicableRates[0] : null
  }

  /**
   * Determines what rate types are configured for a shipping option and country.
   * This is used to determine whether to use parcel_type or weight-based pricing.
   * @param shippingOptionKey The shipping option key (e.g., DOOR, PS).
   * @param countryCode The destination country code.
   * @returns Object indicating which rate types are configured.
   */
  async getConfiguredRateTypes(
    shippingOptionKey: string,
    countryCode: string,
  ): Promise<{ hasParcelTypeRates: boolean; hasWeightRates: boolean }> {
    const [parcelTypeRates, weightRates] = await Promise.all([
      this.listDHLRates({
        shipping_option_key: shippingOptionKey,
        rate_type: 'parcel_type',
        country_code: countryCode,
      }),
      this.listDHLRates({
        shipping_option_key: shippingOptionKey,
        rate_type: 'weight',
        country_code: countryCode,
      }),
    ])

    return {
      hasParcelTypeRates: parcelTypeRates.length > 0,
      hasWeightRates: weightRates.length > 0,
    }
  }
}

export default DHLSettingsModuleService
