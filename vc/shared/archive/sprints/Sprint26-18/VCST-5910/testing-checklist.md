# VCST-5910 — Verification checklist

**Flow** verify-fix · **Verdict FIX INCOMPLETE (FAIL) → REOPEN** · 2026-09-08
**Build** theme `2.57.0-pr-2471-6ed5-6ed5dc1b` — vc-frontend PR #2471 (`fix/VCST-5910-missions`), **open/unmerged**, prerelease-deployed. Confirmed live from the footer and the shipped `/assets/missions-BcSxYGbV.js`.
**Env** vcst-qa storefront · Chrome DevTools MCP

> **Identity deviation** — same as VCST-5831: the DevTools profile was signed out and the lane has no `--secrets`, so a throwaway account was minted via `/sign-up` (`AGENT-TEST-uiux-20260908111036@test-agent.com`, **needs manual cleanup**). Sound for this ticket because mission definitions are identity-independent (`AnyUserGroupCondition`), and the server payload was cross-checked. One item below genuinely needs a real fixture identity and is marked so.

## Headline

**The PR is titled `fix(VCST-5910)` but does not touch either defect this ticket reports.** `resolveDateSeverity` and `DATE_DANGER_DAYS = 10` are byte-identical at the PR head, and the deployed bundle confirms it:

```js
// assets/missions-BcSxYGbV.js — live on vcst-qa
L="pages.account.missions.card", Us=10
function j(a){return a.status===G.Completed}
function Gs(a,t){return j(a)?"success":t!==null&&t<Us?"danger":"warning"}
```

What the PR *did* change on this surface is the **progress-bar token** (`bg-primary-500` → `bg-warning-500`), which is the *compounding* colour collision the ticket mentions in passing — tracked as VCST-5836 / VCST-5827, not as either of this ticket's two defects.

## Phase A (RED) baseline

`screenshots/baseline-RED-from-ticket-attachment.png` — the ticket's own attachment, read this run: "108 days left" with an **amber** dot above a **red** progress bar. Both defect 2 and the collision in one frame.

## Phase B — all 31 cards, 3 pages

Badge is a `VcBadge` dot (10×10 px) in `.mission-card__meta`; the date text is always `neutral-600 rgb(82,82,82)`, so **severity is carried by the dot's background alone**.
Theme tokens: `warning-500 #fc9e00` · `danger-500 #de3131` · `success-500 #3e845b` · `primary-500 #e52121` (red-primary preset — the exact preset the ticket names).

| Days left | Missions | Badge | Computed background |
|---|---|---|---|
| 180 | 24 (AGENT-TEST fixtures) | `warning` | `rgb(252, 158, 0)` |
| 108 | Canon - EURO+USD pricelist | `warning` | `rgb(252, 158, 0)` |
| 21 | Mission #4 | `warning` | `rgb(252, 158, 0)` |
| 14 | Mission #3 | `warning` | `rgb(252, 158, 0)` |
| 7 | Mission #1 | `danger` | `rgb(222, 49, 49)` |
| 5 | AGENT-TEST-MSN-ENDING-SOON | `danger` | `rgb(222, 49, 49)` |
| null | 2 open-ended | `warning` | `rgb(252, 158, 0)` |

Server cross-check (`GetLoyaltyMissionProgress`, 200, no `errors[]`): `daysRemaining` 180 ×10, 5 ×1, null ×1; **all 12 `status: "InProgress"`**.

## Checklist

| # | Item | Verdict |
|---|---|---|
| 1 | **Defect 2** — `success` reachable for a live mission | **FAIL — still broken** |
| 2 | **Defect 1** — threshold matches the design | **NOT DIRECTLY OBSERVABLE**; source verdict = still broken |
| 3 | Progress bar now `warning-500` on card **and** order-modal | **PASS** — both `rgb(252, 158, 0)` |
| 4 | `__target-row` reflow | **PASS** — `flex-wrap: wrap; column-gap: 12px; row-gap: 4px` |
| 5 | Completed-mission bar still `success-500` | **NOT LIVE-OBSERVED** — needs a fixture identity |
| 6 | Danger badge vs progress bar distinguishable | **PASS** — collision resolved |
| 7 | No new console errors, no 4xx/5xx | **PASS** — 114 requests, zero 4xx/5xx |

**Item 1 — FAIL.** A 180-day mission renders `warning rgb(252,158,0)`, not `success #3e845b`. **Zero of 31 cards render `success` on any page**: 108, 180, 21 and 14 days all get the identical amber dot, so the badge carries no urgency gradient at all until it flips red. Design Frame 6's "30 days left in success-500" is unreachable, exactly as the ticket states.

**Item 2 — sharper than the ticket anticipated.** The ticket says nothing exists between 6–90 days, but page 3 carries non-fixture missions at **7, 14, 21 and 108** days. That brackets the live boundary to **(7, 14]** — danger at ≤7, warning at ≥14. Both the code threshold (10) and the design threshold (≤8) fit inside that bracket, so the discriminating band is exactly **8–9 days left**, and no mission on this store sits there. Verdict rests on the deployed source (`Us=10`) versus the design's 8-days-is-warning. Not guessed, not faked.

**Item 6 — the collision the fix does remove.** danger `rgb(222,49,49)` vs bar `rgb(252,158,0)` = **2.19:1** luminance plus a large hue separation → distinguishable. Pre-fix, danger-500 `#de3131` vs primary-500 `#e52121` = **1.00:1**, literally identical luminance. Caveat: at 0% progress the fill is 0 px wide, so visual adjacency was not observable with this identity; the token change is proven by computed style on both surfaces plus the deployed CSS.

## Reopen reasons

1. `DATE_DANGER_DAYS` is still `10`; the design declares 8 days = `warning`. The designed red threshold sits in (4, 8] and still needs confirming with the designer.
2. `success` is still gated on `status === Completed`, so it is unreachable for any live mission. The third band (a `DATE_WARNING_DAYS` above which the badge is `success`) was not added.

A **unit test on `resolveDateSeverity`** is the right regression guard — an 8-day fixture would sit 2 days from the boundary (inside the seeder's own `WINDOW_CLOCK_SLACK_DAYS = 2` margin) and decay out of band within ~3 days.

## A11y findings — standalone, do not fail this ticket

Per `triage.md` §7a these file at their real severity as standalone + related, and do not gate the verdict.

- **Medium** · `warning-500` dot vs white = **2.09:1** (WCAG 1.4.11 needs 3:1). `danger-500` 4.58:1 and `success-500` 4.51:1 both pass — **only the amber token fails**, and defect 2 forces every long-window mission onto precisely that token.
- **Medium** · On `AGENT-TEST-MSN-OPEN-ENDED` and "Target number of orders" the dot renders with **no adjacent date text at all** — status by colour alone (WCAG 1.4.1).
- **Medium** · BL-UI-001 CLS **0.5624 at 375 px** (`footer#footer` moves 577 px) and **0.2046 at 1280 px** on `/account/missions`; threshold 0.1. **Attribution: page shell, not PR #2471** — no shift source is a mission-card or modal element. Pre-existing.
- **Medium** · Quantity spinbutton exposes `aria-invalid="true"` untouched, `aria-valuenow="1"` while the input shows **0**, and `aria-valuemax="9007199254740992"` (WCAG 4.1.2). Pre-existing, UI-kit level.
- **Medium** · `vc-button` focus outline composites to `rgb(247,188,188)` = **1.63:1** vs white (needs 3:1). UI-kit-wide, pre-existing.

## Coverage gap

MSNF-017/053/056 assert `danger` on short-window missions, which the code produces **before and after** the fix — so **no existing case discriminates this defect**. A long-window-`success` case cannot be authored until the fix lands.
