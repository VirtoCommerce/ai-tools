# VCST-5441 — Testing Checklist (fix verification)

**Bug:** [Platform Settings] A dictionary setting cannot be cleared to empty
**Fix under test:** vc-platform PR #3076 — deployed `3.1044.0-pr-3076-3479-vcst-5441-347993a4` on vcst-qa
**Owning layer:** Platform REST API (`POST /api/platform/settings` → `ISettingsManager.SaveObjectSettingsAsync`); symptom in Admin SPA (Settings → Customer → Roles)
**Domain:** Platform Settings framework (dictionary/`IsDictionary` settings) · related: B2B role whitelist (VCST-5239)
**BL invariants:** BL-B2B-011 (whitelist scoping + empty-whitelist lock-out)

> Auth: read creds from `.env` at runtime (never hardcode). OAuth2 token per `knowledge/api/api-auth.md`.
> Test data: resolve via `{{VAR}}`/`@td()`; do not hardcode role names — read the live roles list.

## Preconditions
- [ ] **P0 — capture original state (MANDATORY for restore).** `GET /api/platform/settings/Customer.OrganizationRolesWhitelist` and `.../Customer.MembershipRolesWhitelist`. Record each `allowedValues[]` verbatim. If either is already empty, seed it with ≥2 real roles (from `GET /api/platform/security/roles/search`) via POST first, so there IS a non-empty starting state to clear.
- [ ] Confirm the live platform build string contains `pr-3076` / `vcst-5441` (Admin SPA "About"/version, or note from manifest). If the deployed build is NOT the fix candidate → **BLOCKED**, stop and report.

## Core fix — clear-to-empty persists
- [ ] **TC1 (C1, REST — owning layer).** With `Customer.OrganizationRolesWhitelist` holding ≥2 entries: `POST /api/platform/settings` body `[{ name, value:null, allowedValues:[], isDictionary:true }]` → expect **204**. Then `GET /api/platform/settings/Customer.OrganizationRolesWhitelist` → **expect `allowedValues:[]` (empty) and `value:null`**. (Pre-fix this returned the old entries.) — *primary assertion.*
- [ ] **TC2 (C2, Admin SPA — STR).** Settings → Customer module → Roles → open *Organization roles whitelist* editor (re-seed entries first if empty from TC1). Select all → Delete → Save → success toast/204. Observe grid empties. **Full page reload → reopen editor → grid still empty.** Screenshot empty-after-reload state.
- [ ] **TC3 (C3).** Repeat TC1 (REST) **and** a UI spot-check for `Customer.MembershipRolesWhitelist` → clears to empty and persists after reload.

## Regression — add direction & neighbors
- [ ] **TC4 (C4, add still persists).** From the empty whitelist, add ≥2 real roles (UI Add + Save, or POST with populated `allowedValues`). `GET` → the roles are present; reload UI → present. Confirms the fix didn't break the add path.
- [ ] **TC5 (C5, BL-B2B-011 lock-out).** While `Customer.OrganizationRolesWhitelist` is **empty and persisted**, open the org "Change roles" picker (Customer module → an org → Roles / `Organization.Roles`). **Expect ZERO options offered** (locked out) — must NOT list all platform roles. Screenshot. (Guards the fix against producing a bad downstream fallback.)
- [ ] **TC6 (C6, non-dictionary sanity).** Pick a scalar (non-dictionary) platform setting with a current value (e.g. a ShortText/Boolean store or platform setting). Save a new value via POST → GET confirms it; then save it back. Confirms the `ItHasValues` branch change left scalar settings unaffected.
- [ ] **TC7 (C7, best-effort — untouched-default guard).** If a registered `IsDictionary` setting with an empty descriptor default and NO existing DB row can be identified, confirm the save path does not create a spurious row for it (GET still returns the descriptor default, not an empty persisted override). Note as N/A if not feasible from the API surface.

## Teardown (MANDATORY)
- [ ] **T1 — RESTORE** both whitelists to their P0-captured `allowedValues` (POST each with the original entries). Re-`GET` to confirm restoration. Leave the env exactly as found so VCST-5239 and regression suites are unaffected.

## Always-on bug detection
While exercising the settings blades, watch every layer (console errors, 4xx/5xx, GraphQL `errors[]` in 200s, visual glitches on the settings grid, save-toast correctness). File any incidental defect (verify first — disabled control / by-design are not bugs).

## Evidence
Follow `.claude/skills/qa-evidence/evidence-capture-policy.md`. Capture: TC1 GET response (before/after), TC2 empty-after-reload screenshot, TC5 zero-options picker screenshot, any failure. HAR auto-captured. Output → `reports/tickets/Sprint26-14/VCST-5441/`.
