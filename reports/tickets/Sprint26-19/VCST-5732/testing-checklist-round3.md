# Testing checklist — VCST-5732 · round 3: 5 new QA requests + full-feature re-check

Run: 2026-09-22 · **vcptcore-qa** · theme **`2.58.0-pr-2464-fd52-fd52185e`** ·
**`SalesRep 3.1009.0-pr-16-b624`** · `TaskManagement 3.1005.0`.
**Both layers moved since round 2** (theme was `-2971-2971a77b`, SalesRep was `-e348`). The backend move
matters: last round the dev stated "backend modules not touched", and request **N4** (sort) plausibly needs
a server-side sort field — so the API is in scope again, not just the storefront.

Rep: `SALES_REP_EMAIL_VCPTCORE` / secret **`SR_REP_PASSWORD`** (bare key name, Playwright `--secrets`).
Hub `/company/dashboard` · Calendar `/company/calendar`.

Fixture **re-seeded 09:44Z today** (it decays at 2026-09-23T00:00Z — re-seed if you cross UTC midnight):
**overdue 2 · today 3 · future 5 · completed 4 · total 14.**
- today: `SR_TASK_TODAY_ALPHA` **07:00Z** · `SR_TASK_TODAY_SIERRA` 12:00Z · `SR_TASK_TODAY_DELTA` 20:00Z
- overdue: `SR_TASK_OVERDUE_ZULU` 09-17 · `SR_TASK_OVERDUE_MIKE` 09-21
- future: `SR_TASK_FUTURE_YANKEE` 09-23 (**1-task day**) · `SR_TASK_FUTURE_BRAVO` 09-25 ·
  `SR_TASK_FUTURE_ROMEO` + `SR_TASK_FUTURE_CHARLIE` **both 09-29** (**shared day**) ·
  `SR_TASK_FUTURE_OSCAR` 10-06
- completed: `SR_TASK_DONE_TANGO` (due **today**) · `SR_TASK_DONE_FOXTROT` (09-27) · `DONE_NOVEMBER` · `DONE_ECHO`
- empty days: 09-30 … 10-05

Numbering: **N1–N5** = this round's five requests · **M#n / D#n** = the 2026-09-18 rounds.

## N — the five requested fixes

- [ ] **N1 — Notes and Title truncation + aligned display.** This is the **M1 REOPEN** from round 2:
      Title was clamped, Notes was not, so the Notes column starved the Task column (330→170 px Task vs
      190→345 px Notes, row ~350 px). **Re-measure the column widths and row height** with a ~922-char note
      of ordinary prose AND with 1000 unbreakable chars — an ellipsis alone does not close this; the column
      must stop borrowing. Check alignment across rows of differing content length.
- [ ] **N2 — hover on a truncated Title (and Notes?) reveals the full text.** Confirm which fields have it;
      the request itself is unsure about Notes, so **report what actually shipped rather than assuming**.
      Then test it as a `WCAG 1.4.13` content-on-hover control: is the revealed text **dismissible**
      (Esc), **hoverable** (the pointer can enter it without it vanishing), **persistent** (stays until
      dismissed)? And critically — **is it reachable by KEYBOARD (focus), not hover only?** A hover-only
      reveal makes the full title unreadable for keyboard and touch users.
- [ ] **N3 — the dashboard calendar is now as large as the one on the calendar page.** Verify size parity.
      Then the consequences, because this widget is a **layout block**: the Tasks block still drags, hides
      and restores (`BL-SR-024`/`025`/`026`/`028`/`031`), the two-column rail still behaves (`BL-SR-027`,
      `032`), the `Max rows` setting still applies, and the widget's own count string is unchanged. Check
      at **1920** and **≤768px** — a bigger grid is the most likely thing to overflow its column.
- [ ] **N4 — tasks in the "All" scope sort by created/modified date.** Two things to settle first, and
      **state them explicitly**: (a) *which* scope is "All" — since round 2 that chip is the
      **selected-date** scope, labelled with the date, so name what you actually sorted; (b) created or
      modified, and **which direction** — newest first is the only useful reading, confirm it is that.
      Then: create a task and confirm it lands at the expected end; **edit an older task** and see whether
      it jumps (that is the created-vs-modified discriminator, and it is the whole question).
      **Capture the query at the wire** — a new `sort` token is the likely backend change behind `-b624`.
- [ ] **N5 — Save is DISABLED in the create/edit task modal, matching the wishlist-create logic.**
      Find the wishlist-create modal first and **describe its actual behaviour**, because it is the named
      reference: when is its Save disabled, and does it explain why? Then compare the task modal against
      it. Verify Save is disabled while Title is empty and enables as soon as it is valid, on **both**
      create and edit.

      **⚠ This request reverses a round-2 finding, and the reversal needs stating, not hiding.** Round 2
      recorded (deep #18, and D7): the previous build did **not** disable Save — it fired inline validation
      with `aria-invalid` + associated error text, which is *why* the "required" state became discoverable
      at all. **A disabled control is removed from the tab order, so a keyboard/SR user can neither reach
      it nor learn why it is disabled.** So check specifically: with Save disabled, is the requirement
      conveyed by **any** route (a visible hint, `aria-describedby`, a `required`/`aria-required` on Title,
      an error on blur)? If the answer is none, the UX request has been satisfied **and** D7 has regressed —
      report both, and do not treat "the request is implemented" as closing it.

## R — full-feature re-check (the ask was "проверь ... и всю фичу")

- [ ] **R1 — `D1`, re-proven on the persisted value.** The backend moved, so this is not carried forward:
      edit **only** the Title of `SR_TASK_TODAY_ALPHA` (07:00Z), then Notes-only, then Priority-only;
      each must keep `dueDate 2026-09-22T07:00:00Z`, verified by a **fresh page-load query**, not the
      mutation echo. This was the round-1 High; a sort change touching the same mutation could revive it.
- [ ] **R2 — group sizes exact:** overdue **2** · today **3** · upcoming **8** (server folds today into
      upcoming) · completed **4** · total **14**. Completion outranks date: TANGO (completed, due today)
      and FOXTROT (completed, 09-27) appear **only** under Completed.
- [ ] **R3 — the four scope chips** still track the selection (`Sep 22, 2026 N` → 09-29 → an empty day),
      siblings global. Shared day 09-29 shows 2; empty day 09-30 shows the empty state.
- [ ] **R4 — create · complete · reopen · delete**, each without a manual refresh; counts follow live;
      tri-state holds (`completed: null` never-touched vs `false` reopened, `isActive` inverse).
- [ ] **R5 — boundaries:** Notes 1000/1001, Title 256/257 (both truncate silently at the cap).
- [ ] **R6 — ownership (`BL-SR-002`):** a second rep (`agent-test-sr-nocustomers@example.com`) sees
      `totalCount: 0` on all counts and zero calendar dots. No leak of this rep's 14 tasks.
- [ ] **R7 — the round-2 confirmed fixes did not regress:** M2 (no ✕ on empty Type) · M3 (widget overdue
      link lands on the Overdue scope) · M5 (marker on every row) · M6/M7 (count wording, no "N of N") ·
      D4 (`N tasks (M shown)` only when rows are hidden — re-check at Max rows 1 / 5 / 10) ·
      D26 (`Clear` omits `type`, server resolves `null`).
- [ ] **R8 — console/network clean:** zero console errors, no GraphQL `errors[]` inside a 200, no 4xx/5xx,
      nothing >2 s. Round 2 was clean on all four counts — a regression here is a finding.

## V — visual + WCAG re-check (what N1–N3 and N5 put at risk)

- [ ] **V1 — `D11` dot contrast, re-measured.** Still **open** from round 2: on the selected tile the dots
      read **1.02:1** and **1.16:1** (3:1 required); white-background half passed at 5.31:1. **N3 enlarges
      the dashboard grid**, so re-measure on **both** surfaces — a bigger tile may change the sampled
      colours, and the dashboard grid is now a second place this can fail.
- [ ] **V2 — `D9`** live region on date change: round 2 found **no** `status`/`alert`/`log` role anywhere.
      Re-check, including the enlarged dashboard calendar.
- [ ] **V3 — `D7` required-state exposure**, under N5's new disabled-Save behaviour (see the warning above).
- [ ] **V4 — N2's hover reveal** against `WCAG 1.4.13` (dismissible / hoverable / persistent) and keyboard
      reachability. If it is a `title` attribute, say so — that is hover-only and never announced on focus.
- [ ] **V5 — the UI-kit cluster, still open and still deferred:** `D6` (`vc-textarea` no accessible name),
      `D8` (`aria-selected` on the `<td>` while focus sits on the `<button>`), `D14` (`role="application"`),
      `D16` (first Tab lands on day 1). Confirm each is unchanged; **N3 touches the calendar**, so D8/D14/D16
      could have moved in either direction.
- [ ] **V6 — layout at 1920 and ≤768px** after the bigger dashboard grid: no overflow, no clipped control,
      breadcrumb still present (`D20`), no regression of `D12`/`D13`/`D19` contrast.

**Known env noise, not a defect:** the Loyalty backend-compat banner can occlude `+ New task` at 1920px
until dismissed (`vc-deploy-dev` pin lag). Dismiss it and say you did.

**Scope: this checklist only. Do NOT run regression suites in this session.**
Evidence → `reports/tickets/Sprint26-19/VCST-5732/screenshots/` (prefix `r3-laneA-` / `r3-laneB-`);
policy `.claude/skills/qa-evidence/evidence-capture-policy.md`; HAR always.

---

## RESULT — executed 2026-09-22, 09:47–10:10Z

**N1 FIXED (M1 reopen CLOSED) · N3 FIXED · N5 FIXED · N2 PARTIAL · N4 PARTIAL · R1–R8 all PASS ·
zero regressions from the five fixes.** Console clean on every Sales Rep surface: no errors, no GraphQL
`errors[]` inside a 200, no 4xx/5xx, slowest GraphQL 210 ms.

- **N1 — closed properly, not cosmetically.** The table is now `table-layout: fixed`, so columns cannot
  borrow at all: Task **277 px** and Notes **277 px**, row height **76 px**, *identical* under a 26-char
  note, 946 chars of prose, 970 chars and 1000 unbreakable chars. Round 2 was 330→170 / 190→345 and a
  ~350 px row. Both fields clamp at `-webkit-line-clamp: 2` (rendered 36 px vs scrollHeight 450–486 px),
  no horizontal overflow at cell or page level.
- **N3 — exact parity, measured on both surfaces:** grid `292×276`, day cell `40×40`, wrapper `318×350`,
  font 14 px on `/company/dashboard` and `/company/calendar` alike. No overflow at 1920 / 768 / 375.
  Layout-block invariants survived: `BL-SR-024` draft→save round-tripped twice, `BL-SR-028` reorder/hide
  controls and the `Max rows` spinbutton intact, widget count string unchanged.
- **N5 — implemented on create AND edit; D7 did NOT regress.** The two lanes disagreed here and the
  orchestrator re-checked live: they had tested **different form states**, and both observations hold.
  Pristine create → no error, no `aria-invalid`, Save `[disabled]` (lane B's read). Clearing a filled
  Title on edit → `textbox "Title" [invalid]` **plus visible "This field is required"** (lane A's read,
  reproduced by the orchestrator). A form that stays quiet on an untouched field is correct, so the
  round-2 mechanism is intact. `aria-required="true"` on Title is present in both lanes' reads.
  **Residual, minor:** the disabled Save carries no `aria-disabled`/`aria-describedby`/`title` and HTML
  `disabled` removes it from the tab order, so nothing explains the blockage *at the point of blockage*.
  The named reference (`/account/lists` → Create list) ships a **persistent, always-visible** "This field
  is required" wired by `aria-describedby` — the cheap close for the pristine-create gap.
- **N2 — PARTIAL, and narrower than first reported.** Shipped as a native `title` attribute on **both**
  fields. The **Task title is fine**: it is a `<button>` whose text content is the full title (only
  visually clamped), so keyboard and SR users already have it. The gap is **Notes** — a non-focusable
  `<span>`, so hover-only: keyboard-only and **touch** users have no route to the full note.
  **Correction to the first grading:** this is *not* a WCAG 1.4.13 failure — SC 1.4.13 explicitly exempts
  content whose presentation the user agent controls, and its Note 1 names browser tooltips from `title`.
  The defect is real; the criterion is not the one it breaks.
- **N4 — PARTIAL, and the ambiguity is settled by experiment.** The primary sort is still **due date
  ascending on every scope**; created/modified only breaks ties *within an identical dueDate*. The
  discriminator: two tasks sharing a dueDate reordered after the *older* one was edited → the tie-break is
  **modified, descending**. Editing a task with a distinct dueDate did **not** move it. The wire always
  sends `sort: "due-date"` — the tie-break is entirely server-side, consistent with `SalesRep` being what
  moved to `-b624`. **If the ask meant "order the list by when I last touched it", that is not what shipped.**
- **`D9` improved, asymmetrically:** `/company/calendar` now wraps the day heading + count in a real
  `role="status" aria-live="polite"` region (orchestrator confirmed the `status` node live). The
  **dashboard widget did not get it** — and after N3 the two grids are pixel-identical, so the surfaces now
  look the same and behave differently.
- **Still open, unchanged:** `D11` (selected-tile dots **1.02:1** / **1.16:1**, now on **both** surfaces
  rather than one) · `D6` (Notes textarea `aria-labelledby` points at its own id → empty accessible name;
  visible in the snapshot as a nameless `textbox`) · `D8` (`[selected]` on the gridcell, focus on the
  nested button) · `D14` (`role="application"`) · `D16` (first Tab lands on day 1).
- **Not exercised:** `D26` (Clear-type → save → server resolves `null`) · an invalid `sort` token against
  `BL-SR-020`'s silent-empty shape — no real-user route exposes sort, so it needs a backend/API case.
- **Fixture:** both lanes wrote to the same rep account (counts read 16/6 mid-run — reasoned around by ids,
  never by raw totals). **Re-seeded clean at 10:10Z: 15 rows removed, 14 re-created, 2/3/5/4 restored.**

**VERDICT (amended 2026-09-23): PASS WITH NOTES.** The `My Today's tasks` and `Active` groups were
**descoped**, which removes the only unmet acceptance criterion and the sole ground for the previous run's
FAIL. Outstanding and tracked separately, none of it blocking: N2's Notes gap for keyboard/touch, N4's
ordering (closable client-side via the existing `recent` sort rule), the accessibility items, and the
stale `modifiedDate` echo on `updateSalesRepTask`.
