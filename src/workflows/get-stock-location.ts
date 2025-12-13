import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from '@medusajs/framework/workflows-sdk'
import { Modules } from '@medusajs/framework/utils'
import { IStockLocationService, StockLocationDTO } from '@medusajs/framework/types'

type GetStockLocationInput = {
  locationId: string
}

/**
 * Get stock location with address from the stock location module.
 */
const getStockLocationStep = createStep(
  'get-stock-location',
  async (
    input: GetStockLocationInput,
    { container },
  ): Promise<StepResponse<StockLocationDTO | null>> => {
    try {
      const stockLocationService: IStockLocationService = container.resolve(Modules.STOCK_LOCATION)
      const locations = await stockLocationService.listStockLocations(
        { id: [input.locationId] },
        { relations: ['address'] },
      )

      if (locations.length === 0) {
        return new StepResponse(null)
      }

      return new StepResponse(locations[0])
    } catch (error) {
      console.error('Error getting stock location:', error)
      return new StepResponse(null)
    }
  },
)

/**
 * Workflow to get a stock location by ID.
 */
const getStockLocationWorkflow = createWorkflow(
  'get-stock-location',
  (input: GetStockLocationInput) => {
    const stockLocation = getStockLocationStep(input)
    return new WorkflowResponse(stockLocation)
  },
)

export default getStockLocationWorkflow
