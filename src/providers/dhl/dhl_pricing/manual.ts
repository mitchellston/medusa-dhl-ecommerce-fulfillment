import { CartLineItemDTO, FulfillmentItemDTO, Logger, ProductVariantDTO } from '@medusajs/framework/types'
import { DHLFulfillmentOptionDimensions } from '../../../dhl-api/types'
import { getFulfillmentOptions } from '../../../dhl-api/get-fulfillment-options'
import { getBestFulfillmentBasedOnPriceViaApi } from './api'

/**
 * Maps DHL carrier keys to known provider strings used in imported pricing
 * tables. When the pricing row's free-text `provider` column contains one of
 * these values the row is considered a match for the given carrier + B2C/B2B
 * combination.
 */
const CARRIER_PROVIDER_MAP: Record<string, { b2c: string[]; b2b: string[] }> = {
  DOOR: {
    b2c: ['DHL For You'],
    b2b: ['DHL Europlus Pakketten'],
  },
  PS: {
    b2c: ['DHL For You'],
    b2b: ['DHL Europlus Pakketten'],
  },
  EXP: {
    b2c: ['DHL Europlus Expresser Pakketten'],
    b2b: ['DHL Europlus Expresser Pakketten'],
  },
}

/**
 * Maps carrier keys to extra-service fee names that are auto-applied.
 * e.g. selecting carrier EXP automatically adds the "expresser" surcharge.
 */
const CARRIER_EXTRA_SERVICE_MAP: Record<string, string[]> = {
  EXP: ['expresser'],
}

/**
 * Maps DHL API parcel-type keys (returned by the capabilities endpoint) to
 * the tariffValue strings used in imported rate-sheet pricing tables.
 * Used to bridge API bin-packing results with manual pricing lookups.
 */
const PARCEL_KEY_TO_TARIFF_VALUES: Record<string, string[]> = {
  SMALL: ['S', 'Small', 'Klein'],
  MEDIUM: ['M', 'Medium', 'Standaard'],
  LARGE: ['L', 'Large', 'Groot'],
  BULKY: ['XL', 'Bulky', 'Extra groot', 'Extra Large'],
  EXTRA_LARGE: ['XXL', 'Extra Large'],
  ENVELOPE: ['Envelop', 'Envelope'],
  MAILBOX: ['Brievenbuspakket', 'Mailbox'],
  MAILBOX_PACKAGE: ['Brievenbuspakket', 'Mailbox'],
}

/**
 * Ordered from smallest to largest. When a parcel type has no manual pricing
 * row, we walk up this list and use the first larger size that does have one.
 */
const PARCEL_SIZE_ORDER: string[] = [
  'ENVELOPE',
  'MAILBOX',
  'MAILBOX_PACKAGE',
  'SMALL',
  'SMALL_MEDIUM',
  'MEDIUM',
  'LARGE',
  'BULKY',
  'EXTRA_LARGE',
]

/**
 * Maps ISO 3166-1 alpha-2 country codes to localized names that appear in
 * imported DHL rate-sheet PDFs. Used as a fallback when the pricing row stores
 * a human-readable country name rather than a code.
 */
const COUNTRY_NAME_ALIASES: Record<string, string[]> = {
  NL: ['Nederland', 'Netherlands', 'The Netherlands'],
  BE: ['België', 'Belgium', 'Belgique'],
  DE: ['Duitsland', 'Germany', 'Deutschland'],
  FR: ['Frankrijk', 'France'],
  LU: ['Luxemburg', 'Luxembourg'],
  AT: ['Oostenrijk', 'Austria', 'Österreich'],
  ES: ['Spanje', 'Spain', 'España'],
  IT: ['Italië', 'Italy', 'Italia'],
  PT: ['Portugal'],
  GB: ['Verenigd Koninkrijk', 'United Kingdom', 'Great Britain', 'UK'],
  IE: ['Ierland', 'Ireland'],
  DK: ['Denemarken', 'Denmark', 'Danmark'],
  SE: ['Zweden', 'Sweden', 'Sverige'],
  FI: ['Finland'],
  NO: ['Noorwegen', 'Norway', 'Norge'],
  PL: ['Polen', 'Poland', 'Polska'],
  CZ: ['Tsjechië', 'Czech Republic', 'Czechia'],
  SK: ['Slowakije', 'Slovakia'],
  HU: ['Hongarije', 'Hungary', 'Magyarország'],
  RO: ['Roemenië', 'Romania'],
  BG: ['Bulgarije', 'Bulgaria'],
  HR: ['Kroatië', 'Croatia', 'Hrvatska'],
  SI: ['Slovenië', 'Slovenia'],
  EE: ['Estland', 'Estonia'],
  LV: ['Letland', 'Latvia'],
  LT: ['Litouwen', 'Lithuania'],
  GR: ['Griekenland', 'Greece'],
  CH: ['Zwitserland', 'Switzerland', 'Schweiz', 'Suisse'],
  US: ['Verenigde Staten', 'United States', 'USA'],
}

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ManualPricingRow {
  forConsument: boolean
  tarrifType: 'packet_type' | 'weight' | 'pallet'
  tariffValue: string
  provider: string
  fromCountry: string
  toCountry: string
  /** Price in euros (excl. tax), as imported from rate sheets */
  price: number
  validFrom: Date | string
  validTo: Date | string | null
}

export interface ManualExtraServiceRow {
  service: string
  /** Price in euros (excl. tax) */
  price: number
}


type PricingItem =
  | (CartLineItemDTO & { variant?: ProductVariantDTO })
  | (Partial<Omit<FulfillmentItemDTO, 'fulfillment'>> & { variant?: ProductVariantDTO })

export interface ManualPricingInput {
  carrierKey: string
  items: PricingItem[]
  fromCountryCode: string
  toCountryCode: string
  isB2B: boolean
  now: Date
  /**
   * Multiplier to convert item variant weight to **grams**.
   * (1 when already grams, 1000 when stored as kg)
   */
  weightMultiplier: number
}

export interface ManualPricingData {
  basePricing: ManualPricingRow[]
  extraPricing: ManualPricingRow[]
  extraServices: ManualExtraServiceRow[]
}

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

function matchesCountry(rowCountry: string, countryCode: string): boolean {
  const code = countryCode.toUpperCase()
  const rowNorm = rowCountry.toUpperCase().trim()

  if (rowNorm === code) return true

  const aliases = COUNTRY_NAME_ALIASES[code]
  if (aliases) {
    return aliases.some((alias) => alias.toUpperCase() === rowNorm)
  }
  return false
}

function matchesProvider(rowProvider: string, carrierKey: string, isB2C: boolean): boolean {
  const mapping = CARRIER_PROVIDER_MAP[carrierKey.toUpperCase()]
  if (!mapping) return false
  const providers = isB2C ? mapping.b2c : mapping.b2b
  return providers.some((p) => rowProvider.toLowerCase().includes(p.toLowerCase()))
}

function isWithinValidity(row: ManualPricingRow, now: Date): boolean {
  const from = row.validFrom instanceof Date ? row.validFrom : new Date(row.validFrom)
  if (from > now) return false

  if (row.validTo !== null) {
    const to = row.validTo instanceof Date ? row.validTo : new Date(row.validTo)
    if (to < now) return false
  }
  return true
}

export function filterMatchingRows(
  rows: ManualPricingRow[],
  input: ManualPricingInput,
  tarrifType: 'weight' | 'packet_type' | 'pallet',
): ManualPricingRow[] {
  const isB2C = !input.isB2B
  return rows.filter((row) => {
    if (!isWithinValidity(row, input.now)) return false
    if (row.forConsument !== isB2C) return false
    if (row.tarrifType !== tarrifType) return false
    if (!matchesCountry(row.fromCountry, input.fromCountryCode)) return false
    if (!matchesCountry(row.toCountry, input.toCountryCode)) return false
    if (!matchesProvider(row.provider, input.carrierKey, isB2C)) return false
    return true
  })
}

// ---------------------------------------------------------------------------
// Main calculator
// ---------------------------------------------------------------------------

/**
 * Calculate shipping price from local manual pricing tables.
 *
 * Currently supports **weight-based** tariffs. For a given carrier, route and
 * customer type the algorithm:
 *
 * 1. Finds the base pricing row (`pricing_manual`, `tarrifType = weight`).
 * 2. Treats `tariffValue` as the base weight threshold in **kg**.
 * 3. When actual weight exceeds the threshold, finds the extra pricing row
 *    (`pricing_manual_extra`) and adds `ceil((excess / stepKg)) * stepPrice`.
 * 4. Auto-applies carrier-default extra-service surcharges (e.g. EXP -> expresser).
 *
 * @returns Price in minor currency units (cents).
 * @throws When no matching pricing row is found.
 */
export function calculateManualPrice(
  input: ManualPricingInput,
  data: ManualPricingData,
): number {
  const totalWeightGrams = input.items.reduce((sum, item) => {
    const weight = (item.variant?.weight ?? 0) * input.weightMultiplier
    const quantity = Number(item.quantity ?? 0)
    return sum + weight * quantity
  }, 0)
  const totalWeightKg = totalWeightGrams / 1000

  const matchingBase = filterMatchingRows(data.basePricing, input, 'weight')

  if (matchingBase.length === 0) {
    throw new Error(
      `No manual pricing found for carrier "${input.carrierKey}", ` +
        `route ${input.fromCountryCode} -> ${input.toCountryCode}, ` +
        `customer type: ${input.isB2B ? 'B2B' : 'B2C'}`,
    )
  }

  const baseRow = matchingBase[0]
  const baseThresholdKg = parseFloat(baseRow.tariffValue)
  let totalPrice = baseRow.price

  if (totalWeightKg > baseThresholdKg) {
    const matchingExtra = filterMatchingRows(data.extraPricing, input, 'weight')
    if (matchingExtra.length > 0) {
      const extraRow = matchingExtra[0]
      const extraStepKg = parseFloat(extraRow.tariffValue)
      if (extraStepKg > 0) {
        const extraSteps = Math.ceil((totalWeightKg - baseThresholdKg) / extraStepKg)
        totalPrice += extraSteps * extraRow.price
      }
    }
  }

  totalPrice += sumExtraServiceFees(input.carrierKey, data.extraServices)

  return totalPrice
}

// ---------------------------------------------------------------------------
// Packet-type pricing
// ---------------------------------------------------------------------------

/**
 * Find the manual pricing row that matches a DHL API parcel-type key
 * (e.g. "SMALL" -> tariffValue "S").
 */
function findManualPricingForParcelType(
  parcelTypeKey: string,
  rows: ManualPricingRow[],
  input: ManualPricingInput,
  log?: Logger,
): ManualPricingRow | undefined {
  const isB2C = !input.isB2B

  const packetTypeRows = rows.filter((row) => row.tarrifType === 'packet_type')

  const candidates = packetTypeRows.filter((row) => {
    if (!isWithinValidity(row, input.now)) return false
    if (row.forConsument !== isB2C) return false
    if (!matchesCountry(row.fromCountry, input.fromCountryCode)) return false
    if (!matchesCountry(row.toCountry, input.toCountryCode)) return false
    if (!matchesProvider(row.provider, input.carrierKey, isB2C)) return false
    return true
  })

  if (log && candidates.length === 0 && packetTypeRows.length > 0) {
    const sample = packetTypeRows.slice(0, 3)
    log.info(
      `DHL findManualPricingForParcelType: 0/${packetTypeRows.length} packet_type rows matched ` +
        `for key="${parcelTypeKey}", isB2C=${isB2C}, carrier=${input.carrierKey}, ` +
        `route=${input.fromCountryCode}->${input.toCountryCode}. ` +
        `Sample rows: ${JSON.stringify(sample.map((r) => ({ provider: r.provider, forConsument: r.forConsument, from: r.fromCountry, to: r.toCountry, tariffValue: r.tariffValue })))}`,
    )
  }

  const key = parcelTypeKey.toUpperCase()

  const findByKey = (k: string): ManualPricingRow | undefined => {
    const possibleValues = PARCEL_KEY_TO_TARIFF_VALUES[k] ?? [k]
    return candidates.find((row) =>
      possibleValues.some((tv) => row.tariffValue.toUpperCase() === tv.toUpperCase()),
    )
  }

  const match = findByKey(key)
  if (match) return match

  // No exact match — fall back to the next larger size in the ordering
  const idx = PARCEL_SIZE_ORDER.indexOf(key)
  if (idx >= 0) {
    for (let i = idx + 1; i < PARCEL_SIZE_ORDER.length; i++) {
      const fallback = findByKey(PARCEL_SIZE_ORDER[i])
      if (fallback) {
        log?.info(
          `DHL findManualPricingForParcelType: no pricing for "${parcelTypeKey}", ` +
            `falling back to "${PARCEL_SIZE_ORDER[i]}" (${fallback.tariffValue}: €${fallback.price})`,
        )
        return fallback
      }
    }
  }

  if (log && candidates.length > 0) {
    log.info(
      `DHL findManualPricingForParcelType: ${candidates.length} candidates matched filters but ` +
        `none matched tariffValue for key="${parcelTypeKey}". ` +
        `Available values: ${candidates.map((r) => r.tariffValue).join(', ')}`,
    )
  }

  return undefined
}

/**
 * Calculate shipping price for packet-type tariffs using bin-packing results.
 *
 * Takes the output of `getBestFulfillmentBasedOnPriceViaApi` (which determines
 * which parcel types are needed via bin-packing) and looks up the manual price
 * for each parcel type instead of using the API price.
 *
 * @returns Price in minor currency units (cents).
 * @throws When no matching manual pricing row is found for a parcel type.
 */
export function calculateManualPacketTypePrice(
  binPackingResult: { fulfillmentOption: DHLFulfillmentOptionDimensions; quantity: number }[],
  input: ManualPricingInput,
  data: ManualPricingData,
  log?: Logger,
): number {
  if (binPackingResult.length === 0) {
    throw new Error('No suitable shipping options found for the items')
  }

  let totalPrice = 0

  for (const { fulfillmentOption, quantity } of binPackingResult) {
    const manualRow = findManualPricingForParcelType(
      fulfillmentOption.key,
      data.basePricing,
      input,
      log,
    )

    if (!manualRow) {
      throw new Error(
        `No manual pricing found for parcel type "${fulfillmentOption.key}" ` +
          `(carrier "${input.carrierKey}", route ${input.fromCountryCode} -> ${input.toCountryCode}, ` +
          `customer type: ${input.isB2B ? 'B2B' : 'B2C'})`,
      )
    }

    totalPrice += manualRow.price * quantity
  }

  totalPrice += sumExtraServiceFees(input.carrierKey, data.extraServices)

  return totalPrice
}

/**
 * Build a `Map<parcelTypeKey, manualPrice>` from DHL fulfillment options and
 * the manual pricing table.  Passed as `priceOverrides` to
 * `getBestFulfillmentBasedOnPriceViaApi` so the bin-packing algorithm sorts
 * parcel types by manual prices instead of API prices.
 *
 * Parcel types without a matching manual row are omitted (they keep the API
 * price as fallback).
 */
export function buildManualPriceOverrides(
  fulfillmentOptions: Awaited<ReturnType<typeof getFulfillmentOptions>>,
  option: string,
  input: ManualPricingInput,
  data: ManualPricingData,
  log?: Logger,
): Map<string, number> {
  const overrides = new Map<string, number>()

  for (const fulfillment of fulfillmentOptions) {
    const hasOption = fulfillment.options.some((o) => o.key === option)
    if (!hasOption) continue

    const manualRow = findManualPricingForParcelType(
      fulfillment.parcelType.key,
      data.basePricing,
      input,
      log,
    )

    if (manualRow) {
      overrides.set(fulfillment.parcelType.key, manualRow.price)
    }
  }

  return overrides
}

/**
 * Manual-pricing equivalent of `getBestFulfillmentBasedOnPriceViaApi`.
 *
 * Uses the DHL capabilities API for parcel-type dimensions, substitutes
 * manual prices via `priceOverrides` so the bin-packing optimises for manual
 * costs, then maps each resulting parcel type to a manual pricing row.
 *
 * @returns Parcel assignments with manual prices and quantities.
 */
export async function getBestFulfillmentForManualPricing(
  fulfillmentOptions: Awaited<ReturnType<typeof getFulfillmentOptions>>,
  items: (CartLineItemDTO & { variant?: ProductVariantDTO })[],
  option: string,
  weightMultiplier: number,
  dimensionDivisor: number,
  pricingInput: ManualPricingInput,
  pricingData: ManualPricingData,
): Promise<{ parcelTypeKey: string; manualPrice: number; quantity: number }[]> {
  const priceOverrides = buildManualPriceOverrides(
    fulfillmentOptions,
    option,
    pricingInput,
    pricingData,
  )

  const binResult = await getBestFulfillmentBasedOnPriceViaApi(
    fulfillmentOptions,
    items,
    option,
    weightMultiplier,
    dimensionDivisor,
    priceOverrides,
  )

  return binResult.map(({ fulfillmentOption, quantity }) => {
    const manualRow = findManualPricingForParcelType(
      fulfillmentOption.key,
      pricingData.basePricing,
      pricingInput,
    )

    if (!manualRow) {
      throw new Error(
        `No manual pricing found for parcel type "${fulfillmentOption.key}" ` +
          `(carrier "${option}", route ${pricingInput.fromCountryCode} -> ${pricingInput.toCountryCode}, ` +
          `customer type: ${pricingInput.isB2B ? 'B2B' : 'B2C'})`,
      )
    }

    return {
      parcelTypeKey: fulfillmentOption.key,
      manualPrice: manualRow.price,
      quantity,
    }
  })
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function sumExtraServiceFees(
  carrierKey: string,
  extraServices: ManualExtraServiceRow[],
): number {
  let total = 0
  const extraServiceKeys = CARRIER_EXTRA_SERVICE_MAP[carrierKey.toUpperCase()] ?? []
  for (const serviceKey of extraServiceKeys) {
    const serviceRow = extraServices.find(
      (s) => s.service.toLowerCase() === serviceKey.toLowerCase(),
    )
    if (serviceRow) {
      total += serviceRow.price
    }
  }
  return total
}
