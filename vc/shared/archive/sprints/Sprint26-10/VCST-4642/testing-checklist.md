# VCST-4642 — Testing Checklist

**Ticket**: [VCST-4642 — [E2E] Frontend Application Initialization via XAPI](https://virtocommerce.atlassian.net/browse/VCST-4642)
**Priority**: High (P1) | **Type**: Story | **Status**: Testing
**Environment**: vcst-qa | Platform `3.1028.0` | Xapi `3.1009.0-pr-66` | Theme `2.50.0-pr-2293`
**PRs**:
- Backend: [vc-module-x-api#66](https://github.com/VirtoCommerce/vc-module-x-api/pull/66) — Extend store settings with module version metadata
- Frontend: [vc-frontend#2293](https://github.com/VirtoCommerce/vc-frontend/pull/2293) — Frontend initialize application via XAPI

---

## Backend GraphQL (qa-backend-expert)

### BE-1 — Schema introspection: `ModuleSettings.version` field present, non-null `[AC1, BL-GQL-003]`

**Type**: API schema verification
**Steps**:
1. Open GraphiQL UI at `{BACK_URL}/ui/graphiql`
2. Run introspection: `{ __type(name: "ModuleSettings") { fields { name type { name kind ofType { name kind } } } } }`
3. Verify `version` field exists with `type.kind = "NON_NULL"` and inner type `String`

**Expected**: `version` is present and `String!` (NonNull String).
**Evidence**: Screenshot of introspection response.

---

### BE-2 — Live query: `store.settings.modules[].version` returns real versions `[AC2, AC3, BL-GQL-003]`

**Type**: API contract
**Steps**:
1. POST to `{BACK_URL}/graphql` (no auth needed — public op):
   ```graphql
   query { store(storeId: "{{STORE_ID}}") { id name settings { modules { moduleId version settings { name value } } } } }
   ```
2. Assert `data.store.settings.modules[]` is non-empty array
3. Pick 5 known modules from `backend/packages.json` (e.g., `VirtoCommerce.Xapi`, `VirtoCommerce.Catalog`, `VirtoCommerce.WhiteLabeling`, `VirtoCommerce.Orders`, `VirtoCommerce.PageBuilderModule`)
4. For each, verify `version` is non-empty string and matches the version declared in `packages.json`

**Expected**:
- `modules[].version` is a non-empty semver-ish string (e.g., `"3.1009.0"`)
- `Xapi.version` ≈ `3.1009.0` (PR-66 build); `Catalog.version` = `3.1022.0`; `WhiteLabeling.version` = `3.1001.0` (per packages.json)

**Evidence**: HAR of POST `/graphql`, response JSON.

---

### BE-3 — Modules without public settings ARE listed `[AC2]`

**Type**: API contract
**Steps**:
1. Re-use the response from BE-2
2. Modules without any public settings should still appear with `settings: []`
3. Cross-check: count of installed modules in `IModuleCatalog` (≈ 70 from packages.json) should ≈ count of `modules[]` entries when toggle is ON

**Expected**: `modules[]` includes entries with empty `settings` arrays. Example candidates: `VirtoCommerce.Loyalty`, `VirtoCommerce.SqlQueries`, `VirtoCommerce.ApplicationInsights` (typically no public settings).
**Evidence**: JSON sample with empty-settings entries highlighted.

---

### BE-4 — Admin SPA: `XAPI.Security.ReturnModuleVersion` setting exists, default ON `[AC4, AC6]`

**Type**: Admin UI
**Steps**:
1. Navigate to `{ADMIN_URL}` → Sign in as `admin` / Password1!
2. Settings → Search "Return module version"
3. Verify setting appears under group **Platform | Security**
4. Verify label = "Return module version" (English)
5. Verify default value = `true` (checkbox checked / toggle on)

**Expected**: Setting present, group correct, label correct, default ON.
**Evidence**: Screenshot of setting in Admin SPA.

---

### BE-5 — Toggle OFF: version returns empty `""`, modules-without-settings excluded `[AC5, BL-CROSS-006]`

**Type**: Setting behavior (write + read)
**Steps**:
1. In Admin SPA, set `XAPI.Security.ReturnModuleVersion` = `false`, save
2. Re-run BE-2 query
3. Assert ALL `modules[].version` are `""` (empty string, not null per non-null schema)
4. Assert `modules[]` count DECREASES (only modules with public settings remain)
5. Restore setting to `true`, re-run query, verify versions restored

**Expected**:
- With toggle OFF: `version=""` everywhere, fewer module entries
- With toggle ON (restored): versions present, full module list returns
- Toggle change reflects immediately on next request (no cache lag > 60s)

**Evidence**: Side-by-side JSON before/after, screenshot of admin toggle.

---

### BE-6 — Schema: non-null contract honored when toggle OFF `[AC5, BL-GQL-003]`

**Type**: Schema invariant
**Steps**: With toggle OFF, verify `data.store.settings.modules[].version === ""` (empty string), NOT `null`.
**Expected**: Empty string preserves the `String!` non-null contract. `null` would be a contract violation.
**Evidence**: JSON snippet showing `"version": ""`.

---

### BE-7 — Localization: setting label renders in EN + 1 other locale `[AC6]`

**Type**: Admin UI localization
**Steps**:
1. Open Admin SPA settings in EN — verify "Return module version" label
2. Switch UI language to RU (or DE) — verify localized label
3. Description tooltip also localized

**Expected**: Both EN and at-least-one-other locale show their translation; no missing-key fallback.
**Evidence**: 2 screenshots (EN + other locale).

---

### BE-8 — Error contract: invalid `domain` arg returns structured error `[BL-GQL-001]`

**Type**: Error path
**Steps**:
1. Run `query { store(domain: "does-not-exist.example.com") { id } }`
2. Expected behavior: either returns `null` (store not resolved) or `errors[]` populated — never HTTP 500
3. Inspect error message — no stack traces, no SQL fragments

**Expected**: HTTP 200, structured response, message free of `at System.`, `SqlException`, internal paths.
**Evidence**: Response JSON.

---

## Frontend Storefront (qa-frontend-expert + exploratory)

### FE-1 — `initializeApplication` query fires on app startup `[AC7, AC11]`

**Type**: Network behavior
**Steps**:
1. Open `{FRONT_URL}` in fresh incognito (clear cache + localStorage)
2. Open DevTools → Network → filter `graphql`
3. Reload page
4. Find the POST to `/graphql` with body containing `"initializeApplication"` operationName (or query containing `store { ... settings { modules { moduleId version } } }`)
5. Verify it fires once, BEFORE other feature queries (e.g., before any `whiteLabeling`, `customerReviews`, `pageContext` follow-ups)

**Expected**:
- Single `initializeApplication` POST early in the page load
- Response is 200 OK with `modules[]` populated
- Subsequent queries appear AFTER this query resolves

**Evidence**: HAR file with timing waterfall, screenshot of Network panel with operationName visible.

---

### FE-2 — Capability manifest is cached for the session `[AC11]`

**Type**: Performance / caching
**Steps**:
1. After initial load, navigate between pages (Home → Catalog → PDP → Cart)
2. Filter Network for `initializeApplication`
3. Verify the query DOES NOT re-fire on every navigation

**Expected**: `initializeApplication` fires once per session (or only on app boot / hard-refresh). Check `localStorage` for capability-manifest key after init.
**Evidence**: Console snapshot of `localStorage` keys, network timeline showing single fire.

---

### FE-3 — `whiteLabeling` fragment is requested when module is installed `[AC8]`

**Type**: Network gating (positive path)
**Steps**:
1. `VirtoCommerce.WhiteLabeling` IS installed (`packages.json` shows `3.1001.0`)
2. Trigger a page that uses `pageContext` (e.g., navigate to homepage)
3. Inspect the `pageContext` query body — should include `whiteLabeling { ... }` fragment (or via spread)

**Expected**: With module installed, `@needsModule(name:"VirtoCommerce.WhiteLabeling")`-gated fields ARE sent.
**Evidence**: Network payload JSON.

---

### FE-4 — `@needsModule` gating simulation `[AC9, AC10]`

**Type**: Network gating (negative path / simulated)
**Steps**:
1. Direct backend toggle of an optional module is risky in shared env — simulate at frontend:
   - In DevTools Console, override the capability manifest in memory or localStorage to remove e.g. `VirtoCommerce.CustomerReviews`
   - Or use the `useModules` composable mock if exposed
2. Reload the page (without re-fetching manifest)
3. Verify that any query gated on `@needsModule(name:"VirtoCommerce.CustomerReviews")` is NOT sent
4. Verify console is clean — NO `Unknown field`, NO `cannot query` GraphQL errors

**Expected**: When module absent from manifest → gated queries are stripped client-side → no errors.
**Evidence**: Console log clean, network does not contain reviews query.

> **Alternative**: If safe simulation is not possible, verify the `apply-gates-link.ts` unit test (`apply-gates.test.ts`) passes by inspecting the PR's test file and confirming behavior matches.

---

### FE-5 — No runtime errors on app boot `[AC10, BL-GQL-001]`

**Type**: Console hygiene
**Steps**:
1. Open `{FRONT_URL}` incognito
2. DevTools Console — filter "Error"
3. Boot sequence should produce zero GraphQL-related errors (`Cannot query field`, `Unknown type`, `Variable ... was provided invalid value`)
4. Capture any unrelated errors with context — they may be pre-existing

**Expected**: Zero new errors introduced by PR #2293 / PR #66.
**Evidence**: Console log dump.

---

### FE-6 — Storefront smoke (golden path) `[regression baseline]`

**Type**: End-to-end smoke (since the change touches app initialization)
**Steps** — execute as `USER_EMAIL` / Password1!:
1. Sign in → home renders
2. Catalog navigation → PDP for an available product (`@td(TEST_SKU)`)
3. Add to cart → cart page renders, line item present
4. Header counters, currency selector, language selector all functional

**Expected**: Golden path unchanged; no regressions from new app-boot logic.
**Evidence**: Screenshots of each step, no console errors.

---

### FE-7 — Exploratory (SBTM charter — combined into FE agent run) `[P1 required]`

**Charter**: "Explore the application initialization flow + module-gating boundary"
**Heuristic**: **SFDPOT** (Structure / Function / Data / Platform / Operations / Time)
**Time box**: 20 min

**Focus areas:**
- **Structure**: What if `initializeApplication` returns an empty modules array? Does the app still render?
- **Function**: Does the manifest invalidate on auth state change (sign-in / sign-out / org switch)? Should it?
- **Data**: Are module versions ever displayed in UI (footer, About, debug panel)? If yes, are they exposed without auth?
- **Platform**: Behavior in Firefox vs Chromium (cross-browser sanity)
- **Operations**: What happens if the GraphQL endpoint is slow (>5s) on this initial query? Does the app block or fall back?
- **Time**: Refresh during initial query — race condition / double-fetch?

**Expected output**: 5–10 observations classified as Bug / Question / Observation / Risk.

---

## Cross-cutting / Security

### SEC-1 — Module version exposure is anonymous-readable when toggle ON `[security review]`

**Type**: Security observation (not a bug per se, but the `XAPI.Security.ReturnModuleVersion` setting exists specifically to suppress this)
**Steps**:
1. Without authentication, POST the BE-2 query
2. Verify all installed module versions are returned
3. Note this in the report — version disclosure is **by design** (default ON) but operators may want to set it OFF in production for security posture

**Expected**: Versions are public when toggle is ON. Document that the toggle is the mitigation.
**Evidence**: Anonymous POST + response.

---

## Out of scope

- Localization beyond EN + 1 other locale (full 9-locale matrix not required for QA sign-off)
- Performance benchmarking against BL-GQL-002 thresholds (additive change; perf likely acceptable but not part of ACs)
- Visual regression (no UI surface area changed)
