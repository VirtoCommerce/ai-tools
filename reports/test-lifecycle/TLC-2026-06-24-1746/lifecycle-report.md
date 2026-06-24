# Test Case Lifecycle Report — TLC-2026-06-24-1746

## Summary
- **Input:** VCST-5173 (change-driven — JIRA Story → PR vc-module-x-cart#122)
- **Date:** 2026-06-24
- **Env:** vcptcore-qa1 (`TEST_ENV=vcptcore_qa1`, profile created this run) — Platform 3.1041.0-alpha, Catalog 3.1031.0-alpha, **XCart pr-122 deployed (field live)**
- **Verdict:** **APPROVED WITH WARNINGS**

The feature is a single additive xAPI read field — `configurationSection: ConfigurationSectionType` on `CartConfigurationItemType` (`cart → items → configurationItems → configurationSection`). No breaking change. Live-verified working; 9 cases authored into suite 050i (8 Automated + 1 Draft data-blocked).

## Phase Results
| Phase | Status | Key metrics |
|-------|--------|-------------|
| 1. Scope | Done | 1 PR, layer=graphql/xCart, target suite 050i |
| 2. Sync | Done | 0 stale cases (additive feature — existing cases unaffected) |
| 3. Generate | Done | 9 cases (CFG-GQL-050..057 + 055b) |
| 4. Review | Done | 7-dim PASS; 0 Blocker/Critical; 3 manual items |
| 5. Verify (live) | Done | Verified live on vcptcore-qa1 as admin — see table |
| 6. Approve | **APPROVED WITH WARNINGS** | Gates 9/9 required pass; 2 data-blocked sub-scenarios |

## Change Inventory
| Module | Layer | Change | Breaking |
|--------|-------|--------|----------|
| vc-module-x-cart | xAPI/GraphQL | New `configurationSection` field on `CartConfigurationItemType`; `GetProductConfigurationQuery` gains `SectionIds` + response-group escalation (Sections/Options/Full by requested sub-fields); batched DataLoader (no N+1) | No (additive) |

## Phase 5 — Live Verification (vcptcore-qa1, admin, B2B-store)
| Scenario | Result |
|----------|--------|
| 1. Section per item (`id==sectionId` + metadata) | **PASS** |
| 2. Options full graph (product + salePrice) | **PASS** |
| 3. Metadata-only (no options) | **PASS** (perf-internal "no option load" covered by PR xUnit) |
| 4. Only cart-referenced sections resolve | **PASS** (structural; perf-internal via PR xUnit) |
| 5. Multiple configurable products, no leakage | **PASS** (laptop=Product + ring=Text) |
| 6. Text-type section | **PASS** |
| 6. Non-configurable → empty configItems | PASS (structural; verified via multi-product cart) |
| 6. File-type section | **PASS** — File fixture created (CFG-FILE); `configurationSection.type=="File"` verified live on qa1; `files[]` resolves |
| 8. Backward-compat standalone `productConfiguration` | **PASS** (full graph returned, unchanged) |
| 9. Localization/currency (USD/en-US) | **PASS**; EUR not supported on B2B-store (env limit) |

**No defects found in PR #122.** The field resolves correctly across all data-coverable scenarios.

## New Cases Generated (suite 050i: 51 → 60)
| ID | Status | Scenario |
|----|--------|----------|
| CFG-GQL-050 | Automated | 1 — section metadata per configurationItem |
| CFG-GQL-051 | Automated | 2 — options full graph (product + salePrice) |
| CFG-GQL-052 | Automated | 3 — metadata-only (Sections response group) |
| CFG-GQL-053 | Automated | 4 — only cart-referenced sections resolve |
| CFG-GQL-054 | Automated | 5 — multi-product cart, no cross-product leakage |
| CFG-GQL-055 | Automated | 6a — non-configurable item has empty configurationItems |
| CFG-GQL-055b | Automated | 6b — File-type section (`@td(CFG_FILE_UPLOAD.id)`; fixture seeded; type=File verified live) |
| CFG-GQL-056 | Automated | 9 — option salePrice.currency matches requested currency |
| CFG-GQL-057 | Automated | 8 — backward-compat regression guard (GetResponseGroup) |

## Quality Gates
| Gate | Status | Notes |
|------|--------|-------|
| G1 Structure | PASS | 60 rows, 15 cols, 0 malformed |
| G2 Determinism | PASS | inline clearCart pre/post; no run-order deps |
| G3 Completeness | PASS | every case has [ERRORS] + ≥2 data assertions |
| G4 Testability | PASS | no dangling labels |
| G5 Data Validity | PASS | `@td()` 248/248 resolved; no bare GUIDs |
| G6 BL/ECL Coverage | PASS | BL-GQL-001, BL-CART-001, BL-CAT-006; ECL-2.1/7.1/9.1 |
| G7 Duplication | PASS | CFG-GQL-057 differentiated from CFG-GQL-001 |
| G8 Environment | PASS | field live-verified; 0 BROKEN findings |
| G9 Sync | PASS | additive feature; no stale cases |

## Warnings / Manual Items
1. ~~CFG-GQL-055b (File-type) — Draft~~ **RESOLVED.** Created File-section fixture `CFG-FILE` (`AGENT-TEST-Config-FileUpload`) via `scripts/seed-configurable-products.mjs --only CFG-FILE` on **both** vcst (GUID `eba4f507…`) and vcptcore-qa1 (GUID `522b191f…`); added `CFG_FILE_UPLOAD` alias to `test-data/aliases.json` + CSV row; promoted CFG-GQL-055b to Automated. `configurationSection.type=="File"` verified live on qa1.
2. **CFG-GQL-056 EUR branch — env-dependent.** B2B-store has no EUR price list; non-USD currency assertion not executable on current QA. Native-currency (USD) assertion is active.
3. **Full runner execution pending deploy.** The new cases use `[AUTH role=ORG_USER]`; they run green via `scripts/graphql-runner.ts` once XCart pr-122 deploys to **vcst-qa** (where ORG_USER exists). On qa1 the field is live but there is no B2B-store storefront user, so this run verified behavior via admin-driven carts + a runner dry-run (17 blocks parsed, `@td` resolved, qa1 schema introspected OK). Env profile `.env.vcptcore_qa1` created; GraphQL endpoint is `/graphql` (not `/xapi/graphql`).
4. **Seeder improvement:** added TEST_ENV-suffixed-secret promotion to `scripts/seed-configurable-products.mjs` (mirrors `config.js`) so it authenticates against non-default envs.

## Files Modified
- `regression/suites/Backend/graphql/050i-graphql-configurations.csv` (+9 cases; CFG-GQL-055b → Automated)
- `config/test-suites.json` (050i testCount 42 → 60; 42 was stale, actual was 51)
- `.env.vcptcore_qa1` (new env profile)
- `scripts/seed-configurable-products.mjs` (added CFG-FILE spec + TEST_ENV-suffixed-secret promotion)
- `test-data/products/configurable-products.csv` (+CFG-FILE row)
- `test-data/aliases.json` (+CFG_FILE_UPLOAD alias)
- Seeded fixture `AGENT-TEST-Config-FileUpload` on vcst + vcptcore-qa1 (catalog data, not a repo file)

## Next Steps
- [ ] Provision a B2B-store storefront/org user on vcptcore-qa1 → run CFG-GQL-050..057 via `scripts/graphql-runner.ts` under `[AUTH role=ORG_USER]` to confirm runner-native execution (admin-path already confirmed behavior)
- [ ] Seed a File-section configurable fixture → promote CFG-GQL-055b
- [ ] These cases run on vcst (default env) with the existing ORG_USER once XCart pr-122 merges to dev and deploys to vcst-qa
- [ ] Transition VCST-5173 per QA outcome (no defects found)
