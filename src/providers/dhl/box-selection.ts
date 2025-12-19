import type { DhlBox } from '../../modules/setting/schema'

type ItemDimsCm = {
  length_cm: number
  width_cm: number
  height_cm: number
}

function sortDims(dims: [number, number, number]): [number, number, number] {
  const s = [...dims].sort((a, b) => a - b)
  return [s[0], s[1], s[2]]
}

function volumeCm3(d: ItemDimsCm): number {
  return d.length_cm * d.width_cm * d.height_cm
}

function getWeightGramsFromUnknownItem(item: unknown): number {
  const anyItem = item as any
  const quantity = typeof anyItem?.quantity === 'number' ? anyItem.quantity : 1

  // Provider path: item.line_item.variant.weight (grams)
  const w1 = anyItem?.line_item?.variant?.weight
  const w2 = anyItem?.line_item?.product?.weight

  // Workflow path: item.variant.weight (grams)
  const w3 = anyItem?.variant?.weight

  const weight =
    typeof w1 === 'number' ? w1 : typeof w2 === 'number' ? w2 : typeof w3 === 'number' ? w3 : 0
  return weight * quantity
}

function getDimsCmFromUnknownItem(item: unknown): { dims?: ItemDimsCm; quantity: number } {
  const anyItem = item as any
  const quantity = typeof anyItem?.quantity === 'number' ? anyItem.quantity : 1

  // Provider path: item.line_item.variant.{length,width,height}
  const v = anyItem?.line_item?.variant ?? anyItem?.variant

  const length = v?.length
  const width = v?.width
  const height = v?.height

  if (typeof length === 'number' && typeof width === 'number' && typeof height === 'number') {
    return {
      quantity,
      dims: { length_cm: length, width_cm: width, height_cm: height },
    }
  }

  return { quantity }
}

export type BoxSelectionResult = {
  selectedBox?: DhlBox
  total_weight_kg: number
  has_item_dimensions: boolean
  used_fallback_largest: boolean
}

export type PackedPackage = {
  box: DhlBox
  /** Total weight for this package (kg) */
  weight_kg: number
  /** Total volume for this package (cm^3). 0 when item dimensions are missing. */
  volume_cm3: number
  /** Number of “units” packed into this package (expanded quantities). */
  units: number
}

export type PackItemsDiagnostics = {
  has_item_dimensions: boolean
  used_fallback_largest: boolean
  /**
   * Count of units we could not confidently fit (e.g. missing dims but box max weight exceeded, or no boxes configured).
   * In soft-fallback mode this does not stop shipment creation; it’s informational.
   */
  unplaced_units: number
}

export type PackItemsIntoBoxesResult = {
  packages: PackedPackage[]
  total_weight_kg: number
  diagnostics: PackItemsDiagnostics
}

type Unit = {
  weight_kg: number
  dims?: ItemDimsCm
  volume_cm3: number
}

function getUnitItems(items: unknown[]): { units: Unit[]; hasItemDimensions: boolean } {
  const dimsWithQty = items.map(getDimsCmFromUnknownItem)
  const hasItemDimensions = dimsWithQty.some((d) => Boolean(d.dims))

  const units: Unit[] = []

  for (const item of items) {
    const anyItem = item as any
    const quantity = typeof anyItem?.quantity === 'number' ? anyItem.quantity : 1

    // weight in grams → kg (per unit)
    const w1 = anyItem?.line_item?.variant?.weight
    const w2 = anyItem?.line_item?.product?.weight
    const w3 = anyItem?.variant?.weight
    const grams =
      typeof w1 === 'number' ? w1 : typeof w2 === 'number' ? w2 : typeof w3 === 'number' ? w3 : 0
    const weightKg = Number(grams || 0) / 1000

    const { dims } = getDimsCmFromUnknownItem(item)
    const vol = dims ? volumeCm3(dims) : 0

    for (let i = 0; i < quantity; i++) {
      units.push({
        weight_kg: weightKg,
        dims,
        volume_cm3: vol,
      })
    }
  }

  // Sort by volume desc (items without dims will be pushed to end)
  units.sort((a, b) => (b.volume_cm3 || 0) - (a.volume_cm3 || 0))

  return { units, hasItemDimensions }
}

function fitsUnitInBox(unit: Unit, box: DhlBox): boolean {
  if (typeof box.max_weight_kg === 'number' && unit.weight_kg > box.max_weight_kg) return false
  if (!unit.dims) return true // can't validate dims; allow and rely on weight-only

  const innerSorted = sortDims([box.inner_cm.length, box.inner_cm.width, box.inner_cm.height])
  const unitSorted = sortDims([unit.dims.length_cm, unit.dims.width_cm, unit.dims.height_cm])
  return unitSorted[0] <= innerSorted[0] && unitSorted[1] <= innerSorted[1] && unitSorted[2] <= innerSorted[2]
}

function fitsUnitInPackage(unit: Unit, pkg: PackedPackage, hasItemDimensions: boolean): boolean {
  // Weight constraint
  if (typeof pkg.box.max_weight_kg === 'number' && pkg.weight_kg + unit.weight_kg > pkg.box.max_weight_kg) {
    return false
  }

  // If no item dimensions, we can't do volume math; allow placement as long as weight fits.
  if (!hasItemDimensions) return true

  if (!unit.dims) {
    // Some items missing dimensions: allow, but we lose strict volume accounting.
    // This is treated as “soft fallback” by the caller via diagnostics.
    return true
  }

  const boxVolume =
    pkg.box.inner_cm.length * pkg.box.inner_cm.width * pkg.box.inner_cm.height
  if (pkg.volume_cm3 + unit.volume_cm3 > boxVolume) return false

  const innerSorted = sortDims([pkg.box.inner_cm.length, pkg.box.inner_cm.width, pkg.box.inner_cm.height])
  const unitSorted = sortDims([unit.dims.length_cm, unit.dims.width_cm, unit.dims.height_cm])
  return unitSorted[0] <= innerSorted[0] && unitSorted[1] <= innerSorted[1] && unitSorted[2] <= innerSorted[2]
}

/**
 * Pack items into multiple boxes using a greedy heuristic.
 *
 * - Expands quantities into “units”
 * - Sorts units by volume (desc)
 * - Places each unit into the first existing package it fits (weight + dims/volume when available)
 * - Otherwise opens a new package with the smallest box that fits the unit
 *
 * Soft fallback behavior:
 * - If boxes are not configured, returns `packages=[]` and diagnostics indicating fallback.
 * - If some item dimensions are missing, packing becomes less strict and diagnostics will indicate fallback.
 */
export function packItemsIntoBoxes(items: unknown[], boxes: DhlBox[]): PackItemsIntoBoxesResult {
  const totalWeightKg = items.reduce<number>((sum, it) => sum + getWeightGramsFromUnknownItem(it), 0) / 1000

  const sortedBoxes = [...boxes].sort((a, b) => {
    const va = a.inner_cm.length * a.inner_cm.width * a.inner_cm.height
    const vb = b.inner_cm.length * b.inner_cm.width * b.inner_cm.height
    return va - vb
  })

  const { units, hasItemDimensions } = getUnitItems(items)

  if (sortedBoxes.length === 0) {
    return {
      packages: [],
      total_weight_kg: totalWeightKg,
      diagnostics: {
        has_item_dimensions: hasItemDimensions,
        used_fallback_largest: true,
        unplaced_units: units.length,
      },
    }
  }

  const packages: PackedPackage[] = []
  let unplacedUnits = 0
  let usedFallbackLargest = false

  for (const unit of units) {
    // First fit existing packages
    let placed = false
    for (const pkg of packages) {
      if (fitsUnitInPackage(unit, pkg, hasItemDimensions)) {
        pkg.weight_kg += unit.weight_kg
        pkg.volume_cm3 += unit.volume_cm3
        pkg.units += 1
        placed = true
        break
      }
    }

    if (placed) continue

    // Open a new package using smallest fitting box
    const candidate = sortedBoxes.find((b) => fitsUnitInBox(unit, b))
    if (candidate) {
      packages.push({
        box: candidate,
        weight_kg: unit.weight_kg,
        volume_cm3: unit.volume_cm3,
        units: 1,
      })
      continue
    }

    // Could not find any box for this unit; soft fallback: assign to largest box.
    const largest = sortedBoxes.at(-1)
    if (largest) {
      usedFallbackLargest = true
      packages.push({
        box: largest,
        weight_kg: unit.weight_kg,
        volume_cm3: unit.volume_cm3,
        units: 1,
      })
    } else {
      unplacedUnits += 1
    }
  }

  // If some items had no dimensions but others did, treat as “soft fallback” (less strict packing).
  const anyMissingDims = hasItemDimensions && units.some((u) => !u.dims)
  if (anyMissingDims) usedFallbackLargest = true

  return {
    packages,
    total_weight_kg: totalWeightKg,
    diagnostics: {
      has_item_dimensions: hasItemDimensions,
      used_fallback_largest: usedFallbackLargest,
      unplaced_units: unplacedUnits,
    },
  }
}

/**
 * Select the smallest fitting box.
 *
 * Heuristic:
 * - total weight from item weights (g → kg)
 * - total volume from item volumes (if dimensions exist)
 * - max item dims must fit within box inner dims (rotation allowed by sorting dims)
 * - total volume must fit (if dimensions exist)
 * - max_weight_kg must not be exceeded (if configured)
 */
export function selectBoxForItems(items: unknown[], boxes: DhlBox[]): BoxSelectionResult {
  const totalWeightKg =
    items.reduce<number>((sum, it) => sum + getWeightGramsFromUnknownItem(it), 0) / 1000

  const dimsWithQty = items.map(getDimsCmFromUnknownItem)
  const dimsOnly = dimsWithQty.map((d) => d.dims).filter(Boolean) as ItemDimsCm[]
  const hasItemDimensions = dimsOnly.length > 0

  const totalVolume = dimsWithQty.reduce<number>((sum, d) => {
    if (!d.dims) return sum
    return sum + volumeCm3(d.dims) * d.quantity
  }, 0)

  const maxDimsSorted: [number, number, number] | undefined = hasItemDimensions
    ? sortDims([
        Math.max(...dimsOnly.map((d) => d.length_cm)),
        Math.max(...dimsOnly.map((d) => d.width_cm)),
        Math.max(...dimsOnly.map((d) => d.height_cm)),
      ])
    : undefined

  const boxCandidates = [...boxes].sort((a, b) => {
    const va = a.inner_cm.length * a.inner_cm.width * a.inner_cm.height
    const vb = b.inner_cm.length * b.inner_cm.width * b.inner_cm.height
    return va - vb
  })

  const fits = (box: DhlBox): boolean => {
    if (typeof box.max_weight_kg === 'number' && totalWeightKg > box.max_weight_kg) return false

    if (hasItemDimensions && maxDimsSorted) {
      const innerSorted = sortDims([box.inner_cm.length, box.inner_cm.width, box.inner_cm.height])
      if (maxDimsSorted[0] > innerSorted[0]) return false
      if (maxDimsSorted[1] > innerSorted[1]) return false
      if (maxDimsSorted[2] > innerSorted[2]) return false

      const boxVolume = box.inner_cm.length * box.inner_cm.width * box.inner_cm.height
      if (totalVolume > boxVolume) return false
    }

    return true
  }

  const selected = boxCandidates.find(fits)

  if (selected) {
    return {
      selectedBox: selected,
      total_weight_kg: totalWeightKg,
      has_item_dimensions: hasItemDimensions,
      used_fallback_largest: false,
    }
  }

  // Fallback: largest box
  const largest = boxCandidates.at(-1)
  return {
    selectedBox: largest,
    total_weight_kg: totalWeightKg,
    has_item_dimensions: hasItemDimensions,
    used_fallback_largest: true,
  }
}
