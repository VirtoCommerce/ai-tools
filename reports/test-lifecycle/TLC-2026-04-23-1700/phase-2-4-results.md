# TLC-2026-04-23-1700 — Phases 2–4 Results
**Run date:** 2026-04-23
**Ticket:** VCST-4710 | **PR:** #129 (vc-module-profile-experience-api)
**Scope:** Address management surfaces NOT covered by TLC-2026-04-23-1230

---

## Deploy State

| Component | Version |
|-----------|---------|
| Platform | 3.1023.0-pr-2987-9f4a-vcst-4710-9f4aa704 |
| Theme | 2.48.0-pr-2219-d5f9-d5f99481 |
| Customer Module | 3.1007.0-alpha.976-vcst-4710 |
| Profile xAPI Module | 3.1005.0-pr-129-03f6 |

---

## Phase 2 — Sync Results

**Suites scanned:** 010-b2c-bulk-ship-dashboard.csv, 006-b2c-organization.csv
**Cases scanned:** 62 | **Classifications:** 59 VALID, 3 INCOMPLETE, 0 STALE, 0 BROKEN

### Cases Updated (3)

**B2C-SHIP-001** (INCOMPLETE → SYNCED)
Added Cross_Layer_Checks: `[API] currentCustomerAddresses errors[] is empty; totalCount matches visible count`. Updated preconditions: personal-account-only scope + explicit `/account/addresses` URL. Added conditional DOM assertions for search/facet controls if present.

**B2C-SHIP-002** (INCOMPLETE → SYNCED)
Added Cross_Layer_Checks: `[API] updateMemberAddresses errors[] is empty` + `[API] if checkDuplicateAddress called: isDuplicated = false for new address`. Updated preconditions to note PR #129 duplicate prevention wiring. References appended: `VCST-4710; Synced TLC-2026-04-23-1700`.

**B2C-ORG-004** (INCOMPLETE → SYNCED) — authz spot-check case
Added Cross_Layer_Checks: `[API] currentOrganizationAddresses called after org switch; scope reflects Org B; errors[] empty; no Org A data leaked (authz boundary per PR #129 ProfileAuthorizationHandler)`. Added ECL-14.3 ref. No new case needed — sync was sufficient.

---

## Phase 3 — Generated Cases (7)

### Suite 050d-graphql-xprofile.csv (+4 cases: GQL-056..059)

| ID | Title | Priority | Technique | BL/ECL |
|----|-------|----------|-----------|--------|
| GQL-056 | updateMemberAddresses Skips Duplicate Address on Insert (Silent No-Op) | High | State Transition | PROPOSED-BL-PROFILE-001, ECL-5.1 |
| GQL-057 | currentOrganizationAddresses Cross-Org Access Denied (AuthZ Refactor Regression Guard) | High | Error Guessing | BL-B2B-001, ECL-14.3 |
| GQL-058 | checkDuplicateAddress AuthZ — Cannot Check Another Member's Addresses | High | Error Guessing | BL-B2B-001, ECL-14.3 |
| GQL-059 | checkDuplicateAddress Required Fields Validation (Missing city/line1/countryCode) | Medium | BVA | ECL-5.1 |

### Suite 010-b2c-bulk-ship-dashboard.csv (+3 cases: B2C-SHIP-014..016)

| ID | Title | Priority | Technique | BL/ECL |
|----|-------|----------|-----------|--------|
| B2C-SHIP-014 | Add Duplicate Address Shows Warning (Duplicate Prevention UX) | High | Error Guessing | BL-B2C-003, ECL-5.1 |
| B2C-SHIP-015 | Address Facet Filters (Country/State/City) on /account/addresses | High | EP + Error Guessing | BL-B2C-003, ECL-3.2 |
| B2C-SHIP-016 | Address Search Keyword Filters List | High | EP + State Transition | BL-B2C-003, ECL-3.2 |

---

## Phase 4 — Review Results

**Cases reviewed:** 10 (3 synced + 7 generated)
**Auto-fixes applied:** 0 | **Manual items remaining:** 5

### Quality Gate Results

| Gate | Result | Note |
|------|--------|------|
| G1 Structure | PASS | Valid 15-col CSV; sequential IDs; no collisions |
| G2 Determinism | PASS | Correct layer-specific tags throughout |
| G3 Completeness | PASS | All cases: preconditions, 2+ assertions, Cross_Layer_Checks, Failure_Signals, Cleanup |
| G4 Testability | WARN | GQL-058 foreign memberId env-dependent; B2C-SHIP-014 duplicate branch undetermined |
| G5 Data Validity | PASS | All {{VAR}} tokens from known env set; no hardcoded IDs/addresses |
| G6 BL/ECL Coverage | WARN | GQL-056 references proposed BL-PROFILE-001 (not yet in business-logic.md) |
| G7 No Duplication | PASS | No overlap with GQL-054/055, GQL-052/053, or CHK-087..106 |
| G8 GraphQL Schema | PASS | All queries verified in graphql-schema.md; isDuplicated field consistent with TLC-1230 |
| G9 Golden Rule | PASS | Zero hardcoded data; runtime resolution via {{VAR}} or me query |

### Findings

| Case | Dimension | Severity | Description |
|------|-----------|----------|-------------|
| GQL-056 | BL Coverage | Medium | BL-PROFILE-001 is proposed — not yet in business-logic.md. If PROFILE domain absent, use BL-GQL-003 or new domain. |
| GQL-058 | Testability | Medium | Foreign memberId requires admin lookup — may need manual run initially |
| B2C-SHIP-014 | Testability | Medium | Duplicate UX behavior (warning vs silent skip) not yet confirmed — both branches documented |
| B2C-SHIP-015 | Data Validity | Medium | Personal multi-country address seed may be insufficient — TechFlow seed is org-scoped |
| B2C-SHIP-016 | Data Validity | Low | "Portland" city example — substitute with any city actually in personal account seed |

### Schema Validation Note
Field `isDuplicated` (not `isDuplicate`) confirmed by TLC-2026-04-23-1230 live schema validation and promoted cases GQL-054/055. `AddressDuplicatedResultType` return type not documented in graphql-schema.md beyond the query signature — `duplicateId` field mentioned in PR description requires Phase 5 confirmation.

---

## Manual Items (5)

1. **GQL-056** — BL-PROFILE-001 is proposed; requires explicit user approval before promotion to business-logic.md
2. **GQL-058** — Foreign memberId construction requires admin lookup; flag for manual execution initially
3. **B2C-SHIP-014** — Duplicate prevention UI branch (warning vs silent) must be confirmed via Phase 5 live exploration; narrow assertions after
4. **B2C-SHIP-015** — Verify {{USER_EMAIL}} personal account has 10+ multi-country addresses; flag SEED_NEEDED if insufficient
5. **B2C-SHIP-016** — Confirm city name in keyword test matches actual personal account seed data

---

## BL Proposals

**PROPOSED-BL-PROFILE-001** (requires user approval)
Domain: Profile / Address Management
Rule: When `updateMemberAddresses` is called with an address identical to an already-saved address (matched by line1 + city + countryCode + postalCode + regionId + addressType), the duplicate MUST be silently skipped — no insert, no error, totalCount unchanged.
Source: PR #129 `MemberAggregateRootBase.UpdateAddresses`; triggered by: GQL-056, B2C-SHIP-014

---

## Test Count Changes

| Suite | Before | After | Delta | Added | Synced |
|-------|--------|-------|-------|-------|--------|
| 050d-graphql-xprofile.csv | 22 | 26 | +4 | GQL-056..059 | — |
| 010-b2c-bulk-ship-dashboard.csv | 51 | 54 | +3 | B2C-SHIP-014..016 | B2C-SHIP-001, 002 |
| 006-b2c-organization.csv | 39 | 39 | 0 | — | B2C-ORG-004 |

---

## Phase 5 Verification Targets

| Target | URL | Priority | Agent |
|--------|-----|----------|-------|
| GQL-056 — duplicate skip live validation | `{{BACK_URL}}/ui/graphiql` | High | qa-backend-expert |
| GQL-057 — own-org not broken by authz refactor (22 TechFlow addresses) | `{{BACK_URL}}/ui/graphiql` | High | qa-backend-expert |
| GQL-058 — foreign memberId authz denied | `{{BACK_URL}}/ui/graphiql` | High | qa-backend-expert (manual) |
| B2C-SHIP-014 — determine warning vs silent branch on /account/addresses | `{{FRONT_URL}}/account/addresses` | High | qa-frontend-expert |
| B2C-SHIP-015/016 — confirm search/facet controls exist; check personal address seed | `{{FRONT_URL}}/account/addresses` | Medium | qa-frontend-expert |
| checkDuplicateAddress — confirm `duplicateId` field in schema | `{{BACK_URL}}/ui/graphiql` | Medium | qa-backend-expert |

---

## Files Modified

- `regression/suites/Backend/graphql/050d-graphql-xprofile.csv`
- `regression/suites/Frontend/b2c/010-b2c-bulk-ship-dashboard.csv`
- `regression/suites/Frontend/b2c/006-b2c-organization.csv`
- `config/test-suites.json` (testCount updated: 050d 22→26, 010 51→54)
