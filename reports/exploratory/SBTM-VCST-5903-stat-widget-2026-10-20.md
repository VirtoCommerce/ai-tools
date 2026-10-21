# Exploratory Session: VcStatWidget (UI kit), ticket mode, VCST-5903 R2
**Date:** 2026-10-20 · **Duration:** ~16 min of a 30 min box (charter items exhausted at ~13 min, open half ~3 min) · **Lane:** playwright-firefox
**Build:** QA Storybook image 2.61.0-alpha.2597-vcst-5903-vc-stat-widget-a6255676 (vc-frontend #2568 @ bfe0b259; kb build stamp theme 2.61.0-pr-2568-bfe0-bfe0b259). Public, no sign-in
**Session type:** [EXP] · **Technique:** charter-driven hypothesis grounding + Saboteur on string props (invisible characters)
**Charter:** received from the R2 strategy (R6, R11/S12, R4 widths, live toggles, S7); not widened. Prior input: `SBTM-VCST-5903-stat-widget-2026-10-19.md`
**Edge-Case Refs:** ECL-1.6 · **BL Refs:** BL-UI-004, BL-UI-005
**Evidence:** `reports/tickets/Sprint26-21/VCST-5903/screenshots/R2-X*.png` · console: 0 component errors except X16; Storybook preload/feature-policy warnings only
**Method note:** values entered through Controls (typed/pasted) or URL args; reads via computed layout + DOM attributes. The Playwright-Firefox snapshot lists `aria-hidden` nodes, so it is not used as the a11y tree. No screen reader run (MANUAL).
**kb:** ask → list (KB-A4C7F35D, KB-B9BB372D, KB-2B31393F, KB-BFF94794, KB-82296935) → kb_show KB-2B31393F (different build) → kb_none. Nothing captured (caller banks it)

## Findings
| # | Condition | Evidence | Result |
|---|---|---|---|
| X1 | R6: Error State, errorText " " via Controls | R2-X1 | PASS. Figures return, `output` text empty (was "Revenue this week:  " on R1) |
| X2 | R6: errorText "" | DOM | PASS. Same as X1 |
| X3 | R6: errorText "Boom" | DOM | PASS. Status "Revenue this week: Boom"; the same `output` node persists across changes, so a change lands in an existing region |
| X4 | R6: loading on/off with "Boom" and with " " | DOM | PASS. "…: loading" → "…: Boom"; with " ": "…: loading" → "" (figures back). One `output` per card, no duplicate. Note: loading→ready only empties the region, so completion is not announced; root has no `aria-busy` |
| X5 | R11: value U+200B | R2-X5 | FAIL (Low), HYPOTHESIS refuted. Figure row keeps its 37.5 px height and shows nothing; no dash; status "" |
| X6 | R11: value " 42 " | DOM | PASS. Leading space collapses; "42" starts at x 36 = description left |
| X7 | R11: newline; mixed " \t U+200B " ; NBSP | DOM | newline → dash PASS. Mixed → blank figure FAIL (same root as X5). NBSP BLOCKED: the tool normalised it to U+0020, which gave the dash (confirms the R1 S3 fix for " ") |
| X8 | Surprise: errorText U+200B | R2-X8 | FAIL (Low). Error branch with an empty message, status "Revenue this week: U+200B". R1 X11 shape survives for non-trimmed invisibles |
| X9 | S7: Row @1280, partial cards (no description / loading / error) beside full ones | DOM | PASS. Figure top 51 on all five figure cards; bottom line 17 px from the bottom on all. A true label+value-only card in a row: BLOCKED (Row exposes no per-card controls; Row ignores value/errorText args) |
| X10 | Live toggles: Boom → loading → "" → $9.99 → ready → loading → value "" → errorText " " → ready | R2-X10 | PASS. Every end state equals a fresh render; one status node; no overlay left behind |
| X11 | R4: Colors, 2 columns, $123,456,789.00 | R2-X11 | FAIL, VCST-6428 holds. Crosses the border below 546 px (0.1 at 546), the padding below 578. At 480: 33.1 px past the border, and the right column runs 17 px past the viewport, so the page scrolls sideways (scrollWidth 497) and the last "0" is cut. 479 → 1 column, fine |
| X12 | R4: Colors + Delta Colors, 4 columns | R2-X12 | FAIL, VCST-6428 holds. Crosses the border below 1076 px, the padding below 1140; at 1024 13.1 px past in both stories. 1023 → 2 columns, fine |
| X13 | R4: With Suffix, value $123,456,789.00 | R2-X13 | OBSERVED (same as R1 X10). "items" on its own line (top 121 vs 68), card 193 high; figure 9 px into the right padding of a 256 px card |
| X14 | Long suffix "items awaiting approval by the buyer", value 34 | R2-X14 | OBSERVED. Suffix wraps back under the figure at content-left, at the figure's 37.5 px line pitch |
| X15 | Surprise: delta " " , description " " | R2-X15 | FAIL candidate (Low). Delta row renders the chevron alone (trend glyph, no text); description renders a 0-height node |
| X16 | Surprise: label " ", icon " ", valueSuffix " " | DOM + console | OBSERVED. Status " : Couldn't load"; icon " " leaves a blank 15 px icon box and logs `[VC][error] Failed to load icon:` |
| X17 | errorText 83 chars in a 256 px card | R2-X17 | PASS. 3 lines, hanging indent at 42 px, icon top-aligned, card grows to 128 |
| X18 | R4: Row with the long figure | — | BLOCKED. Row has no value control |
| X19 | Row @320 | DOM | PASS. One column, no horizontal scroll |
| X20 | No-value (dash) card, not loading | DOM | FAIL candidate (Low, a11y). Dash `aria-hidden`, status "" → assistive tech gets label, description, delta and no sign the figure is missing |
| X21 | Docs page | page text | OBSERVED. The Storybook Docs page carries no prose; the "cell at least as wide as its figure" note is not visible there |

### Continuation (coordinator request, ~11 min more; total box ~28 min)
| # | Condition | Evidence | Result |
|---|---|---|---|
| X22 | U+200B in label, valueSuffix, description, delta (With Suffix) | R2-X22 | FAIL (Low). None is trimmed: label row 28 px high with width 0, suffix span width 0, description row 14 px blank, delta row 24 px blank; card stays 156 px with two empty lines. Status "" |
| X23 | " " in label, valueSuffix (With Suffix, ready) | DOM | OBSERVED. Head row kept with icon only; suffix span width 0 (harmless). With errorText, label U+200B gives status "U+200B: Couldn't load" |
| X24 | delta U+200B with deltaIcon (Error State args, errorText "") | DOM | FAIL (Low). Same orphan chevron as X15 |
| X25 | a11y: ready vs dash vs error card (DOM attributes) | DOM | OBSERVED. Root is a plain div: no role, name or aria-busy. `output`: no explicit role, aria-live or aria-atomic (implicit status). Ready: label, figure, description, delta exposed; status "". Dash: figure aria-hidden, status "", so a reader hears label then "48 orders" / "$2,310.00 in carts", and the description can pass for the metric. Error: message row aria-hidden, the error is exposed only through the status ("<label>: Couldn't load"), and the label is heard twice |
| X26 | Changed states at 375 / 768 vs 1280 (Basic, With Suffix) | DOM | PASS. These stories render a fixed 256 px card, so dash (" "), ready (errorText " ") and "Boom" (92 px card) are identical at every width; no horizontal scroll. With Suffix, value " " → dash and the suffix is hidden |
| X27 | errorText: one 41-char unbreakable word, 256 px card, @768 and @375 | R2-X25 ×2 | FAIL (Medium, BL-UI-004). The message runs 77.5 px past the card border on one line (`overflow-wrap: normal`, error row overflow visible); inside the viewport at 375 only because the card is 256 |
| X28 | Same word in description and delta (Basic @375) | R2-X26 | FAIL (Medium, BL-UI-004). Description 8.3 px past, delta 73.5 px past. The label wraps (`overflow-wrap: break-word`), so only the label is protected |
| X29 | 24-digit value, Basic 256 card | DOM | OBSERVED. Figure 134.8 px past the border, never wraps: the VCST-6428 class (the cell must fit the figure) |
| X30 | Dark mode + Coffee preset: dash and blank-error card | R2-X27, R2-X28 | OBSERVED (a11y question). Dash rgb(212,212,212) on white ≈ 1.5:1; Default dark rgb(61,64,72) on rgb(10,9,11) ≈ 1.9:1; Coffee dark rgb(90,90,90) on rgb(17,15,14) ≈ 2.8:1. Visible, but under 3:1 in every mode. axe (addon) reports 0 violations on Coffee dark because the dash is aria-hidden. Blank-error card in Coffee dark renders the figures (rgb(222,222,222)), status "". Loading spinner follows the Coffee accent |
| X31 | Tool note | — | Firefox clicks on Storybook addon tabs and "Set string" stalled twice (visible/stable, then 30 s timeout). Typing into textboxes, URL args and globals still worked |

## Net-New Scenarios Discovered
| # | Scenario | Why uncovered | What we found | Oracle ref | Fate | Suggested next charter |
|---|---|---|---|---|---|---|
| 1 | value of invisible-only characters (U+200B, mixed whitespace + U+200B) | S3 covers trimmed whitespace only | X5, X7 | **NONE** | PROMOTE → kit case beside S3, this run: value U+200B ⇒ expect the dash | Other invisibles: U+2060, U+FEFF |
| 2 | errorText of invisible-only characters | R1 X11 fixed for " " only | X8 | **NONE** | PROMOTE → pair with 1: errorText U+200B ⇒ expect figures, empty status | — |
| 3 | delta whitespace-only → orphan trend glyph | whitespace family never applied to delta | X15 | **NONE** | PROMOTE → kit case (delta " " ⇒ no delta row) once dev confirms intent; until then QUESTION | label/description trim |
| 4 | 2-column grid at 480: figure overflow becomes a page-level horizontal scroll | A6 records px past the border only | X11 | ECL-1.6 · BL-UI-004 | PROMOTE → add "no page h-scroll at 480" to A6's assertion | Same at 375 with Delta Colors |
| 5 | no-value (dash) card is silent to assistive tech | R6 looked at loading/error only | X20 | **NONE** | DECLINE as a case for now: needs a dev/PO decision on what the status should say; QUESTION | — |
| 7 | unbreakable word in errorText / description / delta overflows the card (label wraps, they do not) | R4 covered the figure only | X27, X28 | BL-UI-004 · ECL-1.6 | PROMOTE → kit case: 41-char word in errorText, description and delta at 256 px stays inside the border | Same in a Row cell at 375 |
| 8 | dash contrast under 3:1 in light, dark and Coffee dark, unseen by axe because aria-hidden | V-axis checked colours, not the aria-hidden dash | X30 | **NONE** | DECLINE as a case; route to ui-ux (R5) as a WCAG 1.4.11 question | — |
| 6 | long valueSuffix wraps under the figure | V8 covered a short unit only | X14 | ECL-1.6 | DECLINE: inline wrap is plausible design; PO question | — |

## Oracle Feedback
| Kind | Entry | Evidence | Route |
|---|---|---|---|
| Candidate new pattern | `trim()` does not clear zero-width characters, so a "blank" check on a string prop misses them (value, errorText) | X5, X8 | `/qa-review-oracles ecl` |
| Candidate new pattern | a whitespace-only secondary prop renders its decoration without its text (orphan trend glyph) | X15 | `/qa-review-oracles ecl` |
| Candidate new invariant | a figure overflow inside a grid cell must not create a page horizontal scroll | X11 | `kb_capture` (caller); a rule needs a human source |

## Model amendments (proposed)
- R11 {HYPOTHESIS} → {OBSERVED}: refuted for U+200B and mixed invisibles (blank figure); holds for newline and " 42 ". Add variant **V11 value U+200B** and **V12 errorText U+200B**.
- R6 {HYPOTHESIS} → {OBSERVED} (DOM only): blank errorText is silent; each state is written once into one persistent region. Add branch: loading → ready clears the region (no completion message); no-value dash state is silent.
- R4 thresholds: 4-col grid crosses the border below 1076 px, 2-col below 546 px; 2-col at 480 also scrolls the page.

## Questions
- Dev: should `hasValue`/`hasError` strip zero-width characters? Should `delta`/`description`/`icon` be trimmed like `value`/`errorText`?
- Dev/PO: what should a screen-reader user hear for a card with no value, and when loading finishes?
- Docs: should the grid note also appear in the Storybook Docs page, and should the Colors/Delta Colors stories follow it?
