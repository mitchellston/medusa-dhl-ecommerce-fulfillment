import { Migration } from '@mikro-orm/migrations'

export class Migration20260107120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE "dhl_setting"
      ADD COLUMN IF NOT EXISTS "webhook_api_key" text,
      ADD COLUMN IF NOT EXISTS "webhook_api_key_header" text NOT NULL DEFAULT 'Authorization';
    `)
  }

  async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "dhl_setting"
      DROP COLUMN IF EXISTS "webhook_api_key",
      DROP COLUMN IF EXISTS "webhook_api_key_header";
    `)
  }
}

