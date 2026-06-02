# BUG-SEO-metadata-missing-storefront — Storefront SEO metadata not injected on any page (systemic infrastructure gap)

- **Component:** vc-frontend (storefront SPA, Vue 3)
- **Environment:** QA — https://vcst-qa-storefront.govirto.com
- **Browser:** Firefox (playwright-firefox), anonymous session
- **Discovered during:** REG-2026-04-20-1000 (follow-up investigation for CAT-040, CAT-041, CAT-049)
- **Severity (recommended):** **HIGH**
- **Priority:** P1
- **Type:** Infrastructure / technical debt
- **Labels:** `seo`, `storefront`, `vc-frontend`, `unhead`, `structured-data`

---

## Severity rationale (HIGH, not MEDIUM)

The original finding was scoped as MEDIUM because a single test flow was affected. Full-sitemap evidence elevates this to HIGH because:

1. **Coverage of canonical: 0/13 pages.** Creates a guaranteed duplicate-content problem the moment this shell ships to production. Example: `/category/61b05fae-...` and `/accessories/allbiz` render identical content without a canonical to pick a winner.
2. **Meta description: 31% coverage, and the 4 "present" values are placeholder stubs** (`"catalog"`, `"Bulk order page"`, `"Test compare products page description"`) — one looks like a translation-key leak. Treat as effectively 0% real coverage.
3. **The SPA shell hardcodes `<meta name="robots" content="noindex">`** in `index.html`. `usePageHead()` appends but does not override. On production this would deindex every page unless the shell is edited per environment — but there is no mechanism to override it per route today. That is a release-blocker for any customer going live.
4. **Zero structured data on any page type.** No `Product`, `BreadcrumbList`, `WebSite`, or `Organization` JSON-LD. Rich-results eligibility is lost across the whole storefront.

If severity MEDIUM is kept (because robots=noindex blocks crawlers anyway on QA), then a sibling P0 must be filed: *"Shell hardcodes `noindex` and no composable can override it — production will be deindexed on first deploy."*

---

## Systemic root cause

vc-frontend ships a Vue 3 `@unhead/vue` head-management composable (`client-app/core/composables/usePageHead.ts`) that only supports `<title>` + `<meta name>` pairs. It does **not** expose:
- `<link rel="canonical">`
- `<meta property="og:*">` (note: `og:*` uses `property=`, not `name=`)
- `<script type="application/ld+json">`
- `<link rel="alternate" hreflang>`

Some pages DO emit a partial set of `og:*` tags (PDP, category, search) — so a second, separate mechanism is wiring OG somewhere (likely a dedicated component), but it is incomplete, inconsistent, and not covering home/brands/cart.

**Verdict: infrastructure missing, not per-page wiring missing.** The composable API must be expanded before per-page calls can be added.

---

## Per-page audit matrix (12 pages + 404)

| # | Page | title | canonical | description | robots | og:title | og:desc | og:image | og:url | og:type | JSON-LD | hreflang |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Homepage `/` | Virto Commerce (shell fallback) | missing | missing | noindex | missing | missing | missing | missing | missing | 0 | missing |
| 2 | Category (ID→slug redirect) `/accessories/allbiz` | QA & Allbiz | missing | missing | noindex | present | missing | missing | present (stale ID URL) | website | 0 | missing |
| 3 | Category slug `/coffee-and-tea` | QA & Coffee and tea | missing | missing | noindex | present | missing | missing | present | website | 0 | missing |
| 4 | Brands `/brands` | QA & Brands | missing | missing | noindex | missing | missing | missing | missing | missing | 0 | missing |
| 5 | Search `/search?q=hoodie` | QA & Catalog (generic) | missing | missing | noindex | present ("QA & Catalog") | missing | missing | present | website | 0 | missing |
| 6 | PDP simple `/product/bee0d93a-...` | QA & UNTUCKit eGift Card | missing | missing | noindex | present | missing | **present (double-encoded URL)** | present | website (should be product) | 0 | missing |
| 7 | PDP configurable `/products-with-options/configurations/agent-test-config-gift-box-20260327` | QA & AGENT-TEST-Config-Gift-Box | missing | missing | noindex | present | missing | missing | present | website (should be product) | 0 | missing |
| 8 | Cart `/cart` | QA & Cart | missing | missing | noindex | missing | missing | missing | missing | missing | 0 | missing |
| 9 | Compare `/compare` | QA & Compare products | missing | **"Test compare products page description"** | noindex | missing | missing | missing | missing | missing | 0 | missing |
| 10 | Contacts `/contacts` | QA & Contacts | missing | missing | noindex | present | missing | missing | present | website | 0 | missing |
| 11 | Bulk order `/bulk-order` | QA & Bulk order | missing | **"Bulk order page"** | noindex | missing | missing | missing | missing | missing | 0 | missing |
| 12 | Catalog `/catalog` | QA & Catalog | missing | **"catalog"** | noindex | present | **"catalog"** | missing | missing | missing | 0 | missing |
| 13 | 404 invalid URL | QA & 404 Page not found | missing | missing | noindex | missing | missing | missing | missing | missing | 0 | missing |

### Coverage summary

| Field | Coverage | Note |
|---|---|---|
| canonical | **0%** | 0/13 pages — duplicate-content risk for every route that has an id form AND a slug form |
| description | 31% (4/13) — 100% of present values are placeholders/stubs | Effectively 0% real descriptions |
| robots | 100% `noindex` | Hardcoded in `index.html`; no per-page override path |
| og:title | 54% | Home, brands, cart, bulk-order, compare all missing it |
| og:description | **8%** (only `/catalog`, value = "catalog") | |
| og:image | **8%** (PDP only, double-encoded URL) | |
| og:type | always "website" | Should be `product` on PDPs |
| twitter:card / twitter:title / twitter:description / twitter:image | **0%** | No X/Twitter preview cards anywhere |
| JSON-LD `Product` | **0%** of PDPs | Loses rich result eligibility (price, rating, availability chips) |
| JSON-LD `BreadcrumbList` | **0%** of listing pages | |
| JSON-LD `WebSite` / `Organization` | **0%** of homepage / contacts | No sitelinks searchbox eligibility |
| hreflang | **0%** | No i18n alternates on any page |

---

## Extra defects discovered during the audit (sibling tickets recommended)

1. **PDP `og:image` is double URL-encoded**  
   Example value: `https://m.media-amazon.com/images/I/31TjNEGhuZL._SR120%25252C90_.jpg`. The source URL has `,` encoded as `%2C`; the output encodes the `%` of that sequence again to `%25` → `%25252C`. Social previews will 404. Likely a `encodeURIComponent` double-call.

2. **Placeholder descriptions leaked to production-path build**  
   `/compare` description: `"Test compare products page description"`  
   `/bulk-order`: `"Bulk order page"`  
   `/catalog`: `"catalog"`  
   These read like either translation-key defaults or unfilled admin CMS fields.

3. **Category ID route emits a stale `og:url` pointing at the ID form** while the page redirects to the slug form. Search engines will see two URLs with the same content and one self-referential `og:url` at the non-canonical path.

4. **Soft-404**  
   `/this-definitely-does-not-exist-xyz123` returns HTTP 200 with a "404 Page not found" body. Should be HTTP 404.

---

## Reproduction

1. Open any Chromium browser, go to https://vcst-qa-storefront.govirto.com/
2. Open DevTools → Elements → inspect `<head>`.
3. Confirm: no `<link rel="canonical">`, no `<meta name="description">`, no `<script type="application/ld+json">`, `<meta name="robots" content="noindex">` present.
4. Repeat on `/product/bee0d93a-cd70-4313-bc6c-716cb415b43a` (PDP), `/coffee-and-tea` (category), `/brands`, `/search?q=hoodie`. Same gaps.

One-liner to run against any page in the DevTools console:
```js
(() => { const get = s => { const el = document.head.querySelector(s); return el ? (el.getAttribute('content') || el.getAttribute('href') || '').trim() : null; }; return { title: document.title, canonical: get('link[rel="canonical"]'), description: get('meta[name="description"]'), robots: get('meta[name="robots"]'), ogTitle: get('meta[property="og:title"]'), ogDescription: get('meta[property="og:description"]'), ogType: get('meta[property="og:type"]'), jsonLd: document.head.querySelectorAll('script[type="application/ld+json"]').length }; })();
```

---

## Expected behavior (industry baseline)

- **Every public route:** unique `<title>`, unique non-empty `<meta name="description">`, self-referential `<link rel="canonical">`.
- **Homepage:** `WebSite` + `Organization` JSON-LD.
- **Category/listing pages:** `BreadcrumbList` JSON-LD; optional `CollectionPage`.
- **PDP:** `Product` JSON-LD with `name`, `image`, `description`, `sku`, `brand`, `offers` (price, currency, availability); `og:type=product`; `og:image` absolute non-double-encoded; `product:price:amount` + `product:price:currency` meta.
- **Search results:** `noindex,follow` (correct to keep noindex).
- **Cart / Checkout / Account:** `noindex` (correct).
- **Social:** `og:*` + `twitter:card=summary_large_image` + `twitter:image`.
- **i18n:** `<link rel="alternate" hreflang>` per available locale + `x-default`.

---

## Source-code evidence (vc-frontend `dev` branch)

- Head composable: [`client-app/core/composables/usePageHead.ts`](https://github.com/VirtoCommerce/vc-frontend/blob/dev/client-app/core/composables/usePageHead.ts)  
  ```ts
  import { useHead } from "@unhead/vue";
  export function usePageHead(data?: IUsePageSeoData) {
    const { title: builtTitle } = usePageTitle(data?.title ?? "");
    return useHead({
      title: builtTitle,
      meta: () => Object.entries(data?.meta ?? {}).map(([name, content]) => ({ name, content: unref(content) ?? "" })),
    });
  }
  ```
  Accepts only `{ title, meta: Record<string,string> }`. No `link`, no `script`, no `property` vs `name` distinction → **cannot emit canonical, og:*, or JSON-LD at all.**

- Shell: [`index.html`](https://github.com/VirtoCommerce/vc-frontend/blob/dev/index.html) contains `<meta name="robots" content="noindex" />` hardcoded.

- Type: `IUsePageSeoData` in `client-app/core/types/` — worth inspecting the current contract before widening it.

The infrastructure (unhead) IS in place. Per-page wiring IS partially present. What's missing is the API surface on `usePageHead` and the code path that emits canonical + OG + JSON-LD. **Root cause: infrastructure API is too narrow.**

---

## Recommended fix path (1-line summary + plan)

**One-line fix path:** *Widen `usePageHead()` to accept `{ title, meta, link, script }` (unhead supports all four natively), emit `<link rel="canonical">` derived from `useRoute()` by default, switch `og:*` emission to `property=` instead of `name=`, and add a `usePdpSeo()` / `useCategorySeo()` / `useHomepageSeo()` wrapper that builds the JSON-LD payloads.*

### Minimum viable fix (2 PRs)

**PR 1 — Expand head composable (infrastructure):**
```ts
// usePageHead.ts — add link + script + property support
export function usePageHead(data?: IUsePageSeoData) {
  const route = useRoute();
  const { title } = usePageTitle(data?.title ?? "");
  return useHead({
    title,
    link: () => [
      { rel: "canonical", href: data?.canonical ?? `${location.origin}${route.path}` },
      ...(data?.link ?? []),
    ],
    meta: () => [
      ...Object.entries(data?.meta ?? {}).map(([name, content]) => ({ name, content: unref(content) ?? "" })),
      ...Object.entries(data?.og ?? {}).map(([k, v]) => ({ property: `og:${k}`, content: unref(v) ?? "" })),
      ...Object.entries(data?.twitter ?? {}).map(([k, v]) => ({ name: `twitter:${k}`, content: unref(v) ?? "" })),
    ],
    script: () => (data?.jsonLd ?? []).map(obj => ({ type: "application/ld+json", children: JSON.stringify(obj) })),
  });
}
```
And remove `<meta name="robots" content="noindex">` from `index.html`, adding it via `usePageHead({ meta: { robots: 'noindex' } })` on routes that actually need it (search, account, cart, checkout), with a **global `VITE_DEFAULT_NOINDEX=true` env flag** for non-prod builds.

**PR 2 — Wire it per page type:**
- `HomePage.vue` → `WebSite` + `Organization` JSON-LD.
- `CategoryPage.vue` / `SearchPage.vue` → `BreadcrumbList` JSON-LD; on search, keep `robots: 'noindex,follow'`.
- `ProductPage.vue` → `Product` JSON-LD with xAPI fields (`name`, `sku`, `description`, `brand.name`, `offers.price`, `offers.priceCurrency`, `offers.availability`), `og:type=product`, fix `og:image` double-encoding.
- Remove hardcoded placeholder descriptions from `/compare`, `/bulk-order`, `/catalog`.

### Effort estimate
- Infrastructure PR: **~S (half day)** — single composable, additive change, unit tests.
- Wiring PR per page type: **~M (2–3 days)** — touches ~8 page components, needs i18n keys for descriptions.
- Fix `og:image` double-encoding: **~XS (1 hour)** — likely one `encodeURI` call to delete.

---

## Acceptance criteria

1. Every public page emits a self-referential `<link rel="canonical">` with absolute URL (or explicit override where the page should canonicalise to a different URL).
2. Every public page emits a non-empty unique `<meta name="description">`. No placeholder strings ship.
3. Homepage emits `WebSite` + `Organization` JSON-LD.
4. Every PDP emits `Product` JSON-LD (name, sku, brand, description, image[], offers.price, offers.priceCurrency, offers.availability) and `og:type=product`.
5. Every category/search/brand page emits `BreadcrumbList` JSON-LD.
6. `og:*` tags use `property=`, not `name=`. All of `og:title`, `og:description`, `og:image`, `og:url`, `og:type` are present on indexable pages.
7. `twitter:card=summary_large_image` + image + title + description on indexable pages.
8. `<meta name="robots" content="noindex">` appears only on `/cart`, `/checkout`, `/account/**`, `/search`, `/compare`, and 404. Homepage, categories, PDPs, brands do NOT carry noindex in production builds.
9. `/<invalid-url>` returns HTTP 404 (soft-404 fix — may be broken into a sibling ticket).
10. PDP `og:image` is not double-encoded.
11. `<link rel="alternate" hreflang>` emitted when > 1 locale is configured, with `x-default`.

---

## Evidence

- Audit matrix JSON: `reports/regression/REG-2026-04-20-1000/invest-evidence/seo-audit-per-page.json`
- Source code evidence: linked inline (vc-frontend `dev` branch).
- Original CAT-040/041/049 screenshots: `reports/regression/REG-2026-04-20-1000/` (`001-CAT-040-pdp-missing-*.png`, `001-CAT-041-category-*.png`).

---

## Related

- CAT-040 (PDP missing canonical + empty descriptions) — this subsumes it.
- CAT-041 (Category missing canonical + zero JSON-LD) — this subsumes it.
- CAT-049 (Slug URLs missing canonical) — this subsumes it.
- Potential sibling: **Soft-404 on invalid URLs.**
- Potential sibling: **PDP `og:image` is double URL-encoded.**
- Potential sibling: **Hardcoded `noindex` in SPA shell blocks per-route override** — **P0 release-blocker for production.**
