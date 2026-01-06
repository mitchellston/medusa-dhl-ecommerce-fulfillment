import { Migration } from '@mikro-orm/migrations'

export class Migration202509151059 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
            create table if not exists "dhl_setting" (
                "id" text not null primary key,
                "is_enabled" boolean not null,
                "user_id" text not null,
                "api_key" text not null,
                "account_id" text not null,
                "enable_logs" boolean not null,
                "created_at" timestamptz not null default now(),
                "updated_at" timestamptz not null default now(),
                "deleted_at" timestamptz
            );
        `)
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "dhl_setting" cascade;')
  }
}
