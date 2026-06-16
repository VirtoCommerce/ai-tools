# VCST-5028 — Frontend Execution Report (Per-Organization Roles & Access Control)

**Env:** vcst-qa @ vc-frontend 2.51.0-pr-2315-c85b-c85ba57c (PR#2315) | Platform 3.1037.0 | ProfileXAPI PR#135
**Browser:** playwright-chrome (1920×1080) | **Date:** 2026-06-15
**Fixture:** `@td(MULTI_ORG_TF_BR)` agent-test-multiorg-20260615@yopmail.com — TechFlow=org-maintainer, BuildRight=org-employee
**JWT capture method:** real-user login → org-switch → bearer read from the `Authorization` header of an app-issued `/graphql` request, decoded offline (no UI bypass).

## Verdicts

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1-F-01 — TechFlow JWT = org-maintainer scope; Members page accessible | **PASS** | JWT below; `/company/members` loads for maintainer |
| AC1-F-02 — BuildRight JWT = org-employee scope; maintainer perms absent | **PASS** | JWT below; sets differ (oracle held) |
| EDGE-F-01 — no priv-escalation leak after maintainer→employee switch | **PASS** | BuildRight token has only 2 perms; row read-only as employee |
| AC2-F-01 — maintainer changes a TechFlow member's role | **FAIL (blocked by BUG-1)** | No role-edit control rendered for maintainer |
| AC2-F-03 — role change does not bleed to other org | **BLOCKED** | Depends on AC2-F-01 (could not perform a change) |
| AC3-F-01 — locked org rejects login; other org still works (org-scoped) | **PASS** | BuildRight login rejected; TechFlow login succeeds — see AC3 section |
| AC3-F-02 — org-specific lockout copy (not generic global) | **PASS** | Exact copy below; `/connect/token` code `user_is_locked_in_organization` |

## AC1 oracle — decoded permission sets (the two differ → isolation holds, BL-B2B-001)

Both tokens: same `sub` 631063d0-… , same `memberId` 57389d49-… , `role":"__customer"`. Only `organization_id` + `permission[]` change.

**TechFlow** (`organization_id: 6fb516c1-…`) — **8 perms (org-maintainer):**
`storefront:user:view`, `storefront:user:create`, `storefront:user:delete`, `storefront:user:edit`, `storefront:user:invite`, `storefront:organization:edit`, `storefront:user:organization:view`, `xapi:my_organization:edit`

**BuildRight** (`organization_id: fba51391-…`) — **2 perms (org-employee):**
`storefront:organization:view`, `storefront:user:view`

**Diff (present in TechFlow, ABSENT in BuildRight):** `user:create`, `user:delete`, `user:edit`, `user:invite`, `organization:edit`, `user:organization:view`, `xapi:my_organization:edit` — all management perms correctly stripped. EDGE-F-01: confirmed no leak; as BuildRight employee, clicking a member row opens no edit surface (read-only). BL refs verified: BL-B2B-001 (isolation), BL-AUTH-005/006 (per-role scope).

## BUG-1 (High) — Org-maintainer cannot manage members on storefront: `pageContext.user.permissions` returns `[]` despite correct JWT/role

**Summary:** Logged in as TechFlow **org-maintainer**, `/company/members` shows **no "Invite members" button** and **no per-row actions** (Edit role / Block / Delete kebab) — the entire actions column is absent. The maintainer therefore cannot change any member's role or invite/block via the storefront. Blocks AC2 (and the storefront half of AC3).

**Root cause (second-source confirmed via network payload):** The UI gates these affordances on `checkPermissions()` (`useUser.ts`), which reads `user.permissions` from the **`GetPageContext` xAPI response — NOT the JWT**. The captured `GetPageContext` response returns `"permissions": []` and `"roles": []` for this user in the TechFlow context, even though (a) the JWT carries all 8 maintainer permissions, and (b) `GetOrganizationContacts` returns the fixture's `rolesInOrganization` = "Organization maintainer". So the org-scoped role is stored server-side but the `me`/pageContext projection does not derive `permissions`/`roles` from the org membership after org-switch. Per source: actions column is `v-if="userCanEditOrganization"` = `checkPermissions(XApiPermissions.CanEditOrganization /* xapi:my_organization:edit */)`; Invite button is `v-if="$can(CanInviteUsers /* storefront:user:invite */)"` — both false because `permissions: []`.

**STR:**
1. Log in as `agent-test-multiorg-20260615@yopmail.com` on {{FRONT_URL}}; default org = TechFlow (org-maintainer).
2. Open `/company/members`.
3. Expected: "Invite members" button by the H1; per-row actions kebab (Edit role / Block / Delete) on every non-self member row.
4. Actual: no Invite button; no actions column; only Name/Role/Email/Active columns. No way to change any member's role.

**Network evidence:** `GetPageContext` (200) → `data.pageContext.user.permissions: []`, `roles: []`, `organization.name: "AGENT-TEST-Org-TechFlow-20260310"`, `isAdministrator: false`, `contact.organizations.totalCount: 2`. JWT (same session) → 8 maintainer permissions (see AC1 set above).
**Screenshots:** `screenshots/AC2-FAIL-no-invite-no-actions-maintainer.png`, `screenshots/AC2-table-actions-column-check.png`.
**BL refs:** BL-B2B-005 (role→feature visibility — maintainer SHOULD see member-management actions), BL-AUTH-005 (RBAC). **Severity: High** (core AC2 acceptance is unverifiable on the storefront; org-maintainers cannot administer members).

## AC3 — Org-scoped lockout (re-run 2026-06-15, BuildRight membership now LOCKED by BE)

Fixture state for this run: BuildRight (`fba51391-…`) = **locked**, role org-employee; TechFlow (`6fb516c1-…`) = unlocked, role org-maintainer; global account unlocked.

### AC3-F-01 — locked org rejects login — **PASS**
- From a clean logged-out state, signed in as `agent-test-multiorg-20260615@yopmail.com`. The app's persisted active-org = BuildRight, so the token request targeted the locked org.
- Login **REJECTED**, stayed on `/sign-in`. UI shows the new PR#2315 org-scoped identity error.
- **Exact error copy (UI):** *"Your access to this organization has been blocked. Please contact your organization administrator [contact the site administrator]."* (the bracketed phrase is a link to `/contacts`).
- **Server evidence:** `POST /connect/token` → **400**, body `error: "invalid_grant"`, `code: "user_is_locked_in_organization"`, `errorDescription: "Your access to organization 'fba51391-b652-4dbb-b178-aa2d98d2ceed' has been blocked. Please contact your organization administrator."` (org GUID = BuildRight; UI hides the GUID). Request body included `organization_id=fba51391-…`.
- **Screenshot:** `screenshots/AC3-F-01-buildright-locked.png`.

### AC3-F-01 — other org still works (org-scoped, not global) — **PASS**
- Same credentials, fresh session whose active-org defaulted to TechFlow: `POST /connect/token` with `organization_id=6fb516c1-…` → **200 OK**; reached an authenticated TechFlow home session (header shows TechFlow white-label + member name).
- Proves the lock is org-scoped: BuildRight token blocked, TechFlow token granted with identical credentials. Global account NOT locked (BL-AUTH-003 scoped to org).
- **Screenshot:** `screenshots/AC3-F-01-techflow-login-success.png`. (TechFlow login executed on playwright-edge — a clean profile whose stored active-org was TechFlow — to obtain a TechFlow-scoped token request as a real user; the org-lock is server-side so engine is immaterial. BuildRight-rejection captured on playwright-chrome.)

### AC3-F-02 — org-specific copy, not generic global-lockout — **PASS**
- The message is org-scoped ("blocked **for this organization** / access to organization '…'"), distinct from the generic global account-lockout copy used by BL-AUTH-003 global lockout (suite 031). Server `code: user_is_locked_in_organization` (not a global `lockedout`/`AccountLocked`). Confirms the new PR#2315 org-scoped lockout error path.

**Cleanup:** No unlock performed (BE agent owns restore). Fixture roles unchanged. AC1 oracle intact.

## Notes / observations
- Org switcher (account menu listbox) works: header/footer/branding (TechFlow "TECHFLOW WL" white-label) and the members list correctly swap per org; fixture row shows "Organization maintainer" in TechFlow vs "Organization employee" in BuildRight (per-org roles correct, BL-B2B-001).
- `GetOrganizationContacts` uses new PR#135 org-scoped fields (`rolesInOrganization`, `isLockedInOrganization`, `securityAccounts`) and returns correctly.
- Console: only benign 404s (org-keyed favicons not yet uploaded `favicon_6fb516c1…`, one catalog webp). No JS exceptions. No 4xx/5xx on functional GraphQL; no `errors[]` in 200s.
- AC3 fixture state (confirmed via BuildRight `GetOrganizationContacts` payload): fixture `57389d49` in BuildRight = `isLockedInOrganization: false`, `status: Approved`, `rolesInOrganization: [org-employee]` — **not locked**. BE agent has provisioned separate `AGENT-TEST-5028BE-Member`/`-Target` (both org-employee) for its own lock/role-change steps (correct isolation per checklist). Storefront lock path is unavailable to the fixture (employee in BuildRight; and BUG-1 hides the lock control even for maintainers). The sign-in form has **no org selector** — org is chosen post-login via the account-menu switcher, so an org-scoped lockout error would surface on switch/refresh into the locked org, not at the password step. AC3-F-01/02 need the BE-applied lock (AC3-B-01) in place first; then re-run the login/switch-UX half to capture the exact error copy. No fixture mutation performed by FE — AC1 oracle left intact.
- Cross-org confirmation: same fixture is org-maintainer in TechFlow and org-employee in BuildRight at the data layer (`rolesInOrganization`), and member lists are fully org-isolated — BL-B2B-001 holds end-to-end except for the `me.permissions` projection (BUG-1).
