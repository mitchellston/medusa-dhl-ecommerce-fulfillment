import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Container, Heading } from "@medusajs/ui";
import { DetailWidgetProps, AdminOrder } from "@medusajs/framework/types";
import { ExclamationCircle } from "@medusajs/icons";

type FulfillmentDataLabelType = {
  parcelType: string;
  trackingNumber: string;
};

type FulfillmentLabelType = {
  label_url?: string;
  tracking_number?: string;
  tracking_url?: string;
  parcel_type?: string;
};

type FulfillmentType = {
  id?: string;
  labels?: FulfillmentLabelType[];
  data?: {
    labels?: FulfillmentDataLabelType[];
  };
  tracking_url?: string;
  canceled_at?: string | null;
};

// The widget
const DHLWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  // If no fulfillments, return an empty component
  if (!data.fulfillments || data.fulfillments.length === 0) {
    return <></>;
  }

  // Group labels by fulfillment
  const fulfillmentsWithLabels = (data.fulfillments as FulfillmentType[])
    .map((fulfillment, index) => ({
      fulfillmentNumber: index + 1,
      fulfillmentId: fulfillment.id,
      isCanceled: !!fulfillment.canceled_at,
      labels: (fulfillment.labels || [])
        .filter((label) => label.label_url)
        .map((label) => {
          const data = fulfillment?.data?.labels?.find(
            (l) => l.trackingNumber === label.tracking_number
          );
          return {
            trackingNumber: label.tracking_number,
            trackingUrl: label.tracking_url,
            labelUrl: label.label_url,
            parcelType: data?.parcelType,
          };
        }),
    }))
    .filter((f) => f.labels.length > 0);

  // If no valid labels, return an empty component
  if (fulfillmentsWithLabels.length === 0) {
    return <></>;
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Shipping Labels</Heading>
      </div>
      {fulfillmentsWithLabels.map((fulfillment) => (
        <div
          key={fulfillment.fulfillmentId || fulfillment.fulfillmentNumber}
          className="px-6 py-4"
        >
          <p className="font-medium font-sans txt-compact-small text-ui-fg-base mb-2">
            Fulfillment #{fulfillment.fulfillmentNumber}
            {fulfillment.isCanceled && (
              <span className="ml-2 text-ui-fg-error">(Canceled)</span>
            )}
          </p>
          {fulfillment.isCanceled && (
            <div className="flex items-start gap-2 bg-ui-bg-subtle-hover border border-ui-border-error rounded-md p-3 mb-3">
              <ExclamationCircle className="text-ui-fg-error mt-0.5 flex-shrink-0" />
              <p className="font-sans txt-compact-small text-ui-fg-error">
                This fulfillment has been canceled. Please manually remove the
                shipping label in DHL eCommerce to avoid being charged.
              </p>
            </div>
          )}
          {fulfillment.labels.map((info, idx) => (
            <div
              key={idx}
              className={`${
                idx > 0 ? "border-t border-ui-border-base pt-4" : ""
              } space-y-2 py-2`}
            >
              <div className="text-ui-fg-subtle grid grid-cols-2 items-start">
                <p className="font-medium font-sans txt-compact-small">
                  Parcel Type
                </p>
                <p className="font-normal font-sans txt-compact-small">
                  {info.parcelType || "N/A"}
                </p>
              </div>
              <div className="text-ui-fg-subtle grid grid-cols-2 items-start">
                <p className="font-medium font-sans txt-compact-small">
                  Tracking Number
                </p>
                <p className="font-normal font-sans txt-compact-small">
                  {info.trackingNumber ? (
                    info.trackingUrl ? (
                      <a
                        href={info.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {info.trackingNumber}
                      </a>
                    ) : (
                      info.trackingNumber
                    )
                  ) : (
                    "N/A"
                  )}
                </p>
              </div>
              <div className="text-ui-fg-subtle grid grid-cols-2 items-start">
                <p className="font-medium font-sans txt-compact-small">Label</p>
                <p className="font-normal font-sans txt-compact-small">
                  <a
                    href={`data:application/pdf;base64,${info.labelUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                    download={`label-${info.trackingNumber || idx}.pdf`}
                  >
                    Download PDF
                  </a>
                </p>
              </div>
            </div>
          ))}
        </div>
      ))}
    </Container>
  );
};

// The widget's configurations
export const config = defineWidgetConfig({
  zone: "order.details.after",
});

export default DHLWidget;
