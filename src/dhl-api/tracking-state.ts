import type { DHLTrackingResponse, DHLTrackingEvent } from "./types"

export type InferredShipmentState = "unknown" | "in_transit" | "delivered"

function eventText(e: DHLTrackingEvent): string {
  return `${e.status ?? ""} ${e.description ?? ""}`.trim()
}

/**
 * DHL eCommerce tracking event contents can differ per product/country.
 * We use resilient keyword matching (status + description) to infer the state.
 */
export function inferShipmentState(
  tracking: DHLTrackingResponse
): { state: InferredShipmentState; lastEventAt: Date | null } {
  const notifications = tracking.notifications ?? []

  let lastEventAt: Date | null = null
  for (const n of notifications) {
    if (!n.dateTime) continue
    const dt = new Date(n.dateTime)
    if (!Number.isNaN(dt.getTime())) {
      if (!lastEventAt || dt > lastEventAt) lastEventAt = dt
    }
  }

  const texts = [
    tracking.title ?? "",
    ...notifications.map(eventText),
  ]
    .join(" ")
    .toLowerCase()

  // Delivered keywords (English + Dutch)
  const delivered =
    /delivered|delivered to|afgeleverd|bezorgd|uitgeleverd|geleverd/.test(texts)

  if (delivered) {
    return { state: "delivered", lastEventAt }
  }

  // In-transit keywords (broad)
  const inTransit =
    /in transit|sorted|processing|processed|handed over|picked up|out for delivery|onderweg|gesorteerd|bezorging|bezorgd bij|verzonden/.test(
      texts
    )

  if (inTransit) {
    return { state: "in_transit", lastEventAt }
  }

  return { state: "unknown", lastEventAt }
}


