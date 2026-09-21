# Testing checklist — VCST-5732 "[E2E] Sales Rep Task Management"

Env **vcptcore_qa1** · theme `Ver. 2.58.0-pr-2464-595d` · `VirtoCommerce.SalesRep 3.1009.0-pr-16-e348` · `VirtoCommerce.TaskManagement 3.1005.0` · run date 2026-09-17 · path **FULL**

Rep: `salesrep@sales.rep`, store `B2B-store`. Surfaces: `/company/dashboard` (widget **"Tasks & due dates"**, right rail) and `/company/calendar` (the Tasks page proper).

Fixture: 14 `AGENT-TEST-TASK <word>` tasks. **Group sizes are deliberately all different** — overdue **2** (Zulu, Mike) · due-today **3** (Alpha 07:00, Sierra 12:00, Delta 20:00) · future **5** (Yankee, Bravo, Romeo 09-24, Charlie 09-24, Oscar) · completed **4** (Echo, November, **Tango** = completed ∧ due today, **Foxtrot** = completed ∧ due future). **Due dates are relative to today — re-seed before running.**

Oracles: `{SPEC}` = the two ticket mockups, `screenshots/design-81444.png` (dashboard widget) + `design-81445.png` (calendar page). `{BL}` = `BL-SR-002/011/020/024-028/031/032`. `{OBSERVED}` = the API facts recorded per item.

---

## A. Already established — do NOT re-run, carried as evidence

| # | Condition | Verdict | Evidence |
|---|---|---|---|
| A1 | Tasks widget present on the hub dashboard (AC 1) | **PASS** | 1c: right rail, header "Tasks & due dates", `Full calendar →`; matches `design-81444.png` |
| A2 | Create form offers Title / Description(Notes) / Due date / Priority (AC 3) | **PASS** | 1c: `New task` modal, all four present + optional `Type` |
| A3 | Overdue group = exactly {Zulu, Mike} | **PASS** | 1c UI `Overdue 2`; server `filter:"overdue"` = 2 |
| A4 | Completed group = exactly {Echo, November, Tango, Foxtrot} | **PASS** | 1c UI `Completed 4`; server = 4 |
| A5 | Completion outranks date — Tango (completed ∧ today) and Foxtrot (completed ∧ future) absent from Upcoming | **PASS** | 1c both confirmed absent; server excludes both |
| A6 | Cross-rep isolation + anonymous denial | **PASS** | orchestrator: foreign `salesRepTask(id)`→`null`; update/complete/delete→"Task not found."; anonymous→`Unauthorized`; victim task intact |
| A7 | Server validation on create: `name` required, `dueDate` required, `priority` ∈ {Lowest,Low,Normal,High,Highest} | **PASS** | orchestrator: structured errors, nothing persisted |
| A8 | `completed: null` renders correctly (no `undefined`, no mis-bucketing) | **PASS** | 1c: checkbox labels `Mark … as completed` vs `Reopen …`; pills correct |
| A9 | Sorting correct in all five orders; paging works; keyword search works | **PASS** | orchestrator, API layer |
| A10 | Zero JS errors, zero 4xx/5xx, no `errors[]` inside a 200, across the whole 1c session | **PASS** | 1c console + network |

---

## B. To execute — writes required. Each item names what would make it FAIL.

### B1 — **Priority round-trips across all five values** `[downgraded — see correction]`
**CORRECTION (14:05 UTC).** This item was written on a wrong premise. The orchestrator's first probe guessed candidate words and never tried `Lowest`/`Highest`, so it mistook an incomplete probe for the API's full vocabulary. Re-probed exhaustively: the server accepts **Lowest · Low · Normal · High · Highest** (case-insensitive, normalised on store) and rejects `Urgent`/`Critical`/`Medium`. **The UI's five-option dropdown exactly matches the API — there is no mismatch and no defect here.**
- Reduced to a round-trip check: create one task at each of the five priorities, confirm each persists and re-reads as the value chosen, and confirm the Edit modal shows the same five.
- **FAIL only if** a value the dropdown offers fails to save, or round-trips as a different value.

### B2 — **Does editing through the date-only control destroy data?** `[highest value]`
`updateSalesRepTask` is a **full replace**: the orchestrator sent `{id, name}` alone and `description`→null, `type`→null, **`dueDate`→null**, `priority` High→Normal. A null `dueDate` is a state create forbids, and such a task falls out of every group and off the calendar.
- Open **`AGENT-TEST-TASK Alpha`** (due `2026-09-17T07:00:00Z`, type `Order Review`, priority High, has a description). Change **only the Title**. Save.
- **Capture the `updateSalesRepTask` request variables verbatim** — does the form send all five fields, or only the dirty one?
- Then re-read the task and report every field. **FAIL if** description, type, priority or dueDate changed without the rep touching them.
- Separately: does the **07:00 time-of-day survive** a save through the date-only control? The day list orders by time, so losing it reorders the day.
- Then **use the `Type` field's `Clear` button** and save — confirm that clearing Type is distinguishable from Type being wiped by omission.

### B3 — **`All` is day-scoped, but the design says it is global**
`design-81445.png` shows `All 20 · Upcoming 10 · Overdue 4 · Completed 6` — 10+4+6 = 20, so **All is the global total** in the spec, while the day panel separately reads "3 of 3 tasks". Live, `All` renders `4` (the selected day) beside a global `Upcoming 8`, from `salesRepTaskCounts`' `day:` alias.
- Select Sep 17, Sep 24, Sep 25 in turn and record the four chip counts each time.
- **FAIL if** `All` changes with the selected date while its three siblings do not — one chip row cannot mix a day-scoped count with three global ones under a label the spec defines as global.

### B4 — **Calendar day indicators: one dot per task, or one per status?**
`design-81444.png` shows **May 15 with three green dots** and the selected May 28 with three dots for "3 tasks" — i.e. **a dot per task, coloured by status**. Live, 1c observed markers are per distinct *status*.
- Compare **Sep 24 (Romeo + Charlie, two open tasks)** against **Sep 18 (Yankee, one open task)**, and **Sep 17 (three open + one completed)**.
- **FAIL if** a two-task day is visually and textually identical to a one-task day. Record the `Marked: …` accessible text for each. **Screenshot the month grid.**

### B5 — Create a task end-to-end (AC 2)
Create `AGENT-TEST-TASK-EXEC due tomorrow`, type `Customer Support`, priority `High`, due **tomorrow**.
- **FAIL if** it does not appear in `Upcoming` and on tomorrow's calendar cell **without a manual reload**; or if `Upcoming` does not go 8 → 9.

### B6 — Complete and reopen from the UI (AC 5)
Tick `AGENT-TEST-TASK Sierra` (open, due today) → then reopen it.
- Counts must move `Upcoming 8→7`, `Completed 4→5`, and back. The Sep 17 day marker must change.
- **FAIL if** a count does not follow, the row does not move group, or a reload is needed to see either. Then **reopen it and confirm every count returns exactly to 8 / 4** — a reversal that does not restore is the finding.

### B7 — Open task details (AC 6)
Clicking a task name opens the **`Edit task`** modal; there is **no read-only detail view and no per-task deep link**.
- Record which of `name/description/type/priority/dueDate/completed/createdDate` are shown. 1c found `completed`, `createdDate`, `modifiedDate` are **not** displayed anywhere.
- Judge against `{SPEC}`: do the mockups show a detail view distinct from an edit form? Report the answer, do not assume.

### B8 — Date click discards an active filter
Select the `Overdue` chip, then click a calendar date. 1c observed the chip selection silently resets to `All`.
- **FAIL if** the rep's filter is discarded with no indication. Record whether the reverse (chip after date) also resets the date.

### B9 — Does the dashboard widget silently truncate a busy day?
The dashboard day list queries `first:5`; the calendar page uses `first:15`; **no pagination control is rendered and `after` is always `"0"`**.
- Sep 17 already holds 4 tasks. Create **two more due today** so the day holds 6.
- **FAIL if** the 6th task is simply absent from the dashboard widget with no "+N more" affordance or link. Then delete the two extras.

### B10 — Delete (not in the ACs, but the button is in the modal)
`Edit task` exposes a `Delete` button. There is **no undo** anywhere in this feature.
- Delete one of B9's extras. Is there a confirmation step? What happens to the counts and the calendar cell?
- **FAIL if** a single click destroys a task irreversibly with no confirmation.

### B11 — Is the Tasks widget a hideable layout block? (`BL-SR-024/025/028/031/032`)
Open `Edit layout` on the dashboard. Is **"Tasks & due dates"** listed as a block?
- If yes: hide it → Save → reload. Per `BL-SR-031` **its own queries must not fire** on the reload (check the trace for `SalesRepTasks` / `SalesRepOverdueTaskCount`). Restore it from the hidden-items tray afterwards.
- If it is not a layout block at all, say so — that is itself the answer, and it means `BL-SR-024..032` do not govern it.
- ⚠ Use the dedicated layout rep **`agent-test-sr-layout@example.com`** if you can reach the hub as that account; otherwise note that you mutated `salesrep@sales.rep`'s own layout and **restore it**.

### B12 — Mobile width (UIP-VIEW) + browser Back after completing (UIP-BACK)
Resize to 390 px: does the widget and the calendar page remain usable, or does the month grid overflow? Complete a task, then press browser Back — is the list state coherent?

### B13 — Groups the ACs name that nothing implements
ACs demand five groups: **My Today's tasks · Active · Upcoming · Overdue · Completed**. Neither the UI, the backend's `salesRepTaskFilterRules`, nor **the mockups** contain `My Today's tasks` or `Active`; today's open tasks are labelled `Upcoming`.
- Confirm live, then **state it as an AC-vs-implementation reconciliation item, not as a product defect** — the design agrees with the build, so the ACs are the outlier. This is a 5b input.

---

## Cleanup
Delete every task whose name starts with `AGENT-TEST-TASK-EXEC`; restore `Yankee` to priority `Normal`, `Alpha` to its original title/description/type/priority/due date, `Sierra` to open, and any layout change from B11. Leave the 14-task fixture as found; if unsure, say so and the orchestrator re-seeds.

---

## Execution verdicts — filled in at close-out, 2026-09-17

| # | Verdict | Basis |
|---|---|---|
| B1 | **PASS** | All five dropdown values save and round-trip verbatim. The premise this item was written on was wrong (see the correction above) — the API vocabulary is five values, identical to the UI. |
| B2 | **FAIL** (narrowed) | The form sends all five fields, so description/type/priority are preserved and the API's full-replace wipe is **not** reachable from the UI. But a title-only edit rewrote Alpha's `07:00` to local midnight — **BUG-1**. |
| B3 | **FAIL** | `All` is day-scoped while its three siblings are global — **BUG-2**. |
| B4 | **FAIL** | One marker per distinct status, not per task — **BUG-3**. |
| B5 | **PASS** | Created, listed, cell marked, `Upcoming` 10→11, no reload. |
| B6 | **PASS** | 11→10 / 4→5 on complete; exact return to 11 / 4 on reopen; no reload. Knock-on: the Sep 17 day marker did **not** change, which is BUG-3, not a B6 failure. |
| B7 | **PASS (as documented)** | Name opens `Edit task`; no read-only view and no deep link — and the mockups show none either, so build and design agree. |
| B8 | **FAIL** | Date and chip silently discard each other, both directions — **BUG-5**. |
| B9 | **FAIL** | Header read "6 tasks" while rendering 5 rows, no overflow affordance — **BUG-4**. Mitigated but not removed by a `Max rows` setting (1–10, default 5). |
| B10 | **PASS** | A confirmation dialog exists ("This task will be deleted permanently. Continue?"); counts and cell update immediately. |
| B11 | **PASS** | It **is** a layout block. Hide → Save → reload fired **no** task queries (`BL-SR-031` holds); restore appended per `BL-SR-025`; the keyboard drag path announced `"Tasks & due dates dropped at position 1 of 2."` |
| B12 | **PASS** | 390 px reflows to stacked cards, month grid fits, no horizontal overflow; Back after completing shows coherent state. |
| B13 | **CONFIRMED** | Live chips are exactly `All · Upcoming · Overdue · Completed`. No `My Today's tasks`, no `Active` — in the UI, in `salesRepTaskFilterRules`, or in the mockups. **Reconciliation item, not a defect.** |

**Mid-run fixture incident.** The 3a seeder ran a teardown-and-reseed at ~13:57:36 UTC while this lane was live — an orchestrator scheduling error against the never-parallelise rule. 4a timestamped it from a partial-fixture chip reading (`Overdue 1 · Completed 2` between two readings of `2 · 4`) and **re-verified every count-, membership- and marker-dependent item at 14:19–14:20** against the restored fixture: B3, B4, B8 and B13 all reproduced identically. **No finding rests on a pre-reseed observation alone.**

**Cleanup.** All `AGENT-TEST-TASK-EXEC` rows deleted; `Yankee` priority restored; `Sierra` and `Delta` reopened; the dashboard layout fully restored including the block's original position 1 of 2. `Alpha` could not be restored through the UI — its destroyed `07:00` is BUG-1 itself, and no control can write a time back. **The orchestrator re-seeded after the run; the fixture is back to 2 / 3 / 5 / 4.**
