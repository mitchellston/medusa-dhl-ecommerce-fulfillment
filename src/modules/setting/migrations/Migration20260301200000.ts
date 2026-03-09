import { Migration } from '@mikro-orm/migrations'

export class Migration20260301200000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "pricing_manual" alter column "price" type real using "price"::real;`,
    )
    this.addSql(
      `alter table "pricing_manual_extra" alter column "price" type real using "price"::real;`,
    )
    this.addSql(
      `alter table "pricing_manual_extra_services_pricing" alter column "price" type real using "price"::real;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "pricing_manual" alter column "price" type integer using "price"::integer;`,
    )
    this.addSql(
      `alter table "pricing_manual_extra" alter column "price" type integer using "price"::integer;`,
    )
    this.addSql(
      `alter table "pricing_manual_extra_services_pricing" alter column "price" type integer using "price"::integer;`,
    )
  }
}
