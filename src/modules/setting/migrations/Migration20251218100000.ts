import { Migration } from "@mikro-orm/migrations"

export class Migration20251218100000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      alter table "dhl_setting"
      add column if not exists "boxes" jsonb not null default '[]'::jsonb;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`
      alter table "dhl_setting"
      drop column if exists "boxes";
    `)
  }
}


