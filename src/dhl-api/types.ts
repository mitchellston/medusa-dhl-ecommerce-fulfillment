// DHL eCommerce API Types

export type DHLAuthResponse = {
  accessToken: string
  accessTokenExpiration: number
  refreshToken?: string
  refreshTokenExpiration?: number
  accountNumbers?: string[]
}

export type DHLAddress = {
  name: {
    firstName: string
    lastName: string
    companyName?: string
  }
  address: {
    countryCode: string
    postalCode: string
    city: string
    street: string
    number?: string
    addition?: string
    isBusiness?: boolean
  }
  email?: string
  phoneNumber?: string
}

export type DHLShipmentOption = {
  key: string
  input?: string
}

export type DHLPiece = {
  parcelType: string
  quantity: number
  weight?: number
  dimensions?: {
    length: number
    width: number
    height: number
  }
}

export type DHLCreateLabelRequest = {
  labelId: string // Required: UUID for the label
  labelFormat?: 'pdf' | 'png' | 'zpl' // Label format, defaults to pdf
  shipmentId?: string
  orderReference?: string
  parcelTypeKey: string // Required: Parcel type at root level (e.g., 'SMALL', 'MEDIUM', 'LARGE')
  receiver: DHLAddress
  shipper: DHLAddress
  accountId: string
  options: DHLShipmentOption[] // Required: Array of options (can be empty)
  returnLabel?: boolean
  pieceNumber?: number
  quantity?: number
  weight?: number
  pieces?: DHLPiece[] // Optional: Only needed for multi-piece shipments
  product?: string
  application?: string
}

export type DHLCreateLabelResponse = {
  labelId: string
  orderReference?: string
  parcelType: string
  labelType: string
  pieceNumber: number
  weight?: number
  trackerCode: string
  routingCode?: string
  userId?: string
  organisationId?: string
  application?: string
  airWaybillNumber?: string
  timeCreated?: string
  shipmentId?: { id: string }
  accountNumber?: string
  dimensions?: {
    length: number
    width: number
    height: number
  }
  pdf?: string // Added when requesting PDF format
}

export type DHLCapability = {
  rank: number
  fromCountryCode: string
  toCountryCode: string
  product: {
    key: string
    label: string
    code: string
    menuCode: string
    businessProduct: boolean
    monoColloProduct: boolean
    softwareCharacteristic: string
  }
  parcelType: {
    key: string
    minWeightKg: number
    maxWeightKg: number
    dimensions?: {
      maxLengthCm: number
      maxWidthCm: number
      maxHeightCm: number
    }
    price?: {
      withTax?: number
      withoutTax?: number
      vatRate?: number
      currency?: string
    }
  }
  options: {
    key: string
    description: string
    rank: number
    code: string
    price?: {
      withTax?: number
      withoutTax?: number
      vatRate?: number
      currency?: string
    }
    inputType?: string
    inputMax?: number
    exclusions?: string[]
    optionType?: string
  }[]
}

export type DHLCapabilitiesResponse = DHLCapability[]

export type DHLTrackingEvent = {
  dateTime: string
  description: string
  location?: {
    address?: {
      countryCode?: string
      city?: string
    }
  }
  postalCode?: string
  status?: string
}

export type DHLTrackingResponse = {
  trackerCode: string
  title: string
  notifications?: DHLTrackingEvent[]
  deliveryMoment?: {
    start?: string
    end?: string
  }
}

export type DHLShipmentOption_Keys =
  | 'ADD_RETURN_LABEL' // Include extra label for return shipment
  | 'BOUW' // Delivery to construction site
  | 'BP' // Mailbox delivery
  | 'DOOR' // Delivery to the address of the recipient
  | 'EA' // Extra Assurance
  | 'EVE' // Evening delivery
  | 'EXP' // Expresser
  | 'EXW' // Ex Works - recipient pays for transportation
  | 'H' // Hold for collection
  | 'HANDT' // Signature on delivery
  | 'HANDTPS' // Signature on delivery at parcel shop
  | 'INS' // All risk insurance
  | 'LQ' // Limited Quantities (dangerous goods)
  | 'NBB' // No neighbor delivery
  | 'NO_TRACK_TRACE' // No track and trace for shipment
  | 'PERS_NOTE' // Email to the receiver
  | 'PRINTLESS' // Generates a printless label/return label with QR code
  | 'PS' // Delivery to the specified DHL Parcelshop or DHL Parcelstation
  | 'RECAP' // Additional proof of delivery
  | 'REFERENCE' // Reference on label
  | 'REFERENCE2' // Extra reference label
  | 'S' // Saturday delivery
  | 'SDD' // Same day delivery
  | 'SSN' // Undisclosed sender

export type DHLErrorResponse = {
  key: string
  message: string
  errors?: {
    key: string
    message: string
    context?: Record<string, unknown>
  }[]
}
