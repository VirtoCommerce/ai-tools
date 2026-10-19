# Exploratory Session: SEO link debugging (Debug SEO links, Stage 0 Candidates)
**Date:** 2026-10-05 · **Duration:** ~45 min (box 45, HARD) · **Env:** `vcptcore_dev` · **Lane:** playwright-chrome + REST (Node, `seed-common.mjs`)
**Platform:** 3.1077.0-alpha.13406 · Seo 3.1006.0-alpha.101-vcst-5989-seo-explain-issues · Catalog 3.1049.0-pr-910-04a5 · **Theme:** 2.58.0
**Session type:** [EXP+VAL] · **Mode:** `ticket VCST-5989` (charter received from the Test Model, run VCST-5989-vcptcore_dev-20261005)
**Discovery technique:** User-flow edge enumeration (request forms, RACE/UI probes) + surprise-seeking
**Charter:** Discover scenarios in Debug SEO links / explain / POST search that the run's checklist (A1–A17, B1–B2, C1) and suite 066 do not cover
**Edge-Case Refs:** ECL-10.3 (hunted) | **BL Refs:** BL-SEO-001, BL-SEO-002 (judged against)

## Findings (caller copies these into the checklist)
| # | Condition | Result | Evidence |
|---|---|---|---|
| X1 | Double-click **Debug** while the Stages blade is open (B2B-store, 1920×1080) | FAIL | 2/2: one explain request; 1st click reopens the result blade, the blade strip scrolls back, 2nd click lands on the Stores-list row under the pointer → **store-acme opens**, B2B-store + Debug blades close. Single click fine. Likely blade-framework, not this diff. `screenshots/X1-before-dblclick-debug-layout.png`, `X1-after-dblclick-store-acme-opened.png` |
| X2 | `POST /api/seoinfos/search` storeId + `slug` only (no permalink), own record newest Active | FAIL | 200 `[]`; own broken link `6496e2e3…` HitCount 1→2 (lastHitDate moved), no empty-permalink record → a hit is credited to an unrelated URL. Handler not in either diff (pre-existing candidate) |
| X3 | Q8: POST search storeId + never-used `agent-test-x-…` | PASS | broken link created ≤16 s, HitCount 1, createdBy admin (K8 holds after the rewrite) |
| X4 | POST search without storeId | PASS (as KB-82F52F81) | 500 "Store with ID  not found"; no broken link for that permalink in any store |
| X5 | explain with permalink missing / empty | DRIFT | 500 "Value cannot be null. (Parameter 'permalink')" for both; context table said `[]`. Guard `ThrowIfNull(permalink)` pre-exists (not in seo#22). Admin can't send it: input trimmed, Debug disabled for whitespace |
| X6 | explain, `storeDefaultLanguage` empty or omitted, records found | DRIFT | only `Candidates`; `seed-books` candidate `isResolved: true`, `reasons: []`, no Original…Final; `dresses` → NotInStoreCatalog. "Resolved" with no pipeline = misleading (REST only) |
| X7 | Request forms on B2B-store (Long): `/x`, `x/`, `X`, `//x`, ` x ` for `seed-books` and Clothing's `dresses` | PASS | `/seed-books` 7×1; `seed-books/`, `SEED-BOOKS`, `//seed-books` → Candidates 1 `PermalinkMismatch: seed-books`, Stages 1–6 = 0; ` seed-books ` → `[]`; `dresses` every form → NotInStoreCatalog only. Admin trims ` /seed-books ` → sends `/seed-books` → 7×1. Case/trailing slash = base (`SeoPath == permalink` in BASE too) |
| X8 | organizationId (REST + Admin select "AGENT-TEST-Default Company") | PASS | `seed-books` 7×1, `seed-test-fixtures` Candidates 4 / Stages 1 — **not** dropped at stage 2 (hypothesis did not hold) |
| X9 | VP-9295: linked category, store-less record, Collapsed (store-acme) | PASS | `smartphones` (physical catalog 4974648a…, linked at the virtual-catalog root) → store-acme NoSeoPath only; B2B-store resolves 7×1. `lawns-and-plants` → store-acme NoSeoPath; B2B-store `PermalinkMismatch: garden/lawns-and-plants` |
| X10 | Q7 product rejections | PASS | Clothing product on B2B-store → NotInStoreCatalog; bare `seed-cable-ties-100pack` → `PermalinkMismatch: seed-electronics/seed-cable-ties-100pack`; Clothing bare product slug on Clothing → PermalinkMismatch listing **two** paths ", "-joined; product under a slug-less category → NoSeoPath |
| X11 | Q3 Stage 0 count | PASS | `seed-test-fixtures` 4 items = 4 records = 4 entities (1 ✓ + 3 NotBestMatch), Original 1; `contacts` 1 (ContentFile ✓) |
| X12 | K7 on this lane's ~45 explain calls (REST + 4 Admin Debugs, odd forms, 2.5K/9K permalinks) | PASS | per-store keyword search: no broken link for any of them |
| X13 | Rapid stage switch 0→3→0 | PASS | Candidates blade, 8 candidate columns, 4 rows, no stale stage rows |
| X14 | Reload with Candidates open; deep link | PASS (platform design) | hash stays `#!/workspace/store`; reload → Stores list only; no blade route to deep-link |
| X15 | UIP-NET: explain error shown in the blade | NOT-RUN | only UI-reachable error = permalink > ~8 KB → 414 (REST: 9 022 chars 414, 2 522 chars `[]`); not typed within the box |
| X16 | R15 brand slug on store-acme | BLOCKED | Brand settings enabled, BrandCatalogId = the virtual catalog, BrandPropertyName "Price USD"; xAPI `brands(storeId:"store-acme")` totalCount 0 — no brand to Debug |
| X17 | AC-23 on B2B-store (Long), stock pair | NOT-RUN | no slug shared by categories under different parents among B2B-store's 143 (only `seed-test-fixtures` ×4, same parent) |

## Net-New Scenarios Discovered
| # | Scenario | Why uncovered | What we found | Oracle ref | Fate (PROPOSED) | Suggested next charter |
|---|---|---|---|---|---|---|
| 1 | Double-click Debug with a result blade open | no suite, no VC-* entry; RACE row went to this charter | another store opens, Debug lost (X1) | **NONE** | PROMOTE → Admin SEO suite as Draft if triage accepts the bug; else DECLINE (platform blade behaviour) | Double-click on other blade buttons that reopen a child blade |
| 2 | A not-found event without a permalink | source-only node, never run | credits the newest Active broken link (X2) | **NONE** | PROMOTE → suite 066 (broken links), REST case with own disposable record | Other callers that can publish an empty permalink (obsolete `GET /api/seoinfos/{slug}`, xAPI) |
| 3 | Linked category on a Collapsed store sharing the virtual catalog (customer's case) with stock data | ticket steps use no linked category | NoSeoPath on store-acme, resolves on B2B-store (X9) | **NONE** | PROMOTE → this ticket's Admin/REST cases (stock `smartphones`) | Fix loop K6 for NoSeoPath (store record on store-acme) |
| 4 | explain with empty `storeDefaultLanguage` | REST-only input | Candidates-only, `isResolved: true` (X6) | **NONE** | DECLINE: Admin always sends the store default; question to dev | — |
| 5 | explain request forms (slash, case, spaces) | not in any suite | X7 | ECL-10.3 | PROMOTE → one REST contract case | Same forms through xAPI `slugInfo` (writes broken links: own permalinks only) |

## Oracle Feedback
| Kind | Entry | Evidence | Route |
|---|---|---|---|
| Candidate new pattern | event without key credited to the newest record (X2) | own record 1→2 hits | `/qa-review-oracles ecl` |
| Candidate new invariant | "an explain answer marks resolved only what reaches Final" (X6) | REST | `kb_capture` done; a rule needs a human source |

## Questions
- X6: should explain without `storeDefaultLanguage` return `[]` (as before) or flag candidates unresolved? · X5: 400 instead of 500 for a missing permalink?
- R15: is store-acme's brand configuration (BrandPropertyName "Price USD", 0 brands) intended, or is there no brand fixture on this env?

## Charter-from-Gap
- Take 100 (`seo.explain.stages.limit-100`) needs a fixture of > 100 records with one slug — none in stock data; no endpoint lists records by slug.
- UIP-NET in the Admin blade via a > 8 KB permalink (414); low-priority nodes (`seo.resolve.order.*`, `.fanout.store-level`, `.pipeline.inactive-survives`, `.index-vs-db`) not reached.

**Ledger (teardown by id after Stage 3):** BrokenLink `6496e2e3-781b-4eac-b132-19609fc7631b` · `agent-test-x-31545cd7` · B2B-store · HitCount 2 (Q8 + X2). Nothing else created (X2's no-store probe wrote no record).
**kb:** captured KB-6C437F53, KB-DC2F1BF0, KB-85E9DB78, KB-BB0DC07F · confirmed KB-82F52F81 · KB-2E8CAC3D confirm refused (not in the index).
