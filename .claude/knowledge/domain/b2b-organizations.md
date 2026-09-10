---
domain_slug: b2b
applicability: universal
rationale: |
  What the B2B / multi-organization feature IS — actors, value chain, the surface inventory per
  layer (Admin SPA / storefront / API), where the layers DISAGREE, and the shape of existing QA
  coverage. Built because a /qa-test run (VCST-5317) tested one predicate on one control in great
  depth and never established the feature around it; the operator called that out. A ticket-scoped
  context step inherits the ticket's narrowness, so this file is the feature-scoped counterpart.
generated: 2026-09-09
rev: 1
stale_after_days: 60
expires_after_days: 120
sources:
  - reports/ba/Organization roles/ (9 prior-art docs, 2,269 lines — verdicts in §8)
  - live enumeration on vcst-qa (Admin SPA + storefront + REST/GraphQL), 2026-09-09
  - vc-module-customer @ dev dbff8b9 ("3.1024.0", 2026-09-01) + vc-module-profile-experience-api
  - .claude/knowledge/api/graphql-schema.md (live introspection 2026-09-09)
  - config/test-suites.json + regression/suites/**
  - VirtoOZ StorefrontUserGuide + PlatformUserGuide, fetched first-hand 2026-09-09 (quotes verbatim in §3/§5)
excludes: Sales Rep (deliberate — a separate later pass; see §6 note)
---

# B2B / Multi-Organization — domain map

> **GENERATED-ish, but hand-curated.** Refresh with `/qa-domain-map b2b`. This file answers **what the
> feature is and where its surfaces are**. It does **not** carry behavioural rules — those are
> `BL-*` in `oracles/business-logic.md` — and it can **never ground an assertion as `{DOC}`**. It is
> a pointer index plus a surface inventory: it tells you *where to look* and *what exists*, never
> *what correct looks like*.

**Every claim carries a verdict.** `CONFIRMED` = observed live or read at source this pass ·
`DRIFT` = prior art says otherwise and prior art is wrong · `MISSING` = documented, does not exist ·
`UNVERIFIED` = not established, and **not** to be treated as true.

---

## §1 — Purpose and value chain

**Purpose: `UNDECLARED`.** No declared purpose statement exists for this surface — not in the nine
prior-art docs, not in a domain file (there was none until this one), and **not in either published
guide, checked first-hand 2026-09-09**: `StorefrontUserGuide` §Company Members describes *how* to
switch, invite and block, and `PlatformUserGuide` §Manage Organization Membership Status / §Manage
Organization-Scoped Roles describe *how* to set status and roles. **Both are procedural; neither says
what the feature is for.** That is the gap, and it is why the chain below had to be reconstructed. The chain below
is **reconstructed** from source + live and is the first written statement of it. Cite it as a
hypothesis to contradict, not as authority.

| # | Link, in the customer's words | Mechanism |
|---|---|---|
| 1 | A company comes into existence | `Organization` member record — Admin `Add`, `POST /api/organizations`, or storefront self-signup `createOrganization` (**anon-allowed**) |
| 2 | It gets an identity buyers recognise | Name · description · **"Business field"** (= `businessCategory`; the label differs from the model name) · icon · user groups · status · addresses · dynamic properties · per-org branding |
| 3 | It can sit under a bigger company | `Organization.parentId` — a **single field**, no path, no parents array |
| 4 | People become part of it | **Two independent linkages**: `Contact.Organizations` (association) **and** one `OrganizationMembership` row per (securityAccountUserId × orgId) |
| 5 | Each person gets rights *in that company* | Effective roles = **global account roles ∪ org-level `Organization.Roles` ∪ per-member `OrganizationMembership.Roles`**, deduped |
| 6 | Those rights become a session | `/connect/token` + `organization_id` → JWT carries the `organization_id` claim + org-scoped permission claims |
| 7 | The buyer transacts under that company | Org context drives cart · ship-to addresses · org pricing · order scope · shared lists · quotes · branding |
| 8 | They move between companies | Switcher → `refresh(organizationId)` (`grant_type=refresh_token` + `organization_id`), then **every open tab reloads**; persisted to `localStorage["organization-id-<userName>"]` **and** server-side to `Contact.CurrentOrganizationId` |
| 9 | Access is taken away | Two independent axes — **status** (`Invited`/`Rejected`/`Deleted` block) and **lock** (`IsLocked` + `LockoutEnd`). **Lock beats status.** Locking revokes tokens |

### Actors

| Actor | Can do | Verdict |
|---|---|---|
| **Platform admin** | All of §2. The **only** actor who can set a lockout expiry atomically, write a membership status directly, assign **any platform role**, reveal the hidden columns, and bulk-import members into an org | `CONFIRMED` live |
| **Org maintainer** (storefront) | `/company/info` edit + addresses + logo; `/company/members` invite / change role / block / unblock / delete / resend / revoke; `Login on behalf` if separately permissioned | `CONFIRMED` live |
| **Org employee / buyer** | Reads `/company/members` with no Actions column and no Invite button; browses, orders, lists, quotes | **`UNVERIFIED` — gap G1.** Source only (`canManageMembers`, `canShowDropdownFor`) |
| **Personal shopper** | All of `/account/*` **plus `/account/addresses`**; **no `/company/*` at all** | `CONFIRMED` live |
| **Sales rep** | `/company/sales-reps` renders in the org sidebar; three rep routes are the only ones clearing inherited `requiresOrganization` | out of scope |

---

## §2 — Admin back-office (Admin SPA)

**The menu item is `Contacts`, NOT "Customers"** (key `customer.main-menu-title`, permission
`customer:access`, priority 180). Live main menu (19): Home · Loyalty missions · Marketing · Loyalty ·
**Contacts** · Catalog · Orders · Notifications · Push Messages · Pricing · System Operations · Tasks ·
Sales Reps · Returns · Quotes · Settings · Security · Stores · More.

### 2a. "Companies and contacts" root list (`#!/workspace/customers`)

| Aspect | Live |
|---|---|
| Count | **792** (prior art: 647 on 2026-06-19 → `DRIFT`, data growth) |
| Toolbar | Refresh · Add · Delete · **Invite customers** · Import · Export · **Lock in organization** · More |
| `More` (org drill-down only) | **Unlock in organization · Change roles** |
| Visible columns | `actions` (⋮, pinned) · `Type` (icon) · `Name` |
| **Hidden by default (17)** | Created By/Date · Description · Group Name · Icon Url · **Id** · Logo Url · Modified By/Date · Object Type · Outer Id · Relevance Score · Seo Object Type · Site Url · **Status** · Use Dynamic Property Accessor · _member Type Icon |
| Row ⋮ | Manage · Copy ID · Copy name · Delete (`customer:delete`) |
| Filter panel | Member type (All / Organization / Employee / Contact / Vendor) · Created / Modified date · custom range |

**`Status` hidden by default is load-bearing** — it is the contact-level value that overrides *every*
org membership (§5 D4), and it is invisible until an operator enables the column.

**The three `*-in-organization` commands are SINGLE-selection, not bulk** (`getSelectedRows().length === 1`),
and appear only when the blade's current entity is an Organization — so the org they act on is **the org
whose drill-down you are inside**, chosen implicitly by navigation, with no org selector.
**There is no bulk lock, unlock or role change anywhere; `Delete` is the only multi-select command.**

### 2b. Organization surface

Clicking an org row **drills down**; the editor is `row ⋮ → Manage`. Toolbar: **Save · Reset** only.

| Field | Control | Live (AcmeWest) |
|---|---|---|
| **Name** | textbox, required | `AGENT-TEST-Org-AcmeWest-20260310` |
| **User groups** | multi-select chips + dictionary pencil (`Customer.MemberGroups`) | `store-acme` |
| **Status** | single-select + dictionary pencil (`Customer.OrganizationStatuses`) | **`Active`** — *not in the allowed set* (§5 D13) |
| **Business field** | short text — this is `businessCategory` | empty |
| **Description** | long text | present |
| **Roles** | multi-select chips — the **org-level** roles every member inherits | empty |
| *(absent)* | — | **no parent field · no child-org list · no owner · no contracts · no price list · no membership roster** |

Widgets: Addresses · Emails · Phone numbers · **Orders** · Dynamic properties · Indexed · Icon ·
Assets · **White labeling**. (Orders + White labeling are registered by **some other module** — a
literal-string search for the registration returned a **false negative**; gap G11.)
The Dynamic-properties tile counts *defined* properties for the type, not populated values.

**Hierarchy — `CONFIRMED`.** Children appear **interleaved with contact rows in one flat grid**,
distinguished only by the Type icon. `parentId` is assigned **once**, from wherever you were drilled in
when you clicked Add (`organization-detail.js`), never rendered, never editable ⇒ **re-parenting is
API-only**, and the initial parent is a side effect of navigation.

### 2c. Members / memberships

**The roster lives on the CONTACT, not on the organization** — `organizationMembershipsWidget` is
registered on the contact detail blade only. There is no way to reach a membership roster from an org.

Contact blade fields include **four separate org-linkage surfaces**: `Member of company(ies)`
(= `Contact.Organizations`) · `Default company` (= `DefaultOrganizationId`) · `Associated company(ies)`
(= `AssociatedOrganizations`) · the memberships widget (= `OrganizationMembership` rows).
**`Contact.CurrentOrganizationId` — the sticky org token issuance writes back — is exposed NOWHERE in
Admin.** Invisible and unmanageable from the back office.

**`securityAccounts[0]` only.** The widget resolves count, roster **and** the blade's `storeId` from
`securityAccounts[0]`. Consequences: (a) a contact with >1 account exposes memberships for the first
alone, with no indication anything is hidden; (b) the roles-whitelist **store override** uses the first
account's store, not necessarily the one you are editing; (c) a contact with **zero** accounts gets a
notification dialog instead of a roster — so a REST-created membership for an accountless contact is
**invisible in Admin**. Blast radius mechanically established, **unsized** (gap G12).

**Roster** — toolbar Refresh · Add · Delete (multi-select; a `Global` row can never be deleted).
Visible columns: **Organization · Roles · Invite status**. **11 hidden by default**, including
**`Is Currently Locked`**, **`Locked state`**, **`Locked until`**. (The *declared* hidden set is 3;
ui-grid auto-generates the rest from unmapped API fields. The Grid Menu **does** reveal them.)
An empty/unknown status renders **nothing** — no fallback branch.

**Membership detail blade** — toolbar **Save · Reset · Lock** *or* **Unlock** (exactly one shows;
both hidden while new; both `canExecuteMethod: true` unconditionally, so **visibility is the only
signal of lock state**).

| Field | Control |
|---|---|
| **Organization** | read-only label (searchable picker only when new) |
| **Roles** | multi-select chips, required |
| **Invite status** | single-select, only when not new. 5 options: `Inherit from member` (UI sentinel, no stored counterpart) · `Approved` · `Invited` · `Rejected` · `Deleted` |
| **Locked state** | read-only text (`Locked`/`Unlocked`), always rendered |
| **Locked until** | datepicker — rendered **only when already locked** |

> **An operator cannot set a timed lock in one action.** `Lock` posts an **empty body**
> (`POST …/{id}/lock`), and `Locked until` renders only under `ng-if="isLocked"`. Setting an expiry is
> **Lock → the field appears → edit → Save (`PUT`)**, with a window in which the membership is locked
> **indefinitely**. Any AC phrased "lock a member until date X" is **not satisfiable as one operator
> action**; only `POST …/{id}/lock` with a `lockoutEnd` body does it atomically, and that is REST-only.

**No Admin resend or revoke.** The invite blade has exactly one command, `send-invitations`. No invite
list, no history blade, despite `POST …/invite/{id}/{resend,revoke}` existing in REST. Admin "revoke"
is only `Invite status → Deleted`.

### 2d. Roles and the assignable-role whitelist

| Setting | `allowedValues` | `defaultValue` |
|---|---|---|
| `Customer.MembershipRolesWhitelist` | **`[]` EMPTY** | null |
| `Customer.OrganizationRolesWhitelist` | `[]` | null |
| `Customer.OrganizationMembershipStatuses` | `["Approved","Invited","Rejected","Deleted"]` | `Approved` |
| `Customer.OrganizationStatuses` | `["Approved","Rejected","Deleted","New"]` | `New` |
| `Customer.ContactStatuses` | `["Deleted","New","Locked","Invited","Rejected","Approved"]` | `New` |

`if (!whitelist.length) return allRoles;` — **empty means ALL.** Confirmed live: the membership Roles
picker offers the entire platform catalog.

**Org-level role inheritance — `CONFIRMED` end to end.** TechFlow carries
`roles: ["Organization employee","Purchasing agent"]`; all 16 storefront roster rows show both merged.

### 2e. "Invite customers" blade (in no prior-art doc)

One command, `Send invitations` (`customer:invite`). Fields: **Store** (required, empty by default) ·
**Language** (disabled until a store is picked) · **Organization** (from drill-down) · **Role** (single,
pre-filled `Organization employee`) · **Emails** (tag input; paste-many, regex-extract, de-dupe) ·
**Message**. Maps 1:1 to `POST /api/members/customers/invite`.

### 2f. NOT manageable from Admin

An org's **parent** (read or write) · **`Contact.CurrentOrganizationId`** · **an atomic lockout expiry** ·
accept/reject an invitation (invitee side) · a child-org list on the Company blade · an organization
"owner" (no such field) · the roster from the org side · effective (resolved) status · the organization
**logo** (xAPI `changeOrganizationLogo`; `Icon`/`Assets` are different things) · memberships of a
contact's 2nd+ security account · **bulk lock/unlock/role change** · contracts / price lists per org
(`UNVERIFIED`, gap G8).

---

## §3 — Storefront Company feature

### 3a. Route inventory — every row rendered live or produced an observed redirect. Nothing inferred.

| Route | Guard | Live |
|---|---|---|
| `/company` | `requiresAuth` + **`requiresOrganization`** | → `CompanyInfo` |
| **`/company/info`** | inherits both | **renders — in no prior-art doc** |
| **`/company/members`** | inherits both | renders |
| `/company/sales-reps` | inherits both | sidebar link renders (out of scope) |
| `/account/dashboard` · `/orders` · `/orders/:id` · `/orders/:id/payment` · `/profile` · `/change-password` · `/lists` · `/lists/:id` · `/saved-for-later` · `/saved-credit-cards` · `/coupons` · `/back-in-stock` · `/points-history` · `/missions` · `/notifications` · `/quotes` · `/quotes/:id` · `/quotes/:id/edit` | `requiresAuth` + module gates | render for both org and personal users |
| **`/account/addresses`** | `beforeEnter`: bounce if `isCorporateMember` | **org user → `/account/dashboard`**; personal user → link present |
| `/account/purchase-requests` | `PurchaseRequests.Enabled` | **404** — module not enabled on vcst-qa |
| `/account/confirmemail` · `/account/impersonate/:userId` | `public: true` | source |

**No route in vc-frontend carries a permission or role in its `meta`.** Route-level authz is exactly
three flags (`public`, `requiresAuth`, `requiresOrganization`) plus `beforeEnter` closures. Every other
permission gate lives **inside a component**.

### 3b. `/company/info` — the company-addresses surface

**There is no `/company/addresses` route.** Company name textbox + save · logo uploader (JPG/PNG,
≤4.8 MB, max 1) · **Addresses** table (`Address` · `Country` · `ZIP code` · `Description` · `Default` ·
`Actions`) + "Add new address".

### 3c. `/company/members`

Invite members · Filters · search *"Search by name, role or email"* · table `Name` (sortable) · `Roles` ·
`Email` · `Active` · actions · pagination.

**Filters panel** — Role (**5**): `Organization employee`, `Organization maintainer`, `Store manager`,
`Purchasing agent`, **`Sales Representative`**. Status (**3**): `Active`, `Invited`, `Blocked`.
Footer **Reset · Cancel · Apply**.

Status renders as an icon whose accessible name is the label. Label map: `Approved→Active` ·
`Invited→Invited` · `Locked→Blocked` · **everything else (`New`, `Deleted`, undefined) → `Inactive`**.
Below `md` it is a text pill; at `≥md` icon + tooltip only.

**Row Actions:**

| Row state | Items |
|---|---|
| `Invited` | **Resend invite · Revoke invite · `Login on behalf`** |
| `Active` | **Edit role · Block user · Delete · `Login on behalf`** |
| **self** | **no Actions button at all** |

**`Login on behalf` is absent from every prior-art doc, and it appears on a pending-invite row** — an
operator can impersonate a user who has not accepted their invitation. Gated on `CanImpersonate` + a
security account, **independently** of `canEditOrganization`.

### 3d. The two org-switcher components — different components, not one

| | Desktop | Mobile |
|---|---|---|
| Component | `top-header-organizations.vue` | `mobile-menu/menus/multi-organisation-menu.vue` |
| Entry | Account-menu popover, last child of `account-menu` | hamburger → **Corporate** → **"My organizations"** (`menu.json`, id `contact-organizations`) |
| Declared on desktop? | — | **No** — the desktop `corporate` section has no `contact-organizations` child |
| Markup | `listbox` + `role="option"`, arrow-key roving focus, search combobox | separate non-`@change` radio for the current org, then a `v-for` over the rest |
| Current org | pinned first via `displayedOrganizations` | separate radio above the loop |

Search appears only above `SEARCH_THRESHOLD = 10`; page size 30; infinite scroll; 300 ms debounce.
Ordering is **not** plain lexicographic on the raw string under `sort: "name:asc"`.
**Mobile: `UNVERIFIED` at source-level detail** (gap G2) — but see §5 D7 and the VCST-5317 run, which
found it live with **zero lock handling**.

### 3e. Personal vs organization account — the axis nobody had mapped

| Surface | Org user | Personal user |
|---|---|---|
| Header account button | `<Org> / <User>` | **`<User>`** — no org prefix, no separator |
| Org switcher | present | **absent** |
| Sidebar **Corporate** section | present | **absent — the whole section** |
| `/company/info`, `/company/members` | render | **→ `/account/dashboard`** |
| **`/account/addresses`** | **→ `/account/dashboard`** | **link present** |
| Header `Ship to:` | `Select address` | `Add new address` |
| Dashboard "Monthly spend report" | Budget $58,152 / Spent $530,152 | **byte-identical** |

**`VC-B2B-001` `CONFIRMED`, and it runs the direction people mis-read:** "Addresses" is hidden for
**ORGANIZATION** members and shown for **PERSONAL** accounts — corporate members manage addresses under
Company info. Enforced at **three** independent points (desktop `canShowUserItem`, mobile
`canShowItem`, the route's `beforeEnter`), so a hand-typed URL is closed too.

**The full org-gated set:** `addresses` (hidden when corporate) · the whole `corporate` section ·
`contact-organizations` (mobile only, `isMultiOrganization`) · the org-name label and switcher · operator
name + "Back to operator" · and the non-nav gates: `Invite members`, the members Actions column,
company-info edit/logo/address controls, Orders "All orders / My orders" scope tabs, the orders
customer-name filter, ship-to "add new address", checkout select-address "add new", the address
favourite toggle, wishlist sharing.

**The Monthly-spend widget is NOT user-scoped** — byte-identical across two unrelated accounts, one with
zero orders. Static/mock content, and the only dashboard element that ignores the signed-in identity.

---

## §4 — API / contract surface

### 4a. GraphQL (xAPI)

**Queries:** `me(userId)` · `organization(id!, userId)` · `contact(id!, userId)` · `vendor` ·
`organizations(after, first, searchPhrase, sort)` · `contacts` · `role(roleName!)` · `user` ·
`checkUsernameUniqueness` · `checkEmailUniqueness` · `validatePassword` ·
`checkDuplicateAddress(memberId!, address!)` · `currentCustomerAddresses` ·
`currentOrganizationAddresses` · `organizationContracts(organizationId!)` · `contract(id)` ·
`whiteLabelingSettings` · `pageContext` · `organizationOrders`.

**Mutations** (single `command` arg): `createOrganization` · `updateOrganization` ·
`changeOrganizationLogo` · `createContact` · `updateContact` · `deleteContact` ·
`removeMemberFromOrganization` · `updateMemberAddresses` · `deleteMemberAddresses` ·
`updateMemberDynamicProperties` · `updatePersonalData` · **`changeOrganizationContactRole`** ·
**`lockOrganizationContact`** · **`unlockOrganizationContact`** · **`inviteUser`** ·
`acceptOrganizationInvite` · `rejectOrganizationInvite` · `revokeOrganizationInvite` ·
`resendOrganizationInvite` · `registerByInvitation` · `requestRegistration` ·
`addAddressToFavorites` · `removeAddressFromFavorites`.

**Org scoping is asymmetric.** Only `organizationContracts` takes `organizationId` as non-null. The five
org-mutating mutations (role change, lock, unlock, revoke, resend) take **no** `organizationId` — it is
injected from the JWT claim, so a caller must authenticate *into* the target org. **`inviteUser` is the
sole exception** — it takes an explicit `organizationId`.

**Field traps.** `ContactType.organizationMemberships` **does not exist** — use the argument-scoped
`isLockedInOrganization` / `rolesInOrganization` / `statusInOrganization`. `Organization.isLockedForCurrentUser`
(zero-arg, caller-relative) and `Contact.isLockedInOrganization` (**current-org-relative**) answer
**different questions** and must not be substituted. `Organization.status` is the **org's own** member
status, not anyone's membership status — the membership-level field is `myStatusInOrganization`.

### 4b. Customer REST

`api/customer/organization-memberships` (`customer:organization-membership:{read,create,update,delete}`):
`GET user/{userId}/count` · `POST search` · `GET user/{userId}/org/{organizationId}` · `GET {id}` ·
`POST /` · `PUT {id}` · **`POST {id}/lock` (accepts `lockoutEnd`)** · `POST {id}/unlock` · `DELETE ?ids=`.
A `search` **requires** at least one scoping filter (`UserId`/`UserIds`/`OrganizationId`/`OrganizationIds`)
or returns `BadRequest` — so a global "find every locked membership" sweep is impossible.
**`POST …/{id}/lock` on an unknown id returns `200 OK` with a null body, not 404** — always read back.

`CustomerModuleController` (`customer:{access,read,create,update,delete,invite}`):
`api/members[/search|/{id}|/bulk|/delete]` · `api/members/organizations` · `api/members/accounts/{userId}` ·
**`api/members/{id}/organizations`** · `api/contacts/*` · `api/organizations/*` · `api/vendors/*` ·
`api/employees/*` · `PUT api/addresses?memberId=` · **`POST api/members/customers/invite`** ·
**`GET api/members/customers/invite/roles`** · **`POST …/invite/{membershipId}/{revoke,resend}`**.
Note the members path is `/api/members/`, **not** `/api/customer/members/` (`VC-API-001`).

### 4c. Org-scoped `/connect/token` and the five refusal codes

`POST {host}/connect/token`, form-encoded, no client credentials:
`grant_type=password&scope=offline_access&storeId=<store>&username=…&password=…&organization_id=<orgId>`.
**`storeId` is camelCase-only**; omitting it returns `400 user_cannot_login_in_store` on *valid*
credentials, indistinguishable from a genuine bad-store refusal. `organization_id` accepts either casing.

| `code` | Axis | Trigger |
|---|---|---|
| `user_is_locked_in_organization` | **LOCK** | `IsLocked && (!LockoutEnd \|\| LockoutEnd > UtcNow)` |
| `user_invitation_pending_in_organization` | STATUS | effective `Invited` |
| `user_is_rejected_in_organization` | STATUS | effective `Rejected` |
| `user_is_removed_from_organization` | STATUS | effective `Deleted` |
| `invalid_organization_id` | ASSOCIATION | no association — **only on a non-`password` grant** |

All five: HTTP 400, `error: "invalid_grant"`, **exactly one** entry in `errors[]`. Three shaping rules:
**fallback first** (a `password` grant silently re-points at the first accessible org and returns 200, so
a refusal assertion needs a single-accessible-org fixture or a non-`password` grant) · **lock beats
status** · **resolving no org at all is not a refusal** (the session carries no org context).
Never assert an org refusal against `user_is_locked_out` / `user_is_temporary_locked_out` /
`login_failed` / `user_cannot_login_in_store`. **Never assert on the response's `count` field** — it is
the parameter count, not an error count. A **consumed** refresh token fails with a *code-less*
`invalid_grant`, easily mistaken for the org refusal.
A storefront-scoped token returns `401 invalid_token` from platform REST — platform REST needs a
**context-free admin grant**.

### 4d. Reachable in only one layer

**REST-only:** membership as a first-class entity (CRUD, cross-user/org/role/status search, count,
by-(user,org) pair) · **an atomic timed lock** · locking a member of an org you are not authenticated
into · direct `Status` write on a membership · org-level `Organization.Roles` write (`updateOrganization`
has no roles field) · bulk + JsonPatch member ops · member-by-security-account · list-all-organizations ·
Vendor/Employee CRUD · customer preferences · global account lock state.

**GraphQL-only:** computed effective status (`myStatusInOrganization`, `statusInOrganization`) ·
caller-relative lock flags · **whitelist-filtered `assignableRoles`** · `contactRoles` (the
membership ∪ org-level ∪ global union) · roster filtered by role **and** status (`MembersSearchCriteria`
can express neither) · paged/faceted address reads · address favourites · duplicate-address check ·
**accept/reject invite** · `registerByInvitation`, `requestRegistration`, anon `createOrganization` ·
org logo · uniqueness/password checks · `me { permissions }` · org contracts · white-labeling and page
context per org.

**Same capability, different contract — the row most likely to break a test.** Role change is
`PUT …/organization-memberships/{id}` (**membership** id, **security-account** userId,
`roles: [{roleId, roleName}]`, **no** whitelist enforcement) versus
`changeOrganizationContactRole(memberId, storeId, roleIds)` (**contact** id, org from JWT,
whitelist-enforced → `RoleNotAllowed`, and a **full replace** — an empty `roleIds` clears every role).

---

## §5 — Where the layers DISAGREE

The most valuable section. 11 of these 15 were found in this pass and appear in no prior-art doc.

| # | Disagreement | Verdict |
|---|---|---|
| **D1** | **Status: raw vs mapped — and this one is DELIBERATE and DOCUMENTED.** Admin `Invite status` shows the **raw stored value** (+ an `Inherit from member` sentinel with no stored counterpart); the storefront badge shows a **mapped label**. `PlatformUserGuide` states it outright: *"The **Invite status** column shows the raw stored value (for example, **Approved**), not a Frontend-mapped label."* | `CONFIRMED` both sides live **+ `{DOC}` first-hand**. **Not a defect** — do not file it. It is the *reason* D2/D3/D11 are confusing, but the divergence itself is by design |
| **D2** | **Vocabulary sizes never line up.** Contact `Status` **6** · membership `Invite status` **5** · stored dictionary **4** · rendered labels **4** · Status **filter** only **3** (no `Inactive`) | `CONFIRMED` live, all counts |
| **D3** | **`Inactive` collapses two causes.** `Rejected` and `Deleted` are distinct stored values; both render `Inactive`, which has no filter and no stored value — **a declined member and a removed member are indistinguishable** | `CONFIRMED` |
| **D4** | **`EffectiveStatus = membership.Status ?? contact.Status ?? "Approved"`** — a *global* contact status overrides **every** org, and the contact-level `Status` column is **hidden by default** | formula **`CONFIRMED` by `{DOC}` first-hand** — `PlatformUserGuide` documents the 3-step resolution order verbatim, plus a ⚠ warning that an account-wide blocking status *"loses access to every organization they belong to"* — and at source; the hidden-column half is new |
| **D5** | **The lock axis is off by default where it is administered.** `Is Currently Locked`, `Locked state`, `Locked until` are all hidden-by-default columns; the blade's `Locked state` is read-only; no expiry at lock time. Meanwhile the flags are first-class GraphQL fields | new; severity softened — the Grid Menu **does** reveal them |
| **D6** | **Switcher gate ≠ switcher list.** The **gate** `isMultiOrganization` = `me.contact.organizations { totalCount }` with **no arguments** (counts *every* status); the **list** = `organizations(statuses:[Approved])`. One Approved org + any `Invited`/`New`/`Locked`/`Deleted` one satisfies `totalCount > 1`, so the switcher renders while the list may return a single row or an empty state | `CONFIRMED` at source; live `UNVERIFIED` (**gap G6**) |
| **D7** | **A locked org cannot be flagged in the switcher — structurally.** The list fragment `organizationFields.graphql` was literally `{ id name }` — no status, no lock field — and `statuses:[Approved]` excludes locked orgs anyway. Only post-click feedback existed | `CONFIRMED` at source. **Being changed by the unmerged VCST-5317 PRs** — see the note below |
| **D8** | **The sticky org survives the filter that hides it.** `authorize()` re-sends `localStorage["organization-id-<userName>"]` on every password login, and resolution honours an explicit `organization_id` **before** any accessibility check — so a login can be pinned to an org the switcher no longer lists | source-confirmed. **The mechanism behind the known `/403`-with-no-switcher dead end** |
| **D9** | **THREE role-assignment surfaces, three different role sources.** Invite (dedicated endpoint, **3** roles, **bypasses the whitelist**, single-role) · membership-via-**widget** (whitelist + **store override** + a **20-role cap**) · membership-via-**list command** (whitelist, **NO store override**, 20-cap). Same blade, same field, different effective whitelist depending on how you navigated in. `roles.search({keyword, take: 20})` means the picker is **silently truncated** on an env with 30+ roles | new; live on both Admin surfaces + settings API. **The single largest untested privilege surface** |
| **D10** | **A role granted in Admin propagates verbatim to the customer UI.** `Sales Representative` sits on a membership because the picker allowed it; it renders in the storefront `Roles` cell and as a **Members-filter checkbox**, and `common.roles.<id>` has no key for it ⇒ the **raw platform name** displays | new, observed both sides |
| **D11** | **Badge and name read different status fields.** The badge uses `statusInOrganization ?? status`; the **name fallback** (`"Invite sent"`) uses the *global* `contact.status`. Live: a row whose badge says **Active** displays **"Invite sent"** as its name | new — precise, previously unmapped. **The published guide makes it sharper, not softer:** `StorefrontUserGuide` §Invite users says *"The invitee appears in your member list immediately, showing **Invite sent**, until they complete registration"* — documenting it as the row's **status**, while live it is a **Name**-column fallback driven by a *different* field. So a reader of the guide expects it in the Active column and it is not there. `{DOC}` first-hand 2026-09-09 |
| **D12** | **Two org-linkage models coexist on one blade** (4 fields, §2c). And `GET api/members/{id}/organizations` filters locked orgs **by the CALLER's userId, not `{id}`** | model `CONFIRMED` live; the caller-filter asymmetry is a source finding |
| **D13** | **Out-of-dictionary statuses are accepted and silently non-blocking.** Live: `Active` on two orgs, `null` on a third, `Suspended` in fixtures — none in any allowed set. `BlockingStatuses = {Invited, Rejected, Deleted}`, so all are non-blocking | `CONFIRMED` live; extends prior art from contacts to organizations |
| **D14** | **Hierarchy exists in data and in navigation, nowhere in the form.** `parentId` drives the drill-down; children interleave with contacts in one flat grid. No parent field, no child list, no `Parent` column | new |
| **D15** | Sales Rep **excludes** per-org-locked orgs where the switcher **returns-and-flags** them | pointer only — out of scope |
| **D16** | **The published Storefront guide contradicts the build, AND contradicts itself in one paragraph.** `StorefrontUserGuide` §Switch between your companies ([url](https://docs.virtocommerce.org/storefront/user-guide/account/company-members)) says *"**Every company you belong to** is listed, with your current one marked… Select a different company from this list to work in it. **Only companies you currently have access to appear here.**"* Those two sentences disagree the moment you belong to a company you are locked out of — and the **first** one matches the new build while the **last** one is the old contract | `{DOC}` fetched first-hand 2026-09-09 + **live-verified**: at V2 the locked org IS returned (`totalCount = 2`, `isLockedForCurrentUser: true`). **Customer-facing and wrong either way** |
| **D17** | **The org-membership LOCK axis is undocumented.** `PlatformUserGuide` §Manage Organization Membership Status documents the **status** axis completely and correctly — the 5 Invite-status values, the 3-step resolution order, and a ⚠ warning about the account-wide blast radius — and says **nothing about `IsLocked`/`LockoutEnd`**. The only "Block or unblock" article in the guide is for **Sales Reps**, a different entity | `{DOC}` fetched first-hand. So the control an operator uses to lock a member has **no user documentation**, which is also why the two-step-expiry behaviour (§2c) has never been written down |
| **D18** | **The whitelist doc omits the empty-whitelist case.** `PlatformUserGuide` §Assign organization-level role states flatly *"Only roles allowed by the Organization roles whitelist appear in the dropdown."* Live, both whitelists are `[]` and **every** platform role appears — `if (!whitelist.length) return allRoles;` | `{DOC}` first-hand + live. The doc is not wrong about the mechanism, it is **silent about the default**, and the default is "no restriction" — which reads as the opposite of the sentence |

> **D7 is mid-change.** `vc-module-profile-experience-api` **#145** and `vc-frontend` **#2469** — both
> **OPEN/unmerged but PR-deployed on vcst-qa** — add `Organization.isLockedForCurrentUser`, stop
> excluding locked orgs from `contact.organizations`/`organizationsIds`, and render the desktop row
> `disabled` + padlock. They declare a **breaking change**. The VCST-5317 run against them found: the
> **mobile** switcher (`Corporate → My organizations`) got **no lock handling at all** and tapping a
> locked org silently signs the user out; the desktop guard is defeated by a **stale flag** (the list is
> fetched once per SPA session); and a locked org's **member roster and addresses stay readable** through
> `me.contact.organizations.items` while `organization(id:)` is `Forbidden`. Re-read this row after
> those PRs merge or are reverted.
>
> **AMENDED 2026-09-10 (VCST-5317 Round 3, live-CONFIRMED).** Two of the three findings above are **CLOSED** by `vc-frontend` commit `878e765a` (still on the same unmerged PR #2469, deployed as `2.58.0-pr-2469-afce-afce27e1`). The **mobile** switcher now renders a locked org `disabled` with a lock icon and the lock reason as its accessible name, and a tap is refused before any `/connect/token` fires — measured at a genuine 375x812 on three independent lanes. The **stale-flag** defeat is closed too: both switchers refetch on every menu open, verified by a second distinct `GetOrganizations` request after a lock applied mid-session with no reload, and independently in a second tab. **The third finding still STANDS** — a locked org-s order history remains readable via `organizationOrders(organizationId:)` while `organization(id:)` is `Forbidden` (`totalCount 79`, re-measured 2026-09-10); that is VCST-5933, explicitly scoped out of #2469. **The row-s instruction is unchanged: re-read it after those PRs merge or are reverted** — nothing here is shipped.

---

## §6 — Coverage shape

**Sales Rep is deliberately excluded** from this pass (8 suites, ~387 cases: `050m`, `050m2`, `089`,
`090`, `091`, `092b`, `093`, `097`).

**585 org-relevant cases across 35 suites** (555 excluding the all-`Manual` whitelabeling block), plus
~20 scattered across ~18 more suites at 1–5 each. Counts are *org-relevant cases*, not suite size.

| Suite | Org-relevant | Suite | Org-relevant |
|---|---|---|---|
| 006 B2B Organization | **65** of 65 | 026 Customer Contacts | **53** of 53 |
| 008 B2B Members | **40** of 40 | 050d GraphQL xProfile | **38** of 58 |
| 027 Customer Orgs & Invites | **71** of 71 | 010 Bulk Ship Dashboard | 26 of 53 |
| 027b Org-Scoped Roles | **18** of 18 | 011b B2B Company E2E | **26** of 26 |
| 082 Impersonation | **48** of 48 | 015 Quotes | 32 (0 org-**scoped**) |
| 074 Contracts | **18** of 18 | 007 B2B Lists | 10 of 50 |
| 067/070/071 Whitelabeling | 8/12/10 (all `Manual`) | 021 Platform Dyn-Props | 8 of 39 |
| 017 Orders Admin | 8 of 70 | 050h GraphQL Wishlist | 8 of 35 |
| 081 Select Ship Address | 7 of 29 | 031 Auth Login/Register | 7 of 37 |
| 013 Checkout B2B | 7 of 7 | 033 Auth Company Menu | 9 of 15 |
| 032 Auth Session/RBAC | 5 of 20 | 011 Checkout Flow | 5 of 71 |
| 042 Smoke | 4 of 34 | 078–078d Smoke | 8 total |
| **009 Variations & Configs** | **0 of 31** | others (014, 028, 057/058, 020, 049) | 1–2 each |

**Suites the obvious `b2b`-tag list misses entirely and that genuinely belong:** **`026`** (the Admin
org/contact CRUD suite — 53/53!), **`050d`**, `050h`, `021`, `020`, `017`, `067/070/071`, `081`, `011`,
`014`, `028`, `057/058`, `078–078d`, `049`. And **`009` carries the `b2b` tag with ZERO org content.**

### 6a. Zero / near-zero coverage

| Area | Count | Note |
|---|---|---|
| **Price lists per organization** | **0** | nearest proxies are blank-status legacy contract-price cases in `074` |
| **Quote visibility scoped to the org** | **0** | `015` has 32 cases, **all Draft**, none org-scoped. No "member A's quote visible to maintainer B", no cross-org denial. The entire B2B dimension of quotes is absent |
| **The D9 role-picker asymmetry** | **0** | `027b`'s 18 cases test the org-level picker + server enforcement; none diffs invite-roles against membership-roles |
| **`AssociatedOrganizationsOnlyScope`** | **0** | a scoped-RBAC permission scope (`'Only for associated organizations'`, hardcoded English), no coverage anywhere |
| **Org-scoped member Import / Export** | **0** | a write path, org-scoped by the drill-down org |
| **Admin-vs-storefront status/label parity** | **2** | D1/D2/D11 all sit in this hole |
| **Org hierarchy** | **5** | 2 Draft, 3 blank-status; **no storefront-side case at all**; nothing covers D14 |
| **`/company/info`** | **3** | one Automated E2E, one XSS-only, one widget-compat. **No field-level view/edit/validation** — and it is the company-addresses surface |
| **Mobile switcher** | **5** | against **60** desktop cases — still a heavy skew on one control. **Amended 2026-09-10:** the row asserting the panel exposes *no* switcher (`B2C-ORG-047`) was executed in `REG-2026-09-10-1453` and **FAILED on that premise**, confirming it as a test defect rather than a product statement; two new rows were added (`B2C-ORG-068` refetch-on-open incl. the two-tab probe, `B2C-ORG-070` mobile degraded org-list) |
| **`Login on behalf` on the roster** | **~0** | `082` covers impersonation as a flow; nothing covers the roster entry point on a **pending-invite** row |
| **Purchase requests** | **0** | *deliberate* — live 404, module is virtostart-only |
| **Order approval** | **0 live** | 5 cases, all `Deprecated` against `BL-B2B-004` — deliberate; do not re-author |

### 6b. Over-covered relative to risk

- **`006`'s switcher lock axis: 23 of 65 cases**, 12 of them `[STATE-STRESS]`/`[UIP-*]` variants on **one
  disabled dropdown row**, several asserting non-existence. **All Draft — none has ever run.**
- **`006`'s switcher org-search: 14 of 65**, client-side list filtering at Medium/Low — against **5**
  cases for `/connect/token organization_id`, the boundary that decides whether a user receives a
  foreign org's data.
- `082` impersonation **48** — 15 are the verification-form widget, 3 i18n; only 7 cover session scope.
- Per-org branding `067/070/071` — **30, every one `Manual`** (7 more `Deprecated`); none executable
  headless, and three suites re-assert "switch org → branding updates".
- Misfiled under `b2b/`: `009` (31/31 non-org) and 27 of `010`'s 53.

### 6c. Selection-group and executability problems

- **`selections.b2b` = `{where:{tag:"b2b"}}` → `006,007,008,009,010,011b,013,015,042,074` only.**
  `/qa-regression b2b` tests **none** of the Admin (`026`, `027`, `027b`), GraphQL (`050d`, `050h`),
  auth (`031`–`033`) or impersonation (`082`) coverage — and **does** run `009`, which has none.
- **`envRiskGate: "staging"`** on `013, 015, 026, 027, 027b, 074` — the whole Admin/quotes/contracts
  half will not run below that tier.
- **`requiresModules`** — `026/027/027b` need `customer`, `074` needs `contracts`; absent ⇒ silent skip.
- **Firefox lane:** with `defaults.firefoxClickOk: false` (the documented rollback), 15 of the 18 core
  suites are `clickDriven` and get denied the slot, leaving only `026` and `074` eligible.
- **The feature's centre of mass is Draft.** `006` (65, 0 Automated), `015` (32, 0 Automated) and 71
  blank-status legacy cases in `026`+`074` ⇒ roughly **200 cases have never been executed or promoted**.
  Executable coverage is concentrated in `007/031/033/042/050d/082`.
- `007` holds **16 Sales-Rep-subject cases** (`B2C-LIST-040`…`055`) **not** excluded from `full` the way
  the eight dedicated rep suites are.

---

## §7 — Open gaps

| # | Gap | State |
|---|---|---|
| **G1** | Org-maintainer vs org-employee visibility (`BL-B2B-005`) **live** | **OPEN.** `ORG_USER_EMAIL` is *another maintainer*. The only employee-role fixtures are reserved lane accounts, and signing in as one writes `Contact.CurrentOrganizationId`. Source-confirmed only |
| **G2** | Mobile switcher at source-level detail | **PARTLY CLOSED** by the VCST-5317 run (found live, no lock handling); component internals still source-only |
| **G3** | `Blocked` status badge, live | **OPEN.** No locked membership among readable fixtures |
| **G6** | **D6 (gate ≠ list), live** | **OPEN.** The 12-org fixture has 12 *Approved* orgs. Needs 1 Approved + ≥1 Invited/Locked |
| **G7** | Per-store whitelist override read path | **OPEN.** `GET /api/platform/settings/Store/B2B-store` → 404; client path is `settingsV2.getTenantValues({tenantType:'Store', tenantId})` |
| **G8** | Contract ↔ organization assignment; org price lists | **PARTLY CLOSED** — no contract/pricing widget on the Company blade. Assignment from the Contracts module's own blades still OPEN |
| **G9** | `White labeling` / `Assets` / `Icon` org-widget contents | **OPEN** — enumerated, not opened |
| **G11** | Which module registers **Orders** + **White labeling** onto the Company blade | **OPEN.** The literal-string search was a **false negative** against live |
| **G12** | How many live contacts hold **>1 security account** | **OPEN.** `securityAccounts[0]` mechanism established, blast radius unsized |
| **G13** | Is a per-org role change effective **immediately** or **at next sign-in**? | **CLOSED by docs, 2026-09-09 — and the earlier “the docs contradict each other” claim was WRONG.** Both guides, fetched first-hand, agree on **next sign-in**: `StorefrontUserGuide` §Edit user roles — *“A role change takes effect the next time the member signs in.”*; `PlatformUserGuide` §Assign organization-level role — *“Employees must sign in again. Effective permissions are recalculated at sign-in. An employee with an open Frontend session keeps their previous permissions until they sign out and back in. **The change is applied on the server immediately, so only the active session is stale.**”* That last clause is the reconciliation: **server-immediate, session-stale**. Still `UNVERIFIED` **live** — confirming it needs a mutation |
| **G14** | The `ConfirmInvitation` route's URL path | **OPEN.** The route *name* is used to build the invite `urlSuffix`; the path string is unknown |
| **G15** | Canonical role → permission mapping for the shipped org roles | **OPEN.** No doc states which permissions `Organization maintainer` / `Purchasing agent` / `Organization employee` carry on any env |

---

## §8 — Prior-art verdicts

The nine docs in `reports/ba/Organization roles/` remain the detail; this map supersedes them where they
disagree. **Eleven Admin claims and four storefront claims are wrong** — the ones worth carrying:

| Claim | Verdict |
|---|---|
| A11 — membership `Status` is a read-only `Active`/`Locked` display | **DRIFT** — the read-only field is **`Locked state`**; `Invite status` is a *separate editable* dropdown. The doc conflates two fields |
| A14 / A15 — Lock offers an *optional* expiry date at lock time | **DRIFT** — there is **no expiry at lock time**; the picker appears only once locked (§2c) |
| A18 — bulk "Lock in organization" across all selected contacts | **DRIFT** — single-selection only |
| A19 / A20 — per-row lock action, inline role dropdown in the row | **DRIFT / MISSING** — no inline row editing exists anywhere |
| A25 — only whitelisted roles appear in the dropdown | **DRIFT** live — whitelist empty ⇒ **all** roles offered |
| A32 — a whitelist cannot be cleared to empty (VCST-5441) | **CONTRADICTED** live — both are empty (consistent with the fix having landed) |
| A49 — creating a membership from an Admin UI wizard is out of scope | **DRIFT** — a `New membership` blade exists behind `Add` |
| A5 — the widget shows 0 for every pre-existing contact | **DRIFT** — shows 5. The no-back-fill *mechanism* is untouched; the observable claim is stale |
| A6 / A6c — roster columns | **DRIFT** — third column is `Invite status`; no Actions column; only `Organization` is sortable |
| A21 — empty state "No organization memberships" | **DRIFT** — renders the platform generic `platform.list.no-data` |
| B9 / B22 — roster Actions items | **DRIFT** — a fourth/third item, **`Login on behalf`**, in no doc |
| B10 — change-role dialog offers three roles | **DRIFT** — reads live `assignableRoles`; the Members *filter* offers **5** |
| B18 — Filters footer Apply/Reset | **DRIFT** — a third button, **`Cancel`**, is missing from the docs |
| B20 — a pending row reads "Invite sent" as its *status* | **DRIFT** — it is a **Name**-column fallback off the *global* contact status (D11) |
| C6 — storefront role vocabulary is 3 roles | **DRIFT** — 5 appear in the Members filter |
| **C28r** — server-side whitelist enforcement is *not implemented* | **PARTLY STALE** — enforced on `changeOrganizationContactRole` via `RoleNotAllowed`; only `PUT /api/organizations` remains unguarded. **`BL-B2B-011` needs an oracle re-audit** |

Settled from the prior-art open list: **G2.1** (no domain file for this area) `CONFIRMED` — **closed by
this file**; **G2.3** (no `/company/*` inventory) **closed** by §3a; **G1.5** (all-locked: hidden or empty
state?) **resolved** in favour of the empty state (`organizations-empty-list`).
