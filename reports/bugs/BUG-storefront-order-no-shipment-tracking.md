# Storefront order detail shows no shipment tracking after a shipment is sent `[P2]`

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368
**Ref:** REG-2026-07-14-0018 / CHK-024, ORD-005, ORD-030 · BL-ORD-007

## Summary
A shipment marked **Send** in Admin with a tracking number and tracking URL persists correctly on the backend, but the buyer's storefront order detail shows **no tracking section** — no tracking number, no tracking link, and no shipped-state indication. The customer has no way to follow their shipment.

## STR
1. Place a shippable order as a customer (order CO260714-00019).
2. In Admin, open the order's shipment (#SH260714-00019), set it to **Send**, tracking number `1Z999AA10123456784`, and a tracking URL; save. (Verified persisted in Admin.)
3. As the buyer, open `{{FRONT_URL}}/account/orders/` → order **CO260714-00019** detail.

## Expected vs Actual
- **Expected:** Order detail shows a tracking section with the tracking number and a link to the carrier (BL-ORD-007).
- **Actual:** No tracking section, no tracking number/link; order status still reads "New".

![Storefront order detail — no tracking after Send](screenshots/CHK-024-VERIFY-storefront-no-tracking-after-send.png)

## Notes
"Shipped" not being a settable order-status ENUM is **by design** — the defect is the absent tracking **display** on the storefront, not the status label.

## Root Cause (suspected)
The storefront order-detail template does not render shipment tracking fields (`trackingNumber` / `trackingUrl`) even when present on the order's shipments.

## Fix Routing
- **Repo:** vc-frontend (order-detail template / shipment tracking block)
- **Kind:** frontend
