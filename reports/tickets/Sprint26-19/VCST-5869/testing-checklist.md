# Testing checklist — VCST-5869 (Artifact B)
Build under test: theme `2.58.0-pr-2486-4348-43488a7a` (latest published; PR head 00d2433a has NO artifact) · FRONT http://localhost (nginx → vcst-qa backend) · store B2B-store · run 2026-09-21 · path FULL · shape class ui-kit · model `reports/ba/test-models/VCST-5869-2026-09-21.md` · discovery `reports/exploratory/SBTM-VCST-5869-2026-09-21.md`
Oracles: BL-A11Y-001/002/004 (its modal-trap clause is N/A to a non-modal dialog; WCAG 2.1.2 + 2.4.3 apply) · WCAG 4.1.2 · WAI-ARIA APG dialog + select-only combobox · BL-UI-004. **The ticket is ABOUT accessibility, so a BL-A11Y FAIL is blocking** (visual-axis §3 carve-out). Out of scope: VIS-01 (date-input focus ring 1.63:1). Theme preset in effect: Red (WCAG-gated).

## Track 4a — real keyboard + a11y tree (qa-frontend-expert, playwright-chrome)
| ID | Cond | Result |
|---|---|---|
| K-01 | C1 C2 S2 | **PASS** — closed trigger `aria-expanded="false" aria-haspopup="dialog"` → open `role=dialog "Filters"`, panel takes focus |
| K-02 | S4 | **PASS** — click, Enter and Space each land focus in the panel |
| K-03 | C4 S3 | **PASS** — Escape from body or trigger closes; 2nd Escape is a harmless no-op |
| K-04 | C5 S5 | **PASS** — Escape/X/Reset/Apply all return focus to FILTERS; outside click does not steal it |
| K-05 | G1 S7 | **PASS** — 1st Escape closes only the select list (panel stays open, focus to select trigger); 2nd Escape closes the panel |
| K-06 | C6 G1 S8 | **PASS** with one INFO — calendar `role=dialog aria-label="Calendar"`, Escape layering correct, focus returns to the "Start date" field (matches suite `ORD-097`'s existing assertion verbatim — no RE-BASE needed). INFO: ArrowDown from the date input does NOT open the calendar (the PR's own description claims ArrowDown/Enter support here; it works for VcSelect (K-10) but not this control) |
| K-07 | S6 | **PASS** — Apply → loading → re-enabled: `aria-expanded="false"`, focus on trigger |
| K-08 | S10 | **PASS** — logical Tab order, Tab exits the panel to page content with the panel still open (non-modal, no keyboard trap) |
| K-09 | S1 | **PASS — JOURNEY.** Full keyboard-only task: status checkbox + date range → Apply → chips + table refiltered by status=New → Reset restores |
| K-10 | S11 | **PASS** — ArrowDown opens + focuses first option, Enter selects and closes. Enter-in-a-form sub-clause not reached (no such form on these two pages) |
| K-11 | S12 EXP-03 | **INFO** — confirmed: 2nd click on the open field does not close it (APG select-only combobox expects toggle). Below severity floor alone |
| K-12 | S23 S24 EXP-04/05 | **FAIL** — current value has `aria-selected="false"`; every option is its own tab stop (`tabindex="0"`, no `aria-activedescendant`) |
| K-13 | G2 S13 | **PASS** — `/account/orders` ≥640px repeats K-01/03/04/05/07 cleanly |
| K-14 | S14 EXP-02 | **FAIL** — `/account/orders` <640px drawer: trigger has no name/haspopup/expanded; container is a plain unnamed `generic`; Escape inert; Close drops focus to `<body>`. Same defect class as the ticket; the PR does not touch this path |
| K-15 | S15 EXP-01 | **PASS** — re-verified directly (orchestrator, DevTools MCP): rep panel at 375px sits at `top=236` inside an 812px viewport, Close X fully reachable. The earlier exploratory-session reading of `y=-24` was a scrolled-page artifact, not a defect — **retracted** |
| K-16 | S16 | **PASS** — mega-menu now `aria-haspopup="menu"`, opens on click/Enter, Escape closes and returns focus. INFO: hover does not open it; account button keeps `aria-haspopup="true"` (boolean) |
| K-17 | S17 | **PASS** (partial) — chip close buttons carry no `aria-haspopup`. No tooltip-bearing control was reachable on these two pages ⇒ NOT_APPLICABLE for that half |
| K-18 | S18 | **NOT_APPLICABLE** — no standalone VcDatePicker/VcDateRangePicker reachable outside the two filter panels (checked both pages, 3 widths) |
| K-19 | S19 | **DRIFT** — header Language selector and account button both advertise a popup (`aria-haspopup="dialog"` / `"true"`) over a plain, role-less panel (`<ul>` / `<div>`). Both still close on Escape with correct focus return. Pre-existing; the PR's role→haspopup contract has not reached them (its own "known holdouts") |
| K-20 | C3 | **INFO (drift, as predicted)** — both panels: `role=dialog`, named, `tabindex=-1`, **no `aria-modal`**; page stays fully operable while open (Tab exits, outside click keeps focus where clicked) — non-modal by construction, contradicting the ticket's own AC table |

## Track 4v — Chrome DevTools MCP (ui-ux-expert + orchestrator re-check)
| ID | Cond | Result |
|---|---|---|
| V-01 | S21 | **PASS** — axe-core 4.12.1, 0 Critical/Serious on the closed trigger, the full open page and the panel alone. `aria-valid-attr-value` on the trigger's `aria-controls` flagged "incomplete" (manual review) but resolves correctly |
| V-02 | C1 C2 C3 | **INFO** — literal table in `design-report.md`; confirms K-01/K-06/K-20's raw attributes independently, plus the mega-menu and Language/account entries |
| V-03 | S22 | **PASS** — 2px `#3b82f6` `:focus-visible` outline on panel/Close X/Apply/Reset/select wrapper/checkboxes, ≈3.68:1 against white. VIS-01 excluded |
| V-04 | S15 BL-UI-004 | **PASS** — no overflow and the Close X is hit-testable at 1920/1440/768/500/414/375. Independently confirms K-15 |
| V-05 | design | **SKIPPED** (`vs. DESIGN`, no Prototype link) / **NOT_APPLICABLE** (no token/colour change) / **SKIPPED** (Storybook story only exists in the PR build) |
| — | buyer surface | **BLOCKED(no buyer identity in this DevTools profile)** — `/account/orders` bounced the rep profile to `/sign-in`; not minted, not retried past that |

Cannot conclude (manual, never PASS): screen-reader speech output; the WCAG 2.2 additions other than 2.5.8; non-gated presets.

## Track 2a — corpus triage (test-management-specialist, no browser)
Scan A `npm run tc:scope -- --domain sales-rep,orders --observable "Escape" --observable "aria-haspopup" --observable "Filters" --observable "focus" --json` → 16 suites, 747 rows, 91 hits. Scan B (corpus-wide, all 143 manifest suite ids, same + `role="dialog"` + `aria-expanded`) → 143 suites, 4497 rows, 359 hits; 11 suites unscannable (legacy header format): 056,061,062,063,064,065,066,069,073,074,076.
**Disposition: 0 REPAIR, 0 SUPERSEDED, 0 RE-BASE** (the one candidate, `ORD-097`, is CONFIRMED — K-06 shows focus returns to the Start-date field exactly as the row already asserts). Zero-contributing suites named in full in the agent's return (folded into `summary.json`).
