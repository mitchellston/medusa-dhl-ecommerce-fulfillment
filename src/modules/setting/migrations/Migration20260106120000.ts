import { Migration } from '@mikro-orm/migrations'

export class Migration20260106120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE "dhl_setting"
      ADD COLUMN IF NOT EXISTS "item_dimensions_unit" text NOT NULL DEFAULT 'mm',
      ADD COLUMN IF NOT EXISTS "item_weight_unit" text NOT NULL DEFAULT 'g';
    `)
  }

  async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "dhl_setting"
      DROP COLUMN IF EXISTS "item_dimensions_unit",
      DROP COLUMN IF EXISTS "item_weight_unit";
    `)
  }
}
