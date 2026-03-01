export type TarrifType = 'packet_type' | 'weight' | 'pallet'

export interface PricingRecord {
  id: string
  forConsument: boolean
  tarrifType: TarrifType
  tariffValue: string
  provider: string
  fromCountry: string
  toCountry: string
  price: number
  validFrom: Date
  validTo: Date | null
  rateSheetCode: string | null
  created_at?: Date
  updated_at?: Date
  deleted_at?: Date | null
}

export interface ExtraServiceRecord {
  id: string
  service: string
  price: number
  created_at?: Date
  updated_at?: Date
  deleted_at?: Date | null
}

export type ImportMode = 'upsert' | 'new_version'

export interface ParsedPricingRow {
  forConsument: boolean
  tarrifType: TarrifType
  tariffValue: string
  provider: string
  fromCountry: string
  toCountry: string
  price: number
  validFrom: string
  validTo: string | null
  rateSheetCode: string
  targetTable: 'pricing_manual' | 'pricing_manual_extra'
  rowIndex: number
  warnings: string[]
  errors: string[]
  isDuplicate: boolean
  selected: boolean
}

export interface ParseResult {
  rows: ParsedPricingRow[]
  rateSheetCode: string
  validFrom: string
  globalWarnings: string[]
  globalErrors: string[]
}

export interface ImportCommitResult {
  created: number
  updated: number
  skipped: number
  failed: number
  errors: Array<{ rowIndex: number; message: string }>
}

export interface ImportCommitRequest {
  mode: ImportMode
  rateSheetCode: string
  validFrom: string
  validTo: string | null
  rows: Array<{
    forConsument: boolean
    tarrifType: TarrifType
    tariffValue: string
    provider: string
    fromCountry: string
    toCountry: string
    price: number
    validFrom: string
    validTo: string | null
    rateSheetCode: string
    targetTable: 'pricing_manual' | 'pricing_manual_extra'
  }>
}
