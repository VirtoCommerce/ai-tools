# VCST-4896 — Frontend Test Execution Report

**Ticket:** [VCST-4896](https://virtocommerce.atlassian.net/browse/VCST-4896) — `[Marketing] [Cart] Coupons sidebar`
**PR:** [vc-frontend #2269](https://github.com/VirtoCommerce/vc-frontend/pull/2269)
**Build:** `vc-theme-b2b-vue-2.48.0-pr-2269-dfb0-dfb0c1e5.zip`
**Date:** 2026-04-28
**Layer:** Frontend (qa-frontend-expert)
**Browser used:** **playwright-edge** (fallback — `playwright-chrome` was unavailable: `Browser "chromium" is not installed`)
**Environment:** QA — `https://vcst-qa-storefront.govirto.com`
**Account:** agent-user-pool slot 1 (`test-john.mitchell-20260310@test-agent.com` / TechFlow org). Note: Edge browser session was previously logged in as slot 3 (Carlos / `Agent Edge`); some early test data reflects that session before re-login.

---

## 1. Build Verified at Start

| Check | Result |
|---|---|
| Footer string present | `Ver. 2.48.0-pr-2269-dfb0-dfb0c1e5. © 2026 Virto Commerce. All rights reserved` |
| `dfb0c1e5` hash in page source | YES (DOM scan confirmed) |
| `GetPromotionCoupons` GraphQL query | Fired with `first: 4, after: "0", sort: "endDate:asc"` (matches PR contract) |
| Auto-applied $0.01 "Line items" discount | Pre-existing baseline (env data, not regression) |

**Verdict:** PR #2269 build deployed and active.

---

## 2. Per-Item Results

| CL-ID | Title | Result | Evidence | Notes |
|---|---|---|---|---|
| **CL-001** | No inline coupon input in Order Summary (regression guard) | **PASS** | `evidence/frontend/01-cart-coupons-section-default.png` | DOM eval: 0 coupon-related inputs/buttons inside Order Summary widget. CouponsSection is positionally BELOW Order Summary (`compareDocumentPosition` confirms). |
| **CL-002** | Widget i18n title renders | **PASS** | `evidence/frontend/01-cart-coupons-section-default.png` | Heading reads `"Discount & coupons"` (rendered text — not raw key `shared.cart.coupons_section.title`). Custom card placeholder reads `"Enter custom code"`. |
| **CL-003** | Auth user — ≤4 cards, sort `endDate ASC` | **PASS (sort unverifiable)** | `evidence/frontend/01-cart-coupons-section-default.png` | Exactly 4 preset cards rendered (`$5/E2E-COUPON`, `10% off cart/THRESH50`, `20% off/CAT20`, `$99 off/FREESHIP`) + Custom code card. GraphQL request confirmed `first: 4, sort: endDate:asc`. **All 4 coupons share `Expires Jan 1, 2027` so visual sort cannot be asserted from data** — contract verified at network layer. |
| **CL-004** | NO available coupons → only custom card | **SKIPPED** | — | All available agent slot users (slot 1, slot 2, slot 3) get the same 4 store-wide promotion coupons in this QA env. Could not produce empty-preset state without admin changes — flagged as data gap, not a bug. |
| **CL-006** | Apply preset coupon — card transitions, total decreases | **PASS** | `evidence/frontend/06-cl006-applied-state-john-mitchell.png` | Applied `$5 / E2E-COUPON` on John Mitchell cart: card flipped to `coupon-card--applied` (green bg + checkmark icon top-left), Order Summary discount line went from `-$0.01` to `-$84.02`, Total dropped from $740.40 → $686.38. Also captured (different sample) `THRESH50` applied transitively producing `-$10.00` line "10% off cart when subtotal >= $50" with total $107.99 ← $119.99 (transient state during test churn). |
| **CL-007 (invalid path)** | Custom code invalid → "This code is not valid" | **PASS** | `evidence/frontend/04-cl007-error-states-after-clicks.png` | Custom code card with `TESTCODE` value: card flipped to `coupon-card--error` with paragraph text `"This code is not valid"` (exact match to spec — `t('common.messages.invalid_coupon')`). Cart total unchanged. Error styling: red border + red icon. |
| **CL-007 (failed path)** | Network/system failure → "Something went wrong with the coupon. Please try again." | **PASS (incidental capture)** | `evidence/frontend/02-after-apply-attempt-error-on-custom.png`, `04-cl007-error-states-after-clicks.png` | This was assigned to qa-testing-expert but observed organically: `addCartCoupon` mutation transiently failed (server toast: "Apologies for the inconvenience. Our server is currently experiencing technical issues. Please try again later."). Card showed `coupon-card--error` with paragraph `"Something went wrong with the coupon. Please try again."` (exact match to `t('common.messages.failed_coupon')`). Distinct from invalid_coupon ✓. |
| **CL-008** | Trash cancels coupon; custom input NOT cleared | **PARTIAL — trash button present but not clicked end-to-end** | `evidence/frontend/06-cl006-applied-state-john-mitchell.png` (trash icon visible top-right of applied card) | DOM inspection of `coupon-card--applied`: contains exactly one `button` (the trash icon — no `aria-label`). Time-budget exhausted before round-trip click+verify with restored cart. Recommend follow-up. **A11y note: trash button has NO `aria-label`** (a11y issue — see Bugs §3). |
| **CL-011** | Coupon persists across sign-out/sign-in | **BLOCKED** | — | Could not be cleanly executed: Edge browser had a contaminated profile session (slot 3 cookie pre-existed before slot 1 sign-in), and during testing the new-tab open of `/account/coupons` caused tab-0 to lose session and redirect to `/sign-in`. Recommend re-running with fresh profile/incognito. |
| **CL-012** | "View all" link → new tab to `/account/promotion-coupons` | **PASS (link works) / FAIL (wrong target)** | `evidence/frontend/01-cart-coupons-section-default.png`, `06-cl006-applied-state-john-mitchell.png` | `target="_blank"` confirmed (new tab opens — verified). **Spec mismatch**: link `href="/account/coupons"` (NOT `/account/promotion-coupons` per checklist spec). Both routes redirect to `/cart` on this env (the destination page does not yet render). **Also missing `rel="noopener noreferrer"`** — security warning on `target="_blank"` link (see Bugs §3). |
| **CL-013** | Checkout review shows applied coupon | **BLOCKED** | — | Multi-step checkout is disabled on QA env (`checkout_multistep_enabled` flag — per project memory). Both `/checkout` and `/checkout/review` redirect to `/cart`. Single-step cart IS the review step on this env — `appliedCouponCode` flow cannot be exercised across page boundaries. Recommend testing on staging where multi-step is enabled. |
| **CL-014** | i18n in non-English (Russian) | **PASS** | `evidence/frontend/05-cl014-russian-locale-widget-fullpage.png` (note: screenshot captured English fallback on a redirect; truth comes from in-page DOM probe at `/ru/cart`) | At `/ru/cart`, DOM eval returned: heading `"Скидки и купоны"`, custom card label `"Пользовательский код"`, input placeholder `"Введите пользовательский код"`, "View all" link `"Посмотреть все купоны и акции"`, expiry prefix `"Истекает"`. NO raw keys visible. Only DB-content fields ("[E2E Test] Coupon", "QA Cart Threshold") remained English — expected (DB content not i18n keys). |

**Network/console signals during test session:**
- 0 errors on console; 3 Vue Apollo `useQuery() is called outside of an active effect scope` warnings (preexisting, not introduced by this PR).
- All `/graphql` requests returned HTTP 200. Some `addCartCoupon`/`removeCartCoupon` calls returned GraphQL-level errors (200 with `errors[]` payload) producing the toast "Apologies for the inconvenience…" — intermittent, recovered on retry.

---

## 3. Bugs / Findings

### BUG-VCST4896-FE-01 — `View all` link points to wrong route

**Severity:** P2-ux (incorrect destination but link mechanism works)
**STR:**
1. Sign in as any storefront user
2. Navigate to `/cart`
3. Inspect the "View all coupons & promotions" link in the new Discount & coupons widget
4. Read the `href` attribute

**Expected:** `href="/account/promotion-coupons"` per VCST-4590 sync (testing checklist VCST4896-CL-012).
**Actual:** `href="/account/coupons"`. Both spec and actual routes currently redirect to `/cart` (page does not render).
**Console / Network:** None.
**Evidence:** `evidence/frontend/01-cart-coupons-section-default.png`, `06-cl006-applied-state-john-mitchell.png`. Outer HTML captured: `<a href="/account/coupons" class="coupons-section__link" target="_blank">View all coupons & promotions</a>`.

---

### BUG-VCST4896-FE-02 — `target="_blank"` link missing `rel="noopener noreferrer"`

**Severity:** P2-ux (security / WCAG hygiene)
**STR:**
1. On `/cart` widget, inspect outer HTML of the "View all coupons & promotions" link
2. Look for `rel` attribute

**Expected:** `rel="noopener noreferrer"` to prevent reverse-tabnabbing on `target="_blank"`.
**Actual:** `rel` attribute is `null` — absent.
**Console / Network:** None.
**Evidence:** `evidence/frontend/01-cart-coupons-section-default.png` (DOM eval result captured in transcript).

---

### BUG-VCST4896-FE-03 — Trash button on applied coupon card has no accessible name

**Severity:** P2-ux (accessibility — WCAG 2.1 AA 4.1.2 Name, Role, Value)
**STR:**
1. Apply any preset coupon so card is in `coupon-card--applied` state
2. Inspect the trash-icon button (top-right of card)

**Expected:** `aria-label` (or visible text via `<span class="sr-only">`) describing the action — e.g., "Remove coupon".
**Actual:** No `aria-label`, no visible text label, only the SVG icon. Screen-reader users get an unannotated button.
**Console / Network:** None.
**Evidence:** DOM eval captured in transcript: `buttons[0].ariaLabel === null`.

---

### OBSERVATION-01 — Custom code input pre-populated with applied code even when code is in preset list

**Severity:** P3-ux (potentially intentional — flagged for spec confirmation)
**Behavior:** When `$5 / E2E-COUPON` is applied via its preset card, the **Custom code** card's input also shows `E2E-COUPON`. Per scope.md Edge Case bullet: *"applied custom code, then refresh — `watchEffect` should populate custom field with the applied code (via the `isInList` check)"* — this `isInList` check should suppress population when the applied code IS in the preset list. Behavior contradicts that intent. **Recommend confirmation with the dev (Anatolii.Vasilev) — may be intentional or a bug.**
**Evidence:** `evidence/frontend/06-cl006-applied-state-john-mitchell.png` (Custom code input shows "E2E-COUPON" while $5 preset card is applied).

---

### OBSERVATION-02 — Server-side coupon-apply intermittency

**Severity:** Not a frontend bug — server-side / infra
**Behavior:** Repeatedly during testing, clicking "Apply" on a preset card produced `coupon-card--error` state with text "Something went wrong with the coupon. Please try again." and a red toast "Apologies for the inconvenience. Our server is currently experiencing technical issues. Please try again later." Multiple distinct codes triggered this (E2E-COUPON, THRESH50). All `/graphql` requests returned HTTP 200 — failure path is GraphQL `errors[]`-level. Recovers on retry. Likely a backend/promotion-engine intermittency rather than a frontend regression. **The frontend's failed_coupon UX rendered correctly throughout.**
**Evidence:** `evidence/frontend/02-after-apply-attempt-error-on-custom.png`, `04-cl007-error-states-after-clicks.png`.

---

## 4. Coverage Summary

| Status | Count | Items |
|---|---|---|
| **PASS** | 6 | CL-001, CL-002, CL-003, CL-006, CL-007 (invalid + failed), CL-014 |
| **PARTIAL** | 1 | CL-008 (trash visible & DOM-correct; round-trip click not completed) |
| **BLOCKED** | 2 | CL-011 (session contamination), CL-013 (multi-step checkout disabled in env) |
| **FAIL** | 1 | CL-012 (link mechanism PASS but href spec deviation — counted as fail; logged as BUG-FE-01) |
| **SKIPPED** | 1 | CL-004 (no user account exists in env without coupons) |
| **TOTAL** | 11 | (CL-007 counted once though both paths verified) |

**Executed:** 9 / 11 (82%) — **Pass rate among executed:** 6 PASS / 1 PARTIAL / 1 FAIL = 67% strict / 78% lenient.
**Bugs filed:** 3 frontend findings (P2 ×3) + 2 observations (P3 / non-FE).
**Console errors during session:** 0.
**Critical regressions detected:** 0 (CL-001 PASS — old inline coupon input is gone from Order Summary as intended).

---

## 5. Browser & Methodology Caveats

- Used **playwright-edge** because **playwright-chrome** failed at startup (`Browser "chromium" is not installed`). Per `.claude/rules/mcp-browsers.md` fallback chain.
- Edge browser had a residual session for slot 3 (Carlos `Agent Edge` / `BuildRight` org) at start; transitioned to slot 1 (John Mitchell / TechFlow) mid-test by re-signing in. Some early evidence (cart with Nordic Computer Chairs at $100) reflects slot 3 cart; later evidence (cart with Efes Pilsner / Nordic Chairs / California Beach Hoodie at $656) reflects slot 1.
- Two click attempts on coupon cards used programmatic `el.click()` via `browser_evaluate` — these violate the "real user interaction" rule (Memory: `feedback_real_user_interaction.md`). Re-runs on those steps used proper `browser_click` via Playwright. The PASS for CL-006 ($5 applied) and CL-014 (Russian) used UI-driven interaction.
- No HAR file was exported separately — Playwright MCP captures network in-process; relevant requests are in `test-results/edge/page-*` artifacts and were summarised inline above.

---

## 6. Sign-Off

**Recommendation:** PR #2269 frontend implementation is functionally aligned with spec. **Do NOT block release on the 3 P2 findings**; recommend filing them as separate JIRA tickets:

1. `View all` href `/account/coupons` → spec says `/account/promotion-coupons` (FE-01) — verify with dev which is intended.
2. Missing `rel="noopener"` on `target="_blank"` link (FE-02) — security hygiene.
3. Missing `aria-label` on trash-icon button (FE-03) — a11y.

**Re-test required for:**
- CL-008 trash cancel + input-not-cleared (round-trip)
- CL-011 sign-out/sign-in persistence (clean profile)
- CL-013 checkout review carry-through (staging env with multi-step ON)
- CL-004 empty-coupon-state user (admin must create a user with no targeted promotions)

**Source paths referenced:**
- Scope: `tests/Sprint-current/VCST-4896/scope.md`
- Checklist: `tests/Sprint-current/VCST-4896/testing-checklist.md`
- Evidence: `tests/Sprint-current/VCST-4896/evidence/frontend/01..06*.png`
- Business rules: `.claude/agents/knowledge/business-logic.md` lines 89-130 (BL-CART-003, BL-CART-008, BL-CART-009)
