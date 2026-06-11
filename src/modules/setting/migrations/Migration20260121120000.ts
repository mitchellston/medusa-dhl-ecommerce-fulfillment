import { Migration } from '@mikro-orm/migrations'

export class Migration20260121120000 extends Migration {
  async up(): Promise<void> {
    // Add pricing_mode column to dhl_setting table
    this.addSql(`
      ALTER TABLE "dhl_setting"
      ADD COLUMN IF NOT EXISTS "pricing_mode" text NOT NULL DEFAULT 'api';
    `)

    // Create dhl_rate table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "dhl_rate" (
        "id" text NOT NULL PRIMARY KEY,
        "shipping_option_key" text NOT NULL,
        "rate_type" text NOT NULL,
        "country_code" text NOT NULL,
        "parcel_type_key" text,
        "max_weight_kg" real,
        "price" numeric NOT NULL,
        "raw_price" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "dhl_rate_rate_type_check" CHECK ("rate_type" IN ('parcel_type', 'weight'))
      );
    `)

    // Create index for faster lookups
    this.addSql(`
      CREATE INDEX IF NOT EXISTS "idx_dhl_rate_shipping_option_country" 
      ON "dhl_rate" ("shipping_option_key", "country_code");
    `)
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "dhl_rate";`)
    this.addSql(`
      ALTER TABLE "dhl_setting"
      DROP COLUMN IF EXISTS "pricing_mode";
    `)
  }
}
