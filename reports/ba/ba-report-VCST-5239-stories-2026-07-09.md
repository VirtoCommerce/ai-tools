# User Stories — VCST-5239 Role Model (companion to `ba-report-2026-07-09.md`)

> **CORRECTION (2026-07-09, post-review).** A decisive live removal-test proved the **Admin org-level role picker already filters by the Organization whitelist** (`whitelist ∩ org-assignable − already-assigned`), consistent with **BL-AUTH-005**. This changes the status of the enforcement stories below:
> - **Story 01** (Admin dropdown filtering) is **already implemented** → convert to regression coverage, not new build.
> - **Story 02** (storefront dropdown filtering) is **conditional** — gated on re-verifying whether the *storefront* pickers filter (the prior "unfiltered" verdict is now suspect).
> - **Story 03** (server-side rejection) is a **product decision only** — non-enforcement is *by-design* per BL-AUTH-005, not a defect.
> - Stories **04–07** (UX legibility) are unaffected.

**Epic EPIC-5239 — Make the organization role model enforceable and legible.**
Turns the org-scoped-roles-with-override model (three sources: Global / Organization / Membership, union-derived) from a UI that silently accepts anything into one where the two whitelists actually constrain assignment (client + server), the union/inheritance behavior is visible to the admin making the change, and the storefront correctly reflects and filters on it.

**Success metric:** both whitelists reject non-whitelisted roles in every entry point (Admin SPA, storefront, direct API); an admin assigning an org-level role sees how many employees it affects before saving; the members role facet matches what members actually hold.

| # | Story | Module | Priority | Size |
|---|-------|--------|----------|------|
| 01 | Filter Admin SPA role dropdowns by whitelist | Customer (Admin SPA) | High | S |
| 02 | Filter storefront role dropdowns by whitelist | vc-frontend | High | S |
| 03 | Reject non-whitelisted role assignment server-side | Customer / xAPI | High | M |
| 04 | Show role-union precedence + affected-employee count | Customer (Admin SPA) | Medium | S/M |
| 05 | Source the storefront role facet from members' actual roles | vc-frontend | Low-Med | S |
| 06 | Warn admin that org-level role changes require member relogin | Customer (Admin SPA) | Low | XS/S |
| 07 | Promote org-level role assignment to a first-class Roles tab | Customer (Admin SPA) | Medium | M/L |

> **Sequencing (corrected):** The whitelist-filtering premise is largely **already met** on the Admin side. Real remaining work is: **RI0** — re-verify the storefront picker (gates story 02); then the UX-legibility stories **04–07**. Story 01 → regression coverage; story 03 → product decision only (by-design today). See the correction banners on 01/02/03.

---

## [EPIC-5239-01] Filter Admin SPA role dropdowns by whitelist
> ⚠️ **ALREADY IMPLEMENTED (verified 2026-07-09).** The Admin org-level picker filters by the Organization whitelist today. Repurpose this story as **regression coverage** (add a runner/E2E case asserting the removal A/B: role in whitelist → shown; removed → gone), not a build. AC-3/AC-4 (empty/single-role boundary) remain worth an explicit test. Membership-picker filtering is presumed (same widget) but not separately proven.

**Type:** Improvement · **Module:** Customer (Admin SPA) · **Priority:** 🔴 High · **Effort:** S
**Business_Rule:** BL-AUTH-005; BL-AUTH-006 · **Edge_Case_Refs:** ECL-2.1 (single-item), ECL-2.3 (empty list)

**As a** Platform Administrator, **I want** the org-level and membership role-assignment dropdowns in Admin SPA to only list whitelisted roles, **so that** I cannot accidentally assign a role the organization has explicitly excluded from that scope.

**Background.** Admin SPA Settings › Customer › Roles exposes two independently-configurable whitelists (customer#304 `ModuleConstants` SettingDescriptors). Both save/round-trip but nothing reads them — the org blade role dropdown and the member blade org-membership widget both list every platform role (VCST-5239 AC5/AC6, confirmed FAIL).

**Acceptance criteria**
- ✅ AC-1: Given the Organization whitelist is a 2-role subset excluding a normally-available role, when the org-level role dropdown is opened, then only the 2 whitelisted roles appear and the excluded role does not.
- ✅ AC-2: Given a different Membership whitelist subset, when the per-member role dropdown is opened, then only Membership-whitelisted roles appear, and changing the Organization whitelist does not alter it.
- ❌ AC-3: Given an empty Organization whitelist (0 roles), when the dropdown opens, then it shows no assignable roles with a clear "no roles available — configure the whitelist" state and does NOT fall back to listing every platform role.
- ✅ AC-4: Given a single-role whitelist, when the dropdown opens, then exactly one option shows, with no implicit "none"/wildcard entry.

**Out of scope:** storefront dropdown filtering (02); server-side rejection (03); retroactive handling when a role is later removed from the whitelist.

**Dependencies:** depends on customer#304 (shipped); enables 03 (server-side twin).

**DoD:** Chrome/Firefox/Edge; both whitelists tested independently + combined; unit tests for filtering logic (≥80% new-code coverage); no new console errors; BA sign-off; BL-AUTH-005/006 mapping recorded.

**UI/UX:** no new screens — filter existing org blade dropdown + member blade org-membership widget in place; reuse the platform `uiSelect`/dropdown directive; empty-whitelist = explicit message, not a blank/broken dropdown.

**Technical:** `GET/PUT /api/organizations` (org blade); Customer member-role endpoint (member blade). `vc-module-customer` Admin SPA — the two blade controllers/services that populate role dropdowns from the full role list must intersect with the `ModuleConstants` whitelist values. Read-side only, no schema change. This is UI convenience filtering — NOT the enforcement boundary (see 03).

**Test scenarios:** happy-path org dropdown filtered (E2E) · independent filtering (E2E) · empty whitelist no-fallback (E2E) · single-role boundary (Unit).

---

## [EPIC-5239-02] Filter storefront role dropdowns by whitelist
> ⚠️ **CONDITIONAL — verify first.** Given the Admin picker DOES filter (contrary to the earlier verdict), the storefront "unfiltered" finding is suspect. **Re-run the removal A/B on the storefront Change-role/Invite pickers before building this.** If the storefront already filters, close as done; only build if it genuinely doesn't.

**Type:** Improvement · **Module:** B2B / Organization (vc-frontend) · **Priority:** 🔴 High · **Effort:** S
**Business_Rule:** BL-AUTH-005; BL-B2B-005 · **Edge_Case_Refs:** ECL-2.1, ECL-2.3

**As an** Organization maintainer, **I want** the "Change role" and "Invite" dialogs on `/company/members` to only offer whitelisted roles, **so that** I can't assign a role my company (or the platform admin) has restricted from member assignment.

**Background.** vc-frontend#2354 introduced the Change-role and Invite dialogs. Neither reads the Membership roles whitelist — both render every role the maintainer's permissions allow, regardless of whitelist. Storefront half of the AC6 FAIL.

**Acceptance criteria**
- ✅ AC-1: Given a 2-role Membership whitelist, when the maintainer opens "Change role" for a member, then the selector lists only those 2 roles; any previously-assigned non-whitelisted role still displays as the member's CURRENT role but is not selectable for a different member.
- ✅ AC-2: Given the same whitelist, when the maintainer opens "Invite" and reaches the role field, then only whitelisted roles are selectable, and submitting with no role is blocked by client-side validation.
- ❌ AC-3: Given an empty whitelist (or one referencing a now-deleted role), when either dialog opens, then it shows an empty/disabled role selector with a clear message and does NOT throw a console error or hang loading.

**Out of scope:** Admin SPA filtering (01); server-side rejection (03); which roles a maintainer is *permitted* to assign per their own RBAC (unchanged).

**Dependencies:** depends on 03 for the actual security guarantee — this story alone is UI-only.

**DoD:** Chrome/Firefox/Edge; mobile 375 / tablet 768 / desktop 1920; Vitest component tests for both dialogs' filtering; keyboard-navigable + ARIA (Coffee theme); i18n keys only; no new console errors.

**UI/UX:** existing Change-role and Invite modals — filter the role select in place; empty-whitelist = disabled selector + "No roles available for assignment — contact your administrator"; current-role-not-in-whitelist = display-only chip; reuse vc-frontend UI-kit select.

**Technical:** the dialogs' role-options query (via `useOrganizationContacts` / the dialog composable) must intersect returned roles with the Membership whitelist, read via the org-settings query (profile-experience-api#137 read path). `vc-frontend` Change-role / Invite components (#2354). Runner AC: role-options array length == whitelist length and every id ∈ whitelist ids.

**Test scenarios:** Change-role filtered (E2E) · Invite filtered (E2E) · empty whitelist no-crash (E2E) · legacy current-role read-only (Integration).

---

## [EPIC-5239-03] Reject non-whitelisted role assignment server-side
> 🟦 **PRODUCT DECISION, NOT A DEFECT.** Non-enforcement is *by-design* per **BL-AUTH-005** ("the whitelists populate assignment dropdowns only; they are not server-enforced"). The whitelist is a UI-convenience control, not a security boundary. Build this ONLY if the product explicitly decides to make it a boundary — and if so, **BL-AUTH-005 must be updated** in the same change.

**Type:** Bug Fix (security gap — dropdown filtering alone is bypassable) · **Module:** Customer / xAPI · **Priority:** 🔴 High · **Effort:** M
**Business_Rule:** BL-AUTH-005 · **Edge_Case_Refs:** ECL-2.1, ECL-9.2 (client-bypass / direct-API adversarial)

**As a** Platform Administrator, **I want** the server to reject a role assignment for a role excluded from the relevant whitelist — even when the request bypasses the dropdown entirely — **so that** the whitelist is an actual boundary, not just a UI suggestion.

**Background.** The P0 concern behind VCST-5239 AC12: with only client-side filtering (01/02), a caller who hits `PUT /api/organizations` or the `changeOrganizationContactRole`-equivalent mutation (profile-experience-api#137) directly with an excluded role succeeds today (`succeeded:true`), with no server check. NB per BL-AUTH-005 this is currently **by-design** (the whitelist is not a permission boundary) — this story is the product decision to MAKE it one.

**Acceptance criteria**
- ✅ AC-1: Given the Organization whitelist excludes role R, when `PUT /api/organizations` (or the org-level role mutation) is sent directly with R, then the server returns non-2xx / non-empty `errors[]` and the org's role set is unchanged.
- ✅ AC-2: Given the Membership whitelist excludes R, when `changeOrganizationContactRole` is called directly with R for a member, then it is rejected and the member's role set is unchanged.
- ❌ AC-3: Given R IS whitelisted, when the same direct path assigns R, then it succeeds normally (no over-blocking).
- ✅ AC-4: Given R was assigned BEFORE being removed from the whitelist, when the whitelist later excludes R, then the existing assignment is NOT retroactively purged, AND a later re-assign of R IS rejected.

**Out of scope:** dropdown UI filtering (01/02); retroactive revocation; whitelist CRUD (shipped).

**Dependencies:** depends on customer#304 (shipped); can ship independently and should ship FIRST; enables 01/02 to become defense-in-depth.

**DoD:** integration/E2E happy-path (whitelisted still succeeds); runner-native GraphQL cases in `regression/suites/Backend/graphql/` (org-level + membership mutations); REST case for `PUT /api/organizations` asserting 4xx + unchanged state; no breaking change to the whitelisted happy path; BL-AUTH-005 mapping recorded (and the BL rule updated to reflect the new boundary — see BL proposals).

**Technical:** add server-side validation against the whitelist setting before persisting — `vc-module-customer` (REST, `ModuleConstants` read) + `vc-module-x-profile-experience` / #137 (GraphQL). Validation only, no schema change. **Re-read the whitelist at mutation time** (not cached) so a tightened whitelist takes effect immediately. Runner AC: non-whitelisted → `errors[]` non-empty; whitelisted → `errors[]` empty AND `data.<mutation>.succeeded == true`.

**Test scenarios:** direct REST bypass org-level (API) · direct GraphQL bypass membership (runner) · whitelisted still works (runner) · whitelist tightened after assignment (runner).

---

## [EPIC-5239-04] Show role-union precedence and affected-employee count
**Type:** Improvement · **Module:** Customer (Admin SPA) · **Priority:** 🟡 Medium · **Effort:** S/M
**Business_Rule:** BL-B2B-005; BL-B2B-007

**As a** Platform Administrator, **I want** to see how many employees an org-level role change will affect, and a plain explanation of how it combines with membership roles, before I save, **so that** I don't unknowingly grant broad access to every employee with a single click.

**Background.** Global, Organization, and Membership roles combine as a deduped union re-derived at token issuance. Assigning an org-level role instantly affects every current employee — incl. those with zero membership roles — but the org blade gives no cue, unlike a per-member change visibly scoped to one person.

**Acceptance criteria**
- ✅ AC-1: When a new org-level role is selected but not saved, then the UI shows "This will affect N employees" (N = current member count).
- ✅ AC-2: When viewing the org-level role panel, then an inline explanation states effective permissions are the union of Global + Organization + Membership (no single scope overrides another).
- ✅ AC-3: Given the count was shown for M members, when a member is added/removed before save, then re-opening the panel reflects the current count, not a stale value.

**Out of scope:** per-member impact preview; the Roles-tab redesign (07 — this is the minimal inline version).

**Dependencies:** none; enables 07 (count logic reused).

**DoD:** count matches the org member-count endpoint; unit test for count computation; integration test for live-update; accessible (SR-readable count + explainer); no new console errors.

**UI/UX:** inline text/badge near the org-level role selector; zero-member org shows "0 employees" (not hidden); reuse the platform inline info/tooltip pattern; count fetch runs in parallel, not blocking the dropdown.

**Technical:** reuse the existing organization-members count endpoint (Customer module) — fetch-and-display on the org blade, no new endpoint.

**Test scenarios:** count shown (E2E) · zero-member org (Unit) · live update (Integration) · explainer present (Unit).

---

## [EPIC-5239-05] Source the storefront role facet from members' actual roles
**Type:** Bug Fix · **Module:** B2B / Organization (vc-frontend) · **Priority:** 🟢 Low-Medium · **Effort:** S
**Business_Rule:** BL-B2B-005

**As an** Organization maintainer, **I want** the role filter on `/company/members` to only offer roles at least one member actually holds — including org-inherited ones — **so that** I never see a filter option returning zero results, and I can filter by org-inherited roles like directly-assigned ones.

**Background.** The Roles column already merges Global + Organization + Membership per member (B2C-MBR-001/024). The role-facet FILTER is sourced from a static assignable-role list (`useOrganizationContacts`), not members' actual held roles — so a role nobody holds can appear as a dead-end filter and an org-inherited role was never validated as a facet option.

**Acceptance criteria**
- ✅ AC-1: Given a member holds a role ONLY via org-level inheritance, when the facet opens, then that role appears as a selectable option and selecting it returns that member.
- ✅ AC-2: Given no current member holds role X in any source, when the facet opens, then X does not appear.
- ❌ AC-3: Given a filter is applied, when the maintainer clicks Reset, then the full unfiltered list is restored.

**Out of scope:** the Roles column merge display (already correct); server-side enforcement (03).

**DoD:** Vitest test for facet-options derivation; E2E org-inherited-role member filterable; existing `B2C-MBR-025` facet case still passes.

**UI/UX:** existing facet control — only its options-source changes; empty org → facet hidden/disabled.

**Technical:** `useOrganizationContacts` facet-options must source from the same merged role set (Global ∪ Organization ∪ Membership) already computed for the column, not a separate static query. `vc-frontend` `members.vue` + `useOrganizationContacts` (#2354). Runner AC: `organization.contacts(roleIds:[<inheritedRoleId>])` returns the org-inherited-only member's id.

**Test scenarios:** org-inherited role filterable (E2E) · dead role excluded (Unit) · reset restores list (E2E).

---

## [EPIC-5239-06] Warn admin that org-level role changes require member relogin
**Type:** Improvement · **Module:** Customer (Admin SPA) · **Priority:** 🟢 Low · **Effort:** XS/S
**Business_Rule:** BL-B2B-007

**As a** Platform Administrator, **I want** a clear notice after saving an org-level role change that affected employees must sign in again for it to take effect, **so that** I don't assume the change is broken or file a false "not working" report.

**Background.** Effective permissions are re-derived only at token issuance — the change is real server-side immediately, but an open storefront session doesn't see it until relogin. Today's Save gives no signal.

**Acceptance criteria**
- ✅ AC-1: When an org-level role assignment save succeeds, then a toast/banner reads (in substance) "Saved. Affected employees must sign in again for this change to take effect."
- ❌ AC-2: Given an unrelated org field is edited (e.g. name) with no role change, when saved, then the relogin notice does NOT appear (avoid notice fatigue).

**Out of scope:** making the change apply without relogin (token-issuance-time derivation is an existing architectural decision); per-member email notification.

**DoD:** notice text uses i18n keys; fires only on an actual role-affecting save; no new console errors.

**UI/UX:** existing Admin SPA toast pattern, post-save on the org blade.

**Technical:** `vc-module-customer` org blade save handler — gate the extra notice on whether the diff included a role-set change. Client-side UX only, no API change.

**Test scenarios:** role change saved → notice (E2E) · non-role field saved → no notice (Unit).

---

## [EPIC-5239-07] Promote org-level role assignment to a first-class Roles tab
**Type:** Feature · **Module:** Customer (Admin SPA) · **Priority:** 🟡 Medium · **Effort:** M/L
**Business_Rule:** BL-B2B-005; BL-B2B-007; BL-B2B-008

**As a** Platform Administrator, **I want** a dedicated "Roles" tab on the organization blade — instead of a generic bulk-toolbar "Change roles" action reachable only after checkbox-selecting an org row — with a preview of which employees will be affected before I save, **so that** a feature that instantly grants access to an entire organization has a discoverable, deliberate entry point.

**Background.** Today, org-level role assignment is only reachable via the generic "Change roles" bulk-toolbar action, appearing after checkbox-selecting an Organization row — the same mechanism as other bulk ops. Nothing signals it's qualitatively different (org-wide instant grant).

**Acceptance criteria**
- ✅ AC-1: When an admin opens an org's detail blade, then a "Roles" tab is present alongside existing tabs.
- ✅ AC-2: When the Roles tab opens, then it lists the org's current org-level roles and provides an add/remove control filtered by the Organization whitelist (reusing 01).
- ✅ AC-3: When a role is selected/deselected, then before Save the tab shows the affected-employee count + union explainer (reusing 04).
- ❌ AC-4: Given the Roles tab exists, when the admin looks for the old bulk "Change roles" action on an org row, then it is removed or clearly navigates to the same Roles tab (no divergent duplicate).

**Out of scope:** per-member (Membership) role UI (unchanged); server-side enforcement (03, prerequisite but separate).

**Dependencies:** depends on 01 (filtered control) + 04 (impact-count logic); terminal story in the epic.

**DoD:** new tab follows `admin-spa-ui-conventions.md`; E2E covers add + remove + preview + save; old bulk entry-point behavior explicitly verified; tab keyboard-navigable.

**UI/UX:** new blade tab (standard tab-strip); role list + add/remove + inline impact preview; empty state explicit; pending-change preview before save; 06's relogin notice fires here too; `blade-static` layout conventions, no fixed-height hacks.

**Technical:** `GET/PUT /api/organizations` reused (same underlying mutation — this changes ONLY the entry point). `vc-module-customer` Admin SPA new blade tab + controller; remove/redirect the existing bulk-toolbar "Change roles" for the Organization entity. Reuses 01's filtered dropdown + 04's count logic.

**Test scenarios:** tab discoverable (E2E) · add role with preview (E2E) · remove role with preview (E2E) · old entry point resolved (Integration).
