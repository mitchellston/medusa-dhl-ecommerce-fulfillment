import { MedusaContainer } from "@medusajs/framework/types";
import cronSyncShipmentStatusWorkflow from "../workflows/cron-sync-shipment-status";
import { DHL_SETTINGS_MODULE } from "../modules/setting";
import DHLSettingsModuleService from "../modules/setting/service";
import { getAuthToken } from "../dhl-api/auth";

/**
 * Best-effort scheduled job.
 *
 * If you don't have the internal Medusa job runner enabled, you can instead
 * call the admin endpoint `POST /admin/dhl/sync-shipment-status` from an external cron.
 */
export const config = {
  name: "dhl-sync-shipment-status",
  // every 15 minutes
  schedule: "*/15 * * * *",
};

const DHL_BASE_URL = "https://api-gw.dhlparcel.nl";

// Medusa passes a context object containing `container` in most job runner setups.
export default async function handler(container: MedusaContainer) {
  const dhlSettingService = container.resolve(
    DHL_SETTINGS_MODULE
  ) as DHLSettingsModuleService;
  const credentials = await dhlSettingService.getCredentials();

  if (
    !credentials?.user_id ||
    !credentials?.api_key ||
    !credentials?.account_id
  ) {
    return;
  }

  const token = await getAuthToken(
    DHL_BASE_URL,
    credentials.user_id,
    credentials.api_key,
    credentials.account_id
  );

  await cronSyncShipmentStatusWorkflow(container).run({
    input: {
      limit: 50,
      token,
      baseUrl: DHL_BASE_URL,
      debug: credentials.enable_logs,
    },
  });
}
