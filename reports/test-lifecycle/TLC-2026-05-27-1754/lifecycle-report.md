# Test Case Lifecycle Report — TLC-2026-05-27-1754

## Summary
- **Input:** VCST-4715 (JIRA Story) — change-driven
- **Date:** 2026-05-27 17:54
- **Build:** Platform 3.1030.0 · Theme 2.50.0-pr-2278 · Catalog 3.1025.0-pr-880 · XCart 3.1016.0-pr-115
- **Scope:** configurable-products — suites 052 (admin), 072 / 072b / 072c (frontend)
- **Verdict:** **NEEDS FIXES → APPROVED (post-seed, 2026-05-27)** — the only blocker (unseeded `CFG_WITH_DEFAULT`) was resolved the same day; see Post-Seed Update below.

> ### Post-Seed Update (2026-05-27)
> `/qa-seed-data` created **CFG-030** (flat: Frame Material → Carbon $200 default) and **CFG-031** (conditional: Base Choice→Standard, Add-on→Warranty $25 default), linked to the B2B virtual catalog. CFG-PDP-043 repointed to new alias `CFG_WITH_DEFAULT_COND`; GraphQL arg corrected to `configurableProductId`; CFG-CA-029/CFG-VAR-019 guarded against clobbering the seeds. **`validate-td-refs`: 1973/1973, 0 failures (G5 now PASS).** Live re-verification — all VERIFIED: CFG-030 Carbon preselected on load ($300), CFG-031 dependent Warranty preselected on load ($175), GraphQL `isDefault=true` only on Carbon, default carries to cart at $300. **G8 fully PASS incl. core AC.** Scope is regression-ready (`/qa-regression configurable-products`).

## Feature
A configuration **option** can be marked **default** in a product configuration section (PR #880 adds `IsDefault` + admin "Default" checkbox column + single-default-per-section server normalization). XCart GraphQL exposes `isDefault`; the storefront auto-preselects the default on PDP, including in dependent sections. Purely additive — products without a default are unchanged.

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 4 suites, JIRA + PR #880, GraphQL `isDefault` confirmed live |
| 2. Sync | test-management-specialist | Done | 1 INCOMPLETE→updated (CFG-VAR-013), 0 STALE, 0 BROKEN |
| 3. Generate | test-management-specialist | Done | 11 new cases (052 +5, 072 +5, 072b +1) |
| 4. Review & Fix | test-management-specialist | Done | 1 auto-fix; 5 manual (2 Blocker pre-seed, 3 High/Med) |
| 5. Verify | qa-testing-expert | Done | 3 VERIFIED, 1 BLOCKED, 0 BROKEN |
| 6. Approve | orchestrator | **NEEDS FIXES** | Gates 6/7 required passed (G5 fails on pre-seed) |

## Disambiguation (Phase 2)
- **"None selected by default"** (CFG-PDP-001/007, file-text §33, CFG-E2E-001/002) → **VALID**. Seed products have no `IsDefault`; feature is additive (EF default false). Not stale.
- **"Frame Type=Aluminum preselected"** (CFG-PDP-020..029-COND, VCST-4713) → **VALID, not IsDefault**. This is pre-existing required-section first-option auto-select (already noted in the cases' Preconditions). No VCST-4715 tag added.

## Sync & New Cases
| Case ID | Suite | Action | Layer | Pri |
|---------|-------|--------|-------|-----|
| CFG-VAR-013 | 072 | Synced — added `isDefault` to GQL query + assertions | GraphQL | Critical |
| CFG-CA-027 | 052 | New — Admin Default checkbox, Product section | Admin+REST | Critical |
| CFG-CA-028 | 052 | New — Default checkbox, Text section | Admin+REST | High |
| CFG-CA-029 | 052 | New — REST isDefault persist + multi-default normalization | REST | Critical |
| CFG-CA-030 | 052 | New — GET isDefault=false when none set (backward compat) | REST | High |
| CFG-CA-031 | 052 | New — Remove default by uncheck, storefront reflects | Admin+SF | Medium |
| CFG-VAR-019 | 072 | New — GraphQL isDefault round-trip (REST→GQL) | GraphQL | Critical |
| CFG-PDP-040 | 072 | New — Default pre-selected on PDP load | SF UI | Critical |
| CFG-PDP-041 | 072 | New — No preselection when no default (backward compat) | SF UI | Critical |
| CFG-PDP-042 | 072 | New — User override of preselected default | SF UI | High |
| CFG-PDP-043 | 072 | New — Default preselected in dependent section | SF UI | High |
| CFG-E2E-070 | 072b | New — Default flows PDP→cart→order | E2E | Critical |

## Environment Verification (Phase 5 — Firefox, vcst-qa)
| Case | Result | Detail |
|------|--------|--------|
| CFG-CA-027 | VERIFIED | Admin section Options blade shows **Default** column with per-row togglable checkbox |
| CFG-VAR-019 / 013 | VERIFIED | `productConfiguration` returns `options[].isDefault` as boolean (all false, no default set); HTTP 200, errors[] empty |
| CFG-PDP-041 | VERIFIED | CFG_BIKE PDP: None preselected, price = base only — no-default behavior unregressed |
| CFG-PDP-040 / E2E-070 | BLOCKED | `CFG_WITH_DEFAULT` (CFG-030) not seeded — data precondition, not a defect |

No code defects found. Feature present at all three confirmable layers.

## Quality Gates
| Gate | Status | Note |
|------|--------|------|
| G1 Structure | PASS | CSV valid, IDs unique, no renumber |
| G2 Determinism | PASS | — |
| G3 Completeness | PASS | 3 High items (below cap) |
| G4 Testability | PASS | — |
| G5 Data Validity | **FAIL** | 2 Blockers: 25 unresolved `@td(CFG_WITH_DEFAULT.*)` + placeholder IDs in CFG-CA-027..031/CFG-VAR-019 — resolve on seed |
| G6 BL Coverage | WARN | New cases ref BL-CAT-006; `PROPOSED-BL-CAT-006a` pending qa-lead promotion |
| G7 Duplication | PASS | Deduped against CFG-CA/PDP/VAR |
| G8 Environment | PASS | 0 BROKEN |
| G9 Sync | PASS | All stale addressed |

## Must Fix (blocks regression)
1. **Seed `CFG_WITH_DEFAULT` / CFG-030** via `/qa-seed-data` (a configurable product with one option marked default; ideally a conditional variant for CFG-PDP-043/E2E-070). Then bind placeholder IDs (`<target-product-id>`, `<opt-A-id>`, `<opt-B-id>`) to `@td(CFG_WITH_DEFAULT.*)` and re-run `npx tsx scripts/validate-td-refs.ts` (currently 1940/1965; 25 unresolved are all this alias).

## Should Fix
2. **`PROPOSED-BL-CAT-006a`** (one default per section; storefront preselects it) → submit to qa-lead-orchestrator for promotion (advisory; not auto-applied).
3. **Stale `CFG_BIKE` alias** — live PDP is `/products-with-options/build-the-bike-of-your-dreams/bike-with-options`; the alias `storefront_url`/`slug` 404 on the `/configurations/` path (GUID `f16d3e8f-…` is correct). Pre-existing; affects existing 072 cases. Fix `test-data/aliases.json` separately.
4. Confirm CFG-CA-029 "first default preserved" against `ProductConfigurationService` source (asserted from PR description, not yet live-verified — needs the seed).

## Files Modified
- `regression/suites/Backend/configurable-products/052-configurable-products-admin.csv` (+5; 24→29)
- `regression/suites/Frontend/configurable-products/072-configurable-products-ui.csv` (CFG-VAR-013 sync; +5; 78→83)
- `regression/suites/Frontend/configurable-products/072b-configurable-products-e2e.csv` (+1; 57→58)
- `test-data/aliases.json` (+`CFG_WITH_DEFAULT`, `_status: needs-seed-VCST-4715`)
- `config/test-suites.json` (testCount: 052 29, 072 83, 072b 58)

## Next Steps
- [ ] `/qa-seed-data` → seed CFG-030; bind placeholder IDs; re-validate `@td` refs
- [ ] Submit `PROPOSED-BL-CAT-006a` to qa-lead for BL promotion
- [ ] Fix `CFG_BIKE` alias URL/slug (separate from this ticket)
- [ ] After seed: `/qa-regression 052,072,072b` (or `configurable-products`)
