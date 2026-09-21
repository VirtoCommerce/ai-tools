# Testing checklist — VCST-5097 `[UI Kit] Date Picker component (Range)`

**Env:** vcptcore-qa1 · storefront `2.58.0-pr-2402-da56-da56daba` · Storybook `https://vcptcore-qa1-storybook.govirto.com`
**Both themes (light + dark) wherever a colour or chrome claim is made.** Evidence →
`reports/tickets/Sprint26-19/VCST-5097/screenshots/`.

> Oracle note: the ticket has **no ACs**. Conditions are derived from PR #2402 + Maya's 2026-09-14 scope
> comment + the 2026-09-16 QA round + `BL-UI-*`/`BL-A11Y-*`. The **diff since `b93b860e` is unavailable**
> (no GitHub access this session), so this is the full stated scope, not a delta.

> **Fixture limit, stated up front (SECOND RULE).** Order `createdDate` is **server-assigned and not
> writable**, so a date-spread order fixture is unseedable on this env — the buyer fixture's orders cluster
> on a single date. Filter *arithmetic* is therefore **not decidable** in this run. Conditions 1/2/12 are
> scoped to what IS falsifiable: a range that **contains** the cluster returns the orders, a range that
> **excludes** it returns zero, and an open-ended bound behaves accordingly. Do not report an arithmetic
> pass; report the coarse result and say the arithmetic was out of reach.

## Lane A — storefront `/account/orders` (qa-frontend-expert, playwright-chrome)

| # | Condition | Expected |
|---|---|---|
| 1 | Desktop 1920 `split`: pick a forward range, Apply | list filters; count matches the range; displayed order dates all inside it |
| 2 | Mobile 375 `combined`: same | same; layout is the combined field |
| 3 | Desktop: backward selection (later date first) | desktop uses two single-date calendars — record whether a band exists at all (N/A is a valid answer, state it) |
| 4 | **Mobile: backward selection** | band paints between the two dates; end caps face **inward** (`8px 0 0 8px` / `0 8px 8px 0`) |
| 5 | **Mobile combined: focus Start then End** | exactly ONE focus ring — on the container, not a ring inside a ring |
| 6 | Apply a range → reopen → **Clear → Escape** | record actual behaviour precisely: does the popover tear down on Clear? does the applied range return? does the visible month move? |
| 7 | Control: Apply a range → reopen → stage an edit → **Escape without Clear** | applied range restores; visible month stays where the user left it. **Use a month ≠ the current month** (a September range in September proves nothing) |
| 8 | Details row: trigger the reversed-range validation message, desktop and mobile | `topDelta` of the following element = **0** at both widths (BL-UI-003) |
| 9 | Focus ring on the storefront calendar, light **and** dark | ≥ 3:1 against its background (WCAG 1.4.11) |
| 10 | Reset / clear the filter | list returns to unfiltered; the active-filter chrome clears |
| 30 | Reverse edge: after Clear, does the list actually reset? | yes, with no stale filter chip |
| P1 | Probe VCST-4892: type `0` as the first digit of a segment | accepted, not swallowed |
| P2 | Probe VCST-5717: open the popover, change values, dismiss WITHOUT Apply, reopen | does it retain the unapplied values? (known-open — confirm still reproduces or not) |
| P3 | Probe VCST-5718: the two "Open calendar" buttons | accessible names must be distinct (BL-A11Y-002) — known-open |
| X | Console errors, 4xx/5xx, GraphQL `errors[]` inside 200, anything > 2 s | none |

## Lane B — sales-rep hub customer orders (qa-testing-expert, playwright-edge)

| # | Condition | Expected |
|---|---|---|
| 12 | Open a customer's orders page as a sales rep; pick a range, Apply | filters correctly |
| 13 | Backward selection here | band paints / caps inward, or state that this host has no band |
| 14 | Focus Start then End | exactly one ring |
| 15 | Clear → Escape | same characterisation as #6 |
| 16 | **Re-check the premise:** are `:min`/`:max` actually passed to the date fields? | On `b93b860e` they were **not** (0 of 42 day cells `aria-disabled`). Re-measure on `da56daba` and say which it is |
| 17 | `clearable` on both bound fields | clear control present and working on both |
| 16d | Details row topDelta | 0 |
| 16f | Focus ring contrast, both themes | ≥ 3:1 |
| **27** | **PARITY — filters.** Enumerate the filter controls on the sales-rep customer-orders page and on storefront `/account/orders`, side by side | Report the divergence as a **table**: which controls exist on each, which are missing, which differ in type/placement/labels. No AC declares parity — this is characterisation, not a pass/fail |
| **28** | **PARITY — date control.** Which component does each surface use today? | Storefront uses the new range component; record exactly what sales-rep uses (`VcDatePicker` ×2? the range picker? something else) and whether the ticket's replacement has reached it |
| **29** | **PARITY — mobile @375.** Both surfaces at 375 px | Report the divergence: table→card transformation, filter entry point (drawer vs popover), touch targets ≥ 24×24 (BL-UI-006), horizontal overflow (BL-UI-004) |
| Y | Known-open re-check: sales-rep date fields clipping their own value (`08/10/2026` → `08/10/202`) | still reproduces? |
| X | Console / network / GraphQL as Lane A | none |

## Lane C — Storybook (ui-ux-expert, Chrome DevTools MCP)

Entry point: `https://vcptcore-qa1-storybook.govirto.com/?path=/docs/components-organisms-vcdaterangepicker--docs`

| # | Condition | Expected |
|---|---|---|
| 18 | Every `VcDateRangePicker` and `VcDateRangeInput` story renders; forward range select | no error, correct paint |
| 19 | Backward range select in `VcRangeCalendar` | band paints, caps inward |
| 20 | Nested focus ring check on the combined-layout stories | exactly one ring |
| 21 | Clear → Escape in a story | characterise |
| 22 | Escape without Clear (control) | reverts to committed |
| 23 | `--min-max` with a value outside the span | grid clamps to the allowed span, does not strand |
| 24 | bounded **+** clearable together | **known gap: no permanent story combines them.** Confirm whether one now exists; if not, that is still an open coverage item |
| 25 | `--reserved-details-row`: topDelta at **324px and 122px** field widths, both components | 0 at both (BL-UI-003). The 122px case is the one that historically failed |
| 26 | Focus ring on `VcRangeCalendar` nav ×4, day cell, footer button — light and dark | ≥ 3:1, and identical computed style to `VcCalendar`. (The orange inset 2.11:1 is the **today** marker, not the focus indicator — do not report it as a failure) |
| 31 | axe-core scan on the range stories, both themes | 0 violations. Known-open VCST-5994 says error state is visual-only on date-range fields (no `aria-invalid`, no message link) — confirm whether it still reproduces |
| 32 | Keyboard-only full range selection | Home/End/PageUp/PageDown, **Shift**+PageUp/PageDown for year (Shift is the correct APG binding) |
| 33 | Dark-theme error text contrast on `VcDateInput` | known-open at 4.34:1 vs 4.5:1 — re-measure, do not re-file |
| X | Console errors across the walked stories | 0 |

## Business rules in force

- **BL-UI-003** — hover, focus, **validation-message insertion**, badge updates and skeleton→content swap MUST NOT move adjacent elements; `topDelta` and `leftDelta` must be 0.
- **BL-UI-004** — text and children stay inside their container at every viewport; long content wraps, truncates **with an explicit ellipsis indicator**, or scrolls — never clipped silently. Document horizontal scroll at 375/768/1024/1280/1920 is a bug.
- **BL-UI-006** — at ≤768 px every interactive element measures ≥ **24×24 CSS px** (WCAG 2.2 SC 2.5.8 AA) and should reach 44×44, with ≥8 px gap. Padding counts. Below AA = FAIL; AA-to-AAA = WARN against the kit's own 26/32/38/44/52 ladder.
- **BL-UI-007** — every control the surface adds is Tab-reachable in DOM order, keyboard-activatable, exposes role + state + a non-empty accessible name, and shows a visible focus indicator; focus is never trapped. Text 4.5:1, icons and focus indicators 3:1.
- **BL-A11Y-002** — every interactive control exposes a non-empty, **contextual** accessible name (WCAG 4.1.2), distinct from a generic element-type label; every visible label is programmatically associated with its input.

---

# Results — 2026-09-17, build `2.58.0-pr-2402-da56-da56daba`

## Lane A — storefront

| # | Verdict | Measured |
|---|---|---|
| 1 | PASS | 08/01–08/31 → `totalCount 17`, 9/16 order excluded; filter `createddate:["2026-07-31T21:00:00Z" TO "2026-08-31T20:59:59Z"]`. Control 09/01–09/15 → 0 |
| 2 | PASS | combined layout confirmed; 08/10–08/24 excludes the 9/16 order |
| 3 | **N/A, stated** | desktop has no band at all — two independent single-date calendars |
| 4 | PASS (light + dark) | caps face inward: start pill right edge constant x94 square, end pill left edge constant x55 square |
| 5 | PASS (light + dark) | exactly one ring, on the container, for both segments |
| 6 | **FAIL** | Clear no longer tears the popover down, but the applied range does not return and the visible month jumps July → September |
| 7 | **FAIL** | control case: staged edit persists, applied range does not restore. **Passed on `b93b860e` two days earlier** |
| 8 | PASS | topDelta 0 / leftDelta 0 at 1920 and at 375 |
| 9 | PASS | light 7.81:1, dark 5.35:1 against the 3:1 gate |
| 10 · 30 | PASS | list returns to 18, chips gone, no stale chip |
| P1 | does not reproduce | `0` accepted as first digit |
| P2 | **still reproduces** | dismissed showing `07/10/2026` while the chip read `Start: 8/5/2026` (VCST-5717) |
| P3 | **still reproduces** | two buttons both named `Open calendar` (VCST-5718) |

## Lane B — sales-rep + parity

| # | Verdict | Measured |
|---|---|---|
| 12 · 15 | mechanism only | rep has **zero orders across all 20 customers** — filtering correctness undecidable |
| 13 | N/A, stated | no band; each field mounts `vc-calendar--mode--single` |
| 14 | PASS | one ring; no shared container to ring |
| 16 | **premise false, re-measured** | `:min`/`:max` still not passed — 42 day cells, 0 `aria-disabled` |
| 17 | PASS | clear control on both fields |
| 16d | PASS | topDelta 0 / leftDelta 0 |
| 16f | PASS | light 3.67:1, dark 10.45:1 |
| 27 · 28 · 29 | characterised | three parity tables → VCST-6001 |
| Y | **still reproduces** | scrollWidth 102 vs clientWidth 91, `text-overflow: clip`. Cause isolated: the Clear decorator → VCST-6002 |

## Lane C — Storybook

Rows 18–23, 25, 26, 32: **PASS**. Row 24: coverage gap still open (no bounded+clearable story).
Rows 31/33: dark-theme error text 4.34:1 against 4.5:1 (VCST-5935, wider than recorded).
**VCST-5994 does not reproduce** on the date-range fields — `aria-invalid` + `aria-describedby` present and linked.
Console 0 errors. axe-core light: 0 violations.

## C1 — `REG-2026-09-17-0137`

| Case | Verdict | Why |
|---|---|---|
| ORD-075 | FAIL, expected | RE-BASE resolved: unapplied values retained (VCST-5717) |
| ORD-081 | FAIL, expected | RE-BASE resolved: URL never carries date params; after Back the filter is lost (VCST-5213). **The run's only evidence on this edge** |
| ORD-101 | PASS | caps face inward, confirming the live lane |
| ORD-102 | PASS | one ring on the outer container |
| ORD-103 | PASS | topDelta 0 at both viewports; field width 259px mobile / 181px desktop — **far above the ~122px Storybook case**, exactly as the row now states |
| SR-CO-038 | BLOCKED | precondition customer not in this rep's book; premise still characterised on a sibling customer |

## Not verified — stated so it is not mistaken for coverage

Filter arithmetic on any surface (`createdDate` unseedable) · filtering correctness on sales-rep (zero orders) ·
the commit delta since `b93b860e` (no GitHub access) · the ~122px narrow-field case on the storefront
(architecturally out of reach there) · App Insights correlation (no API key for this env).

---

# Round 4 — sales-rep re-test on SEEDED data, 2026-09-17

Fixtures were seeded after round 3 (`npm run seed:sales-rep`, `TEST_ENV=vcptcore_qa1`): 14 orders,
7 visible to the rep on AcmeCorp across New / Processing / Cancelled / Payment required, two stores.
Signed in as `agent-test-sr-primary@example.com`. **This round exists because round 3's "undecidable"
was my error, not a property of the environment** — `createdDate` is unseedable, but orders are not.

| Condition | Round 3 | Round 4 |
|---|---|---|
| Orders render | no data | **PASS** — 7 rows, 4 statuses, totals $42–$247 |
| Range containing today | undecidable | **PASS** — 7 returned, chips + Reset render |
| Past-only range | undecidable | **PASS** — 0 returned, "No orders match this filter" |
| Status filter exists? | "absent on both, NOT decidable" | **SETTLED — it EXISTS.** 4 checkbox facets with counts (New 3, Processing 2, Cancelled 1, Payment required 1); applying New alone → exactly 3 rows |
| VCST-5868 zero-match | not testable at all | **HALF-FIXED** — chips correct and functional; the panel's whole "Select order status" section still vanishes, active selection included |
| 375px table→card | "not observable on both" | **PASS with a defect** — cards render, no horizontal overflow (375 == 375), chips wrap cleanly, targets ≥24×24. **New: Total wraps mid-number**, `$247.0` / `0` → VCST-6005 |
| Chips + Reset | undecidable | **PASS** — Reset cleared all three terms and restored 7 |
| VCST-6002 clipping | reproduced | **reproduced, trigger isolated**: only once BOTH fields carry a value (each gains a Clear, input 104→91px). Observed `09/01/2026` → `09/01/202` (tail cut) and `09/30/2026` → `9/30/2026` (head cut). Desktop-only. **A lane-reported “08/20/2026 → 3/20/2026” was WRONG and briefly drove a High — clipping cannot introduce a digit; corrected on the ticket, back to Medium** |
| SR-CO-038 bounds premise | not passed | **confirmed two ways** — `min`/`max` null on both inputs, and August days clickable with Start = 09/01. Consequence bounded: inverted range yields "Invalid date range." + Apply disabled |

**Parity gap that empty data had left (VCST-6001, 375px row only).** Both surfaces card-ify, into different
cards: sales-rep shows 4 fields with **no labels**, order number wrapping to 2 lines, Total wrapping
mid-number; storefront shows 5 fields **with labels**, order number ellipsis-truncated on 1 line, Total on
one line, 2×2 grid with the status chip top-right, and its filter control is an icon-only funnel on the
**left** of search versus a labelled "Filters" button on the right.

**Still out of reach, unchanged:** per-day filter arithmetic, boundary-day behaviour, rolling windows,
recency ordering, and the Date sort control — all 7 orders carry `Sep 17, 2026` within seconds of each
other, so every window contains all or none. No pass claimed on any of it.

**Count note:** 14 orders seeded, 11 visible through the rep (AcmeCorp 7, TechFlow 2, BuildRight 1,
AcmeWest 1). Two are expected absences by design — one sits in a deliberately unserved org, one in the
Electronics store while browsing B2B-store. The third gap (a TechFlow order) is **unexplained** and wants a
backend lane; the frontend is self-consistent (widget, YTD stat and list all say 7), so the exclusion is
upstream, not a render bug.

**Health:** 0 console errors, 0 warnings, no 4xx/5xx, nothing over 2s.
