# B2B Test Data Seed Report — 2026-03-10

**Platform:** https://vcst-qa.govirto.com
**Store:** B2B-store
**Date:** 2026-03-10
**Method:** REST API via admin token (`/api/members`, `/api/platform/security/users/create`)
**Naming Convention:** `AGENT-TEST-*-20260310` prefix for all entities

---

## Summary

| Entity | Count | Status |
|--------|-------|--------|
| Organizations | 4 | All verified (HTTP 200) |
| Contacts | 10 | All verified (HTTP 200) |
| User Accounts | 10 | All verified (HTTP 200) |
| Member Index Rebuild | 1 | Triggered (job ID 1360472) |

---

## Organizations Created

| Name | ID | Groups | Purpose |
|------|-----|--------|---------|
| AGENT-TEST-Org-AcmeCorp-20260310 | `97340610-1ab6-4715-a52f-ed34bfff4d71` | Premium Customers, store-acme | Primary B2B org — full user hierarchy (admin, buyers, viewer, EU admin) |
| AGENT-TEST-Org-TechFlow-20260310 | `e4932aab-67d7-46eb-98c6-021e7dbec8a7` | Standard Customers, store-acme | Second org — multi-org switching tests |
| AGENT-TEST-Org-BuildRight-20260310 | `d0f4e2d7-4848-4b9a-bbef-09d19f7a8cb5` | Standard Customers, store-acme | Third org — industrial/safety product focus |
| AGENT-TEST-Org-AcmeWest-20260310 | `2d6be9b8-15d7-42e1-9bd2-4a9c9a43264d` | store-acme | Child org of AcmeCorp — parent-child hierarchy test |

All organizations have:
- Billing & Shipping address
- Email and phone
- `store-acme` group (required by B2B-store trustedGroups)

---

## Contacts Created

| Name | ID | Org | Role | Status | Email |
|------|-----|-----|------|--------|-------|
| John Mitchell-20260310 | `1cb3e56c-1fd0-4931-8320-00e611864893` | AcmeCorp + ACME Store | Org Admin | Approved | test-john.mitchell-20260310@test-agent.com |
| Sarah Chen-20260310 | `c5b174d0-3793-4627-9141-85634de80d90` | AcmeCorp | Buyer | Approved | test-sarah.chen-20260310@test-agent.com |
| Mike Torres-20260310 | `80345daa-100c-4943-86d4-9ae784b2c365` | AcmeCorp | Viewer | Approved | test-mike.torres-20260310@test-agent.com |
| Lisa Wang-20260310 | `8f5dd118-2486-4c9f-9095-0dc88f74f836` | AcmeCorp | Buyer (2nd) | Approved | test-lisa.wang-20260310@test-agent.com |
| Emily Johnson-20260310 | `00b6327d-f2c0-4fb3-b71b-8ebf644f9db5` | TechFlow | Org Admin | Approved | test-emily.johnson-20260310@test-agent.com |
| David Kim-20260310 | `ddcca123-71e6-4946-94f6-e89dba6d62bd` | TechFlow | Buyer | Approved | test-david.kim-20260310@test-agent.com |
| Carlos Rodriguez-20260310 | `d8c344e9-de4e-4ebc-bcdd-6ed76e14845d` | BuildRight | Org Admin | Approved | test-carlos.rodriguez-20260310@test-agent.com |
| Angela Foster-20260310 | `518b97d8-f09a-4c24-ac16-160948622051` | BuildRight | Buyer | Approved | test-angela.foster-20260310@test-agent.com |
| Robert Lee-20260310 | `eac83fb5-bbb0-4132-a31b-7e884f444b8f` | AcmeWest | Org Admin | Approved | test-robert.lee-20260310@test-agent.com |
| Hans Mueller-20260310 | `f48b60e5-4c0d-4046-8b7a-da677870478b` | AcmeCorp | EU Admin | Approved | test-hans.mueller-20260310@test-agent.com |

All contacts have:
- Status: Approved
- Shipping address
- Phone number
- 1 security account (user login)
- Linked to their respective organization

---

## User Accounts Created

| Contact | User ID | Username | Platform Role | Status | Store |
|---------|---------|----------|---------------|--------|-------|
| John Mitchell | `18701ceb-479c-47e0-b0a6-ff3214f84d3d` | test-john.mitchell-20260310@test-agent.com | Organization maintainer | Approved | B2B-store |
| Sarah Chen | `5fec6ed3-bab2-4c45-a9df-2bb84512b7e4` | test-sarah.chen-20260310@test-agent.com | Purchasing agent | Approved | B2B-store |
| Mike Torres | `c9c89374-fff5-457f-80da-2f047d7eb282` | test-mike.torres-20260310@test-agent.com | Organization employee | Approved | B2B-store |
| Lisa Wang | `4d725d6b-2f5a-439b-861f-b9d7a5bc07f0` | test-lisa.wang-20260310@test-agent.com | Purchasing agent | Approved | B2B-store |
| Emily Johnson | `e8863aa5-e294-47ea-969d-76c64b5e8f22` | test-emily.johnson-20260310@test-agent.com | Organization maintainer | Approved | B2B-store |
| David Kim | `8a848efb-10d3-4f15-9872-4fec0d9e9807` | test-david.kim-20260310@test-agent.com | Purchasing agent | Approved | B2B-store |
| Carlos Rodriguez | `ada86b72-5656-4020-b06c-a73748884d47` | test-carlos.rodriguez-20260310@test-agent.com | Organization maintainer | Approved | B2B-store |
| Angela Foster | `5d0b2054-bb70-4a58-8c8e-677e3c3b2c01` | test-angela.foster-20260310@test-agent.com | Purchasing agent | Approved | B2B-store |
| Robert Lee | `f11c8f54-18c0-417c-9bc4-4380e70841c3` | test-robert.lee-20260310@test-agent.com | Organization maintainer | Approved | B2B-store |
| Hans Mueller | `ee85fe8d-7876-4c61-b098-12c794d05242` | test-hans.mueller-20260310@test-agent.com | Organization maintainer | Approved | B2B-store |

All user accounts:
- Password: `TestPass123!`
- Status: Approved
- UserType: Customer
- EmailConfirmed: true
- Linked to contact via `memberId`

---

## Org Hierarchy

```
AGENT-TEST-Org-AcmeCorp-20260310 (Primary)
  ├── John Mitchell    — Org Admin (Organization maintainer)
  ├── Sarah Chen       — Buyer (Purchasing agent)
  ├── Mike Torres      — Viewer (Organization employee)
  ├── Lisa Wang        — Buyer 2 (Purchasing agent)
  ├── Hans Mueller     — EU Admin (Organization maintainer, de-DE/EUR)
  └── [child] AGENT-TEST-Org-AcmeWest-20260310
      └── Robert Lee   — Org Admin (Organization maintainer)

AGENT-TEST-Org-TechFlow-20260310
  ├── Emily Johnson    — Org Admin (Organization maintainer)
  └── David Kim        — Buyer (Purchasing agent)

AGENT-TEST-Org-BuildRight-20260310
  ├── Carlos Rodriguez — Org Admin (Organization maintainer)
  └── Angela Foster    — Buyer (Purchasing agent)
```

---

## Test Scenarios Enabled

| Scenario | Entities Used |
|----------|---------------|
| RBAC: Org Admin vs Buyer vs Viewer | John (admin), Sarah (buyer), Mike (viewer) in AcmeCorp |
| Multi-buyer approval workflow | Sarah + Lisa (both purchasing agents in same org) |
| Multi-org switching | John (AcmeCorp) vs Emily (TechFlow) — cross-org isolation |
| Parent-child org hierarchy | AcmeCorp -> AcmeWest (Robert Lee) |
| Multi-language/currency B2B | Hans Mueller (de-DE, EUR) |
| Order isolation between orgs | Sarah (AcmeCorp) vs David (TechFlow) — separate order histories |
| Industrial product focus | Carlos + Angela (BuildRight) — safety/construction context |

---

## Login Note

The B2B-store has `trustedGroups: ["store-acme"]` configured. Direct `/connect/token` password grant returns `user_cannot_login_in_store` for all Customer-type users (including the environment's own test user). This is expected platform behavior for this store configuration. User authentication should be tested through:
- The storefront SSO flow (Google OAuth)
- Admin API operations using the admin token with `memberId` context
- GraphQL xAPI mutations that accept `userId` parameter

---

## Teardown Instructions

Delete in reverse dependency order using admin token:

```
1. DELETE /api/platform/security/users/{userName}     (all 10 users)
2. DELETE /api/members?ids={contactId}                 (all 10 contacts)
3. DELETE /api/members?ids={orgId}                     (child org first: AcmeWest, then AcmeCorp, TechFlow, BuildRight)
4. POST  /api/search/indexes/index                     ([{ "documentType": "MemberDocument", "rebuild": true }])
```

Entity IDs for teardown are stored in `test-data/b2b/_seed-results-orgs.json`.

---

## Files

| File | Purpose |
|------|---------|
| `test-data/b2b/_seed-results-orgs.json` | Full entity IDs and metadata for programmatic teardown |
| `test-data/b2b/seed-report-20260310.md` | This report |
