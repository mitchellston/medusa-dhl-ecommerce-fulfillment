import { DhlSetting } from './models/setting'
import { MedusaService } from '@medusajs/framework/utils'
import { SetupCredentialsInput } from '../../api/admin/dhl/route'

class DhlSettingsModuleService extends MedusaService({
  DhlSetting,
}) {
  /**
   * Updates the DHL API credentials.
   * @param input The new credentials to set.
   * @returns True if the update was successful, false otherwise.
   */
  async updateCredentials(input: SetupCredentialsInput): Promise<boolean> {
    const dhlSettings = await this.listDhlSettings()
    if (dhlSettings.length) {
      // Update the existing DHL settings
      const result = await this.updateDhlSettings({
        ...input,
        id: dhlSettings[0].id,
      })
      return !!result
    } else {
      // Create new DHL settings
      const result = await this.createDhlSettings(input)
      return !!result
    }
  }

  /**
   * Retrieves the DHL API credentials.
   * @returns The DHL API credentials or null if not found.
   */
  async getCredentials(): Promise<SetupCredentialsInput | null> {
    const dhlSettings = await this.listDhlSettings()
    if (dhlSettings.length) {
      return dhlSettings[0]
    }
    return null
  }
}

export default DhlSettingsModuleService
