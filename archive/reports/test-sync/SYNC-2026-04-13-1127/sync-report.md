# Test Sync Report — SYNC-2026-04-13-1127

## Summary

- **Source:** PR https://github.com/VirtoCommerce/vc-frontend/pull/2235 (storefront half of VCST-4806 pair)
- **Date:** 2026-04-13 11:27
- **Trigger:** Re-sync after frontend deployment to QA — companion to SYNC-2026-04-13-1122
- **Affected suites:** 072d (`072b-file-text-section-cases.csv`)

## Deploy State Change Detected

| | Last sync (11:22) | Now (11:27) |
|---|---|---|
| `vc-deploy-dev:vcst-qa/theme/artifact.json` | `vc-theme-b2b-vue-2.45.0-pr-2240-def04a89.zip` | `vc-theme-b2b-vue-2.46.0-pr-2235-0b68-0b6869fe.zip` |
| Status | PR #2235 NOT deployed | **PR #2235 DEPLOYED** ✅ |
| Backend PR #107 | Live (`XCart_3.1006.0-pr-107-daa4.zip`) | Unchanged — still live |

Both halves of VCST-4806 are now testable end-to-end on QA.

## Change Inventory (re-confirmed from prior sync)

PR #2235 — vc-frontend
- `getProductConfigurationsQuery.graphql` — adds `maxLength` to selection
- `types.ts` — `ConfigurationSectionType.maxLength?: Maybe<Int>`
- `section-text-fieldset.vue` — `MAX_LENGTH = computed(() => props.section.maxLength ?? 255)`
- `useConfigurableProduct.ts` — text validator emits `max_length_exceeded` error when `customText.length > section.maxLength`
- `locales/{en,de,es,fi,fr,it,ja,no,pl,pt,ru,sv,zh}.json` — new key `max_length_exceeded`

## Impact Matrix

| Suite | Total Cases | Updated | Added | Notes |
|-------|------------|---------|-------|-------|
| 072d (`072b-file-text-section-cases.csv`) | 17 → 18 | 0 | 1 | Deferred case from prior sync now added |

## Cases Updated

None this run (refs already added in SYNC-2026-04-13-1122).

## Cases Deprecated

None.

## New Cases Generated

| Case ID | Suite | Title | Layer | Priority |
|---------|-------|-------|-------|----------|
| CFG-TEXT-009 | 072d | Text Section — Paste-Bypass Triggers `max_length_exceeded` i18n Error and Backend Rejection | Storefront + cross-layer (GraphQL backend assert) | High |

**Coverage rationale (de-dup check):**
- CFG-TEXT-001 covers HTML maxlength input cap (typing 31st char rejected)
- CFG-TEXT-009 covers what happens when the HTML cap is **bypassed** (programmatic `el.value = '...'` + dispatch input event) → exercises the new `useConfigurableProduct.ts` validator + `max_length_exceeded` i18n key + backend `CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED` rejection (PR #107)
- No semantic overlap with CFG-TEXT-001..008 or with GQL-100 (which exercises GraphQL directly without the storefront UI layer)

## Source-of-Truth Findings (from PR diffs)

| Source | Finding | Cases Influenced |
|--------|---------|------------------|
| `useConfigurableProduct.ts` (PR #2235 diff) | Validator returns `error: t("...max_length_exceeded", { max: section.maxLength })` — NOT a hard block on input event; runs on validation cycle | CFG-TEXT-009 — programmatic value-set path |
| `locales/en.json` (PR #2235 diff) | Exact text: `"Text must not exceed {max} characters"` | CFG-TEXT-009 assertion text |
| `locales/fr.json` | `"Le texte ne doit pas dépasser {max} caractères"` | CFG-TEXT-009 i18n cross-locale assertion |
| `section-text-fieldset.vue` | Input still has `:maxlength="MAX_LENGTH"` HTML attr → typing/paste capped natively; programmatic value-set bypasses | CFG-TEXT-009 bypass technique |

## Environment Verification

**Skipped browser verification.** Justification:
- CFG-TEXT-009 is `NEW_NEEDED` (no existing case to verify staleness against)
- Both PRs deployed; case is ready for execution in the next regression run
- Browser verification of a brand-new case would duplicate test execution — defer to `/qa-regression 072d`

## Quality Gate

| Check | Status |
|-------|--------|
| All STALE cases updated | N/A (no STALE cases this run) |
| All BROKEN cases addressed | N/A |
| New behavior has coverage | PASS — paste-bypass + i18n + backend rejection now covered |
| No ID conflicts | PASS — CFG-TEXT-009 unused |
| CSV structure valid (15 cols) | PASS |
| testCount updated in manifest | PASS — 072d 17 → 18 |
| Deduplication checked | PASS — CFG-TEXT-001 vs CFG-TEXT-009 cover different scenarios |

## Recommended Next Steps

- [ ] `git diff regression/suites/Frontend/configurable-products/072b-file-text-section-cases.csv config/test-suites.json`
- [ ] `/qa-test-lifecycle suite 072d --skip-generate` — quality-check CFG-TEXT-009
- [ ] `/qa-regression 072d` — execute full text-section suite (now end-to-end testable; both PRs live)
- [ ] `/qa-regression 050b` — execute GQL-099 + GQL-100 from prior sync
- [ ] Optional: `/qa-regression configurable-products` — full module regression (052, 072, 072b, 072c, 072d)

## Files Modified

- `regression/suites/Frontend/configurable-products/072b-file-text-section-cases.csv` (+1 case CFG-TEXT-009)
- `config/test-suites.json` (072d testCount 17 → 18)

## Companion Run

This sync extends **SYNC-2026-04-13-1122** (which handled the backend half + ref updates). Together both runs complete the VCST-4806 test-suite sync.
