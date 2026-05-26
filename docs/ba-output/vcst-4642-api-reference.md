# `initializeApplication` — xAPI GraphQL Reference

> **Backend PR**: [vc-module-x-api#66](https://github.com/VirtoCommerce/vc-module-x-api/pull/66)
> **Frontend PR** (consumer — informational): [vc-frontend#2293](https://github.com/VirtoCommerce/vc-frontend/pull/2293)
> **Tested on**: vcst-qa — Platform `3.1028.0`, Xapi `3.1009.0-pr-66-020b`, Theme `2.50.0-pr-2293-55fc`
> **Endpoint**: `POST https://{BACK_URL}/graphql`
> **Status**: Signed off 2026-05-21 (PASS WITH NOTES — see §9)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Query contract](#2-query-contract)
3. [Response shape](#3-response-shape)
4. [Worked examples](#4-worked-examples)
5. [Security setting — `XAPI.Security.ReturnModuleVersion`](#5-security-setting)
6. [Client-side `@needsModule` directive](#6-client-side-needsmodule-directive)
7. [Error contract](#7-error-contract)
8. [Caching contract](#8-caching-contract)
9. [Known gaps / follow-ups](#9-known-gaps--follow-ups)
10. [Quick reference cheatsheet](#10-quick-reference-cheatsheet)

---

## 1. Overview

`initializeApplication` is the storefront bootstrap query fired once per session before any feature-level GraphQL operations run. It resolves the store configuration — languages, currencies, store settings — and, as of vc-module-x-api PR#66, a **capability manifest**: a flat list of every platform module installed on the backend, carrying its `moduleId`, `version`, and per-module public settings. vc-frontend uses this manifest to drive the `@needsModule` Apollo gating link, which strips optional GraphQL fragments from outgoing requests when the required module is absent. This prevents `Cannot query field` HTTP 400 errors when an extension module (XMarketing, XPickup, CustomerReviews, etc.) is not deployed on a particular environment. The operation is anonymous — no `Authorization` header is required — because it must resolve before authentication state is known.

**Operation name**: `initializeApplication` (case-sensitive — vc-frontend filters the Network panel by this exact string).

**Related PRs**:
- `vc-module-x-api#66` — extends `StoreSettingsType` with `modules: [ModuleSettingsType!]!`
- `vc-frontend#2293` — consumes the manifest, caches in `localStorage["vc:initialStore:v1:<domain>"]`, powers `apply-gates-link`

---

## 2. Query contract

### Resolver signature (live-introspected, vcst-qa 2026-05-21)

```graphql
store(
  storeId:    String      # nullable — identify store by its platform ID
  cultureName: String     # nullable — BCP-47 tag; defaults to "en-US" client-side
  domain:     String      # nullable — identify store by its public storefront hostname
): StoreResponseType
```

All three arguments are nullable `String`. The resolver accepts any single argument or combination. **Pass exactly one identifier** (`domain` or `storeId`) per call — passing both is unspecified behavior. vc-frontend always passes `domain` (the current `window.location.hostname`); backend tooling typically passes `storeId`.

### Full operation SDL

Paste-ready query as stored in `test-data/graphql/queries/initializeApplication.graphql`:

```graphql
query initializeApplication($domain: String, $storeId: String, $cultureName: String) {
  store(domain: $domain, storeId: $storeId, cultureName: $cultureName) {
    storeId
    storeName
    catalogId
    storeUrl
    defaultLanguage {
      cultureName
      nativeName
      twoLetterLanguageName
      threeLetterLanguageName
    }
    availableLanguages {
      cultureName
      nativeName
      twoLetterLanguageName
      threeLetterLanguageName
    }
    defaultCurrency {
      code
      symbol
      englishName
      cultureName
      exchangeRate
      customFormatting
    }
    availableCurrencies {
      code
      symbol
      englishName
      cultureName
      exchangeRate
      customFormatting
    }
    settings {
      taxCalculationEnabled
      anonymousUsersAllowed
      emailVerificationEnabled
      emailVerificationRequired
      seoLinkType
      environmentName
      authenticationTypes
      passwordRequirements {
        requiredLength
        requiredUniqueChars
        requireNonAlphanumeric
        requireLowercase
        requireUppercase
        requireDigit
      }
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

### Variables

| Variable | Type | Required | Default | Notes |
|---|---|---|---|---|
| `domain` | `String` | No* | — | Storefront hostname (e.g. `vcst-qa-storefront.govirto.com`). Preferred for storefront use. Pass this OR `storeId`, not both. |
| `storeId` | `String` | No* | — | Platform store ID (e.g. `B2B-store`). Use for backend tooling and admin-side probes. |
| `cultureName` | `String` | No | `"en-US"` (client-side default) | BCP-47 language tag. Controls which translations are returned in `defaultLanguage` / `availableLanguages`. |

*At least one of `domain` or `storeId` must be provided to resolve a store. Passing neither returns `data.store: null` (not an error).

---

## 3. Response shape

Four types form the response chain: `StoreResponseType` → `StoreSettingsType` → `ModuleSettingsType` → `ModuleSettingType`.

### `StoreResponseType`

Top-level store object.

| Field | Type | Nullable | Description | Example |
|---|---|---|---|---|
| `storeId` | `String!` | No | Platform store identifier | `"B2B-store"` |
| `storeName` | `String!` | No | Display name | `"B2B Store"` |
| `catalogId` | `String` | Yes | Linked catalog GUID | `"fc596540864a41bf8ab78734ee7353a3"` |
| `storeUrl` | `String` | Yes | Canonical storefront URL | `"https://vcst-qa-storefront.govirto.com"` |
| `defaultLanguage` | `LanguageType` | Yes | Store's default locale | `{ cultureName: "en-US", nativeName: "English (United States)" }` |
| `availableLanguages` | `[LanguageType!]!` | No | All supported locales | — |
| `defaultCurrency` | `CurrencyType` | Yes | Default currency | `{ code: "USD", symbol: "$" }` |
| `availableCurrencies` | `[CurrencyType!]!` | No | All supported currencies | — |
| `settings` | `StoreSettingsType` | Yes | Store settings incl. module manifest | see below |

### `StoreSettingsType`

Store-level operational settings and the module capability manifest.

| Field | Type | Nullable | Description | Example |
|---|---|---|---|---|
| `taxCalculationEnabled` | `Boolean!` | No | Whether tax is calculated at checkout | `true` |
| `anonymousUsersAllowed` | `Boolean!` | No | Whether unauthenticated browsing is permitted | `true` |
| `emailVerificationEnabled` | `Boolean!` | No | Whether email verification flow is active | `false` |
| `emailVerificationRequired` | `Boolean!` | No | Whether verification must complete before access | `false` |
| `seoLinkType` | `String` | Yes | SEO URL strategy (`Collapsed`, `Long`) | `"Collapsed"` |
| `environmentName` | `String` | Yes | Platform environment label | `"Development"` |
| `authenticationTypes` | `[String!]` | Yes | Enabled auth methods | `["Password", "ExternalProvider"]` |
| `passwordRequirements` | `PasswordOptionsType` | Yes | Password policy rules | `{ requiredLength: 8, requireDigit: true, … }` |
| `modules` | `[ModuleSettingsType!]!` | No | **Capability manifest** — list of platform modules installed on the backend. Frontend uses this to gate optional GraphQL fragments via the `@needsModule` directive. | see `ModuleSettingsType` |

### `ModuleSettingsType`

One entry per installed module. Live-introspected schema (vcst-qa, 2026-05-21):

| Field | Type | Nullability | Description | Example |
|---|---|---|---|---|
| `moduleId` | `String!` | `NON_NULL` | Fully-qualified module identifier | `"VirtoCommerce.Catalog"` |
| `version` | `String!` | `NON_NULL` | NuGet/semver version of the installed module. Returns the empty string `""` (NOT `null`) when `XAPI.Security.ReturnModuleVersion` is `false` — this preserves the `String!` non-null contract without a schema change. | `"3.1022.0"` (setting ON) / `""` (setting OFF) |
| `settings` | `[ModuleSettingType!]!` | `NON_NULL LIST NON_NULL` | Per-module **public** settings (those registered with `IsPublic = true` in the module's `ModuleConstants.Settings`). Internal/private settings are never returned. Modules without any public settings return an empty array `[]` when setting is ON; the module entry itself is omitted when setting is OFF. | `[{ name: "Catalog.BrandStoreSetting.BrandsEnabled", value: true }]` or `[]` |

Real examples from vcst-qa (setting ON):

| moduleId | version | settings count |
|---|---|---|
| `VirtoCommerce.Catalog` | `3.1022.0` | 1 (`BrandsEnabled`) |
| `VirtoCommerce.Xapi` | `3.1009.0-pr-66-020b` | 7 (Frontend.* settings) |
| `VirtoCommerce.WhiteLabeling` | `3.1001.0` | 1 (`WhiteLabelingEnabled`) |
| `VirtoCommerce.Pages` | `3.1005.0` | 1 (`VirtoPages.Enable`) |
| `VirtoCommerce.Orders` | `3.1008.0` | 1 (`PurchasedProductStoreFilter.Enable`) |
| `VirtoCommerce.Assets` | `3.1002.0` | 0 (no public settings — empty array) |
| `VirtoCommerce.Marketing` | `3.1003.0` | 0 (no public settings — empty array) |

### `ModuleSettingType`

One public setting key/value pair.

| Field | Type | Nullability | Description | Example |
|---|---|---|---|---|
| `name` | `String!` | `NON_NULL` | Setting key in dot-notation (`Module.Group.Key`) | `"GoogleAnalytics4.MeasurementId"` |
| `value` | `ModuleSettingValue` | Nullable scalar | Setting value. Custom scalar — resolves to `Boolean`, `String`, `Int`, or `null` depending on the setting's registered type. | `true`, `"G-S2KXT3KTJZ"`, `"/catalog"` |

---

## 4. Worked examples

### Example A — Bootstrap by domain (the storefront pattern)

vc-frontend passes the current `window.location.hostname` as `domain`. No `Authorization` header is required.

```bash
curl -s -X POST https://vcst-qa.govirto.com/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "operationName": "initializeApplication",
    "query": "query initializeApplication($domain: String, $storeId: String, $cultureName: String) { store(domain: $domain, storeId: $storeId, cultureName: $cultureName) { storeId storeName storeUrl settings { taxCalculationEnabled anonymousUsersAllowed modules { moduleId version settings { name value } } } } }",
    "variables": { "domain": "vcst-qa-storefront.govirto.com" }
  }'
```

Abbreviated response (real vcst-qa data, setting ON, 80 total modules):

```json
{
  "data": {
    "store": {
      "storeId": "B2B-store",
      "storeName": "B2B Store",
      "storeUrl": "https://vcst-qa-storefront.govirto.com",
      "settings": {
        "taxCalculationEnabled": false,
        "anonymousUsersAllowed": true,
        "modules": [
          {
            "moduleId": "VirtoCommerce.ApplicationInsights",
            "version": "3.1001.0",
            "settings": [
              { "name": "ApplicationInsights.EnableTracking", "value": true },
              { "name": "ApplicationInsights.InstrumentationKey", "value": "48cca1d8-ea02-433e-bfa6-7aa21acb88d9" }
            ]
          },
          {
            "moduleId": "VirtoCommerce.Catalog",
            "version": "3.1022.0",
            "settings": [
              { "name": "Catalog.BrandStoreSetting.BrandsEnabled", "value": true }
            ]
          },
          {
            "moduleId": "VirtoCommerce.Xapi",
            "version": "3.1009.0-pr-66-020b",
            "settings": [
              { "name": "Frontend.PageTitleWithStoreName", "value": false },
              { "name": "Frontend.SupportPhoneNumber", "value": "+1 (213) 603 3536" },
              { "name": "Frontend.CatalogMenuLinkListName", "value": "catalog-menu" }
            ]
          },
          {
            "moduleId": "VirtoCommerce.WhiteLabeling",
            "version": "3.1001.0",
            "settings": [
              { "name": "WhiteLabeling.WhiteLabelingEnabled", "value": true }
            ]
          },
          {
            "moduleId": "VirtoCommerce.Assets",
            "version": "3.1002.0",
            "settings": []
          },
          {
            "moduleId": "VirtoCommerce.Marketing",
            "version": "3.1003.0",
            "settings": []
          }
          // ... 74 more modules
        ]
      }
    }
  }
}
```

### Example B — Bootstrap by storeId (backend tooling)

Use `storeId` when integrating from a backend service, CI pipeline, or admin script where the storefront hostname is not known. Pass `cultureName` to get locale-specific language data.

```bash
curl -s -X POST https://vcst-qa.govirto.com/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "operationName": "initializeApplication",
    "query": "query initializeApplication($domain: String, $storeId: String, $cultureName: String) { store(domain: $domain, storeId: $storeId, cultureName: $cultureName) { storeId defaultLanguage { cultureName } settings { modules { moduleId version settings { name value } } } } }",
    "variables": { "storeId": "B2B-store", "cultureName": "en-US" }
  }'
```

Response shape is identical to Example A. `modules[]` contains 79 entries with real versions (setting ON, verified 2026-05-21 post-restore).

### Example C — Same query when `XAPI.Security.ReturnModuleVersion` is OFF

When the platform setting is disabled, `version` returns `""` for every module and modules without public settings are dropped from the list entirely. The `String!` non-null contract is preserved — `version` is never `null`.

Request body is identical to Example A or B. The response changes as follows (real vcst-qa data, setting OFF):

```json
{
  "data": {
    "store": {
      "settings": {
        "modules": [
          { "moduleId": "VirtoCommerce.ApplicationInsights", "version": "", "settings": [
            { "name": "ApplicationInsights.EnableTracking", "value": true },
            { "name": "ApplicationInsights.InstrumentationKey", "value": "48cca1d8-ea02-433e-bfa6-7aa21acb88d9" }
          ]},
          { "moduleId": "VirtoCommerce.Catalog", "version": "", "settings": [
            { "name": "Catalog.BrandStoreSetting.BrandsEnabled", "value": true }
          ]},
          { "moduleId": "VirtoCommerce.Xapi", "version": "", "settings": [
            { "name": "Frontend.PageTitleWithStoreName", "value": false }
          ]}
          // ... 15 more (18 total with public settings)
          // VirtoCommerce.Assets, VirtoCommerce.Marketing, and 61 other modules without
          // public settings are omitted entirely from this list.
        ]
      }
    }
  }
}
```

**Key differences when setting is OFF:**

| Metric | Setting ON | Setting OFF |
|---|---|---|
| `modules[]` count (vcst-qa) | 79 | 18 |
| `version` values | Real semver strings | `""` (empty string) everywhere |
| `version` nulls | 0 | 0 (non-null contract honored) |
| Modules without public settings | Included with `settings: []` | Omitted from list entirely |

---

## 5. Security setting

### `XAPI.Security.ReturnModuleVersion`

| Property | Value |
|---|---|
| Setting name | `XAPI.Security.ReturnModuleVersion` |
| Group path | `Platform > Security` |
| Control type | Switch toggle (boolean) |
| Default value | `true` (ON) |
| Registered by | `VirtoCommerce.Xapi` module |

**Labels and descriptions:**

| Locale | Label | Description |
|---|---|---|
| EN | "Return module version" | "When enabled, module versions and the full list of installed modules are returned in the store response" |
| DE | "Modulversion zurueckgeben" | "Wenn aktiviert, werden Modulversionen und die vollstaendige Liste der installierten Module in der Shop-Antwort zurueckgegeben" |

**Admin SPA path**: `{BACK_URL}/#!/workspace/settings` — search for "Return module version". The setting appears under the `Platform > Security` group in the settings tree.

**Toggle effect:**

| Setting value | `modules[].version` | `modules[]` count | Modules without public settings |
|---|---|---|---|
| `true` (default) | Real semver string (e.g. `"3.1022.0"`) | All installed modules (~80 on vcst-qa) | Included with `settings: []` |
| `false` | `""` (empty string, never `null`) | Only modules with ≥1 public setting (~18 on vcst-qa) | Omitted |

**Cache lag**: None observed. The change reflects on the very next GraphQL request — no TTL delay was detected in testing.

**Security rationale**: The default ON value makes debugging easy in non-production environments — operators and developers can see exactly which module versions back a deployment. Setting this to `false` in production hides the installed-module fingerprint and version numbers, preventing version-specific vulnerability targeting. The empty-string strategy for `version` (rather than returning `null`) preserves the `String!` non-null schema contract without a schema migration.

---

## 6. Client-side `@needsModule` directive

vc-frontend#2293 introduces an Apollo link (`apply-gates-link`) that strips GraphQL fields or entire operations from outgoing requests when a required module is absent from the capability manifest populated by `initializeApplication`.

**Directive syntax:**

```graphql
query GetPageContext($storeId: String!, $cultureName: String!, $userId: String) {
  # This field is only sent when VirtoCommerce.WhiteLabeling is in the manifest
  whiteLabelingSettings @needsModule(name: "VirtoCommerce.WhiteLabeling") {
    logoUrl
    faviconUrl
    themePresetName
  }

  # This field is always sent (no directive)
  storeSettings {
    taxCalculationEnabled
  }
}
```

**Contract**: A query field or fragment annotated with `@needsModule(name: "X")` is removed from the request payload by `apply-gates-link` when module `X` is absent from the manifest returned by `initializeApplication`. The stripped field never reaches the server, so no `Cannot query field` HTTP 400 is possible. If the entire operation body becomes empty after stripping, the operation is not sent at all.

**Pre-flight rule for xAPI extension fields**: EVERY field contributed by an `vc-module-x-*` package must be gated by `@needsModule` on any client query that requests it. Extension packages include (but are not limited to):

| Module ID | Extension area |
|---|---|
| `VirtoCommerce.XCatalog` | Catalog experience API fields |
| `VirtoCommerce.XCart` | Cart experience API fields |
| `VirtoCommerce.XMarketing` | Promotions / coupon fields |
| `VirtoCommerce.XOrder` | Order experience API fields |
| `VirtoCommerce.ProfileExperienceApiModule` | Profile / account fields |
| `VirtoCommerce.XCMS` | CMS / content fields |
| `VirtoCommerce.XPickup` | BOPIS / pickup fields |
| `VirtoCommerce.FileExperienceApi` | File upload fields |

**Finding F1** (P2, non-blocking at sign-off): `GetPromotionCoupons.graphql` is missing `@needsModule(name: "VirtoCommerce.XMarketing")`. When `VirtoCommerce.XMarketing` is not installed (only `VirtoCommerce.Marketing` is present), this query fires unconditionally and returns HTTP 400 (`Cannot query field`). The `/cart` page generated a console error on vcst-qa when the manifest showed XMarketing absent. See §9 for disposition.

---

## 7. Error contract

| Scenario | HTTP status | `data.store` | `errors` | Notes |
|---|---|---|---|---|
| Valid `domain`, store found | 200 | `StoreResponseType` object | `null` | Normal case |
| Valid `domain`, no matching store | 200 | `null` | `null` | Not an error — resolver returns null for unknown domain |
| Valid `storeId`, store found | 200 | `StoreResponseType` object | `null` | Normal case |
| Neither `domain` nor `storeId` provided | 200 | `null` | `null` | Schema permits both nullable; resolver returns null |
| Schema violation (unknown field in selection) | 400 | — | GraphQL validation errors array | e.g. requesting a field that does not exist |
| Server error | 500 | — | — | Not expected for this resolver; no instances observed in testing |

**Invalid domain behavior** (verified BE-8): `query { store(domain: "does-not-exist.example.com") { storeId } }` returns HTTP 200, `data.store: null`, `errors: null`. The response never includes stack traces, SQL fragments, or internal path disclosures. The error is silent at the GraphQL layer — clients must check for `null` and handle graceful degradation.

---

## 8. Caching contract

This section describes client-side behavior introduced by vc-frontend#2293 — the server has no response caching specific to this operation.

- **Cache key**: `localStorage["vc:initialStore:v1:<domain>"]` where `<domain>` is the storefront hostname used in the `initializeApplication` variables.
- **Cache scope**: Domain-scoped, not user- or org-scoped.
- **Invalidation trigger**: The manifest is not auto-invalidated on sign-in, sign-out, or organization switch (Finding F2). Manual cache clearing (`localStorage.removeItem(...)` + reload) is required to force a re-fetch.
- **Fire frequency**: Single-fire per session (confirmed across 6 navigations in exploratory testing). Does not re-fire on SPA route changes.
- **Cache duration**: Session-scoped — no TTL or explicit expiry was observed in the current implementation. The story description mentions candidate TTLs (5/30/60 min) but these were not implemented in PR#2293; behavior is session-scoped without TTL as of this sign-off.
- **Cache key versioning**: The `:v1:` suffix in the key is reserved for future schema bumps. No migration path (clear-old-key-on-version-change logic) is documented or implemented (Finding F6).

---

## 9. Known gaps / follow-ups

All items below are **P2, non-blocking** for the current release. They were surfaced during exploratory testing (SBTM charter: "Explore application initialization + @needsModule gating boundary", SFDPOT heuristic, 20-minute time box).

| ID | Type | Severity | Summary | Recommendation |
|---|---|---|---|---|
| **F1** | Bug | P2 | `GetPromotionCoupons.graphql` is missing `@needsModule(name: "VirtoCommerce.XMarketing")`. The query fires unconditionally and produces HTTP 400 on `/cart` when `VirtoCommerce.XMarketing` is not installed (only `VirtoCommerce.Marketing` present). Surfaced by the new gating system; pre-existing query gap. | Add `@needsModule(name: "VirtoCommerce.XMarketing")` to the `GetPromotionCoupons` query in vc-frontend. |
| **F8** | Bug | P2 | `WhiteLabeling.WhiteLabelingEnabled` per-store feature flag is now exposed in the capability manifest (PR#66 backend ships) but has no consumer in vc-frontend (PR#2293 frontend half is missing). Toggling the flag OFF leaves the storefront visually unchanged and the `whiteLabelingSettings` fragment is still requested. Backend capability is present; frontend wiring is the gap. | Either add a `@needsFlag(name: "X")` client directive that reads per-module setting values from the manifest, or gate `useWhiteLabeling()` / `useThemeContext()` on `WhiteLabeling.WhiteLabelingEnabled` being `true` in the manifest. |
| **F2** | Risk | P2 | Manifest cache is domain-scoped, not user/org-scoped. No invalidation fires on sign-in, sign-out, or organization switch. A user who signs in mid-session sees the same manifest as an anonymous visitor — this is correct today (manifest is store-level, not user-level), but if per-user module gating is added in future it would be a gap. | Document the cache scope assumption explicitly in vc-frontend. If per-user gating is planned, add an auth-state invalidation hook. |
| **F6** | Question | Low | `localStorage` cache key includes `:v1:` version suffix. No migration path (clear-old-key-on-format-bump) is implemented. A future schema change to the cached object would leave old keys stale indefinitely in returning visitors' browsers. | Document a key-version bump protocol and add migration logic (e.g., clear keys with outdated version prefix on app boot). |

---

## 10. Quick reference cheatsheet

**Minimal request:**

```bash
curl -s -X POST https://vcst-qa.govirto.com/graphql \
  -H "Content-Type: application/json" \
  -d '{"operationName":"initializeApplication","query":"query initializeApplication($domain:String){store(domain:$domain){storeId settings{modules{moduleId version settings{name value}}}}}","variables":{"domain":"vcst-qa-storefront.govirto.com"}}'
```

**Variables** (pick one store identifier):

```json
{ "domain": "<storefront-host>" }
```

or

```json
{ "storeId": "B2B-store", "cultureName": "en-US" }
```

**Expected response path:**

```
data.store.settings.modules: ModuleSettingsType[]
```

- `version` is a non-empty semver string when `XAPI.Security.ReturnModuleVersion = true` (default).
- `version` is `""` (empty string, never `null`) when the setting is `false`.
- Total module count: ~80 on vcst-qa with setting ON; ~18 with setting OFF (only modules with public settings).

**Admin toggle path:** `{BACK_URL}/#!/workspace/settings` — search "Return module version" — `Platform > Security` group.

**GraphiQL UI:** `{BACK_URL}/ui/graphiql`
