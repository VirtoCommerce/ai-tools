# Testing checklist — VCST-6314 · Schedule a call with date AND time · round 2 · vcptcore-qa

Build: VirtoCommerce.SalesRep 3.1016.0-pr-26-92d4 (PR vc-module-sales-rep#26 @ 92d48e1) · TaskManagement 3.1005.0 · platform 3.1085.0 · theme 2.61.0-pr-2597
Browser zone: UTC+3 (no DST) · Model: test-model.md (+ 3x amendment) · Discovery: exploratory/SBTM-VCST-6314-2026-10-27.md
Data: rep @td(SR_REP_PRIMARY) (serves 7 orgs, incl. AGENT-TEST-Org-AcmeCorp-20260310) · other rep @td(SR_REP_ACME2) · no-customers rep @td(SR_REP_NOCUSTOMERS) · unserved org @td(SR_UNSERVED_ORG) · admin {{ADMIN_USERNAME}}. Every call created in-case, title AGENT-TEST-6314-*, deleted in cleanup.
**Verdicts filled at 5-report (2026-10-27). Run verdict: PASS WITH NOTES.** C1 REG-2026-10-27-1439 (+ retry050m): 16 PASS / 1 expected RE-BASE FAIL (091 SR-CP-023).
Status column: `3x:<value>` = observed live in the discovery lane this run (same build, same stand) · `4a` = executed in Step 4 · verdict filled at 5-report.

## A. Entry and defaults (AC-4…AC-10)
| # | Condition | Source | Scenario | Status | Verdict |
|---|---|---|---|---|---|
| C-01 | On a served customer's page the Quick-actions tile "Schedule call" is enabled and opens a popup "Schedule call" | AC-4 | #1 | 1r + 3x: enabled, opens | PASS |
| C-03 | Title prefilled "Call" (en) | AC-5 | #2 | 1r: "Call" | PASS |
| C-04 | de: popup "Anruf planen", Title "Anruf", no raw keys | AC-5 / BL-SR-013 | #17 | 3x: translated; type names English (pre-existing) | PASS — PO question (translated title) |
| C-06 | Customer prefilled with the page's customer, editable, optional (Clear, no asterisk) | AC-6 | #2 | 1r + 3x | PASS |
| C-07 | Due date empty; Save disabled until a date is picked | AC-7 | #2 | 1r: empty, Save disabled | PASS |
| C-08 | Time always holds a value; cannot be cleared | AC-8 | #3 | 3x: no Clear, no empty option | PASS |
| C-09 | Time defaults to 9:00 AM (de: 09:00) | AC-9 | #2 | 1r + 3x | PASS |
| C-10 | Priority default — PO wrote Medium; build offers Lowest/Low/Normal/High/Highest, default Normal | AC-10 | #2 | 3x: no "Medium" exists → PO QUESTION | PO QUESTION (Normal) |
| C-11 | Time list: 96 options, 12:00 AM…11:45 PM, 15-min step | AC-3 | #3 | 3x | PASS |
| C-32 | Notes limit (PO mockup 0/250; build 0/1000, hard-capped) | mockup | — | 3x: 1000 → PO QUESTION | PO QUESTION (1000) |
| C-33 | Popup wording vs mockup (title "New task", button "Create task") | mockup | — | 3x/1r: "Schedule call", "Save" → PO QUESTION | PO QUESTION |

## B. Save, time and the local day (AC-3)
| # | Condition | Source | Scenario | Status | Verdict |
|---|---|---|---|---|---|
| C-12 | [FLOW] Tile → tomorrow 2:30 PM → Save → toast "Task saved" → /company/tasks row "Due <date>, 2:30 PM · <customer> · Call" in tomorrow's bucket, survives reload | AC-3/4 | #1 | 3x: dueDate 11:30Z, row text exact · **4a: re-run independently** | PASS (4a + C1 SR-TK-030) |
| C-14 | A call at 01:30 AM tomorrow local (previous UTC day) stays on tomorrow's local day: bucket, marker, Today count | gap | #4 | 3x: 2026-10-27T22:30:00Z, Oct 28 bucket, Today unchanged | PASS (C1 SR-TK-032) |
| C-16 | A past date is accepted and the call shows under Overdue as "Expired <date>, <time>" | gap | — | 3x | PASS |
| C-34 | A call due earlier TODAY (time passed) — Upcoming or Overdue? | 3x | #21 | 3x: stays Upcoming (day-based) → PO QUESTION · **4a: confirm** | OBSERVED: Upcoming — PO QUESTION |
| C-35 | Double Save creates one call | BL-SR-030 | #5 | 3x: one create | PASS (C1 SR-TK-033) |
| C-13 | Dashboard Tasks widget shows the same call line | gap | #1 | 3x: full text in DOM, visually cut (VCST-6456 still open) | PASS — VCST-6456 still open |

## C. Tasks page and editing
| # | Condition | Source | Scenario | Status | Verdict |
|---|---|---|---|---|---|
| C-26 | New task: type Call adds Customer + Time + Add to calendar; switching away removes them and no customerId is sent | gap | #6 | 3x | PASS (C1 SR-TK-034) |
| C-19 | A call saved without a customer shows "Customer not assigned" | gap | #8 | **4a** | PASS |
| C-25 | Edit call: title "Edit call", no Type, no Add to calendar | gap | #12 | 3x | PASS |
| C-12b | Edit call unchanged Save keeps dueDate byte-identical; a new time saves the new instant | gap | #12 | 3x: 11:30Z kept; 4:45 PM → 13:45Z | PASS (C1 SR-TK-037) |
| C-36 | Edit task (non-call) → Type Call converts it; afterwards it cannot be converted back | 3x | #20 | 3x: one-way → PO QUESTION | OBSERVED: one-way — PO QUESTION |
| C-37 | A rep with no served customers: New task has no Type select (salesRepTaskTypes = []) | 3x | #18 | 3x · **4a: provenance (pre-existing?)** | Low, PRE-EXISTING (VCST-5732) — not filed |
| C-15 | Complete / delete a call update row, marker, tab counts without reload | reverse edge | #15 | 3x | PASS |
| C-18 | Rep stops serving the customer → call stays, "Customer not assigned", edit keeps the original link | gap | #16 | **4a only if a disposable rep/org pair exists; else NOT RUN + reason** | NOT RUN — no disposable membership pair (SR-TK-038 held) |
| C-17 | Customer picker lists only the rep's served customers (7 = 7) | BL-SR-002 | #13 | 3x: 7 options · **4a: compare with salesRepCustomers** | PASS (7 = 7) |

## D. Add to calendar (AC-1, AC-2)
| # | Condition | Source | Scenario | Status | Verdict |
|---|---|---|---|---|---|
| C-20 | Google ticked: new tab, text "<Title> — <customer>", dates = saved instant / +30 min, details = Notes | AC-1 | #9 | 3x | PASS (C1 SR-TK-035) |
| C-21 | Apple ticked: call.ics with DTSTART = instant, DTEND +30 min, UID = task id, RFC 5545 escaping | AC-2 | #10 | 3x | PASS (C1 SR-TK-036) |
| C-22 | Boxes unticked on every open; both ticked → both exports on one Save; no calendar on edit | AC-1/2 | #9-#11 | 3x | PASS |
| C-23 | Google tab blocked → call saved + warning | gap | — | NOT REACHABLE live (lanes let pop-ups through) — unit-tested per dev | NOT REACHABLE |

## E. Server scope (scoped xAPI) — 4a backend
| # | Condition | Source | Scenario | Status | Verdict |
|---|---|---|---|---|---|
| C-28a | createSalesRepTask with customerId = @td(SR_UNSERVED_ORG.id) is refused ("Customer not found."), nothing saved | BL-SR-002 | #13 | **4a** | PASS (C1 SR-GQL-159) |
| C-28b | updateSalesRepTask moving a call to an unserved customer is refused | BL-SR-002 | #13 | **4a** | PASS (C1 SR-GQL-159) |
| C-28c | Another rep (SR_REP_ACME2) cannot read (salesRepTask) or update/delete PRIMARY's call by id | BL-SR-002 | #14 | **4a** | PASS (C1 SR-GQL-160) |
| C-28d | updateSalesRepTask WITHOUT customerId on a still-served call — link kept or cleared? (VC-API-008) | gap | #12 | **4a** — record exact result | Recorded: omitted key CLEARS — by design (C1 SR-GQL-161) |
| C-28e | create → salesRepTask(id) round-trips dueDate, type Call, customerId, customerName | gap | — | **4a** | PASS (C1 SR-GQL-162) |

## F. Admin and module
| # | Condition | Source | Scenario | Status | Verdict |
|---|---|---|---|---|---|
| C-27 | Admin: TaskManagement.TaskTypes contains "Call"; Tasks app Type filter = Call finds the rep's call, Assignee = rep, due = the instant | gap | #19 | **4a (read-only)** | PASS |
| C-02 | Without Task Management the tile is disabled (VCST-6399) | AC-4 gap | V7 | NOT REACHABLE — TM installed on vcptcore | NOT REACHABLE |

## G. Regression seams (merge of dev in this build)
| # | Condition | Source | Status | Verdict |
|---|---|---|---|---|
| R-1 | Customer page renders Quick actions + Customer activity block, no console errors; Order on behalf / Create quote still disabled | 1c | 3x | PASS |
| R-2 | Hub routes /company/dashboard, /company/my-customers, /company/tasks, /company/activities load | 1c | 3x / 1r | PASS |
| R-3 | Non-call Edit task dialog unchanged (Title, Type, Due, Priority, Notes) | tc:scope 106 | 3x | PASS |

## H. Visual / a11y — 4v (ui-ux-expert)
| # | Condition | Source | Status | Verdict |
|---|---|---|---|---|
| V-1 | Schedule call popup 1440 / 375: no clipping, no overflow, controls aligned (BL-UI-*) | visual_surface | **4v** | PASS |
| V-2 | Keyboard: tile reachable, popup focus trap, Escape closes, Time/Priority operable; names on fields + "Add to calendar" group (BL-A11Y) | visual_surface | **4v** (VCST-6459 / VCST-5713 known) | PASS (axe 0; 1 incomplete) |
| V-3 | Task row call line and widget line legibility (VCST-6456 known) | visual_surface | **4v** | PASS — VCST-6456 known |
| V-4 | vs. DESIGN — the ticket has a PNG mockup, no Claude Design prototype | visual-axis | SKIPPED (no design project) | SKIPPED |

## Coverage record (3-exec · 2a)
- **PENDING-A: none.** Every condition above resolved at 3-exec to a checklist row; the authored rows are additional coverage, not the only coverage of any condition. Scenario #7 (change customer to another served org) is carried by SR-GQL-162 after the 3-cases fix round.
- **1b item 2e scan (scope + risk terms):** `--domain sales-rep,task-management --suite 091,106,085,050m,093,093b,092b --observable "Schedule call" --observable "Schedule Call" --observable "Customer not assigned" --observable "Add to calendar" --observable "createSalesRepTask" --observable "updateSalesRepTask" --observable "salesRepTasks" --observable "TaskTypes" --observable "Due date"` → 22 hits, all WILL_RUN, FILTERED_OUT not-yet-computable, unscannable [], unmatched: Customer not assigned · Add to calendar · createSalesRepTask · TaskTypes (all four now covered by SR-TK-030..042 / SR-GQL-159..161).
- **2a dispositions (22):** RE-BASE — 091 SR-CP-023 (asserts Schedule call is a disabled placeholder; live it is enabled; PR #26 unmerged ⇒ assertion kept). **Its C1 FAIL is EXPECTED** and is the RE-BASE resolution, not a defect; the row is re-based by `/qa-test-lifecycle` once PR #26 merges. CONFIRMED — 085 TASK-001, TASK-026; 106 SR-TK-001, 005, 010, 011, 012, 014, 015, 016, 017, 018, 019, 020, 021, 022, 023, 025, 026, 028, 029 (non-call task / calendar mechanics unchanged; edit rows open an unchanged "Edit task" and never enumerate Type). Not a hit, read on request: 093b SR-HD-100 CONFIRMED (journey never touches call surfaces). REPAIR: none. SUPERSEDED: none.
- C-28c "other rep": the API lane used SR_REP_ACME2 (serves only ORG_ACME); the authored row SR-GQL-160 uses SR_REP_DOCS (also serves ORG_ACME, has a sign-in alias) — same isolation condition.

## Not covered, and why
- DST hours — machine zone UTC+3 has no DST; no lane emulates a zone.
- Task Management absent (VCST-6399) — module installed on this stand.
- Google pop-up blocked — no lane blocks pop-ups.
- PO questions carried: AC-10 Normal vs Medium · AC-5 translated title · Notes 1000 vs 250 · "Schedule call"/"Save" vs mockup · past-time-today stays Upcoming · one-way Edit task → Call.
