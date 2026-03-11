# Test Plan — VCST-4657: Add Validation to White Labeling

**Ticket:** [VCST-4657](https://virtocommerce.atlassian.net/browse/VCST-4657)
**Type:** Story | **Priority:** High | **Status:** Testing
**Sprint:** Sprint 26-04 | **Assignee (Dev):** Konstantin Savosteev
**PR:** https://github.com/VirtoCommerce/vc-module-white-labeling/pull/24
**Date:** 2026-03-04
**QA Lead:** qa-lead-orchestrator

---

## Summary

Adds server-side FluentValidation to the White Labeling module's POST and PUT endpoints for `WhiteLabelingSetting`. The validation enforces three rules:

1. Exactly one of `StoreId` or `OrganizationId` must be set (not both, not neither)
2. `StoreId` and `OrganizationId` cannot be changed on updates (PUT)
3. Duplicate settings for the same store or organization are rejected

The Admin SPA blade maps 400 error responses to new i18n strings and surfaces them via `bladeNavigationService`.

---

## Scope

### In Scope

- REST API: POST `/api/whitelabeling` — new validation rules
- REST API: PUT `/api/whitelabeling/{id}` — immutability + duplicate checks
- Error response format: 400 with FluentValidation error array
- Admin SPA blade: error display via bladeNavigationService
- i18n error string rendering (at minimum English locale)
- Regression: previously-valid create/update flows still succeed

### Out of Scope

- Storefront rendering (no frontend changes in this PR)
- GraphQL xAPI read queries (read-only, unchanged)
- Logo/favicon upload endpoints (separate POST multipart)
- Suite 35 (frontend white labeling) — no storefront impact

---

## Test Strategy

**Approach:** Focused API contract testing + Admin SPA blade verification. This is a backend validation change — the primary risk is regression (valid inputs now rejected) and error shape mismatches (clients expecting a different error format).

**Agent Assignment:**

| Agent | Focus |
|-------|-------|
| qa-backend-expert | REST API validation testing (all rules), error response shape, regression |
| qa-testing-expert | Admin SPA blade error display, i18n strings, bladeNavigationService behavior |

**Execution:** Sequential — qa-backend-expert first to verify API layer, then qa-testing-expert to validate Admin UI error display matches API errors.

---

## Acceptance Criteria (Derived)

Based on ticket description — no explicit AC listed, deriving from the implementation overview:

| # | Criterion | Testable? |
|---|-----------|-----------|
| AC1 | POST with both StoreId and OrganizationId set → 400 | Yes |
| AC2 | POST with neither StoreId nor OrganizationId set → 400 | Yes |
| AC3 | POST with only StoreId set → 201 (valid) | Yes |
| AC4 | POST with only OrganizationId set → 201 (valid) | Yes |
| AC5 | PUT attempting to change StoreId → 400 | Yes |
| AC6 | PUT attempting to change OrganizationId → 400 | Yes |
| AC7 | POST creating duplicate setting for same StoreId → 400 | Yes |
| AC8 | POST creating duplicate setting for same OrganizationId → 400 | Yes |
| AC9 | 400 response body contains validation error array (FluentValidation format) | Yes |
| AC10 | Admin blade displays error message from bladeNavigationService on 400 | Yes |
| AC11 | Admin blade uses new i18n strings for error messages | Yes |
| AC12 | Existing valid store/org WL settings can still be saved (no regression) | Yes |

---

## Test Data Requirements

- Admin account with White Labeling write permissions
- At least one existing Store with no WL settings (for create test)
- At least one Store with existing WL settings (for duplicate test)
- At least one Organization with no WL settings (for create test)
- At least one Organization with existing WL settings (for duplicate + update immutability test)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Regression: valid inputs now 400 | Medium | High | Explicitly test AC3, AC4, AC12 |
| Error response shape unexpected by Admin blade | Medium | High | Verify blade renders error, not blank/crash |
| i18n strings missing (showing key names) | Low | Medium | Check rendered text vs raw i18n key |
| PUT immutability check too strict (blocks valid updates) | Medium | High | Test PUT with unchanged StoreId/OrgId values |

---

## Quality Gate

This is a P1 backend story. Approval requires:
- 0 P0/P1 bugs
- All 12 acceptance criteria verified
- Admin blade shows errors correctly (no silent failures)
- Regression cases pass (no false-positive 400s on valid data)

---

## Artifacts

```
tests/Sprint26-04/VCST-4657-white-labeling-validation/
├── test-plan.md                    (this file)
├── test-cases.md                   (detailed test specifications)
├── test-execution-report.md        (results — populated after execution)
└── screenshots/                    (evidence — populated during execution)
```

---

## References

- White Labeling knowledge: `.claude/agents/knowledge/white-labeling.md`
- Backend regression suite 32: `regression/suites/Backend/32-whitelabeling-tests.csv`
- PR #24: https://github.com/VirtoCommerce/vc-module-white-labeling/pull/24
