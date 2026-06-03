# VCST-5108 — Enable PreRender on VC Frontend for SEO — QA Execution Report

**Env:** vcst-qa @ Platform 3.1032.0, Theme 2.50.0 · Storefront `vcst-qa-storefront.govirto.com`
**Date:** 2026-06-03 · **Verdict:** ❌ **FAIL** (PreRender wired up, but delivers no SEO value yet)

## Summary
PreRender is enabled and bot↔human routing works (Googlebot gets a prerendered snapshot with `x-prerender-cache` + `x-prerender-render-at`; humans get the SPA shell). But the snapshots are **chrome-only** (no product/category content), every page is **`noindex`** with no canonical/JSON-LD, and the sitemap is **not crawlable end-to-end**. These are vc-frontend + deployment fixes, not catalog-data issues — the data renders fully for a real browser ($11.85, properties, in-stock).

## Smoke test results
| ID | Check | Result |
|----|-------|--------|
| A1 | Bot gets pre-rendered HTML | ⚠️ Partial — 200 + snapshot, but content missing (see B1) |
| A2 | Human gets SPA | ✅ Pass — 4KB shell, no prerender header |
| A3 | Excluded paths bypass PreRender | ❌ `/account`,`/checkout`,`/cart` routed through PreRender (`x-prerender-cache` present) |
| B1 | PDP completeness | ❌ No name/price/SKU/description/breadcrumb/availability in snapshot (2 products) |
| B2 | PLP completeness | ❌ No product cards/prices; only nav anchors |
| B3 | No render artifacts | ✅ No `{{ }}`/`undefined`/`[object Object]` |
| C1 | 404 returns 404 | ⚠️ Returns 200 (soft-404) — **documented by-design**, not a new bug |
| C2 | Removed product 404/410 | ⚠️ Same soft-404 behavior |
| D1 | Title/description/canonical | ❌ Generic `<title>Virto Commerce</title>`, no description, **no canonical** |
| D2 | robots.txt + sitemap.xml | ⚠️ robots.txt 200; **sitemap.xml 404** (not crawlable — see Finding 3) |
| D3 | Product JSON-LD schema | ❌ No `application/ld+json` present |
| E1–E3 | Cache / cache-bust / logs | ⚠️ Cache HIT/MISS observed; PreRender service logs not accessible from QA |

## Key findings & root cause
1. **Empty prerendered content (core defect).** vc-frontend emits **no `window.prerenderReady` signal** (repo search: 0 hits). Content renders asynchronously via the `matcher`/`priorityManager` state machine *after* the shell+menu, so Prerender.io snapshots too early → chrome-only HTML. *Fix (vc-frontend):* set `window.prerenderReady=false` and flip to `true` when the matcher reaches `ready`.
2. **Site-wide `noindex`, no canonical.** `index.html` ships `<meta name="robots" content="noindex">` as a default; `useSeoMeta`/`useHead` override title/description/og from `seoInfo` but **never set `robots=index` and never emit `<link rel=canonical>`**. So pages stay noindex/canonical-less even after hydration (verified anonymously + authenticated). On QA, noindex also serves as intentional hygiene — but on the production Virto Cloud target it must flip to `index` for real pages and stay `noindex` only on /404.
3. **Sitemap not crawlable end-to-end.** B2B-store already had 5 sitemap configs (I added `seo.xml` → 6) and "Export to store assets" now generates them (job SUCCESS → `cms-content/assets/stores/B2B-store/sitemap/`). Post-export verification:
   - `/sitemap/sitemap.xml` → **200** (valid `<sitemapindex>`, 4 children)
   - root `/sitemap.xml` (what robots.txt advertises) → **404**
   - every child `<loc>` the index points to (`/en-US/sitemap/seo.xml`, `…/products.xml`, …) → **404**
   *Fix (storefront routing/deploy):* serve the index at root `/sitemap.xml` (and align child paths) or update robots.txt to the served path; the static files aren't mapped to the advertised URLs.
4. **Soft-404 (C1) is by-design** per official docs ("Googlebot still sees 200… Virto Cloud is working on server-side 404 via nginx rules"). Mitigation = noindex on /404 / client redirect. Not a new bug.
5. **Catalog SeoInfo data gap (data layer).** xAPI audit: of 4,579 products, the sample of 30 all have a semantic URL but **pageTitle + metaDescription = `null`** (only the one test product we set has meta). Of 445 categories, pageTitle is populated (= category name) but **metaDescription is null for ~96%** (2/50 sampled). So most pages would ship an empty description + name-fallback title even with perfect rendering.

**Layer separation proven (re-test with seoInfo configured):** after populating the test product + category SeoInfo, the **hydrated SPA correctly rendered the configured pageTitle + metaDescription + keywords on both PDP and PLP** (MATCH). But `robots` stayed **`noindex`** and `canonical`/JSON-LD remained **absent** on both — confirming Finding 2 is independent of seoInfo content. `noindex` is **not auth-gated** (present anonymously in the prerendered HTML; it's the shipped `index.html` default).

## Recommendation
**Need fixes** — owned by vc-frontend + Virto Cloud deployment, not the catalog/Stores module:
- Implement `window.prerenderReady` handshake (Finding 1) — highest impact.
- Flip `robots` to `index` on indexable routes + emit canonical + Product JSON-LD (Finding 2/D3).
- Fix storefront sitemap routing so robots.txt → a 200 index whose children resolve (Finding 3).
- Exclude `/account`,`/checkout`,`/cart` from the bot→PreRender nginx rule (A3).
- (Optional) adopt the documented soft-404 mitigation (C1).

## Re-test 2026-06-03 — PR #2313 deployed (theme 2.51.0-pr-2313)
`VirtoCommerce/vc-frontend` PR #2313 (route-aware robots) is deployed to vcst-qa. Verified the hydrated SPA — **7/7 PASS**:
- Indexable `index, follow`: PDP, PLP, `/catalog` ✅
- Noindex `noindex, follow`: `/cart`, `/account`→`/sign-in`, `/sign-in`, soft-404 ✅

This resolves the robots layer **for the hydrated SPA / JS-rendering crawlers**, and fixes the brief over-broad `index` state seen during the deploy-in-flight. **However the ticket-level FAIL stands** because the PreRender→bot pipeline is unchanged:
- Prerender still snapshots **pre-hydration** (no `window.prerenderReady`), so bot HTML keeps the shell's `noindex` and chrome-only content even after a cache bust. PR #2313 does not reach the prerendered output.
- canonical + Product JSON-LD still absent (PR #2313 scoped them as follow-ups).
- `/sitemap.xml` still 404; catalog SeoInfo data gap persists; A3 unchanged.

**Verdict:** PR #2313 = PASS (own scope). VCST-5108 overall = **FAIL / incomplete** — remaining: `prerenderReady`, canonical, JSON-LD, sitemap routing, SeoInfo data, A3 bot-exclude.

## Smoke-test scorecard (ticket A–E) — live, theme 2.51.0-pr-2313
Architecture: vcst-qa runs Virto Cloud **self-hosted prerender** (VCI-1010 / VP-9138, Luminos Labs) — **preview / not production-ready**; not Prerender.io. Root cause of content fails: renderer snapshots after initial hydration (App.vue robots runs → fresh snapshot robots correct) but **before async route content** loads.

| Case | Result | Evidence |
|---|---|---|
| A1 Bot pre-rendered HTML w/ name+price+desc | ❌ FAIL | 200 + 132KB but no product name/price/description (fresh MISS render empty) |
| A2 Human gets SPA (no prerender) | ✅ PASS | 4KB shell, no `x-prerender-cache` header |
| A3 Excluded paths (`/account`,`/checkout`) bypass prerender | ❌ FAIL | both carry `x-prerender-cache` → routed through prerender (PR #2313 makes them `noindex`, harm mitigated) |
| B1 PDP completeness (title/price/SKU/desc/img/breadcrumb/availability) | ❌ FAIL | none present (2 products + fresh render) |
| B2 PLP completeness (cards as `<a href>`, names, prices, pagination) | ❌ FAIL | no cards/names/prices |
| B3 No render artifacts | ✅ PASS | 0 `{{ }}`/`undefined`/`[object Object]` (partly because no content) |
| C1 404 returns 404 | ❌ FAIL | non-existent → HTTP 200 soft-404 (by-design); now `noindex` via PR #2313 |
| C2 Removed product → 404/410 | ❌ FAIL | same soft-404 architecture → 200 |
| D1 title + meta description + canonical | ❌ FAIL | prerender: generic title, no desc, no canonical; hydrated: title+desc OK where SeoInfo set, **canonical never emitted** |
| D2 robots.txt + sitemap.xml both 200 | ❌ FAIL | robots.txt ✅; `/sitemap.xml` 404 (only `/sitemap/sitemap.xml` serves) |
| D3 Product JSON-LD (Rich Results 0 errors) | ❌ FAIL | no `application/ld+json` at all |
| E1 Cache works (HIT) | ✅ PASS | `x-prerender-cache: HIT`, L1/L2 tiers |
| E2 Cache busts on publish | ⚪ NOT VERIFIED | not tested; moot while content not prerendered |
| E3 No errors in prerender logs | ⚪ NOT VERIFIABLE | no log access; fresh renders 200 in 3.5–7s, no 5xx/timeout observed |

**Tally:** PASS 3 (A2, B3, E1) · FAIL 9 (A1, A3, B1, B2, C1, C2, D1, D2, D3) · Not verified 2 (E2, E3). **Overall: FAIL.**

### Fix ownership
1. **CORE — empty prerendered content (A1/B1/B2/D1-title-desc):** self-hosted prerender service **VCI-1010 / VP-9138** — wait for content-ready (honor `window.prerenderReady` if supported, else tune wait). Optional coordinated `prerenderReady` emit in vc-frontend `matcher.vue` only if the service consumes it.
2. **Robots:** vc-frontend **PR #2313 — done/verified.**
3. **Canonical + JSON-LD (D1/D3):** vc-frontend follow-up.
4. **`/sitemap.xml` routing (D2):** storefront hosting/deploy.
5. **Blank catalog SeoInfo (D1):** catalog content (Admin per product/category).

## Full A–E re-verification — Googlebot UA, cache-bust (2026-06-03, later) — theme 2.51.0-pr-2313
Re-ran every case with curl `User-agent: Googlebot`. Forced fresh prerenders (`?vcst5108=1`) because cached PDP/PLP served **stale pre-PR#2313 empty snapshots** (`x-prerender-cache: HIT`, 132KB shell). Verdict unchanged: **FAIL** — but with a sharper root-cause signal.

| Case | Result | Fresh evidence |
|---|---|---|
| A1 Bot HTML w/ name+price+desc | ❌ FAIL | PDP fresh MISS = 132KB shell, `<title>Virto Commerce</title>`, 0 name/price/desc |
| A2 Human gets SPA | ✅ PASS | 4232B shell, no `x-prerender-cache` |
| A3 Excluded paths bypass prerender | ❌ FAIL | `/account` `/checkout` `/cart` all return `x-prerender-cache: HIT` |
| B1 PDP completeness | ❌ FAIL | fresh PDP: no name/price/SKU/desc/breadcrumb/availability |
| B2 PLP completeness | ❌ FAIL | fresh `/bolts/flange-bolts`: no cards/names/prices |
| B3 No render artifacts | ✅ PASS | 0 `{{ }}`/`undefined`/`[object Object]` (incl. content-bearing catalog) |
| C1 404 returns 404 | ❌ FAIL (by-design soft-404) | unknown URL → HTTP 200; prerender even shows `index, follow` (not noindex) |
| C2 Removed product → 404/410 | ❌ FAIL | same soft-404 (200) |
| D1 title + description + canonical | ❌ FAIL | PDP/PLP prerender: shell title, no desc, **canonical absent on every page** (PDP/PLP/cat/404 = 0) |
| D2 robots.txt + sitemap.xml both 200 | ❌ FAIL | robots.txt **200 ✅ & advertises** `…/sitemap.xml`; but `/sitemap.xml` → **404** (nginx). Only `/sitemap/sitemap.xml` 200, and it's a **degenerate self-referential index** (sole `<loc>` = itself; no product/category URLs) |
| D3 Product JSON-LD (Rich Results) | ❌ FAIL | **0 `application/ld+json`** in prerender AND hydrated DOM → Rich Results Test = "No items detected" (running the tool is moot with zero structured data) |
| E1 Cache works (HIT) | ✅ PASS | PDP/PLP/account served `x-prerender-cache: HIT` (L1) |
| E2 Cache busts on publish | ⚪ NOT VERIFIED | not triggered |
| E3 No errors in prerender logs | ⚪ NOT VERIFIABLE | no log access; fresh renders 200, no 5xx/timeout |

**Tally:** PASS 3 (A2, B3, E1) · FAIL 8 (A1, A3, B1, B2, C1/C2, D1, D2, D3) · Not verified 2 (E2, E3). **Overall: FAIL.**

**Decisive new signal — prerender *can* capture content, deep routes lose the race.** The `/catalog` root fresh MISS (578KB) rendered correctly: real `<title>QA & Catalog</title>`, `meta description` present, **`robots: index, follow`** (PR #2313 reaching the snapshot), **7 product anchors + 15 prices**. Same-build PDP/PLP fresh MISS captured only the App.vue robots default + shell title — async route content/SEO meta never lands inside the snapshot window. This pins the unchanged root cause to the **missing `window.prerenderReady` handshake** (not a data or robots-logic problem). Canonical + Product JSON-LD remain unimplemented everywhere (independent follow-ups). Fresh evidence: `rr_*_fresh.html`, `rr_cat_bot.html`, `rr_404_bot.html` (+ `.headers`), `/tmp/robots.txt`, `/sitemap/sitemap.xml`.

## Re-test after infra-file change (2026-06-03, later)
Re-ran the full A–E battery (cache-bust forced-fresh renders, Googlebot UA) after an infra-file update. **No change on any scenario** — same PASS 3 / FAIL 8 / Not verified 2. robots.txt + `/sitemap.xml` (404) + `/sitemap/sitemap.xml` (self-referential) byte-identical; PDP/PLP fresh MISS still shell-only; `/catalog` still the only route that captures content. The change has not reached this storefront or does not touch the SEO/prerender surface. Evidence: `rt_*.html` + `.headers`.

## Evidence (`tests/Sprint26-11/VCST-5108/evidence/`)
`pdp_bot.html` / `pdp2_bot.html` / `plp_bot.html` / `notfound.html` (+ `.headers`) — prerendered snapshots · `pdp_human.html` — SPA shell · `browser-confirmation.md` + `VCST-5108-rendered-pdp.png` — real-browser render · `sitemap-create.md` + screenshots — sitemap config + export · `/tmp` sitemap probes summarized above.
