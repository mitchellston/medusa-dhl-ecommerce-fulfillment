import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { FulfillmentDTO, Logger } from '@medusajs/framework/types'
import { DHL_SETTINGS_MODULE } from '../../../../modules/setting'
import DHLSettingsModuleService from '../../../../modules/setting/service'
import updateFulfillmentStatusWorkflow from '../../../../workflows/update-fulfillment-status'
import { DHLWebhookEventBody, DHLShipmentStatusResponse } from '../../../../dhl-api/types'

type FulfillmentWithLabels = {
  id: string
  labels: { tracking_number: string }[]
}

type QueryGraph = {
  graph: (args: {
    entity: string
    fields: string[]
    filters: Record<string, unknown>
  }) => Promise<{ data: FulfillmentWithLabels[] }>
}

/**
 * Validates if the request body is a valid DHLWebhookEventBody.
 * Performs minimal runtime checks to ensure type safety.
 */
function isValidWebhookBody(body: unknown): body is DHLWebhookEventBody {
  if (typeof body !== 'object' || body === null) {
    return false
  }

  const payload = body as Record<string, unknown>

  // Check required fields per the swagger spec: created, totalEvents, isReturn
  if (typeof payload.created !== 'string' && payload.created !== undefined) {
    return false
  }

  // barcode and barcodes are the key fields we need
  if (payload.barcode !== undefined && typeof payload.barcode !== 'string') {
    return false
  }

  if (payload.barcodes !== undefined && !Array.isArray(payload.barcodes)) {
    return false
  }

  return true
}

/**
 * Extracts tracker codes from the webhook payload.
 */
function extractTrackerCodes(body: DHLWebhookEventBody): string[] {
  const codes = new Set<string>()

  if (body.barcode) {
    codes.add(body.barcode)
  }

  if (body.barcodes) {
    for (const code of body.barcodes) {
      if (code) {
        codes.add(code)
      }
    }
  }

  return Array.from(codes)
}

/**
 * Maps the webhook payload to the DHLShipmentStatusResponse format
 * expected by the updateFulfillmentStatusWorkflow.
 */
function mapWebhookToShipmentStatus(body: DHLWebhookEventBody): DHLShipmentStatusResponse {
  return {
    barcode: body.barcode,
    barcodes: body.barcodes,
    events: body.events?.map((event) => ({
      status: event.status,
      timestamp: event.timestamp,
      category: event.category,
      type: event.type,
    })),
  } as DHLShipmentStatusResponse
}

/**
 * Webhook endpoint for receiving DHL Track & Trace push notifications.
 * POST /store/dhl/webhook
 *
 * This endpoint:
 * 1. Validates the request using the configured webhook API key
 * 2. Finds fulfillments matching the tracking codes in the payload
 * 3. Runs the updateFulfillmentStatusWorkflow in the background
 * 4. Returns quickly to acknowledge the webhook
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const logger = req.scope.resolve<Logger>('logger')

  // Resolve settings to get webhook configuration
  const dhlSettingsService: DHLSettingsModuleService = req.scope.resolve(DHL_SETTINGS_MODULE)
  const settings = await dhlSettingsService.getCredentials()

  if (!settings) {
    logger.warn('[DHL Webhook] No DHL settings configured')
    return res.sendStatus(500)
  }

  const { webhook_api_key, webhook_api_key_header, enable_logs } = settings

  // Check if webhook is configured
  if (!webhook_api_key) {
    logger.warn('[DHL Webhook] Webhook API key not configured')
    return res.sendStatus(500)
  }

  // Validate the webhook API key from the configured header
  const headerName = webhook_api_key_header || 'Authorization'
  const headerValue = req.headers[headerName.toLowerCase()]

  if (!headerValue || typeof headerValue !== 'string') {
    if (enable_logs) {
      logger.warn(`[DHL Webhook] Missing or invalid ${headerName} header`)
    }
    return res.sendStatus(401)
  }

  // Compare the header value with the configured API key
  // Strip common prefixes like "Bearer " if present
  const providedKey = headerValue.replace(/^Bearer\s+/i, '').trim()

  if (providedKey !== webhook_api_key) {
    if (enable_logs) {
      logger.warn('[DHL Webhook] Invalid API key provided')
    }
    return res.sendStatus(401)
  }

  // Validate and parse the request body
  if (!isValidWebhookBody(req.body)) {
    if (enable_logs) {
      logger.warn('[DHL Webhook] Invalid webhook payload structure')
    }
    return res.sendStatus(400)
  }

  const webhookBody = req.body

  // Extract tracker codes from the payload
  const trackerCodes = extractTrackerCodes(webhookBody)

  if (trackerCodes.length === 0) {
    if (enable_logs) {
      logger.warn('[DHL Webhook] No tracker codes found in webhook payload')
    }
    return res.sendStatus(400)
  }

  if (enable_logs) {
    logger.info(`[DHL Webhook] Received webhook for tracker codes: ${trackerCodes.join(', ')}`)
  }

  // Query fulfillments by tracking number
  const query = req.scope.resolve<QueryGraph>('query')

  const { data: fulfillments } = await query.graph({
    entity: 'fulfillment',
    fields: ['id', 'labels.tracking_number'],
    filters: {
      provider_id: 'dhl',
      labels: {
        tracking_number: trackerCodes,
      },
    },
  })

  // Filter to only fulfillments that have matching tracking numbers
  const matchingFulfillments = fulfillments.filter((fulfillment) =>
    fulfillment.labels.some((label) => trackerCodes.includes(label.tracking_number)),
  )

  if (matchingFulfillments.length === 0) {
    if (enable_logs) {
      logger.info(
        `[DHL Webhook] No fulfillments found for tracker codes: ${trackerCodes.join(', ')}`,
      )
    }
    // Return 404 to signal DHL that we don't know this parcel
    return res.sendStatus(404)
  }

  if (enable_logs) {
    logger.info(
      `[DHL Webhook] Found ${matchingFulfillments.length} fulfillment(s) for tracker codes`,
    )
  }

  // Acknowledge quickly, then run the workflow in the background
  res.sendStatus(200)

  // Map the webhook payload to the expected format
  const shipmentStatus = mapWebhookToShipmentStatus(webhookBody)

  // Run the workflow in the background (don't await)
  updateFulfillmentStatusWorkflow(req.scope)
    .run({
      input: {
        fulfillments: matchingFulfillments as FulfillmentDTO[],
        shipmentStatuses: [shipmentStatus],
        debug: enable_logs,
        _logger: enable_logs ? logger : undefined,
      },
    })
    .then((result) => {
      if (enable_logs) {
        logger.info(`[DHL Webhook] Workflow completed, updated ${result.result.updated} fulfillment(s)`)
      }
    })
    .catch((error) => {
      logger.error(`[DHL Webhook] Workflow failed: ${error instanceof Error ? error.message : String(error)}`)
    })
}

