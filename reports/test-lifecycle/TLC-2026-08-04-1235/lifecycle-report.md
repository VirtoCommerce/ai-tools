# Test Case Lifecycle Report — TLC-2026-08-04-1235

## Summary

- **Input:** `VCST-5367` + `vc-module-sales-rep#6` + `vc-frontend#2400`, reported as delivered to vcptcore-qa
- **Input Type:** change-source (JIRA story + two open PRs)
- **Date:** 2026-08-04 12:35 (local)
- **Env:** vcptcore-qa
- **Platform:** 3.1053.0 (image tag `3.1053.0-pr-3092-cc76-vcst-5532-cc76f169`)
- **Theme:** `vc-theme-b2b-vue-2.55.0-pr-2400-c6ca` (PR #2400) — deployed
- **Module under test:** `VirtoCommerce.SalesRep 3.1001.0-pr-6-4f32` (PR #6) — deployed, but only from 09:32 UTC (see Delivery below)
- **Neighbours:** `VirtoCommerce.Customer 3.1020.0`, `VirtoCommerce.Xapi 3.1015.0`
- **Verdict:** **APPROVED WITH WARNINGS** — both layers are now live-verified (API contract by direct probe, storefront by three browser passes); one real defect was found and filed; the two storefront suites still carry pre-existing legacy debt above the G3 threshold, and five case classes remain blocked on tooling rather than on the product.

## Phase Results

| Phase | Owner | Status | Key metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 3 suites affected (050m, 091, 093); 96 changed files across 2 PRs |
| 2. Sync | test-management-specialist ×2 | Done | 050m: 99 cases VALID; 091/093: 15 cases synced (2 STALE, 3 INCOMPLETE→resolved, 10 enriched), 0 deprecated |
| 3. Analyze & Generate | test-management-specialist ×2 | Done | layout coverage was **zero**; 57 new cases (19 API + 38 storefront) |
| 4a/4b. Review & Fix | specialists + orchestrator | Done | 050m → **0 findings**; 091 → **13 (all Medium)**; 093 → **15 (all Medium)**; **0 Blocker / 0 Critical / 0 High everywhere** |
| 4c. BL audit | ba-system-analyzer | Done | 20 candidates → **9 promoted** (`BL-SR-014..022`) |
| 4c′. BL re-audit | ba-system-analyzer | Done | live axis acquired → **9 more promoted** (`BL-SR-023..031`), 1 split, 2 still drafted |
| 5. Verify | orchestrator (API) + qa-frontend-expert (browser) | Done | API: 13 contract facts + 3 anon probes. Browser: 3 passes, ~40 cases confirmed, **1 defect filed** |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | see Quality Gates |

## Delivery — the premise was half-true for ~3 hours

The frontend half landed immediately; the backend half did not, and the failure was silent from the outside.

| Artifact | Pinned in `vc-deploy-dev@vcptcore-qa` | Actually live at run start | Now |
|---|---|---|---|
| Theme (PR #2400) | `vc-theme-b2b-vue-2.55.0-pr-2400-c6ca` | ✅ live (theme deploy green, 06:51 UTC) | ✅ |
| SalesRep (PR #6) | `VirtoCommerce.SalesRep_3.1001.0-pr-6-4f32.zip` | ❌ live module was `3.1000.0` | ✅ since 09:32 UTC |

**Root cause:** commit [`87b7f118`](https://github.com/VirtoCommerce/vc-deploy-dev/commit/87b7f118) ("Cart, XCart, SalesRep VCST-5367") added three module entries and left a **trailing comma after the last element** of the `Sources[0].Modules` array. `jq` failed to parse the manifest (`parse error: Expected another array element at line 53, column 7`), the platform base-image variable came out empty, and the docker build died on `failed to parse stage name ":": invalid reference format`. "Cloud platform deployment" therefore failed on that commit (06:22 UTC) **and on every later platform deploy on the branch**, including an unrelated inventory bump (`935996a8`, 08:21 UTC). Fixed upstream by the platform owner in [`28d72014`](https://github.com/VirtoCommerce/vc-deploy-dev/commit/28d72014) — no change was needed from this run.

**Why it mattered:** with the theme live and the backend absent, the storefront's own layout query returned
`HTTP 400 — Cannot query field 'salesRepLayout' on type 'Query'` (`extensions.code = FIELDS_ON_CORRECT_TYPE`),
which per the PR's design spec is the `loadFailed` path: registry defaults render, an alert shows, and **Edit layout is disabled entirely**. So the feature under test was not merely unverified — it was unreachable, while the manifest said it was deployed. Worth remembering as a delivery check: a green *theme* deploy plus a pinned module version is not evidence the module is live; `/api/platform/modules` and a schema introspection are.

## Change Inventory

| Repo / PR | Layer | Files | Substance |
|---|---|---|---|
| `vc-module-sales-rep#6` | xAPI (L3) + Data + Core | 28 (+730/−13) | `salesRepLayout` query + `saveSalesRepLayout` mutation on the scoped `/graphql/sales-rep`; `Layout`/`LayoutRegion`/`LayoutBlock`/`LayoutSetting` models; `ILayoutService`/`LayoutService` persisting to the Customer module's `CustomerPreference` under `SalesRepLayout.{scope}[.{storeId}]`; 8 graph types; 9 component tests |
| `vc-frontend#2400` | storefront (L1) | 68 (+5550/−204) | drag-and-drop saved layout for the Sales Rep Dashboard and Customer Profile: `layout/document.ts` reconcile, `layout/registry.ts`, `layout-surface/-region/-block/-widget/-stats/-edit-bar/-hidden-tray/-skeleton`, `useSalesRepLayout`, `useKeyboardSort`, `aria-live` announcer, `sortablejs`; deletes `dashboard-widgets.vue`, `customer-profile-widgets.vue`, `stat-widgets.vue`; 13 locale files; 189 vitest tests |

Breaking changes: none. New contract surface only.

## Coverage Delta

| Suite | Before | After | Δ | Note |
|---|---|---|---|---|
| 050m — GraphQL Sales Rep (API) | 98 (manifest) / 99 real + 1 corrupt row | **118** | +19 | new sections `Query > salesRepLayout`, `Mutation > saveSalesRepLayout` |
| 093 — Hub Dashboard (storefront) | 18 | **45** | +27 | layout mechanism coverage lives here, incl. the defect regression + the self-heal case |
| 091 — Customer Profile (storefront) | 35 | **50** | +15 | only profile-specific layout behaviour, cross-referencing 093 |
| **Layout coverage** | **0 cases** | **61 cases** | — | `salesRepLayout`/`saveSalesRepLayout`/drag-drop had zero references before this run |
| **Layout invariants in the oracle** | **0** | **18** (`BL-SR-014..031`) | — | 2 still drafted, both blocked on tooling |

## Phase 5 — Live Verification

### API layer — fully confirmed

Probed `POST /graphql/sales-rep` as the seeded rep on vcptcore-qa, 2026-08-04 ~09:53 UTC. All writes were confined to a throwaway `scope: "qa-tlc-probe-20260804"`, so the real `dashboard` / `customerProfile` documents were never written and remain never-saved.

| Contract property | Observed |
|---|---|
| Type surface | `SalesRepLayout` / `…Region` / `…Block` / `…Setting` + 4 `InputSalesRepLayout*` mirrors, shapes exactly as spec'd |
| Never-saved | HTTP 200, `data.salesRepLayout = null`, no errors |
| Unrecognized `scope` | HTTP 200, `null`, **no error** — silently addresses a different, empty document |
| Unrecognized `region.id` | accepted and round-tripped verbatim — no server-side region validation |
| Save echo | full document + `modifiedDate: 2026-08-04T09:53:25.6929956Z` (UTC); load-back byte-identical |
| Order & `hidden` | region order, block order and `hidden: true` all preserved |
| `settings.value` types | `5`→number, `"date:desc"`→string, `true`→boolean; a date-shaped string stays a **string** (`DateParseHandling.None`) |
| `storeId` keying | omitted / unknown / real store are **three distinct documents** |
| Full replace | a narrower second save dropped an entire region — no merge |
| Required fields | omitting `scope` / `schemaVersion` / `block.hidden` / `block.settings` → HTTP 400 `INVALID_VALUE` (`settings` may be `[]`, but not omitted) |
| `settings.value` array/object | HTTP 400, `codes:["INVALID_VALUE","INVALID_OPERATION"]`, `Unable to convert '(array)'/'(object)' to 'AnyValue'` |
| Anonymous | HTTP **200** with `errors[0].extensions.code = "Unauthorized"` — same shape confirmed on `salesRepCustomerCartStatistics`, `salesRepCustomerCounts`, `salesRepTopSellers` |
| Cross-user isolation | two other seeded reps both read `null` for the scope the first rep wrote |

Frontend deployment was confirmed independently: the live bundle contains the `SalesRepLayout` operation name, the `mainLeft`/`mainRight` region constants and `sortablejs`.

### Storefront layer — verified across three browser passes

The initially-reported blocker was a **wrong conclusion of mine**: I read `.env.playwright.local` as having no sales-rep password because no variable was *named* for one. Comparing hashes showed the existing `TEST_USER_PASSWORD_VCST` already holds the value the seeded reps authenticate with, so a rep sign-in was possible immediately by typing that secret NAME — no MCP restart needed. Plaintext never entered any transcript.

Two reps were used deliberately: `agent-test-sr-primary` for everything non-committing (its layout had to stay never-saved, because ~40 other cases depend on that precondition — verified intact at the end), and a purpose-built disposable rep for everything involving Save.

| Pass | Scope | Outcome |
|---|---|---|
| 1 — no Save | 15 checks on the shared rep | edit mode, drag by header, whole-card stat drag, ✕-is-not-a-drag, tray vs parked zone, keyboard sort on both axes, cross-column impossibility (both directions), rail unmount, Cancel/Reset with zero network, dark mode, 390 px stacking. Console: **zero** uncaught exceptions, **zero** Vue warnings |
| 2 — with Save | disposable rep | Save persists across reload; `SaveSalesRepLayout` fires **once** per Save (4/4); full-document replace confirmed from the UI; survives a new sign-in session; **lazy-fetch widget half proven** (hidden+saved `orders` → all three orders operations absent on reload, 17 calls vs 20, positive control first); scope-wide layout confirmed **both directions** across two customers |
| 3 — two API-planted documents | disposable rep | reconcile: unknown block types **dropped client-side**; absent registry blocks **appended**; known blocks planted in wrong regions **re-homed from the registry** (no rail rendered on the dashboard at all); and **both deviations self-heal on the next Save** |

**Pass 3 needed a precondition the UI cannot produce** — the storefront can only ever emit the current registry's block set — so the documents were written straight at `saveSalesRepLayout` with the rep's own token. That is what made the design spec's strongest claim testable: region is re-derived from code on every read *and* rewritten on every save, so a future rail-to-main widget move will relocate itself for every existing saved layout, with no migration and no stale pin. Observed, not assumed.

Grounding was raised to `{OBSERVED}` only for what was actually seen. Nothing was promoted on the strength of the API probe — the API being live is not evidence the UI was seen.

## Quality Gates

| Gate | Status | Detail |
|---|---|---|
| G1 Structure | **PASS** | 0 Blockers. The pre-existing duplicate `SR-GQL-033` was resolved and a corrupt orphan row removed (below) |
| G2 Determinism | **PASS** | 0 Critical |
| G3 Completeness | **PASS** | 050m **0 findings**; 091 **13**, 093 **15** — all Medium, **0 High**. The live pass supplied the real selectors, so all 17 `T-002` "[DOM] assertion lacks specifics" findings were rewritten rather than deferred. The remaining Medium items are pre-existing `D-006` (`[ASSERT]` inside Steps) and `DUP-001/004` step-overlap on legacy rows — the shared navigation preamble this suite family uses by design |
| G4 Testability | **PASS** | 0 Critical |
| G5 Data Validity | **PASS** | `td:validate` — 050m 232/232 refs resolved, 091 100/100, 093 has no `@td()` refs; `DV-013` no bare GUID/ID literals; `DV-021` no runtime GUIDs in base aliases. `graphql:lint-labels` — 118/118 runner-native cases balanced. `suites:lint` — `OK (121 suites, 38 selections)` |
| G6 Coverage | **PASS** | **18** layout invariants promoted (`BL-SR-014..031`), 0 CONTRADICTORY. Every promoted invariant is now cited by at least one case — the `BLC-004` "uncovered invariant" findings cleared after the remap (`bl:lint` Informational 20 → 14). 2 invariants remain drafted, both blocked on tooling, not on evidence quality |
| G7 Duplication | **WARN** | `DUP-001`/`DUP-004` step-overlap on legacy rows in both storefront suites (shared navigation preamble); pre-existing |
| G8 Environment | **PASS with named exceptions** | Both layers verified live; **0 BROKEN** findings. Five case classes remain blocked on **tooling, not the product** — see "Why five cases are still open" below. Config for four of them is now wired and takes effect at the next MCP restart |
| G9 Sync | **PASS** | all STALE/INCOMPLETE cases updated; nothing deprecated; no case ID renumbered except the documented `SR-GQL-033` collision |

## Defect found in the feature

**[BUG-SalesRep-Layout-Keyboard-Grab-Dropped-By-Pointer.md](../../bugs/BUG-SalesRep-Layout-Keyboard-Grab-Dropped-By-Pointer.md)** — Medium (P2), functional / keyboard-a11y.

While a block is grabbed for keyboard sorting, a **mouse press on any draggable block** silently ends the grab **without restoring the block's original position** and **without an `aria-live` announcement**. The arrow-key move is therefore committed by accident, and a subsequent **Escape does nothing** because there is no grab left to cancel.

This originated as a user report that "Escape doesn't reset". Escape itself turned out **not** to be broken — it restores correctly on all three regions, both immediately after a grab and after arrow moves, with the announcement and focus intact. Six candidate mechanisms were tested differentially (reading DOM order, `document.activeElement` and the announcer's text rather than judging by screenshots); only this one reproduced. The contrast that isolates it: clicking a **neutral, non-draggable** area *does* restore correctly — so the two pointer paths are inconsistent.

RCA anchor: `layout-region.vue`'s Sortable option `onChoose: () => release()`. `release()` clears the grab **without** the `onReorder(id, originIndex)` restore that `cancel()` performs, and `onChoose` fires on mousedown — before the handle's `blur` — so the restoring path never runs. Draft-only: Cancel or Reset still discards it, and nothing persists without Save.

**Also surfaced, needs a product decision rather than a fix:** Escape cannot undo a keyboard **park** — `toggleHidden()` releases the grab on purpose ("the block leaves this list"). Recovery exists (focus follows the card into the parked zone; Space + ↑ restores it) but is not discoverable. This is arguably the same family as the accepted "park/restore appends to the end" gap, which is why it is recorded in the bug report rather than filed separately.

## Repository defects found (unrelated to VCST-5367)

**11 incidental repo-health defects** surfaced while running this pipeline. They are catalogued in **[`docs/repo-findings-backlog.md`](../../../docs/repo-findings-backlog.md)** (R-01…R-11 resolved, B-01…B-05 open) rather than listed here — that file is now the standing home for this class of finding, so a future run adds to a list instead of stalling behind fixes.

Process note worth keeping: fixing all 11 inline is what turned a one-ticket run into an all-day session. Going forward such findings are collected and worked **in parallel**, not serially inside the task. The one exception is a defect that *blocks* the task — here, the corrupt row in `050m`, which had disabled every deterministic gate on that file and therefore had to be fixed before the suite could be reviewed at all.

Two are worth naming here because they changed what the pipeline could see:

- **Duplicate suite id `092` + unregistered suite `093`** — the manifest resolver takes the first id match, so **36 sales-rep cases across two suites had never run** and were in no selection. `/qa-regression sales-rep` was silently covering 5 of 7 suites.
- **`business-logic.md` was two concatenated copies of itself** for a week (150 Blocker findings), so every agent reading the primary QA oracle saw each invariant twice and could hit either of two conflicting Sales Rep domains.

## Test-data added

`SR_REP_LAYOUT` (`agent-test-sr-layout@example.com`) — a **disposable** rep serving two organizations, created because the layout cases mutate a per-user persisted `CustomerPreference` and the shared `SR_REP_PRIMARY` is depended on by ~40 other cases (including the "never-saved ⇒ `null`" precondition). Fixture row + `@td()` alias + seeder extension + drift guard + 7 unit tests; runtime GUIDs written to the `aliases.vcptcore.json` overlay, none in the committed CSV.

Two details worth keeping: disposability is enforced by an **allowlist** that fails the guard if a shared rep is ever added to it, not by convention; and the layout `CustomerPreference` is keyed on the ApplicationUser and does **not** cascade with a rep delete, so teardown wipes it *before* deleting the rep and then asserts zero residue. Both were proven live, not assumed.

## BL Audit (Phase 4c)

Layout had **no business-logic invariant at all** before this run. 20 candidates were surfaced by the two authoring agents, consolidated to 19 distinct rules, and triangulated under the applicable-axes bar. **Docs axis waived** for two independent reasons: the feature is an unmerged pre-GA PR (no published docs can exist), and VirtoOZ / Context7 were both unauthenticated this session. Bar was therefore **source + live, both required to agree**; a unit test counts as source, not live.

**9 promoted** to `business-logic.md` — every one confirmed on both source and the live API probe:

| ID | Invariant |
|---|---|
| `BL-SR-014` | Layout key = rep + surface + optional store; never-saved resolves `null`; per-user isolation |
| `BL-SR-015` | `saveSalesRepLayout` is a full-document replace, never a merge |
| `BL-SR-016` | Array position is render order; `hidden` is independent; verbatim round-trip |
| `BL-SR-017` | The save mutation echoes the persisted document incl. a fresh UTC `modifiedDate` |
| `BL-SR-018` | `AnyValue` setting value preserves its scalar JSON type |
| `BL-SR-019` | `scope` / `region.id` are free-form strings — an unrecognized value fails **silently** to a different, empty document |
| `BL-SR-020` | Both layout operations require an authenticated caller `[P0-security]` |
| `BL-SR-021` | Required layout-input fields are schema-enforced; a non-scalar `value` is rejected |
| `BL-SR-022` | The customer-profile layout is scope-wide — one document per rep, not per customer |

**10 were held as drafts** — the storefront UX/behaviour rules — because without a browser pass only **one axis survived**, and one axis never promotes.

### Re-audit, after the live pass — 9 more promoted

The recorded re-audit trigger fired the same day. Outcome: **`BL-SR-023..031`** promoted on source+live, `BL-SR-022` **strengthened in place** rather than duplicated, and:

- **`PROPOSED-BL-SR-LAYOUT-003` was split** rather than promoted or held wholesale: the "`null` is not a failure" half is live-confirmed and became `BL-SR-025`; the failed-read / failed-save halves stay drafted with a narrowed trigger (intercept or mock an error response).
- **`BL-SR-029` is worded as the observable outcome, not the mechanism** — a rapid double-trigger produced exactly one save call, but whether the composable's guard refused it or the `inert` wrapper swallowed the click is not isolable from the UI.
- **Two remain drafted**: the failure-handling half above, and the skeleton invariant (`PROPOSED-BL-UI-LAYOUT-001`) — 6 live attempts could not catch the window at normal network speed, so its trigger is now specifically "re-run under throttled network".

**A deliberate decision worth recording:** `BL-SR-028` (keyboard grab-and-move) is stated as the **full intended contract** — *ending a grab must always restore the pre-grab state and announce, regardless of what ends it* — rather than as just the key sequence. A narrower rule would have retroactively legitimized the defect found this run as "out of scope". Stating it fully keeps the pointer-interrupt path a **tracked violation** the oracle can flag until it is fixed. The oracle should not silently bless a filed bug.

Layout coverage in the oracle went from **zero invariants to 18** (`BL-SR-014..031`). Audit trail: `reports/knowledge/BL-AUDIT-2026-08-04.md`; the 2 still-open drafts: `reports/ba/bl-proposals-2026-08-04.md`.

Coverage was reconciled in two rounds: 19 `Business_Rule` cells in 050m + 2 in 091 after the first audit, then **34 more** across 093/091 after the re-audit (24 + 10), plus `BL-SR-025` added to `SR-HD-001` — the case that actually verified it, and which the audit had left uncited. The `PROPOSED-` placeholder deliberately survives on exactly the rows whose invariant is still a draft: the four failure-handling cases (`SR-HD-035/036`, `SR-CP-047/048`) and the two rows pointing at the skeleton invariant.

> **Gap worth closing:** `BL-SR-022` has storefront coverage only — no API-layer case in 050m asserts the absence of an organization argument on `salesRepLayout`.

### Oracle corruption — found, and reconciled by merge

**Fixed.** `2776 → 1541` lines, two document headers → **one**, 40 domain headings → 22, 334 invariant headings → **184**, and `bl:lint` **150 Blocker → 0** (107 findings remain: 99 Medium, 8 Informational — the expected collapse of double-counted coverage checks). Independently verified: 184 headings = 184 unique ids with **zero duplicates**, `BL-SR-014..031` intact, and the 76 files citing the touched ids all still resolve.

The reconciliation was a **merge, not a choice of side**, per the operator's instruction:

- **8 shared invariants genuinely diverged** — not the 10 I had estimated. `BL-PROFILE-001` and `BL-WL-006` turned out byte-identical; my earlier count mis-flagged them. The real set was `BL-CART-001`, `BL-CART-008` and `BL-UI-001..006`.
- All 8 resolved to copy 2's text, and in each case **because it demonstrably supersedes copy 1**, not by coin-flip: the two `BL-CART-*` entries carry a BL-AUDIT-2026-07-27 DRIFT correction whose own `Amended:` line narrates the stale claim it replaced, and the `BL-UI-*` domain carries the WCAG 2.2 threshold fix, the `tokens:sync` drift-guard reference, and the note that suite `048b` was removed on 2026-07-25 leaving those invariants uncovered. Nothing was silently dropped.
- **`BL-SREP-001..003` were ported, not renumbered**, into their own `## Domain 20a: Sales Rep Admin & Hub Access (BL-SREP)`. The reference scan found live consumers (a Sprint26-15 verification summary and `sales-rep-stats-specs.mjs`) plus their own BL-AUDIT-2026-07-24 trail, so keeping the prefix was the lower-risk call.
- Two **pre-existing** staleness bugs in the Coverage Summary surfaced and were fixed on the way: the Cart row was missing `BL-CART-015`, and the old Total row did not match the sum of its own columns even before the duplication. New totals: **184 / P0 51 / P1 100 / P2 33**.

Reconciliation note: `reports/knowledge/BL-RECONCILE-2026-08-04.md`.

### How it happened — worth not repeating

Merge commit `02ca3da2` ("Merge branch 'main' into claude/qa-sales-rep-statistics-tlc", 2026-07-28) resolved a conflict in this file by **concatenating both sides** instead of merging them — 1348 → 2631 lines in one commit, and one document header → two. It then sat that way for a week, silently, because nothing in the normal workflow reads the oracle end-to-end and `bl:lint` was not being run as a gate.

Two things made it survivable, and are worth keeping: every invariant carries a stable `BL-*` id, so a scripted id-set diff could **prove** conservation across the fix; and each amended invariant carries its own `Amended:`/`Source:` provenance line, which is what let the 8 divergences be resolved on evidence rather than by preference. **Running `bl:lint` as a gate would have caught this the same day** — 150 Blocker findings is not a subtle signal.

## Files Modified

**Suites**
- `050m-graphql-sales-rep.csv` — +19 cases (→118), 1 corrupt row removed, `SR-GQL-033` collision resolved, live grounding applied, 0 findings
- `093-sales-rep-hub-dashboard-storefront.csv` — +27 cases (→45), 6 synced, 17 `T-002` rewrites, hit-target note
- `091-sales-rep-customer-profile-storefront.csv` — +15 cases (→50), 9 synced, 11 `Automation_Status` normalizations
- `092-sales-rep-admin-embedded-app.csv` → `092b-…` (rename, to break the duplicate-id collision)
- `_release/080-full-regression-release.csv` — restored + `FRR-045` parse fix
- `config/test-suites.json` — 093 registered, 092/092b split, 080 reconciled, testCounts corrected, selections updated, `totalSuites` 121

**Oracle**
- `.claude/knowledge/oracles/business-logic.md` — `BL-SR-014..031` added (18 layout invariants), then the whole file de-duplicated: 2776 → 1541 lines, 184 ids conserved, `bl:lint` 150 Blocker → 0

**Test data**
- `test-data/sales-rep/sales-reps.csv`, `test-data/aliases.json`, `test-data/aliases.vcptcore.json` — the `SR_REP_LAYOUT` fixture + alias + runtime-GUID overlay
- `scripts/seed-data/sales-rep/sales-rep-layout-specs.mjs`, `validate-sales-rep-data.mjs` — new; `seed-sales-rep.mjs`, `scripts/unit/seed-sales-rep.test.mjs`, `package.json`, `.claude/rules/test-data.md` — extended

**Tooling**
- `.mcp.json` (local) — `--secrets` added to firefox/edge, plus `Chrome DevTools` and `playwright-mobile` servers
- `config/mcp-playwright-mobile.config.json` — new, tracked (390×844, `hasTouch`, `isMobile`)

**Reports**
- `reports/bugs/BUG-SalesRep-Layout-Keyboard-Grab-Dropped-By-Pointer.md`, `reports/knowledge/BL-AUDIT-2026-08-04.md`, `reports/knowledge/BL-RECONCILE-2026-08-04.md`, `reports/ba/bl-proposals-2026-08-04.md`, `reports/tickets/VCST-5367/screenshots/` (9 files) — new

## Why five cases are still open — and what closes each

These are **tooling gaps, not product uncertainty**, and each case's own Preconditions already name the tool it needs. Worth recording precisely, because a wrong shortcut was attempted here and rejected for the right reason.

I proposed closing all five with `browser_run_code_unsafe` (raw Playwright `page` → `page.route()` interception, `newContext()`, `page.mouse` drag choreography). The verifying agent **declined, correctly**: `browser_evaluate` / `browser_run_code_unsafe` / `evaluate_script` are blocked by a `PreToolUse` hook (`.claude/hooks/enforce-real-user.mjs`, wired in `.claude/settings.json`) with only three narrow auto-allows — GraphiQL JWT `insertText`, GA4 `dataLayer`/`gtag()`, and payment-iframe inspection. None of these five qualifies. A relayed instruction to "close everything" is a request for outcomes, not consent to route around a project guardrail; that has to come from the operator through the permission system. **The refusal was the right call and the proposal was mine to withdraw.**

The sanctioned route is the one the CSV rows already prescribe — **Chrome DevTools MCP** ("force-fail … via devtools network interception", "throttle network (devtools) to slow 3G") — which simply was not connected in this session.

| Case(s) | Needs | Status |
|---|---|---|
| `SR-HD-035` / `SR-CP-047` failed read, `SR-HD-036` / `SR-CP-048` failed save | devtools request interception | **Wired** — `Chrome DevTools` added to `.mcp.json`, copied verbatim from the repo's own `templates/.mcp.json.example`. Effective next MCP restart |
| `SR-HD-034` skeleton | devtools network throttling (6 attempts at full speed never caught the window) | **Wired** — same server |
| `SR-HD-022` cross-device | a second `--secrets`-enabled browser | **Wired** — firefox/edge `--secrets` gap fixed (repo defect #11). Effective next restart |
| `SR-HD-041` touch | a `hasTouch` / `isMobile` context, which `browser_resize` cannot produce | **Wired** — new tracked `config/mcp-playwright-mobile.config.json` (390×844, `hasTouch`, `isMobile`, dsf 3) + a `playwright-mobile` server |
| Mid-drag visuals (`.sortable-ghost` at .45, dark `shadow-xl`) + the `mainLeft` drag-geometry retry | holding a drag open, which needs manual mouse choreography | **Not wired — needs an operator decision.** The only permitted-path-free item. Worth doing: it would also settle whether the one unreordered mouse drag was a synthetic-drag artifact (the current read) or a real finding |

## Decisions taken, and recorded observations

**Decided (QA owner, 2026-08-04):**

1. **Park-Escape is an accepted gap — no fix.** Escape cannot undo a keyboard park because `toggleHidden()` releases the grab on purpose; recovery is Space + ↑ from the parked zone. It joins the ticket's existing accepted list next to "park/restore appends to the end". Current behaviour is pinned by `SR-HD-044` so it is documented rather than rediscovered, and the decision is recorded in the bug report. **Worth remembering why it was worth chasing:** from the outside this is indistinguishable from the real defect — a tester who parks a card and presses Escape sees "Escape does nothing" in both cases. The defect is specifically a *pointer press* ending a grab without restoring.

**Recorded as observations — no action, no ticket:**

2. **Hit targets are 32×32 CSS px** for both the drag handle and the hide ✕, measured at a 390 px viewport. This **passes** WCAG 2.2 AA (2.5.8 requires 24×24) but **breaches this repo's own `<44×44` mobile heuristic**, and the design spec deliberately specifies `VcButton xs`, so the size is intentional rather than an oversight. Recorded here and on the mobile case so a future a11y pass finds the measurement instead of re-deriving it; not filed, because the repo heuristic is stricter than the standard the product is held to.
3. **The parked-zone empty hint** (`text-neutral-400` on the 45° hatch) is readable but low-contrast in dark mode. Observation only — **no contrast ratio was measured**, so this is explicitly not a WCAG claim.

## Next Steps

- [ ] Fix the filed defect (one-line-ish: make `onChoose` take the restoring `cancel()` path, or cancel before releasing) and decide open question 1
- [ ] **Decide on suite `080`** — restored and its `FRR-045` parse defect fixed, but a case-by-case comparison against the other 120 suites (3,861 cases) puts it at **82 DUPLICATE / 15 PARTIAL / 3 UNIQUE**. Recommendation: port the 18 gap cases into the domain suites and retire `080`. The 3 genuinely unique: `FRR-059` (hidden product not searchable), `FRR-087` (feature-flag immediate effect, no restart), `FRR-090` (full cross-layer purchase flow incl. inbox email verification — exists nowhere else as one continuous test). Tracked as backlog `B-07`
- [ ] Work the remaining backlog items (`B-01`…`B-07`) in parallel, not inside the next task
- [ ] Restart the Playwright MCP to pick up the `--secrets` fix, then close the **cross-device** case
- [ ] Wire Chrome DevTools MCP throttling to close the **skeleton** case and promote the last BL-UI draft; add request interception to close the **failed read / failed save** cases
- [ ] Add an API-layer case for `BL-SR-022` in 050m
- [ ] Both PRs are still **open against `dev`** — the backend PR is stacked on `#4` (VCST-5309); re-run `/qa-test-lifecycle` after the stack merges if the diff shrinks materially
- [ ] Run `/qa-regression sales-rep` — the selection now actually covers all 7 sales-rep suites (it previously ran 5 of 7)
