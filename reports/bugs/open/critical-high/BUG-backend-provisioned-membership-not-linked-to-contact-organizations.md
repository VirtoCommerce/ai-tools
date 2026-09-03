# BUG — `POST /api/customer/organization-memberships` creates the membership row but never links `contact.organizations` · High

**Env:** vcst-qa-storefront @ Platform 3.1051.0 · Customer 3.1021.0-pr-312-2257
**Found by:** `/qa-regression` REG-2026-07-30-1040, suite 011b (COMP-E2E-015) · triaged `REAL_BUG`

## Summary

A member provisioned entirely through the backend REST create endpoint (contact → security user →
`POST /api/customer/organization-memberships`) can sign in, but the storefront treats them as a
**personal (non-org) account**: no org name in the header, no "Corporate" sidebar group, the personal
"Addresses" link shows instead, and `/company/members` / `/company/info` silently redirect to
`/account/dashboard`. The member never appears on the org's roster.

## Steps to reproduce

1. Create a contact + security user via the backend (not via an invite flow).
2. `POST /api/customer/organization-memberships` with `{userId, organizationId, roles:[{roleId:"org-employee", roleName:"Organization employee"}]}`.
3. Confirm the REST create succeeds and the membership is searchable (`organization-memberships/search {userId}` returns the row).
4. Sign in to the storefront as that user; navigate to `/company/members`.

## Expected vs actual

**Expected:** the org context resolves from the membership row; the user sees their org in the header and
reaches `/company/members`/`/company/info`.

**Actual:** `GET /api/members/{memberId}` immediately after the successful `POST` returns
`organizations: []` and `currentOrganizationId: null` — the membership row exists, but the contact was
never linked to the organization. The storefront resolves org context from `contact.organizations` /
`currentOrganizationId`, not from the membership table, so the membership is invisible to it.

## Root cause

`OrganizationMembershipController.Create` persists the `CustomerOrganizationMembership` row but does not
also update `contact.Organizations`/`CurrentOrganizationId` on the linked contact. This is the mirror image
of the back-fill limitation already noted in `COMP-E2E-023`'s preconditions (pre-existing org members
without a membership row show `count=0` in the Admin widget) — here a membership row exists but the
contact-side link doesn't.


## Re-verification 2026-08-26 — still reproduces, unchanged

Backlog triage, Platform `3.1061.0`, **`VirtoCommerce.Customer` 3.1022.0** — the draft reproduced on the
pre-release `3.1021.0-pr-312-2257`, so the branch has since shipped as a release and the defect survived it.

Re-run of the exact STR with a throwaway fixture (admin token, TechFlow org, all steps via REST):

| Step | Result |
|---|---|
| `POST /api/members` (contact) | `200` — contact `f8425913-…` |
| `POST /api/platform/security/users/create` (linked via `memberId`) | `200 {"succeeded":true}` |
| `POST /api/customer/organization-memberships` (`org-employee`) | `200` — row returned |
| `POST /api/customer/organization-memberships/search {userIds:[…]}` | `200`, **`totalCount: 1`** — the row exists |
| **`GET /api/members/{contactId}`** | **`organizations: []`, `currentOrganizationId: null`** |

That is the draft's assertion verbatim: the membership row is created and searchable, but the contact side
is never linked, so the storefront — which resolves org context from `contact.organizations` /
`currentOrganizationId` rather than the membership table — still sees a personal account.

**Storefront half not re-checked.** This pass re-confirmed the API-layer root cause only; the downstream UI
symptoms the draft lists (no org in header, no Corporate sidebar, `/company/members` redirecting to
`/account/dashboard`) follow from `organizations: []` and were not re-walked in a browser.

**Fixture hygiene:** the throwaway contact, security user and membership were all torn down
(`204` / `succeeded:true` / `204`) — nothing left on the environment.

**Still not filed to the tracker.**

## Test-case note (not filed separately)

If the intent is to test the REST contract in isolation, the case should add an explicit
`contact.organizations[]` link step before asserting storefront behavior. As written it asserts a product
capability (REST-only onboarding) that does not exist — kept as `REAL_BUG` per this run's triage
(ambiguous-favors-real-bug bias), not reclassified to a test defect, since the gap is genuinely visible to
an end user reached via this exact backend-provisioning path.

## Fix Routing

- **Layer:** L4 REST (`OrganizationMembershipController.Create`)
- **Repo:** `vc-module-customer`
- **Suggested fix:** on membership create, also add the organization to the contact's `Organizations`
  collection (and set `CurrentOrganizationId` when it is the contact's first/only membership), matching
  what the invite-acceptance flow already does correctly.
- **Routing confidence:** HIGH — REST half proven correct in isolation; storefront-side gap isolated to the
  missing contact-organization link, confirmed via direct `GET /api/members/{id}` immediately post-create.
- Do NOT auto-merge — human review required.
