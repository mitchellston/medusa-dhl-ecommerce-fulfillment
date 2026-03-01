import { Migration } from '@mikro-orm/migrations';

export class Migration20260301160126 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "dhl_setting" ("id" text not null, "pricing_mode" text check ("pricing_mode" in ('api', 'manual')) not null default 'manual', "is_enabled" boolean not null, "user_id" text not null, "api_key" text not null, "account_id" text not null, "enable_logs" boolean not null, "item_dimensions_unit" text check ("item_dimensions_unit" in ('mm', 'cm')) not null default 'mm', "item_weight_unit" text check ("item_weight_unit" in ('g', 'kg')) not null default 'g', "webhook_api_key" text null, "webhook_api_key_header" text not null default 'Authorization', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "dhl_setting_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dhl_setting_deleted_at" ON "dhl_setting" (deleted_at) WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "pricing_manual" ("id" text not null, "forConsument" boolean not null, "tarrifType" text check ("tarrifType" in ('packet_type', 'weight', 'pallet')) not null, "tariffValue" text not null, "provider" text not null, "fromCountry" text not null, "toCountry" text not null, "price" integer not null, "validFrom" timestamptz not null, "validTo" timestamptz null, "rateSheetCode" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "pricing_manual_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_pricing_manual_deleted_at" ON "pricing_manual" (deleted_at) WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "pricing_manual_extra" ("id" text not null, "forConsument" boolean not null, "tarrifType" text check ("tarrifType" in ('packet_type', 'weight', 'pallet')) not null, "tariffValue" text not null, "provider" text not null, "fromCountry" text not null, "toCountry" text not null, "price" integer not null, "validFrom" timestamptz not null, "validTo" timestamptz null, "rateSheetCode" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "pricing_manual_extra_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_pricing_manual_extra_deleted_at" ON "pricing_manual_extra" (deleted_at) WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "pricing_manual_extra_services_pricing" ("id" text not null, "service" text not null, "price" integer not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "pricing_manual_extra_services_pricing_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_pricing_manual_extra_services_pricing_deleted_at" ON "pricing_manual_extra_services_pricing" (deleted_at) WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "dhl_setting" cascade;`);

    this.addSql(`drop table if exists "pricing_manual" cascade;`);

    this.addSql(`drop table if exists "pricing_manual_extra" cascade;`);

    this.addSql(`drop table if exists "pricing_manual_extra_services_pricing" cascade;`);
  }

}
