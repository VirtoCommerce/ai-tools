# Mission date badge collapses three designed states into two — amber for every live mission, red from 10 days out instead of the designed threshold — **P2**

## Status: CONFIRMED (from source + design spec)
**Found by:** `/qa-design VCST-5346` (2026-08-28)
**Tracker:** **VCST-5910** (standalone Bug — the live ticket). Was VCST-5832, a Subtask of VCST-5346, now **Cancelled** and superseded by the VCST-5910 clone; do not route work at 5832.
**Archetype:** `BOUNDARY`

**Env:** vcst-qa @ Theme `2.57.0-pr-2396-5924`, store `B2B-store`, chrome, signed in. Confirmed against `vc-frontend` PR #2396 source.

## Summary
`client-app/modules/loyalty/composables/useMissionCard.ts`:

```ts
/** Below this many days left the date indicator turns red (unless the mission is completed). */
const DATE_DANGER_DAYS = 10;

function resolveDateSeverity(mission, daysLeft) {
  if (isCompleted(mission)) return "success";
  if (daysLeft !== null && daysLeft < DATE_DANGER_DAYS) return "danger";
  return "warning";
}
```

Two defects in one function:

1. **The threshold disagrees with the design.** The approved design renders **8 days left as `warning`** — declared twice, on Frame 1's second card and in the Frame 3 SKU-modal header — and 4 days as `danger`. Code turns red below 10, so an 8-day mission renders red.
2. **`success` is unreachable for a live mission.** It is returned only when `status === Completed`, so *every* non-completed mission is amber regardless of how much time is left: 91 days and 180 days both render the same warning badge as a mission with 10. The design's Frame 6 shows **"30 days left" with `success-500`**, a state the code cannot produce. The badge therefore carries no urgency signal at all until it flips to red.

Compounded by the token collision (sibling report): on a red-primary tenant the `danger` badge is the same colour as the progress bar, so red is not distinctive either.

## STR
1. Sign in as the loyalty-missions fixture account, go to `/account/missions`.
2. Read the date badge colour on `AGENT-TEST-MSN-ENDING-SOON` (5 days) → red.
3. Read it on any `active`-window mission (180 days) → amber.
4. Compare against design frames 1, 3 and 6 in the "E-commerce missions feature" project.

## Expected vs Actual
- **Expected:** three live states — comfortable (success), approaching (warning), urgent (danger) — with the designed boundaries.
- **Actual:** two — amber ≥ 10 days, red < 10 days; success only after completion.

## Recommended fix
Introduce the third band and align the boundary with the design (a `DATE_WARNING_DAYS` above which the badge is `success`, and a `DATE_DANGER_DAYS` matching the design's red threshold — which sits somewhere in (4, 8] and needs confirming with the designer, since the design declares only those two points).

## Notes — no fixture exists to demonstrate this live
`missions-specs.mjs` `WINDOWS` offers 180 / 5 / null / expired days; nothing in the 6–90 range, so the discriminating band is unreachable with current fixtures. That is why this is filed on **source + spec** evidence rather than a screenshot. An 8-day fixture would sit 2 days from the boundary — exactly the `WINDOW_CLOCK_SLACK_DAYS = 2` margin the seeder's own comments warn against — and would decay out of the band within ~3 days, so it is a poor regression guard. Prefer a unit test on `resolveDateSeverity` in vc-frontend over a seeded fixture here.

## Refs
Design frames 1 / 3 / 6, project `e3742011-b4ef-4cd0-a419-722e09833d37` · full audit: `reports/tickets/Sprint26-17/VCST-5346/design-report.md` (N10, drift claim d)

---

## RE-VERIFIED — STILL OPEN, 2026-09-08 (`/qa-test VCST-5910`, verify-fix flow)

**Stays in `open/` — the fix did not land.** vc-frontend **PR #2471** is titled `fix(VCST-5910)` but touches **neither** defect. `resolveDateSeverity` and `DATE_DANGER_DAYS = 10` are byte-identical at the PR head, and the deployed bundle confirms it:

```js
// assets/missions-BcSxYGbV.js — live on vcst-qa @ theme 2.57.0-pr-2471-6ed5-6ed5dc1b
L="pages.account.missions.card", Us=10
function j(a){return a.status===G.Completed}
function Gs(a,t){return j(a)?"success":t!==null&&t<Us?"danger":"warning"}
```

**Defect 2 confirmed live:** across **31 cards / 3 pages, zero render `success`**. 180 d, 108 d, 21 d and 14 d all resolve to the same `warning rgb(252,158,0)`; only ≤7 d goes `danger rgb(222,49,49)`. Server cross-check: all 12 missions `status: "InProgress"`. Design Frame 6's "30 days left in success-500" remains unreachable.

**Defect 1 — boundary narrowed since this report was written.** The original note said nothing exists between 6–90 days. In fact page 3 carries non-fixture missions at **7, 14, 21 and 108** days, which brackets the live boundary to **(7, 14]**. Both the code threshold (10) and the design threshold (≤8) fall inside that bracket, so the discriminating band is exactly **8–9 days left** and no mission on this store sits there. The defect therefore still rests on source, not on a live observation — unchanged conclusion, sharper reason.

**What PR #2471 *did* change on this surface** — the progress-bar token, `bg-primary-500` → `bg-warning-500`, on both `mission-card` and `order-mission-modal` (both measured `rgb(252,158,0)` live). That is the *compounding* collision this report cross-references, i.e. the sibling VCST-5836 / VCST-5827 concern — not either defect here. **The token collision itself is NOT fixed**: `primary-500 #e52121` vs `danger-500 #de3131` are still 1.00:1 apart, so `BUG-storefront-primary-and-danger-tokens-collide.md` also stays open; only this one surface stopped exposing it.

**New, tightly-coupled a11y finding.** The `warning-500 #fc9e00` status dot measures **2.09:1** against white — below WCAG 1.4.11's 3:1 — while `danger-500` (4.58:1) and `success-500` (4.51:1) both pass. So defect 2 forces *every* long-window mission onto the one severity token that fails non-text contrast; fixing the ladder also fixes the contrast exposure. Additionally, on `AGENT-TEST-MSN-OPEN-ENDED` and "Target number of orders" the dot renders with **no adjacent date text at all**, making status colour-only (WCAG 1.4.1) — which is the case MSNF-017's own text-differentiator assertion does not cover.

**Regression-guard note:** a unit test on `resolveDateSeverity` remains the right guard. MSNF-017 / 053 / 056 assert `danger` on short-window missions, which the code produces **before and after**, so no existing case discriminates this defect.

Full record: `reports/tickets/Sprint26-18/VCST-5910/testing-checklist.md`.
