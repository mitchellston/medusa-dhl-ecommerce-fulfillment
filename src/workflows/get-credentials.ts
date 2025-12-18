import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

import { DHL_SETTINGS_MODULE } from "../modules/setting";
import { DhlSettingsInput } from "../modules/setting/schema";
import DhlSettingsModuleService from "../modules/setting/service";

/**
 * Get DHL credentials from the settings module.
 * @returns StepResponse<DhlSettingsInput | null>
 */
const getDatabaseCredentials = createStep(
  "get-dhl-database-credentials",
  async (
    _input,
    { container }
  ): Promise<StepResponse<DhlSettingsInput | null>> => {
    try {
      const dhlSettingService: DhlSettingsModuleService = container.resolve(DHL_SETTINGS_MODULE)
      const result = await dhlSettingService.getCredentials();
      return new StepResponse(result);
    } catch (error) {
      console.error("Error getting DHL credentials from database:", error);
      return new StepResponse(null);
    }
  }
);

/**
 * Create the workflow for getting DHL credentials.
 * @returns WorkflowResponse<DhlSettingsInput | null>
 */
const getCredentialsWorkflow = createWorkflow(
  "get-dhl-credentials",
  () => {
    const databaseCredentials = getDatabaseCredentials();
    return new WorkflowResponse(databaseCredentials);
  }
);

export default getCredentialsWorkflow;
