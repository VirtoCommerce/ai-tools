# Order Creation Matrix — Payment × Shipping Combinations

Test matrix for end-to-end order creation covering all payment providers and shipping methods.

## Matrix

| #  | Payment Method           | Shipping Method     | Card Number      | CVV | Expiration | OTP  |
|----|--------------------------|---------------------|------------------|-----|------------|------|
| 1  | Bank card (AuthorizeNet) | Fixed rate (Ground) | 5424000000000015 | 900 | 02/29      | N/A  |
| 2  | Bank card (AuthorizeNet) | Fixed rate (Air)    | 5424000000000015 | 900 | 02/29      | N/A  |
| 3  | Bank card (AuthorizeNet) | Pickup              | 5424000000000015 | 900 | 02/29      | N/A  |
| 4  | Bank card (Skyflow)      | Fixed rate (Ground) | 5424000000000015 | 900 | 02/29      | N/A  |
| 5  | Bank card (Skyflow)      | Fixed rate (Air)    | 5424000000000015 | 900 | 02/29      | N/A  |
| 6  | Bank card (Skyflow)      | Pickup              | 5424000000000015 | 900 | 02/29      | N/A  |
| 7  | Bank card (CyberSource)  | Fixed rate (Ground) | 4622943127013705 | 838 | 09/2029    | N/A  |
| 8  | Bank card (CyberSource)  | Fixed rate (Air)    | 4622943127013705 | 838 | 09/2029    | N/A  |
| 9  | Bank card (CyberSource)  | Pickup              | 4622943127013705 | 838 | 09/2029    | N/A  |
| 10 | Manual (offline / cash)  | Fixed rate (Ground) | N/A              | N/A | N/A        | N/A  |
| 11 | Manual (offline / cash)  | Fixed rate (Air)    | N/A              | N/A | N/A        | N/A  |
| 12 | Manual (offline / cash)  | Pickup              | N/A              | N/A | N/A        | N/A  |
| 13 | Bank card (Datatrance)   | Fixed rate (Ground) | 5100001000000014 | 123 | 06/28      | 4000 |
| 14 | Bank card (Datatrance)   | Fixed rate (Air)    | 5100001000000014 | 123 | 06/28      | 4000 |
| 15 | Bank card (Datatrance)   | Pickup              | 5100001000000014 | 123 | 06/28      | 4000 |

## Payment Provider Notes

| Provider | UX Flow | Card Type |
|----------|---------|-----------|
| **AuthorizeNet** | Place Order → `/checkout/payment` redirect | Mastercard |
| **Skyflow** | Place Order → `/checkout/payment` redirect | Mastercard |
| **CyberSource** | Payment form on **cart page** (no redirect) | Visa |
| **Datatrance** | Place Order → `/checkout/payment` redirect + 3DS OTP | Mastercard |
| **Manual** | No card required — offline/cash payment | N/A |

## Shipping Methods

- **Fixed rate (Ground)** — standard delivery
- **Fixed rate (Air)** — express delivery
- **Pickup** — BOPIS (Buy Online, Pick Up In Store)

## Coverage

- 5 payment providers × 3 shipping methods = **15 combinations**
- Every provider tested with every shipping method
- Datatrance requires OTP `4000` for 3DS verification
- CyberSource is the only provider with cart-page payment form
