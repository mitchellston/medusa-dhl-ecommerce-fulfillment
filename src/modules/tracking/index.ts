import { Module } from "@medusajs/framework/utils"
import DhlTrackingModuleService from "./service"

export const DHL_TRACKING_MODULE = "dhl_tracking"

export default Module(DHL_TRACKING_MODULE, {
  service: DhlTrackingModuleService,
})


