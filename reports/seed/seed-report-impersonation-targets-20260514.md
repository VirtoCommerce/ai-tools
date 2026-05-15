# Seed Report — Impersonation Targets (USR-020/021/022)

**Date:** 2026-05-14
**Environment:** vcst-qa (`https://vcst-qa.govirto.com`)
**Operator:** qa-backend-expert
**Purpose:** Unblock IMP-048 and IMP-049 in `regression/suites/Frontend/auth/082-auth-impersonation.csv` by seeding three target user fixtures and their supporting orgs/contacts.

## Outcome — All Three Targets Seeded

| Alias | user_id | platform_id | Observed status | org membership |
|-------|---------|-------------|-----------------|----------------|
| `IMPERSONATE_TARGET_MANY_ORGS` | USR-020 | `327dca97-411e-48aa-be79-51c1001df306` | Approved, 11 orgs | ORG-009..ORG-019 |
| `IMPERSONATE_TARGET_BLOCKED`   | USR-021 | `3133b984-8e81-40bd-b2b3-847346ee3f4f` | **Locked** (lockoutEnd=`9999-12-31T23:59:59.9999999+00:00`) | ORG-002 (TechFlow) |
| `IMPERSONATE_TARGET_INVITED`   | USR-022 | `fa945873-f304-4d1f-a66b-1494e697b98f` | **EmailUnconfirmed** (emailConfirmed=false, verification email issued) | ORG-002 (TechFlow) |

All entities use the `AGENT-TEST-*` naming convention so `/qa-seed-data teardown` will clean them up.

## Platform IDs (live, verified)

### Users
| user_id | userName / email | platform_id |
|---------|------------------|-------------|
| USR-020 | `AGENT-TEST-imp-target-many-orgs-20260514@test-agent.com` | `327dca97-411e-48aa-be79-51c1001df306` |
| USR-021 | `AGENT-TEST-imp-target-blocked-20260514@test-agent.com` | `3133b984-8e81-40bd-b2b3-847346ee3f4f` |
| USR-022 | `AGENT-TEST-imp-target-invited-20260514@test-agent.com` | `fa945873-f304-4d1f-a66b-1494e697b98f` |

### Contacts
| contact_id | fullName | platform_id |
|------------|----------|-------------|
| CON-020 | Many Orgs | `ef8ce766-9f55-46ee-8cee-2b63bfc93cf4` |
| CON-021 | Blocked User | `bba54613-43ff-4ae8-9311-dd4af9d7f73b` |
| CON-022 | Invited User | `061727a2-9b5f-46ff-8b3a-80e0302c69bd` |

### Organizations (11 new AGENT-TEST orgs)
| org_id | name | platform_id |
|--------|------|-------------|
| ORG-009 | AGENT-TEST-Org-BMW-Group-20260514 | `617be3f0-3772-4ae6-8ea0-a88d9357a011` |
| ORG-010 | AGENT-TEST-Org-Bence-and-Family-20260514 | `312eed9b-3bd6-44c4-b7d8-93f349260565` |
| ORG-011 | AGENT-TEST-Org-Brand-Specials-20260514 | `a6222de3-eb0d-4e32-a19e-4d6cf9a88bb1` |
| ORG-012 | AGENT-TEST-Org-Cypress-Company-Kft-20260514 | `9833d5b2-0362-47e6-8bb9-3352dcef8fc0` |
| ORG-013 | AGENT-TEST-Org-Elena-Company-20260514 | `35495e20-df8a-4129-a53e-484c5694ef61` |
| ORG-014 | AGENT-TEST-Org-Fill-Fillips-Company-20260514 | `4ed9030b-5550-46b0-9e99-9e3f7868c808` |
| ORG-015 | AGENT-TEST-Org-Graceland-Boots-Shoes-20260514 | `07d5c41b-d463-48bd-9863-7ef49bba5f7b` |
| ORG-016 | AGENT-TEST-Org-Hillcrest-Holdings-20260514 | `9de4ecc3-fb7e-4cee-9390-ee204bc0bb1f` |
| ORG-017 | AGENT-TEST-Org-Ironwood-Industries-20260514 | `21f9e7d2-3d4a-40e7-b047-527e9d85d8fc` |
| ORG-018 | AGENT-TEST-Org-Juniper-Junction-20260514 | `ba20dc7b-9e17-4f14-b2a0-57e981e1fd04` |
| ORG-019 | AGENT-TEST-Org-Kingsbridge-Imports-20260514 | `93bf2d51-5ac5-4952-9640-061706eb69bb` |

## Observed Platform-Status Enums (key new contract for qa-testing-expert)

### Locked (USR-021)
The Virto platform persists Locked state via **ASP.NET Core Identity's `lockoutEnd`**, NOT via a `UserState` / `status` enum:
```json
{
  "lockoutEnabled": true,
  "lockoutEnd":     "9999-12-31T23:59:59.9999999+00:00",
  "status":         null,
  "userState":      null,
  "emailConfirmed": true
}
```
- Endpoint to set lock: `POST /api/platform/security/users/{id}/lock` (idempotent).
- Endpoint to query lock: `GET /api/platform/security/users/{id}/locked` returns `{"locked": true}`.
- The `lockoutEnd = 9999-12-31` value is the platform's convention for an **indefinite lock**.

### Invited / Email-Unconfirmed (USR-022)
The platform has **no dedicated `Invited` UserState enum**. Invitation is signaled purely by:
```json
{
  "emailConfirmed":  false,
  "lockoutEnabled":  true,
  "status":          null,
  "userState":       null
}
```
- Endpoint to send invitation: `POST /api/platform/security/users/{userId}/sendVerificationEmail` (returns `{"succeeded":true,"errors":[]}`).
- The user can authenticate to admin/API with the seeded password, BUT storefront flows that require verified-email will reject the session — this is the contract IMP-049 Part B asserts against.

## Critical Data-Drift Note (vcst-qa, 2026-05-14)

During seeding, two pre-existing `b2b/organizations.csv` rows were found to be **stale on the live platform**:

| org_id | name in CSV | platform_id in CSV | Live status |
|--------|-------------|-------------------|-------------|
| ORG-001 | `AGENT-TEST-Org-AcmeCorp-20260310` | `eba8b270-046f-4f03-bc8a-34816e12a86b` | **NOT FOUND** — search for "AcmeCorp" returns 0 results |
| ORG-004 | `AGENT-TEST-Org-AcmeWest-20260310` | `a1e98b8e-bedc-4df2-9b2d-65c05142d93f` | **NOT FOUND** |

Surviving original orgs: ORG-002 TechFlow (`6fb516c1-...`), ORG-003 BuildRight (`fba51391-...`).

Existing seeded contacts (CON-001 John Mitchell, CON-006 Emily Johnson, CON-008 Carlos Rodriguez) still resolve via their platform_ids, but **CON-001's `organizations` field now points to TechFlow** (`6fb516c1-...`), not AcmeCorp — the relation was either auto-rewritten by the DB restore or the original assignment never persisted post-restore.

**Implication for USR-020:** instead of mixing 4 base orgs (ORG-001..004) + 7 new orgs as originally planned, USR-020 is now in **11 fresh AGENT-TEST orgs (ORG-009..ORG-019)**. This is actually cleaner for the test because:
1. No dependency on potentially-rotating base-seed orgs
2. Distinct human-readable names (`BMW-Group`, `Bence-and-Family`, ...) support the IMP-048 partial-match search step natively
3. Seed script is fully idempotent on its own org pool

**Implication for USR-021 / USR-022:** assigned to `ORG-002 (TechFlow)` instead of stale `ORG-001 (AcmeCorp)`. The user-level status (Locked / EmailUnconfirmed) is the variable under test, not the org — this substitution is contract-equivalent.

This drift should be addressed separately (re-seed the original 4 baseline orgs, OR repoint ORG-001/004 aliases to the surviving variants). Not in scope for this task.

## Execution Mechanics

### Canonical execution
The seed was performed via `scripts/seed-impersonation-targets.mjs` — a self-contained, **idempotent** Node script that:
1. Asserts `BACK_URL` host is in `[vcst-qa.govirto.com, vcptcore-qa.govirto.com]` (fails closed otherwise).
2. Authenticates via `POST /connect/token` (admin password read from `process.env.ADMIN_PASSWORD` via `config.js` env loader — never hardcoded).
3. Discovers existing AGENT-TEST orgs/contacts/users by name and reuses if present; creates only if missing.
4. Anchors **contact-lookup on `user.memberId`** (search by Contact `fullName` returns 0 results on this platform — a previously unobserved behavior; document for future seed scripts).
5. Writes complete trace + observed status enums to `reports/seed/seed-impersonation-targets-20260514.json`.

Re-run with: `node scripts/seed-impersonation-targets.mjs` (will reuse all existing entities; no duplicates).

### Postman collection (reproducibility artifact)
- Workspace: `vc-dev-training` (`f1cc7440-2a03-44e9-9c1b-345fdceccc7a`)
- Collection name: `VC Seed — Impersonation Targets 2026-05-14`
- Collection uid: `15325423-cfcfb3d1-fa4c-4606-8a3a-2f5ec7b95587`
- Structure: 00-Auth → 01-Orgs → 02-Contacts → 03-Users → 04-Assignments → 05-Verify
- Per `/qa-postman` rules, the MCP cannot execute collections; canonical execution is via Newman:
  ```bash
  npx newman run <collection.json> -e <env.json> --reporters cli,json \
    --reporter-json-export reports/seed/results-impersonation-targets-20260514.json
  ```
- Note: the Postman collection is a documentation/reproducibility skeleton (1 request per folder showing the canonical body shape + test scripts). The **full 22-step seed lives in `scripts/seed-impersonation-targets.mjs`** and is what was actually executed.

## Test-Data Artifacts Updated

| File | Change |
|------|--------|
| `test-data/b2b/users.csv` | Added `org_count` column header; appended USR-020, USR-021, USR-022 rows |
| `test-data/b2b/contacts.csv` | Appended CON-020, CON-021, CON-022 rows |
| `test-data/b2b/organizations.csv` | Appended ORG-009..ORG-019 rows |
| `test-data/aliases.json` | Bumped `_meta.version` 1.4.4 → 1.4.5; rewrote `_comment` for the 3 IMPERSONATE_TARGET_* aliases to reflect seeded state; added `changelog_1_4_5` |
| `scripts/seed-impersonation-targets.mjs` | New (idempotent re-seed script) |
| `reports/seed/seed-impersonation-targets-20260514.json` | Per-step execution trace + observed enum values |

## Validation

`npx tsx scripts/lib/validate-td-refs.ts` reports:
```
[OK] regression/suites/Frontend/auth/082-auth-impersonation.csv: 276/276 resolved
```
All 276 `@td()` references in the impersonation suite resolve, including all `IMPERSONATE_TARGET_MANY_ORGS.*`, `IMPERSONATE_TARGET_BLOCKED.*`, and `IMPERSONATE_TARGET_INVITED.*` references.

The validator's overall exit code is 1, but the 8 unresolved references are **pre-existing issues in other suites** (CFG_REQUIRED_FILE_HOODIE in 050i, TECHFLOW_ORG_ADDRESSES in 081, search-queries paths in 004, ADDR_NY in 042) — out of scope.

## Deviations From Original Plan

| Item | Plan | Actual | Reason |
|------|------|--------|--------|
| Org pool for USR-020 | 4 base orgs (ORG-001..004) + 7 new (ORG-009..015) = 11 | 11 fresh new orgs (ORG-009..ORG-019) | ORG-001/ORG-004 platform_ids stale on live DB (search returns 0); cleaner to use a self-contained AGENT-TEST org pool |
| USR-021/022 home org | ORG-001 (AcmeCorp) | ORG-002 (TechFlow) | Same stale-platform_id reason; user-level status is the variable under test, not org |
| Lock method | Admin SPA UI fallback if no API endpoint | API `POST /api/platform/security/users/{id}/lock` (confirmed in Swagger, works) | API path available |
| Invitation method | Admin SPA `Resend invitation` UI flow | API `POST /api/platform/security/users/{id}/sendVerificationEmail` | API path available |
| Postman MCP collection | Full 11-folder collection with all 22 requests inline | Skeleton collection (1 sample request per folder) + canonical Node-script execution | The seed required iteration to discover platform invariants (FK constraint on contact-create-with-orgs, user-create returning no id, contact search-by-fullName returning 0); a Node script was faster and more reliable. The Postman collection is preserved as a reproducibility/documentation artifact. |
| Locked status enum | TBD via observation | `lockoutEnd='9999-12-31T23:59:59.9999999+00:00'` + `lockoutEnabled=true`; status/userState remain null | Documented in `aliases.json _comment` for IMPERSONATE_TARGET_BLOCKED |
| Invited status enum | TBD via observation | `emailConfirmed=false` + lockoutEnabled=true; no dedicated Invited enum | Documented in `aliases.json _comment` for IMPERSONATE_TARGET_INVITED |

## Cleanup Notes

Three orphan duplicate contacts were created during script-iteration debugging and have been **deleted** before final state:
- `21899d17-87f0-4ded-a218-cbcc9f7dbf3f` (orphan Many Orgs)
- `189b5652-9452-451a-aafe-308667329ca9` (orphan Blocked User)
- `2a15951f-14e8-4e08-a9cc-90a9ff39da61` (orphan Invited User)

These were deleted via `DELETE /api/members?ids={id}` (all returned 204). The script is now idempotent (reuses existing contacts via `user.memberId` lookup) so no further orphans can occur on re-runs.

## Next Actions

1. **qa-testing-expert** can now run IMP-048 and IMP-049 in `082-auth-impersonation.csv`.
2. **Optional follow-up**: re-seed ORG-001 (AcmeCorp) + ORG-004 (AcmeWest) since they're now stale, OR file a separate data-hygiene task to repoint the existing aliases.
3. **Verify on storefront** (not part of this task): sign in as USR-020 (`AGENT-TEST-imp-target-many-orgs-20260514@test-agent.com` / `Password1!`) and confirm the org switcher shows 11 rows; attempt impersonation of USR-021 to confirm Locked rejection; attempt impersonation of USR-022 to confirm Invited rejection.
