import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from '@medusajs/framework/workflows-sdk'

import { DHL_SETTINGS_MODULE } from '../modules/setting'
import { SetupCredentialsInput, SetupCredentialsResponse } from '../api/admin/dhl/route'
import DHLSettingsModuleService from '../modules/setting/service'

/**
 * Save credentials in the database
 * @param input The credentials to save.
 * @returns True if the credentials were saved successfully, false otherwise.
 */
const saveCredentials = createStep(
  'save-dhl-credentials',
  async (input: SetupCredentialsInput, { container }): Promise<StepResponse<boolean>> => {
    const dhlSettingService: DHLSettingsModuleService = container.resolve(DHL_SETTINGS_MODULE)
    const result = await dhlSettingService.updateCredentials(input)
    return new StepResponse(result)
  },
)

/**
 * Sets up the DHL API credentials.
 * @param input The credentials to set up.
 * @returns The result of the setup process.
 */
const setupCredentialsWorkflow = createWorkflow(
  'setup-dhl-credentials',
  (input: SetupCredentialsInput): WorkflowResponse<SetupCredentialsResponse> => {
    const success = saveCredentials(input)
    return new WorkflowResponse({
      success,
      input,
    })
  },
)

export default setupCredentialsWorkflow
