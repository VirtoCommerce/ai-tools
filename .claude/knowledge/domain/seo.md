---
domain_slug: seo
applicability: universal
rationale: |
  What the SEO & URLs feature IS on Virto Commerce: SEO records (slugs, titles, meta) that the owning modules store
  per object/store/language, the per-store link type that turns them into URLs, the resolver pipeline that maps a
  requested URL back to an object, universal redirect rules, broken-link detection, and the Debug SEO links tool,
  across the Admin SPA, the vc-frontend storefront and the REST/xAPI contract. Built because the domain had no map
  and no prior BA analysis, and because VCST-5989 (the Debug tool) is deployed here as PR builds of the Seo and
  Catalog modules: a ticket-scoped context would inherit the ticket's narrowness (one tool, one permalink), while
  the broken-link list, the link-type setting and the head metadata are what other tickets touch next.
generated: 2026-10-05
rev: 1
stale_after_days: 60
expires_after_days: 120
deployed: Platform 3.1077.0-alpha.13406 · VirtoCommerce.Seo 3.1006.0-alpha.101-vcst-5989-seo-explain-issues (PR build of vc-module-seo#22, OPEN) · VirtoCommerce.Catalog 3.1049.0-pr-910-04a5 (PR build of vc-module-catalog#910, OPEN) · Store 3.1009.0-alpha.801 · Xapi 3.1026.0-alpha.213 · XCatalog 3.1023.0-alpha.234 · XFrontend 3.1007.0-alpha.55 · XCMS 3.1008.0-alpha.89 · Content 3.1006.0-alpha.1068 · PageBuilderModule 3.1033.0-alpha.874 · Sitemaps 3.1006.0-alpha.433 · storefront theme vc-theme-b2b-vue 2.58.0 (footer "Ver. 2.58.0") · 90 modules, 0 validation errors · TEST_ENV=vcptcore_dev, ENV_RISK=dev
sources:
  - reports/ba/** and reports/ba/test-models/** — NO SEO deliverable exists (no SEO folder under reports/ba, no earlier domain map). The four models named for this pass were read by path: reports/ba/test-models/VCST-4933-2026-09-17.md (277 lines, SEO-adjacent: 1 relevant line), VCST-2945-2026-09-28.md (274 lines, adjacent), VCST-5024-2026-09-16.md (139 lines, not SEO), VCST-5317-2026-09-09.md (257 lines, not SEO) — verdicts in §6
  - live enumeration on vcptcore_dev, 2026-10-05, playwright-edge — Admin SPA (Stores list, B2B-store blade and its SEO widgets, Active broken links list+details, Active rules list, Debug SEO links blade/stages/candidates, store Settings, Settings blade, Catalog list, B2B-mixed catalog and Books category SEO widgets) and anonymous storefront (home, product page, 404 page); plus static fetches of index.html, robots.txt, llms.txt, sitemap.xml and the deployed JS chunks; REST and xAPI reads as anonymous / personal / org / admin identities
  - module source read: vc-module-seo (local clone, branch fix/VCST-5989-seo-explain-issues @66b42f0) + PR vc-module-seo#22 body; vc-module-catalog (local clone @04a543b0, which is the deployed pr-910-04a5 build) + PR #910 body; vc-module-store, vc-module-x-api (SlugInfoQueryHandler unchanged upstream since 2025-11-14), vc-module-x-catalog, vc-module-x-frontend, vc-module-core (local clones); vc-frontend 2.59.0 local clone, cross-checked against the deployed 2.58.0 bundle
  - published guides: VirtoCommerce/vc-docs main@5ddb3a3d65 (2026-10-01) fetched with gh because the VirtoOZ MCP was not connected — PlatformUserGuide (seo/*, catalog/managing-SEO, store/settings, store/overview, general-guidelines), PlatformDeveloperGuide (Fundamentals/SEO/*, xAPI slugInfo and SeoInfo), StorefrontDeveloperGuide (spa-architecture-for-seo-and-404-handling), StorefrontUserGuide (39 pages — no SEO, slug, permalink or URL content)
  - Jira VCST-5989 (description + 2 comments, read with the explicit field list)
  - .claude/knowledge/api/graphql-schema.md (live introspection 2026-09-29): the SEO types are not in its curated type sections, so SeoInfo, Category, Breadcrumb, BrandType, StoreSettingsType, SlugInfoResponseType and PageContextResponseType were introspected live 2026-10-05; the slugInfo and pageContext signatures there match live
  - config/test-suites.json + regression/suites/** (152 suites), notably regression/suites/Backend/seo/066-seo.csv and regression/suites/Frontend/cross-cutting/048d-structured-data-seo.csv
excludes: Sitemaps module (blades/export; /sitemap.xml returns a real 404 on this env), robots.txt / llms.txt upload (Store assets; static files exist), Prerender.io, structured-data detail beyond a one-line note (suite 048d / VCST-5536 brand profile), News / Vendor / ContentFile SEO owners (one-line existence notes in §2), localized Admin UI strings. Each is a later pass.
---

# SEO & URLs — domain map

> Refresh with `/qa-domain-map seo`. This file answers **what the feature is and where its surfaces are**. It does **not** carry behavioural rules — those are `BL-*` (`npm run bl:extract -- --domain seo`) — and it can **never ground an assertion as `{DOC}`**. Pointer index plus surface inventory: *where to look* and *what exists*, never *what correct looks like*.

**Every claim carries a verdict.** `CONFIRMED` = observed live or read at source this pass · `DRIFT` = prior art says otherwise and prior art is wrong · `MISSING` = documented, does not exist · `UNVERIFIED` = not established, and **not** to be treated as true. Evidence tags: `live` (vcptcore_dev, 2026-10-05) · `src` (module source, local clone or `gh`) · `bundle` (the deployed storefront JS) · `{DOC}` (verbatim from a guide fetched this pass) · `{TICKET}` (Jira VCST-5989).

> **MID-CHANGE — read the Debug rows after the PRs land.** Seo and Catalog are VCST-5989 PR builds (`vc-module-seo#22`, `vc-module-catalog#910`, both OPEN, deployed here 2026-10-05). Stage 0 "Candidates", the `reasons[]`/`isResolved` fields and "explain no longer logs broken links" exist only on these builds. The guide still describes the six-stage tool (D2). The Jira follow-up (a result line "Redirected by a rule / Resolved / Redirected by a broken link / Not found") is a separate task and is not deployed (D17). Re-read §2a, D2, D17 and G1 after these PRs merge or are reverted.

## §1 — Purpose and value chain

**Purpose: nearest declared statement is a capability list, not a purpose; the value chain is `UNDECLARED`.** Looked in: PlatformUserGuide `seo/overview`, `seo/*`, `catalog/managing-SEO`, `store/settings`; PlatformDeveloperGuide `Fundamentals/SEO/*`; StorefrontDeveloperGuide `spa-architecture-for-seo-and-404-handling`; StorefrontUserGuide (all 39 pages, zero SEO/URL/slug/permalink content); no BA analysis or earlier map exists. The closest statement, `{DOC}` (https://docs.virtocommerce.org/platform/user-guide/seo/overview/): *"The **SEO** module provides a flexible infrastructure for managing SEO-related data across the Platform. It supports SEO metadata (e.g., slugs, titles, meta descriptions) for various entities such as catalogs, categories, products, and custom pages."* It says what the module provides, never what it is for. The chain below is **reconstructed from source + live** and is the first written statement, to be cited against rather than treated as authority.

| # | Link, in the customer's words | Mechanism | Verdict |
|---|---|---|---|
| 1 | An object gets a URL slug and page metadata | One SEO record per (object, store?, language?) holding slug, page title, meta description/keywords, image alt, active flag. **Stored by the owning module** (Catalog table for catalog/category/product; Store, Customer-Vendor, News, Content/Pages by theirs), edited in the owner's blade SEO widget and persisted by the owner's Save. The SEO module has no write path (`PUT /api/seoinfos/batchupdate` is a stub, D13) | `CONFIRMED` src + live (Category, Catalog) |
| 2 | The store decides what the URL looks like | Per-store setting `Stores.SeoLinksType` (None / Short / Collapsed / Long, default Collapsed) -> the server builds each object's `slug` as a path from its outline (D8) | `CONFIRMED` live + src |
| 3 | A visitor lands on a URL | The SPA shell is served for any path (HTTP 200). A hard load runs `pageContext(permalink)` once at boot; in-app navigation runs `GetSlugInfo(permalink)`. The permalink carries **no leading slash** except home `/` | `CONFIRMED` live (network) + src |
| 4 | The platform maps the permalink back to an object | `SlugInfoQueryHandler`: store lookup -> **redirect rules first** (per store, priority desc) -> `CompositeSeoResolver` fans out to all `ISeoResolver`s (Catalog, Brand, Store, News, Content/Pages) -> best-match pipeline (store / organization / language filter, score, object-type priority) -> `entityInfo`, or `redirectUrl` from a Resolved broken link when nothing matched | `CONFIRMED` src; resolution `CONFIRMED` live for Category, Product, ContentFile |
| 5 | The page renders and sets its head | `slug-content.vue` switches on `objectType` (Catalog, Category, CatalogProduct, Brands, Brand, NewsArticle, Pages, ContentFile); `useSeoMeta` sets title / description / keywords / og:* from `seoInfo`; live title is "<store name> <SEO page title>" | `CONFIRMED` live (titles) + src; og:* values `UNVERIFIED` (D9) |
| 6 | Nothing matched | Storefront shows its own 404 with **HTTP 200**; if no resolver returned anything, `SeoInfoNotFoundEvent` -> `SaveBrokenLinkJob` upserts a BrokenLink (permalink, store, language), HitCount+1, only while `Seo.BrokenLinkDetection.Enabled` (default true). Asynchronous (record written about 150 ms after the request) | `CONFIRMED` live + src |
| 7 | An admin triages | Store blade: "Active broken links" (count of Active records) -> list -> details (Status Active / Resolved / Accepted + Redirect URL); "Active rules" -> universal redirect rules; "Debug SEO" -> pipeline trace | `CONFIRMED` live (surfaces); Resolved/Accepted states never seen (all 71 Active) |
| 8 | The triage takes effect | A Resolved record with Redirect URL, or a matching rule, comes back as `slugInfo.redirectUrl` and the **SPA** navigates (`router.replace` internal, `location.href` external) — a client-side redirect, never an HTTP 301/302 (D4) | `CONFIRMED` src; `UNVERIFIED` live (needs a mutation, G3/G4) |
| 9 | A slug is retired or changed | Old URL stops resolving at once (the resolver reads the DB and matches the current link-type path exactly) -> becomes a broken link; nothing auto-creates a redirect; broken-link records are never auto-closed and have no TTL (D1) | `CONFIRMED` src; reverse behaviour `UNVERIFIED` live (needs a mutation) |

### Actors

| Actor | Can do | Verdict |
|---|---|---|
| Anonymous visitor | Reaches every resolvable URL; every hard load of an unresolvable path adds a hit to the broken-link table (`createdBy` is `http:anonymous`) | `CONFIRMED` live |
| Signed-in customer / org user | **Identical slug resolution**: `slugInfo` returned byte-identical `entityInfo` for anonymous, personal, organization and admin identities (`seed-books`); catalog SEO has no organization or user column | `CONFIRMED` live (API level); storefront UI walk as a signed-in user not done (G10) |
| Admin with `seo:read` | Reads broken links, rules, `explain`, `duplicates`, `search`; opens Debug | `CONFIRMED` live (as admin) |
| Admin with `seo:update` / `seo:create` / `seo:delete` | Writes broken links and redirect rules (REST + blades). Does **not** edit catalog SEO records (those follow the owner module's permission) | `CONFIRMED` src; per-role live `UNVERIFIED` |
| Bots / crawlers | Get the static shell (`noindex` on this env), `robots.txt` `Disallow: /`; Prerender.io is documented for real bot traffic | shell/robots `CONFIRMED` live; Prerender path `UNVERIFIED` (G16) |

## §2 — Surface inventory

**Enumerate; never infer.** Anything not seen render live is tagged `src`/`UNVERIFIED`. The only store with a storefront URL is B2B-store; the other four stores can only be walked in Admin, REST and xAPI.

### 2a. Back office (Admin SPA, https://<env>/ , hash routes)

**There is no SEO menu entry.** The 8 top-level + 39 "More" entries (Browse 30, other 9) contain none named SEO, Sitemaps or Broken links (`live`). The permission `seo:access` is described as "Open SEO menu" (D6).

| Surface | How reached | Guard | Verdict |
|---|---|---|---|
| Widget **Debug SEO** (blade "Debug SEO links") | Stores -> store -> widget; first widget on the blade | `seo:read` on the API it calls | `CONFIRMED` live |
| Widget **Active broken links** (count 71 now, 70 at pass start) | same blade; count = Active-status records for the store; shows "..." until loaded, and only queries while `Seo.BrokenLinkDetection.Enabled` | `seo:read` | `CONFIRMED` live + src |
| Widget **Active rules** (0) | same blade; counts rules with `isActive=true` only (the list blade lists all) | `seo:read` | `CONFIRMED` live + src |
| Widget **SEO** on the store (store-level SEO records, fixed to this store) | same blade; B2B-store shows "No data" | owner module permission | `CONFIRMED` live |
| Widget **Settings** (112) -> group "Store > SEO" -> **SEO links** (select; B2B-store shows Long; has "Reset to default value") | same blade | store settings permission | `CONFIRMED` live; dropdown options `UNVERIFIED` in UI (descriptor lists None/Short/Collapsed/Long) |
| Settings -> **Seo** -> General: toggles "Broken links detection" and "SEO" | main menu More -> Settings | platform settings | labels `CONFIRMED` live; toggle states `UNVERIFIED` in UI (REST: both default true, no override) |
| Settings -> **Catalog** -> General: toggle "SEO duplicates detection" (`Catalog.UseSeoDeduplication`, default false, no override) | same | platform settings | `CONFIRMED` live |
| **SEO widget** on Category (live: "Books"; list Language / Semantic URL / Store, toolbar Add + Delete, 1 row `en-US seed-books B2B-store`) and on Catalog (live: virtual B2B-mixed; 1 row `en-US catalog B2B-store`) | Catalog -> row context menu "Manage" -> widget | `catalog:*` + owner | `CONFIRMED` live |
| SEO widget on **Product** (itemDetail), on **Vendor** (customer module, hidden while new), and for News / Pages / ContentFile | owner blades | owner | `CONFIRMED` src; `UNVERIFIED` live |
| Brand pages: "Brand settings" widget on the store blade; brands-root SEO through the Catalog SEO widget on the brand catalog | store blade | catalog | exists `CONFIRMED` live (widget present); contents `UNVERIFIED` (G8) |
| Permissions `seo:access/create/read/update/delete` (group "Seo", no scopes) | Security -> roles | — | `CONFIRMED` live (`GET /api/platform/security/permissions`) |

**Broken links** (list, details) — `live`:

| Aspect | Observed | Verdict |
|---|---|---|
| List blade "Broken links" (badge = total records) | toolbar **Refresh · Delete** only; keyword search; ui-grid with paging (20 rows/page), sortable columns **Permalink · Status · Hit count**; Delete works on a multi-select. **No status filter, no bulk resolve/accept, no Add** | `CONFIRMED` live + src |
| Details blade (title = permalink) | toolbar **Save · Reset · Delete**; **Permalink** (read-only), **Redirect URL** (editable), **Status** (select Active/Resolved/Accepted), **Hit count**, **Language**, **Latest hit date**, **Created date** (all read-only; dates are raw ISO-8601 UTC strings such as `2026-09-15T16:22:37.4522628Z`) | `CONFIRMED` live |
| REST record | adds `storeId`, `modifiedDate`, `createdBy`, `modifiedBy`, `id`; `createdBy` is `http:anonymous` for detected links | `CONFIRMED` live |

**Redirect rules** — list `live`, details `src` (the live "Add" click was denied by the permission classifier):

| Aspect | Observed | Verdict |
|---|---|---|
| List blade "Redirect rules" | toolbar **Refresh · Add · Delete**; keyword search; select-all checkbox; columns **Inbound · Outbound**; 0 rows in every store | `CONFIRMED` live |
| Details blade | **Is active** (switch), **Inbound rule**, **Outbound rule**, **Redirect rule type** (required select Static / Regex), **Priority** (required integer). Validation (UI + FluentValidation): Inbound non-empty and a valid regex when type is Regex; Outbound non-empty and every `$n` <= the number of capture groups in Inbound; StoreId required | `CONFIRMED` src; `UNVERIFIED` live |

**Debug SEO links** — `live`: blade fields **Store** (read-only), **Default language** (read-only), **Language code** (select, preset en-US), **Permalink** (placeholder `/path/to/page`), **Organization** (select "Select organization"), button **Debug** (disabled until a permalink is typed). The Stages blade lists **7 rows with Items Count**: "Stage 0: Candidates", then Stages 1–6 Original / Filtered / Scored / FilteredScore / Ordered / Final. Clicking Stage 0 opens a Candidates blade with 8 sortable columns **Semantic URL · Resolved · Rejection reasons · Object Type · Object ID · Language · Store · Active** (resolved row: check mark, no reason). Walked only on a resolving permalink (G1): `seed-books` on B2B-store -> every stage 1; `seed-test-fixtures` -> Candidates 4 / Original 1 (D7). `CONFIRMED` live.

**SEO details blade** (category / product / store owners) — `src` + locale: Active, Store, Language, URL slug (required), Page title, Meta description, Meta keywords (255), Image alternative text. The slug field rejects the characters `$ + ; = % { } [ ] <pipe> \ / @ space ~ # ! ^ * & ? : ' < > ,` ("The URL contains invalid characters") — so a single slug can never contain a slash; paths are composed from parents. "Duplicate URL detected" is client-side and compares only the SAME object's SEO rows for the same store (D7). `CONFIRMED` src; `UNVERIFIED` live.

**Hidden by default:** none found (grids have a Grid Menu that was not opened — `UNVERIFIED`). **Absent:** a status filter and bulk status change on broken links; a "create broken link" control; an Organization field on the SEO details blade (D16); a per-object preview of the built URL; any list of all SEO records across objects.

**Not manageable from the back office**

| Thing | Where it lives instead | Verdict |
|---|---|---|
| Editing the SEO records of catalog objects in bulk, or searching them by slug | only per object in each owner blade; REST `PUT /api/seoinfos/batchupdate` throws `NotImplementedException` | `CONFIRMED` src |
| Seeing what a Resolved broken link or an active rule would do to a URL | not shown by Debug (D17); only the storefront reveals it | `CONFIRMED` src + `{TICKET}` |
| Organization-scoped SEO for catalog objects | no column exists (D16) | `CONFIRMED` src + live |
| Turning the whole SEO feature off | the "SEO" toggle (`Seo.Enabled`) is not read by any code in the cloned modules (D5) | `CONFIRMED` src |
| Sitemap, robots.txt, llms.txt | Sitemaps module / Store assets (excluded) | existence `CONFIRMED` live |
| Creating a broken link by hand | REST `POST /api/seo/broken-links` only | `CONFIRMED` live (no UI control) + src |

### 2b. Storefront (vc-frontend theme 2.58.0, anonymous walk; https://<front>/)

| Surface | Observed | Verdict |
|---|---|---|
| URL shapes by link type (`OutlineExtensions.GetSeoPath`, catalog Core) | **None** -> no SEO path (ID routes); **Short** -> the object's own slug; **Collapsed** (default) -> all outline items except catalog and *linked* categories, and no path at all when the last item is a linked category; **Long** -> every non-catalog outline item. Any out-of-vocabulary value falls into the Short branch of the `switch` | None/Short/OOV `UNVERIFIED` (no store uses them); Long and Collapsed `CONFIRMED` live |
| Live Long (B2B-store) | product `/seed-electronics/seed-cable-ties-100pack`, category `/seed-books`, nested `/seed-books/seed-books-fiction`; home-page tiles and breadcrumbs carry the same paths; breadcrumb root "Catalog" -> `catalog` | `CONFIRMED` live |
| Live Collapsed (Clothing / Electronics / store-acme, xAPI only: no storefront URL) | `v-dresses`, `v-dresses/day-dresses/skater-dresses`, `televisions/vizio`; 5 of 19 Clothing categories have `slug` null | `CONFIRMED` live (xAPI) |
| Resolution calls | boot: `GetPageContext {domain, userId, permalink:"/"...}`; navigation: `GetSlugInfo {storeId, userId, cultureName, permalink:"seed-electronics/seed-cable-ties-100pack"}` followed by two `GetPage` calls (one with the placeholder id `?`), then `GetProduct` | `CONFIRMED` live (network) |
| Object types rendered | live: `ContentFile` (home `/` -> semanticUrl "/", id = base64 of `B2B-store::pages::/homepage.page`; `contacts`), `CatalogProduct`, `Category`; src also Catalog, Brands, Brand, NewsArticle, Pages | live part `CONFIRMED`; rest `UNVERIFIED` live |
| Not found | page "404 / Page not found / An error occurred. Should we take you back to home page? [Home page]", tab title "B2B-store 404 Page not found"; `HEAD` on that path returns HTTP/2 200 text/html (soft 404) | `CONFIRMED` live |
| Head metadata | Static `index.html`: `<title>Virto Commerce</title>`, `<meta name="robots" content="noindex" />`, no description, no canonical. Client-set: home title "B2B-store Homepage"; PDP title "B2B-store Cable Ties 100 Pack" (SEO page title with the store-name prefix), PDP meta description from the SEO record. og:url on PDP and category is built from an escaped template literal (D9) | titles `CONFIRMED` live; og:* DOM values `UNVERIFIED` (G6) |
| Static SEO files on this env | `/robots.txt` = `Disallow: /` ("Restrictive policy for demo environments"); `/llms.txt` = 200 text/plain with a back-office override line; `/sitemap.xml` = **real 404** from nginx (the shell returns 200 for every extension-less path, nginx 404s a missing `.xml`) | `CONFIRMED` live; environment policy, not product behaviour |
| Language | `de-DE` / `fr-FR` requests for a slug with only an en-US record resolve to that record (`entityInfo.languageCode` = en-US) | `CONFIRMED` live (xAPI) |
| Identity | same entityInfo for anonymous / personal / org / admin; no UI difference observed anonymously, signed-in UI walk not done | API `CONFIRMED`; UI `UNVERIFIED` (G10) |

**Not manageable from the storefront:** slugs, rules, broken links, link type — all back-office/API. The storefront only displays; it neither records nor edits SEO data except through the not-found side effect (D1).

### 2c. API / contract (REST + xAPI)

Schema reference: `.claude/knowledge/api/graphql-schema.md`, introspected **2026-09-29**; the SEO types were re-introspected live 2026-10-05 (they are not in that file's curated type sections).

**REST — live Swagger `VirtoCommerce.Seo`: 10 paths / 16 operations** (`CONFIRMED` live)

| Route | Operations | Permission | Notes |
|---|---|---|---|
| `/api/seoinfos/search` | POST | `seo:read` | body = SeoSearchCriteria (storeId, languageCode, permalink, slug, organizationId, userId, paging). Runs `CompositeSeoResolver.FindSeoAsync`: resolves a permalink as a path under the store's link type (verified: nested category only as `parent/child`, product only by full path on Long; plain slug on Collapsed). **A no-match call publishes the not-found event = writes a broken link** (D1) |
| `/api/seoinfos/explain` | GET | `seo:read` | storeId, organizationId, storeDefaultLanguage, languageCode, permalink (strips one leading `/`); returns stages with `reasons[]`/`isResolved` on this PR build; Take 100; publishes no event (src); exposes every record with the slug across stores, inactive included, to any `seo:read` holder (decision recorded in PR #22) |
| `/api/seoinfos/duplicates` | GET | `seo:read` | objectId, objectType; `[]` on this env for a category that shares its slug with three others (detector off by default, D7) |
| `/api/seoinfos/batchupdate` | PUT | `seo:update` | **stub** — throws `NotImplementedException` (D13) |
| `/api/seoinfos/{slug}` | GET | `seo:read` | `[Obsolete VC0014]`; present in source, absent from live Swagger; sets Slug only, which the Catalog resolver does not read (src) |
| `/api/seo/broken-links` | GET {id}, POST search, POST, PUT, PATCH {id}, DELETE ?ids | read / create / update / delete | search is a pure read; the record carries permalink, storeId, language, status, redirectUrl, hitCount, lastHitDate |
| `/api/seo/redirect-rules` | GET {id}, POST search, POST, PUT, PATCH {id}, DELETE ?ids | same | 0 rules in any store (`live`) |

SEO records of catalog objects travel inside the catalog REST objects: `GET /api/catalog/categories/{id}` and `/products/{id}` return `seoInfos[]` and `seoObjectType`, each record with `organizationId` null (`live`).

**xAPI** (live 2026-10-05):
- `slugInfo(slug, permalink, storeId, userId, cultureName)` -> `SlugInfoResponseType { entityInfo: SeoInfo, redirectUrl }`. There is no `organizationId` argument; the handler takes it from the token. `slug` is an obsolete alias of `permalink` (VC0008).
- `pageContext(domain, cultureName, permalink, organizationId, userId, storeId)` -> `{ slugInfo, store, whiteLabelingSettings, user }`; resolves the store by domain and expands a two-letter culture.
- Type `SeoInfo` has 13 fields: id!, name, semanticUrl!, outline, pageTitle, metaDescription, imageAltDescription, metaKeywords, storeId, objectId!, objectType!, isActive!, languageCode (`!` = non-null; **no organizationId**).
- `Product` has slug, outline, outlines, seoInfo, breadcrumbs; `Category` has slug, path, outline, outlines, seoInfo, breadcrumbs; `BrandType` has permalink; `Breadcrumb` is { itemId, title, typeName, seoPath, semanticUrl }; `StoreSettingsType.seoLinkType`; `page`, `pages(keyword!)`, `pageDocument`, `pageDocuments(keyword!)` carry permalinks.
- None of the 149 mutations touches SEO, redirects or broken links.

**Settings, config, events** (`live` descriptors; appsettings not API-visible):
- `Seo.Enabled` (Boolean, default true, **never read**, D5); `Seo.BrokenLinkDetection.Enabled` (Boolean, default true, effective true); `Catalog.UseSeoDeduplication` (default false, effective false); `Stores.SeoLinksType` (ShortText; allowed None / Short / Collapsed / Long; default Collapsed; global record reads Long).
- appsettings `Seo:SeoInfoResolver:ObjectTypePriority` (default CatalogProduct, Category, Catalog, Brand, Brands, ContentFile, Pages — the last has the highest priority) `UNVERIFIED` live.
- Event `SeoInfoNotFoundEvent` -> `SeoInfoNotFoundEventHandler` -> `SaveBrokenLinkJob` (platform background-job abstraction); `RedirectRule*` / `BrokenLink*` changing/changed events; `SeoExportImport` (redirect rules + broken links, batches of 100) `src` only.

**Not reachable through the API:** writing a catalog object's SEO record except through that object's save; any SEO mutation in xAPI; reading the redirect-rule or broken-link redirect effect through `explain` (D17); the appsettings object-type priority.

**Store contrast actually available on this env** (xAPI `store`, settings API, category lists; `live`):

| Store | Link type | Catalog id | Storefront URL | Categories (xAPI) | Broken links |
|---|---|---|---|---|---|
| B2B-store | **Long** | `fc596540864a41bf8ab78734ee7353a3` (virtual B2B-mixed) | set; languages en-US (default), de-DE, fr-FR | 143; 103 resolve to a record assigned to B2B-store, 40 to a store-less record; `seed-test-fixtures` is shared by 4 categories (D7); no slug contains "dress" | 71 |
| Clothing | Collapsed | `25f5ea1b52e54ec1aa903d44cc889324` | none; en-US | 19, all SEO records store-less, 5 with `slug` null; `v-dresses` present | 0 |
| Electronics | Collapsed | `4974648a41df4e6ea67ef2ad76d7bbd4` | none | 13, all store-less | 0 |
| store-acme | Collapsed | `fc596540864a41bf8ab78734ee7353a3` (**same catalog as B2B-store**) | none | 143, **every `slug` null** (D18); Brands enabled | 0 |
| AGENT-TEST-Barcode-Store | not readable | — | `example.com` | xAPI `store` returns null, `categories` fails with an ARGUMENT error (cause `UNVERIFIED`) | 0 |

The ticket's contrast: `v-dresses` resolves in Clothing (REST explain: 7 stages, 1 item each; search returns the record with storeId null) and is not in B2B-store's catalog tree; the unresolved half (Debug on B2B-store -> Stage 0 with `NotInStoreCatalog`) was **not** run (G1).

## §3 — Where the layers DISAGREE

| # | Disagreement | Verdict |
|---|---|---|
| D1 | **"Active broken links" is mostly valid application routes, not missing slugs.** Of the 70 records present at pass start, 66 have the shape of storefront routes (`company/dashboard` 120 hits, `account/dashboard` 87, `sign-in` 76, `cart` 52, `catalog`, `bulk`, `change-password`, plus per-user ids `account/orders/<guid>`, `shared-list/<guid>`, `cart/<guid>`, `product/<id>`) and carry **836 of 875 hits (96%)**; the rest are the home key `__index__home__page__`, `soda`, `design-setup` and a `...-404check` probe. Four permalinks keep a locale prefix (`de/company/my-customers`, `fr/company/my-customers`, `de/account/dashboard` x2) and three carry a language that disagrees with the prefix. Mechanism: the storefront runs `pageContext(permalink = current path)` at boot (`app-runner.ts`), `SlugInfoQueryHandler` finds no SEO record for an app route, `CompositeSeoResolver` publishes the not-found event; per-user ids make the table grow without bound and nothing closes a record. The module's own guide frames the list as *"broken URLs reported by the Frontend"*. The widget count and HitCount therefore measure "unresolved landings", not dead links | list `CONFIRMED` live; mechanism `CONFIRMED` src; the causal live test (hard-load an app route, watch a hit) deliberately not repeated beyond the 5 hits in READ FIRST |
| D2 | **Debug SEO links, Stage 1 as documented vs live.** `{DOC}` (https://docs.virtocommerce.org/platform/user-guide/seo/debugging-seo-links/): *"1 / Original / SEO items found by the resolver. Displays all items from the database, not filtered by store or language."* and lists six stages. Live on the PR build: seven stages, and for `seed-test-fixtures` **Candidates 4 / Original 1** — the Catalog resolver filters by active, store and language in SQL before the pipeline, which is the very gap VCST-5989 describes (*"the resolvers... drop records before the explain pipeline sees them"* — PR #22). Doc = pre-change description | `CONFIRMED` live + src — **mid-change** |
| D3 | **Redirect-rule examples start with a slash, the input never does.** `{DOC}` (https://docs.virtocommerce.org/platform/user-guide/seo/managing-broken-links/): *"**Static**: an exact path match, for example `/abc` serves `/cdf`."* and *"`^/old/(.*)$` serves `/new/$1`"*. `RedirectResolver` compares the raw `Permalink` (`url.Equals(rule.Inbound, OrdinalIgnoreCase)` / `Regex.Match(url)`), and every permalink the storefront sends (network) or stores (all 71 records) has no leading slash; only home is `/`. As documented, neither example can match | input shape `CONFIRMED` live + src; "the examples never match" `UNVERIFIED` end to end (needs a rule — G3) |
| D4 | **Where a redirect happens: two guides and the code disagree.** `{DOC}` PlatformUserGuide (same page): *"Rules run server-side, so the target is served without a client-side redirect."* `{DOC}` StorefrontDeveloperGuide (https://docs.virtocommerce.org/storefront/developer-guide/spa-architecture-for-seo-and-404-handling/): *"you can ignore harmless 404s, or set client-side redirects."* Source: the rule is evaluated server-side inside `slugInfo`, but its result is a `redirectUrl` that `matcher.vue` executes in the browser (`router.replace({path})` or `location.href`); the document request is still the 200 shell. No HTTP 301/302 exists anywhere on this path (relevant to BL-SEO-002/004 wording, §6) | `CONFIRMED` src (frontend 2.59.0 local; the deployed 2.58.0 matcher not re-read); live `UNVERIFIED` (G3/G4) |
| D5 | **`Seo.Enabled` is documented as a switch but nothing reads it.** `{DOC}` (https://docs.virtocommerce.org/platform/user-guide/seo/settings/): *"enable or disable broken links detection or the SEO feature"*; module README: "Enables or disables the SEO module globally"; Admin shows a toggle labelled "SEO". A search across the cloned seo, catalog, store, x-api, x-catalog, x-frontend, core and customer sources finds only the descriptor. Modules not cloned (content, pages, news) `UNVERIFIED` | `CONFIRMED` src (cloned repos); live effect `UNVERIFIED` (a settings mutation — G5) |
| D6 | **A permission for a menu that does not exist, and a permission set that does not own the data.** Locale: `seo:access` = "Open SEO menu"; the module registers three store widgets and no menu item, and the live menu has no SEO entry. `seo:create/update/delete` gate only broken links, redirect rules and the stub `batchupdate`; editing a category's or product's SEO record is governed by the owner module. All five permissions have **0 scopes** (no per-store restriction, as PR #22 also notes) | `CONFIRMED` live + src |
| D7 | **Duplicate-slug protection: the oracle's wording vs what exists.** BL-SEO-001 says the SEO module "validates a duplicate on save". Source: "Duplicate URL detected" is a client-side check over the *same object's* SEO rows and store; no server or DB uniqueness exists; the store-level "conflicting semantic URLs / Resolve conflicts" flow depends on `Catalog.UseSeoDeduplication` (default false; effective false here). Live: four distinct categories share slug `seed-test-fixtures` in B2B-store / en-US; `GET /api/seoinfos/duplicates` returns `[]` for one of them; Debug picks one (Final = the record on category `efa1eab5...`) and marks the other three `NotBestMatch`. The four exist because of a parallel-seeder race (seed notes), but the platform accepted them | `CONFIRMED` live + src |
| D8 | **The link type is a four-value setting with default Collapsed — not "short/long" — and no guide lists the values.** Descriptor allowed values None / Short / Collapsed / Long, default **Collapsed**; Admin label "SEO links" in group "Store > SEO"; live B2B-store Long, Clothing / Electronics / store-acme Collapsed, platform-global record Long; the storefront reads it as `store.settings.seoLinkType`. `{DOC}` store settings (https://docs.virtocommerce.org/platform/user-guide/store/settings/) shows "## SEO settings" followed by a screenshot only; the xAPI reference says only *"The type of SEO link used for the store."* No live store uses Short or None. Unknown values are not rejected (settings API does not validate against the pool) and behave as Short in the path builder | live values `CONFIRMED`; Short / None / out-of-vocabulary behaviour `UNVERIFIED` (G2) |
| D9 | **og:url on product and category pages is not the page URL.** BL-SEO-003 and the developer guide's own example (`ogUrl` = host + `/news/` + semanticUrl) expect the page's URL. Deployed bundle 2.58.0 (`product-route-2Ku_UdSR.js`): `` `${window.location.host}\${product.value?.seoInfo?.semanticUrl}` ``; category chunk (`category.vue_vue_type_style_index_0_lang-TpOUcdtd.js`): `` `${window.location.host}\${currentCategory.value?.seoInfo?.semanticUrl` ``. The escaped `\$` makes the tail literal text, and the host has no scheme. Same code in vc-frontend 2.59.0 (`product.vue`, `useCategorySeo.ts`) | `CONFIRMED` bundle + src; rendered DOM value `UNVERIFIED` (G6) |
| D10 | **xAPI says non-null, the fallback returns null.** `SeoInfo.id`, `semanticUrl`, `objectId`, `objectType`, `isActive` are non-null in the schema, but an object with no applicable record gets `SeoExtensions.GetFallbackSeoInfo` (only semanticUrl / language / name set). `categories(storeId:"Clothing"/"store-acme"){items{seoInfo{id}}}` returned per-item "Error trying to resolve field 'id'" / 'objectType'; the same selection on B2B-store (every category has a record) was clean | `CONFIRMED` live + src |
| D11 | **Two surfaces for one page read different sources.** `pageDocuments` (xAPI, anonymous) lists 30 Virto Pages with leading-slash permalinks, e.g. `/qa-partner-portal-support`; `slugInfo(permalink:"qa-partner-portal-support")` returned `entityInfo` null for anonymous, personal, org and admin, and the storefront rendered its 404 page (HTTP 200). A static content page (`contacts`) and home (`/`) resolved. Cause open: not in the Pages search index / publish or language state / resolver wanting a leading slash. `{DOC}` (https://docs.virtocommerce.org/platform/developer-guide/GraphQL-Storefront-API-Reference-xAPI/Pages/Queries/slugInfo/) shows `permalink: "/test-2"` **with** a slash | `CONFIRMED` live (observation); cause `UNVERIFIED` (G7) |
| D12 | **`slug` / `seoInfo` of products come from the search index, `slugInfo` from the database.** `ProductType.seoInfo` reads `IndexedProduct.SeoInfos` and xCatalog builds `slug` from index outlines; `CatalogSeoResolver` queries the SEO table directly. After a slug edit the two can differ until reindex. KB-82F52F81 (virtostart) recorded the DB half | `CONFIRMED` src; the lag itself `UNVERIFIED` live (needs a write) |
| D13 | **An advertised write endpoint that cannot write.** Live Swagger lists `PUT /api/seoinfos/batchupdate` under `seo:update`; the action throws `NotImplementedException` (README: "not yet implemented"). Conversely `GET /api/seoinfos/{slug}` exists in source and is absent from Swagger | stub `CONFIRMED` src; live call `UNVERIFIED` (mutation-class); obsolete route absence `CONFIRMED` live (Swagger), route existence `UNVERIFIED` live |
| D14 | **The store guides promise an SEO section that is not there.** `store/overview` links *"[Manage SEO settings](configuring-store.md#SEO)"*, `platform-overview` links `store/configuring-store.md#seo`; `configuring-store.md` is a 489-byte stub with two screenshots and no headings. Link types, defaults and the "SEO links" control are described nowhere in the user guides | `CONFIRMED` {DOC} |
| D15 | **Labels differ between guide, locale and UI.** `{DOC}` (debugging page): *"In the store blade, click the **Debug SEO Links** widget."* Live widget: "Debug SEO" (blade "Debug SEO links"). The module's own message says *"Settings > SEO > Detect broken links"*; the live setting is "Broken links detection". Surface strings are `{OBSERVED}`, not doc-authoritative; recorded because tests quote them | `CONFIRMED` live + locale |
| D16 | **Organization-scoped SEO exists in the model and the pipeline but nowhere a user can write or read it.** `SeoInfo.OrganizationId` is in the REST model, scored and filtered by the pipeline, selectable in Debug ("Organization"), and `slugInfo` passes the token's organization. But the catalog SEO table has no organization column, the SEO details blade has no such field, xAPI `SeoInfo` does not expose it, and every live record has `organizationId` null | `CONFIRMED` live + src |
| D17 | **Debug is not what the storefront does.** `slugInfo` evaluates redirect rules first, then SEO records, then Resolved broken links with a redirect URL. `SeoExplainService` runs only the SEO step. Jira VCST-5989 comment (developer): *"Debug shows only the SEO step of what the storefront does with a URL... The follow-up adds a result line..."* A permalink shadowed by an active rule looks "resolved" in Debug while the storefront redirects | `CONFIRMED` src + `{TICKET}`; follow-up not deployed — **mid-change** |
| D18 | **SEO assignment is per store, not per catalog.** store-acme uses the same catalog as B2B-store, yet all 143 of its categories come back with `slug` null and a fallback `seoInfo`, because the records are assigned to B2B-store. The same mechanism is the ticket's `StoreMismatch` reason | `CONFIRMED` live + src |

## §4 — Coverage shape

**Basis:** `config/test-suites.json` (152 suites at this pass); the two named CSVs parsed with csv-parse; a keyword scan of every case's text in all 152 CSVs for SEO facets, followed by reading each hit's title. A scan, not a semantic audit; counts are SEO-relevant cases, not suite sizes.

| Suite | SEO-relevant | Suite | SEO-relevant |
|---|---|---|---|
| **066 SEO** (`Backend/seo`; manifest domain `branding`, concern admin, P1, `envRiskGate: staging`, `requiresModules: ["seo"]`) | **20 of 20** — all `Not Automated`; legacy 11-column format (TestRail refs `C406874...`, no Business_Rule / Behavior stamps); every case targets the broken-links grid and its Redirect-URL workflow (Broken Pages 3, Status 3, Grid Display 1, Redirect Management 5, Storefront Verification 2, Grid Operations 4, Workflow 1, Analytics 1) | **048d Structured Data & SEO** (`Frontend/cross-cutting`; P2, non-functional, clickDriven) | **7 of 7** — all `Draft`, never run; all VCST-5536 brand-profile structured data (JSON-LD OnlineStore, OpenGraph, sameAs / contactPoint / foundingDate validation, page gating); 0 on product or category metadata |
| **050a** GraphQL xCatalog | 5 Automated: CAT-GQL-104 category slug, 105 product slug, 106 brand slug, 107 catalog-root slug, **108 non-existent slug** (+002 / 003 / 113 read `seoInfo` incidentally) | **050e** xFrontend | 3 Automated: XFE-GQL-052 home, 053 CMS permalink, **056 invalid permalink** |
| **050f** xCMS | 2 Automated: CMS-GQL-123, 126 (pageContext) | **053** Catalog Admin Categories | CATA-015 Automated (add SEO to category), CATA-037 Not Automated (store-scoped category SEO) |
| **001** Catalog Navigation | CAT-040 / 041 / 049 `Draft` (PDP meta + OG, "Canonical URL (og:url)", category slug resolves) | **078d** smoke | BSM-057 Automated (Admin shows SEO slugs on a product) |
| **034** Store Management | STORE-017 `Draft` (Edit SEO) | **084** News | NEWS-005 Automated, NEWS-030 Semi (duplicate slug, negative), NEWS-031 Semi — a different module's SEO |
| **096** Backup Restore | BKRS-051 Reviewed (Seo data survives a restore) | **046** | L10N-ROUTE-004 `Draft` (route fuzz, adjacent) |

Roughly 22 SEO-relevant cases outside 066 and 048d, of which 13 are Automated (all but one of the xAPI ones are `slugInfo` contract checks). Incidental hits in 007 / 008 / 011b / 027 / 028 / 032 / 049 / 060b / 070 / 072b / 089 / 098 are not SEO coverage and are not counted.

**Suites the obvious tag or group misses:** the `seo` tag exists on 066 and 048d but **no selection group uses it**. 066 is reachable only through `backend`, `sprint`, `full`, `concern:admin` and `domain:branding` — the manifest files it with the white-labeling suites 067 / 070 / 071, while the oracle's domain is 13 "SEO & URLs". 048d is reachable through `frontend`, `sprint`, `full`, `domain:cross-cutting`, `concern:non-functional`. The `catalog` group (001, 002, 003, 051, 053, 098) carries the 001 and 053 SEO cases but neither SEO suite.

**Zero / near-zero coverage**

| Area | Count | Deliberate or hole |
|---|---|---|
| Debug SEO links / `GET /api/seoinfos/explain` (Stage 0, reasons, `isResolved`) | 0 | **hole** — feature under review in two PRs and a Jira bug |
| Universal redirect rules (Static / Regex / priority / shadowing) | 0 | **hole** — documented, and D3 / D4 sit here |
| Store link type (None / Short / Collapsed / Long) | 0 cases name a link type | **hole** — the setting shapes every URL |
| Duplicate-slug detection / `Catalog.UseSeoDeduplication` | 0 for catalog (NEWS-030 is the only negative) | **hole** |
| `Seo.*` settings behaviour (detection off, `Seo.Enabled`) | 0 | **hole** |
| REST contract of `/api/seo/broken-links` and `/redirect-rules` | 0 (066 is UI-only) | **hole** |
| Broken links created by application routes (D1) and by deliberate no-match probes | 0 | **hole** |
| Storefront redirect from a Resolved record | 1 (SEO-013, Not Automated) | thin |
| Product / category head tags in the DOM (title, description, og:url) | 2, both `Draft` (CAT-040 / 041) — CAT-041 would meet D9 if it ever ran | hole in execution |
| Language fallback / localized slugs | 0 | **hole** |
| Organization-scoped SEO | 0 | **deliberate by absence** — nothing can write it (D16) |
| Brands SEO | 1 (CAT-GQL-106) | thin |

**Over-covered relative to risk:** 066 puts 20 cases on one grid, 4 of them generic grid mechanics (SEO-015 – 018: sort, search, filter, bulk) and 3 on the three status names, against **0** on the resolution pipeline that decides which URL a customer reaches.

**Stale against the product (read against live + source, for `/qa-review-tests`):** SEO-002 looks for the widget on the Admin Dashboard (it is on the store blade); SEO-004 / SEO-017 filter by status (the blade has no filter); SEO-018 "bulk resolve/accept/delete" (only multi-select Delete exists); SEO-007 expects a description column and SEO-010 a "target description" (the grid has 3 columns, the details blade no such field); SEO-001's precondition "SEO module installed (v3.802.0+)" names a 3.802 baseline against deployed 3.1006.

**Selection / executability:** `envRiskGate: staging` means a suite is skipped only when `ENV_RISK` ranks ABOVE staging (`ENV_RISK_RANK` dev 0 < test 1 < staging 2 < production 3), so 066 runs on this dev env; `requiresModules: ["seo"]` is not enforced because `MODULES_ENABLED` is unset here. Side-effect warning: CAT-GQL-108 and XFE-GQL-056 request non-resolving permalinks on purpose, so every run of 050a / 050e writes or bumps broken-link records. Draft / never-run share: 048d 7 of 7, 001's three SEO cases, STORE-017; 066 is 20 of 20 Not Automated.

## §5 — Open gaps

| # | Gap | State |
|---|---|---|
| G1 | Debug on an **unresolved** permalink (ticket steps: B2B-store + `v-dresses` -> Stage 0 with `NotInStoreCatalog`, Stages 1–6 at 0; B2B-store + a slug that exists nowhere -> "Nothing found") and the claim "Debug no longer records a broken link" | **OPEN** — needs the operator to lift the no-new-records constraint for this one action, run it with `GET /api/seo/broken-links/search` totals before and after, and accept the possible record if the PR claim is wrong |
| G2 | Short / None links, and an out-of-vocabulary `Stores.SeoLinksType` | **OPEN** — needs a store with that value (a settings mutation) or a scratch store |
| G3 | Redirect rule end to end: slashless vs slashed Inbound, Regex `$1`, priority order, shadowing of an existing slug, client-side navigation | **OPEN** — needs creating a rule on a scratch store/permalink and deleting it (mutation); also settles D3 / D4 |
| G4 | Resolved broken link -> `slugInfo.redirectUrl` -> `router.replace`; Accepted stops counting hits | **OPEN** — needs one record set to Resolved with a Redirect URL (mutation) |
| G5 | Effect of `Seo.Enabled` and of `Seo.BrokenLinkDetection.Enabled = false` (widget message, no new records) | **OPEN** — needs a settings mutation |
| G6 | Rendered head: og:url (D9), description, absence of canonical, JSON-LD on home | **OPEN** — needs a DOM read; the REAL-USER rule blocks script evaluation, so a Lighthouse SEO audit or a sanctioned DevTools read is the route |
| G7 | Why `/qa-partner-portal-support` is listed but not resolvable (index / publish / language / slash) | **OPEN** — needs the Search index blade or REST for the Pages document type and the page's publish state (read-only); a second probe must not create another record |
| G8 | Brands SEO (`Catalog.BrandStoreSetting.BrandsEnabled` is true only on store-acme, which has no URL) | **OPEN** — needs a store with a URL and Brands on |
| G9 | Product / Vendor / News / ContentFile / Pages SEO owner blades live | **OPEN** — Product blade not opened; others source-only |
| G10 | Signed-in storefront UI walk | **OPEN** — API shows identical resolution; a UI sign-in boot-reloads app routes (bumps hits) and might create a record for a route with none yet |
| G11 | Organization-scoped SEO from a non-catalog writer | **OPEN** — no module on the stand writes `OrganizationId`; Debug's Organization select effect unobserved |
| G12 | Resolvers for ContentFile and Pages (modules not cloned) | **OPEN** — needs the content / pages module source |
| G13 | Localized slugs and `/de/...` URLs (docs: `/{xx}/about-us`) | **OPEN** — no per-language SEO record exists on the stand; Language column is 5 characters wide in the catalog table |
| G14 | Duplicate-detection warning "Resolve conflicts" flow | **OPEN** — needs `Catalog.UseSeoDeduplication` on (mutation) |
| G15 | Behaviour when the background-job queue is down (does detection silently stop) | **OPEN** — needs job-queue access |
| G16 | Prerender.io / bot user agents; sitemap, robots, llms uploads | **OPEN** — excluded, later pass |
| G17 | Seo export / import (redirect rules + broken links) | **OPEN** — Platform export UI/REST not exercised |

## §6 — Prior-art verdicts

There is **no SEO prior art**: no `reports/ba/` SEO folder, no earlier map. The four models named for this pass:

| Prior art | SEO-relevant? | Verdict |
|---|---|---|
| `reports/ba/test-models/VCST-4933-2026-09-17.md` (page builder) | **adjacent** — line 91: `slugInfo(permalink) -> pageDocument(id)` | consumes the Pages resolution; D11 shows the listing / resolution split it does not mention. `UNVERIFIED` that its Virto-Page path works on this env |
| `reports/ba/test-models/VCST-2945-2026-09-28.md` (barcode search) | **adjacent** — a single hit redirects to a product URL built from its slug; row 8 "redirect uses a slug the variation lacks -> 404" | not an SEO deliverable |
| `reports/ba/test-models/VCST-5024-2026-09-16.md` | no — one line about reaching a PDP by id/slug | n/a |
| `reports/ba/test-models/VCST-5317-2026-09-09.md` (org switcher) | no | n/a |

| Claim | Verdict |
|---|---|
| `.claude/knowledge/domain/sitemap.md`, REST table: "**SEO** / `/api/seo/` / `GET slugs`, `POST redirects`" | **DRIFT** — live Swagger: `/api/seoinfos/{search,explain,duplicates,batchupdate}` and `/api/seo/{broken-links,redirect-rules}`; no `GET slugs`, no `POST redirects` |
| `sitemap.md`: "No `/sitemap.xml`"; every path returns the 200 shell and 404s render client-side | `CONFIRMED` live on this env (nginx 404 for `/sitemap.xml`; 200 shell for page paths) |
| `.claude/knowledge/domain/store-settings.md`: SEO row "`seoLinkType`, SEO metadata, URL slug patterns" | **DRIFT** — one setting, label "SEO links" (group "Store > SEO"); no slug-pattern control; page metadata is per object, not per store |
| `store-settings.md`: only `IsActive` SEO infos are considered; fallback `GetFallbackSeoInfo` | `CONFIRMED` src (and D10 shows the fallback's cost) |
| `store-settings.md`: `isSpa` soft-404 behaviour | `CONFIRMED` live (HEAD 200, SPA 404 page) |
| `.claude/knowledge/domain/page-builder.md` §1 link 7 / entry line: Virto Pages resolve through `slugInfo -> pageDocument` | `UNVERIFIED` on vcptcore_dev — one listed page does not resolve (D11) |
| Oracle **BL-SEO-001** (slug uniqueness, "validates a duplicate on save") | **DRIFT** — D7. A `MARK-SUSPECT` candidate for `/qa-review-oracles bl`; only a human source changes the rule |
| Oracle **BL-SEO-002** (deleted slug -> empty `slugInfo`, SPA NotFound, HTTP 200 soft 404, logged as broken link) | `CONFIRMED` live for the 200 shell + 404 page + record. Its "301 redirect" wording `DRIFT`s from src: the platform's redirect is client-side (D4), never an HTTP 301 |
| Oracle **BL-SEO-003** (og:url = the page's own resolved URL; no `rel=canonical`) | no canonical in the static shell `CONFIRMED` live; the og:url half is **DRIFT** at bundle level (D9) and `UNVERIFIED` in the DOM |
| Oracle **BL-SEO-004** (`seoLinkType` controls format; old URLs redirect 301 or 404) | strictness `CONFIRMED` src (only the current link type's path resolves, so old paths fall to a soft 404 + broken link); "301" `DRIFT` as in BL-SEO-002; the format values are None / Short / Collapsed / Long (D8) |
| `.claude/knowledge/domain/b2b-organizations.md` §6c: `envRiskGate: staging` "will not run below that tier" | **DRIFT** — `applyMultiEnvFilters` skips a suite when the ACTIVE risk ranks above the gate; the gate is a ceiling (found while reading `ci/lib/suite-manifest.ts`) |
| VCST-5989 PR #22 body: Stage 0, `reasons`/`isResolved`, no broken link from Debug, other stages "unchanged" | Stage 0 / fields `CONFIRMED` live on resolving permalinks; the no-record claim `UNVERIFIED` (G1) |

This map resolves no entry from a prior open-question list, because none exists.

## §7 — Amendments

None yet (rev 1). `/qa-test` `5-docs-map` appends here and moves `amended:` only; it never touches `generated` or `rev`.
