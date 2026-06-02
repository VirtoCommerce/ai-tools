# Demo 1 — AI-Native Conversational Buying & Autonomous Reordering

**Audience:** Midmarket prospect — $150M industrial parts distributor
**Persona narrative:** John Mitchell, procurement lead at AcmeCorp — wants to move from "search & click" to a friction-free conversational buying experience.
**Backed by:** virtostart staging, B2B-store, 20 orders seeded 2026-05-08.

> **Note on product mix.** The original brief uses industrial fasteners ("hex bolts in 3-inch stainless steel") as the example. The virtostart B2B-store catalog doesn't carry fasteners — the closest substitutes for "same product family, swap a variant" are the **3 sports yard signs** (Nationals/Capitals/Seahawks) and **2 Easter garden flags**. Adapt the spoken narrative to the actual products on screen, or switch the catalog before the demo.

---

## Environment

| Field | Value |
|-------|-------|
| Storefront URL | https://virtostart-demo-store.govirto.com |
| Admin URL | https://virtostart-demo-admin.govirto.com |
| Store | `B2B-store` |
| Admin login | `virto-admin` / *(see `.env.local` → `ADMIN_VIRTO_PASSWORD`)* |
| Storefront login | `test-john.mitchell-20260508@test-agent.com` / `TestPass123!` |
| Customer | **John Mitchell** (org: AGENT-TEST-Org-AcmeCorp-20260508) |
| Currency | USD |
| Address on file | 1200 Commerce Blvd, Suite 400, New York NY 10001 USA |

---

## Customer profile

| Field | Value |
|-------|-------|
| Email | `test-john.mitchell-20260508@test-agent.com` |
| Password | `TestPass123!` |
| User ID | `f2f838d8-2195-4a36-8d8d-01de34ae66c3` |
| Contact ID | `08f73abb-3a81-4531-be3b-2718259519d3` |
| Organization | `AGENT-TEST-Org-AcmeCorp-20260508` (`8a64d782-d3f5-4f3f-835a-525b8b41b496`) |
| Role | Organization maintainer (admin) |
| Storefront entry | `/account/orders` shows all 20 orders below |

---

## Catalog — products in play (15 SKUs)

These are the SKUs across the 20 seeded orders. The demo can pick any of them; the **bold** ones are the recommended star players for each sub-scenario.

| # | SKU | Product | Type | Price | Stock | Notes |
|---|-----|---------|-----:|------:|------:|-------|
| 1 | RKB-86978396 | Visitors exploring the extensive parkland at Lyme Park, Cheshire | Physical | $20 | 157 | Stock photo |
| 2 | 553390824 | LG EG9600 Series 65" 4K Smart Curved OLED 3D TV | Physical | $600 | 47 | Electronics |
| 3 | **261082** | **LIPTON ICE TEA SPARKLING CRATE 28×0.20L** | Physical | $9 | 19,473 | **★ Consumable — best fit for 1b restocking** |
| 4 | KIY-89730045 | MOA Star Logo Brass Enamel Shot w/Blue Bottom | Physical | $6.99 | 2,595 | |
| 5 | **7PLSH850** | **Washington Nationals Yard Sign "Fans Play Here"** | — | $111 | 99 | **★ 1a "original" variant** |
| 6 | **7PLSH842** | **Washington Capitals Yard Sign, Halloween Treats** | — | $15 | 100 | **★ 1a "swap to" variant** |
| 7 | BFV890BGF225 | Gingham Easter Burlap Garden Flag | — | $29 | 100 | Garden flag (Easter) |
| 8 | TAWYFWRES226 | Bunny Blooms Table Decor Resin Floral Bunny, 3.75"H | — | $109 | 100 | Decor |
| 9 | 566903892 | Canon Imageclass WiFi MF232W Printer/Scanner/Copier | Physical | $189 | 3,433 | Office equipment — under $1k threshold |
| 10 | **AYB-04369900** | **TOUGHBOOK 40 mk2** | Physical | $2,259 | 7,998 | **★ 1c — over $1k, requires approval** |
| 11 | **SYU-76371555** | **MacBook Pro 2023 Touchbar** | Physical | $1,200 | 277 | **★ 1c — over $1k, requires approval** |
| 12 | UIO-53885304 | Mosquito Mesh Hat | Physical | $15.99 | 34,622 | |
| 13 | JPJ-30487565 | iPhone 16 Pro | Physical | $999 | 756 | Just under $1k threshold (border case) |
| 14 | 7PLSH839 | Seattle Seahawks Holiday Round Door Décor 18×18 | — | $99 | 100 | 3rd yard-sign / sports-decor variant |
| 15 | BF8LJ5BGF225 | Winky The Easter Highland Cow Burlap Garden Flag | — | $29 | 100 | 2nd garden flag variant |

---

## Order history — 20 seeded orders for John Mitchell

All dated 2026-05-08, currency USD, ship to 1200 Commerce Blvd NYC.

| # | Order | Status | Payment | Total | Lines (SKU × qty) |
|---|-------|--------|---------|------:|-------------------|
| 1 | CO26050800101 | Completed | CyberSource | $787 | 7PLSH850×7 |
| 2 | CO26050800102 | Completed | AuthorizeNet | $1,011 | BFV890BGF225×7, 7PLSH839×2, 553390824×1 |
| 3 | CO26050800103 | Completed | Skyflow | $15,555 | TAWYFWRES226×5, SYU-76371555×10, 553390824×5 |
| 4 | CO26050800104 | Completed | DefaultManual | $150 | RKB-86978396×7 |
| 5 | CO26050800105 | Completed | CyberSource | $170 | RKB-86978396×8 |
| 6 | CO26050800106 | Completed | AuthorizeNet | $91 | 261082×9 |
| 7 | CO26050800107 | **Processing** | Skyflow | $4,977 | 553390824×8, BF8LJ5BGF225×3, UIO-53885304×5 |
| 8 | CO26050800108 | Completed | DefaultManual | $901 | 7PLSH839×5, 7PLSH842×9, BF8LJ5BGF225×9 |
| 9 | CO26050800109 | Pending | CyberSource | $126 | BFV890BGF225×4 |
| 10 | CO26050800110 | Pending | AuthorizeNet | $121 | 261082×9, 7PLSH842×2 |
| 11 | CO26050800111 | **Processing** | Skyflow | $14,701 | JPJ-30487565×10, 566903892×9, 553390824×5 |
| 12 | CO26050800112 | Pending | DefaultManual | $7,210 | SYU-76371555×6 |
| 13 | CO26050800113 | New | CyberSource | $8,410 | SYU-76371555×7 |
| 14 | CO26050800114 | New | AuthorizeNet | $949 | 566903892×4, 261082×7, 7PLSH842×8 |
| 15 | CO26050800115 | **Payment required** | Skyflow | $6,190 | SYU-76371555×5, 261082×5, 7PLSH842×9 |
| 16 | CO26050800116 | New | DefaultManual | $10,045 | JPJ-30487565×10, 261082×5 |
| 17 | CO26050800117 | New | CyberSource | $9,379 | 566903892×1, UIO-53885304×9, AYB-04369900×4 |
| 18 | CO26050800118 | New | AuthorizeNet | $446 | TAWYFWRES226×4 |
| 19 | CO26050800119 | **Payment required** | Skyflow | $6,773 | TAWYFWRES226×7, SYU-76371555×5 |
| 20 | CO26050800120 | New | DefaultManual | $115 | 7PLSH842×7 |

---

## Sub-scenario 1a — Process Natural Language Multi-Line Orders

**Goal:** Buyer types a vague reference; AI resolves to a specific past order, identifies the product family, swaps the requested variant, applies the customer's contract price, and pre-populates the cart.

**Star data:**
- Reference order in history: **`CO26050800101`** (7 × Washington Nationals Yard Sign — `7PLSH850` — $111 ea, $787 total, May 8 2026)
- Product family: **sports/team yard signs** (we have 3 variants: Nationals `7PLSH850`, Capitals `7PLSH842`, Seahawks `7PLSH839`)
- Variant change: Nationals → Capitals

### Demo prompt to type into the AI assistant
> *"I need 7 of those Washington Nationals yard signs we ordered last week, but the Capitals version this time."*

### Expected AI behaviour (what must be visible on screen)

| Step | What demo audience must see |
|------|------------------------------|
| 1. Past-order resolution | "Found in your order **CO26050800101** (May 8, 2026): 7 × Washington Nationals Yard Sign — $787" |
| 2. Family detection | "Product family: **sports yard signs**" — list shows Nationals (current), Capitals, Seahawks |
| 3. Variant substitution | "Swapping `7PLSH850` Nationals → `7PLSH842` Capitals" |
| 4. Cart pre-fill | One line: `7PLSH842` × 7 @ $15 = **$105 subtotal** |
| 5. Editable confirmation | Cart shows quantity stepper, variant dropdown still pickable (Nationals/Capitals/Seahawks), "Matched based on your May 8 order" pill |

### Alternative prompts (if demo time allows)
- *"Reorder my last LG TV purchase but make it 3 instead of 1"* → resolves to `CO26050800102` line `553390824×1`, bumps to qty 3
- *"Get me 5 more of those garden flags I bought last week — the Easter ones"* → resolves to `CO26050800102` line `BFV890BGF225×7`, family = burlap garden flags (`BFV890BGF225` Easter, `BF8LJ5BGF225` Highland Cow), keeps Easter, qty 5

### Evidence to capture
- Storefront cart page after AI fills it — screenshot
- Order history page filtered to `CO26050800101` — shows the original Nationals order

---

## Sub-scenario 1b — Predictive Autonomous Restocking

**Goal:** AI analyses repeat-purchase consumption pattern, predicts a stock-out, surfaces a notification + pre-built reorder cart.

**Star data:**
- SKU: **`261082`** — LIPTON ICE TEA SPARKLING CRATE 28×0.20L — $9
- Consumption pattern across 5 orders:

| Order | Date | Qty | Status |
|-------|------|----:|--------|
| CO26050800106 | 2026-05-08 | 9 | Completed |
| CO26050800110 | 2026-05-08 | 9 | Pending |
| CO26050800114 | 2026-05-08 | 7 | New |
| CO26050800115 | 2026-05-08 | 5 | Payment required |
| CO26050800116 | 2026-05-08 | 5 | New |

Total: **35 crates over 5 orders** — qualifies as a recurring consumable purchase.

> **Demo caveat:** All seeded orders are dated 2026-05-08, so the "frequency" curve is artificial. For a polished dry-run, narrate the pattern as if spread over weeks ("you've ordered 35 crates over the last 5 weeks") — or backdate orders 106/110/114 via admin before the demo (we can wire that with a small script if needed).

### Demo trigger
- Notification preview, email preview, or dashboard widget — pick one channel that's already wired
- Wording: *"You're projected to run out of **LIPTON ICE TEA** in 5 days based on your last 5 orders (avg 7/week)."*

### Expected AI behaviour

| Step | What must be visible |
|------|----------------------|
| 1. Consumption visualization | Bar/line chart of the 5 orders × qty, or a simple "5 orders, 35 units, avg 7/week" stat |
| 2. Suggested reorder | Pre-built cart: `261082` × **8 crates** (one cycle worth + buffer) @ $9 = $72 |
| 3. Availability check | Stock 19,473 → green "In stock, ships today" |
| 4. One-click action | "Review & reorder" button → opens cart with line already added |

### Evidence to capture
- The consumption visualization (5 orders containing `261082`)
- The pre-filled cart screen
- Admin order list filtered by `customerId=John Mitchell` + SKU `261082` — proves the 5 reference orders exist

---

## Sub-scenario 1c — Procurement Policy Compliance

**Goal:** Buyer adds an item that violates the org's procurement rules; AI flags in real time before checkout, suggests a compliant alternative, and routes to approval workflow.

**Star data:**
- Policy narrative (announce verbally, no real config required for the demo): *"AcmeCorp procurement policy: any single line item over **$1,000** for the IT/Electronics category requires manager approval. Items under $1,000 auto-approve."*

| SKU | Product | Price | Compliant? | Demo role |
|-----|---------|------:|:----------:|-----------|
| `JPJ-30487565` | iPhone 16 Pro | $999 | ✅ auto-approves | Border case — show that exactly under threshold passes |
| `SYU-76371555` | MacBook Pro 2023 Touchbar | $1,200 | 🚩 **flagged** | **Star — primary non-compliant item** |
| `AYB-04369900` | TOUGHBOOK 40 mk2 | $2,259 | 🚩 **flagged** | Severe overage — could trigger 2-step approval |
| `566903892` | Canon Printer | $189 | ✅ | Suggested alternative for "office equipment under budget" |
| `UIO-53885304` | Mosquito Mesh Hat | $15.99 | ✅ | Sustainability-friendly suggested alt (mesh / natural materials) |

### Demo flow

| Step | What must be visible |
|------|----------------------|
| 1. Add non-compliant item | Buyer adds `SYU-76371555` MacBook Pro × 3 (subtotal $3,600) to cart |
| 2. Real-time validation banner (pre-checkout) | 🚩 *"This $1,200 item exceeds your IT category threshold ($1,000). Approval required from your procurement manager."* |
| 3. AI-suggested alternative | "Try **iPhone 16 Pro** (`JPJ-30487565`) — $999, auto-approves" — single-click swap |
| 4. Workflow outcome | Two paths visible: (a) "Submit for approval" → approval queue; (b) "Swap to compliant alternative" → cart updates instantly |

### Existing reference orders showing the contrast
- **Compliant**: `CO26050800114` ($949 — printer + tea + capitals — all under threshold)
- **Non-compliant** (would have been flagged at the time): `CO26050800103` ($15,555 — MacBook + LG TV + decor), `CO26050800113` ($8,410 — 7× MacBook Pro), `CO26050800117` ($9,379 — TOUGHBOOK + others)

### Evidence to capture
- Cart page with the warning banner active
- Approval workflow / "pending approval" status (admin order list, if approval routing is configured)

---

## Sub-scenario 1d — AI Document-to-Order (Purchase Request)

**Goal:** Buyer receives a procurement document from their own customer (formal PO PDF, an emailed RFQ, or a handwritten note photographed on a phone). Instead of manually transcribing each line into the storefront, they **upload the document** — AI does OCR + line-item extraction + catalog matching, and the result is a draft quote/cart ready to review and accept.

**Why this fits "AI-Native Conversational Buying":** the brief's theme is *"reduce the friction between intent and order."* 1a/1b/1c reduce friction at the typing layer (NL prompts, predictions, real-time policy checks). 1d reduces it at the **document layer** — buyers don't need to type anything, the AI reads the supplier's document for them.

**Backing module:** [`vc-module-ai-document-processing`](https://github.com/VirtoCommerce/vc-module-ai-document-processing) (≥ v3.800.0). Currently flagged **experimental** in vc-frontend — limited support, no auto-type-generation on the client side.

> **Live page on virtostart:** [https://virtostart-demo-store.govirto.com/account/purchase-requests](https://virtostart-demo-store.govirto.com/account/purchase-requests) — verified live 2026-05-11. The list is empty until John uploads his first document.

### How it works under the hood (4-step pipeline)

| Step | xAPI mutation | What happens |
|------|--------------|--------------|
| 1. Upload | `createPurchaseRequestFromDocuments({ storeId, userId, cultureName, currencyCode, documentUrls[] })` | Buyer uploads 1+ files (PDF, image, handwritten note photo). Each becomes a `PurchaseRequestSourceType` attached to the PR. |
| 2. Extract | `extractPurchaseRequestSourcesData({ purchaseRequestId })` | AI/OCR pipeline runs — parses text, detects line items (SKU, qty, price, description) from each source. Async — buyer waits or polls. |
| 3. Post-process | `postProcessPurchaseRequestSources({ purchaseRequestId })` | Extracted items are matched against the catalog → builds a quote. `PurchaseRequestType.quoteId` gets populated. |
| 4. Accept | (standard quote flow) | Buyer opens the linked quote, reviews matched items + prices, edits if needed, accepts → converts to a regular order/cart. |

Alternate entry point: `createPurchaseRequest({ ...empty })` → `addPurchaseRequestSource({ purchaseRequestId, documentUrls[] })` → steps 2–4. Used when documents trickle in.

### Storefront xAPI surface (verified via vc-frontend module source)

- **Queries:** `purchaseRequest(purchaseRequestId)`, `purchaseRequests(storeId, customerId, sort, keyword, first, after)`
- **Object types:** `PurchaseRequestType { id, number, createdDate, createdBy, modifiedDate, modifiedBy, storeId, customerId, quoteId?, sources: [PurchaseRequestSourceType!]! }`; `PurchaseRequestSourceType { name, url, contentType, size }`
- **Mutations:** `createPurchaseRequest`, `createPurchaseRequestFromDocuments`, `addPurchaseRequestSource`, `extractPurchaseRequestSourcesData`, `postProcessPurchaseRequestSources`, `updatePurchaseRequestByDocuments`
- **Notable absence:** no `approvePurchaseRequest` / `rejectPurchaseRequest` — this module is about *parsing*, not approval workflow

### Demo narrative

> *"John's customer (a mid-size construction firm) just emailed him a Purchase Order PDF for next week's job site. Normally John would copy each line item from the PDF into our cart manually — 5 SKUs, 5 qty fields, 5 prices to verify. Today, he just uploads the PDF. Watch what happens."*

### Demo flow

| Step | What demo audience must see | Approx. time |
|------|------------------------------|:-----------:|
| 1. Enter the PR module | John clicks "Purchase requests" in the account sidebar → empty state ("There are no purchase requests yet") | 5s |
| 2. Click **New purchase request** / **Upload** | File-picker opens (PDF / JPG / PNG accepted) | 5s |
| 3. Select sample document | John picks `sample-po-construction.pdf` from his desktop (prepared fixture — see below) | 5s |
| 4. Upload progress | Document uploads → PR record created (number assigned, e.g. `PR-260511-001`) → status: "Processing" | 10s |
| 5. AI extraction (live or stepped) | UI shows the extracted line items as they appear: *"5 line items detected. Matching to catalog…"* — for each item: detected text vs matched SKU vs unit price vs qty | 20–40s |
| 6. Review extracted quote | A draft quote opens with the matched items. Buyer can edit qty / swap variants / remove unmatched rows | 15s |
| 7. Accept → quote ready | Click "Accept" → quote becomes a real cart with the items pre-loaded → proceed to checkout | 10s |
| 8. (Optional) New order placed | Standard checkout → order appears in `/account/orders` | 10s |

**Total:** ~75–95 seconds. Tight, high-impact moment for the demo.

### Sample documents to prepare (★ pre-demo)

Have **3 fixtures ready** in a known location on the demo machine — one for the live run, two as fallbacks if extraction misfires:

| File | Format | What it contains | Why this one |
|------|--------|------------------|--------------|
| `sample-po-construction.pdf` | Formal PDF PO from "TechFlow Construction" | 5 line items mapping to known catalog SKUs: `7PLSH850 × 5`, `BFV890BGF225 × 10`, `261082 × 12`, `7PLSH842 × 3`, `7PLSH839 × 2` | Primary — clean PDF, AI should match all 5 to catalog with high confidence |
| `sample-po-handwritten.jpg` | Photo of a handwritten note | Same 5 items in messy handwriting | **Wow factor** — shows AI handles non-typed input. Use as the "let's try something harder" follow-up |
| `sample-po-mixed.pdf` | PDF with 5 known SKUs + 2 unknown items (intentionally mistyped descriptions) | Demonstrates partial match + "couldn't match these — pick from catalog" UX | Backup if you want to show the graceful-failure path |

> **Don't have these yet** — they need to be generated. Use any PDF tool (Word → Export, or a simple "Demo PO" template). Items should reference SKUs that exist on virtostart (see Catalog table above) — that's what gives the AI a fair chance.

### Pre-demo prep checklist

- [ ] Run `createPurchaseRequest` once via xAPI to confirm the mutation works on virtostart (you'll get a PR id back)
- [ ] Prepare the 3 sample documents (above) — store them somewhere John's session can reach (desktop / local)
- [ ] Walk through steps 3–6 of the flow at least once before the live demo — AI extraction can be slow (30s+) the first time; have a "narrate while it processes" line ready
- [ ] Verify file upload destination — `documentUrls[]` expects publicly-accessible URLs; if the module uploads to VC's asset module first, the buyer-side UI handles this transparently. Test once end-to-end.
- [ ] Confirm `vc-module-ai-document-processing` is installed in vcst-qa AND virtostart admin modules list (it's the platform module powering the AI). On virtostart we saw the page load successfully → module is installed. On vcst-qa we didn't see the `/account/purchase-requests` route → **module is NOT installed on vcst-qa** as of 2026-05-11.
- [ ] (Optional) Test with a handwritten note to know how the AI does on bad handwriting — set audience expectations accordingly during the demo

### Edge cases & graceful failures (good demo material)

| Case | Expected behaviour |
|------|--------------------|
| Document has SKUs not in catalog | UI shows them as "unmatched", buyer picks a substitute or removes |
| Item description matches multiple SKUs (ambiguous) | UI surfaces top-N matches with confidence scores, buyer picks |
| Document quality too poor (blurred, low DPI) | "Unable to extract — please try a clearer image" message; PR record stays in `sources` but quote doesn't get built |
| Buyer uploads a non-document (random photo) | AI returns 0 line items, surfaces "no items detected" friendly state |
| Multi-page PO | All pages parsed; line items aggregated |

### What Virto provides natively vs. partner (1d-specific)

| Capability | Virto native | Partner |
|------------|:-----------:|---------|
| Document upload + storage (PR module) | ✅ | — |
| OCR + AI line-item extraction | (uses configured AI provider — typically Azure Form Recognizer / OpenAI Vision via module config) | Customer-supplied AI key |
| Catalog matching of extracted items | ✅ (matches against the buyer's accessible catalog + price list) | — |
| Quote generation from PR | ✅ | — |

### Evidence to capture

- The empty Purchase Requests list before upload (clean baseline)
- The file-picker open + selected document
- The "Processing" intermediate state with the upload progress / extraction spinner
- The draft quote with the extracted line items (compare side-by-side with the source document for the "wow")
- The final cart / order populated from the accepted quote
- Admin view: in the platform admin, the PR record + linked quote
- (Optional) Console screenshot showing the GraphQL mutation chain (`createPurchaseRequestFromDocuments` → `extractPurchaseRequestSourcesData` → `postProcessPurchaseRequestSources`) for technical-buyer credibility

### Known issues / risks for the live demo

- **i18n key unresolved.** Browser title shows raw `Demo - purchase_requests.title` instead of "Purchase Requests" (page heading itself is correct). Minor cosmetic — flag as a known cleanup, doesn't block the demo.
- **Experimental module.** vc-frontend README explicitly says limited support. Have a recorded video fallback for the upload→extract→quote happy path in case live extraction takes too long or fails.
- **Empty state has no "Create" CTA on /account/purchase-requests** (observed 2026-05-11). The page just says "There are no purchase requests yet" with no "Upload document" button visible. Either: (a) the button appears once the page is reached via a different flow (e.g. from cart), or (b) the experimental module hides the creation UI behind a feature flag, or (c) the creation must be triggered programmatically for now. **Resolve before demo** — clicking around in the live page is the fastest way to find out, or check the module's source for the routing condition.

---

## Demo run-of-show (suggested ~12-min flow)

1. **Set the stage (1 min)** — log into storefront as John Mitchell, show `/account/orders` with 20 orders. Hover over order numbers / payment methods.
2. **Open the AI assistant** — chat embed visible.
3. **Sub-scenario 1a (3 min)** — type the Nationals → Capitals prompt. Walk through the 5 visible steps. End with a confirmed cart.
4. **Sub-scenario 1b (3 min)** — show the dashboard / notification with the LIPTON ICE TEA predictive offer. Click through to the pre-filled cart. Place the reorder.
5. **Sub-scenario 1c (2 min)** — start a new cart, add MacBook Pro × 3, get flagged, accept the iPhone 16 Pro substitute, check out.
6. **Sub-scenario 1d (2 min)** ★ NEW — open `/account/purchase-requests`, upload `sample-po-construction.pdf`, watch AI extract the 5 line items, accept the resulting quote → order. Optional follow-up: drop the handwritten-note photo for the "wow" moment.
7. **Wrap (1 min)** — show the new orders that were just placed appearing in `/account/orders`.

---

## What Virto provides natively vs. partner

| Capability | Virto native | Partner / simulated |
|------------|:-----------:|---------------------|
| Order history, contract pricing, cart, checkout | ✅ | — |
| Product variants, bundles | ✅ | — |
| Approval workflows | ✅ | — |
| **AI Document Processing** (Purchase Requests — 1d) | ✅ via `vc-module-ai-document-processing` (experimental) — module orchestrates upload → OCR → extract → catalog match → quote build | Configurable AI provider for the OCR/extraction backend (Azure Form Recognizer, OpenAI Vision, etc.) |
| GenAI chat / NLU on the prompt | — | OpenAI / Klevu / custom (calls Virto xAPI under the hood) |
| Consumption analytics / IoT stock-out prediction | — | Aera / ToolsGroup / custom analytics service |
| AI-suggested alternatives for compliance | — | Partner or rule-based shim — Virto enforces the policy gate |

---

## Files & references

- Seeded orders: [test-data/b2b/_seed-results-orders-virtostart.json](../../test-data/b2b/_seed-results-orders-virtostart.json)
- Markdown report: [test-data/b2b/seed-report-orders-virtostart-20260508.md](../../test-data/b2b/seed-report-orders-virtostart-20260508.md)
- Seed script: [scripts/seed-orders-virtostart.js](../../scripts/seed-orders-virtostart.js)
- Status updater (Skyflow): [scripts/update-skyflow-statuses.js](../../scripts/update-skyflow-statuses.js)
- B2B users/orgs seed: [test-data/b2b/_seed-results-orgs-virtostart.json](../../test-data/b2b/_seed-results-orgs-virtostart.json)
