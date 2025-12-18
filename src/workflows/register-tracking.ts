import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { DHL_TRACKING_MODULE } from "../modules/tracking"
import DhlTrackingModuleService, { UpsertTrackingInput } from "../modules/tracking/service"

const registerTrackingStep = createStep(
  "register-dhl-tracking",
  async (input: UpsertTrackingInput, { container }) => {
    const trackingService: DhlTrackingModuleService = container.resolve(DHL_TRACKING_MODULE)
    const result = await trackingService.upsertTracking(input)
    return new StepResponse(result)
  }
)

const registerTrackingWorkflow = createWorkflow(
  "register-dhl-tracking",
  (input: UpsertTrackingInput) => {
    const out = registerTrackingStep(input)
    return new WorkflowResponse(out)
  }
)

export default registerTrackingWorkflow


