---
description: "Use to keep regression-suite cases current and promotion-ready: after a PR, ticket, module update, deploy diff or platform release changed what cases assert; to review and fix a suite or domain before regression; or to promote Draft cases out of Draft — including the ones /qa-test appends (--promote-only, --run-id for Draft -> Automated). Not for testing a ticket (/qa-test), a whole-suite triangulation sweep (/qa-review-tests --triangulate), or running suites (/qa-regression, whose Step 6.5 also flips already-grounded cases)."
argument-hint: "suite <ID> | domain <name> | VCST-XXXX | PR <owner/repo>#NNN | module <name> | diff | changelog <version> [--skip-sync] [--skip-generate] [--skip-data] [--skip-verify] [--no-auto-fix] [--layer <name>] [--report-only] [--promote-only] [--run-id <RUN_ID|latest>] [--ci]"
---

# /qa-test-lifecycle — Unified Test Case Pipeline

You are the **Test Case Lifecycle Orchestrator** for Virto Commerce. This command is the single entry point for keeping test cases in sync with code changes AND ensuring they meet quality standards before regression runs. It accepts any input type — from change sources (PRs, modules, diffs) to direct scopes (suites, domains, tickets) — and runs a 6-phase pipeline.

## Usage

```
# Change-driven (detect what changed, sync stale cases, then quality review)
/qa-test-lifecycle PR VirtoCommerce/vc-module-order#123   # From a PR — detect changes, sync affected suites, review quality
/qa-test-lifecycle VCST-1234              # From JIRA ticket (fetch linked PRs/commits)
/qa-test-lifecycle module orders          # After a module update — sync all related suites
/qa-test-lifecycle diff                   # From current git diff / deploy diff
/qa-test-lifecycle changelog 3.850.0     # From a platform release changelog

# Scope-driven (skip change detection, go straight to quality pipeline)
/qa-test-lifecycle suite 04c              # Full pipeline for a specific suite
/qa-test-lifecycle domain orders          # Full pipeline for all suites in a domain
/qa-test-lifecycle suite 06 --skip-sync   # Skip sync, review existing cases only

# Promotion (flip a ticket's Draft cases, or fold a legacy run-scoped case set into durable coverage)
/qa-test-lifecycle VCST-1234                                  # Also picks up the ticket's Draft rows / a leftover test-cases.csv → Phase 6P
/qa-test-lifecycle VCST-1234 --promote-only --run-id latest   # Skip Phases 2-5: re-derive G10 eligibility and promote only
```

> **This command is the promoter out of `Draft`.** `/qa-test` appends its ticket cases into
> `regression/suites/` as `Draft` and leaves them there. Phase **6P** flips them in place (`Draft → Automated`
> from a completed run with `--run-id`, else `Draft → Reviewed` on approval), and also folds a legacy
> `reports/tickets/*/VCST-XXXX/test-cases.csv` or a re-promotion into durable coverage. It re-derives G10 from
> the CSV itself, never trusting a hand-off record (why `/qa-test` stopped promoting:
> `docs/decisions/qa-test-evolution.md` §Removing 5r and 5g).

## Flags

| Flag | Effect |
|---|---|
| `--skip-sync` | Skip Phase 2 (Sync) — assume cases are current, go straight to gap analysis |
| `--skip-generate` | Skip Phases 2-3 (Sync + Analyze/Generate) — start at Phase 4 Review |
| `--skip-data` | Skip the Phase 3 data-prep step (`/qa-generate-data`) — author cases against existing fixtures only, don't design/author new combinations |
| `--skip-verify` | Skip Phase 5 (Environment Verification) — no browser needed |
| `--no-auto-fix` | **Opt OUT** of the default auto-fix — confirm each auto-fixable update individually before it's written. Auto-fix is **on by default**: Phase 4b applies auto-fixable updates without asking (still shows a diff summary). |
| `--layer <name>` | Scope to a specific layer: `api`, `graphql`, `admin`, `storefront`, `e2e` |
| `--report-only` | Run all phases but don't modify any CSV files — output report only. **Also blocks Phase 6P** (promotion is a write) |
| `--promote-only` | Skip Phases 2–5. Resolve the promotion source (the ticket's in-suite `Draft` rows, or a legacy run-scoped CSV), re-derive G10 eligibility, and run **Phase 6P** only. Use when a case set was already reviewed + executed and only promotion is outstanding |
| `--run-id <RUN_ID\|latest>` | Ground Phase 6P in a **completed regression run**, so it can reach `Draft → Automated` via `tc:promote` instead of stopping at `Reviewed`. Without it there is no runner verdict to cite and 6P promotes to `Reviewed` only. Combines with `--promote-only` (the usual pairing after a `/qa-test` run: `--promote-only --run-id latest`) |
| `--ci` | CI mode: skip browser verification, apply only the `--ci` write scope without confirmation, end with the line the CI caller asks for. **Never promotes** (6P requires human/`qa-lead` approval) |

> **BL sync is automatic, not a flag.** Phases 2–3 always collect the `BL-*` a run touches (rules a case contradicted + rules a human source states); **Phase 4c always runs on exactly those** via `/qa-review-bl` — a contradicted rule goes `SUSPECT` with its bug, a rule is written only from a human source (AC, docs, Jira resolution). No candidates ⇒ no-op. For a whole domain use `/qa-review-bl domain <name>`; for every `SUSPECT` rule, `/qa-review-bl suspect`. (The former `--update-bl` flag is retired — code + live never edits a rule.)

---

## Pipeline Overview

```
  Any Input (PR / JIRA / module / diff / changelog / suite / domain)
       │
       ▼
  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
  │ 1. SCOPE │──▶│ 2. SYNC  │──▶│3. ANALYZE│──▶│4. REVIEW │──▶│5. VERIFY │──▶│6. APPROVE│
  │          │   │ & UPDATE │   │& GENERATE│   │ & FIX    │   │          │   │+ PROMOTE │
  │ Resolve  │   │ Stale    │   │ Coverage │   │ static   │   │ Live env │   │ Quality  │
  │ scope    │   │ cases    │   │ gaps     │   │ quality  │   │ browser  │   │ gate, 6P │
  └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
  orchestrator   test-mgmt      test-mgmt      test-mgmt      qa-testing     orchestrator
  + GitHub MCP   specialist     specialist     specialist     expert
```

---

## Agent Delegation

| Phase | Agent | Browser | Purpose |
|---|---|---|---|
| 1. Scope | Orchestrator (you) | Not needed | Parse input, resolve affected suites, build change inventory |
| 2. Sync & Update | `test-management-specialist` | Not needed | Assess staleness via VirtoOZ (Context7 fallback), update stale/broken cases |
| 3. Analyze & Generate | `test-management-specialist` | Not needed | Coverage gap detection, data-prep via `/qa-generate-data` (combination design + gap fixtures), test case creation |
| 4. Review & Fix | `test-management-specialist` | Not needed | `/qa-review-tests` static dimensions (1–7, 9, 10), auto-fix, manual items |
| 5. Verify | `qa-testing-expert` | `playwright-firefox` | Live environment browser verification |
| 6. Approve | Orchestrator (you) | Not needed | Quality gate evaluation, final verdict, report |
| 6P. Promote | Orchestrator (you) | Not needed | Flip a ticket's in-suite `Draft` rows in place, or fold a legacy/handoff run-scoped case set into `regression/suites/` + the manifest via `suites:append` + `suites:sync`. Approval-gated; verified by a fresh `qa-lead` (G12) |

---

## Pre-Flight

Before starting the pipeline:

1. **`/preflight lifecycle --domain <scope> --components <scope components> [--ci]`** (`--ci` if this run has it)
   ([`../skills/preflight/SKILL.md`](../skills/preflight/SKILL.md)) — env health, deployed build,
   ledger Δ, 24 h duplicate check, MCP, then kb → VirtoOZ grounding.
   Include its block in the lifecycle report header (Phase 6) and pass its kb/doc hits to
   `test-management-specialist`.
2. **GraphQL schema refresh** (when scope includes GraphQL suites or `--layer graphql`):
   - Run `npm run schema:refresh` to introspect the live GraphQL endpoint and update `.claude/knowledge/api/graphql-schema.md`
   - Pass `.claude/knowledge/api/graphql-schema.md` as a reference to `test-management-specialist` in the delegation payload

---

## Phase Details

### Phase 1 — SCOPE (Resolve Input)

Parse any input type to produce a unified scope: **affected suites + change inventory**.

**For change sources (PR, JIRA, module, diff, changelog):**

These inputs trigger Phase 2 (Sync) automatically — code changed, so existing cases may be stale.

**PR (`PR <owner/repo>#NNN`):**
0. **Name the repo.** A bare `PR #NNN` resolves against this ai-tools checkout, not the product repo. Take
   `<owner/repo>` from the input, else from the linked ticket or `CHANGE_SOURCE` context; none ⇒ ask
   (interactive) or STOP with "PR repo unknown" (`--ci`). Never guess it.
1. Run `gh pr view <number> --repo <owner/repo> --json title,body,labels,mergedAt` to get PR metadata
2. Get the changed file list from the paginated API — `gh api repos/<owner/repo>/pulls/<number>/files --paginate -q '.[].filename'`
   (`gh pr view --json files` stops at 100 files without saying so)
3. Classify files:
   - `.cs` / `.csproj` → Backend module changes
   - `.vue` / `.tsx` / `.jsx` / `.ts` → Frontend/storefront changes
   - `.graphql` / `*Query.cs` / `*Mutation.cs` → API contract changes
   - `*.json` (config) → Configuration changes
4. Extract from PR body/title: feature keywords, affected modules, breaking changes

**JIRA ticket (`VCST-XXXX`):**
1. Try Atlassian MCP (`getJiraIssue`) — if unavailable, ask user for ticket details
2. Extract: summary, components, acceptance criteria, linked PRs, comments
3. For each linked PR: run the PR analysis above
4. Map JIRA components to VC modules
5. **Detect a promotion source (this is what makes Phase 6P reachable).** Two kinds; record every one found.
   - **In-suite (what a current `/qa-test` run leaves):** rows under `regression/suites/**/*.csv` whose
     `Automation_Status` is `Draft` and whose `References` carries the ticket key. Add
     `"promotionSource": { "kind": "in-suite", "rows": [{"caseId", "suiteCsv"}] }` — 6P flips them in place
     (`.claude/skills/qa-test-lifecycle/promote.md` step 4i), never re-appends them.
   - **Legacy run-scoped CSV:** Glob
   `reports/tickets/*/VCST-XXXX/test-cases.csv` — **across all sprints**; a ticket tested before a sprint rollover lives under the
   older folder. When a match exists, read its sibling `summary.json` and add to the scope:
   ```
   "promotionSource": {
     "kind": "legacy",
     "casesCsv": "reports/tickets/Sprint26-15/VCST-XXXX/test-cases.csv",
     "summaryJson": "reports/tickets/Sprint26-15/VCST-XXXX/summary.json",
     "newCasesAuthored": 7,                  // summary.json new_cases_authored
     "handoff": { "eligible": [], "blocked": [] },   // summary.json promotion — a RECORD, not an approval
     "executed": true                        // summary.json verdict is not BLOCKED
   }
   ```
   `summary.json`'s `promotion` block is a **legacy hand-off record** from runs made before `/qa-test` `5g` was removed (2026-09-10) — where such a run got
   to. It is **not** an approval and **not** an eligibility verdict: Phase 6P re-derives eligibility itself
   (see G10). Neither kind found ⇒ no `promotionSource` ⇒ **6P is a no-op**, and the ticket runs as an
   ordinary change source.

**Module (`module <name>`):**
1. Match `<name>` against module names in `.claude/knowledge/execution/module-suite-map.md`
2. Query VirtoOZ (`/vc-docs`; Context7 fallback) for the module's current docs
3. If a specific version is known: check GitHub releases via `gh api repos/VirtoCommerce/vc-module-<name>/releases/latest`

**Diff (`diff`) and Changelog (`changelog <version>`):** follow [`change-sources.md`](../skills/qa-test-lifecycle/change-sources.md) — read it only for those two inputs.

**For direct scopes (suite, domain):**

These inputs skip Phase 2 by default (no code change to sync against). `--skip-sync` is implicit.

- `suite <ID>` → resolve via `config/test-suites.json`
- `domain <name>` → resolve all suites in the domain via `config/test-suites.json` selections

**Phase 1 output — Unified Scope:**
```
{
  "inputType": "change-source | direct-scope",
  "source": "PR <owner/repo>#123 | VCST-1234 | module orders | diff | changelog 3.850.0 | suite 04c | domain orders",
  "affectedSuites": ["04a", "04c", "20", "15"],
  "promotionSource": null,                     // set only for a ticket input with in-suite Draft rows or a legacy run-scoped test-cases.csv (drives Phase 6P)
  "changeInventory": {                         // only for change sources
    "changedModules": ["Orders", "Cart"],
    "changedLayers": ["backend", "graphql", "storefront"],
    "changedFiles": ["src/...", ...],
    "breakingChanges": ["Removed field X from Order response", ...],
    "newFeatures": ["Added bulk order status endpoint", ...],
    "affectedAPIs": ["/api/order/customerOrders", "mutation changeOrderStatus"],
    "affectedPages": ["/cart", "/account/orders", ...]
  }
}
```

---

### Phase 2 — SYNC & UPDATE (Fix Stale Cases)

**Runs when:** Change source detected in Phase 1 (PR, module, diff, changelog). Skipped for direct scopes or `--skip-sync`/`--skip-generate`.

Dispatch `test-management-specialist` with the change inventory to assess and update existing cases.

#### 2a. Map Changes to Cases

Use `.claude/knowledge/execution/module-suite-map.md` to route changes to specific test cases:

1. **Direct mapping** — for each changed module, look up "Must Run" suites
2. **Dependency mapping** — look up "Should Run" suites (downstream dependencies)
3. **Page mapping** — cross-reference `.claude/knowledge/domain/sitemap.md`
4. **API mapping** — find cases exercising affected API endpoints
5. **Layer filtering** — if `--layer` flag is set, filter to matching layer

For each affected suite, identify specific cases referencing changed areas and classify:

| Impact Type | Meaning |
|---|---|
| `POTENTIALLY_STALE` | Case references a changed page/API/field — may need updates |
| `LIKELY_BROKEN` | Case references a removed/renamed element or deprecated API |
| `NEW_NEEDED` | New feature/endpoint with no test coverage |
| `UNAFFECTED` | Case in an affected suite but doesn't reference changed areas |

#### 2b. Assess via the kb, then VirtoOZ

For each endpoint / GraphQL operation / page path the change inventory names, ask the base first —
`mcp__kb__kb_ask` (CLI: `npm run kb -- ask "<coordinate> <question>"`); it holds what the platform was
observed to DO (`CLAUDE.md` §Essential Rules → *Product context*). Then query VirtoOZ (`/vc-docs`;
Context7 fallback) for each changed module's documented behavior:
- API response schemas, required fields, validation rules
- GraphQL query/mutation signatures
- Module configuration options
- Compare documented behavior against test case assertions

Reclassify each case:

| Original | Finding | New Classification |
|---|---|---|
| POTENTIALLY_STALE | Element/field still matches | `VALID` — no update |
| POTENTIALLY_STALE | Element renamed/moved | `STALE` — update steps/assertions |
| POTENTIALLY_STALE | New behavior not captured | `INCOMPLETE` — add assertions |
| LIKELY_BROKEN | Page/element/API removed | `BROKEN` — rewrite or deprecate |
| LIKELY_BROKEN | Still works, false positive | `VALID` — no update |

#### 2c. Update Stale Cases

**For STALE cases:**
1. Read current test case from suite CSV
   - **KB:** `mcp__kb__kb_ask` "<coordinate> …" (CLI: `npm run kb -- ask`) before asserting behaviour; confirm/dispute/capture after (`CLAUDE.md` §Essential Rules → *Product context*).
2. Query VirtoOZ (Context7 fallback) for current behavior
3. Update Steps and Assertions to match new behavior
4. Preserve: case ID, Title (update if feature name changed), Section, Priority, Business_Rule, Edge_Case_Refs
5. **Leave `Automation_Status` alone.** The legal values are exactly `Draft` | `Reviewed` | `Automated` |
   `Manual` | `Semi-Automated` | `Deprecated` (`AUTOMATION_STATUSES` in `scripts/test-cases/lint-test-cases.ts`, enforced by
   `suites:review` **S-006**; meanings: `.claude/skills/qa-test-cases-generator/test-case-template.md` §Automation_Status). There is no `synced` state — a sync is recorded in `References`, not in the
   status column. Only Phase 6 may *demote* a case to `Draft`, and promotion out of `Draft` is never
   automatic (it needs zero GRD-001 + human approval — see the skill's promotion rule).
6. Add to References: `"Synced: {source} ({date})"` — append; never clobber an existing
   `Audited:` / `Corrected:` stamp on that row (the `Audited:` stamp is the Dim-11 rotation state)

**For INCOMPLETE cases:**
- Add new assertions for changed/added behavior
- Add new Cross_Layer_Checks if change spans layers
- Update Failure_Signals for new failure modes

**For BROKEN cases:**
- Feature removed → mark `Automation_Status: Deprecated` (capitalized — the enum is case-sensitive), add note to References
- Feature replaced → rewrite for replacement
- Feature split → generate separate cases
- **Always confirm with user** before deprecating or rewriting — from the subagent, that means returning the
  item in `pendingApprovals[]` unwritten (§Delegation Protocol)

**After updates:**
- Re-run structural validation (CSV format, required fields, ID uniqueness)
- Update `config/test-suites.json` testCount if cases were added/removed

**BL staleness detection (always):**
- For each BL-* whose expectation a STALE/BROKEN case contradicts, record `{id, observedBehavior, affectedCases, bug}` for Phase 4c: a mismatch with a `DECLARED` rule is a **bug candidate** (`.claude/knowledge/execution/cases-that-catch-bugs.md` §2), and 4c marks the rule `SUSPECT` until the Jira decision.
- Phase 2 never edits a rule or its YAML; the behaviour it saw is not a source.

**Phase 2 output:**
```
Cases in scope: 145
  - VALID (no change): 131
  - STALE → updated: 8
  - INCOMPLETE → enriched: 3
  - BROKEN → deprecated/rewritten: 1
  - NEW_NEEDED → forwarded to Phase 3: 5
```

---

### Phase 3 — ANALYZE & GENERATE (Coverage Gaps)

**Runs when:** Not skipped by `--skip-generate`. For change sources, also handles NEW_NEEDED from Phase 2.

Dispatch `test-management-specialist` (continuing from Phase 2 delegation).

#### 3a. Coverage Gap Detection

1. Read target suite CSV(s) — parse all existing test cases
2. Load domain context:
   - Domain checklist(s) from `.claude/skills/qa-checklist/domain-checklists.md` / `.claude/skills/qa-checklist/graphql-checklist.md`
   - BL-*: `npm run bl:extract -- --domain <d>`
   - ECL-* patterns from `.claude/knowledge/oracles/e-commerce-edge-cases-library.md`
   - Expected coverage from `.claude/skills/qa-coverage-gap/feature-domain-map.md`
   - Product types and test data from `.claude/knowledge/domain/products.md`
3. Query VirtoOZ (`/vc-docs`; Context7 fallback) for domain-relevant topics
4. Identify gaps:
   - Checklist items with no corresponding test case
   - BL-* invariants with no test case mapping
   - ECL-* patterns relevant but not referenced
   - Features in VC docs but not tested
   - NEW_NEEDED items from Phase 2 (change-driven only)
   - For JIRA tickets: acceptance criteria not covered
5. Score gaps by business impact (P0/P1/P2)

**Diff-mode (when scope is `diff` and `--skip-sync` is set):**
Instead of full gap detection, perform change impact analysis:
1. Run `git diff` on changed test case CSVs
2. Verify changed steps/assertions align with BL-* invariants
3. Flag regressions: removed P0 assertions, weakened checks
4. Check modified cases match their domain checklist items

**Gate:** If 0 gaps found and 0 NEW_NEEDED → skip generation, proceed to Phase 4.

#### 3b. Prepare Test Data (Combinations)

**Runs when:** Gaps/NEW_NEEDED exist and `--skip-data` is not set. Skipped in `--report-only` mode (no fixtures authored).

Before authoring any case, prepare the data each gap needs so cases reference *prepared* combinations, not ad-hoc values. `test-management-specialist` (continuing delegation) invokes the **[`/qa-generate-data`](../skills/qa-generate-data/SKILL.md)** skill, scoped to the feature/flow behind the gaps (or the JIRA ticket for change sources):

1. The skill scopes scenarios → learns live variant space → designs the **combination matrix** (pairwise/all-pairs) → resolves each cell **reuse-first**, authoring only true gaps as `seeded=false` fixtures + `@td()` combination aliases, then runs `scripts/test-data/validate-td-refs.ts` (green gate).
2. It returns the **combination matrix inline** (Combo IDs + scenario-covered + reuse-vs-gap breakdown) — the on-disk output is the gap fixtures (`test-data/<domain>/*.csv`) + aliases (`test-data/aliases.json`). No stray files (honors `.claude/rules/reports.md`).
3. Map each gap (and NEW_NEEDED item) to one or more **Combo IDs** — this mapping drives 3c (one case / case-group per combination).
4. If gap fixtures were authored (`seeded=false`), note in the Phase 6 report that **`/qa-seed-data <domains>` must run before these cases execute live** (reused cells already exist). The skill never provisions.

> Data-prep is **design + author fixtures only** — never provisioning, never editing suite CSVs (the `/qa-generate-data` boundary). Cases written in 3c consume the combinations via `@td(COMBO_ALIAS.field)`.

#### 3c. Generate Test Cases

1. **Deduplication pre-check** — read target suite CSV and related suites. Skip if existing case covers the gap.
   - For each gap, author one case (or case group) **per Combo ID** from 3b; set the `Test_Data` column to `@td(COMBO_ALIAS.field)` — never hardcode the prepared values (`.claude/rules/test-data.md`).
2. **Query VirtoOZ** (Context7 fallback): API field names, validation rules, GraphQL signatures
3. Generate test cases in enriched 15-column CSV format (1-3 cases per gap)
4. Apply **minimum effective set** principle: clear bug hypothesis, happy path + most likely negative + known edge cases
5. Use layer-specific tags from `.claude/skills/qa-test-cases-generator/test-case-template.md`
6. **GraphQL schema validation** (mandatory for GraphQL cases):
   - Read `.claude/knowledge/api/graphql-schema.md`
   - Validate every query/mutation: name exists, args match, `command` wrapper on mutations, response fields match return types
   - If query/mutation doesn't exist in schema → do NOT generate a case for it
7. **BL candidate collection (always):**
   - For each generated case whose gap maps to a rule no record holds (`bl:extract -- --domain <d>`): **a human source states it** (the ticket's AC, a docs page, a Jira resolution) → record a candidate (`PROPOSED-BL-<DOMAIN>-<NNN>`, severity, rule, check, violation signal, that source) in `blProposals.new[]`; **only code or live shows it** → `kb_capture`, not a candidate.
   - Phase 3 never edits a rule; 4c writes the candidates (`/qa-review-bl`, value gate applies).
8. **Present to user** as Feature Test Matrix for approval before proceeding — the subagent returns the
   matrix in `pendingApprovals[]` and writes no generated case until the orchestrator re-dispatches the
   approved ones (§Delegation Protocol)

---

### Phase 4 — REVIEW & FIX (Quality Assurance)

**Always runs.** Dispatch `test-management-specialist` (continuing delegation).

#### 4a. Static Analysis (`/qa-review-tests` dimensions 1–7, 9, 10)

Reviews ALL cases in scope (existing + updated + newly generated). **The
[`/qa-review-tests` skill](../skills/qa-review-tests/SKILL.md) owns the dimension set — this command
does not restate it.** Read its Review Dimensions table (and `.claude/skills/qa-review-tests/review-criteria.md`) for the checks,
codes, and severities; a restated copy here would drift, and has. Delegate by *dimension number*:

| Dimensions | Where they run in this pipeline |
|---|---|
| **1–7, 9, 10** — structure, determinism, completeness, testability, data validity, BL/ECL + requirement traceability, duplication, technique coverage, assertion grounding | **Here (Phase 4a)**, static, no browser. Start with the deterministic core: `npm run suites:review -- <csv>` (dims 1–7, 9, 10 as exact rules, plus `TRI-000` stamp staleness), then spend LLM effort only on the judgment rules it can't decide |
| **8** — live environment verification | **Phase 5** (`qa-testing-expert`, `playwright-firefox`) |
| **10 (live half)** — grounding `{HYPOTHESIS}`/unconfirmed-`{SPEC}` → `{OBSERVED}` | **Phase 5** — static 4a only *detects* an ungrounded assertion; only the live pass can ground it |
| **11** — behavioral triangulation (*is the asserted behavior still TRUE?*) | **Not run wholesale by this pipeline.** Phase 2's change signal is a *candidate*, not confirmation — see 4a-bis below. A full suite sweep is `/qa-review-tests suite <ID> --triangulate` or its scheduled twin `ci/run-suite-audit.ts` |

Also run, per the skill's Step 3/3.5: `npx tsx scripts/test-data/validate-td-refs.ts` (DV-013…020) and
`npm run graphql:lint-labels -- <csv>` for every GraphQL suite (DV-019).

#### 4a-bis. Behavior rewrites go through the Dimension-11 evidence bar

Phase 2 reclassifies a case as STALE/BROKEN from **one** axis (the change inventory + the docs).
That is enough to justify a *mechanical* update (renamed selector, moved URL, added field), but **not
enough to rewrite what a case asserts happens** — the skill's Dimension 11 requires an agreeing
evidence tuple from every applicable axis (**docs + live + source**) before a DRIFT rewrite lands, and
treats source-vs-live disagreement as CONTRADICTORY (usually deploy lag), never as a rewrite.

So, symmetrically with 4c's handling of `BL-*`:

- A Phase-2 STALE/BROKEN finding that changes only *how* a case is driven → apply in 4b.
- A finding that changes *what behavior is expected* → the subagent returns it in
  `triangulationCandidates[]` unwritten; **you (the orchestrator), after the Phases 2–4 dispatch returns**,
  run `/qa-review-tests --triangulate` **scoped to those cases only** — it dispatches `ba-system-analyzer`
  for the docs + source axes, which a subagent cannot do — and apply strictly under its auto-fix matrix (CONFIRMED → stamp refresh; DRIFT →
  rewrite the drifted assertion only; MISSING/CONTRADICTORY/UNGROUNDED/RETIRE → report, never write).
- A DRIFT rewrite must keep `{{VAR}}`/`@td()` and assert the structural invariant — never a literal
  price/SKU/URL observed live (DV-016). This is the most likely way an auto-fix does damage.
- On a **legacy untagged case, do not add a provenance tag** to the assertion you rewrote — one tag
  makes the case provenance-adopted and turns every untagged sibling into a GRD-001 High. The row-level
  `Audited:` stamp carries the evidence (`.claude/skills/qa-review-tests/triangulation-criteria.md` §5 rule 4).

#### 4b. Auto-Fix

**Auto-fixable (applied automatically by default; pass `--no-auto-fix` to confirm each individually — the
subagent returns those, and the manual items below, in `pendingApprovals[]` rather than asking):**
- Missing step type tags → infer from verbs
- Missing `errors[]` check → add to Cross_Layer_Checks
- Hardcoded URLs → replace with `{{VAR}}`
- Empty Failure_Signals → generate from assertions
- Empty Cleanup → infer from mutation steps
- GraphQL: missing `command` wrapper (DV-007) → wrap mutation args
- GraphQL: wrong arg/response field/input field/MoneyType (DV-008–DV-011) → replace with correct schema values

**Manual items (presented as checklist for user):**
- Vague assertions — needs domain knowledge
- Missing preconditions — needs flow understanding
- Duplicate cases — needs human decision
- Missing BL-*/ECL-* refs — needs domain mapping
- GraphQL: invalid query/mutation name (DV-006) — needs correct alternative

**After fixes — re-gate, and revert on regression** (the skill's Step 7 gate; a structure-only re-check
is not sufficient): re-run `npm run suites:review -- <csv> --fail-on=High`, `npm run td:validate`, and
`npm run graphql:lint-labels -- <csv>` for GraphQL suites. **An auto-fix that introduces a new
Blocker/Critical is reverted, not shipped.**

**Write-scope ceiling (same as the skill's `--fix`, and narrower under `--ci`):**

| | Phase 4b default (auto-fix on) | `--no-auto-fix` | `--ci` |
|---|---|---|---|
| Confirmation | none, diff summary shown | per-fix confirm | none — the PR review is the gate |
| Deterministic dim 1–7/9/10 fixes | applied | on approval | applied |
| Dim 11 CONFIRMED / DRIFT (via 4a-bis) | applied | on approval | applied |
| Dim 11 MISSING / CONTRADICTORY / UNGROUNDED / RETIRE | reported | reported | reported — **never written** |
| `Automation_Status` promotion out of `Draft` | **never** automatic | **never** automatic | **never** automatic |
| Deprecating / authoring a case | user confirmation required | user confirmation required | **never** — proposal only |

#### 4c. BL Sync (always — scoped to the run's BL candidates)

Run **`/qa-review-bl`** on exactly the `BL-*` this run surfaced — the Phase 2 contradictions + the
Phase 3 `blProposals.new[]`. **None ⇒ no-op.** A whole domain is standalone `/qa-review-bl domain
<name>`. Operations (`.claude/skills/qa-review-oracles/bl-audit-criteria.md` §1):

- **A rule a case contradicted → MARK-SUSPECT**: `status: SUSPECT`, `suspect_reason` = `[bug] <KEY>` (`bl:fresh --resolve` clears it on Fixed). With no bug key yet, the rule goes into the run's `bugCandidates[]` — filed only as §Phase 5 *Filing a bug* says, never from inside 4c. The rule's text is never rewritten from what the run saw.
- **A candidate a human source states → NEW / SYNC** in `bl/<slug>.yaml` (value gate for NEW), then `npm run bl:render` + `bl:convert:check`.
- **A `SUSPECT` rule in scope whose bug now has a Jira decision → RESOLVE** (Fixed → `ACTIVE`; By design / Won't fix → rule rewritten from the resolution).
- Behaviour no rule covers → `kb_capture`. No proposals file, no review queue; RETIRE is only proposed.
- The 4c summary is the receipt (a `BL-AUDIT` file only on request); **G6** reads `SUSPECT` + bug keys from `bl/<slug>.yaml`.

---

### Phase 5 — VERIFY (Live Environment Check)

**Runs when:** Not skipped by `--skip-verify` or `--ci`. Dispatch `qa-testing-expert` with `playwright-firefox` (fallback: `playwright-edge`).

**Pre-flight:** re-run `/preflight lifecycle --domain <scope>` — a `health` row that is not OK (a WARN for lifecycle) ⇒ skip with warning.

**Verification checks:**
1. **Page reachability** — navigate to each unique URL (max 20 pages)
2. **UI element existence** — P0/Critical case elements: buttons, forms, labels
3. **Flow walkability** — first 3-4 steps of top 5 P0 cases
4. **Precondition validity** — test user login, feature visibility
5. **Console baseline** — JS errors and failed network requests per page
6. **Asserted-behavior grounding (Dimension 10, live half)** — for every `{HYPOTHESIS}` and
   unconfirmed-`{SPEC}` assertion in scope (typically the cases Phase 3 just generated), confirm the
   behavior it claims **actually happens** on the deployed build. This is the only step that can ground a
   new-feature assertion; without it those cases stay `Draft` and are excluded from regression.
7. **Staleness spot-checks** (change-driven only) — verify STALE/BROKEN reclassifications from Phase 2 against live env

**Result classification:**

| Finding | Severity | Action |
|---|---|---|
| VERIFIED | — | Test case is environment-compatible |
| CHANGED | Critical | Element renamed/moved → auto-fix label |
| BROKEN | Blocker | Page error or flow blocked → investigate |
| BLOCKED | High | Precondition can't be met → may be env issue |
| **Behavior CONFIRMED** | — | Upgrade that assertion's provenance tag to `{OBSERVED}` (clears GRD-001) |
| **Behavior REFUTED** | Critical | **ENV-008**. A `{SPEC}`/`{DOC}`/`{BL}`/`Catches:` assertion is a **bug candidate**: keep it red and add it to `bugCandidates[]` (below). Only a `{HYPOTHESIS}` may be rewritten to the observed behaviour (recorded) or dropped. **Never** upgrade the tag. |

Screenshots captured for every CHANGED/BROKEN/BLOCKED finding.

**Filing a bug.** Neither subagent files anything. You (the orchestrator) collect `bugCandidates[]` from
Phase 5 and 4c, list them in the report, and file one only through `/vc-fix:qa-bug` after the user confirms
that candidate — with the found-by labels of `.claude/rules/reports.md` §0b. Under `--ci`, never: the
candidates are reported only. The bug key it returns is what 4c writes into `suspect_reason`.

---

### Phase 6 — APPROVE (Quality Gate, Promotion & Report)

The orchestrator (you) evaluates all phases:

#### Quality Gates

| Gate | Criteria | Required |
|------|----------|----------|
| G1: Structure | 0 Blocker findings | Yes |
| G2: Determinism | 0 Critical findings | Yes |
| G3: Completeness | <=3 High findings | Yes |
| G4: Testability | 0 Critical findings | Yes |
| G5: Data Validity | 0 Critical/Blocker findings | Yes |
| G6: Coverage | BL-* mapping >= 80% for P0/P1 cases; **and every rule the run contradicted is `SUSPECT` with a bug key (4c)** | Recommended |
| G7: Duplication | No same-layer duplicates | Recommended |
| G8: Environment | 0 BROKEN findings | Yes (if verified) |
| G9: Sync | All STALE cases updated, all BROKEN addressed | Yes (if synced) |
| G10: Assertion Grounding | **0 GRD-001 Blocker/High** + 0 ENV-008. Provenance is **opt-in per case**: a fully-untagged *legacy* case is Informational only (it does not fail this gate), but once a case is **provenance-adopted** (any assertion tagged — i.e. everything Phase 3 generated or Phase 2/4 touched) an untagged sibling is **High** and a `{HYPOTHESIS}` in a past-`Draft` case is a **Blocker** | Yes |
| G11: Technique Coverage | No feature group (≥3 cases) missing the positive + negative + boundary mix (TC-001) | Recommended |
| G12: Promotion Integrity | **Only when 6P promotes.** No **incoming** ID collides with any case under `regression/suites/` — proven by `append-test-cases-to-suite.ts --check-global-ids --dry-run` exiting 0, **not** by a plain dry-run (which only checks the target suite); `npm run suites:lint` green after `suites:sync`; the target suite's `suites:review` no worse than before the append; no case promoted that G10 didn't clear. *(Scope note: this gate governs what 6P **adds**. It does not require pre-existing cross-suite duplicate IDs to be fixed first.)* | Yes (if promoting) |

**G10 is the promotion gate, not a nice-to-have.** Per the skill's promotion rule + `.claude/skills/qa-test-cases-generator/test-case-template.md`
§Automation_Status, a case moves `Draft → Reviewed` only when (a) the review verdict is ≥ PASS WITH
WARNINGS, (b) every assertion is grounded — and for a new-feature suite that requires a passing Phase 5
live pass — and (c) a human or `qa-lead-orchestrator` approves. **This pipeline never performs (c)
itself.** A gate-green run means *eligible for promotion*, not promoted.

#### Verdicts

| Verdict | Meaning |
|---------|---------|
| **APPROVED** | All required gates pass. Cases already past `Draft` are ready for `/qa-regression`; any case still `Draft` (incl. everything Phase 3 generated) needs the human promotion step first — **`Draft` cases MUST NOT be included in a regression selection** |
| **APPROVED WITH WARNINGS** | Required gates pass, recommended have minor findings |
| **NEEDS FIXES** | Required gate(s) failed — must address before regression |
| **BLOCKED** | Environment issues prevent verification — investigate env first |

#### 6P. PROMOTE — fold a legacy/handoff run-scoped case set into durable coverage

When Phase 1 resolved a `promotionSource` (or under `--promote-only`), read and follow [`promote.md`](../skills/qa-test-lifecycle/promote.md) — steps 1–6 and the G12 verification. **No-op** without a `promotionSource`; **never runs** under `--ci` or `--report-only`.

---

## Final Report

At close-out, present the run summary in chat as [`report-template.md`](../skills/qa-test-lifecycle/report-template.md) gives it — run id, template, and why nothing is written to disk.
For a `diff` input, save the deploy state now — [`change-sources.md`](../skills/qa-test-lifecycle/change-sources.md) Step 4 (only after Phase 2 completed; never under `--report-only`).

---

## Scope-to-Phase Mapping

| Input | Ph1 Scope | Ph2 Sync | Ph3 Gen | Ph4 Review | Ph5 Verify | Ph6 Approve | Ph6P Promote |
|-------|:---------:|:--------:|:-------:|:----------:|:----------:|:-----------:|:------------:|
| `PR #NNN` | Yes | Yes | Yes | Yes | Yes | Yes | No-op |
| `VCST-XXXX` | Yes | Yes | Yes | Yes | Yes | Yes | **Yes†** |
| `module <name>` | Yes | Yes | Yes | Yes | Yes | Yes | No-op |
| `diff` | Yes | Yes | Skip* | Yes | Yes | Yes | No-op |
| `changelog <ver>` | Yes | Yes | Yes | Yes | Yes | Yes | No-op |
| `suite <ID>` | Yes | Skip | Yes | Yes | Yes | Yes | No-op |
| `domain <name>` | Yes | Skip | Yes | Yes | Yes | Yes | No-op |
| `--skip-sync` | Yes | Skip | Yes | Yes | Yes | Yes | † |
| `--skip-generate` | Yes | Skip | Skip | Yes | Yes | Yes | † |
| `--skip-verify` | Yes | ... | ... | Yes | Skip | Yes* | † |
| `--promote-only` | Yes | Skip | Skip | Skip | Skip | Gates re-derived for G10/G12 only | **Yes†** |
| `--ci` / `--report-only` | Yes | ... | ... | Yes | Skip | Yes | **Never** |

*Diff mode skips generation by default (no gap analysis — only reviews changed cases). G8 gate not evaluated when verify is skipped.
†6P runs only when Phase 1 resolved a `promotionSource` (the ticket's in-suite `Draft` rows, or a legacy run-scoped `test-cases.csv`); otherwise it is a no-op.

---

## CI Integration

Under `--ci`, or before changing `ci/run-full-cycle.ts`, read [`ci-mode.md`](../skills/qa-test-lifecycle/ci-mode.md): the full-cycle pipeline shape and §CI mode behavior, the `--ci` write-scope rules.

---

## Delegation Protocol

**Phases 2-4** — Dispatch to `test-management-specialist` as a single delegation:

```
Delegate to: test-management-specialist
Input:
  - scope: [suite IDs from Phase 1]
  - changeInventory: [from Phase 1, if change-driven]
  - phases: [2,3,4] (or subset based on flags)
  - flags: [every flag of this run, verbatim — incl. --ci, --skip-data, --no-auto-fix, --report-only, --layer <name>]   // --ci narrows the write scope (§4b table)
  - preflight: {the /preflight block's kb hits + doc hits}
  - approved: [items from a previous dispatch's pendingApprovals the user approved — apply exactly these]   // second dispatch only
  - you cannot ask the user: anything this command says to confirm or present for approval (2c deprecate/rewrite,
    the 3c Feature Test Matrix, 4b per-fix under --no-auto-fix, 4b manual items) → return it in pendingApprovals[]
    and do NOT write it. Under --ci, such items are proposals only and are never approved.
  - Observed behaviour: paste the "Observed behaviour" paragraph of `.claude/templates/agent-dispatch.md`
    §Agent Prompt Structure verbatim
  - build:
    - platform: {PlatformVersion from packages.json}
    - theme: {theme version from artifact.json}
    - relevant_modules: {module-name: version}
  - environment:
    - frontend: {FRONT_URL}
    - backend: {BACK_URL}
  - references:
    - config/test-suites.json (suite definitions)
    - regression/suites/ (target CSV files)
    - .claude/skills/qa-review-tests/SKILL.md (canonical dimension set — do not restate it)
    - .claude/skills/qa-review-tests/review-criteria.md
    - .claude/skills/qa-test-cases-generator/test-case-template.md (column contract + Automation_Status meanings)
    - npm run bl:extract (BL-*)
    - .claude/knowledge/oracles/e-commerce-edge-cases-library.md
    - .claude/knowledge/domain/products.md
    - .claude/knowledge/execution/module-suite-map.md
    - .claude/knowledge/domain/sitemap.md
    - .claude/skills/qa-checklist/domain-checklists.md
    - .claude/skills/qa-checklist/backend-admin-checklists.md
    - .claude/skills/qa-checklist/graphql-checklist.md
    - .claude/skills/qa-coverage-gap/feature-domain-map.md
    - .claude/knowledge/api/graphql-schema.md (for GraphQL scopes)
  - VirtoOZ (`/vc-docs`; Context7 fallback), after the kb: domain-specific module behavior

Output: structured JSON with:
  - syncResults: [{caseId, classification, action, before, after}]
  - gapInventory: [{domain, feature, priority, layers}]
  - generatedCases: [{caseId, title, suite, layer, priority}]
  - reviewFindings: [{caseId, dimension, severity, issue, suggestedFix}]
  - fixesApplied: [{caseId, issue, fixAction}]
  - manualItems: [{caseId, issue, dimension}]
  - pendingApprovals: [{caseId, phase, action: deprecate|rewrite|author|fix|manual, diff, reason}]   // unwritten
  - triangulationCandidates: [{caseId, suiteCsv, assertion, why}]   // 4a-bis — the orchestrator triangulates
  - kbEntries: {read: [ids], confirmed: [ids], disputed: [ids], captured: [ids]}
  - blProposals (candidates surfaced this run, fed to Phase 4c): {new: [{proposedId, severity, rule, verify, violationSignal, agents, source, triggeredByCases}], stale: [{id, observedBehavior, affectedCases, bug}]}
  - statistics: {totalCases, synced, generated, findings, autoFixed, manualRemaining}
  - filesModified: [paths]
```

When `pendingApprovals[]` is non-empty (interactive runs): put it to the user, then dispatch again with
`approved` set to what they approved and `phases` limited to the phases those items belong to. Unapproved
items are reported, not written.

**Phase 5** — Dispatch to `qa-testing-expert`:

```
Delegate to: qa-testing-expert
Input:
  - verificationTargets: [{caseId, url, elementsToCheck, stepsToWalk, priority}]
  - groundingTargets: [{caseId, assertion, tag: HYPOTHESIS|SPEC, coordinate}]  // check 6 — every {HYPOTHESIS} / unconfirmed {SPEC} in scope
  - stalenessChecks: [{caseId, reclassification, elementToVerify}]  // from Phase 2
  - Observed behaviour: paste the "Observed behaviour" paragraph of `.claude/templates/agent-dispatch.md`
    §Agent Prompt Structure verbatim
  - file nothing: a refuted assertion goes back as BEHAVIOR_REFUTED, never to a tracker
  - build: {platform, theme, relevant_modules}
  - browser: playwright-firefox (fallback: playwright-edge)
  - environment: {frontend: FRONT_URL, backend: BACK_URL}
  - maxPages: 20
  - maxFlowWalkthroughs: 5
  - timeoutPerPage: 60s
  - totalBudget: 5min
  - evidence: follow `.claude/skills/qa-evidence/evidence-capture-policy.md`

Output: per-case verification:
  - VERIFIED: page loads, elements found, flow reachable
  - CHANGED: element missing/renamed — include screenshot + actual label
  - BROKEN: page error, redirect loop, critical JS errors — include screenshot
  - BLOCKED: precondition can't be met (login fail, feature disabled)
  - BEHAVIOR_CONFIRMED: {caseId, assertion, evidence artifact} — the grounding target holds on this build
  - BEHAVIOR_REFUTED (ENV-008): {caseId, assertion, observed, evidence artifact}
  - kbEntries: {read, confirmed, disputed, captured}
```

---

## Integration with Other Commands

| When | Then |
|------|------|
| Before a regression run with recent code changes | `/qa-test-lifecycle PR #N` or `/qa-test-lifecycle diff` |
| After a platform release | `/qa-test-lifecycle changelog <version>` |
| Quick quality check on a suite | `/qa-test-lifecycle suite <ID> --skip-verify` |
| After `/qa-coverage-gap` | `/qa-test-lifecycle suite <IDs> --skip-sync --skip-generate` (review only) |
| **After a `/qa-test` run authored new cases** | **`/qa-test-lifecycle VCST-XXXX --promote-only --run-id <RUN_ID>`** — `/qa-test` leaves its cases in `regression/suites/` as `Draft`; 6P flips the eligible ones in place (`Draft → Automated` from that run, else `Reviewed` on approval). The same invocation still covers a **legacy** run-scoped `reports/tickets/*/VCST-XXXX/test-cases.csv` |
| After Phase 6 APPROVED | Promote the `Draft` cases (6P when Phase 1 found a promotion source; the human approval step otherwise), then run `/qa-regression <affected suites>` |
| A whole suite's assertions may have gone stale (not tied to one change) | `/qa-review-tests suite <ID> --triangulate` — Dimension 11 wholesale; this pipeline only triangulates the cases a change touched (4a-bis) |
| Which suite is most overdue for triangulation | `/qa-review-tests stale` (or `npm run tc:audit:queue`) |

---

## Rules

- Follow `.claude/skills/qa-evidence/output-paths.md` for artifact output paths and naming conventions
- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, and error handling
- **Agent delegation is mandatory** — do NOT run Phases 2-4 directly in the orchestrator; always dispatch to `test-management-specialist`. One exception: the 4a-bis triangulation, which you run after the dispatch returns, because it dispatches `ba-system-analyzer` and a subagent cannot
- **Division of labour with `/qa-review-tests` — complementary, never competing.** This command owns the
  *pipeline* (what runs when, in which phase, under which gate); the **skill owns the review methodology**
  (the 11 dimensions, their check codes, severities, evidence bars, and auto-fix matrix). When the two
  appear to disagree, **the skill wins on any dimension question** and this file is the bug. Never restate
  the dimension list, a check code's severity, or the triangulation evidence bar here — reference it.
- **`Automation_Status` is a closed, case-sensitive enum** — Phase 2c step 5. Never invent a state.
- **Promotion out of `Draft` is never automatic, and this command is its only performer** — G10 derives
  eligibility, a human / `qa-lead-orchestrator` approves, Phase 6P performs it. `--ci` and `--report-only`
  never promote. `Draft` cases stay out of regression selections.
- **A `/qa-test` hand-off is a record, not an approval** — 6P re-derives eligibility from the CSV
  (`.claude/skills/qa-test-lifecycle/promote.md` step 1); trusting the record would let the author self-certify.
- **The skills own the mechanism, both commands consume it** — `/qa-test-cases-generator` (authoring
  contract), `/qa-review-tests` (dimensions, codes, auto-fix matrix), `/qa-generate-data` → `/qa-seed-data`
  (data prep). Restate none of it here.
- **Never hand-roll a CSV append, and no incoming ID may collide under `regression/suites/`** — the
  appender with `--check-global-ids`, dry-run first, then `suites:sync` + `suites:lint` (`.claude/skills/qa-test-lifecycle/promote.md` step 4).
- **Never delete test cases without user confirmation** — prefer deprecation (`Automation_Status: Deprecated`) over removal
- **Preserve case IDs** — never renumber or reuse IDs. Deprecated cases keep their IDs.
- **Ground via `/preflight lifecycle`** — kb → VirtoOZ, Context7 only as fallback — before updating or generating cases
- **Deduplication** — before generating cases, check target suite and related suites for semantic duplicates
- **One browser at a time** — Phase 5 uses `playwright-firefox` via `qa-testing-expert`; no parallel browser sessions
- **Read URLs from .env** via `config.js`, never hardcode
- **Show diffs** — auto-fix is the default, so updates are written without a per-case prompt but always with a diff summary; pass `--no-auto-fix` to show old vs new and confirm before each write. `--ci` applies all updates non-interactively.
- **Sync metadata** — updated cases must record the sync source and date in the References column
- **Module dependencies matter** — when module X changes, check downstream modules too
- **Don't over-sync** — if a case is VALID (false positive from diff), leave it untouched
- **Environment issues != test case defects** — BROKEN/BLOCKED from Phase 5 may be env problems. Flag for investigation, don't auto-fix blindly.
- **Quality gate is advisory** — deliver the verdict but the user makes the final go/no-go
- **Report always produced in chat** — even with `--report-only`, produce the full report (never a file; §Final Report)
- **Pre-flight before pipeline** — always run `/preflight lifecycle` and include its block in the report
- **GraphQL schema refresh** — when scope includes GraphQL suites, run `npm run schema:refresh` in Pre-Flight and validate all queries/mutations against `.claude/knowledge/api/graphql-schema.md`
- **BL updates run through Phase 4c (`/qa-review-bl`), automatically**, scoped to the `BL-*` this run surfaced — see Phase 4c. Records are env-agnostic.
