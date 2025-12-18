import { MedusaService } from '@medusajs/framework/utils'
import { DhlTracking } from './models/tracking'

export type UpsertTrackingInput = {
  fulfillment_id: string
  order_id?: string | null
  tracker_code: string
  postal_code: string
}

export type TrackingState = 'unknown' | 'in_transit' | 'delivered'

class DhlTrackingModuleService extends MedusaService({
  DhlTracking,
}) {
  async upsertTracking(input: UpsertTrackingInput) {
    const normalizedPostalCode = input.postal_code.replace(/\s+/g, '').toUpperCase()
    const normalizedTrackerCode = input.tracker_code.trim()

    const existing = await this.listDhlTrackings({
      fulfillment_id: input.fulfillment_id,
      tracker_code: normalizedTrackerCode,
    })

    if (existing.length) {
      return await this.updateDhlTrackings({
        id: existing[0].id,
        order_id: input.order_id ?? existing[0].order_id ?? null,
        postal_code: normalizedPostalCode,
      })
    }

    return await this.createDhlTrackings({
      fulfillment_id: input.fulfillment_id,
      order_id: input.order_id ?? null,
      tracker_code: normalizedTrackerCode,
      postal_code: normalizedPostalCode,
      last_state: 'unknown',
    })
  }

  async listPendingSync({ limit = 50 }: { limit?: number } = {}) {
    // Only sync shipments that are not delivered yet
    return await this.listDhlTrackings(
      { delivered_at: null },
      {
        take: limit,
        order: { updated_at: 'ASC' },
      },
    )
  }

  async updateSyncResult(
    id: string,
    patch: Partial<{
      last_state: TrackingState
      last_event_at: Date | null
      last_synced_at: Date | null
      shipped_at: Date | null
      delivered_at: Date | null
      last_error: string | null
    }>,
  ) {
    return await this.updateDhlTrackings({
      id,
      ...patch,
    })
  }
}

export default DhlTrackingModuleService
