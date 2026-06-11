import {
  createWorkflow,
  WorkflowResponse,
  createStep,
  StepResponse,
} from '@medusajs/framework/workflows-sdk'
import { DHL_SETTINGS_MODULE } from '../modules/setting'
import type DHLSettingsModuleService from '../modules/setting/service'

type FindRateByParcelTypeInput = {
  type: 'parcel_type'
  shippingOptionKey: string
  countryCode: string
  parcelTypeKey: string
}

type FindRateByWeightInput = {
  type: 'weight'
  shippingOptionKey: string
  countryCode: string
  weightKg: number
}

type GetRateInput = FindRateByParcelTypeInput | FindRateByWeightInput

type RateResult = {
  id: string
  shipping_option_key: string
  rate_type: 'parcel_type' | 'weight'
  country_code: string
  parcel_type_key: string | null
  max_weight_kg: number | null
  price: number
} | null

type ConfiguredRateTypesInput = {
  shippingOptionKey: string
  countryCode: string
}

type ConfiguredRateTypesResult = {
  hasParcelTypeRates: boolean
  hasWeightRates: boolean
}

const getRateStep = createStep(
  'get-rate-step',
  async (input: GetRateInput, { container }): Promise<StepResponse<RateResult>> => {
    const settingsService = container.resolve<DHLSettingsModuleService>(DHL_SETTINGS_MODULE)

    let rate: RateResult = null

    if (input.type === 'parcel_type') {
      rate = await settingsService.findRateByParcelType(
        input.shippingOptionKey,
        input.countryCode,
        input.parcelTypeKey,
      )
    } else {
      rate = await settingsService.findRateByWeight(
        input.shippingOptionKey,
        input.countryCode,
        input.weightKg,
      )
    }

    return new StepResponse(rate)
  },
)

const getConfiguredRateTypesStep = createStep(
  'get-configured-rate-types-step',
  async (
    input: ConfiguredRateTypesInput,
    { container },
  ): Promise<StepResponse<ConfiguredRateTypesResult>> => {
    const settingsService = container.resolve<DHLSettingsModuleService>(DHL_SETTINGS_MODULE)

    const result = await settingsService.getConfiguredRateTypes(
      input.shippingOptionKey,
      input.countryCode,
    )

    return new StepResponse(result)
  },
)

const getDhlRateWorkflow = createWorkflow(
  'get-dhl-rate-workflow',
  (input: GetRateInput) => {
    const rate = getRateStep(input)
    return new WorkflowResponse(rate)
  },
)

const getConfiguredRateTypesWorkflow = createWorkflow(
  'get-configured-rate-types-workflow',
  (input: ConfiguredRateTypesInput) => {
    const result = getConfiguredRateTypesStep(input)
    return new WorkflowResponse(result)
  },
)

export default getDhlRateWorkflow
export { getConfiguredRateTypesWorkflow }
export type {
  GetRateInput,
  RateResult,
  FindRateByParcelTypeInput,
  FindRateByWeightInput,
  ConfiguredRateTypesInput,
  ConfiguredRateTypesResult,
}
