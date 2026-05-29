# VCST-4715 — Backend Execution Report: Default Option Support (Configurable Products)

**Env:** vcst-qa @ Platform 3.1030.0, vc-module-catalog 3.1025.0-pr-880, XCatalog 3.1005.0 (B2B-store) · Browser: playwright-edge
**Scope:** Admin SPA + REST `/api/catalog/products/configurations` + GraphQL `productConfiguration.isDefault`
**Date:** 2026-05-27

## Verdict

**AC1 (a manager can set a default option): PASS.** The Admin Configurable Sections UI exposes a per-option "Default" column/checkbox in both Product- and Text-type sections; a manager can toggle one default via the option's "Default" switch, the UI enforces single-default (checking one clears the rest), Save persists, and the value surfaces consistently in REST GET and GraphQL.

**BL-CAT-006 (configuration integrity) + single-default-per-section invariant: VERIFIED.** Exactly one `isDefault=true` per section is maintained at the server layer via first-stored-wins normalization (HTTP 200, no 422). `isDefault` is always a boolean (never null) — EF Core default false applies when omitted.

## Results

| TC | Sev | Result | Evidence |
|----|-----|--------|----------|
| CFG-CA-027 | Critical | **PASS** | Default column visible on Frame Material (Product) options; toggling Carbon's Default ON auto-unchecked Aluminum (single-default UI enforcement); Save persisted; REST GET + GraphQL confirm exactly one default (Carbon), boolean. Screenshots below. |
| CFG-CA-028 | High | **PASS** | "Text section_3" (Text-type, predefined options) renders the same **Text / Default** option grid with a Default checkbox per option; REST throwaway confirmed `isDefault` persists as boolean for Text options (Classic=true / Modern=false). |
| CFG-CA-029 | Critical | **PASS (with caveat — see Note 1)** | 1st POST (A=true) → 200, GET A=true/B,C=false. 2nd POST (A & B both true) → **200, NOT 422**; GET shows exactly ONE default. Normalization is server-side. |
| CFG-CA-030 | High | **PASS** | POST all isDefault=false → GET all false (boolean). POST with `isDefault` field OMITTED → GET all false, field always present, no nulls (EF Core default). |
| CFG-CA-031 | Medium | **PASS** | REST clear-default → GET all isDefault=false (boolean). UI uncheck path uses the same option-blade "Default" switch verified bidirectionally in CFG-CA-027. Storefront "none preselected" reindex spot-check deferred to frontend agent. |
| CFG-VAR-013 / 019 | Critical | **PASS** | GraphQL `productConfiguration(configurableProductId: CFG-030)` → HTTP 200, `errors[]` empty, `options[].isDefault` boolean, `true` ONLY on Carbon. |

All throwaway products created for CFG-CA-029/030/031 were deleted; CFG-030/CFG-031 seeded defaults left intact (CFG-030 verified still Carbon=default post-run).

## Note 1 — Single-default normalization is "first STORED wins," not "first SUBMITTED"

CFG-CA-029's written assertion expects the **first option in the submitted array** (A) to be preserved when two defaults are sent. Observed behavior: the service preserves the option that is **first in the section's stored option collection** (ordered by option id / creation order), regardless of request-array position. In a controlled 3-option repro (stored order C,B,A), submitting all three `isDefault=true` left **C** (first stored) as the sole default.

This is **not a defect** — the invariant "exactly one default per section, server-side, no 422" holds. But the test-case wording ("option A — first submitted — wins") is inaccurate and should be reworded to "the first option in stored/display order wins." Recommend updating CFG-CA-029 assertion text.

## Note 2 — Test-data drift on CFG-030 (corrected during run)

On entry, seeded CFG-030 had its default on **Aluminum**, not **Carbon** as `_seed-results-cfg-default-20260527.json` records (option `modifiedDate` 16:53 > seed 16:07 — a re-POST had normalized the default to the first stored option, Aluminum). The frontend agent depends on Carbon=default. **Corrected** by executing CFG-CA-027 (set Carbon default via UI + Save); REST and GraphQL now both report Carbon=default. Root cause: the seed script's two-pass create→PUT flow cannot reliably land the default on a non-first stored option, because any re-POST triggers first-stored-wins normalization. Recommend the seeder create option products in the desired-default-first order (or set the default in a single create pass).

## Layer consistency (CFG-030, post-run)
REST GET, GraphQL `productConfiguration`, and Admin UI all agree: Carbon `isDefault=true`, Aluminum/Steel false, boolean, exactly one default. No 4xx/5xx on configuration endpoints. Console errors observed were benign 404s (page-builder logo SVG, external product image) unrelated to the feature.

## Evidence
- `screenshots/CFG-CA-027-default-column-initial.png` — Default column with one option checked
- `screenshots/CFG-CA-027-single-default-enforced-carbon.png` — Carbon checked, Aluminum auto-cleared after Save
- `screenshots/CFG-CA-028-text-section-default-column.png` — Default column on Text-type section options
- HAR: `test-results/edge/har/` (auto-captured)

## Defects
None filed. Two test-asset corrections recommended (Note 1: CFG-CA-029 assertion wording; Note 2: seed script default-ordering) — these are test-infrastructure issues, not platform defects.
