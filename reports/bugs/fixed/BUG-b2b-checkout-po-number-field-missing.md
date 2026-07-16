# B2B inline checkout has no PO-Number field despite PO capture being enabled `[P2]`

## Status: FIXED

## Resolution
- **Fixed in:** Theme 2.54.0-alpha.2424 (report filed at 2.53.0-pr-2368)
- **JIRA:** — (unfiled)
- **Verified:** 2026-07-15
- **Verification method:** /qa-bug re-verification sweep (playwright-chrome, real-user). B2B inline checkout now renders an "Enter a purchase order number" input in Payment Details **when payment method = Manual** (the field is hidden for Bank-card methods). Its presence confirms `checkout_purchase_order_enabled=true`. Evidence: `bug4-po-field-present-manual.png` / `bug4-no-po-field-with-card.png`.
- **Caveat / re-scope:** the reported defect ("no PO field *anywhere* in inline checkout") no longer holds — the original repro almost certainly stepped through with a card method, where the field is (by design) not shown. If **card-method PO capture** is also required, that is a separate, narrower request, not this bug.

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368
**Ref:** REG-2026-07-14-0018 / CHK-031, CHK-038, CHK-069, CHK-070

## Summary
The inline B2B checkout on `/cart` exposes **no Purchase-Order (PO) number input** anywhere, yet `checkout_purchase_order_enabled` defaults `true` and `/account/orders` shows a populated "Purchase order" column (PO-TEST-20260714-041 on CO260713-00041). The data model and order list support a PO, but there is no field to capture one, and checkout completes without it.

## STR
1. Sign in as a B2B org user; build a cart and open `{{FRONT_URL}}/cart` (inline checkout).
2. Step through every checkout section (shipping, payment, review) looking for a PO-Number input.
3. Confirm `checkout_purchase_order_enabled` = true and open `/account/orders` (the "Purchase order" column is present and populated for prior orders, e.g. CO260713-00041).

## Expected vs Actual
- **Expected:** A PO-Number input available in B2B checkout so buyers can record a PO (consistent with the populated orders-list column and the enabled config flag).
- **Actual:** No PO-Number field anywhere in inline checkout; the order completes with an empty PO.

![No PO-number field in inline checkout](screenshots/CHK-031-CONFIRMED-no-po-number-field-in-checkout.png)

## Root Cause (suspected)
The inline B2B checkout template does not render a PO-Number input bound to the config flag, though the order model and list already surface the field.

## Fix Routing
- **Repo:** vc-frontend (B2B checkout — PO-number capture)
- **Kind:** frontend
