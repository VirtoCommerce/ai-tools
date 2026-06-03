# VCST-5108 — Real-Browser PDP Confirmation

Env: vcst-qa @ storefront Ver. 2.50.0 · Browser: playwright-chrome (JS executed, human render)
PDP: `/bolts/flange-bolts/16mm-steel-hex-flange-bolt-class-88-zinc-plated-finish-m6-100-...`
Screenshot: `VCST-5108-rendered-pdp.png` (this folder)

## 1. Main content DOES render in a real browser (data exists)
- Product NAME (H1): "16mm Steel Hex Flange Bolt, Class 8.8, Zinc Plated Finish, M6-1.00 Dia/Thread Size, 100 PK" — visible
- PRICE: **$11.85** (USD) — visible (variations: $12.90, $21.20)
- Properties: FASTENER_FINISH=Zinc Plated, FASTENER_LENGTH=M6-1.00, FASTENER_THREAD_TYPE=UNC, HEAD_TYPE=Hex Flange, SYSTEM_OF_MEASUREMENT=Metric — visible
- Availability: "In stock" + qty 123 — visible
- Breadcrumb: Home / Catalog / Bolts / Flange Bolts / <product> — present
- Add-to-cart: qty stepper present (Increase quantity = add-to-cart entry; "Add to Cart" button suppressed by B2B flag — expected)
- (No standalone long-description block on this product; properties block serves as content)

=> Product data IS present and rendered client-side. Confirms PreRender snapshot (missing content) is the deficient layer for content.

## 2. Final hydrated <head> SEO values
| Tag | Final value after hydration |
|-----|------------------------------|
| document.title | `QA & 16mm Steel Hex Flange Bolt, Class 8.8, Zinc Plated Finish, M6-1.00 Dia/Thread Size, 100 PK` |
| meta[name=robots] | **`noindex`** |
| link[rel=canonical] | **none (null)** |
| meta[name=description] | **none (null)** |
| og:title | same as title (env "QA &" prefix included) |
| JSON-LD (Product schema) | **0 scripts — none injected** |

## 3. Does robots flip to "index" after load?
NO. robots stays **`noindex`** post-hydration.

## Conclusion (nuance vs. premise)
- CONFIRMED: full product content renders client-side, so PreRender's content-stripped snapshot is a real deficiency.
- BUT the original hypothesis ("SPA sets correct SEO that PreRender failed to snapshot") is NOT supported: the hydrated SPA itself does NOT correct SEO — robots stays `noindex`, and there is no canonical, no meta description, and no Product JSON-LD even after JS execution.
- So the SEO defect is broader than PreRender alone: the storefront SPA emits `noindex` + omits canonical/description/structured data on the PDP in the live (logged-in QA) render. The `noindex` is consistent across both layers, not a PreRender-only artifact.
- Caveat: this render was an authenticated QA session ("QA &" title prefix, logged-in BMW-Group user); `noindex` may be tied to env/auth context. Recommend a second pass as an anonymous visitor to isolate whether `noindex` is environment-gated vs. a true production SEO bug.

## Re-test with seoInfo configured (2026-06-03)
Catalog now has SeoInfo populated for the product + category. Hard-reloaded both URLs in playwright-chrome, read final hydrated `<head>` (authenticated QA session, "QA &" title prefix is the env decorator).

| Field | PDP (`/bolts/flange-bolts/16mm-…m6-100`) | PLP (`/bolts/flange-bolts`) |
|-------|------------------------------------------|------------------------------|
| document.title | `QA & Steel Hex Flange Bolt M6 Class 8.8 Zinc \| QA SEO Test` ✅ MATCH | `QA & Flange Bolts \| Hex & Carriage Flange Fasteners \| QA SEO Test` ✅ MATCH |
| meta description | `Zinc-plated Class 8.8 steel hex flange bolt, M6-1.00 thread, 16mm length, 100-pack…` ✅ MATCH | `Shop steel hex flange bolts in Class 8.8 and Grade 5/8, zinc-plated and plain finishes…` ✅ MATCH |
| meta keywords | `flange bolt, hex bolt, M6 bolt, zinc plated, class 8.8, steel fastener` ✅ present | `flange bolts, hex flange bolt, fasteners, zinc plated bolts, industrial bolts` ✅ present |
| link canonical | **null** ❌ still absent | **null** ❌ still absent |
| meta robots | **`noindex`** ❌ unchanged | **`noindex`** ❌ unchanged |
| JSON-LD (Product/Breadcrumb) | **0** ❌ none | **0** ❌ none |

Plain statements:
- PDP — title & description now MATCH the configured product seoInfo (no longer falling back to product name). robots STAYS `noindex`. canonical STILL absent. No JSON-LD.
- PLP — title & description now MATCH the configured category seoInfo (no longer falling back to category name). robots STAYS `noindex`. canonical STILL absent. No JSON-LD.

Conclusion: Once seoInfo exists, the hydrated SPA DOES render pageTitle/metaDescription/keywords correctly on both PDP and PLP. The remaining SEO gaps are independent of seoInfo population: `robots=noindex` persists and `canonical` is never emitted (and no structured data). Recommend confirming whether `noindex` is env/auth-gated (anonymous-visitor pass) vs. a production defect before scoping those two as bugs.

## Re-check (hydrated) — 2026-06-03 (later, no fix deployed)
Hard-reloaded both URLs in playwright-chrome, read final hydrated `<head>` (authenticated QA session, "QA &" title prefix is the env decorator).

| Field | PDP (`/bolts/flange-bolts/16mm-…m6-100`) | PLP (`/bolts/flange-bolts`) |
|-------|------------------------------------------|------------------------------|
| document.title | `QA & Steel Hex Flange Bolt M6 Class 8.8 Zinc \| QA SEO Test` ✅ MATCH seoInfo | `QA & Flange Bolts \| Hex & Carriage Flange Fasteners \| QA SEO Test` ✅ MATCH seoInfo |
| meta description | `Zinc-plated Class 8.8 steel hex flange bolt, M6-1.00 thread, 16mm length, 100-pack…` ✅ MATCH seoInfo | `Shop steel hex flange bolts in Class 8.8 and Grade 5/8, zinc-plated and plain finishes…` ✅ MATCH seoInfo |
| meta keywords | `flange bolt, hex bolt, M6 bolt, zinc plated, class 8.8, steel fastener` ✅ present | `flange bolts, hex flange bolt, fasteners, zinc plated bolts, industrial bolts` ✅ present |
| link canonical | **null** ❌ still absent | **null** ❌ still absent |
| meta robots | **null** — `noindex` tag NO LONGER PRESENT ⚠️ CHANGED (was `noindex` in prior re-test) | **null** — `noindex` tag NO LONGER PRESENT ⚠️ CHANGED (was `noindex`) |
| JSON-LD | **0** ❌ none | **0** ❌ none |

Plain statements:
- PDP — title & description MATCH configured seoInfo. robots is now **absent (null)** — the `noindex` meta is gone, NOT `noindex` anymore. canonical STILL absent. No JSON-LD.
- PLP — title & description MATCH configured seoInfo. robots is now **absent (null)** — no `noindex`. canonical STILL absent. No JSON-LD.

⚠️ Unexpected vs. the stated expectation ("robots=noindex"): the `noindex` meta tag is no longer emitted on either page. Either env/store config changed since the prior re-test or the page is now in a non-`noindex` state in this session. Title/description/keywords behave as expected (rendered from seoInfo). canonical + JSON-LD remain absent on both pages.

## Live re-check — global index flip (2026-06-03)
Storefront static robots default just flipped to `index`. Hard-reloaded each URL in playwright-chrome, read final hydrated `meta[name="robots"]` + title (authenticated QA session, "QA &" = env title decorator).

| # | Requested URL | Final URL | document.title | meta robots | Expected | Verdict |
|---|---------------|-----------|----------------|-------------|----------|---------|
| 1 | `/bolts/flange-bolts/16mm-…m6-100` (PDP) | same | `QA & Steel Hex Flange Bolt M6 Class 8.8 Zinc \| QA SEO Test` | **`index`** | index | ✅ correct |
| 2 | `/account` (PRIVATE) | `/account/dashboard` (auth redirect) | `QA & Orders` | **`index`** | noindex | ❌ WRONG |
| 3 | `/cart` (PRIVATE/checkout) | `/cart` | `QA & Cart` | **`index`** | noindex | ❌ WRONG |
| 4 | `/this-does-not-exist-xyz` (soft-404) | same | `QA & 404 Page not found` | **`index`** | noindex | ❌ WRONG |

Plain statements:
- PDP — `index`. Correct (public catalog page should be indexable).
- Account dashboard (private) — `index`. WRONG: a logged-in account page must be `noindex`.
- Cart (private) — `index`. WRONG: cart/checkout must be `noindex`.
- Soft-404 — `index` and HTTP-200-style SPA 404 page. WRONG: a not-found page must be `noindex` (and ideally non-200).

Conclusion: the new global `index` default is applied indiscriminately. Private pages (`/account/*`, `/cart`) and the soft-404 are all marked `index` with no per-route `noindex` override. This is a real SEO defect introduced by the flip — Google could index private account pages, the cart, and a 404. Per-route `noindex` rules are needed for account/checkout/404; product/category pages indexing is correct.

## PR #2313 verification (settled build) — 2026-06-03
Build deployed: footer **Ver. 2.51.0-pr-2313-d50a-d50a3f2e**. Ran in a **logged-out** context (signed out via UI first, so `/account` redirects to `/sign-in`). Hard-reloaded each URL in playwright-chrome, read final hydrated `meta[name="robots"]` + title.

| # | Requested URL | Final URL | document.title | meta robots | Expected | Verdict |
|---|---------------|-----------|----------------|-------------|----------|---------|
| 1 | `/bolts/flange-bolts/16mm-…m6-100` (PDP) | same | `QA & Steel Hex Flange Bolt M6 Class 8.8 Zinc \| QA SEO Test` | `index, follow` | index, follow | ✅ |
| 2 | `/bolts/flange-bolts` (PLP) | same | `QA & Flange Bolts \| Hex & Carriage Flange Fasteners \| QA SEO Test` | `index, follow` | index, follow | ✅ |
| 3 | `/catalog` (root) | same | `QA & Catalog` | `index, follow` | index, follow | ✅ |
| 4 | `/cart` | same | `QA & Cart` | `noindex, follow` | noindex, follow | ✅ |
| 5 | `/account` (requiresAuth) | `/sign-in?returnUrl=/account/dashboard` (logged-out redirect) | `QA & Sign in` | `noindex, follow` | noindex, follow | ✅ |
| 6 | `/sign-in` (public) | same | `QA & Sign in` | `noindex, follow` | noindex, follow | ✅ |
| 7 | `/this-does-not-exist-xyz` (soft-404) | same | `QA & 404 Page not found` | `noindex, follow` | noindex, follow | ✅ |

Result: **7/7 PASS.** PR #2313's route-aware robots logic works correctly in the hydrated SPA. Indexable routes (PDP / PLP / catalog) emit `index, follow`; private + 404 routes (`/cart`, `/account`→`/sign-in`, `/sign-in`, soft-404) emit `noindex, follow`. This fixes the over-broad global `index` default flagged in the prior "Live re-check — global index flip" section (cart/account/404 were wrongly `index`). seoInfo title/description rendering remains intact. Logged-in state: signed OUT for this run.
