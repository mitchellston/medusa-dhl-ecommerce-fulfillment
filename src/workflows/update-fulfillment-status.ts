import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
  transform,
  WorkflowData,
} from '@medusajs/framework/workflows-sdk'
import { FulfillmentDTO, Logger } from '@medusajs/framework/types'
import { DHLShipmentStatusEvent, DHLShipmentStatusResponse } from '../dhl-api/types'
import { markOrderFulfillmentAsDeliveredWorkflow } from '@medusajs/medusa/core-flows'
import { updateFulfillmentWorkflow } from '@medusajs/medusa/core-flows'

type WorkflowInput<T extends object> = T & {
  fulfillments: FulfillmentDTO[]
  shipmentStatuses: DHLShipmentStatusResponse[]
  debug?: boolean
  _logger?: Logger
}

type FulfillmentWithOrder = {
  id: string
  order?: { id: string } | null
}

const updateFulfillmentByTrackingCode = createStep(
  'update-fulfillment-status--update-fulfillment-by-tracking-code',
  async (
    input: WorkflowInput<{ trackerCodes: WorkflowData<string[]> }>,
  ): Promise<
    StepResponse<{
      trackingCodeWithLatestStatus: Map<
        string,
        { shipped: Date | undefined; delivered: Date | undefined }
      >
    }>
  > => {
    const trackingCodeWithLatestStatus = new Map<
      string,
      { shipped: Date | undefined; delivered: Date | undefined }
    >()
    for (const shipmentStatus of input.shipmentStatuses) {
      if (!shipmentStatus.events) {
        continue
      }

      let shippedAt: Date | undefined
      let deliveredAt: Date | undefined
      for (const event of shipmentStatus.events) {
        const eventStatus = event.status as DHLShipmentStatusEvent | undefined
        const timestamp = event.timestamp ? new Date(event.timestamp) : undefined
        if (!eventStatus || !timestamp) {
          continue
        }
        if (
          eventStatus === 'CUSTOMS' ||
          eventStatus === 'IN DELIVERY' ||
          eventStatus === 'IN_DELIVERY'
        ) {
          shippedAt = timestamp
        } else if (eventStatus === 'DELIVERED') {
          deliveredAt = timestamp
        }
      }

      const shipmentTrackerCodes = new Set<string>(
        [shipmentStatus.barcode, ...(shipmentStatus.barcodes ?? [])].filter((v) => v !== undefined),
      )
      input.trackerCodes.map((trackerCode) => {
        if (shipmentTrackerCodes.has(trackerCode)) {
          if (input._logger && trackingCodeWithLatestStatus.has(trackerCode)) {
            const existing = trackingCodeWithLatestStatus.get(trackerCode)
            input._logger.warn(
              `Multiple status events found for tracker code ${trackerCode} shippedAt: ${shippedAt} deliveredAt: ${deliveredAt} and existing: shippedAt: ${existing?.shipped} deliveredAt: ${existing?.delivered}`,
            )
          }

          trackingCodeWithLatestStatus.set(trackerCode, {
            delivered: deliveredAt,
            shipped: shippedAt,
          })
        }
      })
    }

    return new StepResponse({ trackingCodeWithLatestStatus })
  },
)

const fetchOrderIdsForFulfillments = createStep(
  'update-fulfillment-status--fetch-order-ids-for-fulfillments',
  async (
    input: WorkflowInput<object>,
    { container },
  ): Promise<StepResponse<{ fulfillmentIdToOrderId: Map<string, string> }>> => {
    const fulfillmentIds = input.fulfillments.map((f) => f.id)

    const query = container.resolve('query') as {
      graph: (args: {
        entity: string
        fields: string[]
        filters: Record<string, unknown>
      }) => Promise<{ data: FulfillmentWithOrder[] }>
    }

    const { data } = await query.graph({
      entity: 'fulfillment',
      fields: ['id', 'order.id'],
      filters: {
        id: fulfillmentIds,
      },
    })

    const fulfillmentIdToOrderId = new Map<string, string>()
    for (const fulfillment of data) {
      const orderId = fulfillment.order?.id
      if (orderId) {
        fulfillmentIdToOrderId.set(fulfillment.id, orderId)
      }
    }

    return new StepResponse({ fulfillmentIdToOrderId })
  },
)

const updateFulfillmentStatus = createStep(
  'update-fulfillment-status--update-fulfillment-status',
  async (
    input: WorkflowInput<{
      trackingCodeWithLatestStatus: Map<
        string,
        { shipped: Date | undefined; delivered: Date | undefined }
      >
      fulfillmentIdToOrderId: Map<string, string>
    }>,
    { container },
  ): Promise<StepResponse<{ fulfillments: FulfillmentDTO[] }>> => {
    for (const fulfillment of input.fulfillments) {
      let deliveredAt: Date | undefined
      let shippedAt: Date | undefined
      for (const label of fulfillment.labels) {
        const trackingCodeWithLatestStatus = input.trackingCodeWithLatestStatus.get(
          label.tracking_number,
        )
        if (!trackingCodeWithLatestStatus) {
          continue
        }
        if (trackingCodeWithLatestStatus.delivered) {
          deliveredAt = trackingCodeWithLatestStatus.delivered
        }
        if (trackingCodeWithLatestStatus.shipped) {
          shippedAt = trackingCodeWithLatestStatus.shipped
        }
      }

      if (shippedAt) {
        await updateFulfillmentWorkflow(container).run({
          input: {
            id: fulfillment.id,
            shipped_at: shippedAt,
          },
        })
      }

      if (deliveredAt) {
        const orderId = input.fulfillmentIdToOrderId.get(fulfillment.id)
        if (!orderId) {
          input._logger?.warn(
            `Skipping marking fulfillment ${fulfillment.id} as delivered because orderId could not be resolved`,
          )
          continue
        }

        await markOrderFulfillmentAsDeliveredWorkflow(container).run({
          input: {
            fulfillmentId: fulfillment.id,
            orderId,
          },
        })
      }
    }

    return new StepResponse({ fulfillments: input.fulfillments })
  },
)

/**
 * Workflow to update Medusa fulfillment status based on DHL tracking events.
 */
const updateFulfillmentStatusWorkflow = createWorkflow(
  'update-fulfillment-status',
  (input: WorkflowInput<object>): WorkflowResponse<{ updated: number }> => {
    const trackerCodes = transform(input.fulfillments, (data) => {
      return data
        .map((fulfillment) => fulfillment.labels.map((label) => label.tracking_number))
        .flat()
    })

    const { trackingCodeWithLatestStatus } = updateFulfillmentByTrackingCode({
      ...input,
      trackerCodes,
    })

    const { fulfillmentIdToOrderId } = fetchOrderIdsForFulfillments(input)

    const { fulfillments } = updateFulfillmentStatus({
      ...input,
      trackingCodeWithLatestStatus,
      fulfillmentIdToOrderId,
    })

    return new WorkflowResponse({
      updated: fulfillments.length,
    })
  },
)

export default updateFulfillmentStatusWorkflow
