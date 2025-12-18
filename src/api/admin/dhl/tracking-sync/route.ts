import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import syncTrackingWorkflow, { SyncDhlTrackingInput } from '../../../../workflows/sync-tracking'

export type PostDhlTrackingSyncResponse = {
  success: boolean
  synced?: number
  updated?: number
  dry_run?: boolean
  message?: string
}

/**
 * Trigger a DHL tracking sync run.
 * This can be called from an external cron if you don't use Medusa's internal job runner.
 */
export const POST = async (
  req: MedusaRequest<SyncDhlTrackingInput>,
  res: MedusaResponse<PostDhlTrackingSyncResponse>,
) => {
  const input = (req.body ?? {}) as SyncDhlTrackingInput

  const { result } = await syncTrackingWorkflow(req.scope).run({
    input: input ?? {},
  })

  return res.json(result)
}
