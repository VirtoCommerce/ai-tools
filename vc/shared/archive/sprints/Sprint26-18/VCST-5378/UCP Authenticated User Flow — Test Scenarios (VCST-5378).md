# UCP Authenticated User Flow — Test Scenarios (VCST-5378)

2026-09-17 · @Elena Mutykova

## Context — VCST-5378: UCP Authenticated User Flow

**Goal:** Registered B2C/B2V buyer, handoff happy path.

**Status:** Testing · **Priority:** High · **Assignee:** Anton Zorya

**User stories under test:**

1. **B2C/B2V consumer via Claude Code** — signs in, asks Claude (in natural language) to find a product and prepare checkout. Claude assembles a cart through the Universal Commerce Protocol (UCP), returns a signed `continue_url`, and the buyer completes payment in the merchant's existing Virto Storefront, with the agent session preserved as order attribution.
2. **B2B buyer with an org account** — Claude performs discovery and cart assembly under the buyer's organization's contract pricing and assortment. On handoff, the storefront resumes the session as the organization, honoring contract prices, approval rules, and existing payment terms (PO, invoice).

The scenarios below cover both flows, plus negative and edge cases around auth, session integrity, and pricing/permission fidelity across the Claude ↔ UCP ↔ Storefront handoff.

## Test Environment & Fixtures

**Environment:** QA storefront — https://vcst-qa-storefront.govirto.com/ **Store:** B2B-store (buyer session resolves to org **AGENT-TEST-Org-AcmeCorp**) **Buyer account:** `test-john.mitchell-20260310@test-agent.com` (displays as "John Mitchell")

Confirmed live on the storefront:

| Fixture | SKU | Price | Stock | Notes |
| --- | --- | --- | --- | --- |
| AGENT-TEST-Printer All-in-One | PR-001 | $179.99 | 18 | General catalog/cart/checkout fixture (Office category) |
| AGENT-TEST-Low-Stock-Fixture | QA-LOW-001 | $14.99 | 5 | Deterministic low stock — use for TS-17 (stock conflict before handoff) |
| AGENT-TEST-Tier-Priced-Fixture | QA-TIER-001 | $29.99 | 199 | Built for tiered/contract pricing checks — use for TS-07 |
| AGENT-TEST-SubFive-Fixture | — | $3.49 | 500 | Cheapest fixture; good minimal-cart smoke item |
| AGENT-TEST-Fractional-Discount-Fixture | — | $87.50 (was $100, −13%) | 120 | Discount/promo rendering |
| AGENT-TEST-Stacking-Sale-Fixture / -ThreeLayer-Fixture | — | $70.00 / $150.00 (−30% / −25%) | 150 / 250 | Multiple stacked discounts |
| AGENT-TEST-Variation-Stock-Master | — | From $59.99 | 2 variations | Variant/option selection |
| AGENT-TEST-MultiCurrency-Fixture | — | $24.99 | 496 | Currency-switch checks |
| AGENT-TEST Missions E2E Unit | AGENT-TEST-MSN-E2E-UNIT | $5.00 | In stock | Loyalty Missions E2E category |

All `AGENT-TEST-*` **Test Fixtures** (19 total, under Catalog → **Test Fixtures**, `/seed-test-fixtures`) share this description: *"used by the Virto Commerce QA suite... exercises catalog, cart, checkout and storefront rendering paths deterministically. Not a real merchandise item."* — these are the intended products for UCP test automation. A separate, larger `AGENT-TEST-*` family (162 results for a bare "AGENT-TEST" search) covers config/compare/conditional-variant fixtures for other test areas.

Catalog totals confirmed on B2B-store: **3,525 products** across categories including Test Fixtures (19), Printers (21), Home Appliances (326), Consumer Electronics (391), Office furniture (335), Phones and Accessories (446).

162 total products carry the "AGENT-TEST" prefix (config/compare/conditional-variant fixtures) for other test areas. Default to **AGENT-TEST-Printer All-in-One (PR-001)** for these UCP scenarios unless a scenario specifically needs configurable/variant behavior.

**Real search keywords confirmed via the storefront's autocomplete:** `printer` (28 results, surfaces the fixture directly), `AGENT-TEST` (162 results). Prior searches already on this account (autocomplete hints): `vintage hoodie`, `black hoodie`, `ASUS laptop` — useful as natural-language discovery phrasing for TS-06.

## B2C/B2V — Authenticated Consumer Handoff

### TS-01 — Happy path: search → cart → signed handoff

1. Sign in as a registered B2C consumer via Claude Code.
2. Ask Claude in natural language to find a specific product (e.g. "find me a printer" or "find the AGENT-TEST-Printer All-in-One", SKU PR-001, $179.99).
3. Ask Claude to add the item to a cart and prepare checkout.
4. Verify Claude assembles the cart via UCP and returns a signed `continue_url`.
5. Follow the `continue_url` into the merchant's Virto Storefront.

**Expected:** Storefront opens with the cart pre-populated (correct SKU, qty, price); user is recognized as authenticated without re-login; payment can be completed normally.

### TS-02 — Order attribution preserved through handoff

1. Complete TS-01 through payment.
2. Inspect the resulting order record.

**Expected:** Order is attributed to the originating Claude agent session (session/attribution metadata present and correct on the order).

### TS-03 — Multi-item cart via conversational refinement

1. Ask Claude to find a product, then iteratively refine ("show cheaper options", "add 2 more", "remove the first one").
2. Proceed to checkout handoff.

**Expected:** Final cart in the storefront exactly matches the last confirmed state of the conversation (items, quantities, variants).

### TS-04 — `continue_url` signature validity and expiry

1. Generate a `continue_url` via Claude.
2. Wait until any documented expiry window has elapsed (if one exists), then open the link.
3. Separately, open a valid (non-expired) link.

**Expected:** Valid link resumes the session correctly; expired/tampered link is rejected by the storefront with a clear error, not a silent failure or unauthenticated cart.

### TS-05 — Session resumes as the correct authenticated user

1. Complete TS-01 while signed in as User A.
2. Confirm the storefront session, once resumed, reflects User A's identity, saved addresses, and order history — not a guest or different user.

**Expected:** No identity leakage or cross-session mixing between the Claude session and the storefront session.

### TS-06 — Product discovery accuracy via UCP

1. Ask Claude for products using varied natural-language phrasing — real confirmed queries: "printer" (28 results), "AGENT-TEST" (162 results), and known recent-search phrasing on this account: "vintage hoodie", "black hoodie", "ASUS laptop".

**Expected:** Returned products match what UCP's catalog/search actually has; no hallucinated SKUs or prices Claude did not retrieve from UCP.

### TS-22 — Discovery against ordinary catalog content (non-fixture)

1. Ask Claude: "Find me a transparent-side computer case for a Mini-ITX build."
2. Add the returned item to the cart and hand off to checkout.

**Expected:** Claude's UCP discovery returns ZZAW C2 C2P M-ATX Computer Case Side Transparent MINI-ITX All Aluminum Desktop Office Small Chassis (SKU `COE05620`, $100.00) — an ordinary catalog listing, not an AGENT-TEST fixture. Cart shows 1× COE05620 at $100.00; `continue_url` resumes on B2B-store with that exact SKU, quantity and price. Confirms discovery works on real catalog content, not only purpose-built QA fixtures. Full walkthrough with expected values per step is in the **Computer/Office/Education Keywords** tab.

## B2B — Organization Contract Handoff

### TS-07 — Contract pricing applied to discovery and cart

1. Sign in as a B2B buyer with an org account that has contract pricing.
2. Ask Claude to find AGENT-TEST-Tier-Priced-Fixture (SKU QA-TIER-001), built specifically for tiered/contract pricing checks, and note the price shown ($29.99 as John Mitchell / AGENT-TEST-Org-AcmeCorp on B2B-store) — compare against the same SKU's price for a non-org/consumer session.
3. Add it to the cart and hand off to checkout.

**Expected:** Price Claude shows, the price in the assembled UCP cart, and the price shown on storefront resume are all the org's contracted price — never list price.

### TS-08 — Assortment restricted to org's catalog

1. As the same B2B buyer, ask Claude for a product that exists in the platform catalog but is outside this org's assigned assortment.

**Expected:** Claude does not surface or allow adding an out-of-assortment item; response clearly indicates it's unavailable to this org rather than silently substituting or erroring vaguely.

### TS-09 — Storefront resumes session as the organization

1. Complete cart assembly with Claude and follow the `continue_url`.

**Expected:** Storefront opens already scoped to the buyer's organization (org name/context visible), not as an individual guest or consumer account.

### TS-10 — Approval rules honored on handoff

1. As a buyer whose org requires approval above a spend threshold, build a cart via Claude that exceeds the threshold.
2. Complete handoff to storefront.

**Expected:** Storefront correctly triggers the org's approval workflow on this order; the cart is not silently auto-approved because it originated from Claude.

### TS-11 — Existing payment terms (PO / invoice) honored

1. As a B2B buyer whose org has PO or invoice payment terms configured, complete a cart handoff.
2. Proceed to the payment step in storefront.

**Expected:** PO/invoice options are available and pre-selected/available exactly as they would be for a manually-built cart; Claude-originated carts are not forced into card-only payment.

### TS-12 — Multiple buyers, same organization

1. Two different authenticated users belonging to the same org each build separate carts via Claude and hand off.

**Expected:** Each handoff resumes as its own user's session under the shared org context; no cart or identity bleed between the two buyers.

### TS-13 — Org-level approval rule blocks over-limit self-checkout

1. A buyer without approval authority attempts, via Claude, to push an over-limit order straight through to payment.

**Expected:** Storefront enforces the block/approval step regardless of how the cart was assembled.

## Negative & Edge Cases

### TS-14 — Unauthenticated user attempts checkout

1. Without signing in, ask Claude to find a product and prepare checkout.

**Expected:** Claude requires sign-in before assembling a cart tied to a user identity; no `continue_url` is issued for an unauthenticated session (or it resumes only as an anonymous/guest cart if that's the intended fallback — confirm which is correct per spec).

### TS-15 — `continue_url` reused after checkout completion

1. Complete a purchase using a valid `continue_url`.
2. Reopen the same `continue_url`.

**Expected:** Link is rejected or resumes to a "no longer valid" state — it cannot be replayed to reopen or re-trigger the same cart/order.

### TS-16 — Tampered/forged `continue_url`

1. Take a valid `continue_url` and modify a parameter (cart id, user id, signature).

**Expected:** Storefront rejects the tampered link; no cart is exposed and no fallback silently trusts the altered value.

### TS-17 — Product goes out of stock between Claude assembly and storefront resume

1. Have Claude assemble a cart with AGENT-TEST-Low-Stock-Fixture (SKU QA-LOW-001, deterministic stock of 5).
2. Before opening `continue_url`, drive the fixture's live stock below the cart quantity (e.g. via a separate order against the same SKU).
3. Open the `continue_url`.

**Expected:** Storefront surfaces the stock conflict clearly (e.g. adjusts quantity or flags unavailable) rather than allowing checkout on stock that no longer exists.

### TS-18 — B2B buyer loses org membership before handoff

1. Build a cart as a B2B buyer under org contract pricing.
2. Revoke the buyer's org membership before they open `continue_url`.

**Expected:** Storefront does not resume the session under stale org pricing/permissions; buyer is re-evaluated under their current (non-org or new) status.

### TS-19 — Session timeout between Claude interaction and handoff

1. Assemble a cart via Claude, then wait past the authenticated session's normal timeout window before opening `continue_url`.

**Expected:** User is prompted to re-authenticate rather than the storefront silently trusting an expired session.

### TS-20 — Claude cannot fulfill part of a request via UCP

1. Ask Claude for a mix of items, some fulfillable via UCP and some not (e.g. unsupported product type, region-restricted item).

**Expected:** Claude clearly communicates which items could not be added rather than silently dropping them or fabricating a cart entry.

### TS-21 — Cross-organization / cross-user handoff attempt

1. Generate a `continue_url` as User A.
2. Attempt to open it while authenticated as User B in the storefront.

**Expected:** Storefront refuses to resume User A's cart under User B's session; no cross-account cart or pricing leakage.

## Scenario Summary Matrix

| ID | Scenario | Flow | Priority |
| --- | --- | --- | --- |
| TS-01 | Happy path: search → cart → signed handoff | B2C | High |
| TS-02 | Order attribution preserved through handoff | B2C | High |
| TS-03 | Multi-item cart via conversational refinement | B2C | Medium |
| TS-04 | `continue_url` signature validity and expiry | B2C | High |
| TS-05 | Session resumes as the correct authenticated user | B2C | High |
| TS-06 | Product discovery accuracy via UCP | B2C | Medium |
| TS-22 | Discovery against ordinary catalog content (non-fixture) | B2C | Medium |
| TS-07 | Contract pricing applied to discovery and cart | B2B | High |
| TS-08 | Assortment restricted to org's catalog | B2B | High |
| TS-09 | Storefront resumes session as the organization | B2B | High |
| TS-10 | Approval rules honored on handoff | B2B | High |
| TS-11 | Existing payment terms (PO/invoice) honored | B2B | High |
| TS-12 | Multiple buyers, same organization | B2B | Medium |
| TS-13 | Org-level approval rule blocks over-limit self-checkout | B2B | High |
| TS-14 | Unauthenticated user attempts checkout | Negative | High |
| TS-15 | `continue_url` reused after checkout completion | Negative | High |
| TS-16 | Tampered/forged `continue_url` | Negative | High |
| TS-17 | Product goes out of stock before handoff | Negative | Medium |
| TS-18 | B2B buyer loses org membership before handoff | Negative | Medium |
| TS-19 | Session timeout between Claude interaction and handoff | Negative | Medium |
| TS-20 | Claude cannot fulfill part of a request via UCP | Negative | Medium |
| TS-21 | Cross-organization / cross-user handoff attempt | Negative | High |
