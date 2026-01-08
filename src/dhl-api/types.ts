import { Api } from './swagger/Api'

export type DHLAddress = Parameters<
  InstanceType<typeof Api>['shipments']['createShipmentPublic']
>[0]['receiver']

export type DHLShipmentPiece = Parameters<
  InstanceType<typeof Api>['shipments']['createShipmentPublic']
>[0]['pieces'][number]

export type DHLShipmentStatusResponse = Awaited<
  ReturnType<InstanceType<typeof Api>['trackTrace']['getTrackAndTrace']>
>['data'][number]

export type DHLShipmentStatusEvent =
  | 'CUSTOMS'
  | 'DATA RECEIVED'
  | 'DATA_RECEIVED'
  | 'DELIVERED'
  | 'EXCEPTION'
  | 'INTERVENTION'
  | 'IN DELIVERY'
  | 'IN_DELIVERY'
  | 'LEG'
  | 'PROBLEM'
  | 'UNDERWAY'
  | 'UNKNOWN'

export type DHLShipmentResponse = {
  trackingNumber: string
  trackingUrl: string
  label: string
  parcelType?: string
  pieceNumber?: number
}

export type DHLFulfillmentOptionAddress = {
  countryCode: string
  postalCode: string
}

export type DHLFulfillmentOptionDimensions = {
  key: string
  maxWeight: number
  minWeight: number
  height: number
  width: number
  length: number
  sum: number
  price: number
}

export type MedusaItemDimensions = {
  weight: number
  height: number
  width: number
  length: number
  quantity: number
}

export type DHLWebhookEventBody = Awaited<
  ReturnType<InstanceType<typeof Api>['your']['postYourEndpoint']>
>['data']

export type DHLShipmentOption = Awaited<
  ReturnType<InstanceType<typeof Api>['shipmentOptions']['shipmentOptionsBusiness']>
>['data'][number]
