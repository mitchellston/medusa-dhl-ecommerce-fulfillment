import { MedusaItemDimensions, DHLFulfillmentOptionDimensions } from './types'

type ExpandedItem = {
  weight: number
  height: number
  width: number
  length: number
}

type Bin = {
  option: DHLFulfillmentOptionDimensions
  currentWeight: number
  items: ExpandedItem[]
}

/**
 * Check if an item fits in a fulfillment option (allows rotation)
 */
function itemFitsOption(item: ExpandedItem, option: DHLFulfillmentOptionDimensions): boolean {
  // Check weight
  if (item.weight > option.maxWeight) return false

  // Sort dimensions to allow rotation (largest to smallest)
  const itemDims = [item.height, item.width, item.length].sort((a, b) => b - a)
  const optionDims = [option.height, option.width, option.length].sort((a, b) => b - a)

  // Each dimension must fit
  if (itemDims[0] > optionDims[0] || itemDims[1] > optionDims[1] || itemDims[2] > optionDims[2]) {
    return false
  }

  // Check sum of dimensions if specified
  if (option.sum > 0) {
    const itemSum = item.height + item.width + item.length
    if (itemSum > option.sum) return false
  }

  return true
}

/**
 * Check if an item can be added to an existing bin (weight capacity check)
 */
function canAddToBin(bin: Bin, item: ExpandedItem): boolean {
  if (!itemFitsOption(item, bin.option)) return false
  // Check if adding this item would exceed maxWeight
  if (bin.currentWeight + item.weight > bin.option.maxWeight) return false
  return true
}

/**
 * Calculate the best fulfillment options (bin packing) for a set of items.
 * Uses First Fit Decreasing algorithm: sorts items by volume descending,
 * then tries to fit each item in existing bins before creating new ones.
 */
export function calculateBestFulfillment(
  itemDimensions: MedusaItemDimensions[],
  fulfillmentOptionsDimensions: DHLFulfillmentOptionDimensions[],
): { fulfillmentOption: DHLFulfillmentOptionDimensions; quantity: number }[] {
  if (itemDimensions.length === 0) {
    return []
  }

  if (fulfillmentOptionsDimensions.length === 0) {
    throw new Error('No fulfillment options available')
  }

  // Expand items by quantity and sort by volume (largest first for better packing)
  const expandedItems: ExpandedItem[] = itemDimensions
    .flatMap((item) =>
      Array(item.quantity)
        .fill(null)
        .map(() => ({
          weight: item.weight,
          height: item.height,
          width: item.width,
          length: item.length,
        })),
    )
    .sort((a, b) => {
      const volumeA = a.height * a.width * a.length
      const volumeB = b.height * b.width * b.length
      return volumeB - volumeA
    })

  // Sort fulfillment options by price (cheapest first)
  const sortedOptions = [...fulfillmentOptionsDimensions].sort((a, b) => a.price - b.price)

  const bins: Bin[] = []

  // Process each item using First Fit Decreasing
  for (const item of expandedItems) {
    let placed = false

    // Try to fit in existing bin (prefer bins with matching or smaller options first)
    for (const bin of bins) {
      if (canAddToBin(bin, item)) {
        bin.items.push(item)
        bin.currentWeight += item.weight
        placed = true
        break
      }
    }

    // If not placed, create a new bin with the smallest/cheapest fitting option
    if (!placed) {
      const fittingOption = sortedOptions.find((option) => itemFitsOption(item, option))

      if (!fittingOption) {
        throw new Error(
          `No fulfillment option can accommodate item with dimensions: ` +
            `weight=${item.weight}g, ${item.length}x${item.width}x${item.height}cm`,
        )
      }

      bins.push({
        option: fittingOption,
        currentWeight: item.weight,
        items: [item],
      })
    }
  }

  // Validate minWeight for each bin and upgrade if needed
  for (const bin of bins) {
    if (bin.currentWeight < bin.option.minWeight) {
      // Try to find an option with lower minWeight that still fits all items
      const suitableOption = sortedOptions.find((option) => {
        // Must have minWeight <= current bin weight
        if (option.minWeight > bin.currentWeight) return false
        // Must have maxWeight >= current bin weight
        if (option.maxWeight < bin.currentWeight) return false
        // All items in the bin must fit in this option
        return bin.items.every((item) => itemFitsOption(item, option))
      })

      if (!suitableOption) {
        throw new Error(
          `No fulfillment option available for bin with total weight ${bin.currentWeight}g. ` +
            `Current option "${bin.option.key}" requires minimum ${bin.option.minWeight}g.`,
        )
      }

      bin.option = suitableOption
    }
  }

  // Aggregate bins by option key
  const resultMap = new Map<
    string,
    { fulfillmentOption: DHLFulfillmentOptionDimensions; quantity: number }
  >()

  for (const bin of bins) {
    const existing = resultMap.get(bin.option.key)
    if (existing) {
      existing.quantity++
    } else {
      resultMap.set(bin.option.key, { fulfillmentOption: bin.option, quantity: 1 })
    }
  }

  return Array.from(resultMap.values())
}
