# Stable 16 regression — test plan

> The plan as written on 2026-10-12, kept as the record of how the scope was decided. **Live state: [PROGRESS.md](PROGRESS.md)** (generated). Machine-readable plan: [release.json](release.json). Per-module rows: [scope.json](scope.json).

**Release:** [VCST-6042](https://virtocommerce.atlassian.net/browse/VCST-6042) · [vc-modules#78](https://github.com/VirtoCommerce/vc-modules/pull/78) (+ #80 theme 2.59.0)
**Environment:** vcptcore-regression (`TEST_ENV=vcptcore_regression`) · **Baseline:** Stable 15 · **Start:** 2026-10-12

## 1. Environment verified (2026-10-12)
- Platform **3.1076.1** (`/api/platform/diagnostics/systeminfo`).
- 59 modules installed, **all 59 match `bundles/v16/package.json` exactly**, 0 validation errors.
- Theme **2.59.0**: served `assets/index-Cg7OMg95.js` is in the 2.59.0 release zip, not in 2.58.0.
- **None of the 24 virto-start modules outside the bundle are installed** → see §5.

## 2. How "real code change" was decided
Per module: GitHub compare `<v15 tag>...<v16 tag>`. A file counts as code only if it is not
`*.csproj` / `module.manifest` / `.github/**` / `*.md` / lock files / tests. Raw data: `module-diff.json` (regenerate with `npm run release:diff -- --from v15 --to v16 --suites`).
- **F** — functional change (feature or behaviour fix) → full regression of the mapped suites.
- **T** — technical only (Hangfire → BackgroundJobs, obsolete removal, AutoMapper removal, perf) → mapped suites, focus on jobs and mapping.
- **N** — new to the stable line.
- **REBUILD** — version bump, no code → out of scope (§4).

## 3. In scope — 43 components (Platform + Theme + 41 modules)
| # | Module | Versions | Class | Wave | Suites | What changed | Tickets |
|---|---|---|---|---|---|---|---|
| 1 | Platform | 3.1039.13 → 3.1076.1 | F | W1 | 095 020 021 049 063 101 078 | Hangfire retired → BackgroundJobs; VC0015 indexing API; DefaultValue setting override hotfix (VCST-6093) | VCST-5264 VCST-5246 VCST-5232 VCST-5386 VCST-4923 VCST-5439 +24 |
| 2 | BackgroundJobs | — → 3.1052.0 | N | W1 | 095 | NEW — job engine; without it no job runs |  |
| 3 | Theme (vc-frontend) | 2.51.1 → 2.59.0 | F | W0-W6 | 042 + all storefront suites | 2.51.1 → 2.59.0, 8 minor releases | VCST-5028 VCST-4217 VCST-5021 VCST-5141 VCST-4981 VCST-4228 +128 |
| 4 | Search | 3.1004.1 → 3.1010.0 | F | W1 | 061 004 | indexing progress fix, Hangfire→BackgroundJobs, obsolete IIndexingJobService | VCST-5416 VCST-5686 |
| 5 | ElasticSearch8 | 3.1007.0 → 3.1011.0 | F | W1 | 061 | request timeouts, index-creation lock | VCST-6052 |
| 6 | Core | 3.1007.1 → 3.1012.0 | F | W1 | 063 | customers by user group, html editor fix | VCST-5547 VCST-5901 VCST-6075 |
| 7 | Store | 3.1005.1 → 3.1009.0 | F | W1 | 034 035 050n | per-store Asset Public URL | VCST-5089 VCST-5490 |
| 8 | Xapi | 3.1012.3 → 3.1026.0 | F | W1 | 050g 050n 078 | asset URL, module federation, DiscountPercent rounding, AutoMapper removal | VCST-5089 VCST-5468 VCST-5159 VCST-5691 VCST-5661 VCST-5662 +2 |
| 9 | OpenTelemetry | — → 3.1002.0 | N | W1 | 094 | NEW |  |
| 10 | UCP | — → 3.1010.0 | N | W1 | 102 094 | NEW |  |
| 11 | BackupRestore | 3.1001.2 → 3.1007.0 | F | W1 | 096 | large-backup restore, catalog assets in backups | VCST-5392 VCST-5387 |
| 12 | Catalog | 3.1029.6 → 3.1048.0 | F | W2 | 051 052 053 064 103 001 002 003 | configurable sorting, numeric facet sorting, link-only mapping, barcode search, export fix | VCST-4675 VCST-5177 VCST-5278 VCST-5385 VCST-5318 VCST-5513 +8 |
| 13 | XCatalog | 3.1007.4 → 3.1023.0 | F | W2 | 050a 050i 002 003 005 103 | configurable sorting, variation associations, multilang filter fix, barcode, AutoMapper removal | VCST-5177 VCST-5345 VCST-5324 VCST-5089 VCST-5303 VCST-5468 +5 |
| 14 | CatalogPersonalization | 3.1003.1 → 3.1006.0 | F | W2 | 099 100 | user-group assignment UX | VCST-5282 |
| 15 | CatalogCsvImportModule | 3.1002.0 → 3.1007.0 | F | W2 | 064 064b | random token in export file name, AutoMapper removal | VCST-5659 VCST-5745 VCST-5661 |
| 16 | Export | 3.1003.0 → 3.1005.0 | T | W2 | 064 | Hangfire migration |  |
| 17 | CatalogPublishing | 3.1005.0 → 3.1007.0 | T | W2 | 076 | Hangfire migration |  |
| 18 | CustomerReviews | 3.1004.0 → 3.1007.0 | T | W2 | 086 087 088 | AutoMapper removal | VCST-5468 VCST-4772 |
| 19 | ImageTools | 3.1003.0 → 3.1006.0 | T | W2 | 069 | BackgroundJobs | VCST-5686 |
| 20 | Assets | 3.1005.2 → 3.1010.0 | F | W2 | 062 | path-traversal security fix | VCST-5901 |
| 21 | FileSystemAssets | 3.1003.1 → 3.1006.0 | F | W2 | 062 | path-traversal security fix |  |
| 22 | AzureBlobAssets | 3.1006.1 → 3.1009.0 | F | W2 | 062 (only if env uses Azure Blob) | path-traversal security fix | VCST-6016 |
| 23 | XCart | 3.1021.2 → 3.1039.0 | F | W3 | 028 029 030 050b1-050b5 072 072e 050h | validators chain, config sections, cache, non-gift merge, wishlist sharing, AutoMapper removal, distributed lock | VCST-5173 VCST-5103 VCST-5431 VCST-5303 VCST-5332 VCST-5691 +7 |
| 24 | Cart | 3.1006.1 → 3.1012.0 | F | W3 | 028 050h 007 | SectionName snapshot, wishlist sharing scope, perf | VCST-5431 VCST-5332 VCST-5705 VCST-5850 VCST-5728 |
| 25 | Orders | 3.1009.0 → 3.1018.0 | F | W3 | 017 017b 018 019 014 | OrderTotals, SectionName, order visibility service | VCST-5104 VCST-5431 VCST-5427 VCST-5490 VCST-3912 VCST-5901 |
| 26 | XOrder | 3.1005.0 → 3.1014.0 | F | W3 | 050c 014 | mixed currency, SectionName, locked-out member order history | VCST-5104 VCST-5431 VCST-5468 VCST-5660 VCST-5661 VCST-5662 +1 |
| 27 | Pricing | 3.1003.0 → 3.1008.0 | F | W3 | 054 055 | nested Price.productId fix, BackgroundJobs | VCST-5303 VCST-5490 |
| 28 | Inventory | 3.1003.0 → 3.1010.0 | F | W3 | 056 | product stock quantities blade, BackgroundJobs | VCST-5328 VCST-5546 VCST-5490 VCST-5901 |
| 29 | Shipping | 3.1005.1 → 3.1009.0 | T | W3 | 065 | AbstractTypeFactory, perf | VCST-5303 |
| 30 | Payment | 3.1004.0 → 3.1010.0 | T | W3 | 018 041 | perf, obsolete removal | VCST-5303 VCST-5901 |
| 31 | XPickup | — → 3.1008.0 | N | W3 | 050k 036 037 038 | NEW to stable |  |
| 32 | Return | 3.1001.0 → 3.1004.0 | F | W4 | 073 073a 073b 014b 014c 050o | storefront returns (step 1), buyer notifications, approve/decline | VCST-5628 VCST-5883 |
| 33 | Customer | 3.1011.1 → 3.1029.0 | F | W4 | 026 027 027b 006 008 | org-scoped roles, invites, lockout, user groups, link account | VCST-5239 VCST-5497 VCST-5496 VCST-5303 VCST-5427 VCST-5556 +7 |
| 34 | ProfileExperienceApiModule | 3.1009.1 → 3.1020.0 | F | W4 | 050d 006 008 027b 031 033 | org-scoped roles, invites, roles per store, hide locked orgs; requestPasswordReset REMOVED | VCST-5239 VCST-5468 VCST-5281 VCST-5660 VCST-5450 VCST-5317 +1 |
| 35 | Marketing | 3.1005.0 → 3.1009.0 | F | W5 | 023 024 025 077 077b 079 050j | alphanumeric coupon codes | VCST-4767 VCST-5901 |
| 36 | Notifications | 3.1009.3 → 3.1018.0 | F | W5 | 057 058 | template editing UX rework, preview fixes | VCST-5498 VCST-5543 VCST-5557 VCST-5940 |
| 37 | PushMessages | 3.1004.0 → 3.1008.0 | F | W5 | 068 050l | recipients list UX | VCST-5468 VCST-5944 |
| 38 | PageBuilderModule | 3.1012.1 → 3.1032.0 | F | W5 | 059 060 060b | asset library, shared components, anchors, publish fixes | VCST-5274 VCST-4932 VCST-5373 VCST-5515 VCST-5417 VCST-5219 +8 |
| 39 | XCMS | 3.1003.0 → 3.1008.0 | F | W5 | 050f | shared components in preview | VCST-5468 VCST-4933 |
| 40 | XFrontend | 3.1003.0 → 3.1007.0 | F | W5 | 050e 048d | per-store brand profile (structured data) | VCST-5468 VCST-5536 |
| 41 | Seo | 3.1004.0 → 3.1005.0 | T | W5 | 066 066b | Hangfire migration |  |
| 42 | WhiteLabeling | — → 3.1005.0 | N | W5 | 067 070 071 | NEW to stable |  |
| 43 | Contracts | 3.1003.0 → 3.1006.0 | T | W5 | 074 | mediator per request, Hangfire | VCST-5468 |

## 4. Out of scope — rebuilt without code changes (bundle)
ApplicationInsights, AuthorizeNetPayment, AzureAD, GDPR, GoogleEcommerceAnalytics, GoogleSSO, LuceneSearch.
Indirectly touched by W0 smoke (040b Authorize.Net, 043 GA are not re-run).

## 5. Blocked — virto-start modules NOT installed on vcptcore-regression
Code changed: Loyalty (3.1003→3.1009), Quote (3.1001→3.1003), ProductSnapshot, TaskManagement, News, Skyflow,
BackInStock, CustomerExportImport, ElasticAppSearch, MarketingExperienceApi, OpenSearch, SystemOperations, XRecommend.
Rebuild only: BuilderIO, EventBus. Same version: CyberSource, Datatrans, EnvironmentsCompare, NativePaymentMethods,
OpenIdConnect, OrderManagement, PriceExportImport, ShipStation, SqlQueries.
Suites waiting for them: 015, 075–075f, 083–083e, 084, 085, 039, 040a, 040c (17 suites, 428 cases).
**Decision (Oleg Zhuk, 2026-10-12):** install them on vcptcore-regression at the latest releases (Quote 3.1003.0 — 3.1004.0 needs FileExperienceApi >= 3.1008.0). Proposed manifest: `vcptcore-regression.packages.proposed.json`. **Scope for them: existing automated suites only, no gap sessions — their full regression runs within sprints.**

## 6. Modules with code changes and NO dedicated suite (coverage gap)
| Module | Change | Note |
|---|---|---|
| Sitemaps | Hangfire → BackgroundJobs | sitemap generation job untested |
| Subscription | no-prototype warning fix + Hangfire | recurring order job untested |
| BulkActionsModule | Hangfire migration | |
| WebHooks | Hangfire migration | |
| Content | path-traversal security fix + Hangfire | |
| Pages | VCST-5615 full reindex left Pages index empty | partial via 050f |
| Tax | perf (VCST-5303) | |
| AvalaraTax | Hangfire migration | not configured on env |
| DynamicAssociationsModule | 3rd-party align only | |
| FileExperienceApi | mediator per request | partial via 072d |
| AzureSearch | index name fix | env uses ElasticSearch8 → cannot test here |
| virto-start: BackInStock, CustomerExportImport, ElasticAppSearch, OpenSearch, SystemOperations, XRecommend, MarketingExperienceApi | various | no suites; covered in sprint regression, not here |

Proposed: one exploratory/API session per gap module in W6 (BackgroundJobs-dependent ones first).

## 7. Waves (3 browser slots in parallel; estimate = manifest `estimatedMinutes` / 3)
| Wave | Day | Scope | Suites | Cases | Est. wall |
|---|---|---|---|---|---|
| W0 | 1 | Smoke / pre-flight: 042 078 078b 078c 078d | 5 | 149 | 0.6 h |
| W1 | 1 | Platform, BackgroundJobs, Search, Core, Store, Xapi, OTel, UCP, BackupRestore | 14 | 538 | 3.0 h |
| W2 | 1–2 | Catalog, XCatalog, Personalization, CSV, Export, Publishing, Reviews, ImageTools, Assets | 21 | 611 | 2.5 h |
| W3 | 2 | Cart, XCart, Orders, XOrder, Pricing, Inventory, Shipping, Payment, XPickup | 29 | 892 | 3.0 h |
| W4 | 2–3 | Return, Customer, ProfileExperienceApi (B2B, auth) | 20 | 787 | 3.7 h |
| W5 | 3 | Marketing, Notifications, Push, PageBuilder, XCMS, XFrontend, SEO, WhiteLabeling, Contracts | 23 | 714 | 2.7 h |
| W6 | 3 | Theme cross-cutting (044 045 046 048c) + gap sessions (§6) | 4+ | 129+ | 0.4 h+ |
| W7 | after deploy | virto-start, autotests only (§5) | 17 | 428 | 2.7 h |

**Total runnable now:** 116 suites, 3 820 cases, ~16 h pure run time; with retries + triage ≈ 3 days.
W0 is a gate: a broken BackgroundJobs or a failed login stops the run before W1.

## 8. Process per wave

> Superseded on 2026-10-16 by `/qa-run stable:16 <wave>` and `.claude/skills/qa-run/release-folder.md`: no `bugs-draft/`, PROGRESS.md is generated, and wave state lives in `waves/<W>/`. Kept as written.

1. `/qa-regression <suite ids>` with `TEST_ENV=vcptcore_regression`.
2. Per module: `modules/<Module>.md` (pass/fail/blocked, failing cases, suspected bugs).
3. Update `PROGRESS.md` + `scope.json`; amend the single VCST-6042 tracker comment.
4. Failures → `/qa-triage-results` → bug drafts in `bugs-draft/`. **No Jira bugs until the triage is reviewed.**
