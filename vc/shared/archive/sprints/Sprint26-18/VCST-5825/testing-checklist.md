# VCST-5825 — Verification checklist

**Flow** verify-fix · **Verdict VERIFIED (PASS)** · 2026-09-08
**Build** theme `2.57.0-pr-2471-6ed5-6ed5dc1b` — vc-frontend PR #2471, **open/unmerged**, prerelease-deployed to vcst-qa. Confirmed live from the storefront footer and the served bundle.
**Env** vcst-qa storefront · account `LOYALTY_VIP_USER` · `playwright-chrome`

> This ticket was closed as *not a defect* on 2026-08-28 and later reopened and routed to test. It was therefore verified against the fix that actually shipped, not against that recommendation.

## Fix

`useMissionCard.ts` `presentOrderValue()` now passes `target` alongside `sum`, and `progress_spend` gained a `{target}` placeholder in **all 14 locales**. Confirmed in the served `/assets/missions-BcSxYGbV.js`:
`function Ks(a){const t=a.targetMoneyValue?.formattedAmount??"",c=(a.percentage??0)>=100?t:a.currentMoneyValue?.formattedAmount??"";…progressParams:{sum:c,target:t}}`

Two sibling clamps rode along: `presentOrderCount` → `current: Math.min(currentValue, target)`, and `view.percent` → `Math.min(rounded, 100)`.

## Phase B (GREEN) — STR, 3 reads

`AGENT-TEST-MSN-ORDERVALUE` was on **page 3 of 3**, not page 2 as the ticket states — the list now holds 34 missions across 3 pages.

1. `$0.00 of $109.50 spent` — en-US
2. `$0.00 of $109.50 spent` — en-US, fresh load
3. `0,00 $ von 109,50 $ ausgegeben` — de-DE

Target present and non-empty in all three. Asserted on **shape**, not on figures (`.claude/rules/test-data.md` — never assert exact prices). `$0.00` rather than the ticket's `$30.00` is just this seed's state. Every other order-value card renders the same shape: `$0.00 of $366.50 spent`, `$0.00 of $97.25 spent`, `$0.00 of $7,200.00 spent`, `$0.00 of $12.00 spent`.

**Locale half verified on a second language** — German renders `von … ausgegeben` and `0 von 2 Bestellungen` with correct de-DE number/currency formatting, so the change is live across the locale files rather than only `en.json`.

## Checklist

| # | Item | Verdict |
|---|---|---|
| 1 | Card states `{sum} of {target} spent`, 3/3 | **PASS** |
| 2 | Target non-empty on every order-value card | **PASS** — 5 cards |
| 3 | Locale change live beyond `en.json` | **PASS** — de-DE |
| 4 | Order-count card `current` ≤ `target` | **PASS — but not exercised**, see below |
| 5 | No card shows > 100% | **PASS — but not exercised**, see below |
| 6 | Order-value modal `MISSION TARGET` panel un-regressed | **PASS** — `Spend $109.50 in qualifying orders` / `$0.00 of $109.50 spent` / `0%` |
| 7 | No new console errors | **PASS** — 0 |
| 8 | No 4xx/5xx; no GraphQL `errors[]` inside a 200 | **PASS** |
| 9 | BL-UI-004 content boundary at 1920 px | **PASS** — longest strings (`$0.00 of $7,200.00 spent`, German equivalent) stay inside their card |
| 10 | Adjacent surface: pagination, 3 modal types, cart | **PASS** |

## Items 4 and 5 are PASS-but-UNPROVEN — stated rather than left blank

All 34 live missions were pulled from the responses and checked programmatically: **none has `percentage > 100` and none has `currentValue > targetValue`** (highest percentage anywhere is 50%). So `Math.min(...)` is **never engaged**, and the `percentage >= 100 ? target : current` spend branch cannot be observed. No violation was seen — but the clamps are confirmed only in bundle source. Producing a ≥100% mission needs a real order plus progress recalculation, out of proportion to a verification pass.

One adjacent probe *is* discriminating: the Canon mission carries a genuine per-item overshoot (`currentQuantity: 36, targetQuantity: 1`) and the modal renders a green `✓ Buy at least 1` rather than leaking "36 of 1" — no overshoot escapes into the item UI.

## Not filed (below severity floor)

- **Low** · out-of-scope · language-dropdown options carry the wrong flag `alt`, so each option announces the currently-selected locale instead of its own (WCAG 4.1.2).
- **Low** · out-of-scope · two indistinguishable "English" entries (en-US and en-GB, same label and flag).

## Observation, not filed

German main navigation renders only `Alle Produkte`; the 15 en-US category menuitems are absent. **Could not be proven wrong from the storefront** — whether the `de` store menu is configured is a back-office fact not checked. Reported as an observation per the check-back-office-before-filing rule.

## Coverage

`MSNF-077` (Draft) already asserts exactly this behaviour — "card states the spend target, not only the amount spent". It should now pass; promote via `/qa-test-lifecycle`.
