# VCST-5028 — Backend Execution Report (REST / GraphQL / Admin SPA)

**Env:** vcst-qa @ Platform 3.1037.0, Customer PR#300 (3.1010.0-pr-300-fa2a), ProfileXAPI PR#135 (3.1008.0-pr-135-cb12), Storefront 2.51.0-pr-2315-c85b
**Scope:** per-organization roles & access control — Admin SPA "Organization memberships" widget, `OrganizationMembershipController` REST, xAPI mutations/fields
**Browser:** playwright-edge | **Fixture (read-only):** `@td(MULTI_ORG_TF_BR.*)` | **AGENT-TEST member created for writes** (memberships deleted at end; contacts/accounts swept by AGENT-TEST- prefix)
**BL verified:** BL-AUTH-003 (lockout scoped, not global), BL-AUTH-005 (RBAC 6-perm), BL-AUTH-006 (role hierarchy), BL-B2B-001 (org isolation)

## Schema discovery (live introspection — checklist text was wrong; assertions re-framed)
- **No `ContactType.organizationMemberships` field exists.** Per-org data is exposed via:
  - `ContactType.rolesInOrganization(organizationId: String): [RoleType]`
  - `ContactType.isLockedInOrganization(organizationId: String): Boolean`
- Mutation commands are simpler than the checklist assumed — **no `organizationId` arg**; org scope comes from the caller's JWT (`OrganizationIdClaimProvider`):
  - `changeOrganizationContactRole(command: InputChangeOrganizationContactRoleType)` → returns `CustomIdentityResultType { succeeded, errors { code parameter description } }`. Input: `memberId: String!`, `roleIds: [String]`.
  - `lockOrganizationContact(command: InputLockUnlockOrganizationContactType)` → returns `ContactType`. Input: `memberId: String!`.
  - `unlockOrganizationContact(command: InputLockUnlockOrganizationContactType)` → returns `ContactType`. Input: `memberId: String!`.
- Required xAPI permission for the mutations (server message): **`xapi:my_organization:edit`** (granted to org-maintainer by the org-claim provider; absent for org-employee).
- JWT mechanism confirmed: storefront login → org-switch issues a per-org bearer (`organization_id` claim + org-scoped `permission[]`). Employee in an org → `["storefront:organization:view","storefront:user:view"]`; maintainer in that org → adds `storefront:organization:edit`, `storefront:user:*`, `xapi:my_organization:edit`.

## REST `OrganizationMembershipController` route surface (Swagger, confirmed)
`POST /search`, `POST /` (create), `DELETE`, `GET/PUT /{id}`, `POST /{id}/lock`, `POST /{id}/unlock`, `GET /user/{userId}/count`, `GET /user/{userId}/org/{organizationId}`.

---

## Per-item verdicts

| Item | Verdict | Evidence |
|------|---------|----------|
| **AC1-B-01** Admin widget shows both memberships | **PASS** | Contact `57389d49…` blade → "Organization memberships" widget count=2; detail grid: TechFlow / Organization maintainer / Active + BuildRight / Organization employee / Active. Screenshot `screenshots/AC1-B-01-org-memberships-widget.png`. (Grid surfaces org+role+status; membership ids not shown in UI but match oracle.) |
| **AC1-B-02** REST search per-org roles | **PASS** | `POST /search {"userId":"631063d0…"}` → 200, totalCount=2; TechFlow membership `eff31ad2…`=org-maintainer, BuildRight `3219a007…`=org-employee, both isLocked=false. |
| **AC1-B-03** GraphQL per-org roles + lock | **PASS** (re-framed) | `contact(id){ rolesInOrganization(organizationId:TF/BR){id name} isLockedInOrganization(organizationId:TF/BR) }` → errors[] absent; TF=org-maintainer, BR=org-employee, both false. |
| **AC2-B-01** Role change happy-path (GraphQL maintainer) | **BLOCKED / see Finding #1** | All maintainer attempts returned top-level `Forbidden` "missing `xapi:my_organization:edit`" despite the JWT carrying it. **Underlying domain logic verified via REST PUT instead:** TechFlow employee→manager succeeded; BuildRight remained org-employee (org-scoped, BL-B2B-001). |
| **AC2-B-02** Employee role change rejected (GraphQL) | **PASS** | Employee-scoped token → `changeOrganizationContactRole` → errors[]=`Forbidden` (`xapi:my_organization:edit` required), `data=null`, REST confirms no change persisted (BL-AUTH-005/006). |
| **AC3-B-01** Lock scoped to one org | **PASS** (REST) | `POST /{BR-membership}/lock` → 200; search: BR isLocked/isCurrentlyLocked=true, TF=false. (GraphQL maintainer lock blocked by Finding #1 — same Forbidden.) |
| **AC3-B-02** Global ApplicationUser NOT locked — **critical guard** | **PASS** | After org-locking BuildRight: `GET /api/platform/security/users/{userId}/locked` → **`{"locked":false}`** (HTTP 200). Global `lockoutEnd` not set; org-lock uses a per-membership `isLocked` boolean, not the global lockout sentinel. Feature's core promise intact. |
| **AC3-B-03** Unlock restores | **PASS** | `POST /{BR-membership}/unlock` → 200; search: both orgs isLocked=false; global still `{"locked":false}`. |
| **AC3-B-04** Admin SPA lock scopes + global untouched | **PASS** | Admin membership blade Lock action → `POST /api/customer/organization-memberships/{id}/lock` 200, grid shows "Locked" (TF stays "Active"), Unlock restores. Equivalent REST lock proves global `{"locked":false}`. |
| **EDGE-B-01** Employee cannot lock | **PASS** | Employee token → `lockOrganizationContact` → `Forbidden`, `data=null`, REST confirms target still unlocked (BL-AUTH-005). |
| **EDGE-B-03** Missing userId on create → 400 | **FAIL — see Finding #2** | Missing `userId` → **HTTP 500** (raw SQL null-constraint error, leaks DB name). Empty-string `userId` → **HTTP 200 creates an orphan membership** (userId="", no roles). |
| **EDGE-B-04** Remove last membership, account survives | **PASS** | Single-membership AGENT-TEST member: deleted only membership → contact GET 200, security account valid (`lockoutEnd:null`), global `{"locked":false}`, search totalCount=0. No corruption. |

---

## Findings (NOT filed — reported per instructions)

### Finding #1 — org-maintainer with `xapi:my_organization:edit` is rejected by the xAPI write/lock mutations (needs FE confirmation) — proposed **High / P1**
`changeOrganizationContactRole` and `lockOrganizationContact` return top-level `errors[] = Forbidden` "User doesn't have the required permission 'xapi:my_organization:edit'." even when the caller's storefront bearer **explicitly carries** that permission. Reproduced across:
- two distinct maintainer identities (my AGENT-TEST maintainer; the fixture maintainer org-switched to TechFlow);
- two endpoints (platform `/graphql` and the storefront `/graphql` proxy);
- both mutations.
Target member was a valid TechFlow member; JWT `permission[]` included `xapi:my_organization:edit` (verified by decoding the live storefront bearer). The negative cases (employee → Forbidden) behave correctly, so the handler runs — it just doesn't recognize the maintainer's granted permission for the *positive* path.
**Caveat / why not filed:** the supported real-user path is the storefront Company Members UI (FE agent's AC2-F-01 / AC3-F-01). I could not get a role-change/lock dialog to open from that UI (rows expose only a status control; clicking a row did not open an edit panel in this build), so I cannot yet confirm the symptom reproduces through the UI vs. only via direct GraphQL. Per the API-only-repro guard, this is a **HIGH-confidence backend finding pending FE confirmation**. If FE's AC2-F-01/AC3-F-01 also fail with this permission error, this is the feature's write/lock path broken for maintainers (escalate to P1/P0). Underlying domain logic is sound (proven via REST), so the defect, if real, is in the xAPI authorization layer, not the entity logic.
STR: storefront-login a TechFlow org-maintainer → org-switch to TechFlow → capture bearer → `POST {storefront}/graphql` `mutation { changeOrganizationContactRole(command:{memberId:"<TF member>",roleIds:["org-manager"]}){ succeeded errors{code description} } }` → `Forbidden`.

### Finding #2 — `POST /api/customer/organization-memberships` input validation gaps — proposed **High** (data integrity + info leak)
- Missing `userId` → **HTTP 500** with a raw SQL error (`Cannot insert the value NULL into column 'UserId'…`) that **leaks the DB name** (`vcst-qa-platform_restored`). Expected: `400 Bad Request` with a validation message and no stack/DB detail. (EDGE-B-03)
- Empty-string `userId` (`""`) → **HTTP 200** and **persists an orphan membership** (id returned, `userId:""`, `roles:[]`). A membership with no owning user and no roles is a data-integrity violation; should be rejected with 400. (Orphan was deleted during the run.)
STR: `POST /api/customer/organization-memberships` with body omitting `userId` (→500) or `{"userId":"","organizationId":"<org>","organizationName":"x","roles":[]}` (→200 orphan).

---

## Notes / cleanup
- **Incident (self-corrected):** during AC3-B-04 the Admin membership blade was still bound to the **fixture** member from the earlier AC1-B-01 navigation; the Lock action hit the fixture's BuildRight membership (`3219a007…/lock` 200). Immediately reverted via the same UI Unlock (`3219a007…/unlock` 200). Final fixture re-check: totalCount=2, TF=org-maintainer, BR=org-employee, both isLocked=false — **fixture fully restored, untouched**.
- An earlier apparent "Admin lock not reflected in REST search" was a mis-attribution from the same blade confusion (searched my member's userId while the fixture membership was locked). Clean controlled retest on my member proved REST GET + search agree (`isLocked:true` on lock, `false` on unlock) — **no read-model inconsistency.**
- Cleanup: all 4 AGENT-TEST memberships I created deleted (204). AGENT-TEST contacts/security accounts (`b8d7d491…`, `66955cff…`, `bdfb5e3f…`) left for `/qa-seed-data teardown` (prefix-swept).
