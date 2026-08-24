# VCST-5412 — AC / Plan ↔ Implementation Analysis

**Ticket:** `[vc-shell] accessibility and bundle size improvements` · Task · Medium · status **Testing**
**PR:** [VirtoCommerce/vc-shell#255](https://github.com/VirtoCommerce/vc-shell/pull/255) — merged 2026-07-20 into `main`, 191 files
**Env under test:** `https://vcmp-dev.govirto.com/apps/vendor-portal/` + hosted Storybook `https://vc-shell-storybook.govirto.com/`

## 0. Why the formal BA AC review was skipped

The ticket carries **no description and no acceptance criteria** (`description: null`). The governing
artifact is a **QA-authored test plan** posted as a comment (3 axes, ~60 case IDs, each with an
expected result). Running `ba-story-writer` Mode B to score "AC quality" on a test plan would be
ceremony, not signal — so the plan is adopted directly as the traceability spine, and the useful half
of Step 1b (plan ↔ implementation coverage against the real diff) is done below instead.

## 1. Version reality check — the plan's baseline does not match the environment

| | Plan says | Actual |
|---|---|---|
| Version under test | `@vc-shell/framework` **2.2.0** | deployed portal runs **2.3.0** (read from `vc-shell-framework49842.js`) |
| Baseline for comparison | **2.1.0** | 2.1.0 published 2026-06-22; 2.2.0 published 2026-07-20T17:05 (25 min after the PR merged at 16:39) |

2.2.0 **is** the release carrying PR #255. The deployed portal is one minor **ahead** (2.3.0), so it
contains this PR *plus later work*. Consequence carried through every verdict: **a defect observed on
`vcmp-dev` cannot be attributed to PR #255 alone** unless traced to source. The Storybook is built
from `main`, so it is even further ahead.

## 2. Plan ↔ implementation coverage (against the real 191-file diff)

Change surface: `framework/ui` 111 files · `framework/core` 46 · `framework/shell` 14 ·
`framework/locales` 2 · plus tsconfig / vitest / tailwind / a11y-audit harness / package.json.

| PR change | Plan coverage | Verdict |
|---|---|---|
| WCAG A/AA fixes across components | A11Y-01..08 | COVERED |
| Shell landmarks, blade header a11y names | A11Y-12, A11Y-15 | COVERED |
| Localized aria-labels / login errors / editor toolbar | A11Y-18, BH-16, BH-17 | COVERED |
| `./dashboard` + `./charts` opt-in subpath exports | BS-03, BS-10 | COVERED |
| `vc-editor` formatter prettier → js-beautify | BS-02, BS-11, BS-12 | COVERED |
| `vee-validate` → peer dependency | BS-04, BS-14 | COVERED |
| `whatwg-fetch` removed | BS-05, BS-15 | COVERED |
| ai-agent postMessage explicit origins | BH-01, BH-02 | COVERED |
| `vc-video` iframe sandbox | BH-03 | COVERED |
| 401 sign-out + duplicate interceptor guard | BH-04, BH-05 | COVERED |
| `useTheme` / toast stack shared composables | BH-06, BH-07 | COVERED |
| `usePopup` destroy by id | BH-08 | COVERED |
| UI-customization parse guard | BH-09 | COVERED |
| `vc-data-table` persistence guard after debounce | BH-11, BH-12 | COVERED |
| Legacy `expanded`/`closable` deprecation | BH-13 | COVERED |
| Module Federation shared subpaths | BS-09, BH-14 | COVERED |
| **`vc-data-table.stories.ts` split into 16 themed files** | **BH-15 — indexing only** | **GAP — see §3** |
| `createTableSelectionFacade` / `useDataTableOrchestrator` / `useTableColumnsResize` refactors | §6 list-blade regression (generic) | THIN — no targeted case for selection semantics or column-resize after the facade extraction |
| `framework/tsconfig.json` change | none | NOT COVERED (see §3) |

## 3. GAP-01 — BH-15 verifies indexing, not rendering (confirmed defect escaped through it)

**BH-15 as written:** *"All ~90 stories are present under a single title with one docs entry, no
duplicates. Links from documentation resolve to the right stories."*

Every clause of that is about the **Storybook index**. All of it passes:

- `Data Display/VcDataTable` → exactly **90 stories**, **1** docs entry, **1** title
- **0** duplicate story ids across all 677 index entries; no title has >1 docs entry

…and yet **4 stories are broken at runtime** (§DEF-01). BH-15 would be signed off green while the
split it exists to validate shipped a crash. A story can index perfectly and still throw on render.

**Gap-AC added and executed:** *"Every story in the index renders without a console/page error or a
Storybook error-display, with a non-empty rendered root."* Executed as a scripted sweep over all
**615** stories — this is what found DEF-01.

**Why it also escaped CI:** `framework/tsconfig.json` `exclude` contains — verbatim, with the repo's
own marker:

```jsonc
  // TODO: fix this
  "**/*.stories.ts",
```

Story files are excluded from `yarn typecheck`, and there is no auto-import plugin in the repo, so a
plain undefined-identifier in a `.stories.ts` is invisible to `yarn check`. The PR's stated
verification ("`yarn lint` and `yarn typecheck` clean") is therefore true *and* unable to catch
DEF-01. `yarn test:storybook` renders every story in Chromium and would catch it, which places the
gap at whether that job actually gates the merge.

## 4. Executability of the plan in this environment

The plan assumes a local Yarn 4 / Node 22 checkout of `vc-shell` + `vendor-portal`, a screen reader,
and Safari. Against a deployed portal on Windows:

| Plan requirement | Status here | Substitute / reason |
|---|---|---|
| Storybook (hosted) | EXECUTED | hosted build from `main` |
| Running app | EXECUTED | deployed `vcmp-dev` (2.3.0, not a local 2.2.0 link) |
| NVDA / VoiceOver (A11Y-06/13/14/17) | **NOT EXECUTABLE** | no screen reader available — substituted with programmatic accessibility-tree / accessible-name inspection, labelled as such. Never reported as an SR transcript. |
| Safari (BS-15, mandatory) | **NOT EXECUTABLE** | Safari does not run on Windows; WebKit is not supported by this harness |
| `yarn test:unit` / `test:storybook` / `test:a11y` / `check` (A11Y-09/10, §8) | **NOT EXECUTED** | requires local clone + full build; not run against a deployed env |
| BS-01 / BS-06 / BS-07 two-build baseline vs 2.1.0 | **PARTIAL** | app-`dist` dual build not performed. Substituted with (a) published-package contract diff 2.1.0→2.2.0→2.3.0 and (b) real deployed-bundle measurement. Package size ≠ shipped bundle size — recorded as supporting evidence, not as a BS-01 verdict. |
| `VcDropdownPanel` (in the A11Y-01 list) | **NOT TESTABLE AS WRITTEN** | no stories exist for it in the index; nearest analog `Form/VcInputDropdown` (7 stories) audited instead. Plan defect, not a product defect. |

## 5. Verdict spine

A PASS requires evidence for every plan case. Cases marked NOT EXECUTABLE above cannot be waived
silently — they are reported as gaps in coverage, and the exit criteria in §9 of the plan
(specifically the BS-01 concrete-numbers requirement and the screen-reader requirement) are
**not met by this run**.
