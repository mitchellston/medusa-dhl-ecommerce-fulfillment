import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
  type StepExecutionContext,
} from '@medusajs/framework/workflows-sdk'
import { Modules } from '@medusajs/framework/utils'
import { DHLClient } from '../dhl-api/client'
import { inferShipmentState } from '../dhl-api/tracking-state'
import getCredentialsWorkflow from './get-credentials'
import { DHL_TRACKING_MODULE } from '../modules/tracking'
import DhlTrackingModuleService, { TrackingState } from '../modules/tracking/service'

export type SyncDhlTrackingInput = {
  limit?: number
  dry_run?: boolean
}

export type SyncDhlTrackingResult = {
  success: boolean
  synced: number
  updated: number
  dry_run: boolean
  message?: string
}

type ResolvableContainer = Pick<StepExecutionContext['container'], 'resolve'>

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

async function tryMarkShipped(
  container: ResolvableContainer,
  fulfillmentId: string,
  trackingNumber: string,
) {
  const fulfillmentService = container.resolve<unknown>(String(Modules.FULFILLMENT))
  const orderService = container.resolve<unknown>(String(Modules.ORDER))

  // Try a few known/likely shapes across Medusa v2 minor versions.
  const attempts: (() => Promise<void>)[] = []

  const fulfillmentCreateShipment = isRecord(fulfillmentService)
    ? fulfillmentService['createShipment']
    : undefined
  const fulfillmentUpdateFulfillment = isRecord(fulfillmentService)
    ? fulfillmentService['updateFulfillment']
    : undefined

  const orderCreateShipment = isRecord(orderService) ? orderService['createShipment'] : undefined

  if (typeof fulfillmentCreateShipment === 'function') {
    attempts.push(async () => {
      await (fulfillmentCreateShipment as (arg: unknown) => Promise<unknown>)({
        fulfillment_id: fulfillmentId,
        tracking_numbers: [trackingNumber],
      })
    })
    attempts.push(async () => {
      await (fulfillmentCreateShipment as (id: unknown, arg: unknown) => Promise<unknown>)(
        fulfillmentId,
        {
          tracking_numbers: [trackingNumber],
        },
      )
    })
  }

  if (typeof orderCreateShipment === 'function') {
    attempts.push(async () => {
      await (orderCreateShipment as (arg: unknown) => Promise<unknown>)({
        fulfillment_id: fulfillmentId,
        tracking_numbers: [trackingNumber],
      })
    })
    attempts.push(async () => {
      await (orderCreateShipment as (id: unknown, arg: unknown) => Promise<unknown>)(
        fulfillmentId,
        {
          tracking_numbers: [trackingNumber],
        },
      )
    })
  }

  if (typeof fulfillmentUpdateFulfillment === 'function') {
    attempts.push(async () => {
      await (fulfillmentUpdateFulfillment as (id: unknown, patch: unknown) => Promise<unknown>)(
        fulfillmentId,
        { shipment_status: 'shipped' },
      )
    })
    attempts.push(async () => {
      await (fulfillmentUpdateFulfillment as (patch: unknown) => Promise<unknown>)({
        id: fulfillmentId,
        shipment_status: 'shipped',
      })
    })
  }

  if (!attempts.length) {
    throw new Error('Unable to mark fulfillment as shipped (no supported method found)')
  }

  let lastErr: unknown = null
  for (const fn of attempts) {
    try {
      await fn()
      return
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr ?? new Error('Unable to mark fulfillment as shipped')
}

async function tryMarkDelivered(container: ResolvableContainer, fulfillmentId: string) {
  const fulfillmentService = container.resolve<unknown>(String(Modules.FULFILLMENT))
  const orderService = container.resolve<unknown>(String(Modules.ORDER))

  const attempts: (() => Promise<void>)[] = []

  const fulfillmentMarkDelivered = isRecord(fulfillmentService)
    ? fulfillmentService['markFulfillmentAsDelivered']
    : undefined
  const fulfillmentSetDeliveryStatus = isRecord(fulfillmentService)
    ? fulfillmentService['setDeliveryStatus']
    : undefined
  const fulfillmentUpdateFulfillment = isRecord(fulfillmentService)
    ? fulfillmentService['updateFulfillment']
    : undefined

  const orderMarkDelivered = isRecord(orderService)
    ? orderService['markFulfillmentAsDelivered']
    : undefined

  if (typeof fulfillmentMarkDelivered === 'function') {
    attempts.push(async () => {
      await (fulfillmentMarkDelivered as (id: unknown) => Promise<unknown>)(fulfillmentId)
    })
  }

  if (typeof fulfillmentSetDeliveryStatus === 'function') {
    attempts.push(async () => {
      await (fulfillmentSetDeliveryStatus as (id: unknown, status: unknown) => Promise<unknown>)(
        fulfillmentId,
        'delivered',
      )
    })
  }

  if (typeof fulfillmentUpdateFulfillment === 'function') {
    attempts.push(async () => {
      await (fulfillmentUpdateFulfillment as (id: unknown, patch: unknown) => Promise<unknown>)(
        fulfillmentId,
        { delivery_status: 'delivered' },
      )
    })
    attempts.push(async () => {
      await (fulfillmentUpdateFulfillment as (patch: unknown) => Promise<unknown>)({
        id: fulfillmentId,
        delivery_status: 'delivered',
      })
    })
  }

  if (typeof orderMarkDelivered === 'function') {
    attempts.push(async () => {
      await (orderMarkDelivered as (id: unknown) => Promise<unknown>)(fulfillmentId)
    })
  }

  if (!attempts.length) {
    throw new Error('Unable to mark fulfillment as delivered (no supported method found)')
  }

  let lastErr: unknown = null
  for (const fn of attempts) {
    try {
      await fn()
      return
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr ?? new Error('Unable to mark fulfillment as delivered')
}

const syncTrackingStep = createStep<SyncDhlTrackingInput, SyncDhlTrackingResult, undefined>(
  'sync-dhl-tracking',
  async (input: SyncDhlTrackingInput, ctx: StepExecutionContext) => {
    const { container } = ctx
    const trackingService: DhlTrackingModuleService = container.resolve(DHL_TRACKING_MODULE)

    const { result: credentials } = await getCredentialsWorkflow(container).run({ input: {} })
    if (!credentials?.user_id || !credentials?.api_key || !credentials?.account_id) {
      const result: SyncDhlTrackingResult = {
        success: false,
        message: 'Missing DHL credentials (set them in Admin > Settings > DHL)',
        synced: 0,
        updated: 0,
        dry_run: !!input.dry_run,
      }
      return new StepResponse(result)
    }

    const client = new DHLClient({
      userId: credentials.user_id,
      key: credentials.api_key,
      accountId: credentials.account_id,
      enableLogs: !!credentials.enable_logs,
    })

    const limit = input.limit ?? 50
    const dryRun = !!input.dry_run

    const rows = await trackingService.listPendingSync({ limit })

    let synced = 0
    let updated = 0

    for (const row of rows as unknown[]) {
      if (!isRecord(row)) continue
      synced++
      const now = new Date()

      try {
        const trackerCode = String(row['tracker_code'] ?? '')
        const postalCode = String(row['postal_code'] ?? '')
        const rowId = String(row['id'] ?? '')
        const fulfillmentId = String(row['fulfillment_id'] ?? '')

        if (!trackerCode || !postalCode || !rowId || !fulfillmentId) {
          continue
        }

        const tracking = await client.trackShipment(trackerCode, postalCode)
        const { state, lastEventAt } = inferShipmentState(tracking)

        // Persist tracking sync metadata first (so we can observe it even on Medusa update failures).
        await trackingService.updateSyncResult(rowId, {
          last_state: state as TrackingState,
          last_event_at: lastEventAt,
          last_synced_at: now,
          last_error: null,
        })

        const shouldMarkShipped = state === 'in_transit' && !row['shipped_at']
        const shouldMarkDelivered = state === 'delivered' && !row['delivered_at']

        if (dryRun) continue

        if (shouldMarkShipped) {
          await tryMarkShipped(container, fulfillmentId, trackerCode)
          await trackingService.updateSyncResult(rowId, { shipped_at: now })
          updated++
        }

        if (shouldMarkDelivered) {
          // Delivered implies shipped as well
          if (!row['shipped_at']) {
            try {
              await tryMarkShipped(container, fulfillmentId, trackerCode)
              await trackingService.updateSyncResult(rowId, { shipped_at: now })
            } catch {
              // best effort; delivered update below is the key part
            }
          }
          await tryMarkDelivered(container, fulfillmentId)
          await trackingService.updateSyncResult(rowId, { delivered_at: now })
          updated++
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const rowId = isRecord(row) ? String(row['id'] ?? '') : ''
        if (!rowId) continue
        await trackingService.updateSyncResult(rowId, {
          last_synced_at: now,
          last_error: msg,
        })
      }
    }

    return new StepResponse({
      success: true,
      synced,
      updated,
      dry_run: dryRun,
      message: undefined,
    })
  },
)

const syncTrackingWorkflow = createWorkflow(
  'sync-dhl-tracking',
  (input: SyncDhlTrackingInput): WorkflowResponse<SyncDhlTrackingResult> => {
    const out = syncTrackingStep(input)
    return new WorkflowResponse(out)
  },
)

export default syncTrackingWorkflow
