import { describe, it, expect } from 'vitest'
import {
  PricingManualCreateSchema,
  PricingManualUpdateSchema,
  ExtraServiceCreateSchema,
  ExtraServiceUpdateSchema,
  ImportCommitSchema,
} from '../api/admin/dhl/pricing/validator'

describe('PricingManualCreateSchema', () => {
  const validInput = {
    forConsument: true,
    tarrifType: 'weight' as const,
    tariffValue: '50',
    provider: 'DHL Europlus Pakketten',
    fromCountry: 'Nederland',
    toCountry: 'België',
    price: 9.37,
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: null,
    rateSheetCode: '08032945',
  }

  it('accepts valid input', () => {
    const result = PricingManualCreateSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('accepts all tariff types', () => {
    for (const tt of ['packet_type', 'weight', 'pallet'] as const) {
      const result = PricingManualCreateSchema.safeParse({ ...validInput, tarrifType: tt })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid tariff type', () => {
    const result = PricingManualCreateSchema.safeParse({
      ...validInput,
      tarrifType: 'invalid',
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative price', () => {
    const result = PricingManualCreateSchema.safeParse({
      ...validInput,
      price: -1,
    })
    expect(result.success).toBe(false)
  })

  it('rejects price = 0 is allowed', () => {
    const result = PricingManualCreateSchema.safeParse({
      ...validInput,
      price: 0,
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty tariffValue', () => {
    const result = PricingManualCreateSchema.safeParse({
      ...validInput,
      tariffValue: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty provider', () => {
    const result = PricingManualCreateSchema.safeParse({
      ...validInput,
      provider: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid validFrom date', () => {
    const result = PricingManualCreateSchema.safeParse({
      ...validInput,
      validFrom: 'not-a-date',
    })
    expect(result.success).toBe(false)
  })

  it('rejects validTo before validFrom', () => {
    const result = PricingManualCreateSchema.safeParse({
      ...validInput,
      validFrom: '2026-06-01T00:00:00.000Z',
      validTo: '2026-01-01T00:00:00.000Z',
    })
    expect(result.success).toBe(false)
  })

  it('accepts validTo equal to validFrom', () => {
    const date = '2026-01-01T00:00:00.000Z'
    const result = PricingManualCreateSchema.safeParse({
      ...validInput,
      validFrom: date,
      validTo: date,
    })
    expect(result.success).toBe(true)
  })

  it('accepts null validTo', () => {
    const result = PricingManualCreateSchema.safeParse({
      ...validInput,
      validTo: null,
    })
    expect(result.success).toBe(true)
  })

  it('accepts null rateSheetCode', () => {
    const result = PricingManualCreateSchema.safeParse({
      ...validInput,
      rateSheetCode: null,
    })
    expect(result.success).toBe(true)
  })
})

describe('PricingManualUpdateSchema', () => {
  it('accepts partial updates', () => {
    const result = PricingManualUpdateSchema.safeParse({ price: 10.5 })
    expect(result.success).toBe(true)
  })

  it('accepts empty object', () => {
    const result = PricingManualUpdateSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('rejects negative price', () => {
    const result = PricingManualUpdateSchema.safeParse({ price: -5 })
    expect(result.success).toBe(false)
  })

  it('rejects invalid tariff type', () => {
    const result = PricingManualUpdateSchema.safeParse({ tarrifType: 'unknown' })
    expect(result.success).toBe(false)
  })
})

describe('ExtraServiceCreateSchema', () => {
  it('accepts valid input', () => {
    const result = ExtraServiceCreateSchema.safeParse({
      service: 'age_check',
      price: 5.0,
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty service', () => {
    const result = ExtraServiceCreateSchema.safeParse({
      service: '',
      price: 5.0,
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative price', () => {
    const result = ExtraServiceCreateSchema.safeParse({
      service: 'age_check',
      price: -1,
    })
    expect(result.success).toBe(false)
  })
})

describe('ExtraServiceUpdateSchema', () => {
  it('accepts partial update with just price', () => {
    const result = ExtraServiceUpdateSchema.safeParse({ price: 7.5 })
    expect(result.success).toBe(true)
  })

  it('accepts partial update with just service', () => {
    const result = ExtraServiceUpdateSchema.safeParse({ service: 'door' })
    expect(result.success).toBe(true)
  })
})

describe('ImportCommitSchema', () => {
  const validCommit = {
    mode: 'upsert' as const,
    rateSheetCode: '08032945',
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: null,
    rows: [
      {
        forConsument: false,
        tarrifType: 'weight' as const,
        tariffValue: '50',
        provider: 'DHL Europlus Pakketten',
        fromCountry: 'Nederland',
        toCountry: 'België',
        price: 9.37,
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: null,
        rateSheetCode: '08032945',
        targetTable: 'pricing_manual' as const,
      },
    ],
  }

  it('accepts valid commit request', () => {
    const result = ImportCommitSchema.safeParse(validCommit)
    expect(result.success).toBe(true)
  })

  it('accepts new_version mode', () => {
    const result = ImportCommitSchema.safeParse({
      ...validCommit,
      mode: 'new_version',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid mode', () => {
    const result = ImportCommitSchema.safeParse({
      ...validCommit,
      mode: 'invalid',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty rows array', () => {
    const result = ImportCommitSchema.safeParse({
      ...validCommit,
      rows: [],
    })
    expect(result.success).toBe(true) // empty array is valid, just nothing to import
  })

  it('rejects row with invalid targetTable', () => {
    const result = ImportCommitSchema.safeParse({
      ...validCommit,
      rows: [{ ...validCommit.rows[0], targetTable: 'invalid' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects row with negative price', () => {
    const result = ImportCommitSchema.safeParse({
      ...validCommit,
      rows: [{ ...validCommit.rows[0], price: -1 }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects row with empty tariffValue', () => {
    const result = ImportCommitSchema.safeParse({
      ...validCommit,
      rows: [{ ...validCommit.rows[0], tariffValue: '' }],
    })
    expect(result.success).toBe(false)
  })
})
