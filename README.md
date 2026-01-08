<p align="center">
  <a href="https://www.dhlecommerce.nl/en">
    <strong>DHL eCommerce</strong>
  </a>
</p>
<h1 align="center">
  DHL eCommerce Fulfillment Integration
</h1>

<h4 align="center">
  <a href="https://www.dhl.com/global-en/home/our-divisions/ecommerce.html">DHL eCommerce</a> |
  <a href="https://github.com/mitchellston/medusa-dhl-ecommerce-fulfillment">Repository</a>
</h4>

## Introduction

The DHL eCommerce Fulfillment Integration allows you to connect your Medusa store with DHL eCommerce shipping and fulfillment services. This integration enables you to manage shipments, track packages, and streamline your order fulfillment process.

With this plugin, you can integrate your Medusa store with DHL eCommerce to:

- Create shipments and generate shipping labels automatically when creating order shipments.
- Streamline your fulfillment workflow by managing DHL shipments directly from your Medusa admin or backend.

This simplifies the process of fulfilling and tracking orders using DHL services.

## Compatibility

This module/plugin is compatible with versions >= 2.4.0 of `@medusajs/medusa`.

## Getting Started

To get started with the DHL eCommerce Fulfillment Integration:

1. **Create a DHL eCommerce account**

- Sign up to <a href="https://my.dhlecommerce.nl/account/sign-in">DHL eCommerce</a>.

2. **Obtain API credentials**

- This module needs a DHL eccomerce api key, user id and account id to function properly. You can follow the steps on <a href="https://api-gw.dhlparcel.nl/docs/guide/chapters/01-authentication-and-authorization.html">the official DHL eccommerce documentation</a> to get the required information.

3. **Configure the plugin**

- Add credentials via `medusa-config.ts` or set them in the Medusa Admin (**Settings → DHL**).

## Installation

To install the DHL eCommerce Fulfillment Integration, follow these steps:

1. **Install the package**

```bash
npm install medusa-dhl-ecommerce-fulfillment
```

2. **Add the module and plugin to your `medusa-config.ts`**

```ts
modules: [
  {
    resolve: '@medusajs/medusa/fulfillment',
    options: {
      providers: [
        {
          resolve: 'medusa-dhl-ecommerce-fulfillment/providers/dhl',
          id: 'dhl',
          options: {
            isEnabled: true, // Enable or disable integration
            userId: "<your-user-id>", // DHL User ID
            apiKey: "<your-api-key>", // DHL API Key
            accountId: "<your-account-id>", // DHL Account ID
            enableLogs: false, // Enable debug logging (optional)
            itemDimensionsUnit: "mm", // Unit for product dimensions: "mm" or "cm" (optional, default: "mm")
            itemWeightUnit: "g", // Unit for product weight: "g" or "kg" (optional, default: "g")
            webhookApiKey: "<your-webhook-api-key>", // DHL Track & Trace Pusher API key (optional)
            webhookApiKeyHeader: "Authorization", // Header name for webhook auth (optional, default: "Authorization")
          },
        },
      ],
    },
  },
],
plugins: [
  {
    resolve: 'medusa-dhl-ecommerce-fulfillment', // This is used to enable custom admin widgets to see the tracking URLs and labels
    options: {},
  },
]
```

> **⚠️ Alternative:**  
> **Alternatively, you can set up your DHL API credentials directly in the Medusa Admin dashboard instead of the `medusa-config.ts` file.**  
> Go to the **Settings** page in your Medusa Admin, and you will see **DHL** listed in the menu.  
> From there, you can enter your **User ID**, **API Key**, and **Account ID** securely via the UI.

<p align="center">
  <img alt="DHL Admin Settings" src="./images/3.png" width="600"/>
</p>

> **How credentials are used:**  
> The module will first check for credentials stored in the database (set via the Admin UI). If these exist, they will be used for all DHL API requests.  
> If no credentials are found in the database, the module will fall back to the credentials provided in your `medusa-config.ts` file.

## Configuration

### Configuring DHL Shipping Options

After installing the integration, you need to configure the DHL shipping options in your Medusa Admin dashboard.

#### 1. Enable Desired Shipping Options

Decide which DHL shipping option and carrier you want to offer to your customers.

#### 2. Select DHL as Fulfillment Provider

- In the shipping option settings, set **Fulfillment Provider** to **DHL**.
- Under **Fulfillment Option**, select the specific DHL service you want to make available.

<br/>

#### Example

<br/>

<p align="center">
  <img alt="DHL Shipping Option" src="./images/1.png" width="600"/>
</p>

<br/>

> **Tip:** You can create multiple shipping options for different DHL services to give your customers more choices at checkout.

## Configuration Options

| Option                | Type             | Default           | Description                                                                                                           |
| --------------------- | ---------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| `isEnabled`           | `boolean`        | `true`            | Enable or disable the DHL integration                                                                                 |
| `userId`              | `string`         | -                 | Your DHL User ID for API authentication                                                                               |
| `apiKey`              | `string`         | -                 | Your DHL API Key for authentication                                                                                   |
| `accountId`           | `string`         | -                 | Your DHL Account ID                                                                                                   |
| `enableLogs`          | `boolean`        | `false`           | Enable debug logging for DHL API requests                                                                             |
| `itemDimensionsUnit`  | `"mm"` \| `"cm"` | `"mm"`            | Unit of measurement for product dimensions in Medusa. DHL expects centimeters, so values are converted automatically. |
| `itemWeightUnit`      | `"g"` \| `"kg"`  | `"g"`             | Unit of measurement for product weight in Medusa. DHL expects grams, so values are converted automatically.           |
| `webhookApiKey`       | `string`         | -                 | API key for authenticating incoming DHL Track & Trace Pusher webhooks                                                 |
| `webhookApiKeyHeader` | `string`         | `"Authorization"` | HTTP header name that DHL uses to send the webhook API key                                                            |

## DHL Track & Trace Pusher (Webhooks)

This integration supports receiving real-time shipment status updates from DHL via webhooks. When configured, DHL will push tracking events to your Medusa instance, automatically updating fulfillment statuses.

### Setting Up Webhooks

1. **Configure the webhook API key** either via `medusa-config.ts` or in the Medusa Admin (**Settings → DHL**).

2. **Register your webhook endpoint** with DHL. The endpoint URL is:

   ```
   https://your-store.com/store/dhl/webhook
   ```

3. **Provide the webhook API key** to DHL when setting up the Track & Trace Pusher subscription.

### How It Works

- When DHL sends a tracking update, the webhook validates the request using the configured API key header.
- If authentication succeeds, the integration looks up fulfillments by tracking number.
- Matching fulfillments are automatically updated with the latest status (shipped, delivered, etc.).
- The webhook responds quickly (200 OK) and processes updates in the background.

> **Note:** If no matching fulfillment is found for a tracking number, the webhook returns 404, signaling to DHL that the parcel is unknown.

## Generating Shipping Labels & Tracking

When you create a shipment for an order in Medusa, the integration will **automatically generate a DHL shipping label and tracking number**.

- The label cost is charged to your DHL account.
- Shipping labels, tracking codes, and other relevant information are available in the Medusa Admin dashboard on the order view page.
- You can **download the label PDF** and access the **tracking URL** directly from the order details.

<br/>

<p align="center">
  <img alt="DHL Shipping Label" src="./images/2.png" width="600"/>
</p>

<br/>

## Contributing

We welcome contributions to the DHL eCommerce Fulfillment Integration! If you have suggestions, improvements, or bug fixes, please follow these steps:

1. **Fork the Repository**  
   Create a personal copy of the repository by forking it on GitHub.

2. **Create a New Branch**  
   Create a new branch for your changes:

   ```bash
   git checkout -b my-feature-branch
   ```

3. **Make Your Changes**  
   Implement your changes in the codebase.

4. **Test Your Changes**  
   Ensure that your changes work as expected and do not break existing functionality.

5. **Submit a Pull Request**  
   Push your changes to your forked repository and submit a pull request to the main repository.

## Credits

This project was a fork of <a href="https://github.com/mitchellston/medusa-dhl-ecommerce-fulfillment">igorppbr/medusa-fedex-fulfillment</a>. If you need Fedex integration in Medusa, please check their original repo out.
