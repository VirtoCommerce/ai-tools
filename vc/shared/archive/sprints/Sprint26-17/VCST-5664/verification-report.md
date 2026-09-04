# VCST-5664 — Fix Verification

**Ticket:** VCST-5664 · Bug · Medium (P2) · labels `framework`, `vc-shell`
**Title:** useDataTablePagination `stateKey` restores the page number but not the data, with no signal to the consumer
**Fix task:** VM-1745 (Done) · **Fix:** vc-shell PR [#294](https://github.com/VirtoCommerce/vc-shell/pull/294) (`9cf5548b8`) + [#295](https://github.com/VirtoCommerce/vc-shell/pull/295) (`57104c33f`), merged to `main` 2026-08-13
**Verdict: VERIFIED** — 2026-08-25

## Env

Product is **`@vc-shell/framework`** (separate product — not the storefront, not the Platform Admin SPA).
Affected: 2.4.0 (2026-08-04). Fixed: **2.5.0** (2026-08-19). Verified against `vc-shell@main` `324cd9b09 release: v2.5.0`
+ published npm `@vc-shell/framework@2.5.0` + deployed hosted Storybook (built 2026-08-19 10:28 GMT).

## Summary

The composable now returns `restoredPage`, so a blade can seed its first load from the restored offset instead of
loading page 1 under a paginator already showing page N. A missing `TableQueryState` provider now logs a warning
instead of silently disabling the feature, and assigning to `currentPage` is deprecated with a warning. RED→GREEN
proven at unit level; the fix is present in the published package and the deployed build. No regressions.

## RED → GREEN

Same unmodified test file (`framework/ui/composables/useDataTablePagination.test.ts`), two sources:

| Phase | Source | Result |
|---|---|---|
| **RED** (baseline) | `git show v2.4.0:…/useDataTablePagination.ts` — the version the ticket was filed against | **3 failed / 22 passed (25)** |
| **GREEN** | `main` @ `324cd9b09` (= v2.5.0) | **25 passed (25)** — 3 consecutive runs |

RED failures are exactly the three fix behaviours:
- `reports the restored page…` → `AssertionError: expected undefined to be 3` ← the VCST-5664 defect itself
- `warns when stateKey is set but no provider is in scope` → warn called 0 times
- `warns, changes the page, and does not fire onPageChange` → warn called 0 times

Evidence: `evidence/red-prefix.txt`, `evidence/green-fixed.txt`.

## Deploy gate (`evidence/deploy-gate.txt`)

| Check | Result |
|---|---|
| `9cf5548b8` / `57104c33f` ancestors of `v2.5.0`, not of `v2.4.0` | PASS |
| Published npm dist markers (`restoredPage`, both warning strings) — 2.4.0 vs 2.5.0 | **0 vs present** |
| Deployed Storybook preview bundle `assets/iframe-1uXuqCDm.js` (built 2026-08-19, the v2.5.0 build) | all 3 markers present |

Markers are property keys / string literals, so they survive minification.

## Acceptance criteria (VM-1745)

| AC | Verdict | Evidence |
|---|---|---|
| Blade can issue its first load at the restored offset without reading private state | PASS | `restoredPage` returned; `skip` already correct (test asserts `skip === 40` for page 3) |
| Restoring a page still does not trigger two loads | PASS | `seeds currentPage from the restored URL slice without firing onPageChange` |
| Warning logged when `stateKey` has no provider | PASS | unit test + string present in published & deployed bundles |
| Docs state what the consumer must do on first load | PASS | `useDataTablePagination.docs.md` — "With `stateKey`, the first load MUST start at `pagination.skip`" |
| Unit test: restore page 3, assert restored page + `onPageChange` call count | PASS | covered across two tests (`restoredPage === 3`; `onPageChange` not called) rather than one |

Both secondary issues from VCST-5664 are also closed: the silent no-provider case now warns, and the
three-ways-to-change-the-page ambiguity is addressed by deprecating the writable path (deliberately **not** made
readonly — a production Vue build drops a readonly write silently, which would break consumers with no error).

## Regression

| Check | Result |
|---|---|
| Full framework unit suite (`vitest --config framework/vitest.config.ts run`) | **4202 / 4203 passed** |
| 4 failing files | all harness artifacts, none pagination-related — see note |
| Framework typecheck (`yarn typecheck`) — interface changed (`restoredPage?`, deprecated `currentPage`) | **clean, exit 0** |
| Spurious deprecation warnings from framework's own components | none — no write to `pagination.currentPage` anywhere in `framework/`, `cli/`, `packages/`; `VcDataTable.vue:352,357` binds it one-way |
| `vc-data-table.url-state.stories.ts` (the in-repo `stateKey` demo) | unaffected — derives rows from `pagination.skip`, i.e. already the documented-correct pattern, so it never had the bug |

**The 4 failing files are environment artifacts of running the suite from a nested checkout, not product defects:**
`mf-host` + `mf-module` fail on an unresolved `@vc-shell/mf-config` entry (I installed with `--mode=skip-build`, so its
`dist` was never built); `VcScheduler.style.test.ts` and `cli/docs-sync/lint.test.ts` fail on `process.cwd()`-relative
paths that escape to the outer repo root. None touch pagination.

## Consumer note (not a defect in this ticket)

The concrete case the ticket names — vc-module-pagebuilder `page-builder-shell`, shared-components blade — is on
**PR #159, still OPEN**. Its `initialize()` on that branch now reads
`await loadComponents({ skip: pagination.skip })` (`useSharedComponents.ts:227`), i.e. the documented-correct pattern,
so the reported symptom is closed on the consumer side too once #159 merges. Nothing to do for VCST-5664.

## Storefront rules deliberately NOT applied

Per the vc-shell testing rules, this product is not the storefront. Not applicable and therefore not run:
`BL-*` / `BL-UI-*` invariants, `critical-ui-scope.md`, `storefront-selectors.md`, the storefront domain checklists,
and the 123 regression suites in `config/test-suites.json` — **none cover vc-shell**. Substituted: the framework's own
vitest suite, its typecheck, and published/deployed-artifact marker greps.

No browser run and no screenshots: the defect is a library API contract, verified at source and artifact level.

## Observation (no ticket filed)

`restoredPage` is captured as a plain `let` and placed into `reactive()`, so it is a setup-time snapshot — correct for
its documented purpose, but the TS `readonly` is not enforced at runtime (`pagination.restoredPage = 5` succeeds
silently). Consistent with the team's deliberate no-runtime-readonly stance; cosmetic, P3, not worth a ticket.
