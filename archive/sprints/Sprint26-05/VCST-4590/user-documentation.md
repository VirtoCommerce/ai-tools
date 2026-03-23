# Coupons & Promotions — Feature Documentation

**Feature:** VCST-4590 — Coupons and Vouchers Page
**Version:** vc-frontend 2.44.0 / vc-module-marketing 3.1001.0 / vc-module-marketing-experience-api 3.1000.0
**Audience:** End users, store administrators, developers

---

## Table of Contents

1. [Overview](#1-overview)
2. [How to Access](#2-how-to-access)
3. [Viewing Coupons](#3-viewing-coupons)
4. [Copying and Using a Coupon Code](#4-copying-and-using-a-coupon-code)
5. [Discount Breakdown in Cart](#5-discount-breakdown-in-cart)
6. [Admin Guide — Configuring Coupons](#6-admin-guide--configuring-coupons)
7. [GraphQL API Reference](#7-graphql-api-reference)
8. [Known Limitations](#8-known-limitations)

---

## 1. Overview

The **Coupons & Promotions** page is your personal catalog of discount codes available in the store. Instead of hunting for coupon codes elsewhere, you can find everything in one place: discount names, descriptions, expiration dates, and the codes themselves — ready to copy with a single click.

The page is available to all authenticated users, including B2B organization members. It only shows promotions that the store has explicitly made public, so every code you see is one you are entitled to use.

---

## 2. How to Access

**Requirements:** You must be signed in. The page is not visible to guests.

### Option A — Account sidebar

1. Sign in to your account.
2. In the left sidebar, locate the **Marketing** section.
3. Click **Coupons & promotions**.

The sidebar highlights the link so you always know where you are. The Marketing section also contains **Notifications** and **Points history**.

### Option B — Direct URL

Navigate to `/account/coupons` (or the locale-prefixed equivalent, for example `/de/account/coupons`).

If you are not signed in, the store redirects you to the sign-in page automatically.

---

## 3. Viewing Coupons

The page heading reads **All coupons & promotions** and lists every active, public coupon available for your store. Each card contains the following information:

| Field | Description |
|-------|-------------|
| **Promotion name** | The name of the promotion, shown in your current storefront language |
| **Description** | A short description of the offer (optional — some cards may not have one) |
| **Label** | A brief display value such as "$20.00 off" (optional — set by your store administrator) |
| **Expiration date** | The date the promotion expires, formatted as `Mon D, YYYY` (for example, `Dec 31, 2026`). Cards without a date have no expiry. |
| **Coupon code button** | The code itself, with a **Click to copy** label underneath |

**What you will not see:**

- Promotions set to private by the administrator (IsPublic = false)
- Expired or inactive promotions
- Automatic promotions that have no coupon code (for example, a free gift that applies to all orders automatically)

When the store has more coupons than the page size, pagination controls appear at the bottom so you can browse through all available offers.

---

## 4. Copying and Using a Coupon Code

### Step 1 — Copy the code

1. Find the coupon you want to use on the **All coupons & promotions** page.
2. Click the button showing the coupon code (the label underneath reads "Click to copy").
3. A **"Coupon copied successfully"** notification appears in the top area of the page.
4. The notification closes automatically after a few seconds. You can also close it immediately by clicking the X button.

The code is now in your clipboard exactly as displayed — including uppercase letters. No conversion or trimming is applied.

### Step 2 — Apply the code in your cart

1. Add items to your cart and navigate to the **Cart** page.
2. In the **Order summary** sidebar, find the **Enter a promo-coupon** field.
3. Paste the code (Ctrl+V / Cmd+V) or type it manually.
4. Press **Enter** or wait for the field to apply the coupon automatically.

Once applied:

- The code field becomes read-only and shows the applied code.
- A **Deny** button appears next to the field.
- The discount amount appears as a line item in your Order summary (for example, `- $29.80`).
- Your cart total updates to reflect the savings.

### Step 3 — Remove a coupon

Click the **Deny** button next to the applied coupon code. The discount is removed and your original cart total is restored.

### What if my code is rejected?

| Reason | What you see |
|--------|-------------|
| Code typed incorrectly | An error message appears below the field |
| Promotion has expired | An error message appears; the code will not apply |
| Coupon has reached its usage limit | An error message appears |
| Coupon has reached your personal usage limit | An error message appears |
| Cart does not meet the promotion conditions | The discount line does not appear (for example, a cart-threshold coupon requires a minimum subtotal) |

**Note:** Coupon codes are case-sensitive. `QA10OFF` and `qa10off` are treated as different codes. Copy the code directly from the Coupons & Promotions page to ensure you have the exact casing.

---

## 5. Discount Breakdown in Cart

When one or more coupons are applied, the **Discount** row in the Order summary shows the total discount amount. If you have applied more than one coupon, you can see how much each one contributes:

1. In the **Order summary** sidebar, locate the **Discount** row.
2. Click the row to expand it.
3. A per-coupon breakdown appears, showing each coupon code and its individual discount amount.

**Business rule:** Coupon discounts are calculated against the sale price (the price you actually pay), not the original list price. If a product already has a promotional markdown applied, the coupon percentage is applied to the lower price.

---

## 6. Admin Guide — Configuring Coupons

This section is for store administrators managing promotions in the Virto Commerce Admin SPA.

### 6.1 Making a Promotion Visible on the Storefront

A promotion only appears on the **All coupons & promotions** page when all three conditions are met:

1. The promotion is **active** (the Active toggle is on).
2. The promotion has **IsPublic** set to true.
3. The promotion has at least one **coupon code** assigned to it.

Promotions without coupon codes (automatic promotions) are never shown, even if IsPublic is true.

### 6.2 Creating or Editing a Promotion

1. In the Admin SPA, navigate to **Marketing > Promotions**.
2. Click an existing promotion to open the detail blade, or click **Add** to create a new one.

#### Promotion-level fields

| Field | Description |
|-------|-------------|
| **Name** | The internal promotion name (used in admin lists and reports) |
| **Active** | Toggles whether the promotion is active. Inactive promotions do not appear on the storefront. |
| **Is Public** | Controls storefront visibility. Set to **true** to display the coupon on the Coupons & Promotions page. |
| **Description** | A short description shown on the coupon card. Optional. |
| **Label / Display Name** | A brief value shown prominently on the card, such as "$20.00 off". Optional. |
| **Exclusivity** | Choose **Valid with other offers** to allow stacking with other coupons, or **Globally exclusive** to block all other coupons when this one is applied. |
| **Priority** | An integer that controls which promotion takes precedence. Lower numbers have higher priority (1 beats 5). |
| **Stores** | Assigns the promotion to one or more stores. A promotion only appears on the storefront of the stores it is assigned to. |
| **Can be redeemed more than once** | When enabled, a single customer can use the same coupon code more than once (subject to the coupon-level maximum). |
| **Start / Expiration date** | Optional date range for the promotion. Expired promotions are automatically hidden from the storefront. |

#### Localized name and description

Promotions support localized display names and descriptions. To add translations:

1. Open the promotion detail blade.
2. Locate the **Localization** section.
3. For each language, enter the localized **Name** and **Description** values.
4. Click **Save**.

The storefront displays the localized values matching the user's current language. If no localized value exists for a language, the fallback (system name) is used.

### 6.3 Managing Coupon Codes

Coupon codes are managed on the **Coupons** tab of the promotion detail blade.

#### Adding a single code

1. Open the promotion and go to the **Coupons** tab.
2. Click **Add**.
3. Enter the coupon code. Use alphanumeric characters (letters and numbers only).
4. Set the optional fields:

| Field | Description |
|-------|-------------|
| **Maximum use number** | The total number of times this code can be used across all customers. Set to 0 for unlimited. |
| **Maximum uses per customer** | The number of times a single customer can use this code. Set to 0 for unlimited. |
| **Coupon expiration date** | An expiry date specific to this coupon code, independent of the promotion end date. If set, the code is rejected in the cart after this date even if the promotion is still active. |

5. Click **Save**.

#### Importing codes in bulk

1. Open the promotion and go to the **Coupons** tab.
2. Click **Import**.
3. Upload a CSV file with a single column headed `Code`, one code per row.

**Example file:**

```csv
Code
SUMMER25
WELCOME10
FLASH50
```

All imported codes are assigned to the same promotion and inherit its settings.

### 6.4 Exclusivity Behavior

| Setting | Behavior in cart |
|---------|-----------------|
| Valid with other offers | The customer can apply multiple coupons simultaneously |
| Globally exclusive | Applying this coupon removes all other active coupons from the cart |

When two promotions with overlapping conditions are both applied, the one with the lower priority number takes precedence.

### 6.5 Store Scoping

A promotion assigned to **Store A** does not appear on the coupons page of **Store B**, even if both stores are on the same platform instance. Always verify the **Stores** field is set correctly before making a promotion public.

---

## 7. GraphQL API Reference

The coupons page is powered by the `promotionCoupons` query exposed through the storefront GraphQL endpoint.

### Endpoint

```
POST /graphql
```

Authentication is required. Include the user's Bearer token in the `Authorization` header.

### Query: `promotionCoupons`

```graphql
query GetCoupons(
  $storeId: String!
  $cultureName: String
  $first: Int
  $after: String
) {
  promotionCoupons(
    storeId: $storeId
    cultureName: $cultureName
    first: $first
    after: $after
  ) {
    totalCount
    pageInfo {
      endCursor
      hasNextPage
    }
    items {
      id
      systemName
      name
      description
      couponCode
      label
      endDate
    }
  }
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `storeId` | String | Yes | The store identifier. Only promotions assigned to this store are returned. |
| `cultureName` | String | No | Locale code (for example, `en-US`, `de-DE`). Controls which localized name and description are returned. Defaults to the store's default locale. |
| `first` | Int | No | Number of items to return per page. Defaults to the server page size. |
| `after` | String | No | Cursor value from `pageInfo.endCursor` to fetch the next page. Omit for the first page. |

### Response fields

| Field | Type | Description |
|-------|------|-------------|
| `totalCount` | Int | Total number of matching promotions across all pages |
| `pageInfo.endCursor` | String | Cursor to pass as `after` to retrieve the next page |
| `pageInfo.hasNextPage` | Boolean | True when more pages are available |
| `items[].id` | ID | Unique identifier of the promotion coupon record |
| `items[].systemName` | String | Non-localized internal name of the promotion |
| `items[].name` | String | Localized display name, resolved for the requested `cultureName` |
| `items[].description` | String | Localized description, resolved for the requested `cultureName`. Null when not set. |
| `items[].couponCode` | String | The coupon code to use at checkout |
| `items[].label` | String | Short display value such as "$20.00 off". Null when not set by the admin. |
| `items[].endDate` | String | Promotion expiry date in ISO 8601 format. Null when no expiry is set. |

### Filtering behavior

The query automatically applies the following filters and requires no additional client-side filtering:

- Only promotions with `IsPublic = true` are returned.
- Only active promotions (not expired, not deactivated) are returned.
- Only promotions with at least one coupon code are returned.
- Only promotions assigned to the specified `storeId` are returned.

### Pagination example

```graphql
# Page 1 — fetch the first 10 coupons
{
  promotionCoupons(storeId: "B2B-store", cultureName: "en-US", first: 10) {
    totalCount
    pageInfo {
      endCursor
      hasNextPage
    }
    items {
      id
      name
      couponCode
      label
      endDate
    }
  }
}
```

```graphql
# Page 2 — pass the endCursor from the previous response
{
  promotionCoupons(
    storeId: "B2B-store"
    cultureName: "en-US"
    first: 10
    after: "eyJpZCI6Ijc1MGJjZWUwLTcyNDEtNDc1OS04OTk0LTc3MjRlY2JkNjU0MiJ9"
  ) {
    items {
      id
      name
      couponCode
    }
    pageInfo {
      hasNextPage
    }
  }
}
```

### Applying a coupon in the cart

After copying a code, use the `addCoupon` mutation to apply it:

```graphql
mutation AddCoupon($command: InputAddCouponType!) {
  addCoupon(command: $command) {
    id
    coupons {
      code
      isAppliedSuccessfully
    }
    discountTotal {
      amount
      formattedAmount
    }
    total {
      amount
      formattedAmount
    }
  }
}
```

**Variables:**

```json
{
  "command": {
    "storeId": "B2B-store",
    "cartName": "default",
    "userId": "<your-user-id>",
    "cultureName": "en-US",
    "currencyCode": "USD",
    "couponCode": "QA10OFF"
  }
}
```

To remove a coupon, use the `removeCoupon` mutation with the same `couponCode` value.

---

## 8. Known Limitations

The following limitations are documented based on testing conducted on build 2.44.0-pr-2198.

| Limitation | Details |
|------------|---------|
| **Coupon codes are case-sensitive** | The cart applies codes exactly as typed. `QA10OFF` and `qa10off` are treated as different codes. Always copy from the Coupons & Promotions page to avoid case mismatches. |
| **Private coupons are hidden and blocked** | Promotions with IsPublic = false do not appear on `/account/coupons`. The `addCoupon` mutation also enforces the `IsPublic` flag — entering a private coupon code manually in the cart is rejected by the backend. |
| **Pagination controls appear only when needed** | The pagination controls at the bottom of the page are only rendered when the total coupon count exceeds the configured page size. On stores with fewer coupons, you will see all results on a single page with no pagination UI. |
| **Automatic promotions are not listed** | Promotions that apply automatically (with no coupon code required) are intentionally excluded from the coupons page, even if IsPublic is set to true. |
| **Coupon code alphanumeric validation** | The Admin SPA help text states that coupon codes must be alphanumeric. Validation is not yet enforced in the interface, so codes with spaces or special characters can be saved. Behavior of such codes at the storefront may be unpredictable (tracked as a known issue, P2 priority). |
| **Initial page load may show a subset of cards** | On rare occasions, the first load of the coupons page may display fewer cards than expected. Refreshing the page loads the full list. This is an intermittent rendering timing issue. |

---

*Documentation generated for VCST-4590 | Build 2.44.0-pr-2198 | 2026-03-17*
