# VCST-6077 — Testing checklist (Artifact B)

**Ticket:** [Sales Rep Hub] Adjust design for tasks feature · Story · P2 · **FULL**
**Build:** `http://localhost` = theme `2.59.0-pr-2536-c2de-c2de2cd2` → vcst-qa backend (SalesRep 3.1012.0, TaskManagement 3.1005.0)
**Model:** `reports/ba/test-models/VCST-6077-2026-10-07.md` · **3x:** `reports/exploratory/SBTM-VCST-6077-2026-10-07.md`
**Data:** `@td(SR_REP_PRIMARY)` with `SR_TASK_*` (22 tasks, re-seeded before 4a) · expected counts `@td(SR_TASK_GROUPS.*)` · empty rep `@td(SR_REP_NOCUSTOMERS)`
**Covering case:** `SR-TK-*` = Artifact A rows in `106-sales-rep-tasks-storefront.csv` (PENDING-A closed at 3-cases → SR-TK-001…029, Draft) · existing ids = C1 · **C1 = `REG-2026-10-07-1421`**: 28 PASS · 7 FAIL · 8 BLOCKED · 1 SKIPPED / 44
**Verdict column:** filled at Step 5 (PASS / FAIL / BLOCKED / DRIFT-noted / SKIPPED + reason)

## A. Story ACs (1d T/M rows)

| # | Condition | Cond | Covering | Verdict |
|---|---|---|---|---|
| B1 | Task list is a zebra table (even ≠ odd row fill), columns Task · Status · Notes · Actions | A1 | PENDING-A (model #19) | PASS (4a) — even rows rgb(250,250,250), 4 cols · 4a-01 |
| B2 | No checkbox column, no coloured status bars — Tasks page **and** dashboard widget | A2 | PENDING-A (#19) | PASS (4a) — page + dashboard widget · 4a-01, 4a-04 |
| B3 | Status chip per status: colour + variant + leading glyph (overdue danger, upcoming info, completed success, canceled neutral) — **DRIFT A3: tonal vs mockup outlined** | A3, A4 | PENDING-A (#3, #6) | PASS + DRIFT A3 (4a/4v) — overdue/completed/canceled tonal, Upcoming outline-info (mixed); advisory |
| B4 | One action per non-canceled row: Mark as complete (circle-check-big, success glyph) / Reopen (rotate-ccw, info glyph); completed always Reopen | A5–A8 | PENDING-A (#12, #13) | PASS (4a) — success-500 / info-500 glyphs; canceled none |
| B5 | Due dates rail: one frame, `sm` calendar, "Due dates" title once — **DRIFT A11: rail 280px vs ticket 272px** | A9–A11 | PENDING-A (#17, #19) | PASS + DRIFT A11 (4a/4v) — aside 280px vs ticket 272; advisory |
| B6 | Task title opens **Edit task** by click and Enter; saving keeps all other fields | A12 | PENDING-A (#15) | PASS (4a) — click + Enter; update keeps dueDate/priority/type/description |
| B7 | No "Add task" and no header "Today" button; "New task" present | A13, A19 | PENDING-A (#2) | PASS (4a) |
| B8 | Completed title struck through — **DRIFT A14: link colour vs mockup grey** (design decision, not a defect alone) | A14 | PENDING-A (#5, #19) | PASS + DRIFT A14 (4a/4v) — link colour rgb(21,95,122) + line-through; advisory · 4a-02 |
| B9 | H1, breadcrumb, nav read "Tasks"; route `/company/tasks`; dashboard link "All tasks"; `/company/calendar` → 404 | A15, A20 | PENDING-A (#2) | PASS (4a) — /company/calendar → 404 |
| B10 | Dated list header present — **NOT-FOUND M4: reads "N tasks", never "N of M"** | M4 | PENDING-A (#8) | DRIFT M4 (4a) — "Oct 7, 2026 / 7 tasks", "All / 22 tasks"; never "N of M"; advisory |

## B. Scope & counts (L-T3s — the mechanism this PR adds)

| # | Condition | Cond | Covering | Verdict |
|---|---|---|---|---|
| B11 | Each badge equals the length of its list (Today, All, Upcoming, Overdue, Completed) | A16, A35 | PENDING-A (#8) | PASS (4a) — Today 7 · All 22 (15+7) · U 12 · O 2 · C 4 |
| B12 | All vs Upcoming+Overdue+Completed: observed 22 vs 18 (dateless + canceled) — **PO question, not an oracle** | model #7 | PENDING-A (#7) | OBSERVED (PO) — All 22 ≠ 18 (India dateless + Kilo/Lima/Hotel canceled) |
| B13 | Today includes completed-due-today; **includes canceled-due-today (Q3 — PO)**; badge = list | A16, 3x | PENDING-A (#5, #31) | PASS (4a); Q3 observed — Today 7 incl. canceled Lima, badge = list |
| B14 | Day boundary: 00:00 local → Upcoming + Today; 23:30 local → Today | A24 | PENDING-A (#4) | PASS (4a) — Golf in Today + Upcoming, Papa in Today |
| B15 | Today chip clears tab + `?filter`, returns grid to current month | A18 | PENDING-A (#10) | PASS (4a) |
| B16 | Date chip: opens on non-today pick, moves, click restores day + month, × fallbacks (on-screen → Today; All/tab → unchanged; off-month → Today), focus → Today chip | A17 | PENDING-A (#11) | PASS (4a) — all three × fallbacks, focus → Today chip |
| B17 | `?filter=overdue` deep link; unknown `?filter` → Today + URL cleaned; picking a day clears `?filter` | A34 | PENDING-A (#14) | PASS (4a) — zzz → Today, URL cleaned |
| B18 | Counts refetch after a write from All view, and after Delete | 3x | PENDING-A (#9, #32) | PASS (4a) — reopen Echo: O 2→3, C 4→3; delete: Today 8→7, All 23→22 |
| B19 | Empty states per scope (day / Today / All) with 0 tasks; chips enabled | A22, A23 | PENDING-A (#23) | PASS (4a) + observation — 0-task rep: status tabs not rendered; All empty copy says "tab" · 4a-14 |

## C. Row action & lifecycle (L-T5)

| # | Condition | Cond | Covering | Verdict |
|---|---|---|---|---|
| B20 | Complete → moves to Completed, struck, action becomes Reopen; one mutation per double-click (BL-SR-030 analogue) | A8, A27 | PENDING-A (#1, #12) | PASS (4a) — double-click = 1 mutation |
| B21 | Reopen past-due → Overdue; reopen future → Upcoming | A8 | PENDING-A (#13) | PASS (4a) |
| B22 | Canceled: no action, no dot, never in a tab; Edit keeps it canceled | A21, 3x | PENDING-A (#6, #28) | PASS (4a) — Hotel save 200, stays canceled; Oct 4/9 no dot |
| B23 | Dateless: Upcoming chip + action, in All only; Edit forces a date (local midnight) | 3x | PENDING-A (#7, #29) | PASS (4a) — date-only picker writes local midnight |
| B24 | Focus after row action via keyboard stays on the row (3x saw it drop to root) | 3x | PENDING-A (#27) | **FAIL** (3x/4a) — focus → document root after Mark as complete / Reopen / Edit Save / Delete · 4a-16, 4a-17, 4a-18 GIF |
| B25 | Action accessible name begins with its visible label (WCAG 2.5.3) | A26 | PENDING-A (#21) | PASS (4a) |

## D. Calendar, visual, a11y, i18n (visual lane 4v rows marked ◆)

| # | Condition | Cond | Covering | Verdict |
|---|---|---|---|---|
| B26 | Markers: one dot per kind, two-task day announces 2, canceled-only day no dot (Q1), today ringed, no selection in All | — | PENDING-A (#17, #30) | PASS (4a); Q1 observed — canceled-only days no marker/no text · 4a-03 |
| B27 ◆ | a11y: axe-clean Tasks page; × target ≥24px, keyboard-operable, localized name; rail calendar keys (Arrow/Home/Enter) | A25 | PENDING-A (#21) + 4v | PASS (4v) — × exactly 24×24, Tab-reachable, aria-label "Clear Oct 14, 2026"; rail keys work. axe: 1 violation = theme orange primary button (A-1, pre-existing) |
| B28 ◆ | Contrast ≥4.5:1 in coffee/red dark presets, excluding the declared VCST-6134 hovered-row case | A29 | PENDING-A (#21) + 4v | PASS on Tasks page (4v, coffee-dark; VCST-6134 hover did NOT reproduce) · red-dark **INCONCLUSIVE** (server-side preset) · dashboard widget overdue notice 3.06:1 (A-2) |
| B29 ◆ | Design-system: live tokens, no hardcoded literals; `VcCalendar` tokens resolve | — | 4v | PASS (4v) — no literals in new components; VcCalendar tokens resolve (frameless 0/0, framed .75rem/1px) |
| B30 ◆ | `vs. DESIGN`: **SKIPPED — ticket links Figma only, no Claude Design project / no `.design-source/` copy**; mockup JPG used for the three DRIFT measurements (advisory) | — | 4v | SKIPPED (4v) — Figma only, no Claude Design project / no .design-source copy |
| B31 | 375px + lg cards: action in each card, date chip no overflow, no horizontal scroll | A28 | PENDING-A (#20) | PASS (4a) — 375 cards carry actions, no h-scroll · 4a-11..13 |
| B32 | es / pt / ru: new keys translated, no raw keys, month heading readable | A30 | PENDING-A (#22) | **FAIL** (4a) — pt: VcCalendar weekday headers overlap (F-1); es/ru action label wraps (F-3); ru chips truncated (F-4) · 4a-06..10 |
| B33 | Long task name truncates without shifting chips/actions | A31 | **UNCOVERED** — no plan row; checked in 4a only | PASS (4a) — 218-char title clamped to 2 lines, columns stable · 4a-19 |
| B34 | UTC−5 browser: 23:30 NY task on today's cell (3x NOT REACHED — lane is CEST) | — | PENDING-A (#18, sets `timezoneId`) | BLOCKED (4a) — lane fixed at CEST, no timezoneId; carried to SR-TK-018 in C1 |

## E. Reach — Epic seams with Done siblings (C1 over existing cases)

| # | Condition | Covering | Verdict |
|---|---|---|---|
| B35a | Rule chips — My customers (no chip row; filter-chip gate) | SR-FE-045, SR-FE-046 (REPAIR), SR-FE-047 (REPAIR) | PASS SR-FE-045 · BLOCKED SR-FE-046/047 (env: no selectable non-All customer rule — gate held, never PASS) |
| B35b | Rule chips — dashboard Top sellers + order-status/category chips: "All"/localized label, same chips on two mounts (VCST-5317) | SR-HD-011, SR-HD-051 | PASS SR-HD-051 (order-status chips; same set on remount) · BLOCKED SR-HD-011 (SalesRepTopSellerFilterRules [] on B2B-store) — top-seller chips unexercised |
| B36 | Rail 22rem: dashboard rail block + customer-profile rail blocks not clipped (VCST-5317) | SR-HD-061 · SR-CP-005, SR-CP-022 · 4a spot-check | PASS SR-CP-005, SR-CP-022 · 4a spot-check PASS (rail 352px, no clip) · BLOCKED SR-HD-061 (no qualifying active cart; seeded carts swept) |
| B37 | `VcCalendar` in the customer-orders date-range picker: day cells, render split/combined, customer route, keyboard dialog (VCST-6001) | SR-CO-038, SR-CO-039, SR-CO-040, SR-CO-045, SR-CO-048, SR-CO-049, SR-CO-051 | PASS SR-CO-040, 045, 049 · **FAIL** SR-CO-048, SR-CO-051 (to triage) · BLOCKED SR-CO-038 (precondition: 0 disabled days), SR-CO-039 (env: SR_REP_PASSWORD unset) |
| B38 | Permission + module gating carried to the new route (`BL-SR-011`) | **UNCOVERED by a new case** — unchanged server gating; 4a spot-check as a non-rep buyer | PASS (4a) — org maintainer redirected to /account/dashboard, no salesRep* ops · 4a-15 |

## F. Artifact A phase `2a` — disposition of the 35 `tc:scope` hits (1b 2e scan; 10 suites, 527 rows)

`unmatchedObservables` (10): `/company/calendar` · Full calendar · Add task · `.sales-rep-rule-chips__tab/__label/__count` · Tasks & due dates · Upcoming · Overdue · 24rem — no existing row asserts a removed label, the old route or a renamed selector. `unscannable[]`: none.
- **CONFIRMED — word collision, PR does not touch the control:** SR-FE-033, 035, 036, 037, 039, 040, 041 (comms-modal channel checkbox) · SR-CP-025 (comms-modal checkbox) · SR-CP-067 (widget-settings checkboxes) · SR-EMB-033 (documents bulk-select) · SR-CO-016, 026, 033, 036 (orders filters-drawer checkboxes / prose)
- **CONFIRMED — "Calendar/Today" is prose (calendar year/week, a date word):** SR-GQL-053 (not executing) · SR-FE-044 · SR-CP-029 · SR-EMB-043 · SR-CO-042, 043, 044, 046 (typed-date preconditions)
- **CONFIRMED, not carried — calendar grid never rendered/clicked by the asserted path:** SR-CO-047 (typed input + TZ bounds) · SR-CO-050 (`ui_kit` locale keys unchanged; grid click already carried by 039/045/051)
- **CONFIRMED, carried to C1 (reach guards):** SR-FE-045 · SR-HD-061 · SR-CO-038, 039 (partial — MATH/FILTER_ARG unrun in 3x), 040, 045, 048, 049, 051
- **REPAIR, carried to C1 (mechanics only, assertions untouched, re-linted):** SR-FE-046, SR-FE-047 — vacuous "skip with a note" → explicit gate that records BLOCKED (never PASS) when no selectable rule exists; stale inherited state replaced by its own sign-in
- **RE-BASE:** none · **SUPERSEDED:** none
- **Added by reach review (not tc:scope hits — vocabulary missed them):** SR-HD-011, SR-HD-051 (dashboard rule chips) · SR-CP-005, SR-CP-022 (customer-profile rail, desktop)

**C1 exact set (44):** 106 SR-TK-001…029 (29 new Draft) · 089 SR-FE-045, 046, 047 · 091 SR-CP-005, 022 · 093 SR-HD-011, 051, 061 · 097 SR-CO-038, 039, 040, 045, 048, 049, 051.

## G. Findings handed to 5-triage (none filed yet — severity is graded at 5-triage)

| # | Finding | Source · evidence | Verdict |
|---|---|---|---|
| F-1 | `pt`: `VcCalendar` weekday headers overflow + overlap (`th` 32px, scrollWidth 38–43) on Tasks rail (`sm`) and dashboard widget (`md`); 097 picker shares the component. **Provenance open** (PR changed tokens + added `sm` rail) | 4a · 4a-08, 4a-09 · BL-UI-004 | REAL_BUG · **PRE-EXISTING** (same overflow on old /pt/company/calendar; weekdayFormat short) · Low · draft open/low/BUG-vc-calendar-pt-weekday-headers-overlap.md |
| F-2 | Focus drops to document root after row action **and** Edit task Save/Delete (keyboard + mouse) | 3x + 4a · 4a-16/17, 4a-18 GIF · BL-A11Y-001 / WCAG 2.4.3 | REAL_BUG a11y · **PRE-EXISTING** (old checkbox/Save/Delete also drop focus; VcTable :loading unmounts) · Medium · draft open/medium/BUG-SalesRep-Tasks-Focus-Lost-After-Task-Action.md |
| F-3 | es/ru: action label wraps to 2 centred lines, icon detached (208px button) — maybe VCST-6133 | 4a · 4a-06/07 · BL-UI-005 | REAL_BUG · **IN-SCOPE** (new sales-rep-task-action, 208px in 224px column) · **BL-UI-005 violated** · Low (below floor) |
| F-4 | ru @1920: status chips truncated ("Предстоящ…") in 144px column while Notes has room | 4a · 4a-10 | REAL_BUG · **IN-SCOPE** (PR added chip icon; label needs 81–86px, gets 80) · Low (below floor) · ellipsis ⇒ not a BL-UI-004 violation |
| F-5 | Sales Rep hub pages keep `<title>` "Virto Commerce" (Tasks, dashboard, my-customers) — hub-wide | 4a · WCAG 2.4.2 | REAL_BUG a11y · PRE-EXISTING (hub pages never call usePageHead) · Low (below floor) · related VCST-5988 |
| F-6 | Notes textarea in New/Edit task has no accessible name (modal unchanged by PR) | 3x + 4a · BL-A11Y-002 | KNOWN_ISSUE · PRE-EXISTING · dup of **VCST-5993** (In review) · link only |
| A-1 | Coffee primary orange #f99e24 → 2.11:1 on "New task" / outline-primary text (theme-level) | 4v · axe · BL-A11Y-003 | KNOWN_ISSUE · PRE-EXISTING theme-wide · dup of **VCST-4665** (Cancelled, won't-fix) · human call |
| A-2 | Dashboard Tasks widget overdue notice #bb1616 on #0a090b = 3.06:1 in coffee-dark (style not changed by the PR — diff context only) | 4v · BL-A11Y-003 | REAL_BUG a11y · **PRE-EXISTING** (same class/colour on old build) · Medium · standalone |
| A-3 | 375: task title button 18px tall, breadcrumb links 17px — likely inline-text exempt from 2.5.8 | 4v · BL-UI-006 | BY_DESIGN · passes the WCAG 2.5.8 spacing exception · dismissed |
| — | Advisory DRIFT (never filed): A3 chip variant mix · A11 rail 280 vs 272px · A14 completed link colour · M4 "N tasks" · week starts Sunday vs mockup Monday (UNSPEC) | 3x · 4a · 4v | advisory |
| — | PO questions (never filed): Q1 canceled-only day no marker/text · Q3 canceled-due-today in Today · All ≠ U+O+C (dateless + canceled) · Q2 mobile rail pick does not scroll to the list | 3x · 4a | open |

## Below the severity floor / notes
- 3x handed back: **Low** — Notes textarea in New/Edit task has no accessible name (pre-existing; modal unchanged by PR #2536).
- `ru` dates render in English on Tasks and customer orders alike — storefront-wide, not this PR.
- Env: `{{SR_REP_PASSWORD}}` is unset on this machine — SR-CO-039 (C1) signs in with it.
