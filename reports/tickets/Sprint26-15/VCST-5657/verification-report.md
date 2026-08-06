# VCST-5657 — Fix Verification (execution)

**Ticket:** VCST-5657 · Bug · High · `[Agentic fix][Mixed cart] Place order is active if select only loyalty products`
**Verdict:** **VERIFIED WITH NOTES** — held at TESTED, not Done (see §Why not Done)
**Env:** vcst-qa @ Platform `3.1057.0-pr-3095-3abb`, Loyalty `3.1005.0-pr-15-838b`, Theme `2.55.0-pr-2422-1c98`, store `B2B-store` (Mixed Cart, loyalty enabled)
**Date:** 2026-08-05 · **Agents:** GraphQL runner (backend) + qa-frontend-expert / playwright-chrome (storefront)

## Summary

Both layers confirm the fix. Deselecting every cash line in a mixed cart now raises
`LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED`, the storefront renders the guard message and disables
PLACE ORDER, and re-selecting the cash line fully recovers. The original STR passed **3/3**
consecutive storefront runs and **10/10** backend assertions. No order was placed.

## RED → GREEN

Phase A baseline is **cited, not re-captured** — the fix was already deployed when this run started,
so live RED was impossible. Source: `reports/bugs/open/BUG-mixed-cart-pts-only-selection-not-blocked-VCST-5657.md`
(Loyalty `3.1004.0`, screenshots in `reports/bugs/screenshots/mixed-cart-pts-only-selection-not-blocked/`).

| State (cash line deselected, kept in cart) | Phase A — RED (Loyalty 3.1004.0) | Phase B — GREEN (Loyalty 3.1005.0-pr-15-838b) |
|---|---|---|
| `cart.validationErrors[]` | `[]` — guard silently absent | `["LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED"]` |
| Default-currency total | `$0.00` | `$0.00` (unchanged — correct) |
| Loyalty total | `PTS 6.00` | `PTS 66.00` (different fixture) |
| PLACE ORDER | **enabled**, order placeable | **disabled** |
| Warning shown | none (silent failure) | `Add a regular product to check out.` |

Root cause (PR [#15](https://github.com/VirtoCommerce/vc-module-loyalty/pull/15)): rule 2's
`hasCashProducts` read the selection-**blind** `cart.Items` while `hasPointProducts` came from the
selection-**aware** `cart.CartTotals`, so a deselected cash line kept the guard suppressed. The fix
sources both operands from `CartAggregate.SelectedLineItems`.

## Checklist — 10/10 PASS

| # | Item | Result |
|---|---|---|
| 1–3 | Original STR → fixed behaviour, runs 1 / 2 / 3 | PASS 3/3 |
| 4 | Root cause addressed — real `validationErrors[]`, sole entry, no masking error | PASS |
| 5 | Resolved i18n string, not a raw `common.messages.*` key | PASS |
| 6 | Warning in an accessible node — native `<output>` ⇒ implicit `role="status"` polite live region | PASS |
| 7 | Re-selecting the cash line clears the error and re-enables PLACE ORDER (no over-correction) | PASS |
| 8 | Normal mixed cart, both lines selected — no warning, PLACE ORDER enabled, `$406.80` | PASS |
| 9 | Removing the PTS line yields `ALL_LINE_ITEMS_UNSELECTED`, zero spurious loyalty errors | PASS |
| 10 | No new console JS errors; all cart mutations HTTP 200, `errors: null` (BL-LOY-010) | PASS |

**Backend `MCO-GQL-012` (075b): 10/10 assertions PASS.** Payment pinned to
`DefaultManualPaymentMethod` in request and response on every run, so
`LOYALTY_PAYMENT_METHOD_NOT_ALLOWED` never masked the result.

**Business rules verified:** BL-LOY-010 (restored, selection-scoped variant), BL-LOY-008 (unaffected).

## Why not Done

**PR #15 is still OPEN and unmerged.** vcst-qa runs a temporary prerelease pin —
`VirtoCommerce.Loyalty_3.1005.0-pr-15-838b.zip` as an `AzureBlob` entry in `vc-deploy-dev@vcst-qa`
`backend/packages.json`. If the env is repinned or the blob ages out, the fix disappears from QA.
Re-verify against a released artifact after merge before closing.

## Notes — pre-existing, none caused by PR #15

1. **A11y (Medium):** every line-item checkbox is labelled `"Toggle vendor select"`, identical to the
   vendor group's select-all. A screen-reader user cannot tell which product a checkbox controls —
   directly relevant here, since deselecting a specific line *is* the action under test. WCAG 1.3.1 / 2.4.6.
2. **UX (Low):** `ALL_LINE_ITEMS_UNSELECTED` renders no message at all — PLACE ORDER is disabled with
   no explanation. The storefront's error-code→i18n map covers the loyalty codes but not this one.
3. **Test-case (housekeeping):** the committed `MCO-E2E-008` Steps untick the cash line *before*
   setting delivery/payment, so it never establishes PLACE ORDER was enabled first. This run used the
   corrected ordering. Both `MCO-E2E-008` (083b) and `MCO-GQL-012` (075b) now pass and are eligible to
   leave `Automation_Status = Draft` and drop their `EXPECTED-RED until VCST-5657` notes.
4. **Fixture drift (carried over):** `LOYALTY_NOBAL_USER` (`AGENT-TEST-nobal@`) holds ~1,044 PTS, so
   insufficient-balance cases silently test nothing. Needs a re-seed. Also `MCO-GQL-007` was
   overwriting `Loyalty.Enable=false` store-wide on every run (fixed in the case; store restored).
5. **Behaviour change worth knowing:** storefront loyalty validation is now **pre-emptive** on `/cart`
   (inline message + disabled control) rather than a toast at placement. Older loyalty cases written
   against the toast expectation will false-FAIL.

## Evidence

- `evidence.html` — RED→GREEN page with the real GraphQL payloads
- `screenshots/MCO-E2E-008-*.png` (4 captures, this run)
- Backend payloads: `scripts/.graphql-evidence/MCO-GQL-012-1785931045837.json`
- HAR: `test-results/chrome/har/session.har` · raw payloads `test-results/chrome/vcst5657-run{1,2,3}-*.json`
