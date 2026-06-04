# Test Case Lifecycle Report — TLC-2026-06-04-1309

## Summary
- **Input:** VCST-5022 + PR vc-module-marketing-experience-api#16
- **Input Type:** change-source
- **Date:** 2026-06-04 13:09
- **Platform:** 3.1032.0 · **Theme:** vc-theme-b2b-vue-2.51.0-alpha.2362
- **Module Versions:** MarketingExperienceApi 3.1002.0-pr-16-3e3b (PR artifact, deployed unmerged), Marketing 3.1003.0
- **Verdict:** **APPROVED WITH WARNINGS**

Change: 1-line resolver fix — `PromotionCouponsQueryHandler` now assigns `criteria.Sort = request.Sort` (sort was silently dropped). Non-breaking; invalid-sort `errors[]` validation explicitly deferred per PR body.

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 4 suites (050j, 079, 077, 077-smoke), change-source |
| 2. Sync | test-management-specialist | Done | 54 cases reviewed, **0 stale** (no case asserted the old broken order) |
| 3. Analyze & Generate | test-management-specialist | Done | 3 gaps → 3 cases generated (MKT-GQL-018/019/020) |
| 4. Review & Fix | test-management-specialist | Done | 5 findings (0 Blocker/Critical, 2 Low, 3 Info), 2 auto-fixed |
| 5. Verify | runner live-exec (in lieu of browser) | Done | 3/3 new cases PASS live (16/16 assertions); surfaces E2E-verified same day (`reports/tickets/VCST-5022/`) |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | Gates: 9/9 pass (2 with warnings) |

## Sync Results
No STALE/INCOMPLETE/BROKEN cases. All 17 MKT-GQL cases (050j), 079, 077, and 077-smoke cases either omit `sort` (default ordering unchanged) or test orthogonal concerns (auth, schema, pagination, filter). MKT-GQL-002 (introspection: `sort` nullable arg) remains VALID — schema unchanged.

## Coverage Delta

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| 050j case count | 13 | 16 | +3 |
| Sort-behavior coverage on promotionCoupons | 0 cases | 3 cases | regression guard added |

## New Cases Generated

| Case ID | Suite | Title | Layer | Priority |
|---------|-------|-------|-------|----------|
| MKT-GQL-018 | 050j | sort=endDate:asc non-decreasing order (VCST-5022 regression guard; asc/desc inversion proof) | graphql | Critical |
| MKT-GQL-019 | 050j | sort=name:asc differs from no-sort (fix not endDate-specific) | graphql | High |
| MKT-GQL-020 | 050j | sort=doesnotexist:asc succeeds silently (deferred-validation contract per PR #16) | graphql | Medium |

Runner live validation: MKT-GQL-018 PASS 8/8 · MKT-GQL-019 PASS 5/5 · MKT-GQL-020 PASS 3/3. Suite lint: 0 findings. `validate-td-refs`: clean (new cases use `{{VAR}}` + captures only).

## Quality Gates

| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | PASS | Lint 0 findings on full 20-case suite |
| G2 Determinism | PASS | No Critical findings |
| G3 Completeness | PASS | 0 High findings |
| G4 Testability | WARN | asc/desc inversion proof is EVIDENCE-manual (runner has no cross-variable inequality predicate); trivially-true self-comparison caught and fixed |
| G5 Data Validity | PASS | Schema-validated against refreshed `graphql-schema.md` (DV-006..011) |
| G6 Coverage | PASS | New cases mapped to BL-GQL-002 / BL-PRICE-001 |
| G7 Duplication | PASS | No overlap with MKT-GQL-001..017 |
| G8 Environment | PASS | Live runner exec 16/16 against PR artifact; same-day E2E VERIFIED |
| G9 Sync | PASS | 0 stale; nothing to address |

## Remaining Items (Should Fix)

| Item | Issue | Note |
|------|-------|------|
| MKT-GQL-018 | EVIDENCE inversion check (ASC vs DESC first item) is runner-manual | Degrades if env re-seeded with identical endDates |
| CPN-025 (077) | Hardcoded `totalCount = 14`; live env has 19 | **Pre-existing**, not caused by this change — fix in next 077 sync pass |
| MKT-GQL-017 / CPN-062 | `@needs-env-without-xmarketing` | Not executable on vcst-qa (needs second env) |

## Files Modified
- `regression/suites/Backend/graphql/050j-graphql-xmarketing.csv` — +3 cases (MKT-GQL-018/019/020)
- `config/test-suites.json` — 050j testCount 13 → 16
- `.claude/agents/knowledge/graphql-schema.md` — pre-flight `npm run schema:refresh`

## Next Steps
- [ ] PR #16 awaits human review/merge (JIRA VCST-5022 in Testing; E2E already VERIFIED)
- [ ] After merge: re-run `MKT-GQL-018..020` on the release artifact (`/qa-regression 050j` or `--case` runner)
- [ ] Fix CPN-025 hardcoded count in next 077 lifecycle pass
