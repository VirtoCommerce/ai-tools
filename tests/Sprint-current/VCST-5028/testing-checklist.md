# VCST-5028 Re-test Checklist — Per-Organization Roles & Access Control

**Build under test:** Platform 3.1038.0 · ProfileExperienceApi 3.1008.0-pr-135-373a · Customer 3.1010.0-alpha.989-vcst-5028 · vc-frontend 2.51.0-pr-2315
**Blocker cleared:** MISSING_METHOD on `changeOrganizationContactRole` resolved; xapi:my_organization:edit enforced.
**Fixture:** `@td(MULTI_ORG_TF_BR)` — TechFlow (maintainer) + BuildRight (employee). Default JWT org = BuildRight.
**Auth:** `POST {BACK_URL}/connect/token` — `grant_type=password&scope=offline_access&storeId=B2B-store` (no client_id).

---

## Scenario 1 — Company Registration

| ID | Layer | Steps (terse) | Expected | BL ref | Agent |
|----|-------|---------------|----------|--------|-------|
| ORG-RT-01 [P0] | Storefront | Register a new company from storefront "Register Company" flow; complete all required fields. | New org created; org creator gets an org-scoped `OrganizationMembership` with Maintainer role. | BL-B2B-009 | qa-frontend-expert |
| ORG-RT-02 [P1] | REST | After ORG-RT-01: `POST /api/customer/organization-memberships/search {userId: <newUserId>}`. | Response contains exactly 1 membership record for the new org; `roles` has maintainer-equivalent entry. | BL-B2B-009 | qa-backend-expert |
| ORG-RT-03 [P0] | REST | `GET /api/platform/security/users/{newUserId}` after registration. | Global `roles[]` does NOT contain an org-specific role (e.g., `org-maintainer`, `org-employee`). | BL-B2B-009 | qa-backend-expert |

**GAP:** No existing regression suite covers the "new org creator gets per-org membership" path; ORG-RT-01/02/03 are net-new coverage.

---

## Scenario 2 — Invite to Company

| ID | Layer | Steps (terse) | Expected | BL ref | Agent |
|----|-------|---------------|----------|--------|-------|
| ORG-RT-04 [P1] | Storefront | As `@td(MULTI_ORG_TF_BR)` switched to TechFlow (maintainer): navigate to Company Members → Invite; enter a fresh yopmail address; send invite. | Invite email sent; storefront confirms success toast. | BL-B2B-009 | qa-frontend-expert |
| ORG-RT-05 [P0] | REST | After invite acceptance: `POST /api/customer/organization-memberships/search {userId: <invitedUserId>}`. | Membership record exists for TechFlow with the assigned role; `GET /api/platform/security/users/{invitedUserId}` global `roles[]` unchanged. | BL-B2B-009 | qa-backend-expert |
| ORG-RT-06 [P1] | REST | `GET /api/customer/organization-memberships/user/{invitedUserId}/count`. | Count >= 1. | BL-B2B-009 | qa-backend-expert |

**GAP:** Invite acceptance path (storefront email link → account creation) not covered by suites 026/027; ORG-RT-04/05/06 are net-new.

---

## Scenario 3 — Change Role

| ID | Layer | Steps (terse) | Expected | BL ref | Agent |
|----|-------|---------------|----------|--------|-------|
| ORG-RT-07 [P0] | GraphQL | As TechFlow maintainer JWT: `changeOrganizationContactRole(memberId:<BuildRight-employee-contact-id>, roleIds:[<maintainer-roleId>])` against TechFlow. | `succeeded: true`; no `errors[]`. | BL-B2B-008 | qa-backend-expert |
| ORG-RT-08 [P0] | REST | After ORG-RT-07: `POST /api/customer/organization-memberships/search {userId}`. | TechFlow membership role = maintainer; BuildRight membership role = employee (unchanged). | BL-B2B-008 | qa-backend-expert |
| ORG-RT-09 [P1] | REST | After ORG-RT-07: `GET /api/platform/security/users/{userId}` (global security account). | Global `roles[]` unchanged from pre-test baseline. | BL-B2B-008 | qa-backend-expert |
| ORG-RT-10 [P1] | Admin | Open Admin → Organizations → TechFlow → Memberships widget → change user role in UI → Save. | Membership record updated; toast "Saved"; no change to BuildRight membership (verify via REST search). | BL-B2B-008 | qa-backend-expert |
| ORG-RT-11 [P0] | Storefront | Sign out → sign back in to org TechFlow; decode JWT (browser devtools / jwt.io). | JWT `permission[]` contains maintainer set; BuildRight permissions absent. | BL-B2B-007 | qa-frontend-expert |
| ORG-RT-12 [P0] | Storefront | `GetPageContext` / `me` query after ORG-RT-11 login. | `pageContext.user.permissions` matches the maintainer JWT `permission[]` (BUG-A guard — must NOT return `[]`). | BL-B2B-007 | qa-frontend-expert |

---

## Scenario 4 — Block / Unblock

| ID | Layer | Steps (terse) | Expected | BL ref | Agent |
|----|-------|---------------|----------|--------|-------|
| ORG-RT-13 [P0] | REST | `POST /api/customer/organization-memberships/{membershipId-BuildRight}/lock` (lock user in BuildRight only). | HTTP 200; membership `isLocked: true`. | BL-AUTH-012 | qa-backend-expert |
| ORG-RT-14 [P0] | REST | After ORG-RT-13: `GET /api/platform/security/users/{userId}/locked`. | `{"locked": false}` — global account NOT locked. | BL-AUTH-012 | qa-backend-expert |
| ORG-RT-15 [P0] | REST | `/connect/token` with `organization_id=BuildRight-orgId` (locked org). | HTTP 400; `error: invalid_grant`; `code: user_is_locked_in_organization` (NOT `user_is_locked_out` / `user_is_temporary_locked_out`). | BL-AUTH-013 | qa-backend-expert |
| ORG-RT-16 [P0] | REST | `/connect/token` with `organization_id=TechFlow-orgId` (same user, unlocked org). | HTTP 200; valid JWT issued. | BL-AUTH-012 | qa-backend-expert |
| ORG-RT-17 [P1] | Storefront | Sign in to storefront selecting BuildRight org (or trigger org-switch to BuildRight). | Org-specific error copy shown (e.g., "access to this organization has been blocked") — NOT the generic global lockout message from suite 031. | BL-AUTH-013 | qa-frontend-expert |
| ORG-RT-18 [P1] | REST | `POST /api/customer/organization-memberships/{membershipId-BuildRight}/unlock` → sign in to BuildRight again. | HTTP 200 unlock; `/connect/token` BuildRight → HTTP 200; membership `isLocked: false`. | BL-AUTH-012 | qa-backend-expert |

**GAP:** Org-scoped lock vs global lock distinction not covered by suite 031 (global lockout). ORG-RT-13 through ORG-RT-18 are net-new P0 coverage.

---

## Scenario 5 — Permissions: Backend → Frontend (JIRA Test1 / Test2 / Test3)

| ID | Layer | Steps (terse) | Expected | BL ref | Agent |
|----|-------|---------------|----------|--------|-------|
| ORG-RT-19 [P0] | REST+Storefront | Log in to TechFlow (maintainer). Decode JWT. | JWT `permission[]` includes global roles + TechFlow org-maintainer permissions; BuildRight-employee perms absent. (JIRA Test1 — org1 JWT.) | BL-B2B-007 | qa-frontend-expert |
| ORG-RT-20 [P0] | REST+Storefront | Log in to BuildRight (employee). Decode JWT. | JWT `permission[]` includes global roles + BuildRight-employee permissions; TechFlow-maintainer perms absent. (JIRA Test1 — org2 JWT.) | BL-B2B-007 | qa-frontend-expert |
| ORG-RT-21 [P0] | Storefront | As TechFlow maintainer: storefront Company nav — verify visible items. | "Members" / "Invitations" management controls visible; maintainer-only actions enabled. | BL-B2B-005 | qa-frontend-expert |
| ORG-RT-22 [P1] | Storefront | As BuildRight employee (same user): storefront Company nav. | Member management controls hidden / disabled; employee-only view. | BL-B2B-005 | qa-frontend-expert |
| ORG-RT-23 [P0] | GraphQL | Change `@td(MULTI_ORG_TF_BR)` TechFlow role to employee via `changeOrganizationContactRole`; sign back into TechFlow. | TechFlow JWT now carries employee perms; `pageContext.user.permissions` matches (JIRA Test2 — org1 perms updated). | BL-B2B-007, BL-B2B-008 | qa-backend-expert + qa-frontend-expert |
| ORG-RT-24 [P0] | Storefront | After ORG-RT-23, switch back to BuildRight. | BuildRight JWT perms unchanged from ORG-RT-20 baseline (JIRA Test2 — org2 unchanged). | BL-B2B-008 | qa-frontend-expert |
| ORG-RT-25 [P0] | REST+Storefront | Lock user in BuildRight; attempt login to BuildRight; attempt login to TechFlow. | BuildRight → locked error; TechFlow → success. (JIRA Test3.) | BL-AUTH-012, BL-AUTH-013 | qa-backend-expert |

---

## Open Question — Migration Gap (comment 100259)

Legacy users with a global role but NO `OrganizationMembership` row: attempt `changeOrganizationContactRole` and lock/unlock against such a user.

- **Expected surface:** `MembershipNotFound` (role change) / exception (lock) — document the actual HTTP status + error body as a known gap, do NOT file as a new bug unless the error is unhandled (500 with no body).
- **Agent:** qa-backend-expert. Capture REST response verbatim in `evidence/`.

---

## Cleanup

After all items:
1. Unlock any locked memberships (`/unlock`).
2. Restore `@td(MULTI_ORG_TF_BR)` TechFlow role to maintainer via `changeOrganizationContactRole` (reset to baseline for next run).
3. Delete any invite-created test users (`@td(random-data)` yopmail addresses with `AGENT-TEST-` prefix via Admin → Users → Delete or REST `DELETE /api/platform/security/users/{id}`).
