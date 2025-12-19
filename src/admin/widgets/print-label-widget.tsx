import { defineWidgetConfig } from '@medusajs/admin-sdk'
import { Heading } from '@medusajs/ui'
import { DetailWidgetProps, AdminOrder, AdminOrderFulfillment } from '@medusajs/framework/types'

type FulfillmentLabelType = {
  label_url?: string
  tracking_number?: string
  tracking_url?: string
}

type SelectedBoxInfo = {
  id?: string
  name?: string
  used_fallback_largest?: boolean
}

type FulfillmentWithLabels = AdminOrderFulfillment & {
  labels?: FulfillmentLabelType[]
  data?: Record<string, unknown>
}

// The widget
const DHLWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  // If no fulfillments, return an empty component
  if (!data.fulfillments || data.fulfillments.length === 0) {
    return <></>
  }

  const dhlFulfillments = (data.fulfillments as FulfillmentWithLabels[])
    .map((f) => {
      const selectedBox = (f.data?.selected_box as SelectedBoxInfo | undefined) ?? undefined
      const labels = (f.labels ?? []).filter((l) => l.label_url)
      return { fulfillment: f, selectedBox, labels }
    })
    .filter(({ selectedBox, labels }) => Boolean(selectedBox) || labels.length > 0)

  // If no DHL-related info, return an empty component
  if (dhlFulfillments.length === 0) {
    return <></>
  }

  return (
    <div className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4 bg-amber-50">
        <Heading level="h2" className="text-amber-900">
          DHL Fulfillment
        </Heading>
        <svg height="24" viewBox="0 0 80 24" xmlns="http://www.w3.org/2000/svg">
          <rect width="80" height="24" fill="#FFCC00" rx="3" />
          <text
            x="40"
            y="17"
            textAnchor="middle"
            fontFamily="Arial Black, sans-serif"
            fontSize="12"
            fontWeight="bold"
            fill="#D40511"
          >
            DHL
          </text>
        </svg>
      </div>
      {dhlFulfillments.map(({ fulfillment, selectedBox, labels }, idx) => {
        const fulfillmentId = (fulfillment as unknown as { id?: string }).id ?? String(idx)
        const parcelType = (fulfillment.data?.parcel_type as string | undefined) ?? undefined
        const boxLabel = selectedBox?.name || selectedBox?.id
        const boxSuffix = selectedBox?.used_fallback_largest ? ' (fallback: largest)' : ''

        return (
          <div key={fulfillmentId} className="px-6 py-4 space-y-3">
            {boxLabel ? (
              <div className="text-ui-fg-subtle grid grid-cols-2 items-start">
                <p className="font-medium font-sans txt-compact-small">Selected box</p>
                <p className="font-normal font-sans txt-compact-small">
                  {boxLabel}
                  {boxSuffix}
                </p>
              </div>
            ) : null}

            {parcelType ? (
              <div className="text-ui-fg-subtle grid grid-cols-2 items-start">
                <p className="font-medium font-sans txt-compact-small">Parcel type</p>
                <p className="font-normal font-sans txt-compact-small">{parcelType}</p>
              </div>
            ) : null}

            <div className="text-ui-fg-subtle grid grid-cols-2 items-start">
              <p className="font-medium font-sans txt-compact-small">Labels</p>
              {labels.length > 0 ? (
                <ul className="space-y-1">
                  {labels.map((label, lidx) => (
                    <li key={`${fulfillmentId}__label__${lidx}`}>
                      <p className="font-normal font-sans txt-compact-small">
                        {label.tracking_number ? (
                          label.tracking_url ? (
                            <a
                              href={label.tracking_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-amber-700 hover:underline"
                            >
                              {label.tracking_number}
                            </a>
                          ) : (
                            label.tracking_number
                          )
                        ) : (
                          'N/A'
                        )}{' '}
                        {label.label_url ? (
                          <a
                            href={label.label_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber-700 hover:underline font-semibold"
                            download
                          >
                            Download Label
                          </a>
                        ) : null}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-normal font-sans txt-compact-small">No labels yet.</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// The widget's configurations
export const config = defineWidgetConfig({
  zone: 'order.details.after',
})

export default DHLWidget
