---
domain_slug: b2b
applicability: universal
rationale: |
  What the B2B / multi-organization feature IS — actors, value chain, the surface inventory per
  layer (Admin SPA / storefront / API), where the layers DISAGREE, and the shape of existing QA
  coverage. Built because a /qa-test run (VCST-5317) tested one predicate on one control in great
  depth and never established the feature around it; the operator called that out. A ticket-scoped
  context step inherits the ticket's narrowness, so this file is the feature-scoped counterpart.
  Rev 3 (2026-11-24) refreshes the org-switcher surface after vc-frontend#2667 moved it from the account
  dropdown to a header control (VCST-6237), recounts coverage, and adds D23-D26 / G18-G25; Admin, quotes and
  the API contract were NOT re-enumerated (see section 0).
  Rev 2 folds in the QUOTES surface end-to-end (storefront + Admin + xAPI) after a Quotes question
  exposed that rev 1 named the coverage hole (old §6a) but never inventoried the surface itself.
generated: 2026-11-24
rev: 3
amended: 2026-09-18
stale_after_days: 60
expires_after_days: 120
sources:
  - REV 3 (2026-11-24) - this file's rev 2 carried forward whole; plus reports/tickets/Sprint26-23/VCST-6237/vcst/{test-strategy,test-model,testing-checklist,design-report,verdict}.md, evidence/A9/root-cause.md, exploratory/SBTM-VCST-6237-2026-11-23.md (read by path; their live observations enter here only through the kb ids cited per row)
  - REV 3 live: playwright-firefox, GUEST only (header, /sign-in, /account/quotes redirect). The authenticated walk was BLOCKED - the firefox lane was not started by scripts/lanes/playwright-lane.mjs so it holds no password (hook refusal), and no login exists in the store for MULTI_ORG_TF_BR_ALT. Authenticated rows below rest on kb entries observed 2026-11-23 on vcst by the VCST-6237 run, and on source @ vc-frontend 0444048a2 (PR #2667 head)
  - REV 3 deployed (vcst, 2026-11-23, per the brief): Platform 3.1099.0, theme 2.63.0-pr-2667-0444-0444048a, Customer 3.1033.0, ProfileExperienceApi 3.1025.0, Xapi 3.1033.0-pr-79-4dfa, WhiteLabeling 3.1007.0
  - REV 3 docs: VirtoOZ connector NOT available this pass; Context7 /virtocommerce/vc-docs fallback returned xAPI reference pages only, no user-guide page for the switcher, so NO guide is quoted this pass and every rev-2 guide quote (D1, D4, D11, D16-D18) is carried unrefreshed
  - .claude/knowledge/api/graphql-schema.md run copy refreshed 2026-11-23 (reports/tickets/Sprint26-23/VCST-6237/vcst/knowledge/api/graphql-schema.md; 130 queries / 154 mutations per the run)
  - reports/ba/Organization roles/ (9 prior-art docs, 2,269 lines — verdicts in §8, carried from rev 1)
  - .claude/knowledge/domain/b2b-organizations.md rev 1 (2026-09-09, amended 2026-09-11) — this file IS the previous rev; every D*/G* id carried forward
  - reports/ba/test-models/VCST-5317-2026-09-09.md, VCST-5281-*, VCST-5733-2026-09-02.md — read by path this pass, not re-opened line-by-line (no new claim needed from them beyond what rev 1 already extracted)
  - live enumeration on vcst-qa (Admin SPA + storefront + REST/GraphQL), 2026-09-09 (rev 1) + 2026-09-16 (rev 2, Quotes-focused: storefront /account/quotes as 3 distinct accounts, Admin Quotes list + detail + status dropdown, org-switch quote-scoping probe)
  - vc-module-customer @ dev dbff8b9 ("3.1024.0", 2026-09-01) + vc-module-profile-experience-api (rev 1)
  - GET /api/platform/modules (context-free admin token), 2026-09-16 — VirtoCommerce.Quote 3.1002.0, Customer 3.1024.0 (same as rev 1 — a Customer-area DRIFT this pass is a rev-1 error, not a version change), ProfileExperienceApiModule 3.1018.0, Xapi 3.1021.0, XCart 3.1033.0, XOrder 3.1011.0
  - .claude/knowledge/api/graphql-schema.md (live introspection refreshed 2026-09-16 — newer than rev 1's 2026-09-09 snapshot; its TYPE sections are a curated allowlist per its own header, queries/mutations lists are complete)
  - config/test-suites.json + regression/suites/** (suite 015 quotes CSV read in full this pass — 116 lines / 32 cases)
  - VirtoOZ StorefrontUserGuide + PlatformUserGuide + B2BExperts, fetched first-hand 2026-09-16 (quote-requests, submit-quotes, purchase-requests, manage-quotes, glossary §Approval workflow, managing-organization-roles) — quotes verbatim in §2/§3/§5
  - .claude/knowledge/automation/storefront-config-flags.md (quote_statuses[] — 8-entry runtime dictionary)
  - .claude/knowledge/domain/sitemap.md — the GraphQL xAPI module table (xCatalog/xCart/xOrder/xProfile/xCMS/Quote rows) under heading "9. GraphQL xAPI Endpoints"; its **Quote** row found stale this pass, see §8
  - .claude/knowledge/oracles/business-logic.md — BL-B2B-003/004/005, BL-CROSS-006/008 read for orientation, cited not restated
excludes: >-
  Sales Rep (deliberate — a separate later pass, now its own domain map
  `.claude/knowledge/domain/sales-rep.md`; see the §6 note. **Cited by path, never by rev** — a rev
  pinned in prose here goes stale every time the sibling map is refreshed, which is exactly how this
  line broke: it named rev 2 after that map had moved to rev 3)
---

# B2B / Multi-Organization — domain map

> **GENERATED-ish, but hand-curated.** Refresh with `/qa-domain-map b2b`. This file answers **what the
> feature is and where its surfaces are**. It does **not** carry behavioural rules — those are
> `BL-*` in the BL oracle (`npm run bl:extract -- --domain b2b`) — and it can **never ground an assertion as `{DOC}`**. It is
> a pointer index plus a surface inventory: it tells you *where to look* and *what exists*, never
> *what correct looks like*.

**Every claim carries a verdict.** `CONFIRMED` = observed live or read at source this pass ·
`DRIFT` = prior art says otherwise and prior art is wrong · `MISSING` = documented, does not exist ·
`UNVERIFIED` = not established, and **not** to be treated as true.

## §0 — Changed since rev 2 (2026-09-16 → 2026-11-24)

**What moved: one surface, and the shape of the coverage.** Everything not named here is carried from rev 2
verbatim and is exactly as old as rev 2 says it is. **Not re-enumerated this pass:** the whole Admin SPA
(§2 — rev 2 walked platform `3.1071.0-pr-3108`, the stand now runs `3.1099.0`), the quotes surface (§2g, §3f,
§4e), the REST contract (§4b–§4d) and the personal-vs-org route table (§3a/§3e beyond the header row). Gap G23
says why: the authenticated live walk was blocked on this lane.

| # | Rev 2 said | Rev 3 says | Basis |
|---|---|---|---|
| 1 | §3d: desktop switcher = `top-header-organizations.vue`, **last child of the account-menu popover** | **That component no longer exists.** The desktop switcher is the header control `organizations-button` (`organization-switcher.vue` + `organization-list.vue`), the **last item of the right icon group after Cart**, in `bottom-header`, rendered only when `me.contact.organizations.totalCount > 1`. The account dropdown is now the name link + Logout (+ "Back to operator" while impersonating). **DRIFT of our own prior art — D23** | source @0444048a2 (`top-header-organizations` absent from the tree; `menu.json` id `organizations`, priority 110, rendered through ExtensionPoint `headerMenu`) + KB-3F1B8798, KB-A26A8ACC live |
| 2 | §3e: account button reads `<Org> / <User>` | Still true on desktop, **but the org label is hidden below `xl`**; below it the org is visible only in the control's name/title. A personal / single-accessible-org buyer: user name only, no control | KB-A26A8ACC (live); org-label breakpoint from the brief — UNVERIFIED by me |
| 3 | D6: the gate counts **every** status, the list is Approved-only, so an Invited/Locked org makes the control render with a short list | **Narrowed (D24).** The unfiltered `totalCount` already excludes Invited/Rejected/Deleted server-side, so those never open the control (Approved+Invited ⇒ **no control**). Only a **locked Approved** membership is counted — and the list now **returns** it as a disabled row | KB-EB6191B8 (3 confirmations, incl. two on this build) |
| 4 | D7: a locked org "cannot be flagged in the switcher — structurally"; mid-change under unmerged PRs | The new control renders a locked row `disabled` with a lock icon and a `title` tooltip; the panel is re-mounted per open (`:key="openCount"`) so the stale-flag defeat is closed in source. **D7's original claim is historical**; the mid-change note stays below it | KB-BDC577C1 (tooltip text source-only; row disabled + lock icon live), source |
| 5 | §6a: "switcher lock axis: 23 of 65, **all Draft — none has ever run**"; 006 = 65 cases, 0 Automated | **006 = 71 cases: 25 Automated · 41 Draft · 4 Reviewed · 1 Manual.** Five retired, five added this week (header-control rows `B2C-ORG-072/073/074/076/077`). The "all Draft" and "never run" lines are **false now** | `regression/suites/Frontend/b2b/006-b2b-organization.csv` parsed this pass |
| 6 | §6a/§6c: suite 015 = 32 cases, **all Draft** | **27 Draft · 5 Automated**, still one fixture (`ORG_USER_DEFAULT` on every row) | parsed this pass |
| 7 | §6c: `selections.b2b` = 10 suites | **25 suites.** The `b2b` tag now also sits on the Sales-Rep suites (`050m`,`050m2`,`050m3`,`089`–`093b`,`097`,`112`,`116`), UCP `102` and returns `050o` — so `/qa-regression b2b` runs the domain this map excludes, and **still** omits `026`,`027`,`027b`,`050d`,`031`–`033`,`082`. **DRIFT** | `config/test-suites.json`, recomputed |
| 8 | (absent) | **A membership write terminates the buyer's sessions** (a refresh token minted before it is revoked: `400 invalid_grant ID2018`, no org code). The storefront reads that code-less 400 as a successful switch, persists the refused org as last-used and reloads as a guest with no message. Pre-existing, not from #2667 — **D25** | KB-3CBA0D5F (7 confirmations); `evidence/A9/root-cause.md` |

**Counts, D/G ids.** D1–D22 and G1–G17 carried, none renumbered or deleted. New: **D23–D26** (4), **G18–G25** (8).
Closed: none outright; **G6 CLOSED (by D24), G3 unchanged, G2 further partly closed** (§7). Nothing in the quote,
Admin or REST layers was contradicted — they were not re-read.

## §0b — Changed since rev 1 (2026-09-16) — carried from rev 2

Rev 1 named the quotes coverage hole (old §6a: *"015 has 32 cases, all Draft, none org-scoped… the
entire B2B dimension of quotes is absent"*) but never inventoried the quotes surface itself. That is
what this refresh adds, as a first-class area of §2/§3/§4/§5 rather than an appendix. Nothing in rev 1
is retracted; the additions and corrections are:

- **New storefront subsection §3f** — the full `/account/quotes` surface, walked live as three distinct
  account shapes (single-org maintainer, multi-org member, personal/no-org). New finding: **quotes is
  gated by authentication only, not by organization membership** — a personal account sees the identical
  "Quote requests" page and sidebar entry as an org member. Rev 1's §3e "org-gated set" table did not
  cover quotes at all; it now belongs in the *not*-org-gated column.
- **New Admin subsection §2g** — the Quotes blade (list + detail + status switcher), enumerated live for
  the first time. New finding: the **"Customer's company" field on a quote from a confirmed org member
  reads "Not defined"** — the Quotes module's Admin surface does not visibly carry organization context
  even when the requester unambiguously belongs to one.
- **New API subsection §4e** — the Quote GraphQL surface (queries `quote`/`quotes`, the cart-side and
  quote-side mutations), and a correction to our own knowledge: the **Quote** row of the GraphQL xAPI
  module table in `sitemap.md` names `quoteRequest`/`quoteRequests`, which do not exist in the live
  schema — see §8.
- **D19–D22 (new)** — the quote-status vocabulary's four-way disagreement (storefront doc, admin doc,
  storefront runtime config, and the *live* admin status-switcher itself all differ), the absence of any
  "Convert to Order" control on either surface (contradicting `BL-B2B-003`'s wording), the sidebar
  module-route i18n key leak (reproducible on 2 of 3 accounts, not on the third, in the same session as a
  correctly-rendering footer), and the Admin "Customer's company: Not defined" observation above.
- **G16–G17 (new)** — the concrete fixture blocker for testing quote org-scoping (a same-user,
  cross-org quote pair does not exist; a same-user org-switch probe this pass came back empty on both
  sides, which is *inconclusive*, not a negative result) and the i18n leak's unestablished root cause.
- **§6 (coverage)** — suite 015's Draft/Automation_Status count (32 of 32) and its single-fixture
  precondition (`[PRE:SIGNIN_AS:ORG_USER_DEFAULT]` on every one of its 32 rows, confirmed by a full-file
  grep this pass) are now `CONFIRMED` rather than carried from rev 1 unverified.
- Every other section is carried forward verbatim from rev 1 unless a row below says otherwise.

---

## §1 — Purpose and value chain

**Purpose: `UNDECLARED`.** Unchanged from rev 1. No declared purpose statement exists for this surface —
not in the nine prior-art docs, not in a domain file before rev 1, and not in either published guide
(re-checked first-hand 2026-09-16, including `PlatformUserGuide`'s Quotes-module pages, which describe
*how* to manage a quote but never *why* the org layer sits under the whole commerce flow the way it
does). The chain below is **reconstructed**, unchanged from rev 1, plus one link this pass sharpens:

| # | Link, in the customer's words | Mechanism |
|---|---|---|
| 1 | A company comes into existence | `Organization` member record — Admin `Add`, `POST /api/organizations`, or storefront self-signup `createOrganization` (**anon-allowed**) |
| 2 | It gets an identity buyers recognise | Name · description · **"Business field"** (= `businessCategory`; the label differs from the model name) · icon · user groups · status · addresses · dynamic properties · per-org branding |
| 3 | It can sit under a bigger company | `Organization.parentId` — a **single field**, no path, no parents array |
| 4 | People become part of it | **Two independent linkages**: `Contact.Organizations` (association) **and** one `OrganizationMembership` row per (securityAccountUserId × orgId) |
| 5 | Each person gets rights *in that company* | Effective roles = **global account roles ∪ org-level `Organization.Roles` ∪ per-member `OrganizationMembership.Roles`**, deduped |
| 6 | Those rights become a session | `/connect/token` + `organization_id` → JWT carries the `organization_id` claim + org-scoped permission claims |
| 7 | The buyer transacts under that company | Org context drives cart · ship-to addresses · org pricing · order scope · shared lists · **quotes (partially — see D19–D21 and G16: the storefront surface is identical whether or not an org is in context, and Admin does not visibly bind a quote back to the requester's org)** · branding |
| 8 | They move between companies | **(rev 3: the header Organizations control, §3d — not the account menu)** → `refresh(organizationId)` (`grant_type=refresh_token` + `organization_id`), then **every open tab reloads**; persisted to `localStorage["organization-id-<userName>"]` **and** server-side to `Contact.CurrentOrganizationId` |
| 9 | Access is taken away | Two independent axes — **status** (`Invited`/`Rejected`/`Deleted` block) and **lock** (`IsLocked` + `LockoutEnd`). **Lock beats status.** Locking revokes tokens |

### Actors

| Actor | Can do | Verdict |
|---|---|---|
| **Platform admin** | All of §2. The **only** actor who can set a lockout expiry atomically, write a membership status directly, assign **any platform role**, reveal the hidden columns, and bulk-import members into an org | `CONFIRMED` live |
| **Org maintainer** (storefront) | `/company/info` edit + addresses + logo; `/company/members` invite / change role / block / unblock / delete / resend / revoke; `Login on behalf` if separately permissioned; `/account/quotes` — same surface as every other account (§3f) | `CONFIRMED` live |
| **Org employee / buyer** | Reads `/company/members` with no Actions column and no Invite button; browses, orders, lists, quotes. Permissions (`roles.csv` `org-employee`): `storefront:organization:view;storefront:user:view` — **the same two `purchasing-agent` holds**, so those two roles do not differ on any storefront RBAC axis | **`UNVERIFIED` — gap G1**, but for lack of an OBSERVATION, not for lack of a fixture: `ACME_VIEWER` is seeded and signable (G1, amended 2026-09-11). Source only so far (`canManageMembers`, `canShowDropdownFor`) |
| **Personal shopper** | All of `/account/*` **plus `/account/addresses`**; **no `/company/*` at all**; **`/account/quotes` renders identically to an org account** (new this pass — see §3f) | `CONFIRMED` live |
| **Sales rep** | `/company/sales-reps` renders in the org sidebar; three rep routes are the only ones clearing inherited `requiresOrganization` | out of scope — now covered by `.claude/knowledge/domain/sales-rep.md` |

---

## §2 — Admin back-office (Admin SPA)

**The menu item is `Contacts`, NOT "Customers"** (key `customer.main-menu-title`, permission
`customer:access`, priority 180). Live main menu (2026-09-16, 18 items — one fewer than rev 1's 19: a
**"Developer tools"** entry now appears where rev 1 recorded none; **"Marketing"/"Loyalty"** order and
count otherwise match): Home · Loyalty missions · Marketing · Loyalty · **Contacts** · Catalog · Orders ·
Notifications · Push Messages · Pricing · System Operations · Tasks · Sales Reps · Returns · **Quotes** ·
Settings · Security · Stores · Developer tools · More. (Platform build this pass: `3.1071.0-pr-3108-016f`,
a PR build — the menu composition is `UNVERIFIED` against a release build.)

> **Rev 3 note — §2 is rev 2's enumeration, not re-walked.** Platform moved `3.1071.0-pr-3108` → `3.1099.0` and Customer to `3.1033.0`; menu composition, counts (792 contacts, 2,239 quotes) and the blade inventory are therefore `UNVERIFIED` against the current build (gap G23). Nothing in the VCST-6237 evidence touched Admin, so there is no new contradiction either.

### 2a. "Companies and contacts" root list (`#!/workspace/customers`)

| Aspect | Live |
|---|---|
| Count | **792** (prior art: 647 on 2026-06-19 → `DRIFT`, data growth) — not re-counted this pass |
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
(`UNVERIFIED`, gap G8) · **which org a quote came from — see §2g: the field exists on the blade and
reads "Not defined" for a confirmed org member's quote (D22)**.

### 2g. Quotes (Admin) — new this pass

**Menu item `Quotes`**, priority-ordered between `Returns` and `Settings` in the main menu. List blade
`#!/workspace/quotes`.

| Aspect | Live (2026-09-16) |
|---|---|
| Count | **2,239** |
| Toolbar | Refresh · Delete (multi-select) |
| Columns | **Quote # · Status · Item count · Customer · Created** — no Organization/Company column anywhere in the default or hidden set observed |
| Search | Free-text keyword box, paged (5 visible pages on this load) |
| Row click | Drills to the quote detail blade (same tab, not a new-tab pattern) |

Status values **observed in the live grid** across the pages read: `Draft`, `Processing`, `Ordered`,
`Declined`. (`On hold` and `Cancelled`/`Canceled` were not observed in the rows read this pass — absence
here is not evidence they never occur; see D19.)

**Quote detail blade** — toolbar varies by status; for a `Processing` quote (`AGENT-TEST-QTE-ADMIN-RESPONSE`,
observed live) it is **Save · Reset · Submit proposal · Put on hold · Cancel document · Delete**.
**No "Convert to Order" command exists anywhere on this toolbar** — see D20.

| Field | Control | Live observation |
|---|---|---|
| **Customer** | link | `test-emily.johnson-20260310@test-agent.com` |
| **Customer's company** | read-only text | **"Not defined"** — for a quote from a confirmed TechFlow org member (see D22) |
| **Created / Last updated** | read-only timestamp | present |
| **Status** | single-select dropdown | current value `Processing`; **dropdown options observed: `Processing`, `On hold`, `New`, `Declined`, `Proposal sent`, `Ordered`** — 6 values, and neither `Draft` nor `Cancelled`/`Canceled` appears as a selectable target from this state (see D19) |
| **Expiry date** / **Reminder date** | date pickers | empty on this quote |
| **Assigned to** | single-select (employee) | empty (`Select...`) |
| **RFQ from** | single-select (store) | `B2B-store` |
| **General comment** | textbox | populated (fixture note) |
| **Internal comment** | textbox | empty |

Widgets: **Shipping address** (one address shown, type "Shipping") · **Totals** (Subtotal / Shipping /
Discount / Grand total) · **Attachments** (count badge) · **Dynamic properties** (count badge) ·
**Changes** (history). No billing-address widget was distinguishable from the shipping one on this quote
(both docs describe "shipping/billing addresses" as one widget — `UNVERIFIED` whether they are ever
shown separately).

---

## §3 — Storefront Company feature

### 3a. Route inventory — every row rendered live or produced an observed redirect. Nothing inferred.

| Route | Guard | Live |
|---|---|---|
| `/company` | `requiresAuth` + **`requiresOrganization`** | → `CompanyInfo` |
| **`/company/info`** | inherits both | renders for an org account; **re-confirmed this pass: bounces a personal account to `/account/dashboard`** |
| **`/company/members`** | inherits both | renders for an org account |
| `/company/sales-reps` | inherits both | sidebar link renders (out of scope) |
| `/account/dashboard` · `/orders` · `/orders/:id` · `/orders/:id/payment` · `/profile` · `/change-password` · `/lists` · `/lists/:id` · `/saved-for-later` · `/saved-credit-cards` · `/coupons` · `/back-in-stock` · `/points-history` · `/missions` · `/notifications` · **`/quotes`, `/quotes/:id`** · `/quotes/:id/edit` | `requiresAuth` + module gates | render for both org and personal users — **`/account/quotes` re-confirmed live this pass for all three account shapes in §3f, including a personal (no-org) account** |
| **`/account/addresses`** | `beforeEnter`: bounce if `isCorporateMember` | org user → `/account/dashboard`; **personal user → link present, re-confirmed this pass** |
| `/account/purchase-requests` | `PurchaseRequests.Enabled` | **404** — module not enabled on vcst-qa |
| `/account/confirmemail` · `/account/impersonate/:userId` | `public: true` | source |

**Rev 3, guest contrast (live, Firefox, signed out):** the header carries no Organizations control; `/account/quotes` redirects to `/sign-in?returnUrl=/account/quotes` while the footer still lists "Quote requests" (CONFIRMED — gate is `requiresAuth`, the footer link is not gated). `/sign-in` now opens on an **OTP-first** form ("We'll email you a code. No password needed.") with a "Sign in with a password instead" link, then Entra ID / Google / Passkey buttons — a login-flow change the rev 2 map never recorded; any case that types a password must click the link first (CONFIRMED live as guest).

**No route in vc-frontend carries a permission or role in its `meta`.** Route-level authz is exactly
three flags (`public`, `requiresAuth`, `requiresOrganization`) plus `beforeEnter` closures. Every other
permission gate lives **inside a component**. **`/account/quotes` carries no `requiresOrganization`
flag — it is gated only by `requiresAuth`**, which is why it renders identically for every account shape
(§3f).

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

### 3d. The org switcher — REV 3: desktop moved to a header control; the mobile one is untouched

**Rev 3 (vc-frontend #2667, VCST-6237; deployed theme `2.63.0-pr-2667-0444-0444048a`).**

| | Desktop (new) | Mobile (unchanged) |
|---|---|---|
| Component | `organization-switcher.vue` (popover) + `organization-list.vue` (panel) | `mobile-menu/menus/multi-organisation-menu.vue` |
| Entry | button `data-test-id="organizations-button"`, **last item of the right icon group after Cart**, in `bottom-header`; accessible name `Organizations: <current org>`, visible caption "Organizations" | hamburger → **Corporate** → **"My organizations"** (`menu.json` id `contact-organizations`) |
| Rendered when | `isMultiOrganization` = `me.contact.organizations.totalCount > 1`; filtered out of `desktopMainMenuItems` otherwise | `isMultiOrganization`, filtered in `mobile-menu.vue` |
| Configurable | menu id `organizations`, **priority 110**, rendered through ExtensionPoint category `headerMenu` — a store can move or remove it by header-menu config | separate menu id — removing one does **not** remove the other |
| Panel | `role="dialog"` "Organizations" → `listbox` "Organizations" of `option` rows; current org first and selected; **locked rows disabled with a lock icon and a `title` tooltip**; search combobox "Search organizations" **only above 10 orgs** (`SEARCH_THRESHOLD = 10`); **30 per page** (`ORGANIZATIONS_PER_PAGE = 30`), infinite scroll; **re-fetched on every open** (`:key="openCount"`) | separate radio for the current org, then a `v-for` over the rest (rev 2); lock handling since VCST-5317 |
| Keyboard | Enter opens, arrows skip locked rows, **Escape closes and returns focus to the control**; Tab past the last option leaves the panel **open** (G19) | — |
| Counting rule | **Invited / Rejected / Deleted memberships are not counted** (one Approved + one Invited ⇒ no control); **locked Approved IS counted** (control shown, row disabled) | same gate |

`CONFIRMED`: source @0444048a2 for the structure (verified this pass: `top-header-organizations` absent, `organization-switcher.vue` / `organization-list.vue` present, `menu.json` entry, `bottom-header.vue` filter, thresholds); live (kb, 2026-11-23 vcst) for the button position/name, the panel roles, the 2-org panel with no search and the 11-org panel with search, locked row disabled, the counting rule, `/403` still showing the control (KB-3F1B8798), cross-tab reload (KB-47727A18), and search pinning the current org only when something matches (KB-9D6EEFF5 — a no-match phrase shows "No results found" and drops it, G18). `UNVERIFIED` by me this pass: everything authenticated (G23). The tooltip string is source-only (KB-BDC577C1).

**The account dropdown** (`account-button`, "Account menu") now holds the **user-name link + Logout** (+ "Back to operator" while impersonating) — no Organizations listbox (KB-3F1B8798, KB-A26A8ACC). Its button text is `<org> / <user>`, with the org label hidden below `xl`. Rev 2's "last child of `account-menu`" is gone with it.

**Behaviour that did not change and is not this PR's:** a switch after any membership write returns `400 invalid_grant ID2018`, signs the buyer out silently and stores the refused org as last-used (D25).

#### 3d-rev2 — the rev 2 text, kept because a case or ticket may cite it. **SUPERSEDED for the desktop column (D23).**


| | Desktop | Mobile |
|---|---|---|
| Component | ~~`top-header-organizations.vue`~~ (rev 3: file deleted) | `mobile-menu/menus/multi-organisation-menu.vue` |
| Entry | ~~Account-menu popover, last child of `account-menu`~~ (rev 3: header control) | hamburger → **Corporate** → **"My organizations"** (`menu.json`, id `contact-organizations`) |
| Declared on desktop? | — | **No** — the desktop `corporate` section has no `contact-organizations` child |
| Markup | `listbox` + `role="option"`, arrow-key roving focus, search combobox | separate non-`@change` radio for the current org, then a `v-for` over the rest |
| Current org | pinned first via `displayedOrganizations` | separate radio above the loop |

Search appears only above `SEARCH_THRESHOLD = 10`; page size 30; infinite scroll; 300 ms debounce.
Ordering is **not** plain lexicographic on the raw string under `sort: "name:asc"`.
**Mobile: `UNVERIFIED` at source-level detail** (gap G2) — but see §5 D7 and the VCST-5317 run, which
found it live with **zero lock handling**.

**Re-confirmed live this pass (desktop):** the switcher for the multi-org fixture (`MULTI_ORG_USER_EMAIL`)
lists exactly **11 organizations**, matching rev 1's "~11 orgs" estimate exactly — several are
deliberately named with quoting/escaping edge characters (`"Müller" % Schmidt GmbH`, `"Quoted" Double
Quotes`, `'Single' Single Quotes`, `50% Off Redwood Provisions`) — these are **test fixtures for string
escaping, not a product defect**; do not mistake the literal punctuation in an org's *name* for a
rendering bug (an early hypothesis this pass, corrected before it was recorded as a finding).

### 3e. Personal vs organization account — the axis nobody had mapped

| Surface | Org user | Personal user |
|---|---|---|
| Header account button | `<Org> / <User>` | **`<User>`** — no org prefix, no separator |
| Org switcher | present | **absent** |
| Sidebar **Corporate** section | present | **absent — the whole section** |
| `/company/info`, `/company/members` | render | **→ `/account/dashboard`** |
| **`/account/addresses`** | **→ `/account/dashboard`** | **link present** |
| **`/account/quotes`** | **renders — new row, this pass** | **renders identically — new row, this pass** |
| Header `Ship to:` | `Select address` | `Add new address` |
| Dashboard "Monthly spend report" | Budget $58,152 / Spent $530,152 | **byte-identical** |

> **Rev 3, §3e:** the "Org switcher | present | absent" row now reads *header Organizations control* (present only when ≥2 counted memberships — a one-org user, a personal user and an org user with one Approved + one Invited membership all get none, KB-A26A8ACC). The account-button row is unchanged on desktop at ≥`xl`; below it the org label is hidden.

**`VC-B2B-001` `CONFIRMED`, and it runs the direction people mis-read:** "Addresses" is hidden for
**ORGANIZATION** members and shown for **PERSONAL** accounts — corporate members manage addresses under
Company info. Enforced at **three** independent points (desktop `canShowUserItem`, mobile
`canShowItem`, the route's `beforeEnter`), so a hand-typed URL is closed too.

**Quotes is not on either gated list.** Unlike every other row in this table, `/account/quotes` and its
sidebar entry are **not** conditioned on `isCorporateMember` in any direction — confirmed by direct
observation on all three account shapes in §3f. This makes quotes the one B2B-flavoured feature in the
whole storefront that a personal shopper reaches exactly like an org buyer does.

**The full org-gated set:** `addresses` (hidden when corporate) · the whole `corporate` section ·
`contact-organizations` (mobile only, `isMultiOrganization`) · the org-name label and switcher · operator
name + "Back to operator" · and the non-nav gates: `Invite members`, the members Actions column,
company-info edit/logo/address controls, Orders "All orders / My orders" scope tabs, the orders
customer-name filter, ship-to "add new address", checkout select-address "add new", the address
favourite toggle, wishlist sharing.

**The Monthly-spend widget is NOT user-scoped** — byte-identical across two unrelated accounts, one with
zero orders. Static/mock content, and the only dashboard element that ignores the signed-in identity.

### 3f. Quote requests (storefront) — new this pass

`/account/quotes` — sidebar entry under the **Purchasing** group (not Corporate), footer link under
"Account details" on every page including signed-out. Page: heading "Quote requests" · **Request Quote**
button · search box ("Search by number or status", disabled until data loads) · table `Quote number ·
Date · Status · Total`. Row click opens `/account/quotes/:id` in a **new browser tab** (same pattern as
`VcTable` row-click elsewhere in the storefront — VC-UI-003 in `vc-bug-catalog.md`).

**Observed per account (2026-09-16, read-only — no quote was created or mutated):**

| Account | Org | Quotes visible | Statuses seen |
|---|---|---|---|
| `ORG_USER_EMAIL` (Emily Johnson, TechFlow maintainer) | AGENT-TEST-Org-TechFlow | **2** | Processing, Processing |
| `MULTI_ORG_USER_EMAIL` (John Doe), org = *Lone Star Outfitters* | 1 of 11 | **0** — "There are no quote requests yet" | — |
| same user, switched to *ACME Store* | 2 of 11 | **0** — "There are no quote requests yet" | — |
| `USER2_EMAIL` (carl2026 carol) — personal, no org | n/a | **0** — "There are no quote requests yet" | — |

**Quote detail (`RFQ260720-00001`, TechFlow/Emily, Processing)** — line items with product name, key
properties, unit price, a **disabled** quantity stepper (editable only pre-submission per the docs, D-row
not needed — matches `StorefrontUserGuide`), Subtotal; sidebar **Quote summary** (Subtotal/Discount/
Shipping/Tax/Total), **Quote data** (Created, Status), **Shipping address**. **No "Convert to Order"
control, no comment field, and no attachments widget were visible on this Processing-status quote** —
consistent with the docs (comments/attachments/address edits are attached to the pre-submission **Draft**
step; see D20 for the "Convert to Order" absence specifically).

**Cart-side entry ("Add cart items to quote")** — documented (`StorefrontUserGuide` §Submit Quotes) and
present in suite 015's `QUOTE-001` steps; **not independently re-clicked this pass** (would require
adding cart items and is adjacent to, not required by, the read-only quotes inventory) — carried as
`UNVERIFIED-live-this-pass`, `CONFIRMED` by docs + suite CSV.

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

**Rev 3 contract notes (schema run copy 2026-11-23, 130 queries / 154 mutations):** `Organization` now exposes `myStatusInOrganization` **and** `isLockedForCurrentUser`; `me.contact.organizations(after, first, searchPhrase, sort, statuses)` — with **no** `statuses` it already excludes Invited/Rejected/Deleted and counts locked Approved (KB-EB6191B8); `searchPhrase` goes through the Member search index (an unindexed org never matches, KB-AB719187) and matches case-insensitively by word prefix (KB-94364409). The panel's query is `GetOrganizations` with `first:30, sort:name:asc, statuses:[Approved]` (KB-9D6EEFF5). Query/mutation NAME lists below are rev 2's and were not diffed against the new 130/154 — `UNVERIFIED` for additions.

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

### 4e. Quotes (xAPI) — new this pass

**Queries:** `quote(id, storeId, userId, currencyCode, cultureName)` · `quotes(after, first, keyword,
sort, storeId, userId, currencyCode, cultureName, filter)` · `quoteAttachmentOptions()`.

**Cart-side mutations** (build a quote from an active cart): `createQuoteFromCart` · `addQuoteItems` ·
`changeQuoteItemQuantity` · `changeQuoteComment` · `removeQuoteItem`.

**Quote-side mutations** (act on an existing quote): `createQuote` · `submitQuoteRequest` ·
`approveQuoteRequest` · `declineQuoteRequest` · `cancelQuoteRequest` · `add/update/deleteQuoteAttachments` ·
`updateQuoteAddresses` · `updateQuoteDynamicProperties`.

**Naming — no `quoteRequest`/`quoteRequests` query exists.** The live schema (introspected 2026-09-16)
uses `quote`/`quotes` throughout; the **Quote** row of the GraphQL xAPI module table in
`.claude/knowledge/domain/sitemap.md` names `quoteRequest`/`quoteRequests` for this module and is
**stale** — see §8.

**Org scoping — none observed in the schema.** None of the query or mutation signatures above take an
`organizationId` argument; `quote`/`quotes` take `storeId`/`userId`/`currencyCode`/`cultureName` only.
If quotes are org-scoped at all, the scoping is implicit (through `userId` → the user's current org via
the ambient JWT context) rather than an explicit argument —
**`UNVERIFIED`**, this is exactly the gap G16 below names.

**No `approveQuoteRequest`/`declineQuoteRequest` maps to a control this pass observed live** — the
Processing-status quote inspected in §3f had neither an Approve nor a Decline affordance, which the docs
say only appears once a quote reaches **Proposal sent** (a status this pass's fixtures did not reach) —
consistent, not a finding on its own.

---

## §5 — Where the layers DISAGREE

The most valuable section. D1–D18 were found in the rev-1 pass; D19–D22 in rev 2 (quotes); **D23–D26 are new in rev 3 (org switcher)**. Rows are never deleted: a row a later pass overtook is annotated in the rev 3 status block below the table, not edited.

| # | Disagreement | Verdict |
|---|---|---|
| **D1** | **Status: raw vs mapped — and this one is DELIBERATE and DOCUMENTED.** Admin `Invite status` shows the **raw stored value** (+ an `Inherit from member` sentinel with no stored counterpart); the storefront badge shows a **mapped label**. `PlatformUserGuide` states it outright: *"The **Invite status** column shows the raw stored value (for example, **Approved**), not a Frontend-mapped label."* | `CONFIRMED` both sides live **+ `{DOC}` first-hand**. **Not a defect** — do not file it. It is the *reason* D2/D3/D11 are confusing, but the divergence itself is by design |
| **D2** | **Vocabulary sizes never line up.** Contact `Status` **6** · membership `Invite status` **5** · stored dictionary **4** · rendered labels **4** · Status **filter** only **3** (no `Inactive`) | `CONFIRMED` live, all counts |
| **D3** | **`Inactive` collapses two causes.** `Rejected` and `Deleted` are distinct stored values; both render `Inactive`, which has no filter and no stored value — **a declined member and a removed member are indistinguishable** | `CONFIRMED` |
| **D4** | **`EffectiveStatus = membership.Status ?? contact.Status ?? "Approved"`** — a *global* contact status overrides **every** org, and the contact-level `Status` column is **hidden by default** | formula **`CONFIRMED` by `{DOC}` first-hand** — `PlatformUserGuide` documents the 3-step resolution order verbatim, plus a ⚠ warning that an account-wide blocking status *"loses access to every organization they belong to"* — and at source; the hidden-column half is new |
| **D5** | **The lock axis is off by default where it is administered.** `Is Currently Locked`, `Locked state`, `Locked until` are all hidden-by-default columns; the blade's `Locked state` is read-only; no expiry at lock time. Meanwhile the flags are first-class GraphQL fields | new; severity softened — the Grid Menu **does** reveal them |
| **D6** | **Switcher gate ≠ switcher list.** The **gate** `isMultiOrganization` = `me.contact.organizations { totalCount }` with **no arguments** (counts *every* status); the **list** = `organizations(statuses:[Approved])`. One Approved org + any `Invited`/`New`/`Locked`/`Deleted` one satisfies `totalCount > 1`, so the switcher renders while the list may return a single row or an empty state | `CONFIRMED` at source; live `UNVERIFIED` (**gap G6**) |
| **D7** | **A locked org cannot be flagged in the switcher — structurally.** The list fragment `organizationFields.graphql` was literally `{ id name }` — no status, no lock field — and `statuses:[Approved]` excludes locked orgs anyway. Only post-click feedback existed | `CONFIRMED` at source. **Being changed by the unmerged VCST-5317 PRs** — see the amendment note below |
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
| **D19** | **The quote-status vocabulary disagrees FOUR ways, and none of the four match.** `StorefrontUserGuide` (§Quote Requests, §Submit Quotes): **Draft, Processing, Proposal sent, Ordered, Declined, On hold** (6, no `New`/`Cancelled`). `PlatformUserGuide` (§Manage Quotes): **Draft, New, Processing, Proposal sent, Ordered, Cancelled** (6 — different set: has `New`, lacks `Declined`/`On hold`, spells the terminal status **`Cancelled`**, double-L). `storefront-config-flags.md` runtime `quote_statuses[]`: **New, Processing, Ordered, Proposal sent, On hold, Draft, Declined, Canceled** (8 — has all of both docs' sets **plus** `On hold`+`Declined`, spelling **`Canceled`**, single-L). **The LIVE Admin status-switcher dropdown**, opened on a `Processing` quote 2026-09-16: **Processing, On hold, New, Declined, Proposal sent, Ordered** (6 — omits `Draft` and `Cancelled`/`Canceled` entirely as transition targets; the grid separately shows `Draft` as a real persisted status, and `Cancelled` is reached via the toolbar's **`Cancel document`** action, not this dropdown, so it is a status the UI treats as a one-way exit rather than a switchable value) | `{DOC}` both guides fetched first-hand 2026-09-16 + `CONFIRMED` live (grid + status dropdown) + `CONFIRMED` config file. **Four vocabularies, four different memberships, two different spellings of the same terminal status.** This is the single highest-value new finding this pass for anyone asserting on a quote-status string |
| **D20** | **No "Convert to Order" control exists on either surface**, contradicting the wording used elsewhere for this mechanism. Admin's Processing-quote toolbar is **Save · Reset · Submit proposal · Put on hold · Cancel document · Delete**; the storefront doc's only buyer-facing action once a proposal exists is **"approve or decline a quote request"** (`StorefrontUserGuide` §Approve or decline quote request), which the glossary confirms moves the quote through *Processing → Proposal sent → Ordered/Declined* as a status transition, not a literal "Convert to Order" button anywhere. **This does not contradict the underlying invariant** (a quote reaching `Ordered` does place an order) — it is a **surface-naming mismatch only**: `BL-B2B-003`'s prose names a "Convert to Order" action/button that this pass could not find on either the storefront or the Admin UI | `CONFIRMED` — surface search on both layers, plus two published-doc fetches, found no such control. **Do not edit the oracle from this map** — this is a proposal candidate for `/qa-review-oracles`, not an in-place fix |
| **D21** | **Sidebar module-route labels leak raw i18n keys for two of three account shapes tested, in the same session where the footer (same routes, same labels) renders correctly.** Signed in as `ORG_USER_EMAIL` (TechFlow), every sidebar label rendered as normal English text (`Quote requests`, `Back-in-stock list`, `Missions & challenges`, `Points history`, `Sales reps`). Signed in as `MULTI_ORG_USER_EMAIL` (11-org account) and separately as `USER2_EMAIL` (personal, no org), the **same five sidebar entries** rendered their raw i18n keys instead — `Quotes.navigation.route_name`, `Back_in_stock.navigation.route_name`, `Shared.account.navigation.links.missions_challenges`, `Loyalty.navigation.route_name`, `Sales_rep.navigation.link` — and the page `<title>` itself read `quotes.meta.title`. **The footer's "Quote requests" link, in the identical page load, rendered the correct label every time**, on every account. Reproduced across a hard navigation (`page.goto`), a 3-second wait, and a full page reload — not a transient render race. All five broken keys belong to the **module-contributed routes** `sitemap.md` describes as added via `router.addRoute()` at bootstrap (back-in-stock, loyalty, quotes, sales-rep) — every **core** route label (Dashboard, Orders, Lists, Saved for later, Coupons, Notifications, Profile, Company info/members) rendered correctly on every account | `CONFIRMED` live, reproduced on 2 of 3 independent accounts, persists across navigation and reload. **Root cause not established — see gap G17.** A plausible mechanism (unconfirmed): each `addRoute()` module ships its own i18n namespace, loaded lazily; something about the TechFlow account's session (or its being the *first* account signed into this browser context) left that namespace warm while the later two logins did not reload it — but a full `page.goto` should re-boot the SPA, so this hypothesis is not yet supported and needs a fresh, TechFlow-free browser context to test cleanly |
| **D22** | **Admin's "Customer's company" field reads "Not defined" for a quote from a confirmed org member.** `AGENT-TEST-QTE-ADMIN-RESPONSE`'s Customer field correctly resolves to `test-emily.johnson-20260310@test-agent.com` — a TechFlow org maintainer confirmed elsewhere in this map (§1 Actors, §3f) — but the adjacent **Customer's company** field on the same blade reads **"Not defined"**. Combined with §2g's observation that the Quotes list has no Organization/Company column at all, **the Admin surface for Quotes does not visibly carry organization context**, even for a requester who unambiguously belongs to one | `CONFIRMED` live for this one quote. **`UNVERIFIED`** whether this is a per-fixture data-population gap (this specific quote's `CustomerCompany`/`OrganizationId` field was never populated at creation) or the Quotes module's data model does not capture organization at all — see gap G16, which needs exactly this distinction to design a scoping test |

| **D23** | **Rev 2's own §3d is wrong now: the desktop switcher left the account menu.** Rev 2 named `top-header-organizations.vue` as the desktop component and the account-menu popover as its entry; at `0444048a2` that file is gone and the entry is the header `organizations-button`. Cases, tickets and `033`/`006` rows written against "open account menu → Organizations" point at a control that no longer exists on this build. The **published guide's location of the control was NOT re-fetched** (VirtoOZ unavailable; Context7 returned no user-guide page) — whether the guide still sends the reader to the account menu is `UNVERIFIED` and is the question to ask first | `CONFIRMED` source + live (KB-3F1B8798, KB-A26A8ACC). **DRIFT of prior art (this map).** Docs half `UNVERIFIED` — gap G24 |
| **D24** | **D6 narrowed — the gate and the list now disagree in exactly ONE way.** The unfiltered `totalCount` the gate reads already drops Invited/Rejected/Deleted (and counts a null status as Approved), so the "Approved + Invited ⇒ control with a short list" state rev 2 predicted cannot occur on this build: it gives **no control**. The surviving divergence is a **locked Approved** membership: counted by the gate, **returned and disabled** by the list. The 2026-11-23 run observed, per state, totalCount: Invited 1 · Rejected 1 · Deleted 1 · Approved+locked 2 | `CONFIRMED` live (KB-EB6191B8, 3 confirmations). D6's "live `UNVERIFIED`" and G6's fixture ask are answered |
| **D25** | **A membership write ends the buyer's sessions, the storefront treats the resulting error as a success, and no document says either.** Lock/unlock/remove on a signed-in buyer revokes the refresh tokens minted before it; the switch call (`refresh_token` + `organization_id`) then returns `400 invalid_grant ID2018` with **no `errors[]` and no lockout code** — for the locked org **and** for an unlocked one. `useUser.switchOrganization` checks only `authErrors.length`, so the code-less body counts as success: it writes `organization-id-<user>` = the refused org and reloads, landing as a guest with no message. The next sign-in lands in that org once it is accessible; while it is locked the password grant falls back to another org. Pre-existing (base 2.63.0 has the same code), not introduced by #2667 | `CONFIRMED` live + source (A9 root cause, KB-3CBA0D5F). Docs: the root-cause worksheet records that "Manage Organization Membership Status" does not mention session revocation — **not re-fetched by me**, so the doc-silence half is carried, not re-verified. Open bug: `reports/bugs/open/critical-high/BUG-stale-org-switcher-locked-row-stays-enabled-and-signs-out-all-tabs-VCST-5317.md`. Product question (should a write end all sessions?) is G22 |
| **D26** | **Desktop and mobile switchers are still two components with two menu ids, and they no longer share an entry model.** Desktop: header control, menu id `organizations`. Mobile: Corporate → "My organizations", menu id `contact-organizations`, inside a section that exists only for org users. A store can remove one without the other. 375 px (VCST-6237 exploratory, not re-observed by me): the phone list reflects a switch made in another tab, switching from it reloads both tabs, the radio `<input>` is covered by its row (tap the label), and the current org name wraps while the other is ellipsised at equal length | source `CONFIRMED`; live per `exploratory/SBTM-VCST-6237-2026-11-23.md` — `UNVERIFIED` in this pass's own session |

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
>
> **2026-09-16 note:** this pass's storefront build was `2.58.0-pr-2467-8f0b-8f0bff22` — a **different**
> PR number (`2467`, not `2469`) from the one D7/D8's amendment describes. Whether `2469` has since
> merged, been superseded by `2467`, or the two are unrelated PRs both deployed to this env was **not
> established this pass** — flag for whoever next touches D7/D8 to re-derive the PR state before trusting
> the "still stands" line above.

> **Rev 3 status of the rows the switcher change overtook (annotations, no wording changed above).**
> **D6** → narrowed, see **D24** (gate ≠ list now only for a locked Approved membership). **D7** → the *structural* claim is
> CLOSED on this build (locked rows are returned and disabled; the panel refetches per open); the unmerged-PR note
> above is historical — #2467/#2469 were not re-derived; the shipped vehicle is vc-frontend **#2667** (deployed theme
> `2.63.0-pr-2667-…`), so the 2026-09-16 "which PR" question is moot for the desktop control. The locked org's
> order-history read (`organizationOrders`, VCST-5933) was **not re-measured** — still `UNVERIFIED`. **D8** → unchanged in
> mechanism and now demonstrable from the other side: the pinned org is written by a *failed* switch (D25).
> **D16** → its quoted sentence ("Select a different company from this list") was not re-fetched; whether the guide's "list"
> is the account menu or the header control is the open half of **D23**.

---

## §6 — Coverage shape

### 6-rev3 — recount, 2026-11-23 (parsed from the suite CSVs and `config/test-suites.json`; basis stated per row)

Suite sizes below are **`testCount` in the manifest and agree with the parsed CSV row count** (checked for the parsed rows). "Org-relevant" subsets (rev 2's 585 / 555) were **not re-derived** — a per-row org-relevance read of 35 suites is not a breadth-first task — so for the partial suites only the size is given. **Do not add these up into a new "org-relevant" total.**

| Suite | Cases | Automation_Status (parsed) | Δ vs rev 2 |
|---|---|---|---|
| **006** B2B Organization | **71** | Automated 25 · Draft 41 · Reviewed 4 · Manual 1 | 65 → 71; "0 Automated" → 25. Sections: Switcher Lock Axis 24 (+1 journey) · Header Switcher 5 · Organization 38 · other 3 |
| 008 B2B Members | 40 | Automated 9 · Draft 19 · Deprecated 6 · Semi-Automated 4 · Reviewed 2 | unchanged size |
| **015** Quotes | 32 | Draft 27 · **Automated 5** | still all `ORG_USER_DEFAULT`; "all Draft" no longer true |
| 026 Customer Contacts | **74** | blank 50 · Automated 17 · Draft 4 · ready 3 | 53 → 74 |
| 027 Customer Orgs & Invites | 71 | Draft 32 · blank 20 · Reviewed 13 · Automated 6 | unchanged size |
| 027b Org-Scoped Roles | **20** | Draft 14 · Semi-Automated 5 · Automated 1 | 18 → 20 |
| 074 Contracts | 18 | blank 18 | unchanged — no case has a status |
| 082 Impersonation | 48 | Automated 30 · Reviewed 7 · Draft 6 · Manual 5 | unchanged size |
| 011b B2B Company E2E | **30** | Draft 22 · Automated 8 | 26 → 30 |
| 010 Bulk Ship Dashboard | 53 | Draft 39 · Automated 6 · Manual 5 · Deprecated 3 | unchanged size |
| 013 Checkout B2B | 7 | Manual 6 · Reviewed 1 | unchanged |
| 031 / 032 / 033 Auth | 37 / 20 / 23 | 031: Automated 20 · Manual 11 · Draft 6; 032: Automated 4 · Semi 5 · Draft 6 · Manual 3 · Reviewed 2; 033: Automated 11 · Manual 6 · Draft 6 | 033 was cited as "9 of 15" org-relevant; suite is now 23 |
| 050d xProfile | 60 | not parsed | 58 → 60 |
| 007 / 021 / 017 / 050h / 081 / 011 / 042 / 009 | 77 / 39 / 50 / 49 / 29 / 71 / 34 / 31 | not parsed | sizes only |

**Suites changed in the last week** (`git log --since=2026-11-16 -- regression/suites`, b2b-relevant only): **006** (2 commits, VCST-6237), 007, **008** (2), 009, 011b, **027**, 031, 032 (2), 033 (2), 042, 071, **082** (2), 104 (4), 111. Others in that log (compare, site-builder, OTP API, telemetry…) are other domains. **Selection `b2b` is now 25 suites**, not 10 (§0 row 7).

**Rev 2's "centre of mass is Draft, ~200 cases never executed" is stale for 006, 015 and 082 and unchanged for 074** (18 of 18 still blank) and 026 (54 of 74 blank or Draft). The rev 2 text below is kept as the diff baseline; where it conflicts with this block, this block wins.

### Rev 2 coverage text (2026-09-16 counts — baseline, partly superseded)

**Sales Rep is deliberately excluded** from this pass — the whole of selection group **`sales-rep`** in
`config/test-suites.json` (`050m`, `050m2`, `089`, `090`, `091`, `092`, `092b`, `093`, `097`), now
covered by `.claude/knowledge/domain/sales-rep.md`. **For how many cases that is, run
`npm run suites:lint`** — the number is not transcribed here, because a count copied out of the manifest
is correct exactly once. (Rev 2 as published listed eight of these nine, omitting `092` *Sales Rep —
Admin / VC-Shell App*, and carried a transcribed case total that had already rotted. Resolve the group
from the manifest, never from this sentence.)

**585 org-relevant cases across 35 suites** (555 excluding the all-`Manual` whitelabeling block), plus
~20 scattered across ~18 more suites at 1–5 each. Counts are *org-relevant cases*, not suite size.
Counts below are carried from rev 1 except suite **015**, re-verified this pass.

| Suite | Org-relevant | Suite | Org-relevant |
|---|---|---|---|
| 006 B2B Organization | **65** of 65 | 026 Customer Contacts | **53** of 53 |
| 008 B2B Members | **40** of 40 | 050d GraphQL xProfile | **38** of 58 |
| 027 Customer Orgs & Invites | **71** of 71 | 010 Bulk Ship Dashboard | 26 of 53 |
| 027b Org-Scoped Roles | **18** of 18 | 011b B2B Company E2E | **26** of 26 |
| 082 Impersonation | **48** of 48 | **015 Quotes** | **32 of 32 — re-verified 2026-09-16: ALL 32 rows are `Draft` Automation_Status, and ALL 32 carry the identical `[PRE:SIGNIN_AS:ORG_USER_DEFAULT]` precondition (confirmed by grep across the full 116-line file) — a single fixture, a single account, zero cross-org or cross-account rows** |
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
| **Quote visibility scoped to the org** | **0** | `015` has 32 cases, **all `Draft`**, all `ORG_USER_DEFAULT`-only (re-confirmed this pass). No "member A's quote visible to maintainer B", no cross-org denial. **The blocker is now concrete, not just named** — see gap G16: a live org-switch probe this pass (same user, two orgs) came back empty on both sides, which does not by itself prove or disprove scoping; the fixture needed is a user with a quote seeded under Org A and none under Org B |
| **Admin org-context on a quote** | **0** | new this pass — the Admin Quotes blade shows no Organization column and "Customer's company: Not defined" on a confirmed org member's quote (D22); no case anywhere probes whether the Quotes module captures organization at all |
| **The D9 role-picker asymmetry** | **0** | `027b`'s 18 cases test the org-level picker + server enforcement; none diffs invite-roles against membership-roles |
| **`AssociatedOrganizationsOnlyScope`** | **0** | a scoped-RBAC permission scope (`'Only for associated organizations'`, hardcoded English), no coverage anywhere |
| **Org-scoped member Import / Export** | **0** | a write path, org-scoped by the drill-down org |
| **Admin-vs-storefront status/label parity** | **2** | D1/D2/D11 all sit in this hole |
| **Quote-status vocabulary parity (D19)** | **0** | no case anywhere asserts a quote-status string against more than one of the four vocabularies in D19; a case authored against the storefront doc's 6 and a case authored against the config's 8 would both look "correct" in isolation |
| **Header Organizations panel: keyboard focus-out (Tab past the last option, panel stays open)** | **0** | new rev 3 — exploratory F1 proposes a 006 keyboard row once the product owner rules (G19) |
| **Pinned-current-org when search matches nothing** | **0** | new rev 3 — G18 |
| **Session end on membership write → switch** | **1 bug report, 0 cases for the unlocked-target control run** | new rev 3 — D25 |
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

- **`selections.b2b` = `{where:{tag:"b2b"}, exclude:[121,122]}` → 25 suites in rev 3 (rev 2 said 10: `006,007,008,009,010,011b,013,015,042,074`).** The additions are Sales-Rep (`050m,050m2,050m3,089,090,091,091c,092b,093,093b,097,112,116`), UCP `102` and `050o`. **DRIFT — the group now includes the domain this map excludes.**
  `/qa-regression b2b` tests **none** of the Admin (`026`, `027`, `027b`), GraphQL (`050d`, `050h`),
  auth (`031`–`033`) or impersonation (`082`) coverage — and **does** run `009`, which has none.
- **`envRiskGate: "staging"`** on `013, 015, 026, 027, 027b, 074` — the whole Admin/quotes/contracts
  half will not run below that tier.
- **`requiresModules`** — `026/027/027b` need `customer`, `074` needs `contracts`; absent ⇒ silent skip.
- **Firefox lane:** `defaults.firefoxClickOk` is currently **`true`** in the manifest (rev 3, recomputed); with `false` (the documented rollback), 15 of the 18 core
  suites are `clickDriven` and get denied the slot. Since 2026-09-21 `026` is `clickDriven` too
  (it gained the VCST-5547 condition-tree cases), so that rollback would leave only `074` eligible.
- **The feature's centre of mass is Draft.** `006` (65, 0 Automated), `015` (32, 0 Automated, all one
  fixture — re-confirmed this pass) and 71 blank-status legacy cases in `026`+`074` ⇒ roughly **200
  cases have never been executed or promoted**. Executable coverage is concentrated in
  `007/031/033/042/050d/082`.
- `007` holds **16 Sales-Rep-subject cases** (`B2C-LIST-040`…`055`) **not** excluded from `full` the way
  the dedicated rep suites of selection group `sales-rep` are.

---

## §7 — Open gaps

| # | Gap | State |
|---|---|---|
| **G1** | Org-maintainer vs org-employee visibility (`BL-B2B-005`) **live** | **FIXTURE HALF CLOSED 2026-09-11; live observation still OPEN.** The blocker was addressability, not existence: `ACME_VIEWER` (USR-003, `Organization employee`) and `ACME_ADMIN` (USR-001, `Organization maintainer`) are both seeded in **ORG-001 AcmeCorp**, both resolve via `test-data/aliases.json`, and both carry runtime ids in `aliases.vcst.json` — so `[PRE:SIGNIN_AS:ACME_VIEWER]` works today. `ACME_VIEWER` had **zero consumers** when found. The original note is correct that `ORG_USER_EMAIL` is another maintainer (USR-006, TechFlow) and that USR-020/021 are reserved impersonation accounts; it wrongly generalised from those to "no usable employee fixture". What remains open is the **live observation** — `BL-B2B-005` is still source-only until a run signs in as `ACME_VIEWER` and records the roster. |
| **G2** | Mobile switcher at source-level detail | **PARTLY CLOSED** by the VCST-5317 run (found live, no lock handling); component internals still source-only |
| **G3** | `Blocked` status badge, live | **OPEN.** No locked membership among readable fixtures |
| **G6** | **D6 (gate ≠ list), live** | **OPEN.** The 12-org fixture has 12 *Approved* orgs. Needs 1 Approved + ≥1 Invited/Locked |
| **G7** | Per-store whitelist override read path | **ANSWERED 2026-09-18** (measured live on vcst + read from source; seeder `scripts/seed-data/b2b/set-membership-roles-whitelist.mjs`, mechanism in `membership-roles-whitelist-specs.mjs`). The v1 path 404s because store-scoped values are a **v2 tenant** resource: `GET /api/platform/settings/v2/tenant/Store/{storeId}/values` returns a **flat `{ settingName: value }`** map (106 keys for `B2B-store`), where a dictionary setting's value is the **array of SELECTED entries**. `POST` to the same path is a **partial MERGE** — only supplied keys move (measured: a single-key POST left all 106 intact) — and it does **NOT** validate against the pool (an out-of-pool role name was accepted and persisted). The **POOL** is a separate resource: `GET /api/platform/settings/v2/tenant/Store/schema` → `allowedValues`, which for `Customer.MembershipRolesWhitelist` is the hardcoded C# literal in `vc-module-customer` `ModuleConstants.cs`, not per-store state. **Field-name inversion — the likeliest way to write the wrong field:** legacy v1 `GET /api/platform/settings` reports the SELECTED set in `allowedValues` (which is what BL-B2B-011 records); v2 reports it as the `value`. Same underlying data, opposite field names. **And EMPTY differs at store scope:** `rolesPickerService.js` applies the store override only `if (storeValues.length)`, so an empty store value SKIPS the override and falls back to the **global** whitelist — two hops, not "all roles". Clearing a store key to empty is a third behavioural state, not a neutral reset. |
| **G8** | Contract ↔ organization assignment; org price lists | **PARTLY CLOSED** — no contract/pricing widget on the Company blade. Assignment from the Contracts module's own blades still OPEN |
| **G9** | `White labeling` / `Assets` / `Icon` org-widget contents | **OPEN** — enumerated, not opened |
| **G11** | Which module registers **Orders** + **White labeling** onto the Company blade | **OPEN.** The literal-string search was a **false negative** against live |
| **G12** | How many live contacts hold **>1 security account** | **OPEN.** `securityAccounts[0]` mechanism established, blast radius unsized |
| **G13** | Is a per-org role change effective **immediately** or **at next sign-in**? | **CLOSED by docs, 2026-09-09 — and the earlier "the docs contradict each other" claim was WRONG.** Both guides, fetched first-hand, agree on **next sign-in**: `StorefrontUserGuide` §Edit user roles — *"A role change takes effect the next time the member signs in."*; `PlatformUserGuide` §Assign organization-level role — *"Employees must sign in again. Effective permissions are recalculated at sign-in. An employee with an open Frontend session keeps their previous permissions until they sign out and back in. **The change is applied on the server immediately, so only the active session is stale.**"* That last clause is the reconciliation: **server-immediate, session-stale**. Still `UNVERIFIED` **live** — confirming it needs a mutation |
| **G14** | The `ConfirmInvitation` route's URL path | **OPEN.** The route *name* is used to build the invite `urlSuffix`; the path string is unknown |
| **G15** | Canonical role → permission mapping for the shipped org roles | **ANSWERED FROM SOURCE 2026-09-11 for the STOREFRONT axis; live confirmation still owed.** The docs are still silent, but the product is not. **`vc-frontend` reads exactly four permission strings** — `xapi:my_organization:edit`, `xapi:my_organization:user:invite`, `xapi:my_organization:order:view` (`client-app/core/enums/permissions.enum.ts`) and `platform:security:loginOnBehalf` — and **no `storefront:*` namespace appears anywhere in it**. The `storefront:*` names are real but belong to the **legacy** `vc-storefront` (`VirtoCommerce.Storefront.Model/Security/SecurityConstants.cs`), which also defines the `org-maintainer`/`purchasing-agent`/`org-employee` role ids our fixtures mirror. `vc-frontend` knows those same ids (`client-app/core/constants/security.ts`) but uses them ONLY to populate the member Change-role dropdown, gated by the `Customer.MembershipRolesWhitelist` setting — **never for authorization**. Server-side the same xapi string is enforced by `CheckAuthAsync` in `vc-module-profile-experience-api` `ProfileSchema.cs`. Three consequences: *Invite members* (`…user:invite`) and the per-row Actions menu (`…edit` OR `loginOnBehalf`) are **different gates on one page**; `useUser.checkPermissions()` **short-circuits true for `isAdministrator`**; and `org-employee` / `purchasing-agent` are indistinguishable to the SPA because **neither holds any string it reads**, not because they share one. **And the role→permission mapping is NOT a product contract at all**: no platform module seeds `org-maintainer`/`purchasing-agent`/`org-employee` (an org-wide `roleManager.CreateAsync` search finds only sales-rep + marketplace modules), `storefront:*` is never `RegisterPermissions`-ed by any module, and the two first-party seeds **disagree** — `vc-sample-data/Setup/adminOnlySample/PlatformEntries.json` gives `org-employee` only `storefront:organization:view` where `vc-storefront`'s `SecurityConstants.cs` gives it that plus `storefront:user:view`. `Customer.MembershipRolesWhitelist` ships the three NAMES as an allow-list; names are not grants. `FrontendSecurity:OrganizationMaintainerRole` is a name the platform LOOKS UP, failing registration with *"Create and configure a role with the name…"* when absent. What IS product invariant: effective roles = `Organization.Roles` ∪ `OrganizationMembership.Roles` (`MergeRoles`, `DistinctBy(RoleId)`) ∪ global account roles (`GlobalRolesResolver`), folded into the token **additively** by `OrganizationIdClaimProvider` (`existingPermissions.Add` — an org switch never drops a global grant), carried as repeated `permission` claims scoped by `organization_id`, recalculated only at sign-in, and zeroed for the org-scoped terms by a blocking membership status or lockout. What remains open: the ADMIN/platform axis, and a live `me.permissions` observation per role. |
| **G16** | **Is a quote actually scoped to the organization, or purely to the requesting user?** | **NEW, OPEN.** Neither the xAPI `quote`/`quotes` signature (§4e) nor the Admin blade (§2g, D22) exposes an explicit organization argument or column. A live probe this pass — same multi-org user, switched between two of their 11 orgs, `/account/quotes` checked on each — came back **empty on both sides**, which is **inconclusive**, not a negative result: this user simply has no quotes seeded under either org. **Needs a fixture**: one user with a quote created while signed into Org A, then the same user switched to Org B, to see whether the quote (a) still shows (user-scoped), (b) disappears (org-scoped via ambient `userId`+current-org context), or (c) the org context has no effect on quote visibility at all. This is the concrete blocker `/qa-review-tests` / suite 015 authoring needs before "org-scoped quote" cases can be written at all — rev 1 named the coverage hole; this closes it into an actionable fixture requirement |
| **G17** | **Root cause of the sidebar i18n key leak (D21)** | **NEW, OPEN.** Reproduced on 2 of 3 accounts this pass, with the footer correctly resolving the same labels in the same page load. Candidate explanations not yet tested: (a) locale/culture differs per account (not observed — all three showed `Language: English (United States) en` in the header); (b) the module i18n namespace loads once per browser/tab and the first account signed in (TechFlow) "won" it, with later logins in the same tab never re-fetching it despite a hard `page.goto` — needs a completely fresh browser context (not just a logout+re-login in the same tab) to rule in or out; (c) something about the account/org data itself (e.g. a missing preferred-locale field) causes the SPA's i18n loader to silently fail only for those two accounts. **Needs**: a fresh Firefox/Edge profile, sign in directly as `MULTI_ORG_USER_EMAIL` with no prior session in that browser, and check whether the sidebar labels are correct or broken on the very first render |

| **G18** | **Product-owner question: when a search phrase matches nothing, should the panel keep the current organization pinned?** | **NEW, OPEN.** Live: a phrase matching other orgs keeps the current org first (selected, not a description match); a phrase matching nothing shows "No results found" and **drops** it (KB-9D6EEFF5). Needs the owner's ruling; then a 006 row either way |
| **G19** | **Product-owner question: should the panel close when keyboard focus leaves it?** | **NEW, OPEN.** Tab past the last option leaves it expanded over the main nav; Escape still closes (exploratory F1, Low a11y; AC-6/7 wording unchecked). Also: options keep tabindex 0 (no roving tabindex) and opening focuses the dialog, not the selected row (design report, advisory) |
| **G20** | **Product-owner question: classic Paprika lost its cream** | **NEW, OPEN.** Classic widgets resolve to additional-50 white and menu rows to transparent for every design; the cream remains only in soft. Matches AC-10 / the PR comment, so it is a ruling, not a defect (design-report.md §Paprika) |
| **G21** | **Soft design look cannot be judged — no design link on the ticket** | **NEW, OPEN.** `vs. DESIGN` SKIPPED; soft sm/xs widgets render at 28 px radius since the PR dropped the short-plate rule — intended? Needs the design link, not a fixture |
| **G22** | **Is ending every session on a membership write intended, and should the storefront say so?** | **NEW, OPEN.** Trigger is server-side and reads as deliberate (7 confirmations, KB-3CBA0D5F); the guide does not document it (carried, not re-fetched); the storefront's silent guest reload and wrong last-used org is the defect half (D25, Medium/P3 in the A9 worksheet; fix target `useUser.switchOrganization` in vc-frontend). Needs: a Customer-module owner's statement of intent + a docs page |
| **G23** | **Authenticated live walk not repeated on rev 3; Admin / quotes / REST not re-enumerated** | **NEW, OPEN.** The `playwright-firefox` lane was not started by the credential launcher (hook-blocked) and the store has no login for `MULTI_ORG_TF_BR_ALT`. Needs: reconnect the lane after `npm run creds:migrate`, then walk `MULTI_ORG_USER` (11 orgs), `ORG_USER`, `USER2` and the impersonation 11-org account, and re-read §2/§3f/§4. Capabilities confirmable only by mutating (lock a membership, create an Invited one) stay UNVERIFIED without a fixture |
| **G24** | **Docs: where does the published guide put the switcher now, and does it say anything about a membership write ending sessions?** | **NEW, OPEN.** VirtoOZ was unavailable and the Context7 fallback returned no user-guide page, so nothing was quoted. Needs a VirtoOZ `StorefrontUserGuide` + `PlatformUserGuide` query (§Switch between your companies; §Manage Organization Membership Status) — a mismatch becomes a D* row |
| **G25** | **White-labeling records outlive their organization and cannot be deleted over REST; the Paprika preset is not in `WhiteLabeling.ThemePresetNames`** | **NEW, OPEN, fixture hygiene.** `DELETE /api/white-labeling*` → 405; the record survives `DELETE /api/members` of its org (KB-52D2F554). Teardown of a branded fixture org leaves orphans; a Paprika-preset org cannot be created from the dictionary. Overlaps G9/G11 |

**Rev 3 state of older rows (ids not reworded).** **G6** — **CLOSED by D24**: the "1 Approved + ≥1 Invited" fixture was built and measured; it yields *no* control, not a control with a short list (KB-EB6191B8). The locked half of G6 (Approved + locked) is observed: control shown, row disabled. **G3** (Blocked badge live) — unchanged, OPEN (a roster surface, not re-walked). **G2** — PARTLY CLOSED further: mobile source is read (D26) but its internals are not diffed this pass. **G17** — a candidate root cause now exists in the kb, not verified by me: KB-80095B02 (raw i18n keys appear on a hard load when the page chunk is served from browser cache while the quotes module locale chunk still needs a network revalidation) — it fits D21 better than the three hypotheses in the row; confirm with a cold-cache load. **G16** — unchanged, not re-probed. **G1, G7–G15** — unchanged.

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
| **`sitemap.md`, the GraphQL xAPI module table's Quote row** — the xAPI "Quote" module exposes `quoteRequest`/`quoteRequests` | **DRIFT, found this pass.** Live introspection (2026-09-16) and `graphql-schema.md` (refreshed the same day) both show `quote`/`quotes` — no `quoteRequest*` name exists in the schema. `sitemap.md` is the stale document here, not `graphql-schema.md`; the two names likely diverged when the storefront-facing terminology ("quote **request**") was chosen independently of the GraphQL type name ("Quote") |
| **This map, rev 2 §3d** — desktop switcher is `top-header-organizations.vue` in the account menu | **DRIFT (rev 3, D23)** — superseded by `organization-switcher.vue` as a header control |
| **This map, rev 2 §6a/§6c/§0b** — 006 "65 cases, all Draft, never run"; 015 "all 32 Draft"; `selections.b2b` = 10 suites | **DRIFT (rev 3, §0 rows 5–7)** — 71 / 25 Automated; 27 Draft + 5 Automated; 25 suites |
| **`BL-B2B-001` / `BL-AUTH-013` wording** (switch re-scopes the session; locked-org sign-in behaviour) | **Candidate drift, routed to `/qa-review-oracles bl` — never edited here.** (a) A switch after a membership write does not re-scope: it ends the session (D25). (b) Anything BL-AUTH-013 says about locked-org sign-in must be read against KB-3CBA0D5F (password/otp fall back to a remaining org; single-org locked ⇒ 200 with no org claim, not 400). Neither oracle was re-read line by line this pass — the claim rests on the kb and the exploratory oracle-feedback table |

Settled from the prior-art open list: **G2.1** (no domain file for this area) `CONFIRMED` — **closed by
this file**; **G2.3** (no `/company/*` inventory) **closed** by §3a; **G1.5** (all-locked: hidden or empty
state?) **resolved** in favour of the empty state (`organizations-empty-list`).

---

## §9 — Amendments

*An amendment sets `amended:` and never `generated:` or `rev:` — staleness must keep measuring the last
full **enumeration**, so a trickle of true corrections can never silence `npm run domain:check`. A
refresh folds these rows forward and never drops them. No `D*`/`G*` id is renumbered, reworded or
removed by an amendment: those ids are a citation contract other tickets and cases point at.*

### A1 (2026-09-18) — three corrections, no re-enumeration

Routed from `/qa-domain-map sr --refresh`. **Body-only, no live pass, no new claims** — three statements
that were already wrong at rev 2 were corrected, and every cross-map line-number citation was
re-anchored. Nothing was observed or re-derived beyond the two files named below.

| # | What was wrong | Fixed to |
|---|---|---|
| 1 | `excludes:` pinned the sibling map at "rev 2" | Cites `.claude/knowledge/domain/sales-rep.md` **by path only**. A rev pinned in prose goes stale on every refresh of the sibling — the shape was the defect, not just the number |
| 2 | §6 excluded "8 suites, ~387 cases" and omitted **`092`** (*Sales Rep — Admin / VC-Shell App*) | Names selection group **`sales-rep`** and lists all nine ids; the case total is no longer transcribed, because `config/test-suites.json` + `npm run suites:lint` derive it. §6c's "the eight dedicated rep suites" — the same undercount, restated — was corrected with it |
| 3 | Four citations of `sitemap.md` by **line number** (`:387-389`, `:389` ×3, in `sources:`, §0, §4e and §8) | Re-anchored to *the **Quote** row of the GraphQL xAPI module table* (heading "9. GraphQL xAPI Endpoints"). Each was verified to resolve before being written |

**Why #3 is a class, not a typo.** `sales-rep.md` rev 2 cited *this* file at lines 69, 78, 213, 415 and
502; this file moved, and by 2026-09-18 all five pointed at unrelated content (78 → a heading, 213 → a
bare table separator, 415 → a blank line). `npm run context:check` cannot catch it: `DOC-003`/`DOC-003E`
ratchet dangling **paths**, and a line offset is not a path — so the citation stays green while being
false, which is the direction that costs a reader rather than an author. `sales-rep.md` rev 3 re-anchored
its side to `§` sections; this is the same repair in the other direction. **Cite a sibling map, a report
or a source file by section, heading or stable id (`D15`, `G16`, `BL-*`, a case id) — never by line.**

### Rev 3 fold-in (2026-11-23)

A1 above is carried unchanged. Its three corrections were already in the rev 2 body that rev 3 inherits; A1's `sitemap.md` **Quote** row verdict (§8) still stands and was **not** re-checked. `amended:` keeps `2026-09-18` because no amendment has happened since; `generated`/`rev` moved because this is a refresh.

**Not changed, and why.** Every other `rev 1` / `rev 2` reference in this file points at *this map's own*
prior revisions (`sources:`, §0, §1, §2, §6), which is a historical record of what this file used to say,
not a pointer at a sibling that can move — those stay. `sitemap.md`'s own stale **Quote** row is
`sitemap.md`'s to fix and is left standing as the §8 `DRIFT` verdict that flags it.
