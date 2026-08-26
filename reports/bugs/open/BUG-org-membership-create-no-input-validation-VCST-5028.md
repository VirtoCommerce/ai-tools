# BUG: `POST /api/customer/organization-memberships` has no input validation — missing `userId` → 500 + DB-name leak; empty `userId` → 200 orphan `[High]`

## Status: READY_TO_SUBMIT
**JIRA:** VCST-5314 (Bug, High, filed 2026-06-19, relates to VCST-5028).

**Env:** vcst-qa @ Platform 3.1037.0 · Customer module (PR #300, VCST-5028) — confirmed live 2026-06-19.
**Re-tested 2026-06-19 on the updated build → STILL REPRODUCES** (see Re-test below).

## Re-test — 2026-06-19 (build `Customer 3.1010.0-alpha.995-vcst-5028` / `ProfileExperienceApi pr-135-402e`)
Re-ran both cases against a **freshly created org** (`AGENT-TEST-Org-Owner-20260619`) on the current deployed build (newer than the `pr-300-fa2a`/`b446` builds in the original repro). **Both symptoms unchanged — not fixed:**
- Missing `userId` → **HTTP 500**, body still leaks `vcst-qa-platform_restored.dbo.CustomerOrganizationMembership` ("Cannot insert the value NULL into column 'UserId'…").
- Empty `userId: ""` → **HTTP 200**, orphan persisted (`id=8a2e4b80105d43ea860193217bdcd55a`, `userId:""`, `roles:[]`) → cleaned up (DELETE 204, GET 404).

Confirms the validation gap is independent of the ProfileExperienceApi BUG-A fix (`pr-135-402e`) — it lives in the Customer module REST controller and is still open.

## Re-confirmed + ESCALATED — 2026-07-30 (`/qa-regression` REG-2026-07-30-1040, `Customer 3.1021.0-pr-312-2257`; cases `CUST-093` suite 027, `COMP-E2E-022` suite 011b)
Both original symptoms reproduce unchanged against TechFlow (missing `userId` → 500 + identical DB/table/FK-constraint leak; no membership row created). **New finding — the documented cleanup path is itself now broken:**
- `DELETE /api/customer/organization-memberships?ids=<id>` against the orphan created by the empty-`userId` case now also returns **HTTP 500** — `{"message":"The value cannot be an empty string. (Parameter 'subject')","stackTrace":null}` — instead of the `204` this same report's original repro relied on for cleanup.
- Net effect: an orphan created via the empty-`userId` bug can no longer be removed through the documented `DELETE ?ids=` form at all — it is a **permanently undeletable phantom member** on a live organization unless a caller happens to try the alternate `POST /organization-memberships/delete {ids:[...]}` form. This is worse than previously documented and should be tracked as part of the same defect (the `Create` and `Delete` actions share the same unguarded parameter-binding pattern on `UserId`/`subject`).
- Cleanup for this run used the alternate delete form; no residue on TechFlow (verified via `organization-memberships/search`).

No JIRA transition made here — VCST-5314 is already filed; recommend the assignee add the `DELETE` regression to scope before closing.

## Summary
The new `OrganizationMembershipController.Create` action persists the request body with no validation. Omitting `userId` returns **HTTP 500** whose body leaks the database name and table (`vcst-qa-platform_restored.dbo.CustomerOrganizationMembership`); sending `userId: ""` returns **HTTP 200** and persists an **orphan membership** with no owning user and no roles. Both should be `400 Bad Request`. This is an info-disclosure + data-integrity defect introduced by VCST-5028.

## Steps to Reproduce
Authenticated as a platform admin holding `customer:organization-membership:create`, against `{{BACK_URL}}`:

1. **Missing `userId`** — `POST /api/customer/organization-memberships` body `{ "organizationId": "<orgId>", "organizationName": "x", "roles": [] }` (no `userId` key).
2. **Empty `userId`** — `POST /api/customer/organization-memberships` body `{ "userId": "", "organizationId": "<orgId>", "organizationName": "x", "roles": [] }`.

(`<orgId>` resolved at runtime to a real org; no hardcoded IDs.)

## Expected vs Actual
| Case | Expected | Actual |
|------|----------|--------|
| Missing `userId` | `400 Bad Request`, validation message, no server detail | **`500`** with raw SQL error **leaking DB name** |
| Empty `userId` | `400 Bad Request`, nothing persisted | **`200`** — orphan membership created (`userId:""`, `roles:[]`) |

## Evidence (live repro, 2026-06-19)
**Case 1 — missing `userId` → 500 + DB-name leak:**
```
HTTP 500
{"message":"Cannot insert the value NULL into column 'UserId', table
'vcst-qa-platform_restored.dbo.CustomerOrganizationMembership'; column does not allow nulls.
INSERT fails.\nThe statement has been terminated.","stackTrace":null}
```
**Case 2 — empty `userId` → 200 + orphan:**
```
HTTP 200 → created membership id b4c29ea10aa94af49462f2e7849345c2, userId="", roles=[]
```
**Cleanup:** orphan deleted (`DELETE …?ids=b4c29ea1…` → 204, `GET /{id}` → 404). No residue; no fixture mutated.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | Storefront never submits a create with missing/empty `userId` (uses xAPI invite/role mutations, not this REST create). |
| 2. Backend Admin | N/A | Admin "Organization memberships" widget builds a complete payload; the gap is unguarded direct REST input. |
| 3. GraphQL xAPI | N/A | xAPI does not expose this create path. |
| 4. Platform REST API | **FAIL** | `POST /api/customer/organization-memberships` — 500 (DB leak) / 200 (orphan) as above. |

**Owning layer:** Layer 4 — Platform REST API.

## Root Cause Analysis
`OrganizationMembershipController.Create` (PR #300) does no validation before the DB write:
```csharp
[HttpPost][Authorize(OrgMembershipPermissions.Create)]
public async Task<ActionResult<OrganizationMembership>> Create([FromBody] OrganizationMembership membership)
{
    membership.Id = null;
    await membershipService.SaveChangesAsync([membership]);   // <-- no userId/organizationId guard
    var created = (await membershipService.GetAsync([membership.Id])).FirstOrDefault();
    return Ok(created);
}
```
- Missing `userId` → `NULL` reaches the `UserId` non-null column → raw `SqlException` surfaces as a 500 with the DB name (no exception shaping). 
- Empty string `""` is non-null, so it passes the DB constraint and an orphan row is written.

**Fix:** guard `string.IsNullOrWhiteSpace(membership.UserId)` (and `OrganizationId`) at the top of `Create` (and `Update`) → return `BadRequest` with a structured `{ code, description }`; never let the SQL exception reach the client. Preserves BL-AUTH-012/BL-B2B-008 (no behavior change).

## Notes
- Related but distinct: `BUG-org-scoped-maintainer-perms-not-honored-VCST-5028.md` (BUG-A) — that one is now code-fixed on `pr-135-402e`; this REST-validation defect is separate and still present.
- Adjacent API gap (not this bug): `OrganizationMembershipSearchCriteria` has no `organizationId` filter (search is `userId`-only) — track separately as an enhancement, not a defect.


## Re-verification 2026-08-26 — still reproduces, and is WORSE than recorded

Backlog triage, Platform `3.1061.0`, admin token, org resolved live via `POST /api/members/search {memberType:"Organization"}`.

| Input | Result |
|---|---|
| `userId` key **omitted** | **500** — leaks DB/table/column: `Cannot insert the value NULL into column 'UserId', table 'vcst-qa-platform_restored.dbo.CustomerOrganizationMembership'; column does not allow nulls.` |
| `userId: ""` (empty) | **200 Created** — a membership row is persisted with `userId:""`, `organizationId:""`, `organizationName:null`, `status:null` |

**New finding — the invalid row cannot be deleted.** `DELETE /api/customer/organization-memberships?ids=<id>` returns
`500 {"message":"The value cannot be an empty string. (Parameter 'subject')"}`. So the missing input validation does not
merely accept junk, it creates **permanently undeletable** rows: the same empty-string that passed the create path fails the
delete path's own guard. That raises the severity case — this is data corruption, not just a lax 200.

**Pre-existing evidence of the same:** a scoped search (`{userIds:[""]}`) returns `totalCount: 2` — one row is
`f53d111ca6994c8a92b4362fe6ed0f8f` (attached to org `6fb516c1-07f3-4af4-be5e-35961e3f7993`, predating this session,
presumably from the original 2026-06 investigation on `3.1037.0`), the other is `26e1bf58-5bdc-4fdc-961a-36aa243e1f4b`
(created by this re-verification). **Both are undeletable via the API** and remain on vcst-qa; clearing them needs a DB-level
fix or a platform-side change. Flagged rather than silently left.

**Note on the tracker:** `VCST-5314` is still in **Draft** status — never picked up.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 4 — REST
- **Suggested repo:** VirtoCommerce/vc-module-customer
- **repoKind:** module
- **Component / module:** Customer module — `OrganizationMembershipController` (`*.Web` REST API)
- **RCA anchor:** `src/VirtoCommerce.CustomerModule.Web/Controllers/Api/OrganizationMembershipController.cs` → `Create()` (and `Update()`): `membership.Id = null; SaveChangesAsync(...)` with no `userId`/`organizationId` validation.
- **Routing confidence:** HIGH (single repo, reproduced at the owning layer, RCA confirmed against PR #300 source).
