import {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { PostDHLSettings } from "./validator"
import { TransactionStepError } from "@medusajs/framework/orchestration"
import { z } from "zod"
import getCredentialsWorkflow from "../../../workflows/get-credentials"
import setupCredentialsWorkflow from "../../../workflows/setup-credentials"

export type SetupCredentialsInput = z.infer<typeof PostDHLSettings>

export type SetupCredentialsResponse = {
    success: boolean
    input: SetupCredentialsInput
    errors?: TransactionStepError[] | string[]
}

/**
 * API endpoint for setting up DHL credentials
 * @param req MedusaRequest<SetupCredentialsInput>
 * @param res MedusaResponse<SetupCredentialsResponse>
 * @returns MedusaResponse<SetupCredentialsResponse>
 */
export const POST = async (
  req: MedusaRequest<SetupCredentialsInput>,
  res: MedusaResponse<SetupCredentialsResponse>
) => {
  try {
    const input: SetupCredentialsInput = req.body

    const { result, errors } = await setupCredentialsWorkflow(req.scope)
      .run({
        input
      })

    if ((errors && errors.length > 0) || !result) {
      return res.status(400).json({
          success: false,
          input,
          errors
      })
    }

    res.json(result)
  } catch (error) {
    console.error("Error setting up DHL credentials:", error);
    return res.status(500).json({
      success: false,
      errors: ["Internal Server Error"],
      input: req.validatedBody
    });
  }
}

/**
 * Get DHL credentials from the settings module.
 * @param req MedusaRequest
 * @param res MedusaResponse
 * @returns MedusaResponse<SetupCredentialsInput | {}>
 */
export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse<SetupCredentialsInput | null>
) => {
  try {
      const { result, errors } = await getCredentialsWorkflow()
        .run({
          input: {}
        })

      if ((errors && errors.length > 0)) {
        console.log("Errors getting DHL credentials:", JSON.stringify(errors, null, 2));
        return res.status(400).json(null)
      }

      res.json(result);
  } catch (error) {
    console.log("Error getting DHL credentials:", error);
    return res.status(500).json(null);
  }
}

