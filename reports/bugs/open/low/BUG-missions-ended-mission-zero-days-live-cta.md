# A mission past its end date still reads "0 days left" with a live "Open mission" button until the expiry sweep runs — **P3**

## Status: CONFIRMED (live: 3x, 4a, C1 REG-2026-10-01-1243)
**Found by:** agent — testing VCST-5957 (`/qa-test`, 2026-10-01)
**Tracker:** not filed — below the severity floor (Low). Named in the VCST-5957 QA comment. PO decision item (what an ended mission should look like).
**Archetype:** `BOUNDARY` · **Provenance:** PRE-EXISTING. The label and CTA are unchanged context in PR #2524; the server-side status flip only happens on the sweep.

**Env:** vcst-qa · Loyalty `3.1009.0-pr-18-4411` · theme `2.59.0-pr-2524-3069` · `@td(LOY_PERSONAL_NOORG)`, mission `@td(MSN_DL_EXPIRED)`.

## Summary
`loyaltyMissionProgress` keeps returning an ended mission as `InProgress` with `daysRemaining: 0`. `daysRemaining` is `Math.Ceiling(EndDate − UtcNow)` floored at 0, so a negative value reads as 0, and the status flips only when the expiry job runs (observed unswept more than 21 min after endDate). The storefront filters on status only, so the card shows "0 days left", a danger dot and an enabled "Open mission". The order modal also reads "0 days left". The customer is invited to work toward a mission that has already ended.

## STR
1. Have a Published mission whose endDate has just passed and that the sweep has not processed yet.
2. Open `/account/missions` and find the card.

## Expected vs Actual
- **Expected:** an ended state (no live CTA), or the mission excluded `{HYPOTHESIS}`; the source is a PO decision.
- **Actual:** "0 days left", danger dot, CTA enabled.

## Evidence
`reports/regression/REG-2026-10-01-1243/screenshots/MSNF-102-FAIL-zero-days-live-cta.png` · `reports/tickets/Sprint26-19/VCST-5957/screenshots/4a-ended-mission-due00-modal.png` · kb KB-26B8BE64, KB-813DD6AC.

## Fix Routing
Ambiguous between `VirtoCommerce/vc-module-loyalty` (filter or flip on `EndDate`, not only on the sweep) and `VirtoCommerce/vc-frontend` (render an ended state when `daysRemaining` is 0 and endDate has passed).
