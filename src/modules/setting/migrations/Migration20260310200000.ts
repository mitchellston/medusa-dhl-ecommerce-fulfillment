import { Migration } from '@mikro-orm/migrations'

export class Migration20260310200000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE "dhl_setting"
      ADD COLUMN IF NOT EXISTS "pricing_mode" text check ("pricing_mode" in ('api', 'manual')) NOT NULL DEFAULT 'manual';
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "dhl_setting"
      DROP COLUMN IF EXISTS "pricing_mode";
    `)
  }
}
