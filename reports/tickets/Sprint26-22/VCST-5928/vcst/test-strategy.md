# Test strategy — VCST-5928

## Round 1 of 3 — 2026-11-03

Status: APPROVED (Lenajava1, 2026-11-03) · Depth label: standard (computed)
Blocked: no
Build: VirtoCommerce/vc-module-elastic-search-8#47 @ d205e1ac826e4505872c260b1851a022169e4294 · Stand: vcst · Deployed: yes (VirtoCommerce.ElasticSearch8 3.1012.0-pr-47-d205) · Previous: none
Floors fired: F1 (register: High R1, R2, R3) · F5 (1 suite at risk: 061) · F7 (type Review task) · F12 (significant-zone hotspots: H-1 (data), H-3 (data)) · not fired: F2 (type Review task, not a Story), F3 (no rendering file in the diff), F4 (no revenue-critical flow named), F6 (no NOT DEPLOYED blocker), F8 (no ui-kit file), F9 (doubt rule — applied inside every floor), F10 (no org context in the diff surface), F11 (no setting key, setting read or feature-flags/default-values row)
Change map: C:\Users\mutyk\My Projects\ai-tools\.vc-fix\vc-test\VCST-5928\vcst\change-map.json

**Mission.** For the PR #47 reviewer and the decision to port the same guard to the ES9 and OpenSearch modules: the author's own check on vcst — with the Product index dropped, does a failed mapping load surface as an error, and does search recover after the index is rebuilt without a restart — plus the key risks around it: a first Build, a targeted reindex and a blue-green rebuild.

### Inputs
| Input | What we have | Gap → project risk |
|---|---|---|
| Project environment | vcst, ES8 module 3.1012.0-pr-47-d205 deployed (bundle: YES); the shared B2B Product index released by the operator at approval to be dropped and rebuilt; admin account via @td(); lanes api (no slot) + one browser lane for S-12 | P1, P4 |
| Product elements | module layer only: ElasticSearch8Provider.cs LoadMappingAsync (guard + throw, :775/:777); no REST/GraphQL contract, schema or setting change (PR claims, hidden-behaviour rows); doors that reach it: search, suggestions, IndexAsync / CreateIndexAsync, the Search Index blade | P2 |
| Quality criteria | no ACs (F7: oracles from the diff); PR #47 claims {SPEC}; BL-SRCH-003; PlatformUserGuide §Manage Search Index → Build search index, Blue-green indexing (read through VirtoOZ 2026-11-03); author's test instruction comment:112416 | P3 |

### Risks
| R | What a customer would see if this is wrong | Source | L×I | Level |
|---|---|---|---|---|
| R1 | After a failed mapping load (index missing), building the index does not bring search back: B2B buyers keep getting an error or 0 hits until someone restarts the platform | H-3 ElasticSearch8Provider.cs · PR #47 claims · comment:112416 (author's test instruction) | 3×4=12 | High |
| R2 | The first Build of a document type with no index, or a targeted reindex into one, fails on the new guard — or reports success while the documents never reach search | H-1 src/VirtoCommerce.ElasticSearch8.Data/Services/ElasticSearch8Provider.cs:775 · suspicion S-1 | 3×4=12 | High |
| R3 | During or right after a Delete and build (blue-green), buyer search errors or drops to 0 hits instead of being served by the old index until the swap | H-1 ElasticSearch8Provider.cs:775 · H-3 · PlatformUserGuide §Blue-green indexing | 3×4=12 | High |
| R4 | A platform process that did not run the rebuild (job server, second process), or a burst of parallel cold searches, keeps answering with the failed or empty mapping state after the index is healthy | H-3 ElasticSearch8Provider.cs | 2×4=8 | Medium |
| R6 | Indexing callers still get a raw NullReferenceException, search still answers 200 with 0 hits instead of 'Mapping load failed for index: <name>', or the message hands the Elasticsearch host / debug dump to an anonymous caller | H-2 src/VirtoCommerce.ElasticSearch8.Data/Services/ElasticSearch8Provider.cs:777 · suspicions S-2, S-3 | 3×2=6 | Medium |

Project risks: P1 the failing-load steps need a missing index on vcst; the operator released the shared B2B Product index at approval to be dropped and rebuilt (it is what other runners and the B2B-store storefront search) → mitigation: announce the drop before S-4, run S-4 → S-10 → S-7 → S-1 in one sequence, rebuild the Product index at the end and confirm its document count matches the pre-drop count. · P2 an error status (503 with {}), a timeout or a connection failure cannot be produced on vcst; only "index does not exist" is reachable → accepted, named in Out of scope. · P3 the ticket has no ACs and VirtoOZ is not declared in this install; the user guide was read once through the connector → accepted; oracles are the PR claims, BL-SRCH-003 and that guide section. · P4 the PR changes only the ES8 module; the Product provider on vcst must be ElasticSearch8 → read at entry from GET /api/search/indexes; another provider ⇒ BLOCKED.

### Strategy mix
Analytical ✔ · Methodical ✔ · Consultative ✔ · Model-based —: no MODEL risk · Reactive ✔: F12 fired, High risks (F1) ·
Regression-averse ✔: F5 fired — the list only, the run is Out of scope (vc-test U7) · Process-compliant —: no external standard in scope

### Approach per risk
| R | Technique / approach | Oracle {authority} | Layer · tool | Lane · agent | Effort |
|---|---|---|---|---|---|
| R1 | ST, FLOW — S-4; exploratory S-12 | PR #47 claim "an error status with an empty-mapping body now throws, where it used to return empty results until the process restarted" {SPEC} + BL-SRCH-003 {BL} | REST + xAPI · admin API | api · qa-backend-expert | high |
| R2 | FLOW, EG — S-10, S-7 | PR #47 claim "Indexing … now throws SearchException" / only a FAILED load throws {SPEC} + PlatformUserGuide §Build search index {DOC} | REST · admin API | api · qa-backend-expert | high |
| R3 | ST, FLOW — S-1 | PlatformUserGuide §Blue-green indexing "the existing index remains unaffected, allowing uninterrupted search" {DOC} + BL-SRCH-003 {BL} | REST + xAPI · admin API | api · qa-backend-expert | high |
| R4 | SCALE — no scenario: S-6 and S-8 struck at approval; closes as a named deviation (not tested) | PR #47 claim "a failed load throws instead of being cached" {SPEC} | REST + xAPI · admin API | api · none | low |
| R6 | EG — ac-checks on the error responses S-4/S-7/S-10 capture; leak half also in the S-12 charter | PR #47 claims on the SearchException type and message {SPEC} | REST + xAPI · admin API | api · checklist (ac-checks) | low |

### Scenarios
| S | Class | What it does | Bug it hunts | Why likely | Score | Proof | Writes |
|---|---|---|---|---|---|---|---|
| S-1 | 2 | Delete and build (blue-green) the product index while searching, then search after the alias swap | A mapping load that hits the backup index before it is populated (or during the swap) throws or caches a mapping of the wrong physical index, so after the swap B2B-store search errors or returns 0 hits until restart | state-in-memory (H-3), new-door (H-1) · R3 | 20 | api | — |
| S-4 | 2 | Run a document type without an index, search it, then build the index and search again without a restart | After the index is built, the same search still fails with 'Mapping load failed' or returns totalCount 0, because the failed load left a cached (empty) mapping that only a process restart clears | state-in-memory (H-3), untested (src/VirtoCommerce.ElasticSearch8.Data/Services/ElasticSearch8Provid...) · R1 | 16 | api | — |
| S-7 | 3 | Targeted reindex (POST /api/search/indexes/index) into a document type whose index does not exist | The targeted-reindex door reaches LoadMappingAsync on a missing index and throws SearchException (or still NullReferenceException), so the document is not indexed although the call returns success | new-door (H-1), untested (src/VirtoCommerce.ElasticSearch8.Data/Services/ElasticSearch8Provid...) · R2 | 12 | api | — |
| S-10 | 2 | First Build of a document type that has never had an index (suspicion S-1) | The guard throws on the not-yet-existing index during the first Build, so the Build job fails with 'Mapping load failed' and no index is ever created | new-door (H-1), untested (src/VirtoCommerce.ElasticSearch8.Data/Services/ElasticSearch8Provid...) · R2 | 12 | api | — |
| S-12 | 3 | Free exploratory charter around the mapping-load guard and the search index lifecycle | Charter: explore the Search Index blade (Build, Delete and build, Swap indices, index status) and its mind-map neighbours — keyword search, suggestions, facets, store scope, freshness — on vcst with the PR #47 build; aim at data (zero-hit or stale results after an index failure or rebuild), a broken buyer search path, and an error surface that exposes infrastructure detail | exploratory (free) · R1 | 0 | browser | — |

Shared store: vcst B2B Product index (named by the user at approval)
Changed rows: none

### Artifacts
| Artifact | Decision |
|---|---|
| Scenarios | RUN — S-1, S-4, S-7, S-10, S-12 |
| Test model | SKIP — scenarios cover the MODEL risks |
| Mind map | SKIP — no test model runs |
| Checklist | RUN |
| Exploratory | RUN — S-12, the free class-3 scenario; 45 min, ALONGSIDE — charter: R1 (H-1, H-3), R6 leak half |
| Visual lane | SKIP — F3/F8 not fired, no rendered value changes |
| Contract refresh | SKIP — no GraphQL operation or REST contract changed (PR claim; graphql-schema/rest-contract rows: no) |
| Coverage triage + regression | SKIP — vc-test runs no regression (U7); suite 061 named in Out of scope |
| Verifier | SKIP — no Critical risk |
| Case authoring | never in the run (D2) — candidate cases are listed at close-out |

### Data
The released vcst B2B Product index (dropped for S-4/S-10/S-7, rebuilt by them; Delete and build for S-1) · @td(ADMIN_USER.email_env_var) for admin REST · @td(BARCODE_REINDEX.gtin) for the targeted reindex (S-7) · @td(SEARCH_KITCHEN.query) for buyer search (S-1, S-4).
Must differ: S-1 — totalCount N recorded before the Delete and build is compared with each response during and after it, so 0 hits cannot pass as "the catalog is empty"; S-4 — the search before and after the build is the same query, so only the rebuild differs. · Before redeploy: none

### Out of scope
- S-2 (C-12) parallel targeted reindex into a missing index — struck at approval — residual risk Medium (R2)
- S-3 (C-14) a product edited during the failure window stays stale after recovery, event-based indexation off — struck at approval — residual risk Medium
- S-5 (C-13) the admin product save fails while the load fails, event-based indexation on — struck at approval (it also needed the announced global settings window, for which no channel is configured) — residual risk Medium
- S-6 (C-3) a second platform process keeps the failed state after a rebuild elsewhere — struck at approval — residual risk Medium (R4)
- S-8 (C-11) parallel cold searches race to cache a failed load — struck at approval — residual risk Medium (R4)
- S-9 (C-2) an empty mapping, cached before any document existed, served after documents are indexed — struck at approval — residual risk Medium (R1)
- S-11 (C-10) a B2B buyer's storefront search page breaks while the load fails (no BL covers the error state) — struck at approval — residual risk Medium
- C-15 Swap indices revert after a Delete and build, facets on fields only one physical index has — budget; S-1 covers the swap itself — residual risk Medium (R3)
- C-7 every search door (xAPI products, suggestions, admin search, storefront page) on a failing load — budget; S-4/S-7 see two doors — residual risk Medium (R6)
- C-8 DebugInformation (ES host/URL, server error text) reaching an anonymous xAPI caller (suspicion S-2) — budget; only the S-12 charter looks — residual risk Medium (R6)
- C-9 an error body with no transport exception throwing NullReferenceException again (suspicion S-3) — budget; S-4/S-7 hit an error body and would show it — residual risk Low (R6)
- Error statuses 503 with {}, timeout, connection failure (P2) — not producible on vcst; the empty-mapping path PR #47 closes is reached only through "index does not exist" — residual risk Medium (R1)
- Suite 061 Search Indexing Admin (F5, cases at risk) — vc-test runs no regression (U7) — run `/qa-regression 061` — residual risk Medium
- ES9 and OpenSearch modules — unchanged by PR #47 (author's comment) — residual risk none for this ticket
- Subclasses that override LoadMappingAsync — none known on vcst — residual risk Low

### Criteria
Entry: vcst carries VirtoCommerce.ElasticSearch8 3.1012.0-pr-47-d205 · `npm run env:check` green · Product provider = ElasticSearch8 (P4) · the Product index's pre-drop document count recorded (P1) · Suspend (BLOCKED): the Product index cannot be dropped or rebuilt; vcst search down for another reason
Exit: every in-scope R has a result or a named deviation (R4: struck at approval) · the S-12 box (45 min) is spent · the Product index is rebuilt with its pre-drop document count

### Amendments

### Reconciliation (filled at close-out)
| R | Planned | Ran (item ids · charter · lane · case ids) | Result | Deviation — reason |
|---|---|---|---|---|

Candidate cases (→ /qa-test-lifecycle): <filled at close-out> · Carried to Round N+1 / escalation: <filled at close-out>
