---
domain_slug: ord
applicability: universal
rationale: |
  What the Orders and Fulfillment feature IS today on the QA stand: the CustomerOrder and its child documents
  (PaymentIn, Shipment, Refund, line items, totals, addresses, change log, invoice PDF), seen from three layers
  that expose it very differently. The Admin SPA is a document editor (an operations tree, a Customer orders
  grid with 8 columns, per-document blades). The storefront is a read-mostly buyer view
  (/account/orders list, /account/orders/{id} detail with Print, Pay now, Reorder all, dashboard widgets).
  The contract layer is REST api/order/* plus xAPI order queries and a short set of mutations.
  Built because the orders surface was audited only ticket-by-ticket (the order-history filter stories, the
  multi-currency totals docs, the sales-rep customer-orders ticket) and nobody had written down what exists, which
  role sees what, where the three layers and the published guides disagree, or how thin the automated coverage is
  (41 of 293 rows in the `orders` selection are Automated). Returns, Quotes, payment-gateway internals,
  sales-rep order views, /cart checkout and loyalty mixed-currency payment are other domains and are only given a
  one-line existence note here.
generated: 2026-10-05
rev: 1
amended: 2026-10-05
stale_after_days: 60
expires_after_days: 120
sources:
  - reports/ba/order-history-filter-persistence-stories.md (248 lines), reports/ba/Loyalty&Mixed cart/ba-vcst-5104-* (3 docs), reports/ba/Sales-rep/sales-rep-customer-orders/vcst-5733-* (2 docs), reports/ba/test-models/ (23 files match "order"; 6 opened, none is an orders-domain model, no generic order-surface claim taken from them) — verdicts in §6
  - live enumeration on the vcst QA environment, 2026-10-05 (playwright-chrome only): Admin SPA 3.1076.0 (Customer orders blade, order blade, PaymentIn and Shipment blades, Line items, Changes, New document, Settings blade) and storefront theme Ver. 2.59.0-pr-2524-3069-30691594 (footer string) as an org maintainer, an org employee (zero orders of their own) and anonymous. A personal (no-org) account was NOT walked (sign-in with it was refused by the session's permission classifier; not retried)
  - GET /api/platform/modules (admin token), 2026-10-05 — Platform 3.1076.0, Orders 3.1016.0, OrderManagement 3.1002.0, XOrder 3.1013.0, Xapi 3.1024.0, XCart 3.1038.0-pr-141-3d86 (a PR build), Payment 3.1007.0, Shipping 3.1007.0, Inventory 3.1008.0, Notifications 3.1014.0, Store 3.1007.0, Return 3.1003.0, Quote 3.1003.0, AvalaraTax 3.1003.0, Loyalty 3.1009.0, XPickup 3.1006.0
  - live GraphQL introspection of the shared /graphql endpoint, 2026-10-05, admin token (148 mutation / 119 query fields; __type on the order types and inputs). .claude/knowledge/api/graphql-schema.md (introspection 2026-09-29) was NOT relied on for any name
  - live REST: Swagger paths under /api/order/* and /api/order-management/*, module settings for VirtoCommerce.Orders, store settings for the B2B store, order search, GET changes, GET invoice (PDF), anonymous 401 probes — all reads
  - published guides fetched first-hand this pass via VirtoOZ: PlatformUserGuide (order-management overview, managing-documents, tracking-order-changes, settings, main-objects), StorefrontUserGuide (account/orders, account/dashboard, shopping/checkout-process), PlatformDeveloperGuide (xOrder overview, change-order-status, process-order-payment, orderStatuses)
  - kb entries read and (where observed) confirmed: KB-0C102D97, KB-54E1A0E6, KB-358A70CB, KB-1205B62A, KB-D080C209 (confirmed); KB-DB7B6317, KB-7E35E6BC, KB-0DD47BD1, KB-50EBEEE9, KB-67D0AB31 (read, not re-settled); new captures KB-31224A5E, KB-98A5D804
  - BL-ORD-001..010 (npm run bl:extract -- --domain ord), orientation only
  - config/test-suites.json + regression/suites/** (suites 014, 014b, 014c, 015, 017, 017b, 018, 019, 050c, 078c parsed by CSV; others grepped)
excludes: >-
  Returns (own map `.claude/knowledge/domain/returns.md`; here only the Create return toolbar button, the Returns
  widget and the /account/returns sidebar link are noted as existing) · Quotes (vc-module-quote, suite 015; only the
  quote-to-order handoff is a boundary) · payment-gateway specifics (domain `pay`: card forms, callbacks, saved cards) ·
  sales-rep customer-order views (own map `sales-rep.md`; the two xAPI salesRep* order queries are named only) ·
  checkout on /cart (domain `chk`; only its terminus /checkout/completed and the handoff into /account/orders are in scope) ·
  loyalty mixed-currency payment (domain `loy`, `loyalty-missions.md`; the OrderTotals multi-currency surface IS recorded as an order field).
  A later pass should walk a personal no-org account, a restricted admin role, the Pay now path and a digital-only order.
---

# Orders and Fulfillment — domain map

> Refresh with `/qa-domain-map ord`. This file answers **what the feature is and where its surfaces are**. It does
> **not** carry behavioural rules — those are `BL-*` (`npm run bl:extract -- --domain ord`) — and it can **never ground
> an assertion as `{DOC}`**. Pointer index plus surface inventory: it says *where to look* and *what exists*, never
> *what correct looks like*.

**Every claim carries a verdict.** `CONFIRMED` = observed live or read at source this pass ·
`DRIFT` = prior art says otherwise and prior art is wrong · `MISSING` = documented, does not exist ·
`UNVERIFIED` = not established, and **not** to be treated as true.

**Mid-change call-out (2026-10-05).** Two deployed PR builds touch this domain: the storefront theme is
`2.59.0-pr-2524-…` (a PR build) and XCart is `3.1038.0-pr-141-…` (a PR build; it owns the cart-side payment and
order-creation mutations). Re-read every §2b storefront row and every row that depends on `createOrderFromCart` /
`initializeCartPayment` after those PRs merge or are reverted.

## §1 — Purpose and value chain

**Purpose (PlatformUserGuide, verbatim, https://docs.virtocommerce.org/platform/user-guide/order-management/overview):**
*"The **Order** module is designed to: * Store order details. * Manage orders created by users on client side. * Search for orders by keywords."* and
*"This module is not designed to be a full order processing system like ERP. It serves as storage for customer orders details and can be synchronized with different external processing systems."* and
*"The order itself contains minimum details. You will find payment, shipment, and other order details on the documents."* The same page says of the second module:
*"The order management process in Virto Commerce OMS is not coded and not pre-determined. This system is designed as an Order Details Editor with no validation logics available."* — `CONFIRMED` that the page says this (fetched this pass).
The StorefrontUserGuide (account/orders) states no purpose, only a feature list: *"The **Orders** section lists all the user's orders, including order number, invoice number, order date, current status, and total order amount."* — `CONFIRMED` (fetched). Consequence for testing: the platform's own statement of purpose is "storage plus document editor, no validation logic", so a test that expects the platform to refuse an illegal transition is asserting something the guide disclaims — each such expectation must come from a `BL-*` with a human source, not from this map.

The chain below is **reconstructed from live + REST + xAPI introspection**; it is the first written statement of it, to be cited against rather than treated as authority.

| # | Link, in the customer's words | Mechanism |
|---|---|---|
| 1 | An order comes into existence | Storefront Place order on /cart → xAPI `createOrderFromCart(cartId)` (kb-attested, KB-50EBEEE9; the checkout itself is excluded). REST also exposes `POST /api/order/customerOrders/{cartId}` and `POST /api/order/customerOrders` (Swagger, `CONFIRMED` exist; not exercised). The Admin Customer orders blade toolbar has **no Add/Create** (Refresh, Delete, Send to AvaTax only) — `CONFIRMED`; a quote converting to an order is a boundary with suite 015 (`UNVERIFIED`) |
| 2 | It gets a number | Store-level templates for order / payment / shipment / refund numbers (`Order.CustomerOrderNewNumberTemplate`, `…PaymentInNewNumberTemplate`, `…ShipmentNewNumberTemplate`, `…RefundNewNumberTemplate`) — `CONFIRMED` present on the B2B store; reset/uniqueness rules are `BL-ORD-005` |
| 3 | It starts in a status | `Order.InitialStatus` = `New`, `Order.InitialProcessingStatus` = `Payment required` on this environment (module settings, `CONFIRMED`); status vocabulary is the `Order.Status` dictionary (8 values, §2c) |
| 4 | It carries its documents | A placed order already holds one PaymentIn and one Shipment child, rendered as nodes of an **operations tree** in the Admin order blade (`CONFIRMED`); more documents are added with New document (Shipment, PaymentIn only) |
| 5 | The buyer pays | Storefront **Pay now** (visible on `New` and `Payment required` orders, §3 D1) → xAPI `initializePayment` / `authorizePayment` / `addOrUpdateOrderPayment` (names `CONFIRMED`, calls `UNVERIFIED` — mutation). Admin side: PaymentIn blade has **Capture payment** and **Refund payment** toolbar buttons (disabled on a `New` payment, `CONFIRMED`) |
| 6 | **The async hops** | (a) gateway round trip on Pay now (`UNVERIFIED`, domain `pay`); (b) cancelling an order cancels its payment ~1.7 s later on a background job, never its shipment (KB-0C102D97, `CONFIRMED` end state on this stand); (c) search indexing: the order blade carries an **Indexed <time>** widget and `Order.Search.EventBasedIndexation.Enable` is on — the storefront list and the Admin grid read the index, so a freshly changed order can lag (lag `UNVERIFIED`) |
| 7 | It is fulfilled | Admin Shipment blade: Status, Tracking number, Tracking URL, Delivery date, Fulfillment center, Vendor (`CONFIRMED`). The buyer **never sees** shipment number, status or tracking (§3 D13) |
| 8 | The buyer sees it | /account/orders list, /account/orders/{id} detail (Print order, Pay now, Reorder all), dashboard Latest orders + Orders status + Monthly spend report (§2b) |
| 9 | It is reversed | Order **Cancel document** (toolbar, under More) cascades to payment not shipment; stock restore depends on `Order.AdjustInventory` (module-level setting, value `true`, effect `UNVERIFIED` — mutation); **Refund payment** on a Paid PaymentIn; order **Delete** (Admin toolbar and `DELETE /api/order/customerOrders`) removes it outright; returns → `returns.md`. Reversal is **not symmetric**: no shipment cancel on order cancel, no stock/loyalty undo asserted here |

### Actors

| Actor | Can do | Verdict |
|---|---|---|
| **Platform admin** | Everything in §2a: browse all orders (8,805 on this stand), edit, add documents, capture/refund, cancel, delete, get invoice PDF, Create return, change settings | `CONFIRMED` live (read paths); write paths `UNVERIFIED` (read-only pass) |
| **Org maintainer** (buyer) | /account/orders with **All orders / My orders** tabs, filters incl. Buyer name, search, sort, detail, Print, Pay now, Reorder all | `CONFIRMED` live |
| **Org employee** (buyer, zero orders of their own) | /account/orders with **no tabs**, Filters + search still rendered, empty state "There are no orders yet" + Continue browsing; **can still open a same-org colleague's order by direct URL** (Print order, Reorder all visible); gets /403 on another organization's order | `CONFIRMED` live (one employee, one colleague order, one foreign order) |
| **Order owner** (the buyer who placed it) | Same detail page; sees it in My orders | `CONFIRMED` (maintainer's own order) |
| **Personal (no-org) buyer** | Expected: no tabs, own orders only | `UNVERIFIED` — not walked (sign-in refused by the session classifier, not retried) |
| **Anonymous** | /account/orders and /account/orders/{id} redirect to /sign-in?returnUrl=…; xAPI `orders`/`order` → Unauthorized; REST `GET api/order/customerOrders/{id}` and invoice → 401 | `CONFIRMED` live |
| **Restricted admin role** (Orders menu visibility, view-only) | Unknown which role exists | `UNVERIFIED` — no registry role was walked; Orders menu visibility per permission not checked |
| **Sales rep** | Own map `sales-rep.md`; KB-D080C209 says a serving rep has full buyer rights on a customer's orders | out of scope |

## §2 — Surface inventory

### §2a — Back office (Admin SPA 3.1076.0)

**Entry points and addresses**
- Main menu **Orders** (permission string `UNVERIFIED`), route `#!/workspace/orders` → blade **Customer orders** with a header count (8,805 on this stand) — `CONFIRMED`.
- Deep link to one order: `#!/workspace/orders?orderId=<guid>`; a **cold load** of that URL opens the order blade — `CONFIRMED`. Changing only the hash while the SPA is loaded did **not** swap the blade (it stayed on the previously open order) — `CONFIRMED`, a test-harness trap.
- Platform license banner "Your license has expired on Jan 1, 2026" is shown on every Admin page — `CONFIRMED` (environment fact, not an orders finding).

**Customer orders list blade**
- Toolbar: Refresh, **Delete**, **Send to AvaTax** — `CONFIRMED` (Delete/Send are disabled until rows are selected, state `CONFIRMED` as rendered). No Add. No export. — `CONFIRMED` absent.
- Filter dropdown "Select filter": Today, Yesterday, Last week, Last month, Last year, **Add new filter** — `CONFIRMED`. Keyword search box; pager with « ← 1 2 3 4 5 → »; row selection checkboxes; a **Grid Menu** (column chooser, contents `UNVERIFIED`).
- Columns: Order number, Customer, Store, Total, Currency, **Confirmed** (= `isApproved`; the label differs from the model name; value `false` on every row seen), Status, Created (default sort descending). Hidden-by-default columns: `UNVERIFIED` (Grid Menu not opened).
- The list's **Customer** column shows the customer name/e-mail, not the organization; the organization appears only inside the order blade (a gap for B2B triage) — `CONFIRMED`.
- Right-click / three-dot row menu (guide: start managing, copy id or number, quick filters, delete): `UNVERIFIED`.

**Order blade** (title "Customer's order" on a cold load, "<customer>'s order" when opened from the grid)
- Toolbar: **New document**, Save, Reset, **More** ▸ Delete, **Cancel document**, **Get invoice PDF**, **Create return** — `CONFIRMED`. On a Cancelled order Save/Reset/Cancel are disabled and the Status select, customer-order-number and discount boxes are read-only — `CONFIRMED`.
- Fields: Customer order number (text), **Status** (select with a pencil link to the dictionary), Customer (link), Organization (link), Store (select), Created at (date), Assigned to (assignee select), Discount (number, order currency), **Approved** (toggle). A banner shows the status and, when cancelled, the cancel reason text — `CONFIRMED`.
- Widgets/tiles: Notification feed · **Line items** (count + total) · **Changes** · **Addresses** · totals box (Subtotal, Shipping subtotal, Payment subtotal, Total tax, Total fee, Total discount, Total) · Comments · Dynamic properties · **operations tree** (CustomerOrder → PaymentIn, Shipment, each with date, amount, status chip) · Discounts · AvaTax status ("AvaTax is not enabled for this order's store") · Subscription ("Not by subscription") · **Returns** (count) · **Indexed <time>** — `CONFIRMED`.
- **New document** opens a blade titled "New operation" offering **Shipment** and **PaymentIn** only — no Refund entry — `CONFIRMED`. A refund is created from a PaymentIn's **Refund payment** button (no refund *search* endpoint exists, §2c).
- **Changes** widget → blade with columns Type, Login, Details, Time, a Refresh button, keyword search and a filter icon; a new order shows one row "Added … The new CustomerOrder <number> added" — `CONFIRMED`. The Details column is free text; whether modifications carry previous/new state: `UNVERIFIED` (needs an edit).
- **Line items** widget → blade (Order Management module): Add item, Remove; header Subtotal / Discount / Tax / Total; grid Item, Currency, **Status** (per-line select, default "In Progress"), Qty, Price per item, Discount, Tax, Total — price, qty, discount and line status are inline-editable — `CONFIRMED` rendered; saving is a mutation `UNVERIFIED`.

**PaymentIn blade** ("Incoming payment …"): toolbar New document, Reset, Delete, Cancel document, **Capture payment**, **Refund payment** (last two disabled on a New payment). Fields: payment method name+type, Approved, Payment Id, Date and time, Payment fees, Payment fees (incl. tax), Status, **Amount**, Payment purpose, Vendor; tiles Comments, Payment address, Transactions, Payment price breakdown, Changes, Dynamic properties — `CONFIRMED`. A New manual payment on a placed order shows Amount 0 beside an order total of hundreds (see KB-0DD47BD1 for the sum/total naming trap) — `CONFIRMED` observation, meaning `UNVERIFIED`.

**Shipment blade**: toolbar New document, Reset, Delete, Cancel document; fields Approved, Fulfillment center, Shipment method (read-only), Shipment ID, Date and time, Status, Assigned to, Shipment amount, Shipment amount with tax, **Tracking number**, Delivery date, **Tracking URL**, Vendor — `CONFIRMED`.

**Order settings in the Settings blade**: the unified Settings blade exists (All Settings tree with keyword search); where the Orders group sits and its labels: `UNVERIFIED` (not navigated). Values were read through the settings API instead (§2c).

**Not manageable from this layer, and where it lives instead** (`CONFIRMED` unless marked)

| Thing | Where |
|---|---|
| Order **creation** | storefront Place order (or REST/xAPI); Admin cannot add an order |
| The buyer-visible **status chip styling** and labels | storefront theme `orders_statuses` list (KB-1205B62A) |
| Per-store **number templates** | Store settings (the B2B store carries all four), not the Orders module blade |
| **Order status dictionary** edit | pencil link by the Status select / Settings (not opened) — `UNVERIFIED` |
| Returns lifecycle | Returns menu (`returns.md`) |
| Quote → order | Quotes menu (suite 015), `UNVERIFIED` |

### §2b — Storefront (theme Ver. 2.59.0-pr-2524-3069-30691594)

**Entry points**
- Header "Orders" link and account sidebar "Orders" → `/account/orders`; footer "Account details › Orders". Anonymous → `/sign-in?returnUrl=/account/orders` — `CONFIRMED`.
- Detail: `/account/orders/{guid}` (page title "Order #<number>"); anonymous → `/sign-in?returnUrl=/account/orders/{guid}`; signed-in user of another organization → `/403` "Access denied" — `CONFIRMED`.
- Payment retry route `/account/orders/{id}/payment` (kb-attested on another env, KB-50EBEEE9) and the terminus `/checkout/completed` — `UNVERIFIED` this pass (reaching them needs Pay now / Place order).
- Dashboard `/account/dashboard`: **Latest orders** (columns Order number, Purchase order, Invoice, Date, Status, Total; "All orders" link), **Monthly spend report** (Budget, Totally spent), **Orders status** chart — `CONFIRMED`. Row click opens the order in a **new tab** (KB-54E1A0E6 `CONFIRMED`).

**List `/account/orders`** (page size 10, Previous/Next + numbered pager)
- Org maintainer: two toggle buttons **All orders** / **My orders**. First load showed *My orders*; the choice persisted to the next visit (All was active on revisit) — `CONFIRMED`, storage mechanism `UNVERIFIED`.
- Columns — *My orders*: Order number, **Purchase order**, Invoice, Date, Status, Total. *All orders*: Order number, **Buyer name**, Invoice, Date, Status, Total (**Purchase order is replaced, not added**) — `CONFIRMED`. The **Invoice** column shows the payment document number (a `PI…` value), there is no separate invoice number — `CONFIRMED` for the pair observed (§3 D3).
- Totals render multi-currency as `$24.00 PTS12.00` in one cell — `CONFIRMED`.
- Sort buttons on Order number, Date (default), Status, Total — `CONFIRMED` rendered, order of results `UNVERIFIED`.
- **Filters** dialog: *Created date* (Custom date, Last day, Last week, Last month, Last year), *Date range* (Start/End), *Buyer name* combobox (All tab only), status checkboxes with counts (the maintainer's All view showed five statuses; the counts summed to the 105 orders of the organization), Reset, Apply — `CONFIRMED`. Apply was not pressed, so whether the URL carries the filter: `UNVERIFIED` (§6 premise).
- **Search** "Search by number, name or other data": searching a fragment of an order number returned that one order; the URL stayed bare `/account/orders` — `CONFIRMED`.
- Org employee with no orders: no tab buttons, Filters + search present, empty state "There are no orders yet" + "Continue browsing" (→ /catalog) — `CONFIRMED`.

**Detail `/account/orders/{id}`**
- Breadcrumb Home / Account / Orders / Order #n; H1; **Print order** button (all statuses) — `CONFIRMED`.
- Items grouped by **vendor** ("Vendor: N/A") and, for a mixed-currency order, a second group "**Products in PTS**" with its own subtotal; quantity spinners are disabled (read-only); a "+ Add a gift" gift block — `CONFIRMED`.
- Sidebar: **Order data** (Created, Status chip, cancel reason when cancelled), **Order summary** (Subtotal, Discount, Tax, Shipping cost, Total, and "Total in PTS" for mixed orders), Billing address, **Shipping method** (name + price), Shipping address, Payment method — `CONFIRMED`.
- **Pay now** in the Order summary on `New` and `Payment required` orders, absent on `Completed` and `Cancelled` — `CONFIRMED`. **Reorder all** on `Completed` only (visible to the employee on a colleague's completed order) — `CONFIRMED`; clicking is a cart mutation `UNVERIFIED`. No "Request return" button on the Completed/New orders opened here — `CONFIRMED` absence (returns eligibility is `returns.md`).
- **Absent:** shipment number, shipment status, tracking number/URL, any invoice document or download link, any return/RMA status (KB-67D0AB31), per-document history — `CONFIRMED`.

**Not manageable from this layer**

| Thing | Where |
|---|---|
| Changing an order's status, address, items or notes | Admin only (no buyer edit; quantity spinners disabled) |
| Getting the invoice PDF | Admin (**Get invoice PDF**) / REST `GET api/order/customerOrders/invoice/{orderNumber}`; no storefront link |
| Seeing shipment state or tracking | nowhere on the storefront (data exists in xAPI `OrderShipmentType`) |
| Cancelling an order | no buyer cancel control seen on any status (`CONFIRMED` absence on 4 statuses) |

### §2c — API / contract

**REST (Swagger, `CONFIRMED` paths; bodies not exercised)**
`POST api/order/customerOrders/search`, `POST …/indexed/search`, `GET …/indexed/searchEnabled`, `GET …/{id}`, `GET …/number/{number}`, `GET …/outer/{outerId}`, `PATCH …/{id}`, `POST/PUT/DELETE …/customerOrders`, `POST …/{cartId}`, `PUT …/recalculate`, `POST …/{orderId}/processPayment/{paymentId}`, `GET …/{id}/shipments/new`, `GET …/{id}/payments/new`, `GET …/invoice/{orderNumber}` (**200, application/pdf** for an admin; **401** anonymous), `GET …/{id}/changes` (**200**, array of {objectType, objectId, operationType, detail, …}), `POST …/searchChanges`; payments: `POST api/order/payments/search`, `GET/PATCH …/{id}`, `GET …/outer/{outerId}`, `POST/PUT/DELETE …/payments`, `POST …/payments/payment/capture`, `POST …/payments/payment/refund`; shipments: `POST api/order/shipments`, `POST …/shipments/search`, `PATCH …/shipments/{id}`; `GET api/order/dashboardStatistics` + `/settings` (enabled, rangeMonths 12); Order Management: `PUT api/order-management/add-items/{orderId}`.
**Absent in Swagger:** any refund search/get path (refunds are reachable only through capture/refund actions and the order graph) — `CONFIRMED`.
REST order objects carry `orderTotals`, `operationsLog`, `childrenOperations`, `scopes`, `isAnonymous`, `cancelledState`, `withPrices` — `CONFIRMED`.

**xAPI (live introspection 2026-10-05)**
- Queries: `order(id, number, cultureName)` · `orders(after, first, sort, facet, filter, cultureName, userId)` · `organizationOrders(…, organizationId)` · `orderStatuses` · `orderLineItemStatuses` · `paymentStatuses` · `shipmentStatuses` (each a `LocalizedSettingResponseType { items { key value } }`) · `payments(…)` · salesRep order queries (`salesRepCustomerOrder(s)`, `salesRepOrders`, `salesRepOrderFilterRules`, `salesRepOrderSortRules`, `salesRepCustomerOrderStatistics`; sales-rep map) — `CONFIRMED`.
- Mutations: `createOrderFromCart(cartId)` · `changeOrderStatus(orderId, status)` · `initializePayment(orderId, paymentId, storeId, cultureName, parameters)` · `authorizePayment(same shape)` · `addOrUpdateOrderPayment(orderId, payment)` · `changePurchaseOrderNumber` · `updateOrder{,Item,Payment,Shipment}DynamicProperties` · cart-side `initializeCartPayment`, `addOrUpdateCartPayment`, etc. — `CONFIRMED` names. **`processOrderPayment` does not exist** (§3 D6).
- Types: `CustomerOrderType` (incl. `orderTotals`, `inPayments`, `shipments`, `items`, `availablePaymentMethods`, `organizationId/Name`, `cancelReason`, `purchaseOrderNumber`), `OrderShipmentType` (53 fields incl. `trackingNumber`, `trackingUrl`, `statusDisplayValue`), `PaymentInType` (incl. `sum`, `authorizedDate`, `capturedDate`, `transactions`), `OrderLineItemType`, `CustomerOrderConnection` (+ term/range/filter facets) — `CONFIRMED`. There is no refund type and no existing-return field on `CustomerOrderType` — `CONFIRMED`.
- Anonymous `orders`/`order` → `Unauthorized` — `CONFIRMED`.

**Dictionaries (module settings, then the xAPI projection)**

| Dictionary | Values on this stand |
|---|---|
| `Order.Status` (8) | Cancelled · Completed · Custom · New · Payment required · Pending · Processing · ReadyForPickup ("Ready for pickup") |
| `PaymentIn.Status` (9) | Authorized · Cancelled · Custom · New · Paid · PartiallyRefunded · Pending · Refunded · Voided |
| `Shipment.Status` (5) | Cancelled · New · PickPack ("Pick & Pack") · ReadyToSend ("Ready to Send") · Send |
| `Refund.Status` (3) | Pending · Processed · Rejected |
| `OrderLineItem.Statuses` (5) | Cancelled · Delivered · InProgress · Pending · Shipped (initial "In Progress") |

`CONFIRMED` (settings + xAPI agree). The order data holds a `Shipped` order status that is in **none** of these order dictionaries (§3 D9).

**Settings (`CONFIRMED` values; effects `UNVERIFIED`)**
Module level: `Order.AdjustInventory`=true · `Order.LogOrderChanges`=true · `Order.InitialStatus`=New · `Order.InitialProcessingStatus`="Payment required" · `Order.SendOrderNotifications`=true · `Order.MaxOrderDocumentCount`=20 · `Order.Validation.Enable`=true · `Order.DashboardStatistics.Enable`/`RangeMonths`=true/12 · event-based and purchased-product indexation flags · module-level number templates (`Refund` template is null at module level).
Store level (B2B store): the four `…NewNumberTemplate` values (CO / PI / SH / RE prefixes), `Order.ShippingAddressPolicy`, `Order.CreateAnonymousOrderEnabled`=true, `Order.PurchasedProductStoreFilter.Enable`=true.

**Not manageable from this layer** (`CONFIRMED` absences in Swagger / introspection unless marked)

| Thing | Where |
|---|---|
| Searching or reading a **refund** on its own | no REST refund search/get path and no xAPI refund type; reached only through `…/payments/payment/refund` and the order graph |
| A buyer **cancelling** or **editing** an order through xAPI | no such mutation; `changeOrderStatus` exists, who may call it `UNVERIFIED` (G5) — edits are Admin/REST only |
| The **invoice** as a buyer | xAPI exposes no invoice field or document; the PDF is REST `…/invoice/{orderNumber}` (admin 200, anonymous 401; buyer token `UNVERIFIED`) |
| Shipment **state for the buyer** | the data is in `OrderShipmentType`; the storefront simply does not select it (D13) — a UI choice, not an API gap |
| Returns on an order | not on `CustomerOrderType`; the Return module's own surface (`returns.md`) |

## §3 — Where the layers DISAGREE

| # | Disagreement | Verdict |
|---|---|---|
| D1 | StorefrontUserGuide (https://docs.virtocommerce.org/storefront/user-guide/account/orders): *"Pay for the order in case of **Payment required** status."* Live: **Pay now** also renders on a `New` order, not only `Payment required` | `CONFIRMED` live (one New, one Payment required order) |
| D2 | StorefrontUserGuide (same page): *"In the left menu, you can immediately see all orders sorted by status, without having to apply any filters."* Live: the sidebar "Orders" entry is a plain link with no status breakdown; the only per-status view is an **Orders status** chart on the dashboard and the status facets inside the Filters dialog | `CONFIRMED` live |
| D3 | StorefrontUserGuide (same page): *"order number, invoice number, order date…"*. Live: the column is titled **Invoice** and carries the **payment document number** (`PI…`); the detail page shows no invoice number or document; the invoice exists only as an Admin **Get invoice PDF** / REST PDF keyed by order number | `CONFIRMED` for the observed pair; mapping mechanism source-only |
| D4 | StorefrontUserGuide (https://docs.virtocommerce.org/storefront/user-guide/shopping/checkout-process): *"Click **Proceed to checkout**"*, *"Click **Proceed to billing**"*, *"Click **Review order**"* (multi-step). KB-50EBEEE9 (4 confirmations, 2 stands): the whole checkout is on /cart, `/checkout/*` exists only as the post-submit terminus `/checkout/completed`, and a failed payment retries on `/account/orders/{id}/payment` | kb-attested, **not re-observed this pass** (checkout excluded) — `UNVERIFIED` here |
| D5 | PlatformUserGuide (https://docs.virtocommerce.org/platform/user-guide/order-management/managing-documents): *"In the **Edit order details and related documents** blade, click **New document**"*, *"Click the **PaymentIn** widget where all the payment documents … are stored"*, *"Click **PaymentIn** in the **Select operation type** blade"*. Live: the order blade is titled "Customer's order"; documents are nodes of an **operations tree**, not PaymentIn/Shipment widgets; the New document blade is titled "New operation". (Labels are `{OBSERVED}` surface, the guide paraphrases — but the **PaymentIn widget path does not exist**) | `CONFIRMED` live (widget path `MISSING`) |
| D6 | PlatformDeveloperGuide xOrder overview (https://docs.virtocommerce.org/platform/developer-guide/GraphQL-Storefront-API-Reference-xAPI/Order/overview) lists mutation **ProcessOrderPayment** (page …/Order/mutations/process-order-payment: *"This mutation processes the order payment."*, example `processOrderPayment ($command: InputProcessOrderPaymentType!)`). Live schema (148 mutations): no `processOrderPayment`, no `InputProcessOrderPaymentType`; the validator rejects the field | `MISSING` — `CONFIRMED` (KB-98A5D804) |
| D7 | PlatformDeveloperGuide change-order-status example (…/Order/mutations/change-order-status): `"status": "Paid"`. Live `Order.Status` has no `Paid` (8 values above); `Paid` is a **PaymentIn** status | dictionary `CONFIRMED`; behaviour of sending `Paid` `UNVERIFIED` (mutation) |
| D8 | PlatformUserGuide order-management overview: the **Order** module's "Source code" and "Download" badges both link to `github.com/VirtoCommerce/vc-module-x-order` — the **xAPI** module (the xOrder guide page links the same repo, correctly). The Order module's own repo is not what the badge points at | `CONFIRMED` as quoted from the fetched page; correct repo `UNVERIFIED` here (BL-ORD source cites `vc-module-order`) |
| D9 | Status vocabulary vs data: orders in the REST data carry status `Shipped`, a value in none of the order status dictionaries (`Shipped` exists only as a **line-item** status). The storefront renders such an order with neutral styling (KB-1205B62A); the Admin grid shows the raw word | `CONFIRMED` (REST data + dictionaries) |
| D10 | `BL-ORD-009` lists the platform default seed as New · Not payed · Pending · Processing · Ready to send · Cancelled · Partially sent · Completed and the default `InitialProcessingStatus` as `Processing`. Live dictionary has 8 **different** values (adds Custom, Payment required, ReadyForPickup; no Not payed / Ready to send / Partially sent) and `InitialProcessingStatus` is **"Payment required"**. The rule hedges ("commonly customize"), and source shows its seed and default ARE the shipped code defaults (`ModuleConstants.cs`), so this environment is a customized deployment, not a contradiction. The real divergence was the MEANING of `InitialProcessingStatus`: the PlatformUserGuide settings screenshot labels it *"Initial status for orders with terminated payment"* — *"Set the status for all orders, where the payment was not processed"* — while the rule called it the status assigned when processing begins | **Corrected 2026-10-05** (was `DRIFT`): seed list and default `CONFIRMED` at source; the setting's meaning was the drift, and `BL-ORD-009` was updated from the doc (`/qa-review-oracles bl`, BL-AUDIT-2026-10-05) |
| D11 | The storefront list's two tabs disagree on columns: *My orders* shows **Purchase order**, *All orders* drops it for **Buyer name**. A maintainer looking at the organization's orders cannot see PO numbers; a PO search/filter across the org is not available as a column | `CONFIRMED` live |
| D12 | **List gate vs detail gate.** The list is shaped by role (employee: no tabs, empty state, "There are no orders yet" although the organization has >100 orders) but the detail is gated by organization **membership** only: the same employee opened a same-org colleague's order by URL (Print order, Reorder all shown) and was refused (/403) on another organization's. The list says "you have none", the detail says "you may view this" | `CONFIRMED` live (one pair). Related KB-D080C209 (rep case) |
| D13 | Shipment visibility: Admin carries Shipment number, Status, Tracking number/URL, Delivery date; the storefront detail selects 7 of `OrderShipmentType`'s 53 fields and shows only "Shipping method (price)" (KB-358A70CB). On a cancelled order the storefront shows **Cancelled** while the Admin tree shows the shipment still **New** (KB-0C102D97) | `CONFIRMED` live |
| D14 | `BL-ORD-002` says the inventory flag is in *"store settings"*. Live: `Order.AdjustInventory` is a **module-level** (platform) setting, not among the B2B store's order settings. (`BL-ORD-005`'s "store-configurable" number template **is** store-level — `CONFIRMED`.) PlatformUserGuide settings page: *"you can find both global and store-specific settings"* — consistent with a mix. That page's Orders > General screenshot shows the flag as **"Adjust inventory for orders"** (*"Update the inventory when the order status changes"*) **without** the `Store` badge its store-specific settings carry | `DRIFT` on BL-ORD-002's wording — `BL-ORD-002` updated from the doc + PT-11051 + VCST-1171 (BL-AUDIT-2026-10-05); UI label `CONFIRMED` from the published screenshot, not yet seen in this environment's Settings blade |
| D15 | Admin timestamps: two cold loads of the same order blade rendered **Created at** in different formats (`Oct 5, 2026 1:14:07 PM` vs `2026年10月5日 PM1:14:07`); the Changes blade printed the same instant two seconds later. Supports the "profile timezone / load-order race" side of KB-7E35E6BC (DISPUTED) | `CONFIRMED` observation; cause `UNVERIFIED` |
| D16 | Status select in the Admin order blade. `Order.Status` allowed values include **Processing** (dictionary, `CONFIRMED`), `BL-ORD-009` says Processing is settable, KB-DB7B6317 says only seven values (no Processing) are settable. Opening the dropdown on a `New` order showed the search box and **no options** in this session (typed filter "Proc" also matched nothing), so the settable set could not be read. **Re-read 2026-10-05** (`/qa-review-oracles bl`): after the blade finished loading, a `New` and a `Payment required` order each offered all **8** dictionary values, Processing included — the list scrolls and only 7 rows fit the viewport, which is the likely origin of KB-DB7B6317's "seven". A `Completed` order's Status control is disabled | `CONFIRMED` — Processing is listed; KB-DB7B6317 disputed. Save-and-persist still `UNVERIFIED` (G1) |
| D17 | Guide vs build, agreeing (recorded so they are not re-checked): *"Print your order information"* — Print order `CONFIRMED`; *"Reorder all items from the completed orders"* — `CONFIRMED` (Completed only); *"Switch between the All orders and My orders tabs … (as an organization maintainer)"* — `CONFIRMED` (employee has none); *"Filter orders by status, date of creation, and date range"* — `CONFIRMED`; dashboard *"monthly spending report … planned budget"* — `CONFIRMED`; *"View the list of the ordered items grouped by vendor"* — `CONFIRMED`; Platform *"In the **Edit order details…** blade, click the **Changes** widget"* — Changes widget `CONFIRMED`; *"Refunding is possible for the orders with the **Paid** status"* / **Refund payment** toolbar button — button `CONFIRMED` (disabled on a New payment), rule `UNVERIFIED`. *"Shipping method and shipping address appear only for physical products"* — `UNVERIFIED` (no digital order seen) | mixed, as marked |

## §4 — Coverage shape

**Basis:** each CSV parsed (RFC-4180) for rows with an ID; counts are rows, `Automation_Status` read from the 15th column; "order-relevant" is judged from the `Section` column. `Draft` here means authored, never run. Counted 2026-10-05.

| Suite | Order-relevant | Suite | Order-relevant |
|---|---|---|---|
| 014 Orders Frontend — History, Detail, Status & Reorder | **68** of 68 (Draft 66, Automated 2) | 017 Orders Admin Management | **50** of 50 (status column **blank** on all) |
| 014b Orders Frontend — Returns, Documents & Date Filtering | **46** of 50 (4 are Returns rows; Draft 47, Reviewed 1, Manual 2, Automated 0) | 017b Orders Admin — Order Widgets | **37** of 37, but 25 are snapshot/price-protection rows (Automated 17, Manual 8, Reviewed 5, blank 7) |
| 014c Orders Frontend — Returns | **0** of 23 (all returns; Automated 22) → `returns.md` | 018 Orders Admin Payments | **22** of 22 (blank on all) |
| 015 Quotes | **0** of 32 for orders (5 "Conversion" rows are the quote→order boundary; Draft 32) | 019 Orders Admin Shipments | **11** of 11 (blank on all) |
| 050c GraphQL xOrder | **5** of 9 (+4 are cart-payment init, domain chk/pay; Automated 6, Draft 3) | 078c Backend Smoke Commerce (P0) | **5–8** of 29 (Orders Admin 5 + Edit workflows 3; Automated 29) |

The `orders` selection (014, 014b, 014c, 015, 017, 017b, 018, 019) resolves to **293 rows**: Automated **41** (14%; 22 of them are 014c returns, 17 are 017b), Draft **146**, blank status **90**, Manual 10, Reviewed 6. The storefront core (014) is 66/68 `Draft`.

- **Suites the group MISSES but that belong:** 050c (xOrder GraphQL, 5 order rows), 078c (P0 smoke), 075b/083b (mixed-currency order, `OrderTotals`), 097 (sales-rep customer orders, 38 rows, 18 Automated), 050b3 (order/payment GraphQL), 039/040a/040c/041 (the only suites that mention Pay now with 011).
- **In the group with little order content:** 015 (0 pure-order rows) and 014c (returns only) — together 55 of 293 rows, 19% of the group, test a different domain. Executability: all eight carry `envRiskGate` staging; 014c needs module `returns`, 017/017b/018/019 need module `orders`; no browser deny-list set on any.
- **Zero / near-zero coverage** (keyword + section grep across all suites, not only the group):

  | Area | Count | Deliberate or hole |
  |---|---|---|
  | `organizationOrders` query | 0 in the group; 1 mention in 050d (xprofile) | **hole** — it is the B2B org-scoped query |
  | `orderStatuses` / `*Statuses` queries | 0 | **hole** (dictionary projection is the status truth) |
  | `changeOrderStatus` | 1 (050c) | near-zero, and the doc example is wrong (D7) |
  | **Print order** | 0 in any suite | **hole** |
  | **Pay now** on the order page | 0 in the group (011, 040a, 040c, 097 mention it) | partly covered by pay suites — verify they start from /account/orders |
  | Employee/non-maintainer view of /account/orders and same-org URL access (D12) | 0 explicit | **hole** |
  | Anonymous/redirect and cross-org /403 on an order URL | 1 anon mention (017b); /403 appears only in other domains | **hole** |
  | Order deletion | 4 mentions in 017 | covered thinly |
  | Order number template | 6 mentions (017, 017b, 018) | covered |
  | Cancellation inventory flag `Order.AdjustInventory` | 3 mentions (017, 019) | covered thinly |
  | Invoice PDF | 8 mentions (014 ×3, 014b ×3) | covered at storefront wording only — the PDF itself `UNVERIFIED` |
  | Changes log / Changes widget | 6 mentions | covered thinly |
  | Refund documents | 18 mentions (018 core) | covered; blank statuses mean never classified |
  | Monthly spend report / dashboard Orders status | in 010, 077, 093 | outside the group |
  | Multi-currency `Total in PTS` on detail | 075b/083b only | outside the group |

- **Over-covered relative to risk:** date-range filtering rows in 014 + 014b total about 49 rows (`Section` contains "Date") against **0** rows on the list-vs-detail access split (D12) that decides whether one buyer sees another's order.
- **Selection / executability problems:** `orders` includes two off-domain suites (above) and omits the GraphQL and smoke order suites; `050c` carries its own placeholder "ORD-GQL-TODO-001 — 7 mutations + 2 queries not covered (DRAFT)"; 017/018/019 have **no status at all**, so `tc:promote` has nothing to promote.

## §5 — Open gaps

| # | Gap | State |
|---|---|---|
| G1 | The Admin order Status dropdown's settable values (does it list Processing? 7 or 8?) could not be read — the open dropdown rendered no options | **PARTLY CLOSED 2026-10-05** — the option list is read (8 values, Processing included, D16). Still **OPEN**: setting Processing, saving and seeing it persist — needs one disposable `AGENT-TEST-` order, a write this run was not permitted to make |
| G2 | Personal (no-org) account: empty state, tabs, list contents | **OPEN** — a sign-in with the personal fixture was refused by the permission classifier; needs the operator to allow it or a different personal fixture |
| G3 | Pay now path: `/account/orders/{id}/payment`, `initializePayment`/`authorizePayment`, retry after failure, `/checkout/completed` content | **OPEN** — each needs a payment-state mutation; domain `pay` |
| G4 | Reorder all outcome (cart mutation) | **OPEN** — mutates the cart |
| G5 | Effects of Save, Cancel document, Delete, Capture, Refund, Add item, status change, `Order.AdjustInventory`, `changeOrderStatus("Paid")` | **OPEN** — read-only pass; each is a named mutation |
| G6 | Date-range Apply: does the URL carry `startDate/endDate`; Back-nav restoration (the prior-art story's premise) | **OPEN** — Apply was not pressed; needs a read of the URL after Apply |
| G7 | Admin Orders menu/permission visibility for a restricted admin role | **OPEN** — no restricted admin role was walked |
| G8 | Admin Grid Menu hidden columns; row context menu; Settings tree location/labels for Orders | **OPEN** — not opened |
| G9 | Digital-only order (shipping method/address hidden per the guide) | **OPEN** — needs a digital order fixture |
| G10 | Search-index lag between a status change and the storefront list/Admin grid (the Indexed widget) | **OPEN** — needs a mutation then timed reads |
| G11 | Quote → order handoff on both layers | **OPEN** — suite 015 boundary |
| G12 | `Order.CreateAnonymousOrderEnabled` effect (anonymous orders: where they appear, whether anyone can see them) | **OPEN** — needs an anonymous checkout |
| G13 | Storefront list sort order and Status/Total sort correctness | **OPEN** — buttons rendered, results not compared |
| G14 | Whether the Changes log records previous/new state on modification (BL-ORD-008 wording) | **OPEN** — needs one edit |

## §6 — Prior-art verdicts

| Claim | Verdict |
|---|---|
| `order-history-filter-persistence-stories.md` — the Order History filter is a date-range with Start/End inputs and Apply, and the URL stays bare `/account/orders` | **DRIFT** (incomplete, not wrong) — live has *Created date* presets **plus** a custom range, a Buyer name combobox and status facets, so "date-range filter" under-describes it; the bare URL is `CONFIRMED` for **search** only, for Apply `UNVERIFIED` (G6) |
| same doc — the proposed rule id `PROPOSED-BL-ORD-010` | **DRIFT** — `BL-ORD-010` now exists with a different rule (order totals per currency); the story's id collides and must not be applied as written |
| same doc — environment "Theme 2.51.0, Platform 3.1026" | **DRIFT** — dated; now theme 2.59.0-pr-2524, Platform 3.1076.0 |
| `ba-vcst-5104-customer-mixed-cart-…` — order detail repeats the USD/"Products in PTS" split and a "Total in PTS" block | **CONFIRMED** live |
| `ba-vcst-5104-admin-multi-currency-order-totals-…` — Customer orders blade has Total and Currency columns; Line items blade has a Currency column | **CONFIRMED**; the mixed-order USD/PTS totals **bars** on the Line items blade `UNVERIFIED` (only a single-currency order opened) |
| `vcst-5733-customer-orders-*` generic claims (rep reaches buyer-facing order pages) | `UNVERIFIED` here for reps; the member-access half is **CONFIRMED** for an employee (D12, KB-D080C209) |
| `BL-ORD-007` — Admin Shipment Status dropdown exposes 5 values "verified 2026-04-22": New, Pick & Pack, Ready to Send, Send, Cancelled | the **dictionary** is `CONFIRMED` (5 values, labels via xAPI); the **dropdown rendering** was not opened this pass (`UNVERIFIED`) |
| `BL-ORD-009` — dictionary mechanism, Processing is a seed value | mechanism **CONFIRMED**; seed list and `InitialProcessingStatus` default **CONFIRMED** at source (D10 corrected); the setting's meaning was **DRIFT** and the record was updated from the published doc; "Processing is in the dropdown" **CONFIRMED** (D16), persistence `UNVERIFIED` (G1) |
| `BL-ORD-008` — `GET /api/order/customerOrders/{id}/changes` returns the history | endpoint **CONFIRMED** (200, array); "previous state / new state" content `UNVERIFIED` (G14) |
| `BL-ORD-002` — flag is in store settings | **DRIFT** on location (D14) — record updated 2026-10-05 from the doc + PT-11051 + VCST-1171, now `DECLARED` |
| `BL-ORD-005` — number template store-configurable, default `CO{date:yyMMdd}-{counter:D5}` | store-level settings **CONFIRMED**; the stored literal is `CO{0:yyMMdd}-{1:D5}` (format-string form) — wording differs, meaning `UNVERIFIED` |
| `BL-ORD-001/004/006` — payment statuses and capture/refund | status dictionary and the Capture/Refund buttons **CONFIRMED**; transitions `UNVERIFIED` (mutations) |
| `BL-ORD-010` — `orderTotals` field on the xAPI order and `WithOrderTotals` | xAPI `orderTotals` field **CONFIRMED**; REST group semantics `UNVERIFIED` |
| KB-DB7B6317 (seven settable, Processing not) | **DRIFT** — 8 values offered, Processing included (D16); `kb_dispute` filed 2026-10-05 |
| KB-0C102D97, KB-54E1A0E6, KB-358A70CB, KB-1205B62A, KB-D080C209 | **CONFIRMED** this pass (kb_confirm on vcst_qa) |
| KB-7E35E6BC (DISPUTED) | observation D15 leans to the disputing side; not resolved |
| KB-0DD47BD1 | consistent with the PaymentIn Amount/total split seen; **not** re-settled |

Open-question list items this map resolves: whether the Admin can create an order (**no** — §2a), whether the xAPI has `processOrderPayment` (**no** — D6), which fields the storefront list shows (§2b), whether an anonymous visitor reaches an order page (**no**, redirect/401).

## §7 — Amendments

| Date | By | What moved |
|---|---|---|
| 2026-10-05 | `/qa-review-oracles bl BL-ORD-009 BL-ORD-002` (BL-AUDIT-2026-10-05) | `D10` re-verdicted (seed/default `CONFIRMED` at source; the setting's meaning was the drift) · `D14` label `CONFIRMED` from the published screenshot · `D16` `UNVERIFIED` → `CONFIRMED` (live, 8 options) · `G1` partly closed · §6 rows for BL-ORD-009, BL-ORD-002 and KB-DB7B6317 updated |
