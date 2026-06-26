# Test Case Lifecycle Report — TLC-2026-06-26-1249

## Summary
- **Input:** VCST-5177 (env arg: https://vcptcore-qa1.govirto.com/)
- **Input Type:** change-source (JIRA ticket + 3 linked code PRs)
- **Feature:** Configurable products sorting — store-configurable "Sort by" orderings for catalog browse + search
- **Date:** 2026-06-26 12:49
- **Env:** vcptcore-qa1 @ Platform 3.1039.0, theme 2.52.0-pr-2350 (feature build confirmed live)
- **Module builds:** Catalog 3.1032.0-alpha.2558-vcst-5177, XCatalog 3.1009.0-alpha.218-vcst-5177
- **Verdict:** ✅ **APPROVED WITH WARNINGS**

## Change Inventory
| Repo / PR | Layer | Change | Breaking |
|-----------|-------|--------|----------|
| vc-module-catalog [#894](https://github.com/VirtoCommerce/vc-module-catalog/pull/894) | Backend + Admin SPA | Built-in sort orderings in code; admin manages at Stores → Search configuration → Sorting (rename/reorder/hide/show/add/delete custom); badges DEFAULT/HIDDEN/CUSTOM/READ-ONLY; only overrides stored | No |
| vc-module-x-catalog [#97](https://github.com/VirtoCommerce/vc-module-x-catalog/pull/97) | xAPI/GraphQL | `products.sortings: [ProductSortingType!]!` = `{id,name,isDefault,selected}`; empty sort→default; raw/hidden/unknown→nothing selected; priority→per-category merchandising field | No (additive) |
| vc-frontend [#2350](https://github.com/VirtoCommerce/vc-frontend/pull/2350) | Storefront | "Sort by" dropdown built from API; default maps to clean URL; blank control for hidden/unknown/raw `?sort`; validator loosened to token regex; `useProductSortings` composable | ⚠️ Adds `sortings` to SearchProducts query → new FE + old BE errors |

## Phase Results
| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 4 suites affected; change-source |
| 2. Sync | test-management-specialist | Done | 6 stale cases updated |
| 3. Analyze & Generate | test-management-specialist | Done | 15 gaps → 14 cases created |
| 4. Review & Fix | test-management-specialist | Done | 0 Blocker/Critical; 2 High auto-fixed + 4 Phase-5 corrections applied |
| 5. Verify | orchestrator (GraphQL) + qa-testing-expert (browser) | Done | GraphQL semantics 4/4 + storefront 9/9 VERIFIED |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | Gates 9/9 required PASS |

## Sync Results (Phase 2)
| Case ID | Suite | Classification | Fix |
|---------|-------|----------------|-----|
| SRCH-007 | 004 | STALE | Removed non-existent 'Relevance' option + 'Price: Low to High' literal; live-discover + direction-change oracle |
| SRCH-NEW-011 | 004 | STALE | Removed default='Featured' assumption (default is store-configurable); identify default by `isDefault=true` |
| SRCH-NEW-049 | 004 | STALE+BROKEN model | Label de-hardcoded; pagination rewritten to infinite-scroll (no `?page`) |
| SRCH-NEW-041 | 005 | STALE | 'Price: High to Low' literal → live label + code |
| SRCH-JRNY-006 | 005 | STALE | Monotonic price step → URL + selected-state oracle |
| CAT-007 | 001 | STALE | Hardcoded labels removed; URL persistence + infinite-scroll added |

## New Cases Generated (Phase 3) — 14, all `Draft`
**GraphQL (050a):** CAT-GQL-126 (sortings shape), 127 (empty→default selected), 128 (explicit code + direction oracle), 129 (unknown→nothing selected), 130 (raw expr passthrough), 131 (localized name), 132 (additive-compat: query without sortings).
**Storefront (004):** SRCH-NEW-057 (options match API), 058 (`?sort` round-trip + clean default URL), 059 (hidden/unknown → blank control, results still load).
**Admin cross-layer (001):** CAT-064 (reorder→DEFAULT shift), 065 (hide→excluded but code resolves), 066 (add CUSTOM/deletable, READ-ONLY locked), 067 (badge semantics). ⚠️ Admin SPA UI-blocked → Manual.

## Coverage Delta
| Suite | Before | After | Δ |
|-------|--------|-------|---|
| 001-catalog-navigation | 19 | 26 | +7 |
| 004-search-core | 32 | 41 | +9 |
| 050a-graphql-xcatalog | 38 | 47 | +9 |
| 005-search-filters-advanced | (synced only) | — | 0 |

## Phase 5 — Live Verification (all VERIFIED)
**GraphQL (orchestrator, live curl on vcptcore-qa1):**
- Empty `sort` → `name-descending` is `isDefault=true` **and** `selected=true`.
- `sort:price-ascending` → that option `selected=true`; `price.actual.amount` path resolves.
- Raw expr `name:asc` & unknown `bogus-xyz` → nothing `selected`, 192 results still returned.
- ⚠️ Price sort orders by **indexed** price (`price_usd`), which **diverges from resolved `price.list`/`actual`** for pack/variation products → monotonic-displayed-price assertions are invalid (fixed in oracle).

**Storefront (qa-testing-expert, playwright-edge — firefox not installed in MCP container):** 9/9 checks VERIFIED on theme 2.52.0-pr-2350:
1. `sortings` present in live SearchProducts (withFacets:true) on search + category · 2. dropdown 7 options match API order/labels · 3. default "Alphabetically, Z-A", clean URL · 4. select non-default sets `?sort` + reorders · 5. select default clears `?sort` · 6. deep-link round-trip · 7. unknown code → blank control, results load (0 console errors) · 8. sort persists across infinite-scroll · 9. category page backend-driven too.

**Environment corrections fed back to Phase 4 (applied):** infinite-scroll pagination model (not `?page`); price-sort direction-change oracle (not monotonic displayed price); custom VcSelect open-then-click interaction pattern.

## Quality Gates
| Gate | Status | Detail |
|------|--------|--------|
| G1 Structure | PASS | Valid CSV, unique IDs, manifest testCounts updated |
| G2 Determinism | PASS | VcSelect interaction made explicit; element refs specific |
| G3 Completeness | PASS | 2 High (env-specific names) auto-fixed |
| G4 Testability | PASS | Falsifiable oracles (selected flag, direction-change) |
| G5 Data Validity | PASS | 3003/3003 `@td()` resolved; GraphQL validated vs refreshed schema |
| G6 Coverage | PASS | BL-CAT-005 / BL-SRCH-001 mapped on all sort cases |
| G7 Duplication | PASS | No same-layer duplicates |
| G8 Environment | PASS | GraphQL 4/4 + storefront 9/9 VERIFIED live |
| G9 Sync | PASS | All 6 STALE updated; no BROKEN left open |

## Files Modified
- `regression/suites/Frontend/search/004-search-core.csv` (3 synced + 6 new)
- `regression/suites/Frontend/search/005-search-filters-advanced.csv` (2 synced)
- `regression/suites/Frontend/catalog/001-catalog-navigation.csv` (1 synced + 4 new)
- `regression/suites/Backend/graphql/050a-graphql-xcatalog.csv` (7 new)
- `config/test-suites.json` (testCounts: 001→26, 004→41, 050a→47)
- `.claude/agents/knowledge/api/graphql-schema.md` (pre-flight schema refresh)

## Remaining Items
### Should Fix (improves quality, non-blocking)
| Item | Note |
|------|------|
| Promote 14 `Draft` cases → Reviewed | Requires qa-lead-orchestrator approval |
| CAT-064..067 admin automation | Blocked by Admin-SPA storageState gap (repo-wide); executable manually only |
| CAT-GQL-131 de-DE locale | If de-DE not configured on B2B-store, assert en-US baseline only |

## Next Steps
- [ ] Promote Draft cases (qa-lead-orchestrator)
- [ ] Run `/qa-regression search,catalog` (+ 050a) once cases are Reviewed — feature is live and verified
- [ ] Track Admin-SPA storageState gap to unblock CAT-064..067 automation
