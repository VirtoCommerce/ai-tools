# BUG: [Module Federation] Plugin pages stay broken up to 4 h after a module redeploy (unversioned remoteEntry.js) `[Medium]`

## Status: REPRODUCED
**Found by:** agent — testing VCST-6158
**Tracker:** [VCST-6676](https://virtocommerce.atlassian.net/browse/VCST-6676) — standalone, Relates VCST-6158 and VCST-6397 (out of scope)
**Severity:** Medium (graded at /qa-test 5-triage)

Env: vcst-qa (also vcptcore) @ Platform 3.1093.0-pr-3154-4607, VirtoCommerce.SalesRep 3.1017.0-pr-30-1e10, theme 2.62.0-pr-2596-e749-e749b47f; Chromium + Firefox, behind Cloudflare.

## Summary
The storefront fetches `mf-manifest.json?v=<hash>` but `remoteEntry.js` without a cache-buster
(`Cache-Control: max-age=14400`). After a module redeploy the CDN or the browser keeps the old entry, which imports
chunks that no longer exist → 404 → plugin pages stuck on "Loading page…". 4th sighting (kb KB-4358B2EC).

## Steps to reproduce
1. Redeploy a module that ships a storefront plugin (SalesRep) with changed chunk hashes.
2. Within 4 h open `/company/my-customers` in a browser that loaded the plugin before, or via a CDN edge that cached the old entry.
3. Network: `remoteEntry.js` (no `?v=`, `cf-cache-status: HIT`, `last-modified` of the old build) → chunk 404s.

## Expected vs Actual
- **Expected:** a redeploy is picked up on the next page load (entry versioned like the manifest, or `no-cache`).
- **Actual:** vcst 2026-11-03 ~15:22Z redeploy → stale 27 Oct entry from Cloudflare; purge 16:07Z did not hold at another edge (stale 16:14–16:36Z); a browser that loaded it kept it until expiry. Toast "Part of the site could not be loaded"; "My customers" missing from the hub sidebar.

![Stuck on loading with toast](../screenshots/MF-Plugin-RemoteEntry-Stale-After-Redeploy/exp-cdn-stale-my-customers-firefox.png)

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront delivery | FAIL | SBTM blocker 16:14–16:36Z; `1r-my-customers-stuck-loading.png`, `exp-cdn-stale-my-customers-firefox.png` (run folder `screenshots/`) |
| 2–4. Admin / xAPI / REST | N/A | not involved |

**Owning layer:** L1 storefront delivery (code vs CDN/platform cache rules undecided).

## Root Cause Analysis
vc-frontend `client-app/core/federation/index.ts` (`dev`): `resolvePlatformRemotes` → `withCacheBuster(manifestUrl, plugin?.entry?.hash)`
(line 523) versions only the manifest; the manifest's `remoteEntry.js` and chunks are loaded as-is (line 177). Open item in
`client-app/core/federation/TODO.md`: `Cache-Control` on `/modules/**`.

**Need hotfixes:** not set — the plugin loader is in neither stable bundle (v15 vc-frontend 2.51.1, v16 2.59.0).

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend (possibly also platform/CDN cache rules — infra)
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** Module Federation plugin loader (`client-app/core/federation/`)
- **RCA anchor:** `client-app/core/federation/index.ts:523` `withCacheBuster(manifestUrl, plugin?.entry?.hash)`
- **Routing confidence:** LOW — code vs infra undecided. Auto-fix labels withheld.
