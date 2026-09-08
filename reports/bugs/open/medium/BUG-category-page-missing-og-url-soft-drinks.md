# Category page `/soft-drinks` emits no `og:url` — the theme's only canonical signal is absent — P2

**Env:** vcst-qa @ Platform 3.1064.0, SalesRep 3.1008.0-pr-19-5e0f, XOrder 3.1011.0, Xapi 3.1020.0

## Summary
The `/soft-drinks` category page emits no `og:url`, `og:title` or `og:type`. Per BL-SEO-003 this theme uses
`og:url` as its **sole** canonical-URL signal and emits no `link[rel=canonical]` by design, so this page
carries no canonical signal at all. Three other category pages emit it correctly, so this is page-specific
rather than a theme-wide gap.

**Severity note:** graded Medium (P2). Low was considered — there is no user-visible or functional breakage —
but the missing tag is the *only* canonical signal on an indexable commercial page, which is more than cosmetic.

## STR
1. Open the storefront and click **Soft drinks** in the main navigation menubar (resolves to `/soft-drinks`).
2. Wait for the category grid to render (h1 "Soft Drinks", "15 results", product tiles present).
3. Inspect the document `<head>` for `meta[property="og:url"]`.
4. Repeat steps 1-3 on `/printers`, `/printers/multifunction-printers` and `/snacks` for comparison.

## Expected vs Actual
- **Expected:** `og:url` present and equal to the current category URL, as on every other category page.
- **Actual:** on `/soft-drinks`, `og:url`, `og:title` and `og:type` are all `null`.

| Page | Kind | `og:url` |
|---|---|---|
| `/printers` | top-level | `https://vcst-qa-storefront.govirto.com/printers` ✅ |
| `/printers/multifunction-printers` | subcategory | `https://vcst-qa-storefront.govirto.com/printers/multifunction-printers` ✅ |
| `/snacks` | top-level | `https://vcst-qa-storefront.govirto.com/snacks` ✅ |
| `/soft-drinks` | top-level | **`null`** ❌ |

## Scope of the defect — what it is not
- **Not a top-level vs subcategory split** — `/printers` and `/snacks` are both top-level and both work.
- **Not a data gap** — xAPI `categories(storeId:"B2B-store", cultureName:"en-US")` shows **30 of 30**
  categories carry a non-null `seoInfo.semanticUrl`; Soft Drinks has `semanticUrl:"soft-drinks"`,
  `pageTitle:"Soft Drinks"`, identical in shape to the three working categories.
- **Not a lazy-render/timing artifact** — reproduced on two independent page loads and again after an
  `End`-key scroll to the bottom of the page.
- **Not "no meta on this page"** — `og:site_name` = `B2B-store` **is** present. That is emitted by the
  site-wide store-level composable, so the store-level social meta runs while the **page-level** category
  SEO block does not run at all on this page. This is the sharpest available discriminator.
- **Routing is fine** — `curl -L` returns `HTTP 200`, `num_redirects=0`, final URL `/soft-drinks`; the slug
  does not redirect to an ID-based URL.

## Root cause
**Not established.** The page-level category SEO block does not execute on this page while the store-level
one does. A local `vc-frontend` checkout gates that block behind
`canSetMeta = allowSetMeta && categoryComponentAnchorIsVisible`, which would produce exactly this symptom —
but that checkout **does not match the deployed build** (its `seoUrl` would emit a malformed literal whenever
`seoInfo.semanticUrl` is truthy, and all 30 categories have one, yet the three working pages return correct
absolute URLs). So the gate is offered as a **hypothesis only**; it needs confirming against the deployed
source. What differentiates Soft Drinks from the working categories — plausibly a CMS/Builder content block
rendered above the grid, which was visible in the page structure — is also unconfirmed.

## Oracle
BL-SEO-003 — `og:url` is this theme's sole canonical-URL signal; `link[rel=canonical]` is absent by design.

## Not a duplicate
`reports/bugs/rejected/BUG-storefront-seo-missing-canonical-meta-jsonld.md` was rejected for claiming the
missing `link[rel=canonical]` / `og:description` / BreadcrumbList JSON-LD were defects, which BL-SEO-003
documents as by-design. That report explicitly records `og:url` as **present**. A category page emitting no
`og:url` at all is a different and previously unreported finding.

## Fix Routing
- **Repo:** vc-frontend (category page SEO head tags)
- **Kind:** frontend

## Provenance
**Found by:** `/qa-regression` re-verification run `REG-2026-09-08-0931` (suite 001, incidental to CAT-049)
**Case:** CAT-049
**Evidence:** `reports/regression/REG-2026-09-08-0931/traces/CAT-049-FAIL-trace.json`,
`reports/regression/REG-2026-09-08-0931/screenshots/CAT-049-FAIL-r3-soft-drinks-no-ogurl.png`
