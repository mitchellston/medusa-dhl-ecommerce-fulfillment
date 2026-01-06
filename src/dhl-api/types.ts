import { Api } from './swagger/Api'

export type DHLAddress = Parameters<
  InstanceType<typeof Api>['shipments']['createShipmentPublic']
>[0]['receiver']

export type DHLShipmentPiece = Parameters<
  InstanceType<typeof Api>['shipments']['createShipmentPublic']
>[0]['pieces'][number]

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
