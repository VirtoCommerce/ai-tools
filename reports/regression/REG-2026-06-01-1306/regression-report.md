# Regression — REG-2026-06-01-1306

**Run:** REG-2026-06-01-1306 · 2026-06-01 · vcst-qa · playwright-chrome · selection `077` (marketing scope)
**Build:** Platform 3.1032.0, Theme 2.50.0-alpha.2359, Marketing 3.1003.0, MarketingExperienceApi 3.1001.0, XCart 3.1016.0
**Note:** Suite 077 contains **62 cases** (manifest `testCount` says 53 — manifest drift, see action items). Executed in 2 passes (part-1 truncated; part-2 covered the 26 unexecuted cases).

## Counts (62 cases) — incl. verify re-run

| Suite | Total | Pass | Fail | Blocked | Skip | Pass rate |
|-------|-------|------|------|---------|------|-----------|
| 077 Coupons & Promotions Storefront | 62 | 49 | 1* | 11 | 1 | 49/62 (79.0%) |

*The single remaining "fail" (CPN-044 GA4) is an unconfirmed candidate, not a confirmed defect. **0 confirmed product defects.**

**Quality Gate: PASS** — no confirmed Critical/High product defect. 1 unconfirmed Medium candidate (GA4). 11 cases blocked by fixture drift, not product issues.

**Verify re-run (2026-06-01):** after CPN-026 was rewritten to the correct two-step coupon contract, CPN-026 **PASS** (promotion POST 200 → coupons/add 204 → GET `hasCoupons=true` → search match) and CPN-033 **PASS** (full Admin→storefront→cart E2E, $5 discount math confirmed). Both cleaned up (4× 204 delete, 2× 404 verify). Results: `suite-077-results-verify.json`.

## Follow-up investigations (both REFUTED — no tickets)
- **CPN-033 Admin IsPublic toggle observation → REFUTED (artifact).** Clean second-source repro: UI sends `isPublic:true` on create POST → GET returns true; sends `isPublic:false` on edit PUT → GET returns false. Round-trips clean both directions. No UI-binding or backend defect; original symptom was a mid-interaction/adjacent-"Active"-toggle artifact. CPN-019 already guards this (asserts persistence after reload). Not filed.
- **CPN-044 GA4 `ep.coupon` → REFUTED → test rewritten.** vc-frontend `google-analytics/events.ts`: `viewCart()` intentionally omits coupon (matches GA4 `view_cart` schema); `beginCheckout()`/`addShippingInfo()`/`addPaymentInfo()`/`purchase()` attach `coupon`. Live wire confirmed `begin_checkout` carries `ep.coupon`. The case asserted the opposite — **rewritten** into a correct positive attribution test (begin_checkout must carry `ep.coupon`; view_cart must not). Not a bug.

## Test-case fixes applied this run
- **CPN-026** rewritten to the `/coupons/add` separate-entity contract — re-verified PASS.
- **CPN-044** rewritten to correct GA4 coupon-attribution expectations.
- **Manifest** `config/test-suites.json` suite 077 `testCount` 53 → 62.

## Failures — reviewed, neither is a confirmed product bug
- **CPN-026 (was High "REST coupons not persisting") → TEST-CASE DEFECT, not a product bug.** The test POSTs `/api/marketing/promotions` with an inline `coupons:[{code}]` body and expects it to persist. Verified against module source (`vc-module-marketing` `Promotion.cs` + `MarketingModulePromotionController.cs`): the `Promotion` model has **no `coupons` collection** — only a `HasCoupons` bool. Coupons are a separate entity created via `POST /api/marketing/promotions/coupons/add`. The body field is silently ignored by design. Reproducible symptom, wrong expectation. **Fix the test case** to use the coupons/add endpoint.
- **CPN-044 (Medium "GA4 ep.coupon absent in view_cart / begin_checkout") → UNCONFIRMED candidate.** GA4 events fire (204) but carry no `ep.coupon` after a coupon is applied. Captured twice. Could be a tracking gap OR by-design dataLayer scoping. Needs confirmation against the GoogleEcommerceAnalytics module behavior / GA4 spec before filing. Evidence: `CPN-044-FAIL-no-ep-coupon-in-ga4.png`.

## Bugs Found
None filed. **CPN-035** candidate (private coupon applied) was retracted in part-1 — `PRIVATE4590` is `isPublic=true` live (fixture drift). **BUG_077_001 / CPN-026** retracted here as a test-case error per source verification.

## Blocked (12) — fixture drift / data gaps, not product defects
- Part-1 (8): CPN-014 (no expired promo live), CPN-016 (no zero-coupon state), CPN-017 (`CULTURE_NAME` env undefined), CPN-020 & CPN-024 (no de-DE localized data seeded), CPN-027 & CPN-035 (PRIVATE4590 is public live), CPN-050 (live count 13 ≠ 14, single page).
- Part-2 (4): CPN-029 (no tier-priced product in catalog), CPN-032 (test queries `contentItems` root absent from live xAPI schema — schema reconciliation), CPN-033 (depends on CPN-026 — rewrite via coupons/add), CPN-L01 (`CAT20#%$$^…` promo isPublic=false live).

## Skipped (1)
- CPN-051 (skeleton/FOUC) — requires DevTools network throttle beyond real-user interaction.

## Action Items (not product bugs)
- **Test cases:** rewrite CPN-026 + CPN-033 to add coupons via `POST /api/marketing/promotions/coupons/add` (separate entity), not an inline promotion body field. Reconcile CPN-032 query root against `graphql-schema.md`.
- **Manifest:** `config/test-suites.json` suite 077 `testCount` 53 → 62.
- **Fixtures — DONE (`test-data/promotions/coupons.csv`, reconciled live 2026-06-01):** updated to live `promotionCoupons` values — COUPON_WELCOME code `AGENT`→`FREE`; live coupon ids refreshed for COUPON_10PCT/TOP20/SHIPPING/WELCOME/FIXED5/THRESH50/EXCLUSIVE; COUPON_TOP20 name → "Simple QA Coupon"; FIXED5 name → "QA Fixed Dollar Off"; COU-025 code `wine`→`wine-gift` (id-confirmed same coupon). All 171 `@td()` refs in suite 077 resolve (validator exit 0). Alias *mappings* in `aliases.json` were already correct — no change needed there.
- **Re-seed — DONE (2026-06-01, correct `/coupons/add` contract):** the "missing" coupons weren't absent — they existed but were non-visible (expired `endDate` on SUPER/WINE/super; `isPublic=false` on E2E-COUPON/FREESHIP/CAT20). All corrected; `promotionCoupons` total 13 → **19** with SUPER, E2E-COUPON, WINE, FREESHIP, CAT20(+special-chars), super now public. Special-chars code created (accepted). de-DE localized name/description set on the QA10OFF promotion (CPN-020/024). `coupons.csv` refreshed with live promotion ids + verification notes; 171/171 `@td()` resolve. The broken `setup-guide.md` contract was corrected (it taught the non-working inline `coupons[]` / `/{id}/coupons` patterns).
- **PRIVATE4590 "leak" → NOT a product bug (env data pollution).** It appeared in the public list because a **stray duplicate promotion** (`421c88eb`, named "PRIVATE4590") was `isPublic=true` — alongside the real private fixture (`6c2848f8`, isPublic=false). The `PromotionCouponsQueryHandler` correctly filters `IsPublic=true` + `OnlyActive=true` (verified in source). Flipped the duplicate to private → PRIVATE4590 now absent from `promotionCoupons` (CPN-027/035 unblocked). Recommend deleting accumulated duplicate test promotions (many codes have 2+ instances).
- **Still open (separate follow-ups):** tier-priced product for CPN-029 (Pricing module — deferred, out of marketing scope); FREESHIP `endDate` is 2026-06-08 (extend before then); de-DE round-trip uses field `localizedDisplayName` (not `localizedName`).
- **Env:** add `CULTURE_NAME` (blocks CPN-017).
- **Verify before filing:** confirm CPN-044 GA4 `ep.coupon` expectation against module behavior; file Medium bug only if confirmed.

## Artifacts
- Results: `suite-077-results.json` (part-1, 36 cases) · `suite-077-results-part2.json` (26 cases)
- Screenshots (gitignored): `CPN-035-FAIL-*.png` (non-bug), `CPN-044-FAIL-*.png` (candidate)
- HAR: `test-results/playwright-chrome/har/`
