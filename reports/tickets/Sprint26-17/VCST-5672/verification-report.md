# VCST-5672 — Fix Verification

**Ticket:** VCST-5672 · Bug · Medium · `[vc-shell] VcScheduler: Timeline View story toolbar (view/date switcher) doesn't update the rendered grid`
**Fix:** vc-shell PR [#290](https://github.com/VirtoCommerce/vc-shell/pull/290) (`49492f8ef`) — merged to `main` 2026-08-12
**Verdict: VERIFIED** — 2026-08-25

## Env

**`@vc-shell/framework`** (vc-shell — separate product, not the storefront). Affected 2.4.0, fixed **2.5.0**.
Source `main @ 324cd9b09` (= v2.5.0); live on hosted Storybook `assets/iframe-1uXuqCDm.js`, built 2026-08-19 10:28 GMT.
No linked fix PR was on the ticket — located from `main`'s history.

## Summary

The story now wires `update:view` / `update:date` back into its own state, so the component's toolbar drives the
rendered grid. The ticket correctly diagnosed this as a **story-authoring gap, not a component defect** — the fix is
4 added lines in `vc-scheduler.stories.ts` and touches no component source, which matches that diagnosis exactly.

## RED → GREEN (unit)

Guarded by `vc-scheduler.stories.test.ts`, added by PR #308 ("guard three shipped fixes that nothing was pinning").

| Phase | Source | Result |
|---|---|---|
| **RED** | `vc-scheduler.stories.ts` @ parent of #290, test file unchanged | **1 failed (1)** — `expected undefined to be type of 'function'` (the missing handler) |
| **GREEN** | `main @ 324cd9b09` | **1 passed (1)** — *"keeps TimelineView on the same stateful renderer as the interactive timeline stories"* |

Evidence: `evidence/red-prefix.txt`, `evidence/green-fixed.txt`.

## Live verification — story `data-display-vcscheduler--timeline-view`

| Step | Expected | Observed | Result |
|---|---|---|---|
| Baseline | Timeline Day active | header `15 July 2026`, `button "Timeline Day"` **pressed**, single column `Wednesday, 15 July` | — |
| Click **Timeline Week** | grid switches to week | header → **`13 – 19 Jul 2026`**; 7 columns `Mon 13 … Sun 19`; `all day` lane appears with `Flash Deal: Jul 10 – Jul 13`; `aria-pressed` moves off Timeline Day onto **Timeline Week** | PASS |
| Click **Next** | header advances | `13 – 19 Jul 2026` → **`20 – 26 Jul 2026`**; columns `Mon 20 … Sun 26`; content changes (`Back to School Promo: Jul 20 – Jul 25`); week view preserved across navigation | PASS |
| *(extra)* Click **Month** | not required by the ticket | header → `July 2026`, month grid restored, `aria-pressed` on Month | PASS |

All three view buttons and the date navigation are wired — the fix is broader than the two controls the STR named.

Screenshots: `screenshots/5672-1-baseline-timeline-day.png`, `5672-2-after-timeline-week-click.png`, `5672-3-after-next-week-advanced.png`.
Console: only the benign `vite-inject-mocker-entry.js` preload warning.

## Regression

Full vc-scheduler + vc-popover suite at `main`: **213 passed (213) across 31 files**, 3 consecutive runs. Framework
typecheck clean. The change is confined to a `.stories.ts` file, so it cannot affect shipped component behaviour —
the published `@vc-shell/framework` package does not include stories.

## Storefront rules deliberately NOT applied

vc-shell is a separate product: `BL-UI-*`, `critical-ui-scope.md`, `storefront-selectors.md` and the 123 regression
suites cover the storefront only — none cover vc-shell. Substituted: the component's own vitest suite and live
Storybook interaction.
