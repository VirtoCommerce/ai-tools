# VCST-5803 — Fix Verification (Phase B / GREEN) — **VERIFIED**

Env: vc-shell Storybook `vc-shell-storybook.govirto.com`, story `data-display-vcscheduler--editing-flow` (iframe), framework **2.6.0-rc.0**, bundle `assets/iframe-CYJDt9Tz.js`, playwright-chrome, 2026-09-02.

## Summary

An all-day event with End = Start now saves as a **one-day event**: a chip renders in the July 15 cell and is present in the accessibility tree as a keyboard-reachable event button. The editor's End field shows the **inclusive** last covered day (`7/15/2026`, not the exclusive `7/16/2026`), and that value round-trips — re-opening a saved event via Edit reads the stored exclusive end back as `7/15/2026`. Timed and multi-day paths are unaffected and the VCST-5678 inclusive-end announcement is intact.

Build independently corroborated from the live console banner (`@vc-shell/framework v2.6.0-rc.0`) and bundle URL.

**Scope note (vc-shell ≠ storefront):** `BL-UI-*`, `critical-ui-scope.md`, `storefront-selectors.md` and the `config/test-suites.json` suites do not cover vc-shell and were not cited. Substituted oracle = the component's own `vc-scheduler.docs.md` all-day contract (quoted in the task) plus the PR #351 implementation notes. Elements located by **role + accessible name**; no `data-test-id` lookups. `browser_evaluate` never used — focus proven via the Playwright a11y snapshot `[active]` marker.

## Checklist

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| 1 | One-day all-day End field = last covered day (`7/15`, not `7/16`) | **PASS** | Field `7/15/2026`; End datepicker highlights `gridcell "15" [selected]`. Reconfirmed runs 2 & 3. `screenshots/VCST-5803-item1-endfield-inclusive-7-15.png` |
| 2 | STR run 1 — End=Start saves, chip in July 15 cell | **PASS** | `button "Run1 OneDay AllDay: Jul 15, 2026"` in overlay lane of the Jul 13–19 week. `screenshots/VCST-5803-run1-chip-july15.png` |
| 3 | STR run 2 (independent, fresh reload) | **PASS** | `button "Run2 OneDay AllDay: Jul 15, 2026"` |
| 4 | STR run 3 (independent, fresh reload) | **PASS** | `button "Run3 OneDay AllDay: Jul 15, 2026"` |
| 5 | Event button in a11y snapshot + keyboard-reachable | **PASS** | Tab order: New event → Previous → Today → Next → grid body → `button "Run1 OneDay AllDay: Jul 15, 2026" [active]`. Enter opened the quick-info dialog |
| 6 | Empty state never vanishes without a chip | **PASS** | All 3 runs: "No events yet…" replaced by a rendered chip, never by nothing |
| 7 | End before Start is refused (new fix behaviour) | **PASS** | Start `7/15` + End `7/14` → **Save `[disabled]`**. Refusal presents as a disabled Save button — no toast, no field message. `screenshots/VCST-5803-item7-end-before-start-save-disabled.png` |
| 8 | Timed (All day OFF) end unchanged | **PASS** | End entered `7/15/2026, 5:00 PM` → `button "Timed Event: 12:00 AM – 5:00 PM"` inside the July 15 **gridcell** (not the all-day lane); announced end matches input exactly. Timed picker highlights `16` (raw end, unconverted) — the contrast proving only the all-day branch converts |
| 9 | Multi-day all-day spans correct cells, End field = last covered day | **PASS** | Start `7/15`, End field `7/17`; chip `MultiDay 15to17: Jul 15, 2026 – Jul 17, 2026`. `screenshots/VCST-5803-item9-multiday-span-15to17.png` |
| 10 | VCST-5678 not regressed — chip name + popover announce inclusive end | **PASS** | Multi-day popover `July 15th, 2026 – July 17th, 2026` == field `7/17` == chip name `Jul 17`. One-day popover `July 15th, 2026`. Field and announcement agree in both cases |
| 11 | No new console errors | **PASS** | Whole session (3 loads, ~35 interactions): **0** component errors. Only `favicon.ico` 404 on first load — benign infra, pre-existing |
| 12 | Render/runtime error sweep (stories excluded from typecheck) | **PASS** | Story rendered fully on all 3 loads; no undefined-identifier or runtime error across new-event, edit, all-day toggle, datepicker, time picker, quick-info popover and repeat-select paths |

## STR tally

**3 / 3 PASS.** Each run from a fresh page load (clean empty state), title typed, All day left ON, End explicitly re-picked as July 15 through the datepicker (exercising `setEnd()`), Save clicked. Identical outcome each time.

## Additional confirmation beyond the checklist

**Round-trip through Edit** — the strongest single piece of evidence, and not in the original STR: the saved one-day event stores `end` as the exclusive `7/16 00:00` boundary, and re-opening it via the quick-info **Edit** button renders End as `7/15/2026`. This exercises `endFieldValue` against a *persisted* event rather than a fresh default, where the pre-fix code would show `7/16/2026`.

## Incidental observations (not filed, per instruction)

1. **Time format mismatch, timed chip.** Visible chip label uses 24-hour (`00:00 Timed Event`) while its accessible name uses 12-hour (`Timed Event: 12:00 AM – 5:00 PM`). Sighted and screen-reader users get different notations for the same value. Pre-existing, unrelated to this fix.
2. **End-before-Start refusal is silent.** Save simply disables with no message naming the reason. It satisfies the doc's "refused rather than saved", but a user who picked the wrong date gets no explanation (WCAG 3.3.1-adjacent). Judgment call for the team, not a fix defect.
3. **Datepicker does not auto-close on selection.** After picking a date the overlay stays open and intercepts pointer events, so Save is unclickable until Escape or an outside click. Affects both Start and End; pre-existing vc-datepicker behaviour, cost one retry per run here.
4. **Storybook addon warning** — `Control of type color only supports string, received "boolean"`: an `argTypes` defect in the story meta (not the component), present on every load.

## Not measured

Backdrop-dismiss of the quick-info popover was **not attempted** — proven unmeasurable with this MCP (centre-only click targeting on viewport-centred ancestors). Reported as out of scope, not as a pass.
