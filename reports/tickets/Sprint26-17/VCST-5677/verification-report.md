# VCST-5677 — Fix Verification

**Ticket:** VCST-5677 · Bug · Medium · `[vc-shell] VcScheduler: dark theme leaves toolbar and weekday header illegible`
**Fix:** vc-shell PR [#289](https://github.com/VirtoCommerce/vc-shell/pull/289) (`30279bf52`) — merged to `main` 2026-08-12
**Verdict: VERIFIED** — 2026-08-25

## Env

**`@vc-shell/framework`** (vc-shell — separate product, not the storefront). Affected 2.4.0, fixed **2.5.0**.
Source `main @ 324cd9b09` (= v2.5.0); live on hosted Storybook `assets/iframe-1uXuqCDm.js`, built 2026-08-19 10:28 GMT.
No linked fix PR was on the ticket — located from `main`'s history.

## Summary

Root cause addressed, not the symptom: the component draws its own border and radius, so it presents as a card and must
paint its own surface. The day cells always did; the toolbar and weekday header had no background of their own and fell
through to whatever sat behind the component. The fix adds `--scheduler-surface-color: var(--additional-50, #fff)` and
`background: var(--scheduler-surface-color)` on the component root — the **same token the day cells use**, so the whole
card is one surface in both themes rather than patching the two offending strips.

## RED → GREEN (unit)

Guarded by `VcScheduler.style.test.ts`, added by PR #308 ("guard three shipped fixes that nothing was pinning").

| Phase | Source | Result |
|---|---|---|
| **RED** | `VcScheduler.vue` @ parent of #289, test file unchanged | **1 failed (1)** — `expected '' to be 'var(--additional-50, #fff)'` |
| **GREEN** | `main @ 324cd9b09` | **1 passed (1)** — *"paints the scheduler with the dark-theme additional-50 surface token"* |

Evidence: `evidence/red-prefix.txt`, `evidence/green-fixed.txt`.

## Live verification — dark theme

Stories `data-display-vcscheduler--default` and `--recurring-events`, each with `&globals=theme:dark`.
`data-theme="dark"` confirmed on `<html>` **before** measuring. `--additional-50` resolves to `#242a2e`; the
`.vc-scheduler` root exposes `--scheduler-surface-color: #242a2e` and paints `rgb(36,42,46)`. The toolbar and weekday
header are themselves transparent and now inherit that dark card surface. **Values identical in both stories.**

| Element | own background | effective background | color | contrast |
|---|---|---|---|---|
| `.vc-scheduler` root | `rgb(36,42,46)` | — | `rgb(235,235,235)` | — |
| Toolbar title "July 2026" (18px/700) | `rgba(0,0,0,0)` | `rgb(36,42,46)` | `rgb(235,235,235)` | **12.2:1** |
| Toolbar buttons (12px/500) | `rgba(0,0,0,0)` | `rgb(36,42,46)` | `rgb(212,212,212)` | **9.8:1** |
| Weekday labels Mo–Su (12px/500) | `rgba(0,0,0,0)` | `rgb(36,42,46)` | `rgb(163,163,163)` | **5.8:1** |
| Day number badge (13px) | `rgba(0,0,0,0)` | `rgb(31,36,40)` | `rgb(139,148,158)` | **5.1:1** |

Nothing below WCAG AA 4.5:1 (the ticket's cited criterion, 1.4.3). Visually confirmed: one continuous dark surface, no
light band behind the toolbar or the Mo–Su row, buttons no longer read as disabled.

**Light theme — no regression.** `--scheduler-surface-color: #ffffff`; toolbar title 21:1, toolbar buttons 10.4:1,
weekday 7.8:1, day badge `rgb(115,115,115)` on `rgb(250,250,250)` = **4.54:1**.

Screenshots: `screenshots/5677-default-dark.png`, `5677-recurring-events-dark.png`, `5677-default-light-no-regression.png`.
Console: only the benign preload warning.

## Watch item (not a defect, nothing filed)

The light-theme **day number badge at 4.54:1** is the thinnest margin in either theme — it passes AA by 0.04, and any
further lightening of that colour would fail. Worth a token-level guard if the palette is ever retuned; no action now.

## Coverage limits — stated, not assumed

The measured set is the toolbar, weekday header and day cell (the surfaces the ticket names). Dark-theme contrast was
**not** swept across every sub-element — event chips and popovers were not measured, and the `--more-overflow` story
was not checked under dark theme. If a full dark-theme sweep of the component is wanted, that is a separate a11y pass.

## Storefront rules deliberately NOT applied

vc-shell is a separate product: the a11y-gated-themes rule (Coffee + Red) is a **storefront theme** rule and does not
apply — vc-shell ships Light/Dark, and both were measured. `BL-UI-*`, `critical-ui-scope.md` and the 123 regression
suites cover the storefront only.
