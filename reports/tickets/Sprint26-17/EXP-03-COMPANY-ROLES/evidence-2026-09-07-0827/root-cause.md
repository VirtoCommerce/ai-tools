# Root-cause worksheet — EXP-03-COMPANY-ROLES

**Env header:** `vcst` — https://vcst-qa-storefront.govirto.com / https://vcst-qa.govirto.com @ Platform **3.1063.0**, Customer **3.1023.0**, Theme **2.57.0-pr-2452** (ENV_RISK=`test`)
**Source of versions:** Platform from the login-page HTML (`Version ='3.1063.0'`, authoritative — `/health` lies during restart) + `vc-deploy-dev@vcst-qa` `backend/packages.json`. Module versions from live `GET /api/platform/modules`.
**App Insights:** resources `vcst-qa` / `vcst-qa-storefront`, app IDs present in `.env.vcst`, but **`APPINSIGHTS_API_KEY_*` are EMPTY and `azure-mcp` failed to connect this session** → the AI axis is **UNAVAILABLE**, not skipped. Low cost here: neither finding produces a server exception (both are HTTP 200 with wrong-but-plausible data), so there is no exception chain to correlate. **No `Request-Id`/`traceparent` header was returned on any `/graphql` response** — recorded as `(none returned)` in the network capture, not as "not captured".
**Status:** `bundle-evidence --check` = **INCOMPLETE (5 mandatory slots)**. **Nothing filed.**

---

## Finding A — `assignableRoles` silently substitutes a compiled-in default for an unknown or absent store

**Confidence: HIGH.** Reproduced 3/3 consecutively, fully deterministic. Root cause read from source.

**Observed** (`network/assignableRoles-storeId-matrix.json`, actor = org-scoped maintainer token minted with `storeId=B2B-store`):

| `storeId` argument | HTTP | `errors[]` | roles returned |
|---|---|---|---|
| **omitted** | 200 | 0 | **3** |
| `"B2B-store"` (the caller's own store) | 200 | 0 | **4** — incl. `Advanced Sales Representative` |
| `"Electronics"` | 200 | 0 | 3 |
| **`"NOT-A-REAL-STORE"`** (does not exist) | **200** | **0** | **3** |

**Root cause — proven, `vc-module-customer` `src/VirtoCommerce.CustomerModule.Data/Services/CompanyMemberRoleService.cs`, `GetAllowedRoleIdsAsync`:**

```csharp
var setting = string.IsNullOrEmpty(storeId) ? null
    : await _settingsManager.GetObjectSettingAsync(descriptor.Name, nameof(Store), storeId);
var allowedValues = setting?.Id != null ? setting.AllowedValues : descriptor.AllowedValues;
```

A **null/empty** `storeId` and a **nonexistent** one (`GetObjectSettingAsync` returns a setting whose `Id` is null because no per-store override is stored) take the **same** branch and fall back to `descriptor.AllowedValues` — the compiled-in default of `ModuleConstants.Settings.General.MembershipRolesWhitelist`, which is exactly the observed 3-role set. The caller cannot distinguish "you named no store", "you named a store with no override" and "you named a store that does not exist".

Call path: `OrganizationType.cs:69-81` (`assignableRoles`, `storeId` declared as a plain nullable `StringGraphType`) → `GetAssignableCompanyRolesQueryHandler` (`vc-module-profile-experience-api`), which passes `request.StoreId` through **unvalidated** with no fallback to the caller's ambient store.

**Why it is a defect and not merely a fallback:** the field's own GraphQL description states it returns *"the intersection of **the store's** role whitelist and the roles that actually exist"*. With an unknown store there is no such whitelist, yet a plausible answer is returned with no signal. Concretely, a storefront that omits the argument silently offers **3** of the store's **4** allowed roles — `Advanced Sales Representative` becomes unassignable on `B2B-store` with nothing indicating why. Matches `reference_xapi_ambient_context_args`: an omitted nullable context arg returns 200 with a server-chosen default.

### Alternatives ruled out

- **By design?** *Partly, and the finding is split accordingly.* The **null** case is genuinely the standard settings-descriptor fallback and is consistent with the code as written — whether the resolver *should* default to the caller's ambient store is a **product decision**, recorded as a contract/documentation gap, **not** filed as a defect. The **nonexistent-store** case is different: accepting an unresolvable identifier and answering as though it resolved is an input-validation gap under any reading, because it makes a typo indistinguishable from a correct call.
- **Data drift / env config?** Ruled out. Both whitelists were read directly: store-scoped `Customer.MembershipRolesWhitelist` exists (`objectType: "Store"`) on all 6 stores with `value: null` and content in `allowedValues` (as `BL-B2B-011` requires); `B2B-store` carries 4 entries, the other five carry 3. The behaviour tracks the **code branch**, not the data: a bogus store returns the descriptor default even though no store setting was consulted at all.
- **Oracle mismatch, stated rather than assumed:** `BL-B2B-011`'s "empty whitelist = allow ALL platform roles" is grounded in the **Admin SPA** `rolesPickerService.js`, a *different* code path. The global setting is empty and the platform holds **60** roles, yet this xAPI path returns 3 — so the invariant does not describe this path. Recorded as a proposed `BL-B2B-011` scope amendment, not as a violation.

**Fix routing:** owning layer = xAPI/module service. `repoKind` = **`module`**, repo = **`vc-module-customer`** (`CompanyMemberRoleService.GetAllowedRoleIdsAsync` — distinguish "store not found" from "no override"). Secondary site: **`vc-module-profile-experience-api`** (`GetAssignableCompanyRolesQueryHandler` — validate the store, or default to the ambient store). A cross-repo choice, so it needs a human routing decision rather than an auto-fix.

---

## Finding B — storefront role editor: single-select over a multi-valued membership field

**Confidence: LOW-MEDIUM — source-proven, behaviourally UNPROVEN. Do not file yet.**

**The reported evidence was wrong, and correcting it is the main result here.** The originating session reported *"member `tester1@mail.com` holds `Organization employee, Purchasing agent`; only the first renders checked"*. Measured:

- `tester1@mail.com` holds **3 separate memberships, each with exactly ONE role** (`Organization role` → employee; `"Quoted" Double Quotes` → employee; `(parentheses) Lone Star Outfitters` → purchasing agent).
- Its **global** `ApplicationUser.Roles` is `Organization employee + Purchasing agent` — exactly the displayed pair.

**Why the grid shows the pair — `vc-frontend` `client-app/shared/company/utils/index.ts`:**

```ts
export function getContactRoles(contact: ContactType): RoleType[] {
  const orgRoles = contact.rolesInOrganization ?? [];
  const globalRoles = contact.securityAccounts?.flatMap((sa) => sa.roles ?? []) ?? [];
  return uniqBy([...orgRoles, ...globalRoles].filter((r) => r.id), "id");
}
```

`extended.roles` is the **union of org-scoped and global roles**, deduped. `members.vue:253/290` renders that whole array joined by `", "`. This union is **by design** — `BL-B2B-005` names this exact function. So the grid is not itself the defect.

The candidate defect is the editor, `members.vue:673-689`: `const currentRole = contact.extended.roles[0]` (takes only the first of a set) and `onConfirm` sends `roleIds: [selectedRoleId]` — a one-element array — to `changeOrganizationContactRole`, which `BL-B2B-008` describes as **replacing** the membership's roles. On a membership genuinely holding ≥2 roles that would drop all but the selected one, silently.

**Population:** an admin sweep of **228 memberships across 199 orgs** found **2** holding more than one role (both in `"Müller" % Schmidt GmbH`; one holds `Sales Representative + Task manager`). Real but small blast radius.

### Why it is still unproven — the experiment was invalid

The reproduction attempt used `organization.contacts { rolesInOrganization }` as the observable. **That field is contaminated by org-level inheritance**: `AGENT-TEST-Org-TechFlow-20260310` carries **org-level** roles `["Organization employee","Purchasing agent"]` (`Organization.Roles`, inherited by every member per `BL-B2B-005`), so the target contact read as 2 roles regardless of what its own membership held. The single-element write reported `succeeded: true` and the observable did not change — which is consistent with *both* "no data loss" and "loss masked by inheritance". **The result is therefore uninformative, not exculpatory.**

**Correct experiment (not run):** read the **membership record** via `GET /api/customer/organization-memberships/{id}` (which returns only that membership's own `roles`) as the observable, before and after a single-element write, in an org **without** org-level roles so inheritance cannot mask the delta.

### Alternatives NOT yet ruled out

- Whether `changeOrganizationContactRole` **replaces** or **merges** `roleIds` — the only thing that decides whether Finding B exists. `BL-B2B-008` says replace; unverified live on this build.
- Whether a membership is *intended* to hold multiple roles at all (grid renders many, API takes a list, editor takes one) — an open product question, and the reason severity is not yet assignable.

**Fix routing (provisional, MEDIUM confidence not reached):** if confirmed, `repoKind` = **`frontend`**, repo = **`vc-frontend`**, anchor `client-app/pages/company/members.vue:673-689`. **Not to be handed to `/qa-fix`** until the replace-vs-merge question is settled — Gate 0 would be triaging an unconfirmed defect.

---

## Incidental observation worth a separate look

`changeOrganizationContactRole` appears to have **created** a membership row rather than failing when the target contact had none of its own in that organization: membership `6ff9e3f222f34362aa7f86503f917c41` (userId `557dee63-a7ea-4932-9ef2-3635f353e7a2`, org TechFlow, roles `Purchasing agent + Organization employee`, status `Approved`) was **not present** in the first admin listing of that org (14 rows, all dash-formatted ids, all single-role) and appeared after the experiment's calls. `BL-B2B-009` assigns membership *creation* to the **invite** flow; a *change-role* mutation creating one would be a distinct finding. **Unverified** — the confirming read was denied before it could be repeated, so this is recorded as an observation with its evidence trail, not a claim.

## Environment side effects — NOT cleaned up

See the "Environment side effects" note in `evidence-index.md`. The row above is a **leftover write** that this investigation could not reverse: the `DELETE` was denied by the permission classifier, and the workaround was not attempted. It needs an operator decision.
