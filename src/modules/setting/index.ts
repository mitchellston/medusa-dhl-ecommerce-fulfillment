import { Module } from '@medusajs/framework/utils'
import DHLSettingsModuleService from './service'

export const DHL_SETTINGS_MODULE = 'dhl_settings'

export default Module(DHL_SETTINGS_MODULE, {
  service: DHLSettingsModuleService,
})
