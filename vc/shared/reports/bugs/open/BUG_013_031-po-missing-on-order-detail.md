# BUG: [Storefront / Orders] Purchase Order number rendered under "Order Comment" widget without label on order detail page — no dedicated PO field

**Severity:** Medium (confirmed) — with strong UX/compliance implications for B2B buyers
**Priority:** P2 (upgrade to P1 if PO tracking is a contractual requirement for BuildRight-type orgs)
**Type:** Bug (UX / template defect) — reclassified from original "PO missing" to "PO mislabeled / misplaced"
**Status:** Reproduced
**Environment:** QA Storefront — https://vcst-qa-storefront.govirto.com
**Browser:** Edge (playwright-edge)
**Store Version:** 2.47.0-pr-2225-130f-130fb04d
**Date:** 2026-04-22
**Tested By:** qa-frontend-expert
**BL Violation:** BL-CHK-004 (B2B PO number lifecycle), BL-ORD-001 (order integrity)
**User:** test-carlos.rodriguez-20260310@test-agent.com (B2B Org Admin, BuildRight)

---

## Summary

The original defect report ("PO Number missing from order detail page") is **empirically false** in the strict sense — the Purchase Order number **IS rendered** on the order detail page. However, the defect is **real in a different form**: the PO is rendered **inside the "Order Comment" widget, without any label** ("Purchase order number:" prefix), making it visually indistinguishable from a free-form customer comment. There is **no dedicated PO widget/section** on the detail page.

Compounding the issue, backend **duplicates the PO value into both `order.comment` AND `order.purchaseOrderNumber` fields** (verified via authenticated GraphQL), so the Vue template's `OrderCommentSection` picks it up via `order.comment` — but it then looks like a comment, not a PO.

This is a **template/data-model bug, not a rendering-absent bug** — and fixing it cleanly requires both frontend template updates and a backend field-independence audit.

---

## Steps to Reproduce (what the original report got right, and where the observation differs)

### Preconditions
- B2B user in org with "Manual" payment method configured (BuildRight has Manual enabled).
- An order placed earlier with a PO value entered at checkout. Reference order: `CO260421-00006` (PO: `PO-REG013-20260421-001`, placed by Carlos Rodriguez, 2026-04-21 during suite 013 run).

### Original report said:
> "Storefront `/account/orders/{orderId}` detail page does NOT render `purchaseOrderNumber`"
> "backend persists it, `GetFullOrder` query fetches it, but Vue template is missing the field"

### What actually happens (observed 2026-04-22):

1. Navigate to `/account/orders` as Carlos → click row `CO260421-00006`.
2. Detail page loads (`/account/orders/eb4758fa-4b2e-442b-b128-7c3ac97d10ad`).
3. Page contains a widget section titled **"Order comment"** (left column, below line items).
4. Inside that widget, as plain text: `PO-REG013-20260421-001` — no label, no prefix, no formatting cue that it's a PO.
5. DOM structure:
   ```html
   <section class="vc-widget vc-widget--size--lg mt-5">
     <header> ... Order comment ... </header>
     <div class="vc-widget__slot-container">
       <div class="vc-widget__slot">
         <p>PO-REG013-20260421-001</p>
       </div>
     </div>
   </section>
   ```
6. There is **no "Purchase order", "PO #", or `purchaseOrderNumber`** label anywhere on the page.
7. Order list view (`/account/orders`) shows columns: `Order number | Buyer name | Invoice | Date | Status | Total`. **There is no "Purchase order" column on the list view either** (contradicts the original report's claim that the list shows PO — it does not; only the order number `CO260421-00006` is visible there, not `PO-REG013-20260421-001`).
8. The order list header row and pagination logic never expose PO as a filter either.

### Backend proof — PO is available (duplicated into two fields)

Authenticated `GetFullOrder` call on `eb4758fa-4b2e-442b-b128-7c3ac97d10ad` returns:

```json
{
  "data": {
    "order": {
      "id": "eb4758fa-4b2e-442b-b128-7c3ac97d10ad",
      "number": "CO260421-00006",
      "comment": "PO-REG013-20260421-001",
      "purchaseOrderNumber": "PO-REG013-20260421-001",
      "status": "New"
    }
  }
}
```

For an order without PO entered (CO260422-00001, placed today without PO field):

```json
{ "comment": "", "purchaseOrderNumber": "" }
```

So both fields mirror each other — when PO is set, `comment` receives the PO value; when PO is empty, both are empty. The backend (CustomerOrderBuilder or cart → order converter) is **synchronizing PO into comment**, which is likely intentional (legacy integration compatibility) but causes the storefront ambiguity.

---

## Root Cause — Frontend Template Analysis (GitHub `VirtoCommerce/vc-frontend@dev`)

**File:** `client-app/pages/account/order-details.vue` (commit `44df73fc8e85691a8c981af0ecb48c0806edf5d9`, size 10,210 bytes)

Line 55:
```vue
<OrderCommentSection v-if="order.comment" :comment="order.comment" readonly class="mt-5" />
```

This is the **only** place in the template that consumes the "comment" field. There is **no `order.purchaseOrderNumber` reference anywhere** in the order-details template — I searched the whole file and the `pages/account/` directory, and the only file that references `purchaseOrderNumber` is `checkout/review.vue` (the checkout summary, not the order detail).

**One-line fix candidate** (but see the "Better fix" section below):

Insert after the `OrderCommentSection` line:
```vue
<VcWidget
  v-if="order.purchaseOrderNumber"
  :title="$t('common.titles.purchase_order_number')"
  class="mt-5"
>
  <div class="text-base">{{ order.purchaseOrderNumber }}</div>
</VcWidget>
```

And, critically, **also update `OrderCommentSection` to NOT render the PO value as a comment** — which requires knowing whether `comment === purchaseOrderNumber` (suppress the comment widget if they're equal, i.e., the backend-duplicated case).

### Better fix — decouple the two fields

Backend (`vc-module-orders` / `vc-module-xapi-cart`) should NOT copy `purchaseOrderNumber` into `comment`. The storefront template should render each field in its own widget, each with its own translation key. This also prevents order comments (legitimately entered by the buyer) from being overwritten by the PO value.

---

## Scope — What else could be broken

**Fields confirmed rendered on order detail page:**
- Order number (page title + breadcrumb)
- Created date (Order Data widget)
- Status + OrderStatus chip (Order Data widget)
- Cancel reason (VcAlert, conditional)
- Line items (VcWidget with OrderLineItems — grouped by vendor if enabled)
- Gift items (AcceptedGifts, conditional)
- **Comment (widget, receives PO value via backend duplication)** ← current defect
- Order summary (OrderSummary component — subtotal, discount, tax, shipping, total)
- Pay Now button (conditional on status)
- Reorder button (conditional on Completed status)
- Billing address (VcWidget, conditional on billingAddress)
- Shipping method + price (VcWidget, conditional, hidden for all-digital orders)
- Shipping address / Pickup address (VcWidget, conditional)
- Payment method (VcWidget, conditional on `payment?.paymentMethod`)

**Fields NOT rendered on order detail page (potential additional gaps — not re-verified):**
- `purchaseOrderNumber` — confirmed missing (this bug)
- `operator`/`impersonator` info (who placed the order on behalf of whom)
- Dynamic properties / custom metadata on the order
- Cost center / department (CHK-072 blocked in the regression run — field may not exist at all on this store)
- Approval workflow history (not configured on this org per CHK-033)
- Attachments (none rendered; unclear if OrderType even supports them)
- Created-by user (Carlos Rodriguez name is not shown on detail page; only on the list row)

**Admin SPA side (not re-verified in this investigation):** The admin order view reportedly shows the PO (per prior test session suite-013 attempt). Admin SPA presumably uses a different Vue component.

---

## Evidence

| File | Description |
|------|-------------|
| `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-BUG_013_031-01-order-detail-PO-inside-comment-widget.png` | Order #CO260421-00006 detail page: "ORDER COMMENT" widget rendering raw `PO-REG013-20260421-001` with no label |

**GraphQL response evidence** captured via authenticated `GetFullOrder` (in investigation session) — both `comment` AND `purchaseOrderNumber` return the identical PO string for an order whose checkout PO field was populated.

**DOM walk evidence** (ancestors of `<p>PO-REG013-20260421-001</p>`):
```
P          (PO value as bare paragraph)
DIV.vc-widget__slot
DIV.vc-widget__slot-container
SECTION.vc-widget.vc-widget--size--lg.mt-5     ← widget "Order comment"
DIV.vc-layout__content
... (layout ancestors)
```
Widget titles on page: Order comment, Order data, Order summary, Billing address, Shipping method, Shipping address, Payment method. **NO "Purchase order" widget.**

---

## Suggested Fixes

### Frontend (minimum viable — `vc-frontend`)

**File:** `client-app/pages/account/order-details.vue`

1. Insert dedicated PO widget BEFORE `OrderCommentSection`:
   ```vue
   <VcWidget
     v-if="order.purchaseOrderNumber"
     :title="$t('common.titles.purchase_order_number')"
     class="mt-5"
   >
     <div class="text-base break-words">{{ order.purchaseOrderNumber }}</div>
   </VcWidget>
   ```
2. Update `OrderCommentSection` conditional to suppress when `comment === purchaseOrderNumber` (avoids duplicate rendering until backend is cleaned up):
   ```vue
   <OrderCommentSection
     v-if="order.comment && order.comment !== order.purchaseOrderNumber"
     :comment="order.comment"
     readonly
     class="mt-5"
   />
   ```
3. Add translation key `common.titles.purchase_order_number` → "Purchase order number" (+ all supported locales).
4. **Order list view** (`client-app/pages/account/orders.vue` — not examined here): consider adding an optional "Purchase order" column, or a filter by PO, for B2B tenants. This is a feature-request follow-up, not part of this bug.

### Backend (decouple the two fields — recommended follow-up)

5. **Audit:** find where `purchaseOrderNumber` is being copied into `comment`. Likely in `CustomerOrderBuilder` or the cart → order conversion in `vc-module-orders`. Remove the duplication — these are semantically distinct fields and should stay separate.
6. Data remediation for existing orders: `UPDATE CustomerOrder SET Comment = '' WHERE Comment = PurchaseOrderNumber` (only if organization policy confirms this is safe; some existing orders may have been relying on this quirk in email templates).

### Admin side (verify, not in scope of this investigation)

7. Verify admin order view renders PO in its own dedicated field (not under comments). If not, file a parallel backend/admin SPA bug.

---

## Recommended JIRA Title

`[Storefront/Orders] Order detail page has no dedicated "Purchase order number" widget — PO value appears unlabeled inside "Order Comment"`

**Labels:** `Severity:Medium`, `Priority:P2`, `Area:Storefront`, `Area:Orders`, `Area:B2B`, `Area:Templates`, `UX`, `i18n`

**Affected versions:** 2.47.0 — reproducible on current QA build. Likely pre-existing for multiple versions.

---

## Verdict Summary

- **Original report claim** "PO is missing from detail page" — **partially incorrect**. PO value IS displayed.
- **Real defect**: PO is rendered inside the "Order Comment" widget, unlabeled, because backend mirrors PO → comment AND the Vue template has no dedicated PO widget.
- **Fix surface**: one frontend file + one translation key + (optionally) one backend de-duplication PR.
- **Severity kept at Medium** because the value is visible and labeled-ish (in the sense that it appears where comments go and B2B users often use the comment to write a PO); **but escalate to P1 if any downstream system (tax/invoicing/fulfillment) is reading `comment` vs `purchaseOrderNumber` differently or if the org has contractual PO-tracking compliance requirements**.
