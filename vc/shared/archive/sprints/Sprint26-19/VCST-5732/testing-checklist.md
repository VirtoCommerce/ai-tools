# Testing checklist (Artifact B) — VCST-5732 · re-test of the 2026-09-18 dispositions

Run: 2026-09-21 · **vcptcore-qa** · `SalesRep 3.1009.0-pr-16-e348` · `TaskManagement 3.1005.0` ·
theme **`2.58.0-pr-2464-2971-2971a77b`** (same PR #2464 as the prior round, **newer build** than the
`-595d` of 2026-09-17, so the fixes are present). Prior round ran on **vcptcore-qa1**.
Rep: `SALES_REP_EMAIL_VCPTCORE` / secret `SR_REP_PASSWORD` (Playwright `--secrets`, bare key name).
Hub: `/company/dashboard` · Calendar: `/company/calendar`.

Fixture (re-seeded this run, `npm run seed:sales-rep-tasks`, decays at 2026-09-22T00:00Z):
**overdue 2 · today 3 · upcoming-future 5 · completed 4 · total 14.** Shared day **2026-09-28**
(`@td(SR_TASK_FUTURE_ROMEO)` + `@td(SR_TASK_FUTURE_CHARLIE)`). Empty days 09-29…10-04.
Time-of-day probe: `@td(SR_TASK_TODAY_ALPHA)` due **07:00Z**.

Numbering is the dev's: **M#n** = the 2026-09-18 01:22 manual comment · **D#n** = the 02:38 deep report.

## Lane A — functional (`qa-frontend-expert`, `playwright-chrome`)

### A1. Claimed FIXED — must now pass
- [ ] **D1 (was High)** Edit **only the Title** of `SR_TASK_TODAY_ALPHA` (due 07:00Z) → save → reopen.
      `dueDate` time of day **unchanged** (still 07:00Z, not 00:00 local / 21:00Z previous day). Assert on
      the persisted value, not the rendered date. The day-list sort position must not move.
- [ ] **M1** Long Title + long Notes do not break the table layout. Dev's fix: Notes capped **1000**
      with a counter, Title clamped to **two lines** (Title's 256 cap pre-existed). Check the clamp, the
      counter, and that the row does not widen its own column.
- [ ] **M2** Clear (cross) icon on the **Type** field is **absent while Type is empty**, present once set.
- [ ] **M3** Widget "overdue tasks" link → `/company/calendar` with the **Overdue** scope selected
      (the prior bug landed on All).
- [ ] **M5** Status marker renders on **every** row of the widget list, not only the first.
- [ ] **M6** Space between date and task count in the widget/day header.
- [ ] **M7** Task-count wording is unambiguous (was "7 of 7 tasks"). Record the exact string.
- [ ] **D4** Widget count agrees with the rendered rows. Dev's fix: reads **"6 tasks (5 shown)"** when the
      `Max rows` cap hides rows. Verify at `Max rows` = 5 (default) **and** at 1 and 10.
- [ ] **D9** Changing the selected date **announces** the change (aria-live no longer empty) — Lane B
      confirms the SR text; here confirm the panel re-render is not silent to a sighted user either.
- [ ] **D15/D17/D18** Verified in Lane B (markup-level); no functional action here.

### A2. Claimed BY DESIGN — verify the stated mitigation actually exists
- [ ] **M4** No widget scroll is deliberate (`Max rows` 1–10). The mitigation is D4's count string — if
      D4 fails, M4 is not mitigated either.
- [ ] **M8 / D5** Date and status chip are **alternate scopes**, not intersecting filters. The claimed
      mitigation: the baseline chip is **labelled with the selected date**. Confirm the label, and that
      switching Upcoming→date→Upcoming is visibly explained rather than silent.
- [ ] **D2** The former "All" chip is now the **selected-date** scope with a date label; its count is the
      day's, the three siblings' are global. Confirm the label makes that readable. **Not re-filed.**
- [ ] **D26** Type `Clear` still clears (omitted = null = cleared, now documented). Capture the
      `updateSalesRepTask` payload and confirm `type` is omitted and the result is `null`.
- [ ] **D21** Week starts Sunday because the store culture is **en-US**. Confirm the store's culture,
      then that the grid follows it (dev's claim is locale-driven end to end). Do **not** re-file.

### A3. Regression around the fixes (fix-induced risk, not in the prior round)
- [ ] Group sizes still exact: overdue **2** · today **3** · upcoming **5** (server folds today into
      upcoming → 8; the client must not show 8 where 5 is meant) · completed **4**.
- [ ] Completion outranks date: `SR_TASK_DONE_TANGO` (completed, due today) and `SR_TASK_DONE_FOXTROT`
      (completed, due 09-26) appear **only** under Completed.
- [ ] Complete → reopen a task (`changeSalesRepTaskStatus` both ways); groups and counts follow without
      a reload. Tri-state: a never-touched task has `completed: null`, a reopened one `false`.
- [ ] Create a task (name + due date + priority) → it appears in the right group without a manual refresh.
- [ ] Notes at exactly **1000** and **1001** chars (the new cap's boundary); Title at **256**/**257**.
- [ ] Click the shared day **09-28** (2 tasks) and an empty day **09-30** (0 tasks, empty state).
- [ ] Ownership guard unchanged: a second rep cannot read this rep's tasks (`totalCount 0` / `null`).

## Lane B — visual + WCAG 2.2 AA (`ui-ux-expert`, **`playwright-edge`**)

**Lane note:** Chrome DevTools MCP has **no `--secrets`**, and every target here is behind the rep
login — so this lane runs on `playwright-edge`, not the agent's default DevTools lane.

### B1. Claimed FIXED — must now pass
- [ ] **M10** Calendar is centred in its container (was pushed left with a gap on the right).
- [ ] **D7** `Title` / `Due date`: the required state is exposed by **some** route (`aria-required` or a
      real label carrying the asterisk) — previously by none.
- [ ] **D12** Meta line on the hovered row ≥ **4.5:1** (was 3.76:1 hovered / 4.54:1 at rest).
- [ ] **D13** Chip counts on the page canvas ≥ **4.5:1** — resolved together with D19.
- [ ] **D19** Only the **selected** chip's count is accented; the other three are neutral.
- [ ] **D20** Breadcrumb `Home / My account / Sales Rep Hub / Calendar` present, at desktop **and** ≤768px.
- [ ] **D22** Date reads `Sep 17, 2026`-style, **no uppercase transform**.
- [ ] **D15** Checkbox column `<th>` is no longer empty (the Lighthouse `td-has-header` source).
- [ ] **D17** At ≤768px the row control keeps its verb (`Edit "<name>"`, not the bare title).
- [ ] **D18** Disabled Save now conveys **why** (advisory, dev says done).
- [ ] **D3/D10** A day's screen-reader description now carries the **count**: e.g. "3 tasks. Marked:
      Upcoming, Overdue". A 1-task day must **not** announce identically to a 2-task day —
      compare **09-22** (1) against **09-28** (2). Dots-per-status stays by design; **do not re-file**.
- [ ] **D9** The aria-live region actually announces on date change.

### B2. PARTIAL — re-measure, do not assume
- [ ] **D11** White-background half: Completed dot moved -400→-600, must clear **3:1**.
      Selected-tile half is **not fixed** and the tile is now **brand orange**, so the prior 1.60 / 2.67
      figures no longer apply — **re-measure from scratch** and report the new ratios.

### B3. DEFERRED to a UI-kit ticket — re-verify against current head, then route separately
Dev explicitly asks for **D14 and D16** to be re-checked: VCST-5653's focus-ring work (`focusActiveCell`)
merged after the prior run.
- [ ] **D6** (highest severity on the prior list) `vc-textarea` — `aria-labelledby` self-reference +
      `for` vs `forId` so `VcLabel` renders a `div`. Confirm still failing, in both modals.
- [ ] **D8** `vc-calendar` — selected date conveyed by colour alone (`aria-selected`/`aria-current` null).
- [ ] **D14** `role="application"` on the grid → re-verify vs head.
- [ ] **D16** `tabindex="0"` on the wrong cell → re-verify vs head (may be fixed by `focusActiveCell`).
- [ ] **D23/D24/D25** mockup deviations kept by design (link-styled titles · no card title · 4x4 vs 6x6
      dots). Confirm the built state matches what the dev described; **do not re-file**.

### B4. Out of scope — confirm still present, recommend own tickets
- [ ] **D27** `Unknown variable dynamic import: ./virto-provider.vue` on `/sign-in`.
- [ ] **D28** axe `button-name` on the header account menu at ≤768px.

**Methodology carried over:** axe returned **zero** violations last round while eleven genuine AA failures
were present. A green axe run is not evidence — every B item needs a manual or Lighthouse confirmation.

## Not a checklist item — the open product decision
The ACs ask for **five** groups; the UI has four, the backend three, and **both mockups on the ticket show
the four that were built**. Dev's answer is "no action, product call". Oleg was asked on 2026-09-18 and
**has not replied**. This stays flagged, never re-filed as a defect — the build agrees with the design.

**Scope:** run ONLY this checklist. Do NOT run regression suites in this session.
**Evidence:** `.claude/skills/qa-evidence/evidence-capture-policy.md`. Screenshots →
`reports/tickets/Sprint26-19/VCST-5732/screenshots/`. HAR always; console errors only; network 4xx/5xx + >2s.

---

## RESULT — executed 2026-09-21, 14:00–14:21Z (per-item verdicts in `summary.json`)

**17 FIXED · 2 FIXED-with-caveat · 1 REOPEN · 11 by-design mitigation CONFIRMED · 4 UI-kit still open ·
1 PARTIAL re-measured · 2 out of scope · 8/8 A3 regression checks PASS · 0 net-new defects from the fixes.**
Console across the whole functional session: **zero errors, zero warnings**; no GraphQL `errors[]` inside a
200; no 4xx/5xx; slowest task call 447 ms.

- **REOPEN — M1 (Medium).** Title half fixed (2-line clamp); **Notes cell has no clamp**, widens its own
  column and starves the Task column (330→170 px Task vs 190→345 px Notes, row ~350 px). Reproduced with
  922 chars of ordinary prose, inside the new 1000 cap. Draft: `reports/bugs/open/medium/`.
- **D1 (the prior High) — FIXED, proven on the persisted value.** Three single-field edits of
  `@td(SR_TASK_TODAY_ALPHA)` each kept `dueDate 2026-09-21T07:00:00Z`, verified by a fresh page-load query,
  not the mutation echo; sort position unmoved; `12:00Z` also survived both status hops on SIERRA.
- **Caveats, not clean passes:** **D9** sighted half fixed, but no live-region role exists in the
  accessibility tree — the announcement is not delivered. **D7** requirement exposed only *after* a failed
  Save. **D18** Save is not disabled at all — outcome achieved, mechanism differs from the dev's note.
- **D11 PARTIAL, second half WORSE:** white-bg Completed dot now 5.31:1 (passes), but on the selected tile —
  now brand red — the dots read **1.02:1** and **1.16:1**, against 1.60/2.67 before. Baseline re-measured
  from scratch because the tile colour changed.
- **UI-kit cluster re-verified against head, as the dev asked:** D6 still failing (**no** accessible name on
  Notes, both modals) · D8 **relocated** to the `<td>` while focus sits on the `<button>` · D14
  `role="application"` unchanged · D16 **half-fixed** (focus memory works; first Tab still lands on day 1).
- **Out of scope:** D28 confirmed (axe `button-name`, critical, 2 nodes) · **D27 did NOT reproduce** on two
  engines — record as intermittent, not closed.
- **New, pre-existing, outside this ticket:** **INC-1** account-sidebar i18n keys render raw
  (`Quotes.navigation.route_name`; intermittent under `en`, deterministic and 5 keys under `de`) — silent,
  zero console output. **INC-2** all 12 language options carry the US flag + "English (United States)" alt,
  so each announces the wrong language; two duplicate `Nederlands` entries.
- **Environment, not product:** the Loyalty backend-compat banner **occludes `+ New task`** at 1920 px until
  dismissed — `vc-deploy-dev` pin lag on this stand, not a VCST-5732 defect.
- **D21 falsified properly:** the lane switched the store to `de` and the grid became MO…SO with the widget
  localized — week start is locale-driven, Sunday is the en-US store culture. Not re-filed.
- **Uncovered by this run:** the two unimplemented ACs (below) — evidence of absence, not of failure.
- **Fixture after the run:** group sizes restored; field values on ALPHA and SIERRA deviate from the seed.
  **Re-seed before the next round.**
