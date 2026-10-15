# BUG: A cold deep link to a Sales Rep Hub route by a non-rep or anonymous visitor briefly shows the 404 page before the redirect (empty HTTP cache)

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6015
**Tracker:** [VCST-6397](https://virtocommerce.atlassian.net/browse/VCST-6397), standalone Bug, relates to VCST-6015 (converted from Sub-task 2026-10-15). Labels `found-by-agent`, `found-in-testing`; auto-fix labels withheld (see Fix Routing)
**Severity:** Low (P3), graded at triage · **Provenance:** IN-SCOPE (introduced by the MF plugin delivery of VCST-6015/VCST-5159)

## Summary
A visitor who is not a sales rep opens a Sales Rep Hub URL directly with an empty HTTP cache (first visit, or the first visit after a deploy). The host "404 / Page not found" page is painted for 44–126 ms. Then the guard redirects correctly: a buyer goes to `/account/dashboard`, an anonymous visitor to `/sign-in?returnUrl=…`. The end state is right (BL-SR-011 holds). The defect is the error page that flashes in between.

## Environment
| Field | Value |
|---|---|
| Env | vcst (`{{FRONT_URL}}`) |
| Platform | 3.1083.0 |
| SalesRep module | 3.1014.0 (hub delivered as a Module Federation plugin) |
| Theme | 2.60.0-alpha.2579 |
| Browser | playwright-edge (msedge), 1920x1080, isolated context, cache disabled via CDP |
| Run window | 2026-10-15 14:32–14:48 UTC |

## Preconditions
- The Sales Rep Hub is served as the MF plugin (`plugins/vc-frontend/assets/*` loads).
- Empty HTTP cache: a fresh browser profile, or DevTools "Disable cache".
- Actor: anonymous, or a buyer without sales-rep access (`@td(ACME_BUYER)`).

## Steps to reproduce
1. With an empty HTTP cache, open `{{FRONT_URL}}/company/dashboard` directly in the address bar. `/company/my-customers`, `/company/customer-orders`, `/company/tasks` and `/company/documents` behave the same way.
2. Watch the first ~1–2 s of the load (a screen recording, or a DOM observer on `document.title` / `h1`).

## Actual
- "404 / Page not found" (`document.title` "… 404 Page not found") paints for 44–126 ms, at 0.87–1.72 s after navigation. The redirect follows.
- Anonymous visitor: 10/10 loads. Buyer: 9/10 loads. Rep on routes the rep may enter: 0/4. Rep without the documents read permission, on `/company/documents`: 1/1.
- Warm cache: 0/30 loads.
- The final destination is always correct. No `/graphql/sales-rep` request is sent.
- No GA4 `page_view` titled 404 was reproduced (0/20 flash events).

## Expected
The visitor sees a loader and then the redirect. The 404 page never appears for a route the hub declares. This is what the built-in (non-federated) hub did.

## Evidence
![404 frame, buyer, /company/dashboard](../../screenshots/SalesRep-Hub-Cold-Deep-Link-Transient-404/01-buyer-404-frame-company-dashboard.jpg)
![After redirect, /account/dashboard](../../screenshots/SalesRep-Hub-Cold-Deep-Link-Transient-404/02-buyer-after-redirect-account-dashboard.jpg)
- Motion (§5.2): `reports/bugs/screenshots/SalesRep-Hub-Cold-Deep-Link-Transient-404/404-flash.gif`
- Package: `reports/tickets/Sprint26-20/VCST-6015/evidence/D2-transient-404-before-redirect/` (`evidence-index.md`, `root-cause.md`, `network/observer-results.json`)
- HAR: `test-results/edge/har/session.har` (shared lane, referenced)
- Console: nothing related (`console/console-errors-warnings.txt`)

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | FAIL | 404 frame screenshot + observer log |
| 2. Backend Admin | N/A | client-side routing race, no admin entity |
| 3. GraphQL xAPI | PASS | 0 `/graphql/sales-rep` requests, no `errors[]` |
| 4. Platform REST API | N/A | no REST call is involved |

**Owning layer:** Layer 1. The storefront plugin route declarations ship in the module repo.

## Root Cause Analysis
Source read at vc-module-sales-rep tag 3.1014.0 and vc-frontend `dev` @ 0bb1cab6.
1. `plugin.config.ts:30-31,41-53`: every hub route is declared with `when: isRep`. `/company/documents` also requires documents read.
2. `client-app/core/federation/contributions/declare.ts:89-92`: when `when` is false, the host creates no placeholder route.
3. The plugin is not `blocksBoot`, so the first navigation resolves before `init()` (`app-runner.ts:309-324`). It falls through to the catch-all: `router/routes/main.ts:162` → `pages/matcher/matcher.vue:23-27` → `<NotFound>`.
4. `src/index.ts:109-129`: plugin `init()` then registers every route regardless of role. `core/federation/bootstrap.ts:33-55` `reResolveOnceSettled()` replaces the route, and `guardSalesRep` / the Company auth gate redirects.
5. Race: with a warm cache the plugin settles before the slug lookup finishes, so nothing flashes. With an empty cache the plugin loses.

Introduced by `0a7c3d9 feat(VCST-5159): ship the Sales Rep Hub storefront as an MF plugin (#13)`. The built-in hub registered its routes synchronously before `app.use(router)` (`modules/sales-rep/index.ts:50-65`), so it had no catch-all window.

Docs: VirtoOZ (Storefront Developer Guide, "SPA Architecture for SEO and 404 Handling") documents the soft-404 page for an *unknown* URL. It documents no case where a 404 page shows for a valid route before a redirect. The host federation `HOWTO.md:530-535` advises putting permission checks in `when`, and that advice assumes the excluded user gets a final 404. This plugin breaks the assumption by still registering the route.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront (route declarations of the federated plugin)
- **Suggested repo:** VirtoCommerce/vc-module-sales-rep
- **repoKind:** module (embedded storefront app `src/VirtoCommerce.SalesRep.Web/StorefrontApp/`)
- **Ownership hint:** platform
- **Component / module:** Sales Rep Hub storefront plugin, route contributions
- **RCA anchor:** `src/VirtoCommerce.SalesRep.Web/StorefrontApp/plugin.config.ts:31` (and `:52` for documents), `when: isRep`
- **Primary fix:** drop `when` from the hub route declarations (it can stay on menu entries). Non-reps then get the placeholder loader and the guard redirect, as on the built-in hub.
- **Alternative (vc-frontend host, product decision):** stop the catch-all from painting NotFound while a plugin that declares the path is still loading, and revisit `HOWTO.md:530-535`.
- **Routing confidence:** MEDIUM. The primary fix goes against the host's documented `when` guidance, so the choice between module and host is a product decision.
