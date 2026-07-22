# Business Logic Proposals — /qa-review-bl 2026-07-22 (P0 batch)

> **These are drafts. They are NOT applied to `knowledge/oracles/business-logic.md`.**
> Promotion requires **explicit user approval per proposal**. Review, edit, approve individual
> entries, assign final `BL-*` IDs, then direct Claude to promote only the approved entries.
>
> Source: `/qa-review-bl all` run 2026-07-22, **P0-domain batch** (BL-PRICE, BL-CART, BL-CHK, BL-PAY,
> BL-AUTH, BL-B2B — 57 invariants). Audit trail: `reports/knowledge/BL-AUDIT-2026-07-22.md`.
> Everything here failed the strict 3-axis auto-apply bar — **almost always because the docs axis is
> silent** on an implementation/UX-mechanics detail (source + live agree), not because anything was
> contradicted. The four **Priority** items below are high-confidence and low-risk; the rest are re-run
> candidates.
>
> **✅ APPLIED 2026-07-22 (user-approved), wave 1:** `BL-GQL-001` (HTTP 200 not 400), `BL-PROFILE-001`
> (stale Origin footnote refreshed), `BL-ORD-005` (per-period-reset order numbers).
>
> **✅ APPLIED 2026-07-22 (user-approved), wave 2:** `BL-CART-001` (reject-not-auto-cap), `BL-CHK-003`
> (ZIP unconditional), `BL-CART-009` (reconciled single-slot coupon model — both preset + custom-input
> facets; the batch-1 "no preceding remove" claim was stale), `BL-ORD-009` (**resolved: BY-DESIGN
> correction, not a bug** — `Processing` is a settable `Order.Status` dictionary value; set is an
> env-configurable dictionary) + its `BL-B2B-004` parenthetical fix, and **new invariant `BL-CART-015`**
> (config items survive a Saved-for-Later round trip — promoted via the §1a `docs: N/A` allowance).
>
> **Also this session:** `reports/bugs/open/BUG-guest-checkout-card-gateway-no-payment.md` drafted for
> **PAY-001** (guest card-bypass reproduced — order placed with zero card data). `bl-audit-criteria.md`
> gained the §1a `docs: N/A` allowance. `lint-bl.ts` BLC-002 `PROPOSED-` false-positive fixed (prior commit).
>
> **Still pending / NOT applied:** `BL-ORD-011` (cart-level "Products in PTS" grouping confirmed live, but
> the order-**details**-page claim needs a Chrome/Edge checkout run — Firefox payment-dropdown quirk blocked
> it); the `BL-CART-018 → BL-CART-015` suite remap in `050b3` (CRL-GQL-100/101/124/125/127/128/129) is gated
> on those cases leaving `Draft` — do it via `/qa-review-tests suite 050b3 --fix`; and everything else below.

---

## Priority 1 — HIGH-CONFIDENCE DRIFT corrections (source + live proven; docs axis silent → 2/3, not auto-applied)

These three have concrete, agreeing source + live evidence that the **current oracle Rule text is wrong**.
Only the docs axis is missing (the behavior is a UI/validation mechanic the guides don't narrate). Recommend approving as body-only DRIFT edits.

### BL-CART-001 — Max quantity enforcement (correct the "auto-cap" fiction)
- **Problem:** current Rule offers "reject the input **or** cap it to available stock" as equally valid; source + live show **only the reject-with-message path exists** (no silent auto-cap branch).
- **Evidence:** Source `vc-module-x-cart CartLineItemValidator.ValidateMinMaxQuantity → CartErrorDescriber.ProductQtyChangedError`. Live: qty 500 on stock=48 → field keeps "500", Increase disabled, inline "Order from X to Y item(s)"; line unchanged until corrected.
- **Proposed Rule:** Per-product max quantity is enforced by available stock (inventory). Per-cart there is no global max unless configured. When a user enters a quantity exceeding available stock, the system **rejects** the input with an inline range message and does NOT add/update the line until corrected — there is no automatic silent cap to available stock.
- **Proposed Verify:** Enter quantity > stock → inline range-validation message, Increase control disables, cart line unchanged. Direct API `addItem` with qty > stock → validation error (quantity-changed), not a silently-capped success.
- **Proposed Violation signal:** Quantity silently capped to available stock without an error/message; OR quantity accepted exceeding stock without any validation signal; order placed for more units than inventory.

### BL-CART-009 — Coupon transition (replace the stale multi-card "CouponsSection" model)
- **Problem:** current Rule describes an automatic `removeCoupon`→`validateCoupon`→`addCoupon` sequencing across a multi-card "CouponsSection" widget. Source shows the current storefront is a **single read-only input slot**; `applyCoupon()` in `useCoupon.ts` calls only `validateCartCoupon`→`addCartCoupon` (no preceding remove), and the server `CartAggregate.AddCouponAsync` appends if-not-present (no dedupe/replace). The "CouponsSection" component name no longer exists in source.
- **Evidence:** Source `vc-frontend useCoupon.ts` (`firstCouponInCart = coupons?.[0]`, single slot) + `vc-module-x-cart CartAggregate.AddCouponAsync`. Live: applying a coupon makes the input `readonly` and replaces Apply with a single "Remove coupon" button — no path to type a second code while one is applied.
- **Proposed Rule:** The storefront cart coupon widget supports exactly one applied coupon at a time via a **single input slot with manual exclusivity**: once a coupon is applied its input becomes read-only and the only action is an explicit "Remove coupon" button — there is no UI path to submit a second code while one is applied, and no automatic system-initiated remove-then-add sequence. At the mutation layer, adding a coupon appends to the cart's coupon list if not already present; it does not itself clear a previously-applied coupon.
- **Proposed Verify:** Apply coupon A → `cart.coupons[]` has one entry, input read-only, only "Remove coupon" visible. Typing a different code into the read-only input → no-op. Click "Remove coupon" → input editable, `cart.coupons[]` empty. Only then can B apply.
- **Proposed Violation signal:** Two coupons applied simultaneously in the widget; input editable while a coupon is applied; a raw `addCoupon` with a second code yields two `cart.coupons[]` entries with no client guard.
- **Note:** supersedes the `reference_cart_coupon_sidebar_behavior` memory's multi-card framing for the storefront widget path.

### BL-CHK-003 — Address validation (ZIP is unconditional, not country-conditional)
- **Problem:** current Rule claims "countries without postal codes must not require ZIP." Source + live show ZIP/Postal code is **always required**; only State/Province is country-conditional.
- **Evidence:** Source `vc-frontend address-form.vue` — `postalCode: yup.string().trim().max(32).required()` (no country branch); `regionRules: .when("countryCode", { is: () => !!country.regions.length, then: required })` (correctly conditional). Live: Hong Kong (no real postal codes) still shows `ZIP / Postal code*` required and blocks Create until filled; State/Province correctly optional for HK/Albania, required for US.
- **Proposed edit (replace the ZIP sentence only; keep the rest):** ZIP/Postal code is required **unconditionally regardless of country** (`address-form.vue` `postalCode` yup schema has no country branch). Only State/Province is country-conditional: required when the selected country has one or more regions, hidden/optional otherwise. US requires state; the address is validated before the payment step.

---

## Priority 2 — CONTRADICTORY + candidate PRODUCT BUG (⚠️ P0-revenue)

### BL-PAY-001 — Client-side card validation does NOT gate guest orders
- **Contradiction:** docs say card entry is mandatory ("Fill in the bank card details, then Pay now"); source + live show a **guest** can complete an order via an `allowCartPayment` gateway with **zero card data entered**.
- **Evidence:** Source `vc-frontend place-order.vue` `isDisabled` — the card-finalization guard `canPayFromCart && !isCanFinalizePayment` is wrapped in `isAuthenticated.value &&`, so it is **skipped entirely for guests**. Live: guest selected "Bank card (Authorize.Net)"; no card form rendered, **zero** Authorize.Net requests; "Place order" was enabled and completed order `<order#>` with no card and no error.
- **Proposed oracle edit:** BROADEN the Rule so the gate must hold **regardless of authentication state (guest included)** — "…keeps the pay action disabled until every field is valid, for both authenticated and guest sessions."
- **⚠️ SEPARATE ACTION — candidate product bug (not filed here):** this is a live-reproducible, source-anchored **P0-revenue** gap (unpaid/ghost orders via a card gateway for guest checkout). Recommend running **`/qa-bug`** to reproduce + file. `/qa-review-bl` does not file tracker tickets.

---

## Priority 3 — DRIFT flags needing a second axis before a human edits the oracle (1 axis only)

### BL-AUTH-004 — Returning-customer address prefill may be config-gated
- **Docs (only axis this pass):** StorefrontUserGuide — prefill happens "If **Shipping address policy** is enabled in the Platform." The current Rule states prefill as **unconditional** for returning customers.
- **Follow-up:** confirm the "Shipping address policy" setting in source + live, then correct the Rule to note the config gate. Not asserted yet (1 axis).

### BL-B2B-003 — Quote lifecycle may have no "Expired" state
- **Docs (only axis this pass):** StorefrontUserGuide quote-status list = Draft / Processing / Proposal sent / Ordered / Declined / On hold — **no "Expired"**. The current Rule assumes a first-class "Expired" state + disabled "Convert to Order".
- **Follow-up:** check `vc-module-quote` status enum + `ExpirationDate` field (source) + a live expired-quote attempt. Could be a real contradiction (feature not as documented) or incomplete docs.

---

## Priority 4 — MISSING candidate (docs axis absent → human-gated)

### PROPOSED-BL-CART-015 — Configurable line-item data survives Saved-for-Later round-trip `[P1-data]`
*(Triggered by BLC-002: suites cite the non-existent `BL-CART-018`; next free id is 015. Do NOT auto-apply — docs axis absent.)*
- **Rule:** When a configurable line item is moved to Saved-for-Later (`moveToSavedForLater`) and later moved back (`moveFromSavedForLater`), its `configurationItems` (customText, selected productId/sectionId, files) MUST be preserved unchanged across both transitions, including for bulk multi-item moves in one call.
- **Verify:** Add a configurable item with a Text-section customText → `moveToSavedForLater` → `getSavedForLater` → assert `items[].configurationItems[].customText` matches → `moveFromSavedForLater` → assert the restored item's `configurationItems.customText` still matches.
- **Violation signal:** `configurationItems` null/absent after the move (schema supports the field, so absence = resolver/mapping regression); customText changed or lost on either leg.
- **Agents:** qa-backend-expert
- **Source:** vc-frontend `moveToSavedForLater`/`moveFromSavedForLaterMutation.graphql` (fullCart fragment); `graphql-schema.md` `LineItemType.configurationItems`; suites CRL-GQL-100/101/124/125 (currently Draft).
- **Step-4 note:** repoint CRL-GQL-100/101/124/125 (+ `029-cart-validation-persistence.csv`) `BL-CART-018`→`BL-CART-015` **only after** this entry is promoted.

---

## UNGROUNDED — re-run candidates (no contradiction found; simply < 3 axes this pass)

**High-confidence (strong source + live; only docs axis missing — same class as Priority-1, but Rule text is currently accurate so no edit needed, just a fresh docs axis to promote to CONFIRMED):**

| BL | Axes gathered | Note |
|----|---------------|------|
| BL-PRICE-003 | S+L | round-half-up 2dp; `DefaultMoneyRoundingPolicy.cs` + live 2-dp everywhere |
| BL-PRICE-008 | S+L | decimal (not float) money pipeline; live no penny drift |
| BL-CART-003 | S+L | coupon computed on already-discounted price (live: 10%×tier, not ×list) |
| BL-CART-007 | S+partial L | `FindExistingLineItemBeforeAdd` merge-not-duplicate; live only partial |
| BL-CHK-002 | S+L | double-submit UI guard synchronous; backend idempotency not probed |
| BL-AUTH-007 | S+L | logout popup-only; live click sequence confirmed |
| BL-AUTH-008 | S+L | self-impersonation → outcome (c), non-circular, live-confirmed |
| BL-AUTH-010 | L | impersonation banner persists across nav, live-confirmed |
| BL-AUTH-011 | S+L | "Back to operator" empty `user_id`, no sign-in round-trip, live-confirmed |
| BL-B2B-001 | L | org-switch cart isolation live-confirmed (11-org fixture) |
| BL-PRICE-007 | D+S | contract pricing (docs "Manage Contract Prices" + source); live not run |

**Insufficient coverage this pass (needs a dedicated re-run — GitHub rate-limit / disruptive-write / out-of-scope-flow):**

`BL-PRICE-005`, `BL-PRICE-006` (destructive — price-list delete unsafe on shared env), `BL-CART-002`, `BL-CART-004`, `BL-CART-005`, `BL-CART-008`, `BL-CART-010`, `BL-CART-011`, `BL-CART-012`, `BL-CART-013`, `BL-CART-014` (configurable-cart mutation semantics — needs GraphiQL session + fresh rate-limit window), `BL-CHK-004` (needs sandbox decline card), `BL-CHK-008` (source exact; low-priority live re-verify), `BL-PAY-003` (needs authed user + sandbox success card), `BL-AUTH-001`, `BL-AUTH-002`, `BL-AUTH-005`, `BL-AUTH-006`, `BL-AUTH-012`, `BL-AUTH-013`, `BL-B2B-002`, `BL-B2B-005` (check dashboard sidebar, not just top nav), `BL-B2B-007`, `BL-B2B-008`, `BL-B2B-009`, `BL-B2B-010`.

**No action (already handled):**
- `BL-AUTH-009` — P0-security; source reconfirmed the privilege-escalation gate is **still open on `dev`** this cycle; live not probed by the safety rule. Already tracked by `BUG-nested-impersonation-privilege-escalation.md`. Oracle entry left as-is.
- `BL-B2B-006` — superseded pointer to Domain 19 (BL-WL); not triangulated.

---

## Taxonomy mismatch — suites cite 14 BL families the oracle does not model (BLC-002)

The oracle models 20 domains; regression suites cite ~14 additional BL families it doesn't contain. This is the dominant deterministic signal (67 of 72 BLC-002). **Inventing these families is out of auto-apply scope** — each needs its own triangulation + a human call on whether it belongs in a *business-logic* oracle at all.

| Family | Count | Cited by (suite prefix) | Suggested disposition |
|--------|-------|-------------------------|------------------------|
| BL-CR-001..018 | 18 | REV-GQL/SF/ADM (reviews & ratings) | Model a Reviews/Ratings domain OR remap — reviews module is real |
| BL-CMS-001..011 | 11 | CMS-078..095 | Model a CMS/content domain OR remap to UI/SEO |
| BL-SEC-001..005 | 5 | SEC-PCI/AUTH/INPUT/SESSION/SENSITIVE | Decide if security is its own domain (overlaps AUTH/PAY) |
| BL-GA4-001..004 | 4 | GA-* (analytics) | GA4 is a critical revenue flow per CLAUDE.md — likely a real BL domain |
| BL-L10N-001..004 | 4 | L10N-* | Model i18n OR de-scope (is it business logic?) |
| BL-PERF-001..004 | 4 | PERF-* | Likely NOT business logic → thresholds live in `performance-thresholds.md`; de-scope cites |
| BL-COMPAT-001..004 | 4 | BROWSER-* | Likely NOT business logic → de-scope / `browser-quirks` |
| BL-API-001..004 | 4 | API-* (platform REST) | Overlaps CROSS/platform; decide domain |
| BL-STORE-001..004 | 4 | STORE-* (store settings) | Model store-config OR remap |
| BL-CFG-001,003,004 | 3 | CFG-E2E/CRX-GQL (configurable) | Many already under BL-CART-010..014 — likely remap |
| BL-PLAT-001,002,004 | 3 | PLAT-* | Overlaps AUTH/CROSS; decide |
| BL-B2C-003 | 1 | B2C-ORG-* | Likely remap → BL-B2B |
| BL-ORDER-001 | 1 | BSM-008/009/018 | **Naming drift** — oracle uses `BL-ORD`; remap cite to an existing BL-ORD-* |
| BL-PROMO-001 | 1 | BSM-014/040/070/081/105 | **Naming drift** — remap → BL-PRICE (coupon/discount) or a marketing domain |

**Near-miss overflow inside existing domains:** `BL-CART-018` → proposed `BL-CART-015` (above); `BL-ORD-011` (non-P0, deferred — MCO-* cite; candidate MISSING or remap); `BL-PAY-005/006` (non-existent — PAY-SEC/EDGE/DECLINE cites; candidate MISSING or remap).

**Sequence gaps (BLL-005):** `BL-PAY-002` and `BL-LOY-011` — confirmed absent, jumps 001→003 / 010→012. Treat as **deliberately-retired IDs**; do NOT backfill synthetic entries.

---

## Coverage gaps (BLC-004) — for `/qa-test-lifecycle` Phase 3, not fixable here

32 invariants have **no** test-case `Business_Rule` reference. P0-batch ones: `BL-CART-009`, `BL-CHK-007`, `BL-CHK-008`, `BL-AUTH-008`, `BL-B2B-003`, `BL-B2B-004`. Full list in `BL-AUDIT-2026-07-22.md`.

---

---

# Batch 2 — non-P0 core domains (CAT, SRCH, ORD, SHIP, LOY, BOPIS · 52 invariants)

Same run, second batch. Auto-applied: **5 Source-anchor refreshes** (SRCH-001, SRCH-002, ORD-001, SHIP-001, BOPIS-003 — CONFIRMED 3/3, Rule unchanged), **0 Rule-text changes**. Everything below routes here.

## Priority 1 — DRIFT (source + live proven; docs axis absent → not auto-applied)

### BL-ORD-005 — Order numbers reset per period (not globally sequential)  ⟵ TOP
- **Problem:** current Rule reads as global sequential numbering. Source + live prove the counter **resets daily by default**.
- **Evidence:** Source `vc-module-core CounterOptions.cs` default `ResetCounterType.Daily` + `SequenceNumberGeneratorService.ShouldResetCounter` (UTC day boundary). Live: order list `CO260722-0000{1,2}`, `CO260720-0000{1,2}`, `CO260719-0000{1,2,3}` — counter restarts at `00001` each calendar day. (Docs axis = the module's shipped settings-description localization — a source artifact, not VirtoOZ; treated as absent for consistency, but it's a near-miss → quick to approve.)
- **Proposed Rule:** Every order receives a unique number from the store-configurable `Order.CustomerOrderNewNumberTemplate` (default `CO{date:yyMMdd}-{counter:D5}`, reset type `Daily` by default — configurable `None`/`Weekly`/`Monthly`/`Yearly`). The counter resets each period, so sequential numbering is guaranteed only **within the active reset period**; cross-period uniqueness comes from the date component, not the counter. Numbers are never reused within a reset period (even after cancellation) and are immutable after creation.
- **Proposed Verify:** 3 same-day orders → shared date prefix, incrementing `-00001/-00002/-00003`. Cancel the middle → next same-day order continues (no reuse). New day → counter resets to `00001` under the new date prefix (expected, not a bug).
- **Proposed Violation signal:** duplicate numbers *within* a reset period; counter fails to reset at the configured boundary; number changes after creation.

## Priority 2 — CONTRADICTORY (1 axis; human decides) — cross-implicates a P0-confirmed invariant

### BL-ORD-009 — `Processing` appears to be a SETTABLE order status
- **Contradiction:** the Rule states 7 settable statuses with `Processing` **read-only/excluded**. Live: the order-status dropdown exposed **8** options *including* `Processing` (Cancelled, Completed, Custom, New, Payment required, Pending, Processing, Ready for pickup).
- **Only live gathered this pass.** Needs docs (Settings → Order Statuses dictionary) + source (`CustomerOrderStatus` seed) to resolve whether `Processing` became settable in a recent release or the "read-only" claim was always wrong.
- **⚠️ Cross-flag:** `BL-B2B-004` (CONFIRMED in the P0 batch) asserts "…plus **read-only** Processing." If `Processing` is settable, B2B-004's parenthetical is also stale. Resolve both together; do not edit B2B-004 until this is settled (its confirmed point was the *no-native-approval-workflow* claim, which is unaffected).

## Priority 3 — suspected DRIFT (docs + source agree; live absent → not auto-applied)

- **BL-CAT-001** — out-of-stock UX is a **"Notify me when in stock"** subscribe flow (real `client-app/modules/back-in-stock/` module + StorefrontUserGuide back-in-stock docs), not merely a disabled button / "Sold out" label. Broaden the Rule pending a live zero-stock observation.
- **BL-CAT-003 / BL-SRCH-003** — default reindex is **event-based (near-immediate)**; time-based polling is **disabled by default** (PlatformDeveloperGuide + `ModuleConstants.EventBasedIndexation=true`). The Rule's fixed "30–60s poll window" framing is stale — rephrase to event-driven latency (SRCH-003's BL-CROSS-009 120s ceiling stays a valid upper bound).
- **BL-SHIP-003** (wording refinement) — "free shipping above a threshold" is a **Marketing-module promotion** (subtotal condition + shipping reward), not a first-class Shipping setting. Clarify the mechanism; behavior itself is not contradicted.

## Priority 4 — MISSING candidate (docs + live absent → human-gated)

### PROPOSED-BL-ORD-011 — Multi-currency order line-item display
*(Already cited correctly as `PROPOSED-BL-ORD-011` in 4 suite rows; next free id = BL-ORD-011.)*
- **Rule:** For a multi-currency order, the storefront order-details page renders primary-currency line items in the main list and groups other-currency lines (e.g. loyalty-points redemption) under a distinct "Products in {currency}" heading; the Admin order-items blade shows a per-line Currency column so a multi-currency order stays readable.
- **Source:** vc-frontend `core/utilities/orders/index.ts` `getDisplayTotals`; VCST-5104; vc-module-x-order#43. **Docs + live pending.**

## LOY (Mixed Cart) — strong live, docs STRUCTURALLY absent → proposals (see policy note)

The entire BL-LOY domain is a **project-specific extension (VCST-5101 / Epic VCST-5099)** with **no official VirtoCommerce documentation** — its docs axis is structurally empty regardless of effort, so nothing here can clear the strict 3-axis bar. All were **live-confirmed** and are accurate as written (no drift):

| BL | Live evidence (confirms Rule as-is) |
|----|--------------------------------------|
| BL-LOY-001 | 5%-off coupon discounted USD subtotal only (−$1.10 = 5%×$22); PTS block untouched (PTS0.00) |
| BL-LOY-003 | Order Summary rendered two separate per-currency total blocks (USD + "Total in PTS") |
| BL-LOY-004 | selected-for-checkout PTS line stayed out of the promo base |
| BL-LOY-006 | USD→EUR base switch: PTS line preserved unchanged, no line lost/duplicated |
| BL-LOY-010 | points-only cart blocked with "add a regular product" message; cleared on re-adding a cash line |

- **BL-LOY-011:** confirmed a **deliberately-reserved** `PROPOSED-BL-LOY-011` (noted inside BL-LOY-010's body) — not orphaned/retired. No action.
- **Not observed this pass** (need order placement / Admin nav): BL-LOY-002, 005, 007, 008, 009, 012, 013, 014.

## BOPIS — strong partial (2/3) → proposals

- **BL-BOPIS-001, 004, 006** — UX/docs confirmed live (cart-level pickup toggle; PDP view vs cart-select split; pickup/shipping mutually exclusive), API-shape/source clauses not re-verified.
- **BL-BOPIS-007** — source + live agree exactly (no-results store-selector keeps the map panel large, fixed 240px sidebar); **docs structurally N/A** (project-specific regression fix VCST-4518). See policy note.
- **Not observed this pass:** BL-BOPIS-002, 005, 008.

## Batch-2 UNGROUNDED "not reconfirmed" (no contradiction; re-run)

`BL-CAT-002/004/005/006/007/008/009/010/011/012` (several strong source-only: CAT-009 cascade `CategoryService.DeleteAsync`, CAT-010 exact permission-name match, CAT-011 `ProductMover`/`CategoryMover` verbatim), `BL-SRCH-004` (storeId mandatory), `BL-SRCH-005` (XSS input escaped — docs+live agree, source absent), `BL-ORD-002/003/004/006/008` (ORD-008: Changes grid columns `Type/Login/Details/Time` vs the Rule's 4 discrete fields — re-check on a *populated* order, not drift off an empty grid), `BL-SHIP-002/004`. `BL-ORD-010` left as-is (promoted 2026-06-23).

## Tooling defect (found this batch — recommend fix, not applied)

`scripts/knowledge/lint-bl.ts` **BLC-002 spuriously flags `PROPOSED-` forward-references** as "false traceability." Grep-confirmed: `BL-ORD-011` is cited **only** as `PROPOSED-BL-ORD-011` (proper not-yet-promoted convention) in 4 suite rows, `lint-bl.ts` has **zero** `PROPOSED-` handling, yet it's flagged. Fix: BLC-002 should skip any cite carrying the `PROPOSED-` prefix. This inflates the BLC-002 count (also implicates some `BL-SEC-*`). Suites also carry legit `PROPOSED-BL-{CROSS-013, QUOTE-001..004, RTN-001, SEC-001}` forward-refs.

## Policy note for the skill maintainers (recurring across both batches)

The strict "**all three axes present + agree**" bar structurally blocks auto-apply for two invariant classes that source+live (or docs+live) prove cleanly: (1) **implementation/UX-mechanics** invariants VirtoOZ doesn't narrate (rounding, money-type, coupon-slot UX, quantity-reject, ZIP-required, order-number reset, facet mechanics), and (2) **project-specific extensions** with no upstream doc surface at all (the whole BL-LOY Mixed-Cart domain, BOPIS-007). Net auto-apply across 109 audited invariants = **0 Rule changes, 12 Source-anchor refreshes**. Candidate criteria refinement (human decision): allow `source + live` (2 strong axes) with an explicit `docs: N/A — implementation-detail | project-specific` tag to count as confirmed for non-user-facing invariants. Flagged, not acted on.

---

# Batch 3 — final non-P0 (CROSS, PROFILE, GQL, IMPEX, NOTIF, UI, WL, SEO · 40 invariants)

Completes the full 149-invariant sweep. Auto-applied: **2 Source-anchor refreshes** (NOTIF-001 added; WL-001 already stamped 2026-07-02 → recorded only), **0 Rule-text changes**.

## Priority 1 — DRIFT (source + live proven; docs axis absent/N-A → not auto-applied)

### BL-GQL-001 — GraphQL returns HTTP 200 uniformly, not HTTP 400 for validation errors  ⟵ factual error in current Rule
- **Problem:** the Rule states validation/parse failures return **HTTP 400**. Source + live show **HTTP 200 uniformly** (errors in `errors[]`).
- **Evidence:** Source `vc-module-x-api GraphQLHttpMiddlewareWithLogs` (no status-code override) + `AuthorizationError : ExecutionError` (error → `extensions.code`, not an HTTP throw). Live: `{ nonExistentField }` → HTTP 200, `errors[0].extensions.code=FIELDS_ON_CORRECT_TYPE`; anonymous `orders` → HTTP 200, `code=Unauthorized`, `data.orders=null`.
- **Proposed Rule fix:** both validation/parse failures AND execution/resolver errors return **HTTP 200** with `errors[]` populated (no distinct 400 status on this platform); the server never returns 5xx for client-side errors.

### BL-PROFILE-001 — `Origin` footnote is stale (claims a fixed bug is still broken)
- **Problem:** the `Origin` footnote (2026-04-24) still says Organization-path write-dedup is "❌ broken" and `checkDuplicateAddress` "❌ always false." Current `dev` source shows **both fixed** via a unified `MemberAggregateRootBase.IsDuplicateAddress` shared by Contact + Organization (no per-type override); the read path delegates to the same method. The Rule/Verify text itself is accurate — only the footnote's bug-status is wrong.
- **Evidence:** Source `vc-module-profile-experience-api MemberAggregateRootBase.cs` (comparer + `IsDuplicateAddress`), `CheckDuplicateAddressQueryHandler.cs`, `OrganizationAggregate.cs`/`ContactAggregate.cs` (no override). Live: Contact-path byte-identical address silently skipped (table stayed 1 row).
- **Proposed edit:** replace the stale `Origin` footnote with the "both defects fixed via shared base aggregate; live-reconfirmed on the Contact path" wording (full text in the agent return). HIGH priority — the current footnote actively misleads agents into treating a fixed path as buggy.

## Priority 2 — suspected DRIFT (drift-lean; 1–2 axes)

- **BL-CROSS-009** — the "120 s (2 reindex cycles)" framing assumes a polling cadence, but event-based reindex is the **default** (immediate); time-based poll is disabled by default. Same finding as **BL-CAT-003 / BL-SRCH-003** — resolve the three together: reframe to event-driven latency; keep 120 s as a valid upper bound.
- **BL-IMPEX-004** — possible **over-claim**: source shows file-level/format validation messages but **no** per-row batch messages and **no** dry-run mode. Re-scope the Rule (don't retire without a 3rd axis).

## Strong 2/3 near-misses (evidence agrees; one axis missing → fast-track re-verify, likely CONFIRM)

| BL | Present axes | Missing | Note |
|----|--------------|---------|------|
| BL-GQL-004 | Source+Live (exact) | Docs | soft-gate `me` (nulls) vs hard-gate `orders` (Unauthorized) |
| BL-CROSS-012 | Docs+Source (2 repos) | Live (destructive) | zero-price purchase block (`CheckPricePolicy => ActualPrice != 0`) |
| BL-IMPEX-002 | Docs+Source | Live | export = Hangfire job + ExportNotification + blob URL |
| BL-IMPEX-003 | Source (strong) | Docs+Live | partial-success + `MaxErrorsCountThreshold` abort |
| BL-SEO-002 | Docs+Live (exact) | Source | soft-404: nonexistent slug → HTTP 200 + 404 page |
| BL-SEO-001 | Docs+Source (exact) | Live | duplicate-slug detection (`ISeoDuplicatesDetector`, Debug SEO Links) |
| BL-SEO-003 | Source (exact) | Docs+Live | og:url set, no canonical (`useCategorySeo.ts`) |
| BL-UI-002 | Docs+Source (exact) | Live (JS-blocked) | tailwind spacing scale (4.5/17/18/19) byte-match |
| BL-WL-002/003/004/006 | Docs+Source (exact) | Live (admin-mutation) | per-field org-preferred merge; master switch + record `IsEnabled`; footer fallback naming; logo/favicon filetype allow-lists |

## Policy-note classes (structurally cannot reach 3/3 under the current bar)

- **BL-GQL-002** — a QA-authored **perf SLA baseline**, not documented/implemented platform behavior → treat as a **"live-only" evidence type**, not routed to proposals indefinitely.
- **BL-UI-001..006** — QA-authored **layout/CLS/a11y methodology** invariants (emergent correctness properties, not a single enforced function) VirtoOZ/source don't codify. BL-UI-003/005/006 were **live-confirmed** (no hover shift; row-height parity; sub-44px touch targets exactly as the Rule predicts) but lack docs+source. Same "docs: N/A" class as the whole BL-LOY domain (batch 2).

## Batch-3 UNGROUNDED "not reconfirmed" (no contradiction; re-run)

`BL-CROSS-001/002/003/005/006/007/010/011` (live needs destructive/multi-step actions unsafe on the shared env; CROSS-006 has strong docs — public store settings read per-request, no restart), `BL-CROSS-004/008` (**partial live preserved** — currency-switch exclusion; org-switch swapped ship-to/orders/nav for 3 of 6 contexts), `BL-GQL-003`, `BL-IMPEX-001` (docs-strong), `BL-NOTIF-002/003` (NOTIF-003 P0 can't safely fault-inject → carve-out), `BL-SEO-004`, `BL-WL-005`.

## Notes (batch 3)

- **Security caution (good):** the UI/WL/SEO agent **declined an Admin login** because it couldn't confirm `--secrets` redaction was active for its browser session — so several WL/SEO live axes are intentionally absent rather than risk exposing the admin password. Aligns with `feedback_never_write_tokens_to_disk`.
- **BL-CROSS-008 side-finding:** the org dashboard "Monthly spend report" widget showed **identical figures across two different orgs** — outside the BL's 6 listed contexts (so not a rule violation), but a candidate **non-org-scoped dashboard-stat** bug for a future exploratory pass.

## Application Notes

- To promote a Priority-1/2/4 item: approve it, then direct Claude to apply the body-only edit + `- **Amended:** <date> (approved from bl-proposals-2026-07-22)` stamp.
- **Process finding for the skill maintainers:** the strict "docs axis required" bar blocks auto-apply of source+live-proven **implementation-detail** invariants (rounding, money type, coupon-slot UX, quantity-reject, ZIP-required) that VirtoOZ simply doesn't narrate. Net auto-apply this P0 batch = **0 Rule changes**, only 7 Source-anchor refreshes. Candidate criteria refinement (human decision): allow `source + live` with an explicit `docs-not-applicable (implementation detail)` tag to count as confirmed for non-user-facing invariants. Not acted on — flagged only.
