# Smoke Test Report — SMOKE-2026-05-08-1300

## Verdict: GO

| Field | Value |
|-------|-------|
| Run ID | SMOKE-2026-05-08-1300 |
| Date | 2026-05-08 |
| Environment | virtostart (staging) |
| Storefront | https://virtostart-demo-store.govirto.com |
| Backend | https://virtostart-demo-admin.govirto.com |
| Store | B2B-store |
| Track | A — storefront only (per `/qa-smoke storefront virtostart`) |
| Browser | playwright-firefox (Chrome was open → fallback per spec) |
| Started | 2026-05-08T13:05:16Z |
| Ended | 2026-05-08T13:14:30Z |
| Duration | ~9 minutes |
| TEST_ENV | virtostart |

## Summary

**12/12 PASS, 0 FAIL, 0 ENV_DATA, 0 BLOCKED.**

This is the first smoke run against virtostart after the per-environment `.env` split. It validates two things at once: (a) the layered loader correctly resolves URLs and per-env credentials when `TEST_ENV=virtostart`, and (b) the storefront's core flows are functional on staging.

## Track A — Storefront Results

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| SMK-001 | Homepage — Load and Hero Navigation | PASS | "Demo - Home" title, all nav/lang/currency selectors present |
| SMK-002 | Registration — Personal Account | PASS | New email registered, redirected to `/successful-registration`. Legacy T&C checkbox no longer rendered (form schema changed; not a regression) |
| SMK-003 | Registration — Organization Account | PASS | Company-account flow with `organizationName` field works |
| SMK-004 | Authentication — Sign In Personal Account | PASS | `mutykovaelena@mail.com` / `TestPass123!` resolved via layered loader, session established, Dashboard link replaced Sign-in |
| SMK-005 | Authentication — Sign In B2B Org User | PASS | `ricreyacrouyi-3425@yopmail.com` / `Password1!` → redirected to `/company/members`, 39 members visible |
| SMK-006 | Search — Returns Relevant Results | PASS | `kitchen` → 18 results, prices formatted `$xx.xx` with 2 decimals (BL-PRICE-003) |
| SMK-007 | Catalog — Category Browse to PDP | PASS | Sports → "Washington Nationals Coroplast Yard Sign" PDP at $111.00. B2B store has no "Add to Cart" button by design (per `feedback_qty_stepper_as_add_to_cart`) — quantity stepper IS the add-to-cart entry |
| SMK-008 | Add to Cart — Single Product from PDP | PASS | Decrease button correctly disabled at qty=0 (BL-CART-001); increment to 1 added item; cart badge advanced |
| SMK-009 | Quantity Stepper — Increment and Cart Sync | PASS | 1 → 2 increment, 2 → 1 decrement; no duplicate line items (BL-CART-007) |
| SMK-010 | Cart — View Items and Update Quantity | PASS | Line-total math: 2 × $14.50 = $29.00 exact (BL-PRICE-008 no floating-point drift) |
| SMK-011 | Cart — Remove Item and Verify Total | PASS | Item count 4 → 3, removed product not in DOM, remaining items unaffected |
| SMK-012 | Checkout — Address and Shipping Method | PASS | Pickup/Shipping radios present, "Place order" correctly disabled until address finalized (BL-CHK-001 / BL-CHK-005). Did not place an actual order (out of SMK-012 scope) |

## Test Data Gaps on Virtostart

**None encountered in this run.**

The pre-flight worry that virtostart wouldn't have the right seed data didn't materialize for the 12-case smoke scope:
- Both `USER_EMAIL` and `MULTI_ORG_USER_EMAIL` accounts exist on virtostart and authenticated successfully
- The agent-user-pool fallback to `USER_EMAIL`/`USER_PASSWORD` worked as designed
- `@td(CFG_TSHIRT)` was not exercised by these 12 cases (it lives in suite 072, not 042)
- Search "kitchen" returned real results

## Bugs Found

**None.** Zero functional regressions observed.

## Console Noise (Environmental, Not Bugs)

4–5 CSP errors per page, all from external vendors not on the storefront's CSP allowlist:
- `js.monitor.azure.com/scripts/b/ai.config.1.cfg.json` — Azure App Insights config
- `dc.services.visualstudio.com/v2/track` — App Insights telemetry endpoint
- `cdn.jsdelivr.net/npm/micromark*` — loaded by `cdn.useproductguide.com/pg.js`

**Zero JS errors from `govirto.com` domain.** These do not block the GO verdict.

## What This Run Proves

1. **Layered env loader works end-to-end on a real environment switch.** `TEST_ENV=virtostart npm run env:check` resolves cleanly, and per-env credentials promote correctly (`USER_PASSWORD_VIRTOSTART` → `USER_PASSWORD` for the staging account).
2. **Storefront core flows on virtostart match vcst behavior.** Same business logic invariants pass (BL-PRICE-003, BL-PRICE-008, BL-CART-001, BL-CART-007, BL-CHK-001, BL-CHK-005).
3. **The branch `chore/env-split-per-environment` is regression-clean against a different env.** The split itself didn't introduce any storefront-side issues.

## What This Run Does NOT Prove

- **Track B (admin/backend)** was not run (`/qa-smoke storefront virtostart` requested storefront only). Admin SPA + GraphQL + API + Modules health on virtostart still untested through this branch.
- **Configurable products / payment / heavier flows** beyond the 12 smoke cases. Suites 039 (CyberSource payment), 072 (configurable products), 049 (Platform API) on virtostart would need their own dedicated runs.
- **Long-tail @td() resolution on virtostart.** Many regression suites reference vcst-specific aliases (the validator already flagged 8 unrelated pre-existing issues on `main`).

## Artifacts

- JSON results: [reports/regression/SMOKE-2026-05-08-1300/suite-01-trackA-results.json](suite-01-trackA-results.json)
- Browser session evidence: `test-results/firefox/` (per-step screenshots and snapshots from the agent's playwright-firefox session)

## Recommendation

**Branch is ready to commit.** The env split refactor doesn't break storefront smoke on either vcst (verified during Phase 1) or virtostart (this run). When the user is ready to harden virtostart for full regression, the gaps are predictable: fill in `OOS_SKU`/`LOW_STOCK_SKU`/`PACK_SIZE_SKU`/`CONFIGURABLE_SKU`/`VALID_COUPON_CODE` in `.env.virtostart` and seed the corresponding products via `/qa-seed-data`.
