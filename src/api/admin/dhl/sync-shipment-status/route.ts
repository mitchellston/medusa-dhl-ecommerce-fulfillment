import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import cronSyncShipmentStatusWorkflow from '../../../../workflows/cron-sync-shipment-status'
import { DHL_SETTINGS_MODULE } from '../../../../modules/setting'
import DHLSettingsModuleService from '../../../../modules/setting/service'
import { getAuthToken } from '../../../../dhl-api/auth'

export type PostDhlTrackingSyncResponse = {
  synced: number
}

const DHL_BASE_URL = 'https://api-gw.dhlparcel.nl'

/**
 * Trigger a DHL tracking sync run.
 * This can be called from an external cron if you don't use Medusa's internal job runner.
 */
export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse<PostDhlTrackingSyncResponse>,
) => {
  const dhlSettingService = req.scope.resolve(DHL_SETTINGS_MODULE) as DHLSettingsModuleService
  const credentials = await dhlSettingService.getCredentials()
  if (!credentials?.user_id || !credentials?.api_key || !credentials?.account_id) {
    return res.status(400).json({ synced: 0 })
  }

  const token = await getAuthToken(
    DHL_BASE_URL,
    credentials.user_id,
    credentials.api_key,
    credentials.account_id,
  )

  const { result, errors } = await cronSyncShipmentStatusWorkflow(req.scope).run({
    input: {
      limit: 50,
      token,
      baseUrl: DHL_BASE_URL,
      debug: credentials.enable_logs,
    },
  })

  if (errors && errors.length > 0) {
    return res.status(400).json({
      synced: 0,
    })
  }

  return res.json(result)
}
