import {
  Container,
  Hint,
  Select,
  Input,
  Label,
  Button,
  Alert,
  Table,
  IconButton,
  Textarea,
  Badge,
  Tabs,
  Text,
  Heading,
} from '@medusajs/ui'
import { defineRouteConfig } from '@medusajs/admin-sdk'
import { sdk } from '../../../../lib/sdk'
import { useQuery, useMutation, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import { Trash, Plus, ArrowUpRightOnBox, DocumentText, ArrowDownTray } from '@medusajs/icons'
import * as pdfjsLib from 'pdfjs-dist'
// @ts-expect-error - Vite handles this URL import
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Set up PDF.js worker using Vite's ?url suffix to get the bundled worker URL
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const PARCEL_TYPE_KEYS = [
  'ENVELOPE',
  'MAILBOX_PACKAGE',
  'SMALL',
  'MEDIUM',
  'LARGE',
  'XLARGE',
  'XXLARGE',
] as const

const PARCEL_TYPE_LABELS: Record<string, string> = {
  ENVELOPE: 'Envelope',
  MAILBOX_PACKAGE: 'Mailbox',
  SMALL: 'Small',
  MEDIUM: 'Medium',
  LARGE: 'Large',
  XLARGE: 'XL',
  XXLARGE: 'XXL',
}

const SHIPPING_OPTIONS = [
  { key: 'DOOR', label: 'Door Delivery', description: 'DHL For You', rateType: 'parcel_type' },
  { key: 'PS', label: 'Parcel Shop', description: 'DHL For You', rateType: 'parcel_type' },
  { key: 'DOOR_NBB', label: 'Not at Neighbor', description: 'DHL For You', rateType: 'parcel_type' },
  { key: 'BP', label: 'Mailbox Package', description: 'DHL For You', rateType: 'parcel_type' },
  { key: 'EXP', label: 'Express', description: 'DHL Parcel Connect', rateType: 'weight' },
  { key: 'EUROPLUS', label: 'Europlus', description: 'DHL Parcel Connect', rateType: 'weight' },
  { key: 'GLOBALMAIL', label: 'Globalmail', description: 'DHL Parcel Connect', rateType: 'weight' },
] as const

type Rate = {
  id: string
  shipping_option_key: string
  rate_type: 'parcel_type' | 'weight'
  country_code: string
  parcel_type_key: string | null
  max_weight_kg: number | null
  price: number
}

type NewRate = Omit<Rate, 'id'>

const queryClient = new QueryClient()

const formatPrice = (cents: number) => {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

// Text item with position data
interface TextItem {
  str: string
  x: number
  y: number
  page: number
}

// Parse a DHL rate PDF and extract rates for a specific shipping option
async function parsePdfRates(file: File, targetOption: string): Promise<{
  rates: Array<{
    country: string
    prices: Record<string, number>
  }>
  rateType: 'parcel_type' | 'weight'
  detectedOption: string | null
}> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise

  console.log('PDF has', pdf.numPages, 'pages')

  // Extract text with position data from all pages
  const allItems: TextItem[] = []
  let fullText = ''

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()

    for (const item of textContent.items) {
      if ('str' in item && 'transform' in item && item.str.trim()) {
        const transform = item.transform as number[]
        allItems.push({
          str: item.str,
          x: Math.round(transform[4]),
          y: Math.round(transform[5]),
          page: pageNum,
        })
        fullText += item.str + ' '
      }
    }
  }

  console.log('Extracted', allItems.length, 'text items')
  console.log('Full text preview:', fullText.substring(0, 500))

  // Detect rate type and shipping option from content
  let rateType: 'parcel_type' | 'weight' = 'parcel_type'
  let detectedOption: string | null = null

  if (fullText.includes('DHL For You') || fullText.includes('consumenten')) {
    detectedOption = 'DOOR'
    rateType = 'parcel_type'
  } else if (fullText.includes('Parcel Connect')) {
    detectedOption = 'EXP'
    rateType = 'weight'
  } else if (fullText.includes('Europlus')) {
    detectedOption = 'EUROPLUS'
    rateType = 'weight'
  }

  // Determine rate type based on target option
  const targetOptionConfig = SHIPPING_OPTIONS.find(o => o.key === targetOption)
  rateType = (targetOptionConfig?.rateType as 'parcel_type' | 'weight') || 'parcel_type'
  detectedOption = targetOption

  console.log('Target option:', targetOption, 'rateType:', rateType)

  // Identify which pages belong to which shipping option based on section headers
  // Map page numbers to shipping options
  const pageToOption: Map<number, string> = new Map()
  
  // Section header patterns for different shipping options
  const sectionPatterns: Array<{ pattern: RegExp; option: string }> = [
    { pattern: /DHL For You|consumenten in de Benelux/i, option: 'DOOR' },
    { pattern: /Europlus Pakketten|zakelijke adressen in de Benelux(?!.*ochtend)/i, option: 'BP' },
    { pattern: /Europlus Expresser Pakketten|ochtend voor 12 uur.*Pakketten/i, option: 'BP_EXP' },
    { pattern: /Europlus Pallets(?!.*International)(?!.*Expresser)/i, option: 'PALLET' },
    { pattern: /Europlus Expresser Pallets/i, option: 'PALLET_EXP' },
    { pattern: /Parcel Connect(?!.*Return)/i, option: 'EXP' },
    { pattern: /Parcel Connect Return|Retourneren/i, option: 'EXP_RET' },
    { pattern: /Europlus.*International|Europa.*zakelijke/i, option: 'EUROPLUS' },
  ]

  // Scan each page to identify its section
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const pageItems = allItems.filter(i => i.page === pageNum)
    const pageText = pageItems.map(i => i.str).join(' ')
    
    for (const { pattern, option } of sectionPatterns) {
      if (pattern.test(pageText)) {
        pageToOption.set(pageNum, option)
        console.log(`Page ${pageNum} belongs to option: ${option}`)
        break
      }
    }
  }

  // Find pages that match the target option (or similar options)
  const targetPages: Set<number> = new Set()
  for (const [pageNum, option] of pageToOption) {
    // Match exact option or related options
    if (option === targetOption) {
      targetPages.add(pageNum)
    }
    // For door delivery options, also include PS and DOOR_NBB if they're the same
    if (targetOption === 'DOOR' && (option === 'PS' || option === 'DOOR_NBB')) {
      targetPages.add(pageNum)
    }
  }

  // If no pages matched, try to use all pages (fallback)
  if (targetPages.size === 0) {
    console.log('No specific pages found for option, using all pages')
    for (let i = 1; i <= pdf.numPages; i++) {
      targetPages.add(i)
    }
  }

  console.log('Using pages:', Array.from(targetPages))

  // Group text items by page and Y position (rows) with tolerance
  const rowTolerance = 5
  const pageRows: Map<number, Map<number, TextItem[]>> = new Map()

  for (const item of allItems) {
    if (!pageRows.has(item.page)) {
      pageRows.set(item.page, new Map())
    }
    const rows = pageRows.get(item.page)!

    // Find existing row within tolerance
    let foundRow = false
    for (const [rowY] of rows) {
      if (Math.abs(item.y - rowY) < rowTolerance) {
        rows.get(rowY)!.push(item)
        foundRow = true
        break
      }
    }
    if (!foundRow) {
      rows.set(item.y, [item])
    }
  }

  // Sort items within each row by X position
  for (const [, rows] of pageRows) {
    for (const [, items] of rows) {
      items.sort((a, b) => a.x - b.x)
    }
  }

  // Country codes pattern (can be anywhere in row, not just start)
  const countryCodePattern =
    /^(NL|BE|LU|DE|FR|GB|UK|AT|CH|DK|SE|NO|FI|ES|PT|IT|PL|CZ|SK|HU|RO|BG|GR|IE|HR|SI|EE|LV|LT)$/i
  
  // Map country names (Dutch) to ISO codes
  const countryNameToCode: Record<string, string> = {
    'nederland': 'NL', 'belgium': 'BE', 'belgië': 'BE', 'luxemburg': 'LU',
    'germany': 'DE', 'duitsland': 'DE', 'france': 'FR', 'frankrijk': 'FR',
    'bulgarije': 'BG', 'denemarken': 'DK', 'estland': 'EE', 'finland': 'FI',
    'griekenland': 'GR', 'groot-brittannië': 'GB', 'hongarije': 'HU',
    'ierland': 'IE', 'italië': 'IT', 'kroatië': 'HR', 'letland': 'LV',
    'litouwen': 'LT', 'noorwegen': 'NO', 'oostenrijk': 'AT', 'polen': 'PL',
    'portugal': 'PT', 'roemenië': 'RO', 'slovenië': 'SI', 'slovenia': 'SI',
    'slowakije': 'SK', 'spanje': 'ES', 'tsjechië': 'CZ', 'zweden': 'SE',
    'zwitserland': 'CH',
  }

  // Parse each row looking for country code followed by prices
  const rates: Array<{ country: string; prices: Record<string, number> }> = []

  // First, let's log all rows from target pages
  console.log('=== Rows with rate data from target pages ===')
  for (const [pageNum, rows] of pageRows) {
    if (!targetPages.has(pageNum)) continue // Skip pages not in target
    for (const [rowY, items] of rows) {
      const rowText = items.map((i) => i.str).join(' | ')
      // Log rows that contain numbers (potential prices)
      if (/\d+[,\.]\d{2}/.test(rowText) || /€/.test(rowText)) {
        console.log(`Page ${pageNum}, Y=${rowY}: ${rowText}`)
      }
    }
  }
  console.log('=== End of rows ===')

  for (const [pageNum, rows] of pageRows) {
    // Only process pages that match the target shipping option
    if (!targetPages.has(pageNum)) continue

    for (const [rowY, items] of rows) {
      // Join all items in row to a single string for analysis
      const rowText = items.map((i) => i.str).join(' ')

      // Look for country code anywhere in the row
      let country: string | null = null
      let countryIdx = -1

      for (let i = 0; i < items.length; i++) {
        const text = items[i].str.trim()
        if (countryCodePattern.test(text)) {
          country = text.toUpperCase()
          countryIdx = i
          break
        }
        // Also check for country names
        const lowerText = text.toLowerCase()
        if (countryNameToCode[lowerText]) {
          country = countryNameToCode[lowerText]
          countryIdx = i
          break
        }
      }

      if (!country) continue

      // Extract prices from the row (after country code)
      const prices: number[] = []
      for (let i = countryIdx + 1; i < items.length; i++) {
        const rawText = items[i].str.trim()

        // Try different price formats
        // Format 1: "€ 4,95" or "4,95" or "4.95"
        const cleanText = rawText.replace(/[€\s]/g, '').replace(',', '.')

        if (/^\d+\.\d{2}$/.test(cleanText) || /^\d+$/.test(cleanText)) {
          const price = parseFloat(cleanText)
          if (!isNaN(price) && price >= 0.01 && price < 500) {
            prices.push(price)
          }
        }
      }

      console.log(`Page ${pageNum}, Y=${rowY}: Country=${country}, prices=`, prices, 'row:', rowText)

      if (prices.length > 0) {
        const priceMap: Record<string, number> = {}

        if (rateType === 'parcel_type') {
          // Map prices to parcel types
          const parcelKeys = [
            'ENVELOPE',
            'MAILBOX_PACKAGE',
            'SMALL',
            'MEDIUM',
            'LARGE',
            'XLARGE',
            'XXLARGE',
          ]
          prices.forEach((price, idx) => {
            if (idx < parcelKeys.length) {
              priceMap[parcelKeys[idx]] = price
            }
          })
        } else {
          // Map prices to weight brackets
          const weightKeys = ['2', '5', '15', '32']
          prices.forEach((price, idx) => {
            if (idx < weightKeys.length) {
              priceMap[weightKeys[idx]] = price
            }
          })
        }

        // Check if we already have this country
        const existingIdx = rates.findIndex((r) => r.country === country)
        if (existingIdx >= 0) {
          // Merge prices (keep first occurrence for each bracket)
          for (const [key, value] of Object.entries(priceMap)) {
            if (!(key in rates[existingIdx].prices)) {
              rates[existingIdx].prices[key] = value
            }
          }
        } else {
          rates.push({ country, prices: priceMap })
        }
      }
    }
  }

  console.log('Final extracted rates:', rates)

  return { rates, rateType, detectedOption }
}

const DHLRatesPageInner = () => {
  const [selectedShippingOption, setSelectedShippingOption] = useState<string>('DOOR')
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [newRate, setNewRate] = useState<Partial<NewRate>>({})
  const [bulkImportText, setBulkImportText] = useState('')
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [isPdfParsing, setIsPdfParsing] = useState(false)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  const shippingOption = SHIPPING_OPTIONS.find((opt) => opt.key === selectedShippingOption)
  const rateType = shippingOption?.rateType ?? 'parcel_type'

  // Auto-dismiss alerts after 5 seconds
  useEffect(() => {
    if (alert) {
      const timer = setTimeout(() => setAlert(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [alert])

  // Fetch rates
  const { data, isLoading, refetch } = useQuery({
    queryFn: async () => {
      const response = await sdk.client.fetch<{ rates: Rate[] }>(
        `/admin/dhl/rates?shipping_option_key=${selectedShippingOption}`,
      )
      return response
    },
    queryKey: ['dhl-rates', selectedShippingOption],
  })

  // Current rates for the selected shipping option (used for duplicate checking and clear)
  const currentRates: Rate[] = data?.rates ?? []

  // Create rate mutation
  const createRateMutation = useMutation({
    mutationFn: async (rate: NewRate) => {
      return sdk.client.fetch('/admin/dhl/rates', {
        method: 'POST',
        body: rate,
        headers: { 'Content-Type': 'application/json' },
      })
    },
    onSuccess: () => {
      setAlert({ type: 'success', message: 'Rate created successfully.' })
      setNewRate({})
      refetch()
    },
    onError: () => {
      setAlert({ type: 'error', message: 'Failed to create rate.' })
    },
  })

  // Bulk create mutation
  const bulkCreateMutation = useMutation({
    mutationFn: async (rates: NewRate[]) => {
      return sdk.client.fetch('/admin/dhl/rates', {
        method: 'POST',
        body: { rates },
        headers: { 'Content-Type': 'application/json' },
      })
    },
    onSuccess: (_, variables) => {
      setAlert({ type: 'success', message: `${variables.length} rates imported successfully.` })
      setBulkImportText('')
      setShowBulkImport(false)
      refetch()
    },
    onError: () => {
      setAlert({ type: 'error', message: 'Failed to import rates.' })
    },
  })

  // Delete rate mutation
  const deleteRateMutation = useMutation({
    mutationFn: async (id: string) => {
      return sdk.client.fetch(`/admin/dhl/rates/${id}`, {
        method: 'DELETE',
      })
    },
    onSuccess: () => {
      setAlert({ type: 'success', message: 'Rate deleted.' })
      refetch()
    },
    onError: () => {
      setAlert({ type: 'error', message: 'Failed to delete rate.' })
    },
  })

  // Clear all rates for current shipping option
  const clearRatesMutation = useMutation({
    mutationFn: async () => {
      // Get all rate IDs for current shipping option
      const rateIds = (rates || [])
        .filter((r: Rate) => r.shipping_option_key === selectedShippingOption)
        .map((r: Rate) => r.id)
      
      if (rateIds.length === 0) return { deleted: 0 }
      
      // Delete in bulk
      await sdk.client.fetch('/admin/dhl/rates', {
        method: 'DELETE',
        body: { ids: rateIds },
      })
      
      return { deleted: rateIds.length }
    },
    onSuccess: (result) => {
      setAlert({ type: 'success', message: `Cleared ${result?.deleted || 0} rates.` })
      refetch()
    },
    onError: () => {
      setAlert({ type: 'error', message: 'Failed to clear rates.' })
    },
  })

  // Reset new rate when shipping option changes
  useEffect(() => {
    setNewRate({
      shipping_option_key: selectedShippingOption,
      rate_type: rateType,
    })
  }, [selectedShippingOption, rateType])

  const handleAddRate = () => {
    if (!newRate.country_code || newRate.price === undefined) {
      setAlert({ type: 'error', message: 'Please fill in all required fields.' })
      return
    }

    if (rateType === 'parcel_type' && !newRate.parcel_type_key) {
      setAlert({ type: 'error', message: 'Please select a parcel type.' })
      return
    }

    if (rateType === 'weight' && !newRate.max_weight_kg) {
      setAlert({ type: 'error', message: 'Please enter max weight.' })
      return
    }

    // Check for duplicate
    const countryCode = newRate.country_code.toUpperCase()
    const isDuplicate = currentRates.some((existing) => {
      if (existing.country_code !== countryCode) return false
      if (rateType === 'parcel_type') {
        return existing.parcel_type_key === newRate.parcel_type_key
      } else {
        return existing.max_weight_kg === newRate.max_weight_kg
      }
    })

    if (isDuplicate) {
      setAlert({ 
        type: 'error', 
        message: `A rate for ${countryCode} with this ${rateType === 'parcel_type' ? 'parcel type' : 'weight bracket'} already exists.` 
      })
      return
    }

    createRateMutation.mutate({
      shipping_option_key: selectedShippingOption,
      rate_type: rateType,
      country_code: newRate.country_code.toUpperCase(),
      parcel_type_key: rateType === 'parcel_type' ? newRate.parcel_type_key ?? null : null,
      max_weight_kg: rateType === 'weight' ? newRate.max_weight_kg ?? null : null,
      price: Math.round(Number(newRate.price) * 100),
    })
  }

  const handleBulkImport = () => {
    try {
      const lines = bulkImportText.trim().split('\n')
      const rates: NewRate[] = []

      for (const line of lines) {
        const cols = line.split('\t')
        if (cols.length < 2) continue

        const countryCode = cols[0].trim().toUpperCase()
        if (countryCode.length !== 2) continue

        if (rateType === 'parcel_type') {
          PARCEL_TYPE_KEYS.forEach((key, index) => {
            const priceStr = cols[index + 1]?.trim()
            if (priceStr && priceStr !== '-' && priceStr !== '') {
              const price = parseFloat(priceStr.replace(',', '.'))
              if (!isNaN(price)) {
                rates.push({
                  shipping_option_key: selectedShippingOption,
                  rate_type: 'parcel_type',
                  country_code: countryCode,
                  parcel_type_key: key,
                  max_weight_kg: null,
                  price: Math.round(price * 100),
                })
              }
            }
          })
        } else {
          const weightBrackets = [2, 5, 15, 32]
          weightBrackets.forEach((weight, index) => {
            const priceStr = cols[index + 1]?.trim()
            if (priceStr && priceStr !== '-' && priceStr !== '') {
              const price = parseFloat(priceStr.replace(',', '.'))
              if (!isNaN(price)) {
                rates.push({
                  shipping_option_key: selectedShippingOption,
                  rate_type: 'weight',
                  country_code: countryCode,
                  parcel_type_key: null,
                  max_weight_kg: weight,
                  price: Math.round(price * 100),
                })
              }
            }
          })
        }
      }

      if (rates.length === 0) {
        setAlert({ type: 'error', message: 'No valid rates found in import data.' })
        return
      }

      // Filter out duplicates - rates that already exist for this shipping option
      const newRates = rates.filter((newRate) => {
        const exists = currentRates.some((existing) => {
          if (existing.country_code !== newRate.country_code) return false
          if (newRate.rate_type === 'parcel_type') {
            return existing.parcel_type_key === newRate.parcel_type_key
          } else {
            return existing.max_weight_kg === newRate.max_weight_kg
          }
        })
        return !exists
      })

      const skippedCount = rates.length - newRates.length
      if (skippedCount > 0) {
        console.log(`Skipping ${skippedCount} duplicate rates`)
      }

      if (newRates.length === 0) {
        setAlert({ 
          type: 'error', 
          message: `All ${rates.length} rates already exist. Use "Clear All" first if you want to replace them.` 
        })
        return
      }

      // Show message about skipped duplicates
      if (skippedCount > 0) {
        setAlert({ 
          type: 'success', 
          message: `Importing ${newRates.length} new rates (${skippedCount} duplicates skipped)...` 
        })
      }

      bulkCreateMutation.mutate(newRates)
    } catch {
      setAlert({ type: 'error', message: 'Failed to parse import data.' })
    }
  }

  const handlePdfImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      setAlert({ type: 'error', message: 'Please select a PDF file.' })
      return
    }

    setIsPdfParsing(true)
    try {
      // Pass the currently selected shipping option to extract only relevant rates
      const { rates: parsedRates, rateType: detectedRateType } = await parsePdfRates(file, selectedShippingOption)

      if (parsedRates.length === 0) {
        setAlert({
          type: 'error',
          message: 'Could not extract rates from PDF. Try using the manual bulk import instead.',
        })
        setIsPdfParsing(false)
        return
      }

      // Convert to bulk import text format for preview
      const lines: string[] = []
      for (const { country, prices } of parsedRates) {
        if (detectedRateType === 'parcel_type') {
          const values = PARCEL_TYPE_KEYS.map((key) =>
            prices[key] !== undefined ? prices[key].toFixed(2) : '-',
          )
          lines.push(`${country}\t${values.join('\t')}`)
        } else {
          const weightKeys = ['2', '5', '15', '32']
          const values = weightKeys.map((key) =>
            prices[key] !== undefined ? prices[key].toFixed(2) : '-',
          )
          lines.push(`${country}\t${values.join('\t')}`)
        }
      }

      // Update UI to show bulk import with extracted data
      setBulkImportText(lines.join('\n'))
      setShowBulkImport(true)

      // Don't auto-switch shipping option - let user select the correct tab first
      // Just inform them about what was detected
      const currentOption = SHIPPING_OPTIONS.find(o => o.key === selectedShippingOption)?.label || selectedShippingOption

      setAlert({
        type: 'success',
        message: `Extracted ${parsedRates.length} countries from PDF. Rates will be imported for "${currentOption}". Select a different tab if needed, then click "Import Rates".`,
      })
    } catch (error) {
      console.error('PDF parsing error:', error)
      setAlert({
        type: 'error',
        message: 'Failed to parse PDF. The file format may not be supported.',
      })
    } finally {
      setIsPdfParsing(false)
      // Reset file input
      if (pdfInputRef.current) {
        pdfInputRef.current.value = ''
      }
    }
  }

  const rates = data?.rates ?? []

  // Group rates by country for display
  const ratesByCountry = rates.reduce(
    (acc, rate) => {
      if (!acc[rate.country_code]) {
        acc[rate.country_code] = []
      }
      acc[rate.country_code].push(rate)
      return acc
    },
    {} as Record<string, Rate[]>,
  )

  const countryCount = Object.keys(ratesByCountry).length
  const rateCount = rates.length

  if (isLoading) {
    return (
      <Container className="divide-y p-0">
        <div className="flex items-center justify-center py-12">
          <Text className="text-ui-fg-muted">Loading rates...</Text>
        </div>
      </Container>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Alert */}
      {alert && (
        <Alert
          variant={alert.type === 'success' ? 'success' : 'error'}
          dismissible
          className="mx-0"
        >
          {alert.message}
        </Alert>
      )}

      {/* Header */}
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <a
                href="/settings/dhl"
                className="text-ui-fg-muted hover:text-ui-fg-base text-sm flex items-center gap-1"
              >
                DHL Settings
              </a>
              <span className="text-ui-fg-muted">/</span>
              <span className="text-sm font-medium">Rate Management</span>
            </div>
            <Heading level="h1" className="text-xl">
              Shipping Rates
            </Heading>
            <Text className="text-ui-fg-muted mt-1">
              Configure manual pricing for shipping options when API pricing is unavailable.
            </Text>
          </div>
          <div className="flex items-center gap-2">
            <Badge color="grey" size="small">
              {rateCount} {rateCount === 1 ? 'rate' : 'rates'}
            </Badge>
            <Badge color="blue" size="small">
              {countryCount} {countryCount === 1 ? 'country' : 'countries'}
            </Badge>
          </div>
        </div>
      </Container>

      {/* Shipping Option Tabs */}
      <Container className="p-0">
        <Tabs value={selectedShippingOption} onValueChange={setSelectedShippingOption}>
          <div className="border-b border-ui-border-base">
            <Tabs.List className="px-4">
              {SHIPPING_OPTIONS.map((option) => (
                <Tabs.Trigger key={option.key} value={option.key} className="px-4 py-3">
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{option.label}</span>
                    <span className="text-xs text-ui-fg-muted">{option.description}</span>
                  </div>
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          </div>

          {SHIPPING_OPTIONS.map((option) => (
            <Tabs.Content key={option.key} value={option.key} className="p-0">
              <div className="px-6 py-4 bg-ui-bg-subtle border-b border-ui-border-base">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge color={option.rateType === 'parcel_type' ? 'purple' : 'green'}>
                    {option.rateType === 'parcel_type' ? 'By Parcel Size' : 'By Weight'}
                  </Badge>
                  <Text size="small" className="text-ui-fg-muted">
                    {option.rateType === 'parcel_type'
                      ? 'Pricing based on parcel dimensions'
                      : 'Pricing based on weight brackets (2kg, 5kg, 15kg, 32kg)'}
                  </Text>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handlePdfImport}
                    className="hidden"
                    id="pdf-upload"
                  />
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => pdfInputRef.current?.click()}
                    disabled={isPdfParsing}
                  >
                    <ArrowDownTray />
                    {isPdfParsing ? 'Parsing...' : 'Import PDF'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setShowBulkImport(!showBulkImport)}
                  >
                    <DocumentText />
                    {showBulkImport ? 'Single Entry' : 'Bulk Import'}
                  </Button>
                  {currentRates.length > 0 && (
                    <Button
                      variant="danger"
                      size="small"
                      onClick={() => {
                        if (window.confirm(`Clear all ${currentRates.length} rates for this shipping option?`)) {
                          clearRatesMutation.mutate()
                        }
                      }}
                      disabled={clearRatesMutation.isPending}
                    >
                      <Trash />
                      {clearRatesMutation.isPending ? 'Clearing...' : 'Clear All'}
                    </Button>
                  )}
                </div>
              </div>
              </div>
            </Tabs.Content>
          ))}
        </Tabs>

        {/* Add Rate Form */}
        <div className="px-6 py-5 border-b border-ui-border-base">
          {showBulkImport ? (
            <div className="space-y-4">
              <div>
                <Label className="font-medium">Paste from Spreadsheet</Label>
                <Hint className="mt-1 mb-3">
                  {rateType === 'parcel_type'
                    ? 'Columns: Country Code, Envelope, Mailbox, Small, Medium, Large, XL, XXL (tab-separated)'
                    : 'Columns: Country Code, 2kg, 5kg, 15kg, 32kg (tab-separated)'}
                </Hint>
                <Textarea
                  className="font-mono text-sm bg-ui-bg-field"
                  rows={8}
                  placeholder={
                    rateType === 'parcel_type'
                      ? 'NL\t3.95\t4.25\t4.95\t5.95\t6.95\t7.95\t9.95\nBE\t4.50\t4.75\t5.50\t6.50\t7.50\t8.50\t10.50\nDE\t5.50\t5.75\t6.50\t7.50\t8.50\t9.50\t11.50'
                      : 'DE\t6.95\t8.95\t12.95\t18.95\nFR\t7.95\t9.95\t14.95\t21.95\nGB\t8.95\t10.95\t16.95\t24.95'
                  }
                  value={bulkImportText}
                  onChange={(e) => setBulkImportText(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleBulkImport}
                  disabled={!bulkImportText.trim() || bulkCreateMutation.isPending}
                >
                  {bulkCreateMutation.isPending ? 'Importing...' : 'Import Rates'}
                </Button>
                <Button variant="secondary" onClick={() => setShowBulkImport(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-end gap-3 flex-wrap">
              <div className="w-20">
                <Label className="text-xs text-ui-fg-muted mb-1.5 block">Country</Label>
                <Input
                  placeholder="NL"
                  maxLength={2}
                  className="uppercase font-medium"
                  value={newRate.country_code ?? ''}
                  onChange={(e) =>
                    setNewRate((prev) => ({ ...prev, country_code: e.target.value.toUpperCase() }))
                  }
                />
              </div>

              {rateType === 'parcel_type' ? (
                <div className="w-44">
                  <Label className="text-xs text-ui-fg-muted mb-1.5 block">Parcel Type</Label>
                  <Select
                    value={newRate.parcel_type_key ?? ''}
                    onValueChange={(value) =>
                      setNewRate((prev) => ({ ...prev, parcel_type_key: value }))
                    }
                  >
                    <Select.Trigger>
                      <Select.Value placeholder="Select size" />
                    </Select.Trigger>
                    <Select.Content>
                      {PARCEL_TYPE_KEYS.map((key) => (
                        <Select.Item key={key} value={key}>
                          {PARCEL_TYPE_LABELS[key] || key}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </div>
              ) : (
                <div className="w-32">
                  <Label className="text-xs text-ui-fg-muted mb-1.5 block">Max Weight</Label>
                  <Select
                    value={newRate.max_weight_kg?.toString() ?? ''}
                    onValueChange={(value) =>
                      setNewRate((prev) => ({ ...prev, max_weight_kg: parseFloat(value) }))
                    }
                  >
                    <Select.Trigger>
                      <Select.Value placeholder="Select" />
                    </Select.Trigger>
                    <Select.Content>
                      {[2, 5, 15, 32].map((kg) => (
                        <Select.Item key={kg} value={kg.toString()}>
                          {kg} kg
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </div>
              )}

              <div className="w-28">
                <Label className="text-xs text-ui-fg-muted mb-1.5 block">Price (EUR)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="5.95"
                  value={newRate.price !== undefined ? (newRate.price / 100).toFixed(2) : ''}
                  onChange={(e) =>
                    setNewRate((prev) => ({
                      ...prev,
                      price: Math.round(parseFloat(e.target.value || '0') * 100),
                    }))
                  }
                />
              </div>

              <Button onClick={handleAddRate} disabled={createRateMutation.isPending}>
                <Plus />
                Add Rate
              </Button>
            </div>
          )}
        </div>

        {/* Rates Table */}
        <div className="px-6 py-4">
          {countryCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-ui-bg-subtle flex items-center justify-center mb-4">
                <ArrowUpRightOnBox className="text-ui-fg-muted" />
              </div>
              <Heading level="h3" className="text-base mb-1">
                No rates configured
              </Heading>
              <Text className="text-ui-fg-muted max-w-sm">
                Add shipping rates for {shippingOption?.label} using the form above or import from a
                spreadsheet.
              </Text>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(ratesByCountry)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([countryCode, countryRates]) => (
                  <div key={countryCode} className="border border-ui-border-base rounded-lg overflow-hidden">
                    <div className="bg-ui-bg-subtle px-4 py-2.5 border-b border-ui-border-base flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge size="small" className="font-mono font-medium">
                          {countryCode}
                        </Badge>
                        <Text size="small" className="text-ui-fg-muted">
                          {countryRates.length} {countryRates.length === 1 ? 'rate' : 'rates'}
                        </Text>
                      </div>
                    </div>
                    <Table>
                      <Table.Header>
                        <Table.Row className="bg-ui-bg-base">
                          <Table.HeaderCell className="w-1/2">
                            {rateType === 'parcel_type' ? 'Parcel Size' : 'Weight Bracket'}
                          </Table.HeaderCell>
                          <Table.HeaderCell>Price</Table.HeaderCell>
                          <Table.HeaderCell className="w-16"></Table.HeaderCell>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {countryRates
                          .sort((a, b) => {
                            if (rateType === 'parcel_type') {
                              return (
                                PARCEL_TYPE_KEYS.indexOf(
                                  a.parcel_type_key as (typeof PARCEL_TYPE_KEYS)[number],
                                ) -
                                PARCEL_TYPE_KEYS.indexOf(
                                  b.parcel_type_key as (typeof PARCEL_TYPE_KEYS)[number],
                                )
                              )
                            }
                            return (a.max_weight_kg ?? 0) - (b.max_weight_kg ?? 0)
                          })
                          .map((rate) => (
                            <Table.Row key={rate.id} className="hover:bg-ui-bg-subtle-hover">
                              <Table.Cell>
                                {rateType === 'parcel_type' ? (
                                  <Badge color="purple" size="small">
                                    {PARCEL_TYPE_LABELS[rate.parcel_type_key ?? ''] ||
                                      rate.parcel_type_key}
                                  </Badge>
                                ) : (
                                  <Badge color="green" size="small">
                                    {rate.max_weight_kg} kg
                                  </Badge>
                                )}
                              </Table.Cell>
                              <Table.Cell className="font-medium tabular-nums">
                                {formatPrice(rate.price)}
                              </Table.Cell>
                              <Table.Cell>
                                <IconButton
                                  variant="transparent"
                                  size="small"
                                  onClick={() => deleteRateMutation.mutate(rate.id)}
                                  disabled={deleteRateMutation.isPending}
                                >
                                  <Trash className="text-ui-fg-muted hover:text-ui-fg-error" />
                                </IconButton>
                              </Table.Cell>
                            </Table.Row>
                          ))}
                      </Table.Body>
                    </Table>
                  </div>
                ))}
            </div>
          )}
        </div>
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: 'DHL Rates',
})

const DHLRatesPage = () => (
  <QueryClientProvider client={queryClient}>
    <DHLRatesPageInner />
  </QueryClientProvider>
)

export default DHLRatesPage
