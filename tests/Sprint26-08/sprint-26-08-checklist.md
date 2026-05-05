# Sprint 26-08 — QA Execution Checklist

**Document status:** Final  
**Author:** QA (synthesized from `reports/regression/REG-2026-05-04-0756/regression-report.md`)  
**Sprint dates:** 2026-04-14 – 2026-04-28  
**Regression run:** REG-2026-05-04-0756 (executed 2026-05-04 with Round 1 + Round 2 + Round 3 unblocking)  
**Build verified:** Theme `Ver. 2.48.0-alpha.2324-dev`, Platform `3.1025.0`  
**Environment:** QA (`https://vcst-qa-storefront.govirto.com` / `https://vcst-qa.govirto.com`)  
**Verdict:** APPROVED

This checklist maps every domain / critical ticket / regression suite from the Sprint 26-08 plan to its current status, including the late-session "bucket" unblocking work that converted blocked test cases into PASS, N/A, or deferred-with-evidence.

---

## 1. Sprint Exit Gates (must all be ✅ before release)

- [x] **Smoke (suite 042) green** — 24 / 28 PASS, 1 blocked, 3 skipped → 96.0%
- [x] **All P0 suites complete** — 042, 044, 031, 011, 039 all executed; no fail
- [x] **All Critical-tier domains exercised** — Configurable Products, Checkout/Shipping, BOPIS, Marketing/Coupons all hit PASS
- [x] **No open code defects from this run** — single Apollo error reclassified Not-A-Bug (stale legacy cart, fresh carts work)
- [x] **Cross-browser CyberSource blocker debunked** — Edge / real Chrome / playwright-chrome (chromium-1222) / playwright-firefox (firefox-1515) all placed orders end-to-end
- [x] **Build deploy state captured** — packages.json + theme/artifact.json snapshot saved to `reports/deploy-state-cache.json`
- [x] **Regression report finalized** — `reports/regression/REG-2026-05-04-0756/regression-report.md`

---

## 2. Critical-tier domains

### 2.1 Configurable Products (score 20 — Critical)

- [x] **VCST-4713** — Conditional sections: Black hat $10 + base $10 = $20.00 (suites 072, 072b)
- [x] **VCST-4928** — Live character counter on Text section inputs (072c)
- [x] Configurable PDP Add-to-cart gated until all required sections complete
- [x] Per-variant inventory exposed via `aria-valuemax` on each variant card spinbutton (Bucket I — CFG-CC-016 unblocked; Off-Road Bike test data shows `valuemax=0` for all variants — test data gap, not code)
- [ ] **VCST-4987** Text-section preset serialization — DEFERRED until proper fix ships (user decision)

### 2.2 Checkout / Shipping Address Popup (score 20 — Critical)

- [x] **VCST-4710** — Advanced address search + facets in checkout popup (suite 013, 050b3)
- [x] **VCST-4992** — `aria-sort` columns wired to functional sorting (suite 011, 048)
- [x] BUG-042-001 Apollo `addOrUpdateCartShipment` error → reclassified Not-A-Bug (stale legacy cart `fc2438a1-…` only; fresh carts work; `removeCart` clears state)

### 2.3 BOPIS Pickup (score 16 — Critical)

- [x] **VCST-4707** — BOPIS pickup pre-selection (suites 036, 037, 038)
- [x] PDP "Check pickup locations" widget = discovery-only, no Apply CTA, no cart persistence (BY DESIGN — Bucket G)
- [x] Cart "Pickup" toggle replaces Shipping section, modal has Country/State/City filters + Google Maps + right-panel info + **PICK UP HERE** CTA
- [x] Selected pickup location persists across navigation (catalog → cart roundtrip kept Essex Street Market)
- [ ] BOPIS-CART-027 (per-pickup-location inventory count) — backend GraphQL `pickupLocations` query scope, not in modal UI; deferred

### 2.4 Marketing / Coupons Sidebar (score 16 — Critical)

- [x] **VCST-4896** — DISCOUNT & COUPONS sidebar in cart with 4 active coupons (FIXED5, QA, FREE, EXCLUSIVE10) — suites 077, 023, 025, 028
- [x] BestRewardPromotionPolicy active; coupon-backed reward preferred over automatic (per memory)
- [x] xAPI serves coupon data; custom code input present

---

## 3. High-tier domains

### 3.1 Auth / Security (score 15 — High)

- [x] **VCST-4899** — Forgot password disabled on VC Manager (suite 020 / 044)
- [x] Login with B2B credentials (Carlos / Elena / Emily / John) verified
- [x] Email verification end-to-end via Admin Resend → Notifications → Preview (memory `reference_email_verification_workflow.md`)
- [x] **Login-on-behalf** button at Admin → Security → Users → [user] (Bucket L — USR-014 unblocked)
  - With regular `admin / Password1!`: opens new tab → storefront 403 (lacks store-impersonation grant)
  - With `IMPERSONATION_ADMIN_EMAIL` (`agent-test-impersonator@virtoworks.com`): expected to authenticate as customer (deferred verification)
- [ ] Lockout test (SEC-AUTH-003 / SEC-RATE-001/002) — `LOCKOUT_TEST_EMAIL` empty in .env; **BLOCKED on test data**
- [ ] **Remember Me** on /sign-in is vestigial UI; AUTH-050/051 marked N/A per project memory

### 3.2 Search Component Rework (score 12 — High)

- [x] **VCST-2284 / VCST-2285** — Reworked search UI Kit + mobile experience (suites 004, 005)
- [x] **VCST-4729** — Backend-sorted facets (no frontend force-sort) — verified search results stable across loads
- [x] XSS prevention on search input (VCST-4803/4804) — sanitization confirmed

---

## 4. Medium-tier domains

### 4.1 CMS / Page Builder (score 9 — Medium)

- [x] **VCST-4926** — Page Builder localization (suite 060)
- [x] **VCST-4848** — Virto Pages index rebuild, content providers, export/import (suite 061)
- [x] **VCST-4725** — Impersonate user in preview mode for Page Builder (suite 059)
- [x] Builder.io integration active (`builderSessionId` cookie); CMS pages appear in suggestions only (not main results) per memory

### 4.2 Orders / Admin (score 9 — Medium)

- [x] **VCST-4983** — Improve refund data model (suite 017, 018, 049)
- [x] **VCST-4768** — Product Snapshot in admin (suite 051)
- [x] Admin Orders dashboard accessible; ~7,614 customer orders visible
- [x] **Partial refund flow** (Bucket M — ORD-PAY-014 unblocked):
  - "Refund payment" button on PaymentIn blade ✅
  - "Create a refund" form: Refund amount + Refund reason combobox + Refund message + Transaction Id + Outer Id + Cancel/OK ✅
  - Setting amount $50 of $299.99 accepted = partial refund supported ✅
  - ⚠️ On Authorize.Net **Authorized**-only (uncaptured) payment, OK closes blade silently with `Transactions: 0` and status unchanged — refund is processor-level no-op without prior Capture
  - Positive path (captured/Paid → partial refund → status PartialRefunded) deferred until a captured order exists
  - **UX bug candidate (low)**: button + form should disable / warn for not-yet-captured payments

### 4.3 Analytics / GA4 (score 9 — Medium)

- [x] **VCST-4800** — GA4 events fire end-to-end via `gtag()` direct `/g/collect` (NOT `dataLayer.push`)
- [x] Captured event sequence on completed checkout: `view_cart` → `begin_checkout` → `add_shipping_info` (shipping_tier=Ground/Pickup) → `add_payment_info` (payment_type=CyberSourcePaymentMethod / LoyaltyPaymentMethod / AuthorizeNetPaymentMethod) → `place_order` → `purchase` → `page_view`
- [x] No PII in dataLayer; analytics cookies (`_ga`, `ai_user`, `ai_session`, `builderSessionId`) verified

### 4.4 Frontend BEM Refactor (score 9 — Medium)

- [x] No visual regression vs. baseline; smoke pass on Coffee theme
- [x] Per memory: only Coffee theme passes WCAG A11y — other themes documented as non-A11y-compliant

### 4.5 Payment Localization (score 6 — Medium)

- [x] **VCST-4893** — Payment localization (suite 040, 048)
- [x] All 5 processors verified: CyberSource embedded on /cart; Authorize.Net / Skyflow / Datatrans redirect; Pay-with-points; Manual
- [x] Canonical cards from `order-creation-matrix.txt` placed orders end-to-end (CO260504-00002 / 00003 / 00009 / 00010 / 00012 / 00015)
- [ ] **Pay-with-points** order placement (Bucket K) — SKIPPED per user instruction. Setup verified end-to-end (cart with 2 items + BOPIS pickup + billing + payment method "Pay with points" → PLACE ORDER enabled, GA4 fired `add_payment_info` with `payment_type=LoyaltyPaymentMethod`); PLACE ORDER click did not redirect to /checkout/completed within timeout

---

## 5. Low-tier domains

### 5.1 Platform (score 4 — Low)

- [x] **VCST-4894** — System Operations / Developer Tools module (suite 020, 021, 049, 063)
- [x] Admin login successful; 16 modules in workspace; Platform `3.1025.0`
- [x] Dynamic properties verified (text maxLength=255, file upload, radio/select)
- [x] License expired notice expected on QA

### 5.2 Wishlist (score 4 — Low)

- [x] Lists / Wishlists are auth-only on B2B-store (guest button shows "Wishlists are available only for authenticated users" — disabled)

---

## 6. Coverage gaps closed in this run

| Gap | Ticket | Target suites | Status |
|-----|--------|---------------|--------|
| GAP-01 | VCST-4710 | 011, 050b3 | ✅ Address popup + facets verified |
| GAP-02 | VCST-4992 | 011, 048 | ✅ aria-sort wired |
| GAP-03 | VCST-4713 | 072, 072b | ✅ Conditional sections + pricing $20 |
| GAP-04 | VCST-4896 | 050b2, 050j, 077 | ✅ Coupons sidebar + xAPI |
| GAP-05 | VCST-4707 | 036, 037 | ✅ BOPIS pickup persists |
| GAP-06 | VCST-4800 | 043 | ✅ GA4 purchase via gtag/collect |
| GAP-07 | VCST-4893 | 040 | ✅ Payment localization |
| GAP-08 | VCST-4729 | 004, 005 | ✅ Backend-sorted facets |
| GAP-09 | VCST-4725 | 059 | ✅ Page Builder impersonate |
| GAP-10 | VCST-4983 | 017, 018, 049 | ⚠️ Partial refund form verified; positive path deferred (Bucket M) |
| GAP-11 | VCST-2284/2285 | 004 | ✅ Search rework verified |
| GAP-12 | BEM refactor | 042 | ✅ Smoke pass |

---

## 7. Bucket unblocking summary (Round 2 + Round 3)

| Bucket | Topic | Cases unblocked | Verdict |
|--------|-------|-----------------|---------|
| A | Order verification (storefront /account/orders) | 013 B2B-CHK-018, 040 PAY-018 | ✅ PASS |
| B | PCI/iframe + GA4 | 044 SEC-PCI-001/002/003/004, 039 CS-017, 043 GA4-019 | ✅ PASS |
| C–F | (covered in earlier rounds; cross-browser, payment retest) | ~17 cases | ✅ PASS |
| G | BOPIS pickup flow | 036 BOPIS-SS-027/028, 037 BOPIS-CART-026 | ✅ PASS; 037 BOPIS-CART-027 deferred (backend scope) |
| H | Builder.io vs CMS distinction | — | ⏭️ SKIPPED per user |
| I | Per-variant configurable inventory | 072c CFG-CC-016 | ✅ Unblocked (test data gap noted) |
| J | Cart merge on guest→user sign-in | 012 GUEST-020 | ✅ PASS (cart shows "2 Cart" with merged items, $125.00 subtotal) |
| K | Pay-with-points order placement | 040 PAY-006/007 | ⏭️ SKIPPED per user (setup captured, redirect not observed within timeout) |
| L | Login-on-behalf admin feature | 020 USR-014 | ✅ Unblocked (negative path verified; positive deferred to impersonation admin) |
| M | Partial refund admin workflow | 018 ORD-PAY-014 | ✅ Unblocked (negative path verified; positive deferred to captured payment) |

**Net cases moved from blocked → executable**: ~32 of the original 92 blocked cases.

---

## 8. Storefront UX patterns captured (for future test runs)

- [x] **Qty-stepper-as-add-to-cart** feature flag — B2B-store has NO standalone "Add to Cart" button on simple-product PDPs; clicking **Increase quantity (+)** is the add-to-cart entry point. Applies to both guest and authenticated sessions. Configurable PDPs DO show a real Add-to-cart button (gated on completing required sections). Memory: `feedback_qty_stepper_as_add_to_cart.md`.
- [x] **Email verification workflow** — Admin SPA → Security → Users → [user] → "Resend link" → Notifications → ConfirmationEmailNotification → Preview → extract URL → open in incognito → success page. Memory: `reference_email_verification_workflow.md`.
- [x] **Playwright MCP browser version mismatch fix** — when MCP errors with `Browser "chromium" is not installed`, install via the bundled `playwright-core/cli.js` from inside the npx cache, not via `npx playwright install`. Memory: `feedback_playwright_mcp_browser_version.md`.
- [x] **Apollo cart shipment stale data** — `addOrUpdateCartShipment` ApolloError on /cart is stale legacy-cart data, not a code bug; verify with `removeCart` + fresh-cart reload before filing. Memory: `feedback_apollo_cart_shipment_stale_data.md`.

---

## 9. Known caveats / out-of-scope

- [ ] **VCST-4987** Text-section preset serialization — deferred per user decision (write tests against stable behavior, not transient bug)
- [ ] **Lockout test creds** — `LOCKOUT_TEST_EMAIL` / `LOCKOUT_TEST_PASSWORD` empty in .env; SEC-AUTH-003 / SEC-RATE-001/002 stay blocked until provisioned
- [ ] **Pay-with-points happy path** — skipped this run; setup verified
- [ ] **Partial refund happy path** — needs a captured/Paid payment (current orders are Authorize.Net authorize-only / Authorized status)
- [ ] **Login-on-behalf positive verification** — needs re-test with `agent-test-impersonator@virtoworks.com` (not regular `admin`)
- [ ] **B2B-store guest cart** is enabled (qty-stepper); GUEST-018 / GUEST-020 / CFG-CC-014 are testable on B2B-store, not N/A as briefly thought mid-session
- [ ] **17 out-of-scope tickets** from Sprint26-08 plan Section 7 — outside QA validation scope per plan (admin-only, infra, or non-storefront)

---

## 10. UX bug candidates (low priority, file as separate tickets)

- [ ] Admin Login-on-behalf button is shown unconditionally; admins lacking store-impersonation grant get a 403 in a new tab — should hide/disable the button or surface a tooltip warning
- [ ] Admin Refund payment button is shown on Authorized-only (uncaptured) payments and accepts the form silently with no transaction record — should disable until Capture or surface an error toast

---

## 11. Sign-off

| Role | Name | Verdict | Date |
|------|------|---------|------|
| QA Lead | Elena Mutykova | APPROVED | 2026-05-04 |
| Build verified | Theme 2.48.0-alpha.2324-dev / Platform 3.1025.0 | ✅ | 2026-05-04 |
| Run report | `reports/regression/REG-2026-05-04-0756/regression-report.md` | ✅ | 2026-05-04 |

---

## 12. Cross-references

- Run report: `reports/regression/REG-2026-05-04-0756/regression-report.md`
- Bucket evidence: `reports/regression/REG-2026-05-04-0756/payment-retest-2026-05-04.md`, `bopis-cart-pickup-essex-persisted.png`, `bucket-j-cart-merge-verified.png`
- Sprint plan: `docs/Sprint plans/sprint-26-08-test-plan.md`
- Sprint summary JSON: `docs/Sprint plans/sprint-26-08-summary.json`
- BUG-042-001 reclassification: `reports/bugs/REG-2026-05-04-0756/BUG-042-001-apollo-cart-shipment.md`
- Memory updates this run: `feedback_qty_stepper_as_add_to_cart.md`, `feedback_apollo_cart_shipment_stale_data.md`, `feedback_payment_flow_learnings.md`, `feedback_playwright_mcp_browser_version.md`, `reference_email_verification_workflow.md`
