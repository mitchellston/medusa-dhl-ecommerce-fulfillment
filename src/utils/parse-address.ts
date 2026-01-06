/**
 * Address parsing utility for extracting street, house number, and addition
 * from combined address strings. Handles different international formats.
 */

export interface ParsedAddress {
  street: string
  number: string
  addition: string
}

/**
 * Parses an address line into street, number, and addition components.
 *
 * Different countries have different address formats:
 * - Netherlands (NL/BE): "Hoofdstraat 123a" or "Hoofdstraat 123-bis"
 * - UK/IE: "123 High Street" or "123A High Street" or "Flat 4, 123 High Street"
 * - Germany (DE/AT/CH): "Hauptstraße 123" (similar to NL)
 *
 * @param address1 - The combined address line (e.g., "Hoofdstraat 123a")
 * @param countryCode - ISO country code to determine parsing strategy
 * @returns Parsed address components
 */
export function parseAddress(
  address1: string | undefined | null,
  countryCode: string | undefined | null,
): ParsedAddress {
  const result: ParsedAddress = {
    street: '',
    number: '',
    addition: '',
  }

  if (!address1) {
    return result
  }

  const trimmed = address1.trim()
  const country = (countryCode || '').toUpperCase()

  // UK/Ireland style: number comes FIRST (e.g., "123 High Street" or "123A High Street")
  if (['GB', 'UK', 'IE', 'US', 'CA', 'AU', 'NZ'].includes(country)) {
    const result = parseNumberFirstAddress(trimmed)

    // Fallback: if number-first parsing failed, try European style as backup
    if (!result.number) {
      const fallback = parseNumberLastAddress(trimmed)
      if (fallback.number) {
        return fallback
      }
    }

    return result
  }

  // Continental Europe style: number comes LAST (e.g., "Hoofdstraat 123a")
  // Default for NL, BE, DE, AT, CH, FR, ES, IT, etc.
  return parseNumberLastAddress(trimmed)
}

/**
 * Parses addresses where the number comes first (UK/US style).
 * Examples:
 * - "123 High Street" → { street: "High Street", number: "123", addition: "" }
 * - "123A High Street" → { street: "High Street", number: "123", addition: "A" }
 * - "Flat 4, 123 High Street" → { street: "High Street", number: "123", addition: "Flat 4" }
 * - "Unit 2, 45B Main Road" → { street: "Main Road", number: "45", addition: "Unit 2, B" }
 */
function parseNumberFirstAddress(address: string): ParsedAddress {
  // Handle "Flat X, ..." or "Unit X, ..." prefixes
  const flatMatch = address.match(
    /^((?:Flat|Unit|Apt|Apartment|Suite)\s*\d+[A-Za-z]?)\s*[,.]?\s*(.+)$/i,
  )
  let mainAddress = address
  let flatPrefix = ''

  if (flatMatch) {
    flatPrefix = flatMatch[1]
    mainAddress = flatMatch[2]
  }

  // Match: number (with optional letter) at the start, followed by street name
  // e.g., "123" or "123A" or "123-1" at the beginning
  const match = mainAddress.match(/^(\d+)([A-Za-z]|-\d+|\/\d+)?\s+(.+)$/)

  if (match) {
    const number = match[1]
    const letterAddition = match[2] || ''
    const street = match[3].trim()

    // Combine flat prefix with letter addition
    const additions = [flatPrefix, letterAddition.replace(/^-/, '')].filter(Boolean)

    return {
      street,
      number,
      addition: additions.join(', ').trim(),
    }
  }

  // No match - return the whole thing as street
  return {
    street: address,
    number: '',
    addition: flatPrefix,
  }
}

/**
 * Parses addresses where the number comes last (NL/DE style).
 * Examples:
 * - "Hoofdstraat 123" → { street: "Hoofdstraat", number: "123", addition: "" }
 * - "Hoofdstraat 123a" → { street: "Hoofdstraat", number: "123", addition: "a" }
 * - "Hoofdstraat 123-bis" → { street: "Hoofdstraat", number: "123", addition: "bis" }
 * - "Lange Voorhout 123 II" → { street: "Lange Voorhout", number: "123", addition: "II" }
 */
function parseNumberLastAddress(address: string): ParsedAddress {
  // Match: street name followed by number, with optional addition
  // Addition can be: letter(s), "-bis", " II", "/1", etc.
  const match = address.match(/^(.+?)\s+(\d+)\s*([A-Za-z]+|-[A-Za-z]+|\/\d+|\s+[IVX]+)?$/)

  if (match) {
    const street = match[1].trim()
    const number = match[2]
    let addition = (match[3] || '').trim()

    // Clean up addition (remove leading dash/slash)
    addition = addition.replace(/^[-/]/, '').trim()

    return {
      street,
      number,
      addition,
    }
  }

  // Try simpler pattern: anything followed by a number at the end
  const simpleMatch = address.match(/^(.+?)\s+(\d+)$/)
  if (simpleMatch) {
    return {
      street: simpleMatch[1].trim(),
      number: simpleMatch[2],
      addition: '',
    }
  }

  // No match - return the whole thing as street
  return {
    street: address,
    number: '',
    addition: '',
  }
}

/**
 * Extracts address components from Medusa address object.
 * First checks metadata for structured data, then falls back to parsing.
 *
 * @param address - Medusa address object with address_1, metadata, etc.
 * @param countryCode - Country code for parsing strategy
 * @returns Parsed address components
 */
export function extractAddressComponents(
  address:
    | {
        address_1?: string | null
        metadata?: Record<string, unknown> | null
      }
    | null
    | undefined,
  countryCode: string | undefined | null,
): ParsedAddress {
  if (!address) {
    return { street: '', number: '', addition: '' }
  }

  // Check if structured data is available in metadata (preferred)
  const metadata = address.metadata as Record<string, unknown> | undefined
  if (metadata && metadata.street && metadata.house_number) {
    const street = metadata.street as string | undefined
    const houseNumber = metadata.house_number as string | undefined
    const addition = metadata.addition as string | undefined

    // If we have structured data, use it
    if (street || houseNumber) {
      return {
        street: street || '',
        number: houseNumber || '',
        addition: addition || '',
      }
    }
  }

  // Fall back to parsing address_1
  return parseAddress(address.address_1, countryCode)
}
