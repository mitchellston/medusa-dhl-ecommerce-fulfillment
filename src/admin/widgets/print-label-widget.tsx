import { defineWidgetConfig } from '@medusajs/admin-sdk'
import { Container, Heading } from '@medusajs/ui'
import { DetailWidgetProps, AdminOrder, AdminOrderFulfillment } from '@medusajs/framework/types'

type FulfillmentLabelType = {
  label_url?: string
  tracking_number?: string
  tracking_url?: string
}

type FulfillmentWithLabels = AdminOrderFulfillment & {
  labels?: FulfillmentLabelType[]
}

// The widget
const DHLWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  // If no fulfillments, return an empty component
  if (!data.fulfillments || data.fulfillments.length === 0) {
    return <></>
  }

  // Gather all tracking info with a label_url
  const trackingInfo = data.fulfillments.flatMap((fulfillment: FulfillmentWithLabels) =>
    (fulfillment.labels || [])
      .filter((label: FulfillmentLabelType) => label.label_url)
      .map((label: FulfillmentLabelType) => ({
        trackingNumber: label.tracking_number,
        trackingUrl: label.tracking_url,
        labelUrl: label.label_url,
      })),
  )

  // If no valid labels, return an empty component
  if (trackingInfo.length === 0) {
    return <></>
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4 bg-amber-50">
        <Heading level="h2" className="text-amber-900">
          DHL Shipping Labels
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
      {trackingInfo.map((info, idx) => (
        <div key={idx} className="text-ui-fg-subtle grid grid-cols-2 items-start px-6 py-4">
          <p className="font-medium font-sans txt-compact-small">Tracking</p>
          <ul>
            <li>
              <p className="font-normal font-sans txt-compact-small">
                {info.trackingNumber ? (
                  info.trackingUrl ? (
                    <a
                      href={info.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-700 hover:underline"
                    >
                      {info.trackingNumber}
                    </a>
                  ) : (
                    info.trackingNumber
                  )
                ) : (
                  'N/A'
                )}{' '}
                <a
                  href={info.labelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-700 hover:underline font-semibold"
                  download
                >
                  Download Label
                </a>
              </p>
            </li>
          </ul>
        </div>
      ))}
    </Container>
  )
}

// The widget's configurations
export const config = defineWidgetConfig({
  zone: 'order.details.after',
})

export default DHLWidget
