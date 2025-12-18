import { model } from "@medusajs/framework/utils"

export const DhlTracking = model.define("dhl_tracking", {
  id: model.id().primaryKey(),

  fulfillment_id: model.text(),
  order_id: model.text().nullable(),

  tracker_code: model.text(),
  postal_code: model.text(),

  /**
   * Our last inferred state from DHL tracking events.
   * We keep it simple and only care about shipped/delivered automation.
   */
  last_state: model.text().nullable(), // "unknown" | "in_transit" | "delivered"
  last_event_at: model.dateTime().nullable(),
  last_synced_at: model.dateTime().nullable(),

  shipped_at: model.dateTime().nullable(),
  delivered_at: model.dateTime().nullable(),

  last_error: model.text().nullable(),
})


