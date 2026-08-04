# Repository Findings Backlog

Incidental repository / infrastructure defects found **while doing something else**. They land here instead of being fixed inline, so a task never stalls behind them. Work them separately, in parallel, at whatever priority the team wants.

**What belongs here:** manifest defects, duplicate or dangling ids, corrupt CSV rows, stale counters, misconfigured MCP servers, broken selections, stale lint baselines — anything that is a repo-health problem rather than a product defect.

**What does NOT belong here:** product bugs (→ `reports/bugs/`), test-case quality findings (→ `/qa-review-tests`), or a defect that **blocks the task in hand** — fix that one immediately and say so.

**Convention:** newest batch on top. Keep entries one-liners with enough detail to act without re-investigating. Move a row to Resolved with the date and how it was fixed; do not delete history.

---

## Open

| # | Finding | Impact | Suggested fix |
|---|---|---|---|
| B-01 | `036-bopis-store-selector.csv` references 5 undefined aliases — `BOPIS_BVA_50/51/100/101/151` | `npm run td:validate` fails **repo-wide**, so the gate is red for everyone and those 5 cases cannot resolve their data | Author the aliases in `test-data/` (BVA quantities for the store selector) or rewrite the cases to use `@td()` refs that exist |
| B-02 | `suites:lint` burn-down baseline is stale — 5 baselined suites now pass (`015`, `026`, `044`, `045`, `052`); 6 malformed suites remain baselined | The baseline overstates the debt and hides progress; a newly-broken suite could be masked | De-baseline the 5 passing suites in `CSV_LINT_BASELINE` (`scripts/test-cases/sync-test-suites.ts`), then burn down the remaining 6 |
| B-03 | `bl:lint` reports 99 Medium + 8 Informational after the 2026-08-04 oracle reconciliation — 75 of them false-traceability, 2 non-contiguous id sequences | Not blocking (0 Blocker), but the noise floor makes a real regression hard to spot | Triage the 75 false-traceability findings — likely a linter matching rule, not 75 real gaps |
| B-04 | `bl:lint` is **not wired as a gate** anywhere | This is exactly why the oracle sat duplicated for a week (B-05) with 150 Blocker findings unnoticed | Add `bl:lint` to the CI gate set, at minimum failing on Blocker |
| B-05 | Mid-drag visual states and manual mouse choreography have **no permitted tooling path** — `browser_evaluate` / `run_code_unsafe` are hook-blocked by design, and the tool-level drag helper cannot hold a drag open | A small set of visual assertions (`.sortable-ghost`, dark-mode `shadow-xl`, drop-zone treatment) is permanently unverifiable | Either a narrow, reviewed exemption in `enforce-real-user.mjs` for mouse-down/move/up choreography, or a tool-level primitive. Owner decision, not a unilateral fix |
| B-06 | Suite `080` uses a file-wide `,,  "` whitespace-before-quote convention (93 of 100 rows) that the strict RFC-4180 parser in `suites:review` rejects at row 1 | `suites:review` on `080` reports 1 Blocker (`S-007` parse error) and can never reach the content; `080` is suppressed in `CSV_LINT_BASELINE` to compensate | Normalize the whitespace convention across the file, then de-baseline it. Parser-strictness debt, not a content defect |
| B-07 | **Suite `080` is 82% redundant.** A case-by-case comparison against the other 120 suites (3,861 cases) classified its 100 cases as **82 DUPLICATE / 15 PARTIAL / 3 UNIQUE** | Maintaining a 100-case file whose real value is 18 cases, while it decays (no fresh authoring, on the parser blocklist) | **Decision needed.** Recommendation: port the 18 gap cases into the domain suites (`042`/`045`/`047`/`048`/`073`/…), then retire `080` + its manifest and selection entries. The 3 UNIQUE: `FRR-059` hidden-product-not-searchable, `FRR-087` feature-flag immediate effect, `FRR-090` full cross-layer purchase flow incl. inbox email |

## Resolved — 2026-08-04 (found during the VCST-5367 lifecycle run)

These were fixed inline, which is what prompted this file to exist. Kept for the record.

| # | Finding | Why it mattered | Fix |
|---|---|---|---|
| R-01 | **Duplicate suite id `092`** — two different suites shared it, and the resolver is `suites.find(s => s.id === id)`, first match wins | `092-sales-rep-admin.csv` (18 cases: permissions, roles, rep lifecycle) was **unreachable — it had never run** | Embedded-app suite renamed to `092b` (`git mv`); both registered in the `sales-rep` selection |
| R-02 | **Suite `093` was never registered** in `config/test-suites.json` | 18 existing hub-dashboard cases never ran and were in no selection | Registered; added to `sales-rep`, excluded from `full`/`sprint` consistently with its siblings |
| R-03 | **Corrupt row in `050m`** — an incomplete duplicate of `SR-GQL-034` with an unterminated quote | Broke CSV parsing for the **whole file**: `csv-parse`, `graphql:lint-labels` and `suites:review` all failed, so 050m had **no working deterministic gate**. This one genuinely blocked the task | Orphan row removed (content was fully redundant) |
| R-04 | **Duplicate case id `SR-GQL-033`** — two fully-formed cases shared it | Ambiguous cross-references | Cross-references all pointed at the "fails CLOSED" case, which keeps `033`; the other became `SR-GQL-118` |
| R-05 | `089` `testCount` drift — manifest 42 vs 48 real | Under-reported scope | Corrected; `totalSuites` reconciled to 121 |
| R-06 | Non-standard `Automation_Status: "verified"` on 11 rows of `091` — a value used nowhere else in the repo | 11 linter findings | Normalized to `Reviewed` |
| R-07 | **Release suite `080` (100 P0/P1 cases) deleted from disk** by `9dd9f3e3`, a commit about test-data — the **second** time (`b4b03bf8` deleted it, `744b374d` deliberately restored it) | The `release` selection dangled — `/qa-regression release` could not run at all | Restored from `744b374d`; its malformed `FRR-045` row (17 columns instead of 15) fixed in the same change |
| R-08 | **`business-logic.md` was two concatenated copies of itself** since merge `02ca3da2` (2026-07-28) — 334 invariant headings for 184 ids, 150 Blocker findings, and two *different* "Domain 20"s | Every agent reading the primary QA oracle saw each invariant twice and could hit either of two conflicting Sales Rep domains | Reconciled **by merge**: 2776 → 1541 lines, 8 divergent invariants merged on provenance evidence, `BL-SREP-001..003` ported to `Domain 20a`, 184 ids conserved, `bl:lint` 150 Blocker → 0. See `reports/knowledge/BL-RECONCILE-2026-08-04.md` |
| R-09 | `playwright-firefox` and `playwright-edge` were missing `--secrets .env.playwright.local` while `playwright-chrome` had it — CLAUDE.md requires it on **each** server | A secret NAME typed in firefox/edge went into the form **as a literal**; this is what blocked the cross-device test case | Both aligned. `--secrets` is read at MCP startup, so it takes effect next session |
| R-10 | No Chrome DevTools MCP and no touch-enabled Playwright profile were bound, although several test cases' own Preconditions require them ("devtools network interception", "throttle network to slow 3G", mobile/touch viewport) | Five test cases were unverifiable and looked like product uncertainty when they were a tooling gap | `Chrome DevTools` added to `.mcp.json` verbatim from `templates/.mcp.json.example`; new tracked `config/mcp-playwright-mobile.config.json` (390×844, `hasTouch`, `isMobile`) + a `playwright-mobile` server. Effective next MCP restart |
| R-11 | Coverage Summary table in `business-logic.md` was stale independently of R-08 — the Cart row omitted `BL-CART-015`, and the Total row did not match the sum of its own columns | The oracle's own headline numbers were wrong | Recomputed from the deduped set: 184 / P0 51 / P1 100 / P2 33 |
