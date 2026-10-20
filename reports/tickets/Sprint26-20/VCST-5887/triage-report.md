# Triage — VCST-5887 checklist (ticket mode)

**Date:** 2026-10-14 · **Env:** vcptcore_qa1 · **Source:** `testing-checklist.md` (lanes A, B, 3x, 4v)
**Non-passing rows:** 6 (5 FAIL · 1 BLOCKED) · **Advisory:** 4 (B22, B23, A7 + 4v UX) · **Real bugs:** 1 distinct · **Spec/test defects:** 2 · **Dismissed:** 1
`--fix` ignored in ticket mode (the checklist's single writer is the /qa-test run). Defect 3 below was not separately re-investigated: 6 live observations across two lanes + source (`logger.prod.ts`) — deviation from `--verify`, stated.

## 1. Confirmed real bugs

| Rows | Severity | Provenance | Repo | Root cause | Package |
|---|---|---|---|---|---|
| B3, B4, A4 (+ C1 PNCR-002/003/027, 3x) | High | IN-SCOPE | vc-module-punchout (+ vc-frontend) | the requisition is built from the `default` cart, not the cart the buyer sees and validates; no cart id in the mutation | `investigation/defect-1-wrong-cart/` |

## 2. Spec / test defects

| Row | CLASS | Resolution |
|---|---|---|
| B21 | spec claim vs build (P3, author decision) | the guide promises the errorCode in the browser console; production `Logger.error` is a no-op — either log with `console.error` (vc-frontend) or correct the guide |
| B9 | ASSERTION_DEFECT | Total 239.98 = storefront Total = Σ line extendedPrice, as the guide defines it; my expected value (Σ printed UnitPrice × qty) was a {HYPOTHESIS}. Author question: an ERP that recomputes lines sees 1 cent less (sub-cent placed price 79.992 from `roundAmountPerItem=false`, pre-existing) |

## 3. Dismissed

| Row | CLASS | Reason |
|---|---|---|
| A10 | ENV | New-super shares the B2B-store storefront host on qa1 |

## Out-of-scope candidates (pre-existing, not triaged here — need their own check)

Configurable price on the product page (125 $) ≠ cart/cXML (116 $) (B20) · header badge wraps at 375 px (4v) · cart page reads one cart while the auto `AddOrUpdateCartShipment` writes `default` (defect-1 package) · desktop "Price per item" shows list price, mobile shows placed (B) · checkboxes labelled "Toggle vendor select" (B, a11y Low).

No tracker ticket filed, no fix triggered — human decides.
