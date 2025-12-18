import { DhlSetting } from './models/setting'
import { MedusaService } from '@medusajs/framework/utils'
import { DhlSettingsInput } from './schema'

class DhlSettingsModuleService extends MedusaService({
  DhlSetting,
}) {
  private normalizeBoxes(raw: unknown): DhlSettingsInput["boxes"] {
    return Array.isArray(raw) ? (raw as DhlSettingsInput["boxes"]) : []
  }

  /**
   * Updates the DHL API credentials.
   * @param input The new credentials to set.
   * @returns True if the update was successful, false otherwise.
   */
  async updateCredentials(input: DhlSettingsInput): Promise<boolean> {
    const dhlSettings = await this.listDhlSettings()
    if (dhlSettings.length) {
      // Update the existing DHL settings
      const result = await this.updateDhlSettings({
        ...input,
        // Medusa's `model.json()` is typed as `Record<string, unknown>`, but we store a JSON array.
        // Normalize at runtime and cast for the service call.
        boxes: (input.boxes ?? this.normalizeBoxes((dhlSettings[0] as any).boxes)) as any,
        id: dhlSettings[0].id,
      })
      return !!result
    } else {
      // Create new DHL settings
      const result = await this.createDhlSettings({
        ...input,
        boxes: (input.boxes ?? []) as any,
      })
      return !!result
    }
  }

  /**
   * Retrieves the DHL API credentials.
   * @returns The DHL API credentials or null if not found.
   */
  async getCredentials(): Promise<DhlSettingsInput | null> {
    const dhlSettings = await this.listDhlSettings()
    if (dhlSettings.length) {
      return {
        ...dhlSettings[0],
        boxes: this.normalizeBoxes((dhlSettings[0] as any).boxes),
      }
    }
    return null
  }
}

export default DhlSettingsModuleService
