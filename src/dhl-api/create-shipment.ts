import { Logger } from "@medusajs/framework/types";
import { DHLAddress, DHLShipmentPiece, DHLShipmentResponse } from "./types";
import { Api } from "./swagger/Api";

/**
 * Creates a DHL shipment by sending a request to the DHL API.
 *
 * @param baseUrl - The base URL of the DHL API.
 * @param token - The Bearer token used for authentication with the DHL API.
 * @param accountNumber - The DHL account number to be used for the shipment.
 * @param shipper - The shipper details for the shipment, conforming to the DhlAddress type.
 * @param receiver - The receiver details for the shipment, conforming to the DhlAddress type.
 * @param pieces - An array of pieces to be shipped, each conforming to the DHLShipmentPiece type.
 * @param carrierKey - The carrier key to be used for the shipment.
 * @param logger - (Optional) Logger instance for logging debug and error information.
 * @returns A promise that resolves to a DHLShipmentResponse object containing the tracking number, tracking URL, and labels.
 * @throws Will throw an error if the DHL API request fails or returns a non-OK response.
 */
export const createShipment = async (
  baseUrl: string,
  token: string,
  accountNumber: string,
  shipmentId: string,
  shipper: DHLAddress,
  receiver: DHLAddress,
  pieces: DHLShipmentPiece[],
  carrierKey: string,
  logger?: Logger | Console
): Promise<DHLShipmentResponse[]> => {
  const api = new Api({
    baseUrl: baseUrl,
    baseApiParams: { headers: { Authorization: `Bearer ${token}` } },
  });

  const response = await api.shipments.createShipmentPublic({
    accountId: accountNumber,
    pieces: pieces,
    receiver: receiver,
    shipmentId: shipmentId,
    shipper: shipper,
    options: [{ key: carrierKey }],
  });

  if (!response.ok) {
    const text = await response.text();
    if (logger) {
      logger.error(`DHL create shipment failed [${response.status}]: ${text}`);
    }
    throw new Error(`DHL create shipment failed: ${response.statusText}`);
  }
  const result = response.data;
  if (logger) {
    logger.log(
      `DHL create shipment response: ${JSON.stringify(result, null, 2)}`
    );
  }

  // Use a Map to deduplicate labels by tracking number, keeping the one with valid label data
  const labelsMap = new Map<string, DHLShipmentResponse>();

  for (const piece of result.pieces || []) {
    if (!piece.labelId) {
      continue;
    }

    const label = await api.labels.getLabel(piece.labelId, {
      format: "blob",
      headers: { Accept: "application/pdf" },
    });

    const labelBlob = label.data as unknown as Blob;
    const arrayBuffer = await labelBlob.arrayBuffer();
    const labelBase64 = Buffer.from(arrayBuffer).toString("base64");

    // Skip labels with empty content
    if (!labelBase64 || labelBase64.length === 0) {
      if (logger) {
        logger.log(`Skipping empty label for piece ${piece.labelId}`);
      }
      continue;
    }

    const trackingNumber = piece.trackerCode ?? "";

    // Only add if we don't already have a label for this tracking number,
    // or if this label has content and the existing one doesn't
    const existingLabel = labelsMap.get(trackingNumber);
    if (
      !existingLabel ||
      !existingLabel.label ||
      existingLabel.label.length === 0
    ) {
      labelsMap.set(trackingNumber, {
        label: labelBase64,
        trackingNumber,
        trackingUrl: `https://www.dhlparcel.nl/nl/volg-uw-zending-0?tt=${trackingNumber}`,
        parcelType: piece.parcelType,
        pieceNumber: piece.pieceNumber,
      });
    }
  }

  return Array.from(labelsMap.values());
};
