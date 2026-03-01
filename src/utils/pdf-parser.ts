import type { ParsedPricingRow, ParseResult, TarrifType } from '../types/pricing'

const CONSUMER_PRODUCTS = ['DHL For You', 'DHL Parcel Connect']

const TARIFF_TYPE_MAP: Record<string, TarrifType> = {
  'Collo / pakket': 'packet_type',
  'Gewicht (kg)': 'weight',
  Pallet: 'pallet',
}

const KNOWN_PRODUCTS = [
  'DHL Parcel Connect Return',
  'DHL Parcel Connect',
  'DHL Europlus Expresser Pakketten',
  'DHL Europlus Expresser Pallets',
  'DHL Europlus Pallets International',
  'DHL Europlus Pallets',
  'DHL Europlus Pakketten',
  'Europlus International',
  'DHL For You',
] as const

const MULTI_WORD_HEADERS = ['Per extra 50KG', 'Per pallet']

interface SectionRow {
  prefix: 'Beide' | 'Naar' | 'Van'
  country: string
  prices: (number | null)[]
}

interface Section {
  provider: string
  tarrifType: TarrifType
  forConsument: boolean
  validFrom: string
  rateSheetCode: string
  columns: string[]
  extraColumnIndex: number | null
  rows: SectionRow[]
}

function isSkipLine(line: string): boolean {
  if (/^--\s*\d+\s+(of|van)\s+\d+\s*--$/i.test(line)) return true
  if (line.startsWith('DHL eCommerce - Excellence')) return true
  if (line.startsWith('INHOUDSOPGAVE')) return true
  if (line.startsWith('Alle prijzen zijn')) return true
  if (/^Pagina\s+\d+/i.test(line)) return true
  if (line === '') return true
  return false
}

function isPriceToken(token: string): boolean {
  return /^\d+([,.]\d+)?$/.test(token) || /^[—\-–]$/.test(token)
}

function parsePrice(token: string): number | null {
  if (/^[—\-–]$/.test(token)) return null
  const normalized = token.replace(',', '.')
  const num = parseFloat(normalized)
  return isNaN(num) ? null : num
}

function findProduct(line: string): string | null {
  for (const product of KNOWN_PRODUCTS) {
    if (line === product) return product
  }
  for (const product of KNOWN_PRODUCTS) {
    if (line.startsWith(product)) return product
  }
  return null
}

function parseHeaderLine(line: string): string[] {
  let headerPart = line.replace(/^Van\/naar\s+country\s*/i, '')

  for (const mwh of MULTI_WORD_HEADERS) {
    headerPart = headerPart.replace(mwh, mwh.replace(/\s+/g, '\u0000'))
  }

  return headerPart
    .split(/\s+/)
    .filter((c) => c.length > 0)
    .map((c) => c.replace(/\u0000/g, ' '))
}

function parseDataRow(
  line: string,
  columnCount: number,
): { prefix: 'Beide' | 'Naar' | 'Van'; country: string; prices: (number | null)[] } | null {
  const prefixMatch = line.match(/^(Beide|Naar|Van)\s+(.+)$/)
  if (!prefixMatch) return null

  const prefix = prefixMatch[1] as 'Beide' | 'Naar' | 'Van'
  const rest = prefixMatch[2]
  const tokens = rest.split(/\s+/).filter((t) => t.length > 0)

  const priceTokens: string[] = []
  let i = tokens.length - 1
  while (i >= 0 && priceTokens.length < columnCount) {
    if (isPriceToken(tokens[i])) {
      priceTokens.unshift(tokens[i])
      i--
    } else {
      break
    }
  }

  while (priceTokens.length < columnCount) {
    priceTokens.unshift('—')
  }

  const countryTokens = tokens.slice(0, i + 1)
  const country = countryTokens.join(' ')

  if (!country) return null

  const prices = priceTokens.map(parsePrice)
  return { prefix, country, prices }
}

function isReturnSection(provider: string): boolean {
  return provider === 'DHL Parcel Connect Return' || provider.toLowerCase().includes('return')
}

function sectionsToRows(sections: Section[]): ParsedPricingRow[] {
  const rows: ParsedPricingRow[] = []
  let rowIndex = 0

  for (const section of sections) {
    if (isReturnSection(section.provider)) continue

    for (const row of section.rows) {
      if (row.prefix === 'Van') continue

      const fromCountry = row.prefix === 'Beide' ? row.country : 'Nederland'
      const toCountry = row.country

      for (let colIdx = 0; colIdx < section.columns.length; colIdx++) {
        const price = row.prices[colIdx]
        if (price === null || price === undefined) continue

        const isExtra = section.extraColumnIndex !== null && colIdx === section.extraColumnIndex
        const rawColumnHeader = section.columns[colIdx]
        const tariffValue = isExtra
          ? (rawColumnHeader.match(/\d+/)?.[0] ?? rawColumnHeader)
          : rawColumnHeader

        const warnings: string[] = []
        const errors: string[] = []

        if (price < 0) errors.push('Price is negative')
        if (!tariffValue) errors.push('Missing tariff value')
        if (!section.tarrifType) errors.push('Unknown tariff type')
        if (!fromCountry) errors.push('Missing fromCountry')
        if (!toCountry) errors.push('Missing toCountry')

        rows.push({
          forConsument: section.forConsument,
          tarrifType: section.tarrifType,
          tariffValue,
          provider: section.provider,
          fromCountry,
          toCountry,
          price,
          validFrom: section.validFrom ? section.validFrom + 'T00:00:00.000Z' : '',
          validTo: null,
          rateSheetCode: section.rateSheetCode,
          targetTable: isExtra ? 'pricing_manual_extra' : 'pricing_manual',
          rowIndex: rowIndex++,
          warnings,
          errors,
          isDuplicate: false,
          selected: errors.length === 0,
        })
      }
    }
  }

  return rows
}

/**
 * Parse extracted text from a DHL eCommerce rate sheet PDF into structured pricing rows.
 * Handles Dutch-language PDFs with sections for different product types, tariff types,
 * and country destinations. Skips return rate sections (DHL Parcel Connect Return).
 */
export function parseDhlPdfText(text: string): ParseResult {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const sections: Section[] = []
  let currentSection: Partial<Section> | null = null
  let columnCount = 0
  const globalWarnings: string[] = []
  const globalErrors: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (isSkipLine(line)) continue

    const tariffMatch = line.match(/^Tarieftype\s+(.+)$/)
    if (tariffMatch) {
      const tariffTypeStr = tariffMatch[1].trim()
      const tarrifType = TARIFF_TYPE_MAP[tariffTypeStr]
      if (!tarrifType) {
        globalWarnings.push(`Unknown tariff type on line ${i + 1}: "${tariffTypeStr}"`)
      }
      if (currentSection) {
        currentSection.tarrifType = tarrifType
      }
      continue
    }

    const startMatch = line.match(/Start\s*datum\s+(\d{4}-\d{2}-\d{2})/)
    const rateSheetMatch = line.match(/(\d{6,})/)
    if (startMatch) {
      if (currentSection) {
        currentSection.validFrom = startMatch[1]
        if (rateSheetMatch) currentSection.rateSheetCode = rateSheetMatch[1]
      }
      continue
    }

    if (/^Van\/naar/i.test(line)) {
      const columns = parseHeaderLine(line)
      columnCount = columns.length
      const extraIdx = columns.findIndex(
        (c) => c.toLowerCase().includes('extra') || c.toLowerCase().includes('per extra'),
      )

      if (currentSection) {
        currentSection.columns = columns
        currentSection.extraColumnIndex = extraIdx >= 0 ? extraIdx : null
        if (!currentSection.rows) currentSection.rows = []
      }
      continue
    }

    const product = findProduct(line)
    if (product) {
      if (
        currentSection?.provider &&
        currentSection.columns &&
        currentSection.rows &&
        currentSection.rows.length > 0
      ) {
        sections.push(currentSection as Section)
      }

      currentSection = {
        provider: product,
        forConsument: CONSUMER_PRODUCTS.some((cp) => product.startsWith(cp)),
        rows: [],
      }
      continue
    }

    const dataRow = /^(Beide|Naar|Van)\s+/.test(line)
    if (dataRow && currentSection?.columns && columnCount > 0) {
      const parsed = parseDataRow(line, columnCount)
      if (parsed) {
        if (!currentSection.rows) currentSection.rows = []
        currentSection.rows.push(parsed)
      } else {
        globalWarnings.push(`Could not parse data row on line ${i + 1}: "${line}"`)
      }
      continue
    }
  }

  if (
    currentSection?.provider &&
    currentSection.columns &&
    currentSection.rows &&
    currentSection.rows.length > 0
  ) {
    sections.push(currentSection as Section)
  }

  if (sections.length === 0) {
    globalErrors.push('No pricing sections found in the PDF text')
  }

  const rows = sectionsToRows(sections)

  const validFromValues = sections.map((s) => s.validFrom).filter(Boolean)
  const rateSheetCodes = sections.map((s) => s.rateSheetCode).filter(Boolean)

  return {
    rows,
    rateSheetCode: rateSheetCodes[0] ?? '',
    validFrom: validFromValues[0] ?? '',
    globalWarnings,
    globalErrors,
  }
}

/**
 * Parse a DHL eCommerce rate sheet PDF buffer into structured pricing rows.
 * Extracts text from the PDF and delegates to the text parser.
 */
export async function parseDhlPdf(pdfBuffer: Buffer): Promise<ParseResult> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(pdfBuffer)
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise

  const allLines: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()

    const lineMap = new Map<number, { x: number; str: string }[]>()
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const y = Math.round(item.transform[5])
      const x = item.transform[4]
      if (!lineMap.has(y)) lineMap.set(y, [])
      lineMap.get(y)!.push({ x, str: item.str })
    }

    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a)
    for (const y of sortedYs) {
      const items = lineMap.get(y)!.sort((a, b) => a.x - b.x)
      allLines.push(items.map((it) => it.str).join(' '))
    }
  }

  return parseDhlPdfText(allLines.join('\n'))
}

/**
 * Mark rows as duplicates by comparing against existing records
 * using the logical key: provider + tarrifType + tariffValue + fromCountry + toCountry + rateSheetCode
 */
export function markDuplicates(
  rows: ParsedPricingRow[],
  existingRecords: Array<{
    provider: string
    tarrifType: string
    tariffValue: string
    fromCountry: string
    toCountry: string
    rateSheetCode: string | null
  }>,
): ParsedPricingRow[] {
  const existingKeys = new Set(
    existingRecords.map(
      (r) =>
        `${r.provider}|${r.tarrifType}|${r.tariffValue}|${r.fromCountry}|${r.toCountry}|${r.rateSheetCode ?? ''}`,
    ),
  )

  return rows.map((row) => {
    const key = `${row.provider}|${row.tarrifType}|${row.tariffValue}|${row.fromCountry}|${row.toCountry}|${row.rateSheetCode}`
    const isDuplicate = existingKeys.has(key)
    return {
      ...row,
      isDuplicate,
      warnings: isDuplicate
        ? [...row.warnings, 'Duplicate of existing record']
        : row.warnings,
    }
  })
}
