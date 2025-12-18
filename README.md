<p align="center">
  <a href="https://www.fedex.com">
    <picture>
      <img alt="FedEx logo" src="https://raw.githubusercontent.com/gil--/shipping_carrier_icons/refs/heads/main/svg/fedex.svg" width="200"/>
    </picture>
  </a>
</p>
<h1 align="center">
  FedEx Fulfillment Integration
</h1>

<h4 align="center">
  <a href="https://developer.fedex.com/api/en-us/home.html">Documentation</a> |
  <a href="https://www.fedex.com/en-us/manage-account.html">Merchant Account Center</a>
</h4>

<p align="center">
  <a href="https://github.com/medusajs/medusa/blob/master/CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat" alt="PRs welcome!" />
  </a>
  <a href="https://www.linkedin.com/in/igor-ludgero-miura-26175263/">
    <img src="https://img.shields.io/badge/Follow%20on%20LinkedIn-blue?logo=linkedin" alt="Follow me on LinkedIn" />
  </a>
</p>

## Introduction

The FedEx Fulfillment Integration allows you to seamlessly connect your Medusa store with FedEx's shipping and fulfillment services. This integration enables you to manage shipments, track packages, and streamline your order fulfillment process.

With this plugin, you can integrate your Medusa store with FedEx to:

- Retrieve real-time shipping rates from FedEx during checkout.
- Create shipments and generate shipping labels with FedEx automatically when creating order shipments.
- Streamline your fulfillment workflow by managing FedEx shipments directly from your Medusa admin or backend.

This ensures accurate shipping costs for your customers and simplifies the process of fulfilling and tracking orders using FedEx services.

## Compatibility

This module/plugin is compatible with versions >= 2.4.0 of `@medusajs/medusa`.

## Getting Started

To get started with the FedEx Fulfillment Integration, follow these steps:

1. **Create a FedEx Account**

- Go to the [FedEx website](https://www.fedex.com/) and sign up for a merchant account.
- You can use a production or a sandbox account for testing purposes.

2. **Register as a Developer**

- Visit the [FedEx Developer Portal](https://developer.fedex.com/api/en-us/home.html).
- Log in with your FedEx account and register as a developer if you haven't already.

3. **Create an Application**

- In the Developer Portal, create a new application.
- Choose the APIs you want to use (e.g., Shipping, Tracking, etc.).

4. **Generate API Keys**

- After creating your application, generate your API credentials:
  - **Client ID**
  - **Client Secret**
  - **Account Number**
- For sandbox testing, use the sandbox credentials provided.
- **Important:** Save these credentials securely. You will need to use them later in your Medusa configuration.

5. **Configure the Plugin**

- Add your FedEx API credentials to your Medusa configuration as described in the plugin documentation.

6. **Test the Integration**

- Use your sandbox credentials to test the integration before switching to production.

For more details, refer to the [FedEx API Documentation](https://developer.fedex.com/api/en-us/home.html).

## Installation

To install the FedEx Fulfillment Integration, follow these steps:

1. **Install the package**

```bash
npm install @igorppbr/medusa-v2-fedex-fulfillment
```

2. **Add the module and plugin to your `medusa-config.ts`**

```ts
modules: [
  {
   resolve: "@medusajs/medusa/fulfillment",
   options: {
    providers: [
      {
       resolve: "@igorppbr/medusa-v2-fedex-fulfillment/providers/fedex",
       id: "fedex",
       options: {
        isEnabled: true, // Enable or disable integration
        clientId: "clientId", // FedEx Client ID
        clientSecret: "clientSecret", // FedEx Client Secret
        accountNumber: "accountNumber", // FedEx Account Number
        isSandbox: true, // Enable sandbox mode for testing
        enableLogs: true, // Enable logging
        weightUnitOfMeasure: "LB" // Weight unit of measure
       },
      },
    ],
   },
  },
],
plugins: [
  {
   resolve: "@igorppbr/medusa-v2-fedex-fulfillment", // This is used to enable custom admin widgets to see the tracking URLs and labels
   options: {},
  }
]
```

> **⚠️ Alternative:**  
> **Alternatively, you can set up your FedEx API credentials directly in the Medusa Admin dashboard instead of the `medusa-config.ts` file.**  
> Go to the **Settings** page in your Medusa Admin, and you will see **FedEx** listed in the menu.  
> From there, you can enter your **Client ID**, **Client Secret**, and **Account Number** securely via the UI.

<p align="center">
  <img alt="FedEx Admin Settings" src="https://raw.githubusercontent.com/igorppbr/medusa-fedex-fulfillment/master/images/3.png" width="600"/>
</p>

> **How credentials are used:**  
> The module will first check for credentials stored in the database (set via the Admin UI). If these exist, they will be used for all FedEx API requests.  
> If no credentials are found in the database, the module will fall back to the credentials provided in your `medusa-config.ts` file.

> **⚠️ WARNING:**  
> The FedEx sandbox environment is frequently unavailable or down. If you encounter issues during testing, this is likely the cause.  
> Check your logs for error messages indicating that the FedEx service is unavailable.
> For production use, ensure you switch to your production credentials and disable sandbox mode.

## Configuration

### Configuring FedEx Shipping Options

After installing the integration, you need to configure the FedEx shipping options in your Medusa Admin dashboard.

#### 1. Enable Desired Shipping Options

Decide which FedEx shipping services you want to offer to your customers.

#### 2. Add a Calculated Shipping Option

- Go to **Locations & Shipping** in the Medusa Admin dashboard.
- Create a new shipping option and set the type to **Calculated**. This ensures shipping costs are retrieved directly from the FedEx API.

#### 3. Select FedEx as Fulfillment Provider

- In the shipping option settings, set **Fulfillment Provider** to **FedEx**.
- Under **Fulfillment Option**, select the specific FedEx service you want to make available (e.g., FedEx Ground, FedEx Express).

<br/>

#### Example

<br/>

<p align="center">
  <img alt="FedEx Shipping Option" src="https://raw.githubusercontent.com/igorppbr/medusa-fedex-fulfillment/master/images/1.png" width="600"/>
</p>

<br/>

> **Tip:** You can create multiple shipping options for different FedEx services to give your customers more choices at checkout.

## Generating Shipping Labels & Tracking

When you create a shipment for an order in Medusa, the integration will **automatically generate a FedEx shipping label and tracking number**.

- The label cost is charged to your FedEx account.
- Shipping labels, tracking codes, and other relevant information are available in the Medusa Admin dashboard on the order view page.
- You can **download the label PDF** and access the **tracking URL** directly from the order details.

<br/>

<p align="center">
  <img alt="FedEx Shipping Label" src="https://raw.githubusercontent.com/igorppbr/medusa-fedex-fulfillment/master/images/2.png" width="600"/>
</p>

<br/>

## DHL: Automatic “Shipped” / “Delivered” Updates (Tracking Sync)

This package also includes a **DHL eCommerce** fulfillment provider. By default, Medusa won’t automatically flip a fulfillment to **shipped**/**delivered** just because a label exists — this plugin can now **sync DHL tracking events** and update those statuses for you.

- **What it does**: whenever a DHL label is created, the plugin stores the `trackerCode` + destination `postal_code` in a `dhl_tracking` table. A sync runner periodically calls DHL Track & Trace and then marks the fulfillment **shipped** (first “in transit” event) and **delivered** (delivered event).
- **What you need**:
  - DHL credentials saved in Admin (Settings → DHL), or configured via plugin options.
  - Orders must have a destination postal code (required by DHL Track & Trace).
  - Run the DB migration that creates the `dhl_tracking` table.

### Triggering the sync

- **Option A (recommended)**: enable Medusa’s internal job runner and use the included job `dhl-tracking-sync` (runs every 15 minutes).
- **Option B**: call the Admin endpoint from an external cron:
  - `POST /admin/dhl/tracking-sync`
  - Body: `{ "limit": 50, "dry_run": false }`

## Contributing

We welcome contributions to the FedEx Fulfillment Integration! If you have suggestions, improvements, or bug fixes, please follow these steps:

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

## Support / Contact

If you need help or have questions about the FedEx Fulfillment Integration, please reach out to us:

- **Email:** igorlmiura@gmail.com
- **GitHub Issues:** [Submit an issue](https://github.com/igorppbr/medusa-fedex-fulfillment/issues)
