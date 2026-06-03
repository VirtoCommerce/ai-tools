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

## Evidence (`tests/Sprint26-11/VCST-5108/evidence/`)
`pdp_bot.html` / `pdp2_bot.html` / `plp_bot.html` / `notfound.html` (+ `.headers`) — prerendered snapshots · `pdp_human.html` — SPA shell · `browser-confirmation.md` + `VCST-5108-rendered-pdp.png` — real-browser render · `sitemap-create.md` + screenshots — sitemap config + export · `/tmp` sitemap probes summarized above.
