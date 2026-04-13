# Test Sync Report — SYNC-2026-04-13-1122

## Summary

- **Source:** PR https://github.com/VirtoCommerce/vc-module-x-cart/pull/107 + PR https://github.com/VirtoCommerce/vc-frontend/pull/2235 (paired, both OPEN, VCST-4806)
- **Date:** 2026-04-13 11:22
- **Feature:** Add `maxLength` validation to product configuration **Text** sections (server + client)
- **Changed modules:** `XCart` (vc-module-x-cart), `vc-frontend` (storefront)
- **Affected suites:** 072b (Frontend), 050b (Backend GraphQL)

## Change Inventory

### Backend — vc-module-x-cart PR #107
| File | Change |
|------|--------|
| `Validators/CartErrorDescriber.cs` | New error: `CustomTextMaxLengthExceeded` → code `CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED`, message "Configuration section CustomText exceeds the maximum allowed length of {maxLength} characters" |
| `Validators/ConfigurationItemValidator.cs` | `ValidateSectionTypeText` now checks `section.MaxLength.HasValue && configurationItem.CustomText.Length > section.MaxLength.Value` and emits the new validation error |

### Frontend — vc-frontend PR #2235
| File | Change |
|------|--------|
| `core/api/graphql/.../getProductConfigurationsQuery.graphql` | Adds `maxLength` to selection set on configuration sections |
| `core/api/graphql/types.ts` | `ConfigurationSectionType.maxLength?: Maybe<Scalars['Int']['output']>` added |
| `shared/catalog/components/configuration/section-text-fieldset.vue` | Replaces hardcoded `MAX_LENGTH = 255` with `computed(() => props.section.maxLength ?? 255)` |
| `shared/catalog/composables/useConfigurableProduct.ts` | Text validator returns `max_length_exceeded` error when `value.customText.length > section.maxLength` |
| `locales/{en,de,es,fi,fr,it,ja,no,pl,pt,ru,sv,zh}.json` | New i18n key `max_length_exceeded` = "Text must not exceed {max} characters" (13 locales) |

## Deploy State on QA Environment (`vcst-qa`)

| Component | File | Value | Status |
|-----------|------|-------|--------|
| Backend XCart | `vc-deploy-dev:vcst-qa/backend/packages.json` | `VirtoCommerce.XCart_3.1006.0-pr-107-daa4.zip` (AzureBlob source) | **DEPLOYED** — PR #107 live |
| Storefront theme | `vc-deploy-dev:vcst-qa/theme/artifact.json` | `vc-theme-b2b-vue-2.45.0-pr-2240-def04a89.zip` | **NOT deployed** — PR #2240 (different ticket); PR #2235 builds `2.46.0-pr-2235` |

**Implication:** Backend GraphQL changes (new `maxLength` field, server-side validation error) are testable now. Storefront client-side behavior (per-section MAX_LENGTH, paste-bypass error message) requires PR #2235 to deploy first.

## Impact Matrix

| Suite | Total Cases | Updated | Added | Notes |
|-------|------------|---------|-------|-------|
| 072b (Frontend > configurable-products) | 8 (CFG-TEXT-001..008) | 5 | 0 | Existing maxLength coverage validated; refs added |
| 050b (Backend > graphql > xcart) | 64 → 66 | 0 | 2 | New schema + validation cases (GQL-099, GQL-100) |
| 072 (Frontend UI) | — | 0 | 0 | Spot-checked — text-section refs at lines 35-55 don't assert pre-PR 255 cap |
| 052 (Backend admin > config products) | — | 0 | 0 | UNAFFECTED — no admin UI changes in PRs |
| 028-030 (Cart) | — | 0 | 0 | UNAFFECTED — text persistence already covered by CFG-TEXT-006 |

## Cases Updated

| Case ID | Suite | Change | References Field (After) |
|---------|-------|--------|--------------------------|
| CFG-TEXT-001 | 072b | Added refs, status Manual → synced | `VCST-4806; PR #107 (XCart backend validation); PR #2235 (frontend MAX_LENGTH from section); Synced: VCST-4806 (2026-04-13)` |
| CFG-TEXT-002 | 072b | Added refs, status Manual → synced | `VCST-4806; PR #107; PR #2235; Synced: VCST-4806 (2026-04-13)` |
| CFG-TEXT-003 | 072b | Added refs, status Manual → synced | `VCST-4806; PR #107; PR #2235; Synced: VCST-4806 (2026-04-13)` |
| CFG-TEXT-004 | 072b | Added refs, status Manual → synced | `VCST-4806; PR #107; PR #2235; Synced: VCST-4806 (2026-04-13)` |
| CFG-TEXT-006 | 072b | Added refs, status Manual → synced | `VCST-4806; PR #107; PR #2235; Synced: VCST-4806 (2026-04-13)` |

> **Note:** CFG-TEXT-005 (special-character preservation), -007 (quantity counter), -008 (add-to-cart disabled) intentionally **NOT** updated — they exercise required-field/quantity behavior unrelated to maxLength.

## Cases Deprecated

None.

## New Cases Generated

| Case ID | Suite | Title | Layer | Priority |
|---------|-------|-------|-------|----------|
| GQL-099 | 050b | xCatalog - productConfiguration Query Exposes maxLength on Text-Type Sections | GraphQL schema | High |
| GQL-100 | 050b | xCart - addItem Mutation Rejects CustomText Exceeding Section MaxLength with `CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED` | GraphQL validation | High |

## Context7 / Source-of-Truth Findings

| Source | Finding | Cases Influenced |
|--------|---------|------------------|
| `vc-module-x-cart` source (PR #107 diff) | Error code is `CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED` (exact string), message includes literal `{maxLength}` value | GQL-100 assertion |
| `vc-frontend` source (PR #2235 diff) | Frontend client cap remains hard-capped via input maxlength attr (`MAX_LENGTH` ref bound to `:maxlength`); explicit `max_length_exceeded` error is for paste-bypass / programmatic input | GQL-100 cross-layer note; future CFG-TEXT-009 |
| GraphQL schema (PR #2235 types.ts diff) | `ConfigurationSectionType.maxLength: Int` (nullable) | GQL-099 introspection assertion |

## Environment Verification

**Skipped** (`--skip-verify` rationale):
- Frontend PR #2235 not deployed to QA — client-side behavior cannot be verified
- Backend PR #107 deployed but the verification itself is the new GQL-099/GQL-100 test cases — running them would duplicate the test execution that belongs in the next regression run

## Quality Gate

| Check | Status |
|-------|--------|
| All STALE/refs-missing cases updated | PASS — 5/5 |
| All BROKEN cases addressed | N/A — none |
| New behavior has coverage | PASS — backend (GQL-099, GQL-100) covered; frontend paste-bypass deferred to post-deploy |
| No ID conflicts | PASS — GQL-099, GQL-100 unused (max prior was GQL-098) |
| CSV structure valid (15 columns, quoting) | PASS |
| testCount updated in manifest | PASS — 050b 64 → 66 |

## Recommended Next Steps

- [ ] Review diff: `git diff regression/suites/Frontend/configurable-products/072b-file-text-section-cases.csv regression/suites/Backend/graphql/050b-graphql-xcart.csv config/test-suites.json`
- [ ] Run `/qa-test-lifecycle suite 050b --skip-generate` to lifecycle-validate GQL-099 & GQL-100
- [ ] Run `/qa-regression 050b` against QA env to execute the new GraphQL cases (PR #107 deployed → expect PASS)
- [ ] **When PR #2235 deploys** (watch `vc-deploy-dev:vcst-qa/theme/artifact.json` flip to `vc-theme-b2b-vue-2.46.0-pr-2235`):
  - Re-run `/qa-sync-tests PR #2235` to add `CFG-TEXT-009` (paste-bypass error message via `max_length_exceeded` i18n key) to 072b
  - Run `/qa-regression 072b` to execute full configurable-products text-section regression with both PRs live
- [ ] No JIRA bug tickets needed — sync only

## Files Modified

- `regression/suites/Frontend/configurable-products/072b-file-text-section-cases.csv` (5 case ref updates)
- `regression/suites/Backend/graphql/050b-graphql-xcart.csv` (+2 cases, GQL-099, GQL-100)
- `config/test-suites.json` (050b testCount 64 → 66)
