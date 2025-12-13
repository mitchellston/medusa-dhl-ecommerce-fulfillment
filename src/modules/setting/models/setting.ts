import { model } from "@medusajs/framework/utils"

export const DhlSetting = model.define(
    "dhl_setting",
    {
        id: model.id().primaryKey(),
        is_enabled: model.boolean(),
        user_id: model.text(),
        api_key: model.text(),
        account_id: model.text(),
        enable_logs: model.boolean(),
    }
)
