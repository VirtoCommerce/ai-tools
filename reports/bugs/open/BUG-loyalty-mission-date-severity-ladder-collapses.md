# Mission date badge collapses three designed states into two — amber for every live mission, red from 10 days out instead of the designed threshold — **P2**

## Status: CONFIRMED (from source + design spec)
**Found by:** `/qa-design VCST-5346` (2026-08-28)
**Tracker:** VCST-5832 (Subtask of VCST-5346)
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
