import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from '@medusajs/framework/workflows-sdk'

import { DHL_SETTINGS_MODULE } from '../modules/setting'
import DHLSettingsModuleService from '../modules/setting/service'
import {
  ManualPricingRow,
  ManualExtraServiceRow,
} from '../providers/dhl/dhl_pricing/manual'

export interface PricingData {
  basePricing: ManualPricingRow[]
  extraPricing: ManualPricingRow[]
  extraServices: ManualExtraServiceRow[]
}

const fetchPricingData = createStep(
  'get-dhl-pricing-data',
  async (_input, { container }): Promise<StepResponse<PricingData>> => {
    const dhlSettingsService: DHLSettingsModuleService =
      container.resolve(DHL_SETTINGS_MODULE)

    const [basePricing, extraPricing, extraServices] = await Promise.all([
      dhlSettingsService.listPricingManuals(),
      dhlSettingsService.listPricingManualExtras(),
      dhlSettingsService.listPricingManualExtraServicesPricings(),
    ])

    return new StepResponse({ basePricing, extraPricing, extraServices })
  },
)

const getPricingDataWorkflow = createWorkflow('get-dhl-pricing-data', () => {
  const pricingData = fetchPricingData()
  return new WorkflowResponse(pricingData)
})

export default getPricingDataWorkflow
