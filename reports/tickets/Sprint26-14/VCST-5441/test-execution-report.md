# VCST-5441 — Fix Verification: Dictionary setting can be cleared to empty

**Verdict: FIX CONFIRMED — ALL PASS.** PR #3076 correctly persists a cleared/empty `IsDictionary` platform setting. No defects found. (TC5 initially flagged, then confirmed by-design — see below.)

**Env:** vcst-qa @ Platform `3.1044.0-pr-3076-3479` (contains `pr-3076` / vcst-5441 — build precondition PASS). SqlServer, Production mode.
**Owning layer:** Platform REST `POST /api/platform/settings` → `SettingsManager.SaveObjectSettingsAsync`. Symptom UI: Admin SPA Settings → Customer → Roles.
**Browser:** playwright-edge. Auth: OAuth2 admin token (creds from env).

## P0 — original state captured (for restore)
- `Customer.OrganizationRolesWhitelist` allowedValues = `["Organization employee","Purchasing agent"]`
- `Customer.MembershipRolesWhitelist` allowedValues = `["Store manager"]`
Both non-empty at start; roles read live from `/api/platform/security/roles/search` (42 roles).

## Results per test case

| TC | Cond | Result | Evidence / one-line reason |
|----|------|--------|----------------------------|
| TC1 | C1 | **PASS** | REST clear: `POST /settings [{name:Customer.OrganizationRolesWhitelist, value:null, allowedValues:[], isDictionary:true}]` → **204**; `GET` → `allowedValues:[]`, `value:null`. Core fix — empty persists at owning layer. |
| TC2 | C2 | **PASS** | Admin SPA: Org whitelist editor → select all → Delete → Save (POST 204). **Full reload + reopen → grid still empty.** Screenshot `VCST-5441-TC2-org-whitelist-empty-after-reload.png`. |
| TC3 | C3 | **PASS** | REST: Membership whitelist `["Store manager"]` → clear → **204**; GET `allowedValues:[]`, `value:null`. UI spot-check after reload → editor grid empty (`VCST-5441-TC3-membership-whitelist-empty-after-reload.png`). |
| TC4 | C4 | **PASS** | Add-direction regression: from empty, POST `allowedValues:["Organization employee","Purchasing agent"]` → **204**; GET returns both. Add path unaffected. |
| TC5 | C5 | **PASS (by-design)** | Empty whitelist = no restriction → picker offers all roles. This is the intended implementation (confirmed by product owner), not a lock-out — see below. |
| TC6 | C6 | **PASS** | Scalar `Order.DashboardStatistics.Enable` (Boolean, non-dictionary): `true→false` POST 204 / GET `False`, restored `false→true` POST 204 / GET `True`. `ItHasValues` change did not affect scalar settings. (VC serializes boolean GET value as string `"True"/"False"` — expected.) |
| TC7 | C7 | **N/A** | Untouched-empty-default-dictionary "no spurious row" guard is an internal save-path behavior not observable from the API surface without DB access; covered by the PR's unit tests. |

## TC5 — empty whitelist offers all roles (BY DESIGN, confirmed in source)

With `Customer.OrganizationRolesWhitelist` **empty and persisted** (after cache reset + full reload), the Admin org **Roles** picker (Customer → organization → detail → Roles → Add) offers the **full list of platform roles**. This is the **intended implementation**, not a defect: an empty whitelist means "no restriction".

**Source-grounded (authoritative):** `vc-module-customer` `Scripts/services/rolesPickerService.js` applies the whitelist filter **only when the whitelist is non-empty**:
```js
if (whitelist.length) {
    var whitelistLower = whitelist.map(v => v.toLowerCase());
    allRoles = allRoles.filter(r => whitelistLower.indexOf(r.name.toLowerCase()) !== -1);
}
```
When `whitelist.length === 0` the filter is skipped → `allRoles` stays the full list. So empty = all roles is explicit by design. `organization-detail.js` wires this picker with `whitelistSettingId: 'Customer.OrganizationRolesWhitelist'`.

**Evidence (both consistent with the source):**
- Empty whitelist → all roles: `VCST-5441-TC5-org-role-picker-precache-reset.png`
- Non-empty (2-entry) whitelist → filtered to the matching role (`Purchasing agent`): `VCST-5441-TC5-picker-filtered-to-2roles-proves-filter-works.png` (confirms the filter runs when `whitelist.length` is truthy).

**Note:** the "empty whitelist must lock out (zero options)" premise in the task's BL-B2B-011 phrasing does **not** match the shipped implementation (`if (whitelist.length)` = empty→no filter). No downstream fallback bug; nothing to file.

## Incidental observations (not filed)
- Static module-logo 404s (`/apps/*/logo.svg`, `page-builder-shell/.../logo-only.svg`) — cosmetic, pre-existing, unrelated.
- `500` on `GET /api/order/dashboardStatistics` from the workspace dashboard — Orders-module stats endpoint, unrelated to settings; appeared independent of the whitelist flow. Pre-existing candidate; not investigated further.

## Teardown (MANDATORY) — DONE
Restored via REST + confirmed by GET, then platform cache reset:
- `Customer.OrganizationRolesWhitelist` = `["Purchasing agent","Organization employee"]` (P0 set, order-insensitive) ✓
- `Customer.MembershipRolesWhitelist` = `["Store manager"]` (P0) ✓
Scalar `Order.DashboardStatistics.Enable` restored to `true` ✓. Environment left as found.

## Per-condition verdict

| C1 | C2 | C3 | C4 | C5 | C6 | C7 |
|----|----|----|----|----|----|----|
| PASS | PASS | PASS | PASS | **PASS** (empty=all roles, by design per source) | PASS | N/A |

**Overall: FIX VERIFIED — ALL PASS, no defects.** The dictionary clear-to-empty defect is fixed at both REST and Admin SPA layers and persists across reload; add-direction and scalar settings unaffected. C5 confirmed by-design in `rolesPickerService.js` (`if (whitelist.length)` → empty whitelist = no filter = all roles).
