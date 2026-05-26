---
title: "Frontend Application Initialization via XAPI — User Guide"
ticket: VCST-4642
status: PASS_WITH_NOTES
signed-off: 2026-05-21
platform: "3.1028.0"
xapi: "3.1009.0-pr-66-020b"
theme: "2.50.0-pr-2293-55fc"
audiences:
  - Storefront operators / Solution Architects
  - Platform Administrators
  - Frontend integrators / custom-storefront partners
related:
  jira: https://virtocommerce.atlassian.net/browse/VCST-4642
  backend-pr: https://github.com/VirtoCommerce/vc-module-x-api/pull/66
  frontend-pr: https://github.com/VirtoCommerce/vc-frontend/pull/2293
  api-reference: docs/ba-output/vcst-4642-api-reference.md
  test-evidence: tests/Sprint-current/VCST-4642/
  recheck-report: tests/Sprint-current/VCST-4642/recheck-2026-05-21-whitelabeling-absent.md
last-updated: 2026-05-21 (afternoon — added real-module-absence recheck for AC9)
---

# Frontend Application Initialization via XAPI

**Story:** VCST-4642 | **Status:** PASS WITH NOTES — shipped 2026-05-21 on vcst-qa
**Platform:** `3.1028.0` | **Xapi:** `3.1009.0-pr-66-020b` | **Theme:** `2.50.0-pr-2293-55fc`
**Last updated:** 2026-05-21 PM — added §5 module-version mismatch detection (Step 3 AC) and real-module-absence recheck for AC9 ([§6 Real-world recheck](#real-world-recheck-2026-05-21-pm))

---

## Table of Contents

1. [What changed and why](#1-what-changed-and-why)
2. [Storefront operator guide](#2-storefront-operator-guide)
3. [Platform administrator guide](#3-platform-administrator-guide)
4. [Frontend integrator guide](#4-frontend-integrator-guide)
5. [Module version mismatch detection (non-production mode)](#5-module-version-mismatch-detection-non-production-mode)
6. [Verified scope and known limitations](#6-verified-scope-and-known-limitations)
7. [Where to read more](#7-where-to-read-more)

---

## 1. What changed and why

**Before this change**, the vc-frontend storefront would fire optional GraphQL queries — for white labeling, customer reviews, promotion coupons, and other extension features — without first checking whether the corresponding platform modules were actually installed. When a module was absent, those queries failed with HTTP 400 errors of the form `Cannot query field 'whiteLabelingSettings' on type 'Query'`. These errors polluted the browser console and produced noisy entries in backend logs, making it harder to spot real problems.

**After this change**, the storefront makes a single `initializeApplication` call the moment the application boots. The response contains a **capability manifest** — a list of every installed platform module, its version, and its public settings. The storefront reads that manifest and uses it to **skip any GraphQL query that depends on a module that isn't installed**. This skipping is enforced client-side by a dedicated Apollo link (`apply-gates-link`) before the request ever leaves the browser.

**What this means in practice:**

- Fewer browser-console errors. Queries that would fail are never sent.
- Faster first render in environments where optional modules (white labeling, customer reviews, BOPIS pickup) are not installed — the storefront doesn't wait for responses that would return errors.
- A verifiable contract: every optional GraphQL fragment is annotated with which module it requires, making the dependency explicit and auditable.
- No changes to the storefront UI that end users will notice. The improvement is entirely in reliability and observability.

---

## 2. Storefront operator guide

This section is for **operators running a Virto Commerce storefront** and **solution architects** evaluating what the change means for their deployment.

### Will I see anything different in the storefront?

No. There is no new page, no new UI element, and no change to the shopping experience. The benefit is invisible to shoppers: fewer GraphQL errors in the browser console and backend logs, and more predictable behavior when optional modules are not installed.

### How do I confirm the feature is active on my store?

1. Open the storefront in a browser.
2. Open DevTools (F12) and go to the **Network** tab.
3. Filter by `graphql`.
4. Hard-refresh the page (Ctrl+Shift+R or Cmd+Shift+R).
5. Look for a POST request whose payload contains the operation name `initializeApplication`. It should appear near the top of the request list, before any `GetPageContext`, `GetWhiteLabelingSettings`, or other feature queries.
6. Click the request and inspect the Response tab. You should see `data.store.settings.modules` populated with an array of installed module entries.

If you see the `initializeApplication` request and a 200 response with a non-empty `modules` array, the feature is working correctly.

### Where does the manifest live in the browser?

The manifest is stored in `localStorage` under the key:

```
vc:initialStore:v1:<your-storefront-domain>
```

For example, on the vcst-qa environment the key is `vc:initialStore:v1:vcst-qa-storefront.govirto.com`.

You can inspect it in DevTools under **Application > Local Storage**. The value contains the full module list, versions, and public settings.

The manifest persists for the duration of the browser session. A hard refresh (which clears the cache) re-fetches it from the platform.

### What if I install a new module on the platform — will customer browsers pick it up?

Yes, on their next session or hard refresh. There is no server-push invalidation mechanism. A customer whose browser tab has been open for a long time may be working from a stale manifest until they close and reopen the tab or do a hard refresh.

If you are rolling out a new optional module and need customers to pick up the new capabilities quickly, consider one of these approaches:

- Coordinate the rollout with a scheduled maintenance window and ask users to refresh.
- Include a theme version bump in the deployment — the new theme build will cause browsers to reload the storefront bundle, which triggers a fresh manifest fetch.
- If instant rollout is required, a short-lived cache-bust parameter on the storefront's entry page will force a reload for all visitors.

### What does this feature NOT do?

- It does NOT cache per-user state such as cart contents, profile data, or saved addresses. Those remain session-managed as before.
- It does NOT change the visual appearance of the storefront.
- It does NOT affect how the storefront handles authentication or authorization.
- It does NOT invalidate automatically when you sign in, sign out, or switch organizations within the same browser tab. The manifest is scoped to the storefront domain, not to the authenticated user (see [Known limitations](#6-verified-scope-and-known-limitations) — F2).

---

## 3. Platform administrator guide

This section is for **platform administrators** who manage the Virto Commerce Admin SPA and control platform settings.

### The new setting: Return module version

A new setting was added to the platform as part of this story:

| Property | Value |
|---|---|
| **Setting name** | `XAPI.Security.ReturnModuleVersion` |
| **Location in Admin SPA** | Settings → Platform → Security → "Return module version" |
| **Direct path** | `{ADMIN_URL}/#!/workspace/settings` — search "Return module version" |
| **Control type** | Toggle switch (checkbox) |
| **Default** | ON (checked) |

**Screenshots from vcst-qa (2026-05-21):**
- English label: `tests/Sprint-current/VCST-4642/VCST-4642-be4-setting-en.png`
- German label: `tests/Sprint-current/VCST-4642/VCST-4642-be7-setting-de.png`

The setting description (visible via the ? tooltip in the Admin SPA) reads:

> "When enabled, module versions and the full list of installed modules are returned in the store response."

### What the toggle controls

| | Toggle ON (default) | Toggle OFF |
|---|---|---|
| **`modules[].version`** | Full semver string, e.g. `"3.1022.0"` | Empty string `""` (never `null`) |
| **Modules without public settings** | Included in the list | Excluded from the list |
| **Number of modules returned** | All installed modules (~79 on a typical install) | Only modules that have at least one public setting (~18 on vcst-qa with default modules) |
| **Module IDs returned** | Yes, for all modules | Yes, but only for modules with public settings |
| **Effect on storefront gating** | Storefront knows the full installed set | Storefront still gates correctly; it will not request fields from modules missing from the list |

**Verified on vcst-qa:** with toggle ON, 79 modules with populated versions were returned. With toggle OFF, 18 modules were returned, all with `version: ""`.

### Security trade-off

The `XAPI.Security.ReturnModuleVersion` setting exists specifically to address this concern: an attacker who can read the list of installed modules and their exact versions has a fingerprint they can cross-reference against known CVEs or vulnerability databases to target specific version ranges.

| Scenario | Recommended setting |
|---|---|
| **Public-facing production storefront** | OFF — reduces version fingerprinting exposure |
| **Internal B2B portal behind VPN or IP allowlist** | ON is acceptable; depends on your organization's security policy |
| **Dev / QA / staging environments** | ON — version information aids debugging and version verification |
| **Environments where ops teams use manifest for version diagnostics** | ON |

The default is ON to make it easy for development and integration teams to verify correct module installation. **You should evaluate flipping it to OFF for any production storefront that is accessible on the public internet.**

### Does a restart required after changing the setting?

No. The setting takes effect on the very next GraphQL request after you save it. No platform restart is required and no cache invalidation step is needed. This was verified live on vcst-qa: the response changed immediately after saving the toggle.

### What happens to existing customer browser sessions when I flip the toggle?

Existing browser-cached manifests are NOT automatically invalidated. A customer who already has a manifest stored in `localStorage` will continue to use the cached version until they do a hard refresh or their browser session expires.

**Practical guidance:**
- If you are flipping the toggle to OFF for security reasons, plan the change outside business hours, or accompany it with a deployment-time cache-bust so all active sessions pick up the new (reduced) manifest promptly.
- If you are flipping back to ON, the impact is lower — customers will eventually pick up the full manifest on their next session.

### Localization

The setting label and description are localized. Verified locales:

| Locale | Setting label | Description |
|---|---|---|
| English | "Return module version" | "When enabled, module versions and the full list of installed modules are returned in the store response" |
| German (Deutsch) | "Modulversion zurueckgeben" | "Wenn aktiviert, werden Modulversionen und die vollstaendige Liste der installierten Module in der Shop-Antwort zurueckgegeben" |

Other locales follow the standard Virto Commerce platform translation path. No missing-key fallback was observed for either tested locale.

---

## 4. Frontend integrator guide

This section is for **frontend integrators and partners building custom storefronts** on top of the Virto Commerce xAPI.

For the full operation definition, field-by-field schema, variable contract, example cURL calls, and error response shapes, see the companion **API reference**:

```
docs/vcst-4642-api-reference.md
```

This section covers the integrator workflow: how to call the query, how to use the gating directive, and what to check before merging a new query.

### The query to call: `initializeApplication`

Call this query once when the application boots, before firing any optional feature queries. It resolves the store's installed module list, languages, currencies, and public settings in a single round-trip.

The query file is at `test-data/graphql/queries/initializeApplication.graphql`. The key part of the response for gating purposes is `store.settings.modules[]`, which contains `moduleId`, `version`, and `settings` for every installed module.

Pass the storefront domain as the resolver variable. The vc-frontend client passes the browser's `window.location.hostname`:

```graphql
query initializeApplication($domain: String, $storeId: String, $cultureName: String) {
  store(domain: $domain, storeId: $storeId, cultureName: $cultureName) {
    storeUrl
    settings {
      modules {
        moduleId
        version
        settings {
          name
          value
        }
      }
    }
  }
}
```

**Variables (domain-based, matching real client behavior):**
```json
{ "domain": "your-storefront-host.example.com" }
```

**Variables (storeId-based, for backend/admin tooling):**
```json
{ "storeId": "B2B-store", "cultureName": "en-US" }
```

This query is **public** — no authentication header is required. It is safe to call from an anonymous browser context.

### How to gate optional fragments: `@needsModule`

Annotate any selection that depends on an optional xAPI extension module with the client directive `@needsModule(name: "VirtoCommerce.<ModuleName>")`.

The Apollo link `apply-gates-link.ts` reads the in-memory manifest (populated by `initializeApplication`) and strips any annotated selection whose named module is absent from the manifest, before the request is sent. This means the query is never fired, the server never sees the field, and no `Cannot query field` error occurs.

**Example:**

```graphql
query GetPageContext($storeId: String!) {
  whiteLabelingSettings @needsModule(name: "VirtoCommerce.WhiteLabeling") {
    logoUrl
    secondaryLogoUrl
    themePresetName
    favicons
  }

  customerReviewsSummary(productId: $productId)
    @needsModule(name: "VirtoCommerce.CustomerReviews") {
    reviewCount
    rating
  }
}
```

When `VirtoCommerce.WhiteLabeling` is present in the manifest, the `whiteLabelingSettings` selection is sent. When it is absent, the selection is stripped client-side and the query goes out without it. The same logic applies to `customerReviewsSummary` for `VirtoCommerce.CustomerReviews`.

### Which fields require gating?

Gate any field contributed by an **xAPI extension module**. Core xAPI fields (authentication, cart basics, orders, catalog search) are always available. The following modules are the primary extension contributors:

| Module ID | Contributed fields (examples) |
|---|---|
| `VirtoCommerce.WhiteLabeling` | `whiteLabelingSettings` |
| `VirtoCommerce.CustomerReviews` | `customerReviewsSummary`, `createReview`, `updateReview` |
| `VirtoCommerce.XPickup` | Pickup/BOPIS cart and shipping fields |
| `VirtoCommerce.XCMS` | CMS page content fields |
| `VirtoCommerce.XCatalog` | Extended catalog fields |
| `VirtoCommerce.XCart` | Extended cart fields |
| `VirtoCommerce.XOrder` | Extended order fields |
| `VirtoCommerce.XMarketing` | `promotionCoupons`, marketing extension fields |
| `VirtoCommerce.ProfileExperienceApiModule` | Extended profile / address fields |
| `VirtoCommerce.FileExperienceApi` | File upload experience fields |

**Note on `VirtoCommerce.XMarketing`:** The existing `GetPromotionCoupons` query is missing its `@needsModule` directive and produced HTTP 400 on `/cart` on the morning of 2026-05-21 (signed-in customer, cart with promo-eligible items). On an afternoon recheck the same day, the platform manifest had changed and `VirtoCommerce.MarketingExperienceApi` v3.1001.0 was now present; an anonymous `/cart` probe did not reproduce the 400. A signed-in retest is needed to confirm whether F1 is resolved by the new module or only suppressed by anonymous traffic. Tracked as follow-up work (see [Known limitations](#6-verified-scope-and-known-limitations) — F1).

### Caching the manifest

The vc-frontend caches the manifest in `localStorage` with a domain-scoped key:

```
vc:initialStore:v1:<storefront-domain>
```

The `:v1:` infix is a schema version marker. If you build a custom storefront, use the same key convention so your caching layer is compatible with platform updates. If the manifest schema changes in a future release, the key suffix will be bumped (e.g., `:v2:`), and old cached values will be ignored.

### Pre-flight checklist before merging a new query

Before merging any new GraphQL query that touches an xAPI extension field:

- [ ] Identify which xAPI extension module contributes the field (see table above or check `graphql-schema.md`).
- [ ] Add `@needsModule(name: "VirtoCommerce.<ModuleName>")` to the root selection that depends on that module.
- [ ] **Preferred — test against a real backend absence:** deploy to (or pull a snapshot of) an environment that does NOT have the module installed. On 2026-05-21 afternoon the gating was re-verified live on vcst-qa with `VirtoCommerce.WhiteLabeling` genuinely absent from the manifest — both the inline `whiteLabelingSettings` selection and its fragment definition were stripped from `GetPageContext`, and no `Cannot query field` errors appeared. See `tests/Sprint-current/VCST-4642/recheck-2026-05-21-whitelabeling-absent.md`.
- [ ] **Fallback — simulate the absence:** if you cannot test against a real backend absence, edit the in-memory manifest in `localStorage["vc:initialStore:v1:<domain>"]` to remove the module entry, then reload the page. Verify:
  - The annotated selection is stripped from the outgoing request body.
  - The fragment definition (if the selection used a `fragment ... on <Type>`) is also stripped — the gate removes both the use and the dependent fragment.
  - The browser console shows no `Cannot query field` or `Unknown field` errors.
- [ ] If the module is always present in your deployment and you are certain it will never be absent, document that assumption explicitly in a comment next to the query — do not silently omit `@needsModule`. Module availability on shared QA environments can change between sessions (this was observed on 2026-05-21 when `VirtoCommerce.WhiteLabeling` dropped from the vcst-qa manifest between morning and afternoon test runs).

---

## 5. Module version mismatch detection (non-production mode)

This is the second half of Step 3 in the story acceptance criteria — the **Expected Modules Validation** flow. The frontend ships with a baked-in map of minimum module versions it requires. On every app boot, after receiving the capability manifest, it compares each installed module version against its baked-in expectation. If any installed module is older than the frontend's minimum, the storefront displays a red error toast listing the mismatches.

### What triggers the warning

All three conditions must hold for the toast to appear:

1. `XAPI.Security.ReturnModuleVersion` is **ON**. When the setting is OFF, the manifest returns empty version strings, the comparison is skipped, and the toast never fires regardless of mismatch.
2. The storefront is running in **non-production mode** (dev / QA / staging builds). Production builds suppress the toast so end customers never see it; the comparison still runs server-side as part of compatibility analytics, but the UI is silent.
3. At least one module's installed version is **strictly lower** than the version the frontend was built to require.

### What the toast says

```
The frontend application expects newer versions of the Platform and one or more
Modules. Frontend Application is running on an incompatible backend. Some features
may be unavailable, degraded, or unstable until the Platform and Modules are
upgraded to meet the storefront's requirements. Please share the report below
with your administrator.

VirtoCommerce.Catalog   3.1022.0 ≥ 3.1020.0
VirtoCommerce.Pages     3.1005.0 ≥ 3.1004.0
VirtoCommerce.BuilderIO 3.1003.0 ≥ 3.1002.0
...

[ Copy to clipboard ]
```

Reference screenshot in JIRA: `Screenshot 2026-05-21 143309.png` attached to VCST-4642. Local copy: `tests/Sprint-current/VCST-4642/jira-attachment-75069-version-mismatch.png`.

### Reading the mismatch lines

Each row uses the format:

```
<moduleId>   <expected-minimum-version>   ≥   <installed-version>
```

In words: **"the frontend was built to require *at least* `<expected-minimum-version>`, but the platform only reports `<installed-version>`."** The `≥` is the failure-condition predicate, not a confirmation that the installation is fine.

Concrete example from the captured screenshot: `VirtoCommerce.Catalog 3.1022.0 ≥ 3.1020.0` reads as "Catalog: storefront needs **at least 3.1022.0**, platform has **3.1020.0** → upgrade Catalog."

### Verified live on vcst-qa (2026-05-21)

This dialog was reproduced by intentionally rolling the platform back to older module versions ~14:30 today. The frontend immediately surfaced the toast above. After restoring the platform to current versions (Catalog 3.1022.0, Pages 3.1005.0, BuilderIO 3.1003.0 — the values shown on the **left** side of the screenshot), the dialog stopped firing. This confirms two things:

- The dialog reads from a **live** manifest fetch, not a cached one — the comparison re-runs whenever `InitializeApplication` produces a fresh response.
- The version comparison is **per module**, not "all or nothing" — when only some modules are out of date, only those rows appear in the list.

### "Copy to clipboard" button

The toast includes a single action: **Copy to clipboard**. It serializes the full mismatch list as plain text (the same content shown in the toast body, minus the header paragraph), suitable for pasting into a Slack message, a JIRA ticket, or an email to the platform admin. The intent is to make it trivial for an integrator or QA to share a precise, machine-readable upgrade target with the operations team.

### What end users see

Nothing. Customer-facing production builds suppress the toast. The mismatch detection is a developer/operator signal designed to catch deployment-drift between the frontend bundle and the backend platform during integration testing and pre-production validation.

### What operators / admins should do when they see it

1. Click **Copy to clipboard**.
2. Share the report with the platform team.
3. Coordinate a platform upgrade so every listed module reaches the expected-minimum version.
4. Once upgraded, do a hard refresh of the storefront. The dialog should disappear on the next manifest fetch.

If a downgrade is intentional (e.g., rolling back a regression and accepting that some storefront features will degrade), the dialog is informational only — it does NOT block storefront operation. Pages render, transactions complete, and the gating system continues to strip queries for modules that are absent entirely. The toast simply warns that some features may behave unexpectedly because the storefront was built against newer module contracts.

### How to silence the dialog in non-production diagnostically

The dialog only fires when versions are visible (setting ON) and a mismatch is detected. Two ways to suppress it temporarily without fixing the underlying drift:

- **Flip `XAPI.Security.ReturnModuleVersion` to OFF.** Empties the versions; comparison is skipped. Has the side effect of also hiding versions from any monitoring/diagnostics that depend on them.
- **Build the storefront in production mode locally** for the duration of the test. Suppresses the toast without changing the platform.

Neither is a fix — both are workarounds for short-lived investigation work. The right fix is always to align the platform module versions with the frontend's expectations or rebuild the frontend against the older platform.

---

## 6. Verified scope and known limitations

### Acceptance criteria results

| AC | Description | Result |
|---|---|---|
| AC1 | `ModuleSettings.version` field present in schema as `String!` (non-null) | PASS |
| AC2 | Modules without public settings are still listed in the manifest | PASS |
| AC3 | Module versions in the manifest match the versions declared in `packages.json` | PASS |
| AC4 | `XAPI.Security.ReturnModuleVersion` setting exists in Admin SPA, default ON | PASS |
| AC5 | Toggling OFF empties all versions (`""`) and drops modules without public settings | PASS |
| AC6 | Setting is localized in English and German | PASS |
| AC7 | `initializeApplication` fires on app startup before other feature queries | PASS |
| AC8 | `whiteLabelingSettings` fragment is included in requests when module is installed | PASS |
| AC9 | `@needsModule` gating strips annotated selections when module is absent from manifest | PASS (re-verified 2026-05-21 PM against a real backend absence of `VirtoCommerce.WhiteLabeling` — see [Real-world recheck](#real-world-recheck-2026-05-21-pm)) |
| AC10 | No runtime console errors introduced by the new boot sequence | PASS WITH NOTE |
| AC11 | Manifest is cached per session — `initializeApplication` does not re-fire on navigation | PASS |

**AC10 note:** Module-gated queries produce zero console errors for fields governed by the new system. One adjacent pre-existing query (`GetPromotionCoupons`) lacks a `@needsModule` directive and produces an HTTP 400 on `/cart`. This error was surfaced by the new gating system making other queries clean, but the `GetPromotionCoupons` gap was not introduced by this story. It is tracked as a follow-up (see F1 below).

### Real-world recheck (2026-05-21 PM)

The morning sign-off verified AC9 (`@needsModule` strips selections when module is absent) using a **simulated** absence — the manifest in `localStorage` was edited in the browser to remove the WhiteLabeling entry. An afternoon recheck on the same day caught the gating in a **real** failure mode: the vcst-qa platform had stopped reporting `VirtoCommerce.WhiteLabeling` in its capability manifest (82 modules total, none of them WhiteLabeling), and the storefront's `apply-gates-link` correctly stripped:

- the inline `whiteLabelingSettings { ... }` selection in `GetPageContext`, and
- the `whiteLabelingFields` fragment definition that the selection referenced.

Both the homepage (`/`) and `/contact` returned 200 with clean console output. The storefront rendered using its bundled Coffee theme — no white-label theme override, no broken images, no Vue warnings.

This upgrades AC9 to a real-world PASS rather than a simulated PASS. Same gate, harder evidence.

**Side observation, not part of the recheck:** Between the morning and afternoon test runs the platform's installed-module set changed. `VirtoCommerce.WhiteLabeling` dropped out and `VirtoCommerce.MarketingExperienceApi`, `PushMessages`, `Quote`, and `XRecommend` were added. The cause is unconfirmed (uncoordinated module redeploy, per-store filter change, or operator action). Useful to know: module availability on shared QA environments is not stable between sessions — your `@needsModule` directives need to handle absence in both directions over time.

Full report and per-request evidence: `tests/Sprint-current/VCST-4642/recheck-2026-05-21-whitelabeling-absent.md`.

### Known limitations / open follow-ups

#### F1 — `GetPromotionCoupons` query is missing `@needsModule` (P2)

**Severity:** P2 — recoverable HTTP 400, no user-visible breakage on the `/cart` page, but the error appears in the console and in backend logs.

**What happens:** When `VirtoCommerce.XMarketing` is not installed on the platform, the `GetPromotionCoupons.graphql` query fires unconditionally and returns `HTTP 400 — Cannot query field 'promotionCoupons' on type 'Query'`.

**Root cause:** The query is missing `@needsModule(name: "VirtoCommerce.XMarketing")`. The manifest correctly excludes this module when it is absent, but the query does not consult the manifest.

**Status:** Adjacent finding — not introduced by VCST-4642. Tracked for a follow-up ticket. The fix is one-line: add `@needsModule(name: "VirtoCommerce.XMarketing")` to `GetPromotionCoupons.graphql`.

**Update — 2026-05-21 PM recheck:** The vcst-qa manifest now contains `VirtoCommerce.MarketingExperienceApi` v3.1001.0 (it was absent in the morning). An anonymous `/cart` probe did not fire `GetPromotionCoupons` and therefore did not reproduce the 400. Two possibilities remain open: (a) `MarketingExperienceApi` is the new ID for what was previously called `XMarketing` and the resolver now answers the query — F1 is functionally resolved; (b) the operation simply doesn't fire for anonymous users and a signed-in retest is still needed. A signed-in `/cart` retest is required to close F1.

---

#### F8 — Per-store feature flag `WhiteLabeling.WhiteLabelingEnabled` exposed in manifest but not consumed by vc-frontend (P2)

**Severity:** P2 — no user-visible breakage, but the backend capability ships without a frontend consumer.

**What happens:** The `WhiteLabeling.WhiteLabelingEnabled` per-store setting is correctly propagated through the PR-66 capability manifest (verified: `localStorage` reflects the flag value after a fresh fetch). However, vc-frontend PR-2293 does not read this flag to make any decisions. When the flag is set to `false`:

- The `whiteLabelingSettings` fragment is **still requested** by `GetPageContext`.
- The server still returns the full payload.
- The storefront appearance is unchanged.

The backend half of the per-store feature-flag capability ships correctly. The frontend wiring is missing.

**Status:** Tracked for follow-up. Two paths forward: (a) wire `useWhiteLabeling()` / `useThemeContext()` composables to gate on the flag value and fall back to bundled defaults when the flag is `false`; or (b) introduce a companion client directive `@needsFlag(name: "WhiteLabeling.WhiteLabelingEnabled")` analogous to `@needsModule`. Neither path was in scope for VCST-4642.

---

### Additional exploratory observations (not blocking)

| ID | Type | Summary |
|---|---|---|
| F2 | Risk | Manifest cache is domain-scoped, not user/org-scoped. Sign-in and org-switch do not invalidate the cache. In environments where module availability differs by org (theoretical), this could cause stale gating. |
| F3 | Observation | An empty `modules: []` manifest is non-fatal — the app degrades gracefully to "no optional features" with zero console errors. |
| F4 | Observation | Module versions are not surfaced in the storefront UI. They are readable via GraphQL when `ReturnModuleVersion` is ON but are not displayed on any page. |
| F5 | Observation | `initializeApplication` fires exactly once per logical session across multiple page navigations. |
| F6 | Question | The `:v1:` cache key version suffix has no documented migration path for future schema bumps. Likely handled by a key change, but no contract is defined. |

---

## 7. Where to read more

| Resource | Location |
|---|---|
| Story | https://virtocommerce.atlassian.net/browse/VCST-4642 |
| Backend PR (vc-module-x-api#66) | https://github.com/VirtoCommerce/vc-module-x-api/pull/66 |
| Frontend PR (vc-frontend#2293) | https://github.com/VirtoCommerce/vc-frontend/pull/2293 |
| API reference (field schema, cURL, error contract) | `docs/ba-output/vcst-4642-api-reference.md` |
| Test evidence (screenshots, HAR, JSON responses) | `tests/Sprint-current/VCST-4642/` |
| Real-module-absence recheck report (2026-05-21 PM) | `tests/Sprint-current/VCST-4642/recheck-2026-05-21-whitelabeling-absent.md` |
| GraphQL query file | `test-data/graphql/queries/initializeApplication.graphql` |
| xAPI GraphQL schema reference | `.claude/agents/knowledge/graphql-schema.md` |
