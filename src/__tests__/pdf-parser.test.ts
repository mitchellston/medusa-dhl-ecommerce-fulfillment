import { describe, it, expect } from 'vitest'
import { parseDhlPdfText, markDuplicates } from '../utils/pdf-parser'

const SAMPLE_WEIGHT_SECTION = `
DHL eCommerce - Excellence. Simply delivered.

Pakketten naar zakelijke adressen in de Benelux
DHL Europlus Pakketten
Tarieftype Gewicht (kg)
Start datum 2026-01-01 08032945
Van/naar country 2 5 15 32 100 Per extra 50KG
Beide Nederland 6,96 6,96 7,60 17,33 17,33 9,74
Beide België 7,49 7,49 9,37 18,53 22,14 14,48

Alle prijzen zijn in Euro's. Alle tarieven zijn exclusief toeslagen en BTW
`

const SAMPLE_PACKET_SECTION = `
Pakketten en brievenbuspakketten naar consumenten in de Benelux
DHL For You
Tarieftype Collo / pakket
Start datum 2026-01-01 08032945
Van/naar country Envelop Brievenbuspakket S M L XL XXL
Beide Nederland 5,03 5,92 6,96 7,60 8,95 11,81 22,14
Beide België — 8,95 9,37 9,96 11,09 14,48 25,79

Alle prijzen zijn in Euro's. Alle tarieven zijn exclusief toeslagen en BTW
`

const SAMPLE_PALLET_SECTION = `
Pallets naar zakelijke adressen in de Benelux
DHL Europlus Pallets
Tarieftype Pallet
Start datum 2026-01-01 08032945
Van/naar country 5
Beide Nederland 89,22
Beide België 113,79

Alle prijzen zijn in Euro's. Alle tarieven zijn exclusief toeslagen en BTW
`

const SAMPLE_INTERNATIONAL = `
Pakketten naar zakelijke adressen in Europa
Europlus International
Tarieftype Gewicht (kg)
Start datum 2026-01-01 08032945
Van/naar country 2 5 15 32 100 Per extra 50KG
Naar Duitsland 8,24 8,24 12,61 21,42 28,62 19,00
Naar Frankrijk (Noord) 11,57 11,57 16,31 26,18 29,15 19,00
Naar Italië (Zuid) 13,08 14,10 20,97 35,32 49,07 34,38

Alle prijzen zijn in Euro's. Alle tarieven zijn exclusief toeslagen en BTW
`

const SAMPLE_RETURN_SECTION = `
Retourneren van pakketten vanaf consumenten in Europa
DHL Parcel Connect Return
Tarieftype Gewicht (kg)
Start datum 2026-01-01 08032945
Van/naar country 2 5 15 32
Van Duitsland 13,08 14,10 15,16 17,64
Van België 11,57 12,29 13,64 15,16

Alle prijzen zijn in Euro's. Alle tarieven zijn exclusief toeslagen en BTW
`

const SAMPLE_CONSUMER_INTERNATIONAL = `
Pakketten naar consumenten in Europa
DHL Parcel Connect
Tarieftype Gewicht (kg)
Start datum 2026-01-01 08032945
Van/naar country 2 5 15 32
Naar Duitsland 13,08 14,10 15,16 17,64
Naar België 11,57 12,29 13,64 15,16

Alle prijzen zijn in Euro's. Alle tarieven zijn exclusief toeslagen en BTW
`

describe('parseDhlPdfText', () => {
  describe('weight-based sections', () => {
    it('parses weight columns and prices correctly', () => {
      const result = parseDhlPdfText(SAMPLE_WEIGHT_SECTION)

      expect(result.rows.length).toBeGreaterThan(0)
      expect(result.rateSheetCode).toBe('08032945')
      expect(result.validFrom).toBe('2026-01-01')

      const nlRow2kg = result.rows.find(
        (r) => r.fromCountry === 'Nederland' && r.toCountry === 'Nederland' && r.tariffValue === '2',
      )
      expect(nlRow2kg).toBeDefined()
      expect(nlRow2kg!.price).toBe(6.96)
      expect(nlRow2kg!.tarrifType).toBe('weight')
      expect(nlRow2kg!.provider).toBe('DHL Europlus Pakketten')
      expect(nlRow2kg!.forConsument).toBe(false)
      expect(nlRow2kg!.targetTable).toBe('pricing_manual')
    })

    it('maps "Per extra 50KG" to pricing_manual_extra', () => {
      const result = parseDhlPdfText(SAMPLE_WEIGHT_SECTION)

      const extraRows = result.rows.filter((r) => r.targetTable === 'pricing_manual_extra')
      expect(extraRows.length).toBe(2) // NL and BE

      const nlExtra = extraRows.find((r) => r.toCountry === 'Nederland')
      expect(nlExtra).toBeDefined()
      expect(nlExtra!.price).toBe(9.74)
      expect(nlExtra!.tariffValue).toBe('Per extra 50KG')
    })

    it('handles comma decimal separator', () => {
      const result = parseDhlPdfText(SAMPLE_WEIGHT_SECTION)
      const beRow15 = result.rows.find(
        (r) => r.toCountry === 'België' && r.tariffValue === '15',
      )
      expect(beRow15).toBeDefined()
      expect(beRow15!.price).toBe(9.37)
    })

    it('creates correct number of rows (6 columns x 2 countries = 12 total)', () => {
      const result = parseDhlPdfText(SAMPLE_WEIGHT_SECTION)
      expect(result.rows.length).toBe(12) // 6 cols x 2 countries
    })
  })

  describe('packet-type sections', () => {
    it('parses packet type columns correctly', () => {
      const result = parseDhlPdfText(SAMPLE_PACKET_SECTION)

      expect(result.rows.length).toBeGreaterThan(0)

      const nlEnvelop = result.rows.find(
        (r) => r.toCountry === 'Nederland' && r.tariffValue === 'Envelop',
      )
      expect(nlEnvelop).toBeDefined()
      expect(nlEnvelop!.price).toBe(5.03)
      expect(nlEnvelop!.tarrifType).toBe('packet_type')
      expect(nlEnvelop!.forConsument).toBe(true)
      expect(nlEnvelop!.provider).toBe('DHL For You')
    })

    it('skips missing values (dash) for Belgium Envelop', () => {
      const result = parseDhlPdfText(SAMPLE_PACKET_SECTION)
      const beEnvelop = result.rows.find(
        (r) => r.toCountry === 'België' && r.tariffValue === 'Envelop',
      )
      expect(beEnvelop).toBeUndefined()
    })

    it('marks DHL For You as consumer product', () => {
      const result = parseDhlPdfText(SAMPLE_PACKET_SECTION)
      result.rows.forEach((r) => {
        expect(r.forConsument).toBe(true)
      })
    })
  })

  describe('pallet sections', () => {
    it('parses pallet pricing correctly', () => {
      const result = parseDhlPdfText(SAMPLE_PALLET_SECTION)

      expect(result.rows.length).toBe(2)

      const nlPallet = result.rows.find((r) => r.toCountry === 'Nederland')
      expect(nlPallet).toBeDefined()
      expect(nlPallet!.price).toBe(89.22)
      expect(nlPallet!.tarrifType).toBe('pallet')
      expect(nlPallet!.tariffValue).toBe('5')
    })
  })

  describe('international sections', () => {
    it('sets fromCountry to Nederland for "Naar" prefix', () => {
      const result = parseDhlPdfText(SAMPLE_INTERNATIONAL)

      result.rows.forEach((r) => {
        expect(r.fromCountry).toBe('Nederland')
      })
    })

    it('preserves region names in toCountry', () => {
      const result = parseDhlPdfText(SAMPLE_INTERNATIONAL)

      const frNorth = result.rows.find((r) => r.toCountry === 'Frankrijk (Noord)')
      expect(frNorth).toBeDefined()

      const itSouth = result.rows.find((r) => r.toCountry === 'Italië (Zuid)')
      expect(itSouth).toBeDefined()
    })

    it('parses Germany correctly', () => {
      const result = parseDhlPdfText(SAMPLE_INTERNATIONAL)
      const de2kg = result.rows.find(
        (r) => r.toCountry === 'Duitsland' && r.tariffValue === '2',
      )
      expect(de2kg).toBeDefined()
      expect(de2kg!.price).toBe(8.24)
    })
  })

  describe('return sections', () => {
    it('ignores DHL Parcel Connect Return sections', () => {
      const result = parseDhlPdfText(SAMPLE_RETURN_SECTION)
      expect(result.rows.length).toBe(0)
    })

    it('ignores rows with Van prefix', () => {
      const combined = SAMPLE_RETURN_SECTION + SAMPLE_WEIGHT_SECTION
      const result = parseDhlPdfText(combined)
      const vanRows = result.rows.filter((r) => r.fromCountry !== 'Nederland' && r.fromCountry !== r.toCountry)
      expect(vanRows.length).toBe(0)
    })
  })

  describe('consumer product detection', () => {
    it('marks DHL Parcel Connect as consumer', () => {
      const result = parseDhlPdfText(SAMPLE_CONSUMER_INTERNATIONAL)
      result.rows.forEach((r) => {
        expect(r.forConsument).toBe(true)
      })
    })

    it('marks Europlus International as business', () => {
      const result = parseDhlPdfText(SAMPLE_INTERNATIONAL)
      result.rows.forEach((r) => {
        expect(r.forConsument).toBe(false)
      })
    })
  })

  describe('Beide prefix handling', () => {
    it('sets fromCountry and toCountry to the same country for Beide', () => {
      const result = parseDhlPdfText(SAMPLE_WEIGHT_SECTION)
      const beideRows = result.rows.filter(
        (r) => r.fromCountry === 'Nederland' && r.toCountry === 'Nederland',
      )
      expect(beideRows.length).toBe(6)
    })
  })

  describe('metadata extraction', () => {
    it('extracts rateSheetCode from Start datum line', () => {
      const result = parseDhlPdfText(SAMPLE_WEIGHT_SECTION)
      expect(result.rateSheetCode).toBe('08032945')
    })

    it('extracts validFrom date', () => {
      const result = parseDhlPdfText(SAMPLE_WEIGHT_SECTION)
      expect(result.validFrom).toBe('2026-01-01')
    })
  })

  describe('row validation', () => {
    it('sets selected=true for rows without errors', () => {
      const result = parseDhlPdfText(SAMPLE_WEIGHT_SECTION)
      result.rows.forEach((r) => {
        if (r.errors.length === 0) {
          expect(r.selected).toBe(true)
        }
      })
    })

    it('includes validFrom in ISO format', () => {
      const result = parseDhlPdfText(SAMPLE_WEIGHT_SECTION)
      result.rows.forEach((r) => {
        expect(r.validFrom).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/)
      })
    })
  })

  describe('multi-section parsing', () => {
    it('parses multiple sections in sequence', () => {
      const combined = SAMPLE_WEIGHT_SECTION + SAMPLE_PACKET_SECTION + SAMPLE_PALLET_SECTION
      const result = parseDhlPdfText(combined)

      const providers = new Set(result.rows.map((r) => r.provider))
      expect(providers.has('DHL Europlus Pakketten')).toBe(true)
      expect(providers.has('DHL For You')).toBe(true)
      expect(providers.has('DHL Europlus Pallets')).toBe(true)
    })

    it('skips return sections within multi-section text', () => {
      const combined =
        SAMPLE_WEIGHT_SECTION + SAMPLE_RETURN_SECTION + SAMPLE_PACKET_SECTION
      const result = parseDhlPdfText(combined)

      const providers = new Set(result.rows.map((r) => r.provider))
      expect(providers.has('DHL Parcel Connect Return')).toBe(false)
    })
  })

  describe('error handling', () => {
    it('returns global error for empty text', () => {
      const result = parseDhlPdfText('')
      expect(result.globalErrors.length).toBeGreaterThan(0)
      expect(result.rows.length).toBe(0)
    })

    it('returns global error for unrecognized content', () => {
      const result = parseDhlPdfText('This is not a DHL rate sheet.')
      expect(result.globalErrors.length).toBeGreaterThan(0)
    })
  })
})

describe('markDuplicates', () => {
  it('marks matching rows as duplicates', () => {
    const rows = parseDhlPdfText(SAMPLE_WEIGHT_SECTION).rows

    const existing = [
      {
        provider: 'DHL Europlus Pakketten',
        tarrifType: 'weight',
        tariffValue: '2',
        fromCountry: 'Nederland',
        toCountry: 'Nederland',
        rateSheetCode: '08032945',
      },
    ]

    const marked = markDuplicates(rows, existing)
    const dup = marked.find(
      (r) => r.toCountry === 'Nederland' && r.tariffValue === '2' && r.targetTable === 'pricing_manual',
    )
    expect(dup?.isDuplicate).toBe(true)
    expect(dup?.warnings).toContain('Duplicate of existing record')
  })

  it('does not mark non-matching rows as duplicates', () => {
    const rows = parseDhlPdfText(SAMPLE_WEIGHT_SECTION).rows
    const marked = markDuplicates(rows, [])
    marked.forEach((r) => {
      expect(r.isDuplicate).toBe(false)
    })
  })
})
