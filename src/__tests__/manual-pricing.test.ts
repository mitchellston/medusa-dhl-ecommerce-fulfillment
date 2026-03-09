import { describe, it, expect } from 'vitest'
import {
  calculateManualPrice,
  calculateManualPacketTypePrice,
  ManualPricingRow,
  ManualExtraServiceRow,
  ManualPricingInput,
  ManualPricingData,
} from '../providers/dhl/dhl_pricing/manual'
import { CartLineItemDTO, ProductVariantDTO } from '@medusajs/framework/types'
import { DHLFulfillmentOptionDimensions } from '../dhl-api/types'

function makeItem(
  weightGrams: number,
  quantity = 1,
): CartLineItemDTO & { variant?: ProductVariantDTO } {
  return {
    quantity,
    variant: { weight: weightGrams } as ProductVariantDTO,
  } as CartLineItemDTO & { variant?: ProductVariantDTO }
}

function makeBaseRow(overrides: Partial<ManualPricingRow> = {}): ManualPricingRow {
  return {
    forConsument: true,
    tarrifType: 'weight',
    tariffValue: '50',
    provider: 'DHL For You',
    fromCountry: 'Nederland',
    toCountry: 'België',
    price: 9.37,
    validFrom: new Date('2026-01-01'),
    validTo: null,
    ...overrides,
  }
}

function makeInput(overrides: Partial<ManualPricingInput> = {}): ManualPricingInput {
  return {
    carrierKey: 'DOOR',
    items: [makeItem(5000)],
    fromCountryCode: 'NL',
    toCountryCode: 'BE',
    isB2B: false,
    now: new Date('2026-06-15'),
    weightMultiplier: 1,
    ...overrides,
  }
}

function makeData(overrides: Partial<ManualPricingData> = {}): ManualPricingData {
  return {
    basePricing: [makeBaseRow()],
    extraPricing: [],
    extraServices: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Basic matching
// ---------------------------------------------------------------------------

describe('calculateManualPrice', () => {
  it('returns the base price when weight is below threshold', () => {
    const price = calculateManualPrice(
      makeInput({ items: [makeItem(10000)] }),
      makeData({ basePricing: [makeBaseRow({ tariffValue: '50', price: 9.37 })] }),
    )
    expect(price).toBe(9.37)
  })

  // -------------------------------------------------------------------------
  // Weight increments
  // -------------------------------------------------------------------------

  describe('weight increments', () => {
    it('adds extra steps when weight exceeds base threshold', () => {
      const price = calculateManualPrice(
        makeInput({ items: [makeItem(80000)] }),
        makeData({
          basePricing: [makeBaseRow({ tariffValue: '50', price: 9.37 })],
          extraPricing: [makeBaseRow({ tariffValue: '10', price: 2.00 })],
        }),
      )
      // 80kg, threshold 50kg, excess 30kg, step 10kg -> ceil(30/10) = 3 steps
      expect(price).toBeCloseTo(9.37 + 3 * 2.00)
    })

    it('uses ceil for partial extra steps', () => {
      const price = calculateManualPrice(
        makeInput({ items: [makeItem(55000)] }),
        makeData({
          basePricing: [makeBaseRow({ tariffValue: '50', price: 9.37 })],
          extraPricing: [makeBaseRow({ tariffValue: '10', price: 2.00 })],
        }),
      )
      // 55kg, threshold 50kg, excess 5kg, step 10kg -> ceil(5/10) = 1 step
      expect(price).toBeCloseTo(9.37 + 2.00)
    })

    it('ignores extra increments when weight equals threshold', () => {
      const price = calculateManualPrice(
        makeInput({ items: [makeItem(50000)] }),
        makeData({
          basePricing: [makeBaseRow({ tariffValue: '50', price: 9.37 })],
          extraPricing: [makeBaseRow({ tariffValue: '10', price: 2.00 })],
        }),
      )
      expect(price).toBe(9.37)
    })

    it('ignores extra increments when weight is below threshold', () => {
      const price = calculateManualPrice(
        makeInput({ items: [makeItem(30000)] }),
        makeData({
          basePricing: [makeBaseRow({ tariffValue: '50', price: 9.37 })],
          extraPricing: [makeBaseRow({ tariffValue: '10', price: 2.00 })],
        }),
      )
      expect(price).toBe(9.37)
    })

    it('handles multiple items by summing weight', () => {
      const price = calculateManualPrice(
        makeInput({ items: [makeItem(30000), makeItem(30000)] }),
        makeData({
          basePricing: [makeBaseRow({ tariffValue: '50', price: 9.37 })],
          extraPricing: [makeBaseRow({ tariffValue: '10', price: 2.00 })],
        }),
      )
      // 60kg total, excess 10kg -> ceil(10/10) = 1 step
      expect(price).toBeCloseTo(9.37 + 2.00)
    })

    it('handles item quantity > 1', () => {
      const price = calculateManualPrice(
        makeInput({ items: [makeItem(30000, 2)] }),
        makeData({
          basePricing: [makeBaseRow({ tariffValue: '50', price: 9.37 })],
          extraPricing: [makeBaseRow({ tariffValue: '10', price: 2.00 })],
        }),
      )
      // 30kg * 2 = 60kg total, excess 10kg -> 1 step
      expect(price).toBeCloseTo(9.37 + 2.00)
    })
  })

  // -------------------------------------------------------------------------
  // Weight unit conversion
  // -------------------------------------------------------------------------

  describe('weight unit conversion', () => {
    it('applies weightMultiplier to convert item weight to grams', () => {
      // Item weight stored in kg (5), multiplier = 1000 -> 5000g = 5kg
      const price = calculateManualPrice(
        makeInput({ items: [makeItem(5, 1)], weightMultiplier: 1000 }),
        makeData({ basePricing: [makeBaseRow({ tariffValue: '50', price: 9.37 })] }),
      )
      expect(price).toBe(9.37)
    })

    it('converts kg items and checks extra steps correctly', () => {
      // 80kg item stored as 80 (kg unit), multiplier 1000 -> 80000g -> 80kg
      const price = calculateManualPrice(
        makeInput({ items: [makeItem(80, 1)], weightMultiplier: 1000 }),
        makeData({
          basePricing: [makeBaseRow({ tariffValue: '50', price: 9.37 })],
          extraPricing: [makeBaseRow({ tariffValue: '10', price: 2.00 })],
        }),
      )
      expect(price).toBeCloseTo(9.37 + 3 * 2.00)
    })
  })

  // -------------------------------------------------------------------------
  // Validity window filtering
  // -------------------------------------------------------------------------

  describe('validity window', () => {
    it('excludes rows where validFrom is in the future', () => {
      expect(() =>
        calculateManualPrice(
          makeInput({ now: new Date('2025-12-01') }),
          makeData({
            basePricing: [makeBaseRow({ validFrom: new Date('2026-01-01') })],
          }),
        ),
      ).toThrow('No manual pricing found')
    })

    it('excludes rows where validTo is in the past', () => {
      expect(() =>
        calculateManualPrice(
          makeInput({ now: new Date('2027-01-01') }),
          makeData({
            basePricing: [
              makeBaseRow({
                validFrom: new Date('2026-01-01'),
                validTo: new Date('2026-12-31'),
              }),
            ],
          }),
        ),
      ).toThrow('No manual pricing found')
    })

    it('includes rows where validTo is null (open-ended)', () => {
      const price = calculateManualPrice(
        makeInput({ now: new Date('2030-01-01') }),
        makeData({
          basePricing: [makeBaseRow({ validFrom: new Date('2026-01-01'), validTo: null })],
        }),
      )
    expect(price).toBe(9.37)
  })

  it('handles string date fields from ORM', () => {
      const price = calculateManualPrice(
        makeInput({ now: new Date('2026-06-15') }),
        makeData({
          basePricing: [
            makeBaseRow({
              validFrom: '2026-01-01T00:00:00.000Z' as unknown as Date,
              validTo: null,
            }),
          ],
        }),
      )
      expect(price).toBe(9.37)
    })
  })

  // -------------------------------------------------------------------------
  // Route matching (country)
  // -------------------------------------------------------------------------

  describe('country matching', () => {
    it('matches by ISO country code directly', () => {
      const price = calculateManualPrice(
        makeInput({ fromCountryCode: 'NL', toCountryCode: 'BE' }),
        makeData({
          basePricing: [makeBaseRow({ fromCountry: 'NL', toCountry: 'BE' })],
        }),
      )
      expect(price).toBe(9.37)
    })

    it('matches localized country name to ISO code', () => {
      const price = calculateManualPrice(
        makeInput({ fromCountryCode: 'NL', toCountryCode: 'BE' }),
        makeData({
          basePricing: [makeBaseRow({ fromCountry: 'Nederland', toCountry: 'België' })],
        }),
      )
      expect(price).toBe(9.37)
    })

    it('is case-insensitive for country matching', () => {
      const price = calculateManualPrice(
        makeInput({ fromCountryCode: 'nl', toCountryCode: 'be' }),
        makeData({
          basePricing: [makeBaseRow({ fromCountry: 'NEDERLAND', toCountry: 'BELGIË' })],
        }),
      )
      expect(price).toBe(9.37)
    })

    it('rejects mismatched routes', () => {
      expect(() =>
        calculateManualPrice(
          makeInput({ fromCountryCode: 'NL', toCountryCode: 'DE' }),
          makeData({
            basePricing: [makeBaseRow({ fromCountry: 'Nederland', toCountry: 'België' })],
          }),
        ),
      ).toThrow('No manual pricing found')
    })
  })

  // -------------------------------------------------------------------------
  // Customer type matching
  // -------------------------------------------------------------------------

  describe('customer type matching', () => {
    it('matches B2C (forConsument=true) for consumer orders', () => {
      const price = calculateManualPrice(
        makeInput({ isB2B: false }),
        makeData({ basePricing: [makeBaseRow({ forConsument: true })] }),
      )
      expect(price).toBe(9.37)
    })

    it('matches B2B (forConsument=false) for business orders', () => {
      const price = calculateManualPrice(
        makeInput({ isB2B: true }),
        makeData({ basePricing: [makeBaseRow({ forConsument: false, provider: 'DHL Europlus Pakketten' })] }),
      )
      expect(price).toBe(9.37)
    })

    it('rejects mismatched customer type', () => {
      expect(() =>
        calculateManualPrice(
          makeInput({ isB2B: true }),
          makeData({ basePricing: [makeBaseRow({ forConsument: true })] }),
        ),
      ).toThrow('No manual pricing found')
    })
  })

  // -------------------------------------------------------------------------
  // Provider / carrier_key matching
  // -------------------------------------------------------------------------

  describe('carrier_key -> provider mapping', () => {
    it('maps DOOR B2C to DHL For You', () => {
      const price = calculateManualPrice(
        makeInput({ carrierKey: 'DOOR', isB2B: false }),
        makeData({
          basePricing: [makeBaseRow({ provider: 'DHL For You', forConsument: true })],
        }),
      )
      expect(price).toBe(9.37)
    })

    it('maps DOOR B2B to DHL Europlus Pakketten', () => {
      const price = calculateManualPrice(
        makeInput({ carrierKey: 'DOOR', isB2B: true }),
        makeData({
          basePricing: [
            makeBaseRow({ provider: 'DHL Europlus Pakketten', forConsument: false }),
          ],
        }),
      )
      expect(price).toBe(9.37)
    })

    it('maps EXP to DHL Europlus Expresser Pakketten', () => {
      const price = calculateManualPrice(
        makeInput({ carrierKey: 'EXP', isB2B: false }),
        makeData({
          basePricing: [
            makeBaseRow({
              provider: 'DHL Europlus Expresser Pakketten',
              forConsument: true,
            }),
          ],
        }),
      )
      expect(price).toBe(9.37)
    })

    it('is case-insensitive for carrier key', () => {
      const price = calculateManualPrice(
        makeInput({ carrierKey: 'door', isB2B: false }),
        makeData({
          basePricing: [makeBaseRow({ provider: 'DHL For You', forConsument: true })],
        }),
      )
      expect(price).toBe(9.37)
    })
  })

  // -------------------------------------------------------------------------
  // Extra services (carrier-default mapping)
  // -------------------------------------------------------------------------

  describe('extra services', () => {
    it('auto-applies expresser surcharge for EXP carrier', () => {
      const price = calculateManualPrice(
        makeInput({ carrierKey: 'EXP', isB2B: false }),
        makeData({
          basePricing: [
            makeBaseRow({
              provider: 'DHL Europlus Expresser Pakketten',
              forConsument: true,
              price: 9.37,
            }),
          ],
          extraServices: [{ service: 'expresser', price: 2.50 }],
        }),
      )
      expect(price).toBeCloseTo(9.37 + 2.50)
    })

    it('does not apply expresser surcharge for DOOR carrier', () => {
      const price = calculateManualPrice(
        makeInput({ carrierKey: 'DOOR', isB2B: false }),
        makeData({
          basePricing: [makeBaseRow({ price: 9.37 })],
          extraServices: [{ service: 'expresser', price: 2.50 }],
        }),
      )
      expect(price).toBe(9.37)
    })

    it('skips missing extra service gracefully', () => {
      const price = calculateManualPrice(
        makeInput({ carrierKey: 'EXP', isB2B: false }),
        makeData({
          basePricing: [
            makeBaseRow({
              provider: 'DHL Europlus Expresser Pakketten',
              forConsument: true,
              price: 9.37,
            }),
          ],
          extraServices: [],
        }),
      )
      expect(price).toBe(9.37)
    })
  })

  // -------------------------------------------------------------------------
  // No-match error handling
  // -------------------------------------------------------------------------

  describe('no-match error', () => {
    it('throws when no base pricing rows match', () => {
      expect(() =>
        calculateManualPrice(makeInput(), makeData({ basePricing: [] })),
      ).toThrow('No manual pricing found')
    })

    it('error message includes carrier key and route', () => {
      expect(() =>
        calculateManualPrice(
          makeInput({ carrierKey: 'PS', fromCountryCode: 'NL', toCountryCode: 'DE' }),
          makeData({ basePricing: [] }),
        ),
      ).toThrow(/PS.*NL.*DE/)
    })

    it('error message includes customer type', () => {
      expect(() =>
        calculateManualPrice(
          makeInput({ isB2B: true }),
          makeData({ basePricing: [] }),
        ),
      ).toThrow(/B2B/)
    })
  })

  // -------------------------------------------------------------------------
  // Combined scenario
  // -------------------------------------------------------------------------

  describe('full scenario', () => {
    it('calculates base + extra weight + extra service correctly', () => {
      const price = calculateManualPrice(
        makeInput({
          carrierKey: 'EXP',
          isB2B: false,
          items: [makeItem(75000)],
        }),
        makeData({
          basePricing: [
            makeBaseRow({
              tariffValue: '50',
              price: 15.00,
              provider: 'DHL Europlus Expresser Pakketten',
              forConsument: true,
            }),
          ],
          extraPricing: [
            makeBaseRow({
              tariffValue: '10',
              price: 3.00,
              provider: 'DHL Europlus Expresser Pakketten',
              forConsument: true,
            }),
          ],
          extraServices: [{ service: 'expresser', price: 4.00 }],
        }),
      )
      // base: 15.00, extra: ceil(25/10)=3 * 3.00 = 9.00, service: 4.00
      expect(price).toBeCloseTo(15.00 + 9.00 + 4.00)
    })
  })
})

// ---------------------------------------------------------------------------
// Packet-type pricing (calculateManualPacketTypePrice)
// ---------------------------------------------------------------------------

function makeBinResult(
  key: string,
  quantity: number,
): { fulfillmentOption: DHLFulfillmentOptionDimensions; quantity: number } {
  return {
    fulfillmentOption: {
      key,
      maxWeight: 31500,
      minWeight: 0,
      height: 50,
      width: 50,
      length: 100,
      sum: 200,
      price: 0,
    },
    quantity,
  }
}

function makePacketTypeRow(
  tariffValue: string,
  price: number,
  overrides: Partial<ManualPricingRow> = {},
): ManualPricingRow {
  return {
    forConsument: true,
    tarrifType: 'packet_type',
    tariffValue,
    provider: 'DHL For You',
    fromCountry: 'Nederland',
    toCountry: 'België',
    price,
    validFrom: new Date('2026-01-01'),
    validTo: null,
    ...overrides,
  }
}

describe('calculateManualPacketTypePrice', () => {
  const defaultInput = makeInput()
  const defaultData: ManualPricingData = {
    basePricing: [
      makePacketTypeRow('S', 5.00),
      makePacketTypeRow('M', 7.50),
      makePacketTypeRow('L', 11.00),
    ],
    extraPricing: [],
    extraServices: [],
  }

  it('looks up manual price for a single parcel type', () => {
    const price = calculateManualPacketTypePrice(
      [makeBinResult('SMALL', 1)],
      defaultInput,
      defaultData,
    )
    expect(price).toBe(5.00)
  })

  it('multiplies by quantity for repeated parcel types', () => {
    const price = calculateManualPacketTypePrice(
      [makeBinResult('MEDIUM', 3)],
      defaultInput,
      defaultData,
    )
    expect(price).toBeCloseTo(7.50 * 3)
  })

  it('sums prices from multiple different parcel types', () => {
    const price = calculateManualPacketTypePrice(
      [makeBinResult('SMALL', 1), makeBinResult('LARGE', 2)],
      defaultInput,
      defaultData,
    )
    expect(price).toBeCloseTo(5.00 + 11.00 * 2)
  })

  it('maps ENVELOPE key to Envelop tariffValue', () => {
    const data: ManualPricingData = {
      basePricing: [makePacketTypeRow('Envelop', 3.00)],
      extraPricing: [],
      extraServices: [],
    }
    const price = calculateManualPacketTypePrice(
      [makeBinResult('ENVELOPE', 1)],
      defaultInput,
      data,
    )
    expect(price).toBe(3.00)
  })

  it('is case-insensitive for tariffValue matching', () => {
    const data: ManualPricingData = {
      basePricing: [makePacketTypeRow('small', 5.00)],
      extraPricing: [],
      extraServices: [],
    }
    const price = calculateManualPacketTypePrice(
      [makeBinResult('SMALL', 1)],
      defaultInput,
      data,
    )
    expect(price).toBe(5.00)
  })

  it('adds extra service fees (e.g. expresser for EXP)', () => {
    const data: ManualPricingData = {
      basePricing: [
        makePacketTypeRow('M', 7.50, { provider: 'DHL Europlus Expresser Pakketten' }),
      ],
      extraPricing: [],
      extraServices: [{ service: 'expresser', price: 2.50 }],
    }
    const price = calculateManualPacketTypePrice(
      [makeBinResult('MEDIUM', 1)],
      makeInput({ carrierKey: 'EXP', isB2B: false }),
      data,
    )
    expect(price).toBeCloseTo(7.50 + 2.50)
  })

  it('throws when no manual pricing matches a parcel type key', () => {
    expect(() =>
      calculateManualPacketTypePrice(
        [makeBinResult('UNKNOWN_TYPE', 1)],
        defaultInput,
        defaultData,
      ),
    ).toThrow(/No manual pricing found for parcel type "UNKNOWN_TYPE"/)
  })

  it('throws when bin-packing result is empty', () => {
    expect(() =>
      calculateManualPacketTypePrice([], defaultInput, defaultData),
    ).toThrow('No suitable shipping options found')
  })

  it('respects validity window when matching packet types', () => {
    const data: ManualPricingData = {
      basePricing: [
        makePacketTypeRow('S', 5.00, {
          validFrom: new Date('2026-01-01'),
          validTo: new Date('2026-06-01'),
        }),
      ],
      extraPricing: [],
      extraServices: [],
    }
    expect(() =>
      calculateManualPacketTypePrice(
        [makeBinResult('SMALL', 1)],
        makeInput({ now: new Date('2026-07-01') }),
        data,
      ),
    ).toThrow(/No manual pricing found for parcel type "SMALL"/)
  })

  it('respects customer type when matching packet types', () => {
    const data: ManualPricingData = {
      basePricing: [makePacketTypeRow('S', 5.00, { forConsument: true })],
      extraPricing: [],
      extraServices: [],
    }
    expect(() =>
      calculateManualPacketTypePrice(
        [makeBinResult('SMALL', 1)],
        makeInput({ isB2B: true }),
        data,
      ),
    ).toThrow(/No manual pricing found for parcel type "SMALL"/)
  })
})
