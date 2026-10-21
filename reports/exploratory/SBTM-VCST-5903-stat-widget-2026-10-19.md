# Exploratory Session: VcStatWidget (UI kit), ticket mode, VCST-5903 R1
**Date:** 2026-10-19 · **Duration:** ~25 min of a 30 min box · **Lane:** playwright-firefox · **Run:** VCST-5903-R1-2026-10-19
**Build:** QA Storybook image 2.61.0-alpha.2594-vcst-5903-vc-stat-widget-3f8af63a (vc-frontend #2568 @ 3f8af63a). Probe: 200, index.json lists 8 stories + Docs
**Session type:** [EXP] · **Technique:** charter-driven hypothesis grounding, plus surprise-seeking (Whittaker Saboteur, applied to string props)
**Charter:** received from the Test Model + strategy (not widened). It covers S7, A10, R6, R7, S2, R4, and the V3/V8 waived cells
**Edge-Case Refs:** ECL-1.6 (fluid widths between breakpoints) · **BL Refs:** BL-UI-004, BL-UI-005
**Evidence:** `reports/tickets/Sprint26-21/VCST-5903/screenshots/X-01…X-07` · HAR `test-results/firefox/har/session.har` · console: 0 errors (2 preload warnings, Storybook noise)
**kb:** ask → kb_none (no entry). Captured: KB-A74F95A5, KB-2B31393F, KB-D7AF72F3, KB-527B0F06, KB-A4C7F35D

## Findings
| # | Condition | Source | Result |
|---|---|---|---|
| X1 | S7: label + value only (icon, description, delta and deltaIcon undefined) vs a full card | Basic `args` · Row @1920 | PASS. Head top 17, height 28; figure top 51, the same as a full card. Absent parts leave no gap, and the sr-only output is absolute. Row cards without a description keep figure 51 and delta 115 |
| X2 | A10: pointer click on a prepend control while `loading` | prepend-slot `&args=loading:!true` | OBSERVED (question). `div.vc-loader-overlay` intercepts pointer events (z 996, covers the full inner card), so a prepend drag handle is inert while loading. Keyboard focus is not blocked, so pointer and keyboard behave differently. Not specified |
| X3 | R6: live region on first mount (loading / error) | Loading, Error State (DOM) | OBSERVED, HYPOTHESIS supported. `<output>` (implicit status, no aria-live) already holds "Revenue this week: loading" or "…: Couldn't load" at first render. It is never empty first, so a card that mounts in that state is likely silent. No screen reader was run |
| X4 | R6: "heard twice" | same | PARTIAL. No double announcement path (dash, error row and icons are aria-hidden=true). In browse mode the label is read twice: once visible, once in the status text |
| X5 | R7: a loading card under a sticky header | Loading (computed) + storefront home | PASS (computed). The root is relative, z auto, `isolation:isolate`, so the overlay's z 996 stays inside the card. The storefront sticky header is z-20, so the header wins. The live scroll-under was NOT built (DOM injection is outside the real-user rule; no consumer page) |
| X6 | R1/S2: unchanged trend tone | Delta Colors · Basic `deltaColor:info` | OBSERVED. neutral = rgb(64,64,64) (`--color-neutral-700` #404040). info = rgb(50,92,118) (#325c76), with the glyph in the same colour. The kit CAN draw the mockup's blue via `deltaColor="info"`. Whether "unchanged" should be info or neutral stays a PO question |
| X7 | R4: Row at 1168 / 900 / 375 | Row | PASS, with a note. A card never shrinks below its figure's min-content, so the row wraps instead of overflowing (at 900: 204/204/204/207 px). No horizontal scroll at any width. At 1168 the 6th card wraps alone and stretches to 1136×92 (layout of the story, not the component) |
| X8 | R4: Colors at the xs/lg edges 480 / 1024 | Colors | PASS. 2 cols at 216 px and 4 cols at 236 px. All cards 156 high, figure on one line, 43 / 63 px spare |
| X9 | V3 waived cell: dash-row alignment | Row (loading card) | PASS for the dash (at the figure line, 51). DRIFT/question: an error card in the same line has its message pinned to the bottom (65 @900, 115 @1920), not on the figure line |
| X10 | V8 waived cell: suffix under pressure | With Suffix, Controls value `$1,512,400.00` | OBSERVED. The figure stays on one line (194 px). "items" wraps onto its own line (top 105) and the card grows to 193 px. This hits S8's "unit on its own line" shape when the figure is long |
| X11 | Surprise: `errorText` = " " | With Suffix, Controls | FAIL candidate (Low). The figures vanish and only the red alert icon shows, with a blank message. Status reads "Active carts:  ". Same whitespace gap as S3, on the error branch |
| X12 | a11y addon (axe), Row | Accessibility tab | 0 violations, 1 inconclusive `color-contrast` (Serious). Handed to R5 / ui-ux lane |

## Net-New Scenarios Discovered
| # | Scenario | Why uncovered | What we found | Oracle ref | Fate | Suggested next charter |
|---|---|---|---|---|---|---|
| 1 | `errorText` whitespace-only → blank error state | model S3 covers `value` only; tc:scope 0 rows | X11 | **NONE** | PROMOTE → kit/Storybook case beside S3 (R2) | Other string props with whitespace: label " ", delta " " |
| 2 | prepend control under the loading overlay (pointer blocked, keyboard not) | A10 was a hypothesis | X2 | **NONE** | PROMOTE as an assertion once dev/PO decide intended behaviour; until then QUESTION | Keyboard Tab into prepend while loading |
| 3 | long figure + `valueSuffix` in a narrow card → suffix on its own line, card taller | V8 row cell WAIVED | X10 | ECL-1.6 | PROMOTE → R4 checklist row (narrow card + suffix) | Suffix + 2-line label in a 6-across row |
| 4 | error card beside figure cards: message on the delta line, not the figure line | V3 row cell WAIVED | X9 | BL-UI-005 (adjacent) | DECLINE as a bug (consistent with "pinned to the bottom" design); PO question | — |

## Oracle Feedback
| Kind | Entry | Evidence | Route |
|---|---|---|---|
| Candidate new pattern | whitespace-only string prop toggles a state branch (error) and announces an empty message | X11, X-06 | `/qa-review-oracles ecl` |
| Candidate new invariant | live-region text present at mount is not announced: a status region must exist before its text | X3 | `kb_capture` done (KB-2B31393F); a rule needs a human source |

## Model amendments (proposed)
- S1/A1: in mockup att 83239 `$1,512,400.00` is the **description** of "ORDERS PLACED · YTD" (figure "489"), not the figure. The long-figure risk is a story/consumer choice, not the mockup's.
- V2/S7 grounded: {HYPOTHESIS} → {OBSERVED} PASS. Add variant **V10 `errorText` whitespace** to the L2 resolve column.
- L4: add a branch for "first mount in loading/error: text present at insertion". A10 adds a reverse-interaction note to L3 (overlay blocks the prepend pointer).

## Questions
- PO: should "unchanged" use `deltaColor="info"` (mockup blue) or neutral grey? Should an error message sit on the figure line in a row?
- Dev: should prepend controls stay operable while loading? Should the status announce on first mount (render it empty, then fill on nextTick)? Should `errorText` be trimmed?
- Spinner colour stays primary (orange) on an info-accent card (X-03). Intended?
