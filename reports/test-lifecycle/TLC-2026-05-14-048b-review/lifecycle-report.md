# Test Case Lifecycle Report — TLC-2026-05-14-1622

## Summary

- **Input:** `suite 048b` (direct scope)
- **Input Type:** direct-scope
- **Date:** 2026-05-14 16:22
- **Flags:** `--skip-sync --skip-generate --skip-verify`
- **Suite:** [`regression/suites/Frontend/cross-cutting/048b-layout-stability.csv`](../../../regression/suites/Frontend/cross-cutting/048b-layout-stability.csv) — 1,299 lines, 158 cases
- **Verdict:** **NEEDS FIXES** — 3 Critical findings block regression promotion

> Build/version verification skipped — review is on a self-contained test suite, not against deployed code. Run `/qa-test-lifecycle` with a change source if a code-vs-test sync check is needed.

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 1 suite, 158 cases (106 newly authored + 52 pre-existing) |
| 2. Sync | — | Skipped (`--skip-sync`) | — |
| 3. Analyze & Generate | — | Skipped (`--skip-generate`) | — |
| 4. Review & Fix | test-management-specialist | Done | 3 Critical + 4 High + 5 Medium + 3 Low; 1 auto-fix |
| 5. Verify | — | Skipped (`--skip-verify`) | Browser verification deferred |
| 6. Approve | orchestrator | **NEEDS FIXES** | G1/G2/G6/G7: PASS · G3/G4/G5/G9: WARN/FAIL · G8: SKIP |

## Context

The orchestrator authored **106 new test rows** in [`048b-layout-stability.csv`](../../../regression/suites/Frontend/cross-cutting/048b-layout-stability.csv) over 3 batches earlier this session to close every cell in the expanded [`critical-ui-scope.md`](../../../.claude/agents/knowledge/critical-ui-scope.md) matrix (8 → 36 components, 9 → 16 pages). The matrix validator (`npx tsx scripts/validate-critical-ui-scope.ts`) now exits 0 — every cell points at a real test ID. Phase 4 reviewed all 158 rows for static quality.

## Quality Gates

| Gate | Criteria | Status | Detail |
|------|----------|--------|--------|
| G1: Structure | 0 Blocker findings | ✅ PASS | All 158 rows have 15 columns; quoting correct; IDs unique |
| G2: Determinism | 0 Critical findings | ✅ PASS | Step tags consistent; one Medium (VCIMAGE-003 exception noted) |
| G3: Completeness | ≤3 High findings | ⚠️ WARN | 1 Medium on VCMODAL-002/003/004 cross-referenced preconditions |
| G4: Testability | 0 Critical findings | ⚠️ WARN | 1 High (VCBADGE-003 non-falsifiable), 1 Medium (VCEXPANSION-002 missing snapshot) |
| G5: Data Validity | 0 Critical/Blocker findings | ❌ FAIL | `{{TEST_SKU}}` unresolved (~25 cases) — **runtime failure** |
| G6: BL/ECL Coverage | ≥80% P0/P1 BL mapping | ✅ PASS | 100% — all rows cite BL-UI-001..006 + ECL-* |
| G7: Duplication | No same-layer duplicates | ⚠️ WARN | 1 High: LAYOUT-COMP-CONFIG-002 ≡ LAYOUT-COMP-VCPRICE-001 |
| G8: Environment | 0 BROKEN findings | ⏭️ SKIP | Phase 5 skipped |
| G9: Sync | All STALE addressed | ⏭️ SKIP | Phase 2 skipped (direct scope) |

## Findings by Severity

### Critical (3) — block regression

1. **G5 — `{{TEST_SKU}}` unresolved.** No `TEST_SKU` env var exists in `.env.vcst` / `.env.defaults` / `.env`. ~25 cart-setup cases will fail at runtime. Cases use it as `{{FRONT_URL}}/search?q={{TEST_SKU}}` and similar patterns. **Resolution:** either (a) add `TEST_SKU=8033482` to `.env.defaults`, or (b) replace `{{TEST_SKU}}` with `@td(STRESS.longTitleSku)` throughout.
2. **EV-003 — `[PRE:CLOSE_MODAL]` is an unrecognized macro.** Used in Cleanup of 8 cases (VCCONFIRMMODAL-001–004, VCSELECT-001–004). Not documented in `test-runner-tags.md`. Runner will either silently ignore it (leaking modal state across cases) or error. **Resolution:** replace with `[ACT] Press Escape key (browser_press_key: Escape) to dismiss modal` + existing `[PRE:RESET_CART]` where applicable.
3. **EV-002 — `.vc-confirmation-modal` is speculative.** VCCONFIRMMODAL-001–004 selector is unverified. **Resolution:** switch primary selector to `[role="alertdialog"]` (more stable cross-design-system pattern); keep `.vc-confirmation-modal` as secondary check; live-verify on `/cart` after triggering `[data-test-id="clear-cart-button"]`.

### High (4)

1. **D-001 — Semantic duplicate.** LAYOUT-COMP-CONFIG-002 ≡ LAYOUT-COMP-VCPRICE-001 (identical fixture, action, selectors). VCPRICE-001's own note even says "replaces out-of-matrix LAYOUT-COMP-CONFIG-002". **Resolution:** remove CONFIG-002 OR narrow its scope to a distinct check (e.g., assert `.vc-radio-button--checked` class update without DOM swap).
2. **T-001 — VCBADGE-003 assertion non-falsifiable.** Contains "relax if corner-pinned" conditional that runners cannot evaluate without live inspection. **Resolution:** split into two branches with numeric predicates for both center-overlap and corner-pinned layouts.
3. **EV-001 — `.vc-switch` selectors speculative.** VCSWITCH-001/002/003 host page (`/account/profile`) was not captured in `storefront-selectors.md`. Selector follows `vc-*` convention so likely correct but unverified. **Resolution:** live-verify before promoting from `Semi-Automated` to `Automated`.
4. **S-001 — VcCarousel ID ordering.** Rows 002 and 004 appear after 005 in file order (out-of-section). Cosmetic — IDs are unique, runners use ID lookup not row position. Low priority cleanup.

### Medium (5)

1. **C-001 — VCMODAL-003/004 cross-referenced preconditions.** Cases say "Open BOPIS modal (see VCMODAL-002 steps)" without restating required state. **Resolution:** add `Preconditions: State from LAYOUT-COMP-VCMODAL-002`.
2. **T-001 — VCEXPANSION-002 missing snapshot.** Assertion `topDelta is exactly panel 1's height change` requires capturing panel 1's bounding box before/after — currently only sibling panel 2 is captured. **Resolution:** add `rectSnapshot` of panel 1 itself before/after.
3. **D-001 — VCIMAGE-003 DOM-mutation exception.** `img.src = 'invalid://broken'` violates `feedback_real_user_interaction` per literal reading, but is the only way to test broken-image fallback. **Resolution:** add a Preconditions note documenting the exception so reviewers don't flag it later.
4. **DV-001 — `{{TEST_SKU}}` (same as Critical G5 above; rated Medium when isolated to a single case).**
5. **DV-002 — Hardcoded variation URL.** VCVARIANTPICKER-001/002/003 hardcode `/products-with-options/variations-of-jeans/baggy-regular-jeans-grey`. **Resolution:** add a `VARIANT_PRODUCT` alias to `test-data/aliases.json` and replace with `@td(VARIANT_PRODUCT.slug)`.

### Low (3)

- BL-001 — BOPIS-005 / VCMODAL-004 close-button BL-UI-006 reference is correct (passes).
- S-001 (duplicate of High S-001) — non-sequential VcCarousel IDs.
- Various speculative selectors with high convention-confidence: `.vc-expansion-panels`, `.vc-slider`, `.vc-rating`, `.vc-breadcrumbs`, `.vc-alert`, `.product-variations` — all follow `vc-*` BEM patterns. Live-verify before Automated promotion; do not block this review.

## Files Modified (Auto-Fix)

[`regression/suites/Frontend/cross-cutting/048b-layout-stability.csv`](../../../regression/suites/Frontend/cross-cutting/048b-layout-stability.csv)
- 7 occurrences of `{{BOPIS_TEST_SKU}}` → `@td(BOPIS.testSku)` in Steps columns of: VCMODAL-001/002/003/004, VCCHIP-002/003, VCSCROLLBAR-001/002.
- Verified post-fix: `grep -c "BOPIS_TEST_SKU"` returns 0; `grep -c "@td(BOPIS.testSku)"` returns 7.

## BL/ECL Coverage Map

All 158 rows cite BL-UI-001..006 and at least one ECL-* category. Distribution:

| BL-UI | Coverage |
|--|--|
| BL-UI-001 (CLS) | LAYOUT-CLS-* (4 page-level) + LAYOUT-PAGE-CLS-* (per-page) + VCIMAGE-001 + VCCAROUSEL-001 |
| BL-UI-002 (spacing grid) | Universal across all components + LAYOUT-PAGE-SPC-* |
| BL-UI-003 (state-induced shift) | Highest volume — every interactive component |
| BL-UI-004 (overflow @375) | All text-bearing components + per-page LAYOUT-OVF-* |
| BL-UI-005 (alignment) | Multi-element groups |
| BL-UI-006 (touch targets @375) | All interactive controls + LAYOUT-TGT-* / LAYOUT-PAGE-TGT-* |

## Manual Items Checklist (ordered by priority)

### Must Fix (blocks regression)

- [ ] **MUST-1** Resolve `{{TEST_SKU}}` — add env var OR replace with `@td(STRESS.longTitleSku)` (~25 cases)
- [ ] **MUST-2** Replace `[PRE:CLOSE_MODAL]` with real cleanup steps (8 cases: VCCONFIRMMODAL-001..004, VCSELECT-001..004)
- [ ] **MUST-3** Remove duplicate LAYOUT-COMP-CONFIG-002 OR narrow its scope (vs LAYOUT-COMP-VCPRICE-001)

### Should Fix (improves quality)

- [ ] **SHOULD-1** Switch VCCONFIRMMODAL primary selector to `[role="alertdialog"]`
- [ ] **SHOULD-2** Live-verify `.vc-switch` selector on `/account/profile` before VCSWITCH-* promote to Automated
- [ ] **SHOULD-3** Fix VCBADGE-003 assertion — split into two falsifiable branches
- [ ] **SHOULD-4** Add panel-1 snapshot to VCEXPANSION-002
- [ ] **SHOULD-5** Add `VARIANT_PRODUCT` alias to `test-data/aliases.json` and update VCVARIANTPICKER-001/002/003
- [ ] **SHOULD-6** Document VCIMAGE-003 broken-image exception in Preconditions
- [ ] **SHOULD-7** Add cross-referenced precondition note to VCMODAL-003/004
- [ ] **SHOULD-8** Reorder VCCAROUSEL-002/004 rows to follow VCCAROUSEL-001 in file

## Next Steps

1. **Decide TEST_SKU resolution path** (env var vs `@td(STRESS.longTitleSku)`). My recommendation: replace with `@td(STRESS.longTitleSku)` — it is already used in the suite via `STRESS.longTitleSlug` and is verified live. Adding a new env var introduces a second source of truth.
2. **Fix the 3 Critical items**, re-run `/qa-test-lifecycle suite 048b --skip-sync --skip-generate --skip-verify` to confirm clean review.
3. **Run Phase 5 verification** as a separate task: `/qa-test-lifecycle suite 048b --skip-sync --skip-generate` (with `playwright-firefox` via `qa-testing-expert`) to live-verify the speculative selectors before promoting any case from `Semi-Automated` to `Automated`.
4. **After APPROVED:** run `/qa-regression layout-stability` to exercise the suite against vcst-qa.
