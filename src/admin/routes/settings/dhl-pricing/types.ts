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
  validFrom: string
  validTo: string | null
  rateSheetCode: string | null
  created_at?: string
  updated_at?: string
}

export interface ExtraServiceRecord {
  id: string
  service: string
  price: number
  created_at?: string
  updated_at?: string
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
  errors: { rowIndex: number; message: string }[]
}

export interface PricingFilters {
  provider: string
  forConsument: 'all' | 'true' | 'false'
  tarrifType: 'all' | TarrifType
  fromCountry: string
  toCountry: string
  activeOn: string
}

export const DEFAULT_FILTERS: PricingFilters = {
  provider: '',
  forConsument: 'all',
  tarrifType: 'all',
  fromCountry: '',
  toCountry: '',
  activeOn: '',
}
