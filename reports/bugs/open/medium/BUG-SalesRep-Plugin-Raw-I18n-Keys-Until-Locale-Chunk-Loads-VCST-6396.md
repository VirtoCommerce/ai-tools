# BUG: [Sales Rep][i18n] Sales Rep Hub plugin and Corporate "Sales reps" link render raw i18n keys until the plugin locale chunk loads — Medium

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6015
**Tracker:** [VCST-6396](https://virtocommerce.atlassian.net/browse/VCST-6396) (Subtask of VCST-6015; relates to VCST-6196; labels found-by-agent, found-in-testing; auto-fix labels withheld)

**Severity:** Medium (P2), graded at triage · **Type:** Functional / i18n (load ordering) · **Relationship:** Sub-task of VCST-6015 (IN-SCOPE)
**Env:** vcst (`{{FRONT_URL}}`), playwright-chrome (chromium) 1920x1080, 2026-10-15
**Build:** platform 3.1083.0 · VirtoCommerce.SalesRep 3.1014.0 (storefront plugin `sales-rep` 0.2.5) · theme 2.60.0-alpha.2579
**Oracle:** BL-SR-013 (raw key never surfaces), VC-UI-007 · **Relates:** VCST-6196, `BUG-SalesRep-nav-link-raw-i18n-key-fr-es.md` (persistent raw keys under a locale; different symptom, not duplicates)

## Summary
In the default English culture, every Sales Rep plugin label shows its raw i18n key (`SALES_REP.HUB.TITLE`, `sales_rep.orders.number`, `Sales_rep.navigation.link`, ...) from first render until the plugin's own `en-*.js` locale chunk arrives. On a fast connection only the Corporate "Sales reps" link flashes (~44–75 ms, every load). On a slow one the whole hub stays raw for as long as the chunk takes. Host labels on the same screen stay translated. Once the chunk loads, the text is correct, so no key is missing; the defect is load order.

## Preconditions
- A sales rep account (@td(SR_REP_PRIMARY)) and a B2B buyer account (@td(ACME_BUYER)); English culture.
- To make the window visible to the eye: a slow network, or the plugin locale request `/modules/$(VirtoCommerce.SalesRep)/plugins/vc-frontend/assets/en-*.js` delayed (6 s used here).

## Steps to reproduce
1. Sign in as the sales rep and open `/company/dashboard` with a cold load.
2. Watch the account rail, H1, widget captions and table headers while the page loads.
3. Sign in as the buyer and open `/company/sales-reps` (or `/account/dashboard`); watch the H1, search placeholder, table headers and the Corporate rail link.

## Expected
Plugin labels show translated text ("Sales Rep hub", "Dashboard", "Sales reps") or a loader/skeleton until it is ready. A raw i18n key is never shown (BL-SR-013).

## Actual
- Locale chunk held for 6 s: the rep dashboard shows 42–43 distinct raw keys for ~0.9–7.1 s (3/3 runs); `/company/my-customers` 12 keys; buyer `/company/sales-reps` 5 keys incl. the Corporate link (3/3).
- No throttling: the Corporate link reads `Sales_rep.navigation.link` for 44–75 ms on 15/15 cold loads.
- All keys clear within 1–40 ms of the chunk arriving.
- Also caught by regression REG-2026-10-15-1548, cases 093 SR-HD-108 (link frames include the raw key under Slow 3G) and SR-HD-114 (62/122 label frames raw, 1.24–7.35 s).

![Rep dashboard, locale chunk held](../../screenshots/SalesRep-Plugin-Raw-I18n-Keys-Until-Locale-Chunk-Loads/01-rep-dashboard-raw-keys-throttled.png)
![Buyer /company/sales-reps, locale chunk held](../../screenshots/SalesRep-Plugin-Raw-I18n-Keys-Until-Locale-Chunk-Loads/02-buyer-sales-reps-raw-keys-throttled.png)

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | FAIL | screenshots above; `reports/tickets/Sprint26-20/VCST-6015/evidence/B1-raw-i18n-keys/` (evidence-index rows T1–T7, U1–U15) |
| 2. Backend Admin | N/A | not admin-visible |
| 3. GraphQL xAPI | N/A | labels are static locale strings; no xAPI field involved |
| 4. Platform REST API | PASS | every plugin request returns 200 (`network/plugin-requests-rep.txt`); no failing request |

**Owning layer:** Layer 1, the storefront plugin shipped in the module repo.

## Root Cause Analysis
- `vc-module-sales-rep` `src/VirtoCommerce.SalesRep.Web/StorefrontApp/src/index.ts`: `init()` is synchronous (`:109`). It starts the locale with `void mergeLocale(...)` (`:106`, called last at `:245`) and registers the account-rail section, menu schema and nav links with key titles without waiting for it. The locale is its own dynamic chunk (`:67`), so it takes a separate round trip.
- The host already waits for an async `init()`: `vc-frontend` `client-app/core/federation/index.ts:36` (`init?: () => void | Promise<void>`), `:675-683` `runInit`, `:1052-1058` settle after init; route placeholders keep the loader until then.
- The Corporate link is declared in `plugin.config.ts:55-65` (`title: "sales_rep.navigation.link"`). The host draws declared links before any plugin code loads (`client-app/core/federation/contributions/declare.ts:39-40, 150-155`), with no pending gate (slots have one at `:233-254`). `declarations.md:117-118` documents the raw-key window as the current contract.
- **Provenance: IN-SCOPE.** Introduced by vc-module-sales-rep `0a7c3d9` "ship the Sales Rep Hub storefront as an MF plugin (#13)", first in 3.1014.0. The old built-in module (theme 2.58) had the same unawaited locale but loaded before `app.mount`, so it rarely lost the race.
- Docs: VirtoOZ (Storefront Developer Guide, localization / app initialization) does not describe plugin locale timing; expected behaviour rests on BL-SR-013 and the host contract.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront (MF plugin embedded in a module repo)
- **Suggested repo:** VirtoCommerce/vc-module-sales-rep (primary); VirtoCommerce/vc-frontend (secondary, declared-link part)
- **repoKind:** module (primary) · frontend (secondary)
- **Ownership hint:** platform
- **Component / module:** Sales Rep storefront plugin (`StorefrontApp`); vc-frontend federation declarations
- **RCA anchor:** `vc-module-sales-rep/src/VirtoCommerce.SalesRep.Web/StorefrontApp/src/index.ts:106,109,245` — make `init()` async and await the locale before registering the rail/menu; keep the `router.addRoute` calls before the first `await`. Secondary: `vc-frontend/client-app/core/federation/contributions/declare.ts:39-40,150-155` — gate declared links while the plugin is pending, or let a declaration carry a default label (plugin-only alternative: drop the declared link from `plugin.config.ts:55-65`).
- **Routing confidence:** MEDIUM — root cause HIGH, but the Corporate-link flash needs either a host change or a plugin-config change, and `StorefrontApp` is not declared in `fix-repos.json` `moduleFrontendSubApps`.
