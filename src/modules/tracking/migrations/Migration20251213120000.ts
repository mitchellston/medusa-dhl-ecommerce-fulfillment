import { Migration } from "@mikro-orm/migrations"

export class Migration20251213120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      create table if not exists "dhl_tracking" (
        "id" text not null primary key,
        "fulfillment_id" text not null,
        "order_id" text,
        "tracker_code" text not null,
        "postal_code" text not null,
        "last_state" text,
        "last_event_at" timestamptz,
        "last_synced_at" timestamptz,
        "shipped_at" timestamptz,
        "delivered_at" timestamptz,
        "last_error" text,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz
      );
    `)

    this.addSql(`
      create index if not exists "dhl_tracking_fulfillment_id_idx" on "dhl_tracking" ("fulfillment_id");
    `)
    this.addSql(`
      create index if not exists "dhl_tracking_tracker_code_idx" on "dhl_tracking" ("tracker_code");
    `)
    this.addSql(`
      create index if not exists "dhl_tracking_delivered_at_idx" on "dhl_tracking" ("delivered_at");
    `)
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "dhl_tracking" cascade;')
  }
}


