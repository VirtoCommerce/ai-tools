# Bug Investigation Flow

> Shared reference for all QA agents. Read when investigating a suspected bug, reproducing a reported issue, or performing root cause analysis.
> Bug report **templates** are in `.claude/skills/qa-methodology/qa-defect/defect-report-templates.md`. This file covers the investigation **process** before the report. For the full defect lifecycle (triage, classification, verification), see `.claude/skills/qa-methodology/qa-defect/defect-lifecycle-workflow.md`.

---

## 1. Investigation Phases

```
BUG REPORTED / SUSPECTED
        │
   ┌────▼─────┐    ┌──────────┐    ┌──────────┐    ┌───────────┐    ┌────────────┐    ┌──────────────┐
   │ RESOLVE  │───►│ REPRODUCE │───►│ ISOLATE  │───►│  GATHER   │───►│ IDENTIFY   │───►│ DOCUMENT &   │
   │ TEST_ENV │    │           │    │  LAYER   │    │ ALL LOGS  │    │ ROOT CAUSE │    │  HAND OFF    │
   └──────────┘    └───────────┘    └──────────┘    └───────────┘    └────────────┘    └──────────────┘
    Which env?      Confirm it's      Layer →         Console, net,     Pattern match     Bug report +
    URLs + App      real & get STR    repoKind →      HAR, Hangfire,    against known     Fix Routing
    Insights +                        module/repo     App Insights      VC patterns       handoff block
    ENV_RISK                          (§3 + §8)       (§4 + §9)         (§7)
                                                            │
                                                   ┌────────┴────────┐
                                                   ▼                  ▼
                                            ┌─────────────┐   ┌──────────────┐
                                            │ SOURCE CODE │   │ APP INSIGHTS │
                                            │ (GitHub)    │   │ (Azure)      │
                                            └─────────────┘   └──────────────┘
                                             §8: Search VC     §9: KQL queries,
                                             module repos,     exceptions, deps,
                                             trace logic       request traces
```

**Key rules:**
- **Resolve `TEST_ENV` *first*** (Section 0) — every URL, credential, and App Insights resource is per-env. Investigating the wrong env wastes the whole session.
- **Never file a bug you cannot reproduce.** If you can't reproduce after exhausting the checklist in Section 2, document the failed attempt and escalate.
- **Gather *all* logs, not just the browser** (Section 4 + 9) — a frontend symptom often has a server-side cause that only App Insights / Hangfire reveal.

---

## 0. Resolve the Environment (`TEST_ENV`) — DO THIS FIRST

Before reproducing anything, pin which environment you are investigating. The project is multi-env
(layered loader keyed by `TEST_ENV`, default `vcst`); URLs, credentials, store IDs, **and the Azure App
Insights resource pair all differ per env.** A bug confirmed on the wrong env is a wasted session — and
"works on QA, fails on staging" is itself a frequent root cause (version skew).

1. **Determine `TEST_ENV`.** Use the value the user named; else the ticket's environment field; else the
   default `vcst`. State it explicitly at the start of the investigation ("Investigating on `TEST_ENV=vcst`").
2. **Resolve the endpoints** for that env (config.js loads `.env.${TEST_ENV}`): `FRONT_URL`, `BACK_URL`,
   `STORE_ID`, `ENV_RISK`. Run `/qa-env-check endpoints` to confirm they're reachable and healthy
   (`{BACK_URL}/health` — see memory `Platform health endpoint`). A red endpoint = stop and report infra,
   don't chase a "bug".
3. **Note `ENV_RISK`.** If the env is production-class, treat all reproduction as read-only — no seeding,
   no state mutation, no destructive repro.
4. **Discover the matching App Insights resource** for this env (Section 9 — by matching the active
   `BACK_URL`/`FRONT_URL`, not by assuming a fixed name; some envs like `localhost`/fresh demos have none).
   Record what you found now so every KQL query in Section 9 targets the right resource.
5. **Capture the build versions** for this env (`{BACK_URL}/#!/workspace/systeminfo` or the deploy repo's
   `packages.json`/`artifact.json`) — needed for the Module Versions line in the report and for P1 version-skew.

> Output of Section 0 is a one-line env header you carry into the report:
> `Env: <TEST_ENV> — <FRONT_URL> / <BACK_URL> @ Platform <ver>, Theme <ver> (ENV_RISK=<level>)`

---

## 2. Structured Reproduction Strategy

### From Vague Report to Deterministic STR

1. **Clarify the symptom** — What was seen vs. what was expected? Get the exact page URL and user action.
2. **Identify minimum path** — Shortest sequence of actions that triggers the bug.
3. **Test variables** — Systematically change one variable at a time:
   - User role (admin, customer, guest)
   - Browser (Chrome, Firefox, Edge)
   - Viewport (desktop 1920px, tablet 768px, mobile 375px)
   - Store / language / currency
   - Cart state (empty, with items, mixed pickup/delivery)
   - Authentication state (fresh login vs. long-lived session)
4. **Confirm consistency** — Reproduce 3 consecutive times. If intermittent, note rate (X/10).
5. **Record the STR** — Numbered steps that anyone can follow to trigger the bug.

### Cannot Reproduce? Try This

| Situation | What to Try |
|---|---|
| Works on Chrome | Test Firefox, Edge — check for browser-specific CSS/JS |
| Works for admin user | Test with customer role, different org, guest user |
| Works on desktop | Test mobile viewport (375px), tablet (768px) |
| Works with fresh cart | Test with items in cart, saved-for-later items, mixed pickup/delivery |
| Works after fresh login | Test with stale session, expired token, incognito |
| Only fails sometimes | Check for race conditions, stale cache, ES index lag (wait 5s, retry) |
| Works on one env, fails on another | Compare platform/module versions across envs at `{BACK_URL}/#!/workspace/systeminfo` (version skew, P1) |

---

## 3. Root Cause Isolation — Decision Tree

**Start at the network tab. The API response tells you which layer owns the bug.**

```
1. CHECK NETWORK TAB (browser_network_requests)
   │
   ├─ GraphQL/API returns ERROR (4xx, 5xx, errors[])
   │  └─► Backend issue → go to step 3
   │
   ├─ GraphQL/API returns CORRECT DATA but UI shows wrong
   │  └─► Frontend issue → go to step 2
   │
   ├─ No API call made at all
   │  └─► Frontend logic bug (routing, state management, event handler)
   │
   └─ API call hangs / times out
      └─► Infrastructure issue → go to step 4
```

### Step 2: Frontend Layer (Vue/TypeScript)

| Symptom | Check | Tool |
|---|---|---|
| Console errors | JS runtime error — check component lifecycle, imports | `browser_console_messages` |
| DOM has correct data, displays wrong | CSS/template issue — inspect computed styles | `browser_snapshot` |
| Component state stale | Vue reactivity issue — store mutation not triggering render | `browser_evaluate` |
| Works in one browser only | Browser-specific CSS/JS — compare across MCP servers | Playwright multi-server |

### Step 3: Backend Layer

**3a. GraphQL xAPI:**
- `errors[]` in response → Read `error.extensions.code` for specific error type
- Null field that should have data → Resolver bug or missing data in underlying module
- Authorization denied (403) → Permission/scope/org issue (see Pattern P3)
- Tool: `browser_network_requests` → inspect response body JSON

**3b. REST API:**
- 4xx → Client request issue (auth token, params, payload format)
- 5xx → Server-side exception — check platform logs
- 200 but wrong data → Business logic bug in module
- Tool: `browser_evaluate` with `fetch()`, curl, or a Postman collection executed via Newman / Postman CLI (the Postman MCP itself doesn't run collections — see `qa-postman/execution.md`)

**3c. Module / Configuration:**
- Feature broken after update → Module version compatibility (see Pattern P1)
- Setting not taking effect → Cache invalidation needed, or platform restart
- Background job not running → Check Hangfire dashboard at `BACK_URL/hangfire`

### Step 4: Infrastructure / Environment

- Timeout → Elasticsearch down, database connection pool exhausted, or DNS issue
- Stale data → Index not rebuilt after data change (see Pattern P2)
- Intermittent failures → Load balancer, cert expiry, or resource contention

### Step 5: Map the owning layer → `repoKind` → repo (the fix target)

Once the lowest failing layer is known, name **where the fix lives** in the same vocabulary
`/qa-bug`'s Fix Routing block and `ci/lib/repo-router.ts` + `ci/config/fix-repos.json` use. This is what
makes the handoff to `/qa-fix` precise (Section 8 then confirms the *exact* repo via `search_code`).

| Lowest failing layer | `repoKind` | Owning repo | Tell-tale |
|---|---|---|---|
| **REST API** (Step 3b wrong) | `module` / `platform` | `vc-module-<name>`; `vc-platform` if security/RBAC/users/dynamic-properties/platform-settings | REST wrong = whole stack inherits it (lowest layer wins). |
| **xAPI / GraphQL only** (3a wrong, REST right) | `module` | `vc-module-x-<name>` (xCart/xCatalog/xOrder/xProfile/xCMS) | Resolver/aggregation bug — REST correct, GraphQL response wrong. |
| **Admin SPA only** | `module` | `vc-module-<name>` (**same repo** — the Angular Admin UI ships inside the module repo) | Admin UI wrong but data correct in REST. |
| **Storefront only** (Step 2) | `frontend` | `vc-frontend` | REST + GraphQL + Admin all correct, only the Vue UI is wrong. |

Resolve the **exact** module name via `.claude/agents/knowledge/module-suite-map.md` (Module → REST path →
xAPI module) + the `fix-repos.json` `routing[]` hints — then confirm in Section 8 with `search_code`. Carry
the result into the report's **Fix Routing** block (see `qa-bug.md` Step 4) so `/qa-fix` Gate 1 can confirm
rather than re-derive. *Determine the layer/module/frontend/platform precisely — never hand off a vague "backend bug".*

---

## 4. Debugging Techniques by MCP Tool

### Gather ALL logs (don't stop at the browser console)

A frontend symptom frequently has a server-side cause that the browser cannot show. For any bug with a
backend or data component, collect **every** log source below before concluding root cause — partial
evidence is how by-design behavior and infra blips get misfiled as code bugs.

| Source | Where / Tool | Always capture |
|---|---|---|
| **Browser console** | `browser_console_messages` (all tabs incl. Admin SPA via Chrome DevTools) | errors + warnings tied to the action; ignore favicon/analytics noise |
| **Network / HAR** | `browser_network_requests` → export HAR | the failing request URL/payload/status + the **operation/trace ID** for §9 correlation |
| **Hangfire jobs** | `{BACK_URL}/hangfire` — Failed / Scheduled / Recurring tabs | failed background jobs behind "didn't happen" symptoms (P8) |
| **Platform / module info** | `{BACK_URL}/#!/workspace/systeminfo` | platform + module versions (P1 version-skew) |
| **Application Insights** | Azure MCP `applicationinsights` — **env-matched resource** (§9) | server exceptions, dependency failures, and the full request trace for the op ID. **Mandatory whenever any REST/xAPI/Admin layer is involved.** |

> Pull the **operation/trace ID** from the failed request in the network tab (`Request-Id` / `traceparent`)
> — it is the join key that turns a browser 500 into a full server-side root cause in §9. Capture it during
> reproduction; it's hard to recover later.

### By symptom

| Symptom | Tool | Technique |
|---|---|---|
| UI renders wrong | `browser_snapshot` | Compare DOM structure against expected; look for missing/extra elements |
| Console error | `browser_console_messages` | Filter by `error`; correlate timestamp with the user action that triggered it |
| API returns error | `browser_network_requests` | Find the request → inspect response body for `errors[]` array with codes |
| Slow page load | `browser_network_requests` | Sort by duration; find requests >500ms; check payload sizes |
| Payment iframe issue | `browser_evaluate` | Decode iframe `name`/`src` attributes (Base64); inspect SDK config objects for `[object Object]` |
| Admin SPA Angular error | Chrome DevTools `list_console_messages` | Filter for Angular zone errors, unhandled promise rejections |
| Data mismatch front vs back | Compare `browser_network_requests` (storefront) vs Postman (direct API call) | If responses differ → frontend is transforming or caching data |
| GraphQL returns partial data | `browser_evaluate` with introspection query | Check if field was removed/renamed in schema update |

---

## 5. Environment & Data Isolation

Before filing: confirm the bug is a real defect, not environment- or data-specific.

### Environment Isolation
- [ ] `TEST_ENV` resolved and stated (Section 0) — reproduced on that env's `FRONT_URL`/`BACK_URL`
- [ ] Platform version checked at `{BACK_URL}/#!/workspace/systeminfo`
- [ ] Module versions noted (mismatch between environments? — "works on env A, fails on env B" = version skew, P1)

### Browser Isolation
- [ ] Tested in Chrome (primary) AND at least one of: Firefox, Edge
- [ ] If browser-specific → note which browsers affected vs. unaffected
- [ ] Mobile viewport tested (375px) if it's a UI bug

### User & Data Isolation
- [ ] Tested with primary user (`USER_EMAIL`)
- [ ] Tested with secondary user (`USER2_EMAIL`) — same result?
- [ ] Tested with admin role — same result?
- [ ] If org-scoped → tested with user in a different organization
- [ ] If cart-related → tested with empty cart AND cart with items

### Data Freshness
- [ ] Elasticsearch index current? (Admin > Search Index > check last rebuild timestamp)
- [ ] Data recently modified? (stale cache possible — wait 30s, retry)
- [ ] Background jobs running? (`BACK_URL/hangfire` — check Failed and Scheduled tabs)

---

## 6. Cross-Layer Investigation Pattern

When the storefront displays incorrect data:

1. **CAPTURE** what the frontend shows → screenshot + `browser_snapshot`
2. **INSPECT** the GraphQL response → `browser_network_requests` → find the query → read response body
3. **COMPARE:** Does the GraphQL response match what the UI shows?
   - **YES, response is also wrong** → Bug is in the backend (GraphQL resolver or underlying module)
   - **NO, response is correct but UI is wrong** → Bug is in the frontend (Vue component, store, or template)
4. **If backend:** Call the REST API directly (Postman or `browser_evaluate` with `fetch`)
   - REST correct, GraphQL wrong → Bug in xAPI resolver layer
   - REST also wrong → Bug in module business logic or data
5. **If data issue:** Check the entity in Admin SPA
   - Admin shows correct data → Backend read-path bug (query/filter/cache)
   - Admin shows wrong data too → Data corruption or import bug

**Example: "Wrong price on product page"**
→ Check GraphQL `SearchProducts` response → `price` field correct?
→ If correct: Vue component is formatting/displaying wrong (frontend)
→ If wrong: Check REST `/api/pricing/pricelists` → price correct there?
→ If REST correct: xCatalog resolver not joining pricing data (xAPI bug)
→ If REST wrong: Check pricelist assignment & tier pricing in Admin (module/config)

---

## 7. Common Root Cause Patterns in Virto Commerce

### P1: Module Version Incompatibility
**Symptom:** Feature returns NOT_IMPLEMENTED, 500, or missing methods after platform update.
**Cause:** Module compiled against older platform API running on newer runtime.
**Check:** `BACK_URL/#!/workspace/systeminfo` — compare module version era.

### P2: Stale Elasticsearch Index
**Symptom:** Search returns outdated results, missing products, wrong facet counts.
**Cause:** Index not rebuilt after catalog/pricing/inventory changes.
**Check:** Admin > Search Index > last rebuild timestamp. Rebuild and retest.

### P3: Authorization Scope — Orphaned Organization
**Symptom:** 403 Forbidden on cart, wishlist, or saved-for-later for specific users.
**Cause:** Entity references a deleted organization; xAPI auth checks org membership and fails.
**Check:** Inspect entity's `organizationId` via REST API. Verify org exists via `/api/members/{id}`.

### P4: SDK/Integration Serialization
**Symptom:** Payment iframe shows ERROR state, integration fails silently.
**Cause:** JavaScript object passed where string expected → `[object Object]` in encoded config.
**Check:** Decode iframe `name`/`src` (Base64), look for `[object Object]` or `undefined`.

### P5: Pre-Authentication API Call
**Symptom:** 401 error in console on page load, before user logs in.
**Cause:** Module registers an API call during SPA bootstrap, before auth token is available.
**Check:** Network tab on fresh page load (before login) — any 401s?

### P6: External Resource URL Assumption
**Symptom:** 404 errors for images/assets that should exist.
**Cause:** Internal CDN conventions (e.g., size suffixes like `_md`) applied to external URLs.
**Check:** Compare failing URL pattern with the original asset URL. Is the host external?

### P7: Duplicate GraphQL Queries
**Symptom:** Page slow, same query fired multiple times on single navigation.
**Cause:** Vue component re-rendering triggers duplicate fetches; no cache policy set.
**Check:** Network tab → filter by GraphQL → look for identical operation names with same variables.

### P8: Hangfire Job Failure
**Symptom:** Expected background processing not happening (emails not sent, index not updated).
**Cause:** Job failed silently, stuck in retry queue, or scheduler not running.
**Check:** `BACK_URL/hangfire` — check Failed, Scheduled, and Recurring tabs.

---

## 8. Source Code Investigation via GitHub

When browser-based debugging is insufficient or you need to understand **why** the code behaves a certain way, investigate the source code directly using GitHub MCP tools. This covers both **backend modules** (C#/.NET) and the **frontend storefront** (Vue/TypeScript).

### When to Use Source Code Investigation

- API returns unexpected data and you need to understand the business logic
- Error messages are cryptic — find the exact throw site to understand conditions
- Feature works differently than documented — check actual implementation
- Need to determine if a behavior is "by design" or a bug
- Hunting for race conditions, missing null checks, or incorrect LINQ queries
- UI component renders wrong data, wrong layout, or has broken interactions
- Vue reactivity issue — need to trace composable / store logic
- SSR hydration mismatch or build-time vs. runtime behavior

### Investigation Workflow

```
SYMPTOM IDENTIFIED (API layer / UI behavior)
        │
   ┌────┴────────────────────────────┐
   │                                 │
   ▼                                 ▼
BACKEND?                         FRONTEND?
   │                                 │
   ┌────▼──────────┐            ┌────▼──────────┐
   │ FIND THE MODULE│            │ FIND THE PAGE/ │
   │ → vc-module-*  │            │ COMPONENT      │
   └────┬───────────┘            │ → vc-frontend  │
        │                        └────┬───────────┘
   ┌────▼─────────────┐         ┌────▼─────────────┐
   │ SEARCH THE CODE  │         │ SEARCH THE CODE  │
   │ controller/service│         │ page/composable/ │
   └────┬─────────────┘         │ component/store  │
        │                        └────┬─────────────┘
   ┌────▼──────────────┐        ┌────▼──────────────┐
   │ TRACE THE LOGIC   │        │ TRACE THE LOGIC   │
   │ service → domain  │        │ composable → API  │
   │ → repo → events   │        │ → store → template │
   └───────────────────┘        └───────────────────┘
```

### 8A. Backend Modules (C#/.NET — `vc-module-*`)

### Step 1: Identify the Module

| Clue | How to Find Module |
|---|---|
| API endpoint path (e.g., `/api/pricing/...`) | Module name maps to path segment → `vc-module-pricing` |
| GraphQL operation name (e.g., `SearchProducts`) | xAPI module → `vc-module-x-catalog`, `vc-module-x-order`, etc. |
| Error in `extensions.code` | Search error code string across VirtoCommerce org |
| Admin SPA section | Check `.claude/agents/knowledge/module-suite-map.md` |
| Feature domain | Consult `module-suite-map.md` or search `org:VirtoCommerce vc-module-*` |

### Step 2: Search the Code

Use **GitHub MCP** `search_code` to find relevant source files:

```
# Find a specific error message
search_code: "Price not found" org:VirtoCommerce

# Find a controller/endpoint
search_code: "[Route(\"api/pricing\")] org:VirtoCommerce vc-module-pricing"

# Find a GraphQL resolver
search_code: "class SearchProductsQuery" org:VirtoCommerce

# Find business logic by domain term
search_code: "ApplyPromotionReward" org:VirtoCommerce vc-module-marketing

# Find configuration/settings
search_code: "ModuleConstants" org:VirtoCommerce vc-module-catalog
```

### Step 3: Trace the Logic Chain

Follow the typical Virto Commerce code path:

1. **Controller / GraphQL resolver** → entry point, request validation, authorization
2. **Service layer** (`I*Service` / `*Service`) → orchestration, business rules
3. **Domain model** → entities, value objects, invariants
4. **Repository / data access** → queries, EF Core mappings
5. **Events / handlers** → side effects, cross-module integration

**What to look for:**
- Null checks (or missing null checks) on the data path
- Authorization attributes (`[Authorize]`, policy checks)
- LINQ queries with `.Where()` / `.FirstOrDefault()` — filter conditions that might exclude expected data
- Event handlers that modify data after the main operation
- Caching (`IMemoryCache`, `IPlatformMemoryCache`) — stale data source
- Background job registration (`IRecurringJobManager`) — timing/scheduling issues

### Step 4: Document Findings

When source code investigation reveals the root cause, include in the bug report:
- **Repository**: `VirtoCommerce/vc-module-{name}`
- **File path**: e.g., `src/VirtoCommerce.PricingModule.Data/Services/PricingService.cs`
- **Line/method**: The specific method and approximate line where the bug lives
- **Code evidence**: Brief quote of the problematic code (e.g., missing null check, wrong condition)
- **Suggested fix direction**: What the code should do instead (without writing the fix)

### Common Code Patterns to Watch

| Pattern | What Could Go Wrong |
|---|---|
| `FirstOrDefault()` without null check | `NullReferenceException` when entity not found |
| `Where(x => x.StoreId == storeId)` | Missing or wrong store scope filtering |
| `[Authorize(Policy = "...")]` | Too restrictive or wrong policy for the use case |
| `_cache.GetOrCreateExclusive(...)` | Stale cache serving outdated data |
| `await _eventPublisher.Publish(...)` | Event handler throwing breaks the main flow |
| `decimal` vs `Money` type conversions | Rounding errors in pricing/tax calculations |

### 8B. Frontend Storefront (Vue 3 / TypeScript — `vc-frontend`)

The storefront is a **Nuxt 3 / Vue 3** application in `VirtoCommerce/vc-frontend`. It uses the Composition API, Pinia stores, and calls the platform via GraphQL xAPI.

### Step 1: Identify the Page or Component

| Clue | Where to Look in `vc-frontend` |
|---|---|
| Route/URL path (e.g., `/cart`, `/checkout/payment`) | `client-app/pages/` — file-based routing (Nuxt convention) |
| Component visible in DOM (e.g., `ProductCard`, `AddToCart`) | `client-app/shared/` or `client-app/modules/` |
| Feature area (catalog, cart, checkout) | `client-app/modules/{feature}/` — each module has its own components, composables, stores |
| Shared UI element (buttons, modals, inputs) | `client-app/shared/ui/` or `client-app/shared/components/` |
| Layout (header, footer, sidebar) | `client-app/shared/layout/` |
| Builder.io / CMS content | `client-app/modules/cms/` or Builder.io integration files |

### Step 2: Search the Frontend Code

Use **GitHub MCP** `search_code` scoped to the frontend repo:

```
# Find a Vue component by name
search_code: "defineComponent" "ProductCard" repo:VirtoCommerce/vc-frontend

# Find a composable (business logic hook)
search_code: "useCart" repo:VirtoCommerce/vc-frontend

# Find a GraphQL query/mutation
search_code: "gql`" "addCartItem" repo:VirtoCommerce/vc-frontend

# Find a Pinia store
search_code: "defineStore" "cart" repo:VirtoCommerce/vc-frontend

# Find route/page definition
search_code: "definePageMeta" "checkout" repo:VirtoCommerce/vc-frontend

# Find API call or fetch wrapper
search_code: "useFetch" OR "useAsyncData" repo:VirtoCommerce/vc-frontend

# Find error handling
search_code: "catch" "ValidationError" repo:VirtoCommerce/vc-frontend
```

### Step 3: Trace the Frontend Logic Chain

Follow the typical `vc-frontend` code path:

1. **Page** (`pages/*.vue`) → route entry, `definePageMeta`, layout selection, top-level data fetching
2. **Module components** (`modules/{feature}/components/`) → feature-specific UI, event handlers
3. **Composables** (`modules/{feature}/composables/use*.ts`) → business logic, API calls, state management
4. **GraphQL operations** (`modules/{feature}/api/graphql/`) → `.graphql` files with queries/mutations
5. **Pinia stores** (`modules/{feature}/stores/`) → shared state across components
6. **Shared components** (`shared/components/`, `shared/ui/`) → reusable UI primitives
7. **Types** (`modules/{feature}/types/`) → TypeScript interfaces for API responses and component props

**What to look for:**
- `ref()` / `computed()` reactivity — is the value updating when it should?
- `watch()` / `watchEffect()` — missing watchers or wrong dependency tracking
- GraphQL query variables — wrong variables passed, missing fields in query
- `async/await` in composables — unhandled promise rejections, race conditions
- `v-if` / `v-show` conditions — component hidden due to wrong condition
- SSR vs. client-only code — `<ClientOnly>` wrappers, `onMounted` vs. `onServerPrefetch`
- Route middleware/guards — redirect logic blocking navigation
- i18n keys — missing or wrong translation key (`$t('...')`)
- Event bus / `emit` — parent not listening to child event, wrong event name

### Step 4: Document Findings

When frontend source code investigation reveals the root cause:
- **Repository**: `VirtoCommerce/vc-frontend`
- **File path**: e.g., `client-app/modules/checkout/composables/useCheckout.ts`
- **Line/method**: The specific function and approximate line
- **Code evidence**: Brief quote (e.g., missing `await`, wrong computed dependency)
- **Suggested fix direction**: What should change (without writing the full fix)

### Common Frontend Patterns to Watch

| Pattern | What Could Go Wrong |
|---|---|
| `ref()` assigned in `setup()` but not returned | Template can't access the reactive value |
| `computed()` depending on non-reactive source | Value never updates after initial render |
| `watch(prop, handler)` without `{ immediate: true }` | Handler doesn't fire on initial load |
| GraphQL query missing a field | Data exists in API but component shows `undefined` |
| `useFetch()` without error handling | Silent failure, component renders empty |
| `v-if="items.length"` on async data | Flash of empty state before data loads |
| `$t('key')` with wrong key path | Shows raw key string instead of translated text |
| `useRoute().query` parsed as string | Number comparison fails (`"1" !== 1`) |
| Missing `<ClientOnly>` on browser-dependent code | SSR hydration mismatch error |
| `emit('update:modelValue')` not declared in `defineEmits` | Event silently dropped in production |

---

## 9. Application Insights Investigation

Use **Azure Application Insights** to investigate server-side errors, performance issues, and runtime behavior that cannot be observed from the browser alone. **Check it for every bug with a REST / xAPI / Admin / background-job component** — not as an optional last resort.

### Discover the App Insights resource for the active env (do NOT hardcode a name)

The team tests on many envs (qa, demo, localhost, new customer envs…) and each has its **own** App Insights
resource — or none. Resolve the resource for *this* `TEST_ENV` by **discovery**, never by assuming a fixed
name:

1. **From the active `BACK_URL` host** (Section 0): an App Insights component is conventionally named after
   the same env slug as the host (e.g. a `*-storefront` companion for the storefront server). Use that as
   the search hint — not as a literal.
2. **List & match via Azure MCP** — enumerate App Insights components in the subscription/resource group and
   match the one whose linked app URL / instrumentation corresponds to the active `BACK_URL` /`FRONT_URL`.
   Pick the **platform** resource (REST/modules/jobs) and its **storefront** companion (SSR/middleware) if one
   exists. Defaults for `vcst` live in memory (`Azure Application Insights` index) — treat them as an example
   of the *pattern*, not a hardcoded target.
3. **No App Insights for this env (e.g. `localhost` / a fresh demo)?** Fall back to local/server logs: the
   platform console/stdout, container logs, and `{BACK_URL}/hangfire` — and say so in the report ("App
   Insights N/A for this env; used server console logs").

Record the chosen resource(s) once, then point every KQL query below at them.

### When to Use Application Insights

- 5xx errors from API with no useful response body
- Intermittent failures that don't reproduce locally
- Performance degradation (slow endpoints, timeouts)
- Background job failures not visible in Hangfire UI
- Correlation between frontend errors and backend exceptions
- Deployment-related regressions (compare before/after metrics)

### Investigation Workflow

```
BUG WITH SERVER-SIDE COMPONENT
        │
   ┌────▼──────────┐     ┌─────────────────┐     ┌──────────────────┐
   │ CHECK FAILURES │────►│ QUERY LOGS      │────►│ CORRELATE &      │
   │   BLADE        │     │  & EXCEPTIONS   │     │  ROOT-CAUSE      │
   └────────────────┘     └─────────────────┘     └──────────────────┘
    Failure rate,          KQL queries for          Operation ID →
    top exceptions,        specific errors,         full request
    affected operations    time ranges              trace chain
```

### Access Points

Substitute `<platform-ai>` / `<storefront-ai>` with the resources you discovered above for the active env —
the blades are the same regardless of name:

| Blade | Where | Purpose |
|---|---|---|
| Failures | `<platform-ai>` → Failures | Platform API exceptions, failed-request rate, top operations |
| Search / Logs | `<storefront-ai>` → Search (or Logs) | Storefront server logs (SSR, middleware) |
| Live Metrics | `<platform-ai>` → Live Metrics | Real-time request/failure stream while reproducing |

### Key KQL Queries

Use **Azure MCP** `applicationinsights` tool or the Azure Portal Logs blade.

**Find exceptions for a specific API endpoint:**
```kql
requests
| where timestamp > ago(1h)
| where url contains "/api/pricing"
| where success == false
| project timestamp, url, resultCode, duration, operation_Id
| order by timestamp desc
| take 20
```

**Get full exception details:**
```kql
exceptions
| where timestamp > ago(1h)
| where operation_Name contains "SearchProducts"
| project timestamp, problemId, outerMessage, innermostMessage, details, operation_Id
| order by timestamp desc
| take 10
```

**Trace a specific request end-to-end (using operation ID from network tab):**
```kql
union requests, dependencies, exceptions, traces
| where operation_Id == "OPERATION_ID_FROM_NETWORK_TAB"
| order by timestamp asc
| project timestamp, itemType, name, resultCode, success, message, outerMessage
```

**Find slow operations:**
```kql
requests
| where timestamp > ago(24h)
| where duration > 3000
| summarize count(), avg(duration), max(duration) by operation_Name
| order by count_ desc
| take 20
```

**Check dependency failures (SQL, Redis, Elasticsearch, external services):**
```kql
dependencies
| where timestamp > ago(1h)
| where success == false
| summarize count() by type, target, name, resultCode
| order by count_ desc
```

**Compare error rates before/after deployment:**
```kql
requests
| where timestamp > ago(48h)
| summarize
    failures = countif(success == false),
    total = count(),
    failRate = round(100.0 * countif(success == false) / count(), 2)
    by bin(timestamp, 1h)
| order by timestamp asc
```

### Correlating Browser Errors with Server Logs

1. **Get the operation ID** from the browser network tab — look for `Request-Id` or `traceparent` header in the failed request
2. **Query App Insights** with that operation ID to get the full server-side trace
3. **Check dependencies** — was it a SQL timeout? Redis failure? External API error?
4. **Read the exception chain** — `outerMessage` is the wrapper; `innermostMessage` is usually the actual cause

### What to Include in Bug Reports

When App Insights reveals server-side details, add to the bug report:
- **Operation ID**: For the failing request (enables others to trace it)
- **Exception type & message**: From the `exceptions` table
- **Dependency failures**: If the root cause is a downstream service (SQL, Redis, ES)
- **Request duration**: If performance-related
- **Time window**: When the issue was observed (UTC timestamps)
- **Affected operation**: The `operation_Name` (controller action or GraphQL operation)

### Common Server-Side Patterns

| App Insights Signal | Likely Cause | Next Step |
|---|---|---|
| `SqlException` in dependencies | Database timeout or deadlock | Check query complexity, table locks |
| `ElasticsearchException` | Search index unavailable or query too complex | Check ES cluster health, rebuild index |
| `RedisConnectionException` | Cache layer down | Check Redis health, verify connection string |
| `TaskCanceledException` with duration > 30s | Request timeout | Find the slow dependency in the trace |
| Spike in exceptions after deployment | Regression introduced | Compare exception types before/after deploy timestamp |
| `NullReferenceException` in module code | Missing data or unchecked null | Use source code investigation (Section 8) to find the exact line |

---

## 10. Flaky vs. Real Bug

| Signal | Likely Flaky | Likely Real Bug |
|---|---|---|
| Reproduction rate | < 30% (1-2 / 10 attempts) | > 70% (7+ / 10 attempts) |
| Timing sensitivity | Fails only on first attempt after deploy | Fails consistently regardless of timing |
| Environment | Fails on one env, passes on another (same version) | Fails on all envs with same version |
| Data dependency | Fails only with specific test user/org | Fails with multiple users and fresh data |
| Browser | Fails in one browser only | Fails across all browsers |
| After retry | Passes on immediate retry | Fails on every retry |

**When likely flaky:** Check for race conditions (API timing, animation), test data pollution from prior runs, ES index lag (wait 5s and retry), environment warmup (first request after deploy).

**When genuinely intermittent:** Document exact conditions, note reproduction rate in bug report (e.g., "3/10 attempts"), tag with "intermittent" label in JIRA.

---

## 11. Investigation Handoff Protocol

When your investigation reveals the bug is in another agent's domain, hand off with full context.

### Frontend Agent → Backend Agent
- GraphQL operation name + variables that produce the error
- Full response body (especially `errors[]` array)
- Whether the REST API also returns wrong data (if tested)
- Module version from systeminfo

### Backend Agent → Frontend Agent
- Confirmation that API returns correct data (with example response)
- The specific field/value the frontend should display
- Whether there was a recent API schema change

### Any Agent → qa-lead-orchestrator (Escalation)
- Current investigation status (which layers tested, what was found)
- Blocking reason (why you cannot continue)
- Recommended next agent and what they should check

### Handoff Message Format
```
@[target-agent]: Investigation handoff — [symptom summary]
- Tested layers: [what you checked]
- Findings: [what you found — URLs, response codes, error messages]
- Root cause hypothesis: [your best guess + evidence]
- What to check next: [specific action for receiving agent]
- Evidence: [path to screenshots, HAR, network captures]
```
