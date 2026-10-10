# Return details of a colleague's return: the new "Requested by" label fails colour contrast (2.52:1) — **P3**

## Status: CONFIRMED — BELOW SEVERITY FLOOR (Low/P3): draft kept, NOT filed in the tracker
**Found by:** agent — testing VCST-5884
**Tracker:** none (below the 5-file floor Critical/High/Medium); named in the VCST-5884 QA-Complete comment under "Not filed (below severity floor)"
**Oracle:** WCAG 1.4.3 (>= 4.5:1); `BL-A11Y-003`. **Classification:** a `BL-A11Y-003` finding on a FEATURE ticket is filed as its own
STANDALONE ticket with a *related* link to VCST-5884 and does **not** fail the verdict (`.claude/skills/qa-test/triage.md` §7a).
**Provenance:** IN-SCOPE — the "Requested by" row is introduced by this ticket (`client-app/modules/returns/pages/return.vue:32-36`).
**Related, same defect class and page:** **VCST-6107** (Done) "Field labels on account pages fail colour contrast (2.52:1) — return
details page". Its fix swapped `text-neutral-400/500` -> `text-neutral-600` in six files but did not reach this NEW row, which still
carries `text-neutral-400`.

## Environment
- Storefront theme `2.60.0-pr-2523-9e4e-9e4e67ef` (vc-frontend PR #2523 @ 9e4e67e), Return `3.1005.0-pr-28-62f9`, Platform 3.1076.0, env vcst
- **Caveat:** the served theme on vcst is the DEFAULT preset (`--color-primary-500: #f99e24`), NOT one of the accessibility-gated
  themes Coffee/Red (VC-UI-001). So `BL-A11Y-003` as written does not bind this theme and the value is informational. The neutral
  palette is probably not preset-bound, so Coffee/Red are likely affected too — `{HYPOTHESIS}`, not measured.

## Steps to reproduce
1. As the holder `@td(ORG_RET_HOLDER_GLOBAL.email)` open a return created by a colleague (`@td(ORG_RET_BUYER.email)`) via
   `/account/returns/<id>` (organization tab -> row).
2. Inspect the "Requested by" label at 1280 px, in dark mode, and at 375 px; run axe `color-contrast`.

## Expected
Contrast >= 4.5:1 for the label text.

## Actual
`#a3a3a3` on white, 14 px = **2.52:1** (axe: serious, color-contrast). In dark mode rgb(90,94,104) also fails.

![Colleague return details, 1280 px](../../screenshots/colleague-return-requested-by-label-fails-contrast-VCST-5884/V13-colleague-details-1280.png)
![Dark mode, 1280 px](../../screenshots/colleague-return-requested-by-label-fails-contrast-VCST-5884/V12-colleague-details-dark-1280.png)
![375 px](../../screenshots/colleague-return-requested-by-label-fails-contrast-VCST-5884/V18-colleague-details-375.png)

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | **FAIL** | label colour `#a3a3a3` (2.52:1), dark mode also failing |
| 2. Backend Admin | N/A | storefront-only |
| 3. GraphQL xAPI | N/A | not involved |
| 4. Platform REST API | N/A | not involved |

**Owning layer:** 1 — vc-frontend, `client-app/modules/returns/pages/return.vue:32-36` (`text-neutral-400`).

## Impact / severity — P3, Low
One label; the page stays fully usable.

## Fix Routing
Repo `vc-frontend`. The same neutral-600 class change as VCST-6107, on the new row. Not a breaking change.
