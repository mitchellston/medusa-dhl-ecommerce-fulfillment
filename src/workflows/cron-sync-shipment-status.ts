import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from '@medusajs/framework/workflows-sdk'
import { FulfillmentDTO, IFulfillmentModuleService, Logger } from '@medusajs/framework/types'
import { Modules } from '@medusajs/framework/utils'
import { getShipmentStatusesByTrackerCodes } from '../dhl-api/get-shipment-statuses-by-tracker-codes'
import { DHLShipmentStatusResponse } from '../dhl-api/types'
import updateFulfillmentStatusWorkflow from './update-fulfillment-status'

type WorkflowInput<T extends object> = T & {
  token: string
  baseUrl: string
  limit: number
  debug?: boolean
  _logger?: Logger
}

/**
 * Step to fetch Medusa fulfillments that have a DHL label.
 */
const fetchMedusaFulfillments = createStep(
  'sync-dhl-shipment-status--fetch-medusa-fulfillments',
  async (
    input: WorkflowInput<{ limit: number }>,
    { container },
  ): Promise<StepResponse<{ fulfillments: FulfillmentDTO[]; trackerCodes: string[] }>> => {
    type FulfillmentServiceMaybe = IFulfillmentModuleService & {
      listAndCountFulfillments?: (
        filters: unknown,
        config?: unknown,
      ) => Promise<[FulfillmentDTO[], number]>
      listFulfillmentsAndCount?: (
        filters: unknown,
        config?: unknown,
      ) => Promise<[FulfillmentDTO[], number]>
    }

    const fulfillmentService = container.resolve<FulfillmentServiceMaybe>(Modules.FULFILLMENT)

    const filters = {
      provider_id: 'dhl',
      delivered_at: {
        // Only sync statuses for shipments that aren't already delivered.
        $eq: null,
      },
    }

    const take = Math.max(1, input.limit)

    const getRandomSkip = (count: number, localTake: number) => {
      const maxSkip = Math.max(0, count - localTake)
      if (maxSkip === 0) {
        return 0
      }
      return Math.floor(Math.random() * (maxSkip + 1))
    }

    let skip: number | undefined
    // Prefer module-level count APIs if available (so we can randomize across *all* eligible fulfillments)
    if (typeof fulfillmentService.listAndCountFulfillments === 'function') {
      const [, count] = await fulfillmentService.listAndCountFulfillments(filters, { take: 1 })
      skip = getRandomSkip(count, take)
    } else if (typeof fulfillmentService.listFulfillmentsAndCount === 'function') {
      const [, count] = await fulfillmentService.listFulfillmentsAndCount(filters, { take: 1 })
      skip = getRandomSkip(count, take)
    } else if (input.debug && input._logger) {
      input._logger.debug(
        'Fulfillment service does not expose a list-and-count method; falling back to non-randomized pagination.',
      )
    }

    const fulfillments = await fulfillmentService.listFulfillments(filters, {
      take,
      ...(typeof skip === 'number' ? { skip } : {}),
    })

    const trackerCodes = fulfillments
      .map((fulfillment) => fulfillment.labels.map((label) => label.tracking_number))
      .flat()

    return new StepResponse({ fulfillments, trackerCodes })
  },
)

const fetchDhlShipmentStatus = createStep(
  'sync-dhl-shipment-status--fetch-dhl-shipment-status',
  async (
    input: WorkflowInput<{ trackerCodes: string[] }>,
  ): Promise<StepResponse<{ shipmentStatuses: DHLShipmentStatusResponse[] }>> => {
    if (!input.trackerCodes.length) {
      return new StepResponse({ shipmentStatuses: [] })
    }

    const shipmentStatuses = await getShipmentStatusesByTrackerCodes(
      input.baseUrl,
      input.token,
      input.trackerCodes,
      input.debug ? input._logger : undefined,
    )

    if (input.debug && input._logger) {
      input._logger?.debug(`Shipment status response: ${JSON.stringify(shipmentStatuses, null, 2)}`)
    }

    return new StepResponse({ shipmentStatuses })
  },
)

/**
 * Step to update Medusa fulfillment statuses based on DHL tracking events.
 */
const updateMedusaFulfillmentsFromDhl = createStep(
  'sync-dhl-shipment-status--update-medusa-fulfillments-from-dhl',
  async (
    input: WorkflowInput<{
      fulfillments: FulfillmentDTO[]
      shipmentStatuses: DHLShipmentStatusResponse[]
    }>,
    { container },
  ): Promise<StepResponse<{ synced: number }>> => {
    const { result, errors } = await updateFulfillmentStatusWorkflow(container).run({
      input: {
        fulfillments: input.fulfillments,
        shipmentStatuses: input.shipmentStatuses,
        debug: input.debug,
        _logger: input._logger,
      },
    })

    if (errors && errors.length > 0) {
      input._logger?.error(
        `Failed to update fulfillment statuses from DHL. errors: ${JSON.stringify(errors)}`,
      )
      return new StepResponse({ synced: 0 })
    }

    return new StepResponse({ synced: result.updated })
  },
)

/**
 * Workflow to sync shipment status from DHL to Medusa.
 */
const cronSyncShipmentStatusWorkflow = createWorkflow(
  'sync-dhl-shipment-status',
  (input: WorkflowInput<object>): WorkflowResponse<{ synced: number }> => {
    const { fulfillments, trackerCodes } = fetchMedusaFulfillments(input)

    const { shipmentStatuses } = fetchDhlShipmentStatus({ ...input, trackerCodes })

    const { synced } = updateMedusaFulfillmentsFromDhl({
      ...input,
      fulfillments,
      shipmentStatuses,
    })

    return new WorkflowResponse({
      synced,
    })
  },
)

export default cronSyncShipmentStatusWorkflow
