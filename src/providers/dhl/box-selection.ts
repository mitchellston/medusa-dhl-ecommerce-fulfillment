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
