---
description: "Full test case lifecycle: detect changes → sync stale cases → analyze gaps → generate → review → fix → verify → approve. Unified pipeline for change-driven sync and quality assurance."
argument-hint: "suite <ID> | domain <name> | VCST-XXXX | PR #NNN | module <name> | diff | changelog <version>"
disable-model-invocation: true
---

# /qa-test-lifecycle — Unified Test Case Pipeline

You are the **Test Case Lifecycle Orchestrator** for Virto Commerce. This command is the single entry point for keeping test cases in sync with code changes AND ensuring they meet quality standards before regression runs. It accepts any input type — from change sources (PRs, modules, diffs) to direct scopes (suites, domains, tickets) — and runs a 6-phase pipeline.

## Usage

```
# Change-driven (detect what changed, sync stale cases, then quality review)
/qa-test-lifecycle PR #123                # From a PR — detect changes, sync affected suites, review quality
/qa-test-lifecycle VCST-1234              # From JIRA ticket (fetch linked PRs/commits)
/qa-test-lifecycle module orders          # After a module update — sync all related suites
/qa-test-lifecycle diff                   # From current git diff / deploy diff
/qa-test-lifecycle changelog 3.850.0     # From a platform release changelog

# Scope-driven (skip change detection, go straight to quality pipeline)
/qa-test-lifecycle suite 04c              # Full pipeline for a specific suite
/qa-test-lifecycle domain orders          # Full pipeline for all suites in a domain
/qa-test-lifecycle suite 06 --skip-sync   # Skip sync, review existing cases only
```

## Flags

| Flag | Effect |
|------|--------|
| `--skip-sync` | Skip Phase 2 (Sync) — assume cases are current, go straight to gap analysis |
| `--skip-generate` | Skip Phases 2-3 (Sync + Analyze/Generate) — start at Phase 4 Review |
| `--skip-data` | Skip the Phase 3 data-prep step (`/qa-generate-data`) — author cases against existing fixtures only, don't design/author new combinations |
| `--skip-verify` | Skip Phase 5 (Environment Verification) — no browser needed |
| `--no-auto-fix` | **Opt OUT** of the default auto-fix — confirm each auto-fixable update individually before it's written. Auto-fix is **on by default**: Phase 4b applies auto-fixable updates without asking (still shows a diff summary). |
| `--layer <name>` | Scope to a specific layer: `api`, `graphql`, `admin`, `storefront`, `e2e` |
| `--report-only` | Run all phases but don't modify any CSV files — output report only |
| `--ci` | CI mode: skip browser verification, apply all updates without confirmation, output machine-readable JSON |

> **BL audit is automatic, not a flag.** Phases 2–3 always collect the `BL-*` a run touches (stale refs + new-rule candidates); **Phase 4c always runs, scoped to exactly those candidates** — triangulating each against docs + live + source via `/qa-review-bl` and auto-applying the confirmed ones. No candidates ⇒ 4c is a no-op. For a broader sweep (a whole domain, not just what this run touched), use standalone `/qa-review-bl domain <name>`. (The former `--update-bl` opt-in flag is retired — the audit is safe by default because it's gated by an **applicable-axes evidence bar** — docs + live + source, with a structurally-unavailable axis such as docs-for-a-new-module *waived*, promoting only when every applicable axis agrees and at least two remain — so there's nothing to opt into.)

---

## Pipeline Overview

```
  Any Input (PR / JIRA / module / diff / changelog / suite / domain)
       │
       ▼
  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
  │ 1. SCOPE │──▶│ 2. SYNC  │──▶│3. ANALYZE│──▶│4. REVIEW │──▶│5. VERIFY │──▶│6. APPROVE│
  │          │   │ & UPDATE │   │& GENERATE│   │ & FIX    │   │          │   │          │
  │ Resolve  │   │ Stale    │   │ Coverage │   │ static   │   │ Live env │   │ Quality  │
  │ scope    │   │ cases    │   │ gaps     │   │ quality  │   │ browser  │   │ gate     │
  └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
  orchestrator   test-mgmt      test-mgmt      test-mgmt      qa-testing     orchestrator
  + GitHub MCP   specialist     specialist     specialist     expert
```

---

## Agent Delegation

| Phase | Agent | Browser | Purpose |
|-------|-------|---------|---------|
| 1. Scope | Orchestrator (you) | Not needed | Parse input, resolve affected suites, build change inventory |
| 2. Sync & Update | `test-management-specialist` | Not needed | Assess staleness via Context7, update stale/broken cases |
| 3. Analyze & Generate | `test-management-specialist` | Not needed | Coverage gap detection, data-prep via `/qa-generate-data` (combination design + gap fixtures), test case creation |
| 4. Review & Fix | `test-management-specialist` | Not needed | `/qa-review-tests` static dimensions (1–7, 9, 10), auto-fix, manual items |
| 5. Verify | `qa-testing-expert` | `playwright-firefox` | Live environment browser verification |
| 6. Approve | Orchestrator (you) | Not needed | Quality gate evaluation, final verdict, report |

---

## Pre-Flight

Before starting the pipeline:

1. **Build & version verification** — fetch deployed versions per `agent-dispatch.md § Build Verification`:
   - Use GitHub MCP to read `backend/packages.json` and `theme/artifact.json` from `VirtoCommerce/vc-deploy-dev` (branch `vcst-qa` by default; use the branch matching `TEST_ENV` for other envs)
   - Record platform version, theme version, and modules relevant to the target scope
   - Include version info in the lifecycle report header (Phase 6)
2. **Duplicate check** — scan `reports/test-lifecycle/` for a `TLC-*` run on the same scope in the last 24 hours. If found, warn user and show previous verdict.
3. **Context7 query** — resolve `/virtocommerce/vc-docs`, query the target domain(s) with `tokens: 8000`. Pass findings to `test-management-specialist`.
4. **GraphQL schema refresh** (when scope includes GraphQL suites or `--layer graphql`):
   - Run `npm run schema:refresh` to introspect the live GraphQL endpoint and update `knowledge/api/graphql-schema.md`
   - Pass `graphql-schema.md` as a reference to `test-management-specialist` in the delegation payload

---

## Phase Details

### Phase 1 — SCOPE (Resolve Input)

Parse any input type to produce a unified scope: **affected suites + change inventory**.

**For change sources (PR, JIRA, module, diff, changelog):**

These inputs trigger Phase 2 (Sync) automatically — code changed, so existing cases may be stale.

**PR (`PR #NNN`):**
1. Run `gh pr view <number> --json title,body,files,labels,mergedAt` to get PR metadata
2. Run `gh pr diff <number> --name-only` to get changed file list
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

**Module (`module <name>`):**
1. Match `<name>` against module names in `knowledge/execution/module-suite-map.md`
2. Query Context7 (`/virtocommerce/vc-docs`) for the module's latest documentation
3. If a specific version is known: check GitHub releases via `gh api repos/VirtoCommerce/vc-module-<name>/releases/latest`

**Diff (`diff`) — detect deployed platform + theme changes:**

Step 1 — Fetch current deploy state via GitHub MCP:
1. `backend/packages.json` — platform version + all module IDs and versions
2. `theme/artifact.json` — theme package URL with version

Use GitHub MCP: `get_file_contents` with `owner: "VirtoCommerce"`, `repo: "vc-deploy-dev"`, `branch: "vcst-qa"` (default; use the branch matching `TEST_ENV` for other envs) for each file.

Step 2 — Compare against last known state:
- Compare with `reports/full-cycle/last-deploy-state.json` (if exists)
- Diff module versions: identify which modules have new versions
- Diff theme version: if changed → theme/UI deployment

Step 3 — Map changes to suites:

| What changed | Affected suites |
|-------------|----------------|
| Backend module version changed | Map module name to suites via `module-suite-map.md` |
| `PlatformVersion` changed | All suites (platform upgrade) — run `critical` selection |
| Theme version changed | Frontend suites |
| Nothing changed | No sync needed — skip Phase 2 |

Step 4 — Save current state:
- Write `reports/full-cycle/last-deploy-state.json` with both files' content

Step 5 — Also check test repo changes:
- `git diff --name-only` for changes to test files in this repo
- Merge with deploy-detected affected suites (deduplicate)

**Changelog (`changelog <version>`):**
1. Query Context7 for release notes for the specified version
2. Search GitHub: `gh api repos/VirtoCommerce/vc-platform/releases/tags/v<version>` for release notes
3. Extract: new features, breaking changes, deprecated APIs, module updates

**For direct scopes (suite, domain):**

These inputs skip Phase 2 by default (no code change to sync against). Use `--skip-sync` is implicit.

- `suite <ID>` → resolve via `config/test-suites.json`
- `domain <name>` → resolve all suites in the domain via `config/test-suites.json` selections

**Phase 1 output — Unified Scope:**
```
{
  "inputType": "change-source | direct-scope",
  "source": "PR #123 | VCST-1234 | module orders | diff | changelog 3.850.0 | suite 04c | domain orders",
  "affectedSuites": ["04a", "04c", "20", "15"],
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

Use `knowledge/execution/module-suite-map.md` to route changes to specific test cases:

1. **Direct mapping** — for each changed module, look up "Must Run" suites
2. **Dependency mapping** — look up "Should Run" suites (downstream dependencies)
3. **Page mapping** — cross-reference `knowledge/domain/sitemap.md`
4. **API mapping** — find cases exercising affected API endpoints
5. **Layer filtering** — if `--layer` flag is set, filter to matching layer

For each affected suite, identify specific cases referencing changed areas and classify:

| Impact Type | Meaning |
|-------------|---------|
| `POTENTIALLY_STALE` | Case references a changed page/API/field — may need updates |
| `LIKELY_BROKEN` | Case references a removed/renamed element or deprecated API |
| `NEW_NEEDED` | New feature/endpoint with no test coverage |
| `UNAFFECTED` | Case in an affected suite but doesn't reference changed areas |

#### 2b. Assess via Context7

Query Context7 (`/virtocommerce/vc-docs`) for each changed module's current behavior:
- API response schemas, required fields, validation rules
- GraphQL query/mutation signatures
- Module configuration options
- Compare documented behavior against test case assertions

Reclassify each case:

| Original | Finding | New Classification |
|----------|---------|-------------------|
| POTENTIALLY_STALE | Element/field still matches | `VALID` — no update |
| POTENTIALLY_STALE | Element renamed/moved | `STALE` — update steps/assertions |
| POTENTIALLY_STALE | New behavior not captured | `INCOMPLETE` — add assertions |
| LIKELY_BROKEN | Page/element/API removed | `BROKEN` — rewrite or deprecate |
| LIKELY_BROKEN | Still works, false positive | `VALID` — no update |

#### 2c. Update Stale Cases

**For STALE cases:**
1. Read current test case from suite CSV
2. Query Context7 for correct current behavior
3. Update Steps and Assertions to match new behavior
4. Preserve: case ID, Title (update if feature name changed), Section, Priority, Business_Rule, Edge_Case_Refs
5. **Leave `Automation_Status` alone.** The legal values are exactly `Draft` | `Reviewed` | `Automated` |
   `Manual` | `Semi-Automated` | `Deprecated` (`test-case-template.md` §Automation_Status, enforced by
   `suites:review` **S-006**). There is no `synced` state — a sync is recorded in `References`, not in the
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
- **Always confirm with user** before deprecating or rewriting

**After updates:**
- Re-run structural validation (CSV format, required fields, ID uniqueness)
- Update `config/test-suites.json` testCount if cases were added/removed

**BL staleness detection (always):**
- For each BL-* referenced by a STALE/BROKEN case, note it as a candidate for the **BL-audit phase** (Phase 4c) — record `{id, currentRule, observedBehavior, sourceOfChange, affectedCases}` so `/qa-review-bl` triangulates it against docs + live + source before any edit.
- Phase 2 itself never edits `business-logic.md`; it only feeds the audit phase. A single-signal staleness note is not confirmation.

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
   - Domain checklist(s) from `domain-checklists.md` / `graphql-checklist.md`
   - BL-* invariants from `business-logic.md`
   - ECL-* patterns from `e-commerce-edge-cases-library.md`
   - Expected coverage from `feature-domain-map.md`
   - Product types and test data from `products.md`
3. Query Context7 (`/virtocommerce/vc-docs`) for domain-relevant topics with `tokens: 8000`
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

1. The skill scopes scenarios → learns live variant space → designs the **combination matrix** (pairwise/all-pairs) → resolves each cell **reuse-first**, authoring only true gaps as `seeded=false` fixtures + `@td()` combination aliases, then runs `validate-td-refs.ts` (green gate).
2. It returns the **combination matrix inline** (Combo IDs + scenario-covered + reuse-vs-gap breakdown) — the on-disk output is the gap fixtures (`test-data/<domain>/*.csv`) + aliases (`aliases.json`). No stray files (honors `.claude/rules/reports.md`).
3. Map each gap (and NEW_NEEDED item) to one or more **Combo IDs** — this mapping drives 3c (one case / case-group per combination).
4. If gap fixtures were authored (`seeded=false`), note in the Phase 6 report that **`/qa-seed-data <domains>` must run before these cases execute live** (reused cells already exist). The skill never provisions.

> Data-prep is **design + author fixtures only** — never provisioning, never editing suite CSVs (the `/qa-generate-data` boundary). Cases written in 3c consume the combinations via `@td(COMBO_ALIAS.field)`.

#### 3c. Generate Test Cases

1. **Deduplication pre-check** — read target suite CSV and related suites. Skip if existing case covers the gap.
   - For each gap, author one case (or case group) **per Combo ID** from 3b; set the `Test_Data` column to `@td(COMBO_ALIAS.field)` — never hardcode the prepared values (`.claude/rules/test-data.md`).
2. **Query Context7** for domain-specific details: API field names, validation rules, GraphQL signatures
3. Generate test cases in enriched 15-column CSV format (1-3 cases per gap)
4. Apply **minimum effective set** principle: clear bug hypothesis, happy path + most likely negative + known edge cases
5. Use layer-specific tags from `test-case-template.md`
6. **GraphQL schema validation** (mandatory for GraphQL cases):
   - Read `knowledge/api/graphql-schema.md`
   - Validate every query/mutation: name exists, args match, `command` wrapper on mutations, response fields match return types
   - If query/mutation doesn't exist in schema → do NOT generate a case for it
7. **BL candidate collection (always):**
   - For each generated case whose gap maps to a testable business rule not already in `business-logic.md`, record a BL **candidate** (`BL-<DOMAIN>-<NNN>` shape, severity, **Rule**/**Verify**/**Violation signal**/**Agents**, `PROPOSED-` prefix, mandatory source).
   - Add to `blProposals.new[]` in the delegation output. Phase 3 does NOT edit `business-logic.md` — candidates are handed to the **BL-audit phase (4c)**, which triangulates each against docs + live + source and auto-applies only the confirmed ones.
8. **Present to user** as Feature Test Matrix for approval before proceeding

---

### Phase 4 — REVIEW & FIX (Quality Assurance)

**Always runs.** Dispatch `test-management-specialist` (continuing delegation).

#### 4a. Static Analysis (`/qa-review-tests` dimensions 1–7, 9, 10)

Reviews ALL cases in scope (existing + updated + newly generated). **The
[`/qa-review-tests` skill](../skills/qa-review-tests/SKILL.md) owns the dimension set — this command
does not restate it.** Read its Review Dimensions table (and `review-criteria.md`) for the checks,
codes, and severities; a restated copy here would drift, and has. Delegate by *dimension number*:

| Dimensions | Where they run in this pipeline |
|------------|-------------------------------|
| **1–7, 9, 10** — structure, determinism, completeness, testability, data validity, BL/ECL + requirement traceability, duplication, technique coverage, assertion grounding | **Here (Phase 4a)**, static, no browser. Start with the deterministic core: `npm run suites:review -- <csv>` (dims 1–7, 9, 10 as exact rules, plus `TRI-000` stamp staleness), then spend LLM effort only on the judgment rules it can't decide |
| **8** — live environment verification | **Phase 5** (`qa-testing-expert`, `playwright-firefox`) |
| **10 (live half)** — grounding `{HYPOTHESIS}`/unconfirmed-`{SPEC}` → `{OBSERVED}` | **Phase 5** — static 4a only *detects* an ungrounded assertion; only the live pass can ground it |
| **11** — behavioral triangulation (*is the asserted behavior still TRUE?*) | **Not run wholesale by this pipeline.** Phase 2's change signal is a *candidate*, not confirmation — see 4a-bis below. A full suite sweep is `/qa-review-tests suite <ID> --triangulate` or its scheduled twin `ci/run-suite-audit.ts` |

Also run, per the skill's Step 3/3.5: `npx tsx scripts/test-data/validate-td-refs.ts` (DV-013…020) and
`npm run graphql:lint-labels -- <csv>` for every GraphQL suite (DV-019).

#### 4a-bis. Behavior rewrites go through the Dimension-11 evidence bar

Phase 2 reclassifies a case as STALE/BROKEN from **one** axis (the change inventory + Context7 docs).
That is enough to justify a *mechanical* update (renamed selector, moved URL, added field), but **not
enough to rewrite what a case asserts happens** — the skill's Dimension 11 requires an agreeing
evidence tuple from every applicable axis (**docs + live + source**) before a DRIFT rewrite lands, and
treats source-vs-live disagreement as CONTRADICTORY (usually deploy lag), never as a rewrite.

So, symmetrically with 4c's handling of `BL-*`:

- A Phase-2 STALE/BROKEN finding that changes only *how* a case is driven → apply in 4b.
- A finding that changes *what behavior is expected* → run `/qa-review-tests --triangulate` **scoped to
  those cases only**, and apply strictly under its auto-fix matrix (CONFIRMED → stamp refresh; DRIFT →
  rewrite the drifted assertion only; MISSING/CONTRADICTORY/UNGROUNDED/RETIRE → report, never write).
- A DRIFT rewrite must keep `{{VAR}}`/`@td()` and assert the structural invariant — never a literal
  price/SKU/URL observed live (DV-016). This is the most likely way an auto-fix does damage.
- On a **legacy untagged case, do not add a provenance tag** to the assertion you rewrote — one tag
  makes the case provenance-adopted and turns every untagged sibling into a GRD-001 High. The row-level
  `Audited:` stamp carries the evidence (`triangulation-criteria.md` §5 rule 4).

#### 4b. Auto-Fix

**Auto-fixable (applied automatically by default; pass `--no-auto-fix` to confirm each individually):**
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

#### 4c. BL Audit (always — scoped to the run's BL candidates)

Run the **BL-audit phase** automatically. Its scope is exactly the `BL-*` this run
surfaced — the `blProposals.new[]` new-rule candidates (Phase 3) + the staleness
candidates (Phase 2). **If neither produced any candidates, 4c is a no-op** (nothing to
audit). It does NOT audit a whole domain — for that, run standalone `/qa-review-bl
domain <name>`. Invoke **`/qa-review-bl`** on the surfaced candidates, delegating to
`ba-system-analyzer` (parallel fan-out, single-writer apply):

- Each candidate `BL-*` is triangulated against the three axes — **docs + live + source code**.
- **Evidence bar = applicable-axes.** An axis that is *structurally unavailable* is **waived (N/A)**, not counted as a miss — most importantly, a **brand-new / undocumented / pre-GA module has no docs**, so the docs axis is waived. The bar is then the axes that CAN be verified, and **at least two must remain** (a single surviving axis is never enough to canonicalize).
- **CONFIRMED / DRIFT / MISSING** → auto-applied to `business-logic.md` (body-only, `Amended:`/`Promoted:`+`Source:` stamp, env-agnostic) **only when every applicable (non-waived) axis is met AND the axes agree**.
- **Held as a draft (not applied)** when an applicable axis **contradicts** another — e.g. live shows the opposite of source, commonly a **deploy-lag artifact** (the fix is merged but not on the pinned build) — or when an applicable axis is **unverifiable this run** (e.g. blocked on a missing fixture). A contradiction/gap is not a failure; it is a *not-yet*.
- **CONTRADICTORY / UNGROUNDED / STALE-RETIRE**, plus any candidate that fails the applicable-axes bar → drafted to `reports/ba/bl-proposals-<date>.md`, each with its evidence + a **re-audit trigger** (the concrete condition that would let it promote later — docs published, module on a stable release, the contradicting fix deployed, or the blocking fixture authored). Retiring is never auto-applied.
- The run's `reports/knowledge/BL-AUDIT-<date>.md` is the audit trail; its outcome feeds the Phase 6 **G6** gate.

This is gated by an **evidence bar, not human approval** — the **applicable-axes** rule above (docs + live + source when all three exist; the verifiable subset, minimum two and all agreeing, when an axis is structurally waived). See the `/qa-review-bl` skill + `.claude/rules/quality-gates.md`.

---

### Phase 5 — VERIFY (Live Environment Check)

**Runs when:** Not skipped by `--skip-verify` or `--ci`. Dispatch `qa-testing-expert` with `playwright-firefox` (fallback: `playwright-edge`).

**Pre-flight:** `/qa-env-check endpoints` — if environment unhealthy, skip with warning.

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
|---------|----------|--------|
| VERIFIED | — | Test case is environment-compatible |
| CHANGED | Critical | Element renamed/moved → auto-fix label |
| BROKEN | Blocker | Page error or flow blocked → investigate |
| BLOCKED | High | Precondition can't be met → may be env issue |
| **Behavior CONFIRMED** | — | Upgrade that assertion's provenance tag to `{OBSERVED}` (clears GRD-001) |
| **Behavior REFUTED** | Critical | **ENV-008** — the asserted behavior isn't implemented. Rewrite to the observed behavior + `{OBSERVED}`, or drop the assertion. **Never** upgrade the tag. |

Screenshots captured for every CHANGED/BROKEN/BLOCKED finding.

---

### Phase 6 — APPROVE (Quality Gate & Report)

The orchestrator (you) evaluates all phases:

#### Quality Gates

| Gate | Criteria | Required |
|------|----------|----------|
| G1: Structure | 0 Blocker findings | Yes |
| G2: Determinism | 0 Critical findings | Yes |
| G3: Completeness | <=3 High findings | Yes |
| G4: Testability | 0 Critical findings | Yes |
| G5: Data Validity | 0 Critical/Blocker findings | Yes |
| G6: Coverage | BL-* mapping >= 80% for P0/P1 cases; **and (if 4c surfaced candidates) the BL-audit left 0 CONTRADICTORY invariants unresolved** | Recommended |
| G7: Duplication | No same-layer duplicates | Recommended |
| G8: Environment | 0 BROKEN findings | Yes (if verified) |
| G9: Sync | All STALE cases updated, all BROKEN addressed | Yes (if synced) |
| G10: Assertion Grounding | **0 GRD-001 Blocker/High** + 0 ENV-008. Provenance is **opt-in per case**: a fully-untagged *legacy* case is Informational only (it does not fail this gate), but once a case is **provenance-adopted** (any assertion tagged — i.e. everything Phase 3 generated or Phase 2/4 touched) an untagged sibling is **High** and a `{HYPOTHESIS}` in a past-`Draft` case is a **Blocker** | Yes |
| G11: Technique Coverage | No feature group (≥3 cases) missing the positive + negative + boundary mix (TC-001) | Recommended |

**G10 is the promotion gate, not a nice-to-have.** Per the skill's promotion rule + `test-case-template.md`
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

---

## Final Report

Generate run ID: `TLC-YYYY-MM-DD-HHMM` — used only to label the summary below and any gitignored Phase 5
screenshots (`reports/test-lifecycle/TLC-YYYY-MM-DD-HHMM/`, screenshots only). Per `.claude/rules/reports.md`
§1, this run summary is **terminal-only** — present it directly in your final chat response, do not write a
`lifecycle-report.md` or `lifecycle-summary.json` file to disk.

### Terminal summary (present in chat — do not write to disk)

```markdown
# Test Case Lifecycle Report — {RUN_ID}

## Summary
- **Input:** [original input]
- **Input Type:** change-source | direct-scope
- **Date:** YYYY-MM-DD HH:MM
- **Platform:** [PlatformVersion from packages.json]
- **Theme:** [theme version from artifact.json]
- **Module Versions:** [relevant modules with versions]
- **Verdict:** APPROVED | APPROVED WITH WARNINGS | NEEDS FIXES | BLOCKED

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | N suites affected, input type: X |
| 2. Sync | test-management-specialist | Done/Skipped | N stale updated, M broken addressed |
| 3. Analyze & Generate | test-management-specialist | Done/Skipped | N gaps found, M cases created |
| 4. Review & Fix | test-management-specialist | Done | N findings (B: X, C: Y, H: Z, M: W) |
| 5. Verify | qa-testing-expert | Done/Skipped | N verified, X changed, Y broken |
| 6. Approve | orchestrator | **VERDICT** | Gates: N/M passed |

## Change Inventory (if change-driven)
| Module | Layer | Files Changed | Breaking | New Features |
|--------|-------|--------------|----------|-------------|

## Sync Results (if Phase 2 ran)
| Case ID | Suite | Classification | Action | Before | After |
|---------|-------|---------------|--------|--------|-------|

## Coverage Delta (if Phase 3 ran)

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Total cases | N | M | +X |
| BL-* coverage | X% | Y% | +Z% |
| P0 case count | N | M | +X |

## New Cases Generated
| Case ID | Suite | Title | Layer | Priority |

## Context7 Documentation Findings
| Module | Topic Queried | Behavior Change Detected | Cases Influenced |

## Quality Gates

| Gate | Status | Details |
|------|--------|---------|
| G1-G11 | PASS/FAIL/WARN/SKIP | ... |

## Environment Verification (if Phase 5 ran)

| Case ID | URL | Check | Result | Screenshot |
|---------|-----|-------|--------|------------|

## Remaining Items

### Must Fix (blocks regression)
| Case ID | Issue | Dimension | Suggested Fix |

### Should Fix (improves quality)
| Case ID | Issue | Dimension | Suggested Fix |

## Files Modified
- [list of CSV files with change summary]

## BL Audit (when the run surfaced BL candidates)
- Triangulated K invariants — X CONFIRMED/DRIFT/MISSING **auto-applied** to `business-logic.md`; Y drafted to `reports/ba/bl-proposals-<date>.md` (unconfirmed/contradictory/retire). Audit trail: `reports/knowledge/BL-AUDIT-<date>.md`. (Omit this section if 4c had no candidates.)

## Next Steps
- [ ] Address "Must Fix" items
- [ ] Run `/qa-regression` with reviewed suite(s)
- [ ] File JIRA tickets for environment issues
- [ ] Review `reports/ba/bl-proposals-<date>.md` — the items the audit could NOT confirm (human decision); confirmed items already landed in `business-logic.md`
```

### `bl-proposals.md` (only when 4c could not confirm an item)

```markdown
# Business Logic Proposals — {RUN_ID}

These are drafts. They are NOT applied to `knowledge/oracles/business-logic.md`.
Review, edit as needed, assign final `BL-*` IDs, and commit manually.

## New Invariants Proposed

### PROPOSED-BL-<DOMAIN>-<NNN>: <short title> `[P0-revenue | P1-data | P2-ux]`
- **Rule:** ...
- **Verify:** ...
- **Violation signal:** ...
- **Agents:** ...
- **Source:** JIRA VCST-XXXX AC#3 | Context7 query on /virtocommerce/vc-docs:<topic> | changelog 3.850.0 | PR #NNN
- **Triggered by case(s):** [TC-IDs that exposed the gap]

## Stale BL-* Flagged

### BL-<DOMAIN>-<NNN>: <existing title>
- **Current Rule:** [as written today]
- **Observed behavior:** [what Context7 / the change inventory shows instead]
- **Source of change:** [PR / changelog / Context7 quote]
- **Affected cases:** [TC-IDs still referencing this BL]
- **Suggested action:** update Rule / deprecate / split into two invariants
```

No `lifecycle-summary.json` is written either — nothing downstream parses it today (CI's `run-full-cycle.ts`
already consumes this agent's returned chat text directly, not a file), so the structured fields above
(`gateResults`, `casesAnalyzed`, etc.) go in the terminal summary's tables, not a separate JSON artifact.

---

## Scope-to-Phase Mapping

| Input | Ph1 Scope | Ph2 Sync | Ph3 Gen | Ph4 Review | Ph5 Verify | Ph6 Approve |
|-------|:---------:|:--------:|:-------:|:----------:|:----------:|:-----------:|
| `PR #NNN` | Yes | Yes | Yes | Yes | Yes | Yes |
| `VCST-XXXX` | Yes | Yes | Yes | Yes | Yes | Yes |
| `module <name>` | Yes | Yes | Yes | Yes | Yes | Yes |
| `diff` | Yes | Yes | Skip* | Yes | Yes | Yes |
| `changelog <ver>` | Yes | Yes | Yes | Yes | Yes | Yes |
| `suite <ID>` | Yes | Skip | Yes | Yes | Yes | Yes |
| `domain <name>` | Yes | Skip | Yes | Yes | Yes | Yes |
| `--skip-sync` | Yes | Skip | Yes | Yes | Yes | Yes |
| `--skip-generate` | Yes | Skip | Skip | Yes | Yes | Yes |
| `--skip-verify` | Yes | ... | ... | Yes | Skip | Yes* |

*Diff mode skips generation by default (no gap analysis — only reviews changed cases). G8 gate not evaluated when verify is skipped.

---

## CI Integration

### Full Cycle Pipeline (`ci/run-full-cycle.ts`)

In CI mode, `/qa-test-lifecycle --ci` replaces the old 2-command flow — `/qa-sync-tests` was **removed**
(its command file is deleted, not aliased), so both change-driven sync and standalone review are this one
command at different scopes:

```
PR merged → ci/run-full-cycle.ts
              │
              ├─ Phase 1: SCOPE + SYNC + REVIEW          [runs unless SKIP_SYNC]
              │   → /qa-test-lifecycle {CHANGE_SOURCE} --ci --skip-generate --skip-verify
              │   → emits AFFECTED_SUITES: <ids> for Phase 3
              │
              ├─ Phase 2: REVIEW ONLY                    [runs ONLY when SKIP_SYNC=true]
              │   → /qa-test-lifecycle suite <ids> --ci --skip-sync --skip-generate --skip-verify
              │
              └─ Phase 3: REGRESSION (run affected suites)
                  → Delegates to ci/run-regression.ts
```

**Phases 1 and 2 are mutually exclusive.** Phase 4 (Review) always runs inside this command, so a
change-driven Phase 1 has already reviewed the suites it synced — re-running the review as Phase 2
would only pay for it twice. Consequence: `SKIP_LIFECYCLE` skips the **standalone** review pass only.
There is no "sync without reviewing" mode, because this command has none.

Neither CI phase generates cases (`--skip-generate`) or verifies live (`--skip-verify`, no browser in
CI) — so **CI can never clear GRD-001**, and any case it touches that carries an ungrounded assertion
stays `Draft` (G10 unmet) until an interactive `--verify` run grounds it.

### npm scripts

```bash
npm run ci:cycle                                    # Full cycle (requires CHANGE_SOURCE env var)
CHANGE_SOURCE="PR #123" npm run ci:cycle            # Full cycle for a PR
CHANGE_SOURCE="diff" npm run ci:cycle:sync-only     # Sync only (Phases 1-2, no review/regression)
SUITE_SELECTION=critical npm run ci:cycle:no-sync    # Skip sync, run review+regression on critical suites
```

### CI mode behavior (`--ci`)

When `--ci` flag is set:
- Phase 5 (browser verification) is skipped automatically
- Output includes machine-readable JSON block for pipeline parsing
- No interactive prompts
- **The confirmation is replaced by PR review, and the write scope NARROWS — it does not widen.** `--ci`
  holds a *narrower* privilege than an interactive run: it may write only what the deterministic linter
  proved or what agreeing axes confirmed (see the Phase-4b write-scope table). It **never** promotes
  `Automation_Status` out of `Draft`, **never** deprecates a case, and **never** writes a Dim-11
  MISSING / CONTRADICTORY / UNGROUNDED / RETIRE verdict.
- Because Phase 5 is skipped, `--ci` **cannot ground a `{HYPOTHESIS}`/`{SPEC}` assertion** — a suite
  generated in the same `--ci` run stays `Draft` (G10 unmet) and is not regression-eligible until a
  later `--verify` pass grounds it.

---

## Delegation Protocol

**Phases 2-4** — Dispatch to `test-management-specialist` as a single delegation:

```
Delegate to: test-management-specialist
Input:
  - scope: [suite IDs from Phase 1]
  - changeInventory: [from Phase 1, if change-driven]
  - phases: [2,3,4] (or subset based on flags)
  - flags: [--no-auto-fix | --report-only | --layer <name>]   // auto-fix is the default; pass --no-auto-fix to require per-fix confirmation
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
    - skills/qa-review-tests/SKILL.md (canonical dimension set — do not restate it)
    - skills/qa-review-tests/review-criteria.md
    - skills/qa-review-tests/triangulation-criteria.md (only when 4a-bis triangulates a behavior rewrite)
    - skills/qa-test-cases-generator/test-case-template.md (column contract + Automation_Status enum)
    - knowledge/oracles/business-logic.md
    - knowledge/oracles/e-commerce-edge-cases-library.md
    - knowledge/domain/products.md
    - knowledge/execution/module-suite-map.md
    - knowledge/domain/sitemap.md
    - skills/qa-checklist/domain-checklists.md
    - skills/qa-checklist/backend-admin-checklists.md
    - skills/qa-checklist/graphql-checklist.md
    - skills/qa-coverage-gap/feature-domain-map.md
    - knowledge/api/graphql-schema.md (for GraphQL scopes)
  - context7: query `/virtocommerce/vc-docs` for domain-specific module behavior

Output: structured JSON with:
  - syncResults: [{caseId, classification, action, before, after}]
  - gapInventory: [{domain, feature, priority, layers}]
  - generatedCases: [{caseId, title, suite, layer, priority}]
  - reviewFindings: [{caseId, dimension, severity, issue, suggestedFix}]
  - fixesApplied: [{caseId, issue, fixAction}]
  - manualItems: [{caseId, issue, dimension}]
  - blProposals (candidates surfaced this run, fed to Phase 4c): {new: [{proposedId, severity, rule, verify, violationSignal, agents, source, triggeredByCases}], stale: [{id, currentRule, observedBehavior, source, affectedCases, suggestedAction}]}
  - statistics: {totalCases, synced, generated, findings, autoFixed, manualRemaining}
  - filesModified: [paths]
```

**Phase 5** — Dispatch to `qa-testing-expert`:

```
Delegate to: qa-testing-expert
Input:
  - verificationTargets: [{caseId, url, elementsToCheck, stepsToWalk, priority}]
  - stalenessChecks: [{caseId, reclassification, elementToVerify}]  // from Phase 2
  - build: {platform, theme, relevant_modules}
  - browser: playwright-firefox (fallback: playwright-edge)
  - environment: {frontend: FRONT_URL, backend: BACK_URL}
  - maxPages: 20
  - maxFlowWalkthroughs: 5
  - timeoutPerPage: 60s
  - totalBudget: 5min
  - evidence: follow `skills/qa-evidence/evidence-capture-policy.md`

Output: per-case verification:
  - VERIFIED: page loads, elements found, flow reachable
  - CHANGED: element missing/renamed — include screenshot + actual label
  - BROKEN: page error, redirect loop, critical JS errors — include screenshot
  - BLOCKED: precondition can't be met (login fail, feature disabled)
```

---

## Integration with Other Commands

| When | Then |
|------|------|
| Before a regression run with recent code changes | `/qa-test-lifecycle PR #N` or `/qa-test-lifecycle diff` |
| After a platform release | `/qa-test-lifecycle changelog <version>` |
| Quick quality check on a suite | `/qa-test-lifecycle suite <ID> --skip-verify` |
| After `/qa-coverage-generation` | `/qa-test-lifecycle suite <IDs> --skip-sync --skip-generate` (review only) |
| After Phase 6 APPROVED | Promote the `Draft` cases (human step), then run `/qa-regression <affected suites>` |
| A whole suite's assertions may have gone stale (not tied to one change) | `/qa-review-tests suite <ID> --triangulate` — Dimension 11 wholesale; this pipeline only triangulates the cases a change touched (4a-bis) |
| Which suite is most overdue for triangulation | `/qa-review-tests stale` (or `npm run tc:audit:queue`) |

---

## Rules

- Follow `skills/qa-evidence/output-paths.md` for artifact output paths and naming conventions
- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, and error handling
- **Agent delegation is mandatory** — do NOT run Phases 2-4 directly in the orchestrator; always dispatch to `test-management-specialist`
- **Division of labour with `/qa-review-tests` — complementary, never competing.** This command owns the
  *pipeline* (what runs when, in which phase, under which gate); the **skill owns the review methodology**
  (the 11 dimensions, their check codes, severities, evidence bars, and auto-fix matrix). When the two
  appear to disagree, **the skill wins on any dimension question** and this file is the bug. Never restate
  the dimension list, a check code's severity, or the triangulation evidence bar here — reference it.
- **`Automation_Status` is a closed, case-sensitive enum** — `Draft` | `Reviewed` | `Automated` | `Manual` |
  `Semi-Automated` | `Deprecated` (`test-case-template.md`, gated by `suites:review` S-006). Never invent a
  state (`synced` is not one); a sync is recorded in `References`.
- **Promotion out of `Draft` is never automatic** — it needs 0 GRD-001 plus explicit human/`qa-lead-orchestrator`
  approval. This pipeline reports *eligibility* (G10), it does not promote. `Draft` cases stay out of regression selections.
- **Never delete test cases without user confirmation** — prefer deprecation (`Automation_Status: Deprecated`) over removal
- **Preserve case IDs** — never renumber or reuse IDs. Deprecated cases keep their IDs.
- **Context7 is mandatory** — always query `/virtocommerce/vc-docs` for current module behavior before updating or generating cases
- **Deduplication** — before generating cases, check target suite and related suites for semantic duplicates
- **One browser at a time** — Phase 5 uses `playwright-firefox` via `qa-testing-expert`; no parallel browser sessions
- **Read URLs from .env** via `config.js`, never hardcode
- **Show diffs** — auto-fix is the default, so updates are written without a per-case prompt but always with a diff summary; pass `--no-auto-fix` to show old vs new and confirm before each write. `--ci` applies all updates non-interactively.
- **Sync metadata** — updated cases must record the sync source and date in the References column
- **Module dependencies matter** — when module X changes, check downstream modules too
- **Don't over-sync** — if a case is VALID (false positive from diff), leave it untouched
- **Environment issues != test case defects** — BROKEN/BLOCKED from Phase 5 may be env problems. Flag for investigation, don't auto-fix blindly.
- **Quality gate is advisory** — deliver the verdict but the user makes the final go/no-go
- **Report always written** — even with `--report-only`, produce the full report
- **Build verification before pipeline** — always run pre-flight build verification and include version info in report
- **GraphQL schema refresh** — when scope includes GraphQL suites, run `npm run schema:refresh` in Pre-Flight and validate all queries/mutations against `graphql-schema.md`
- **BL updates run through the audit (Phase 4c → `/qa-review-bl`), automatically.** Phase 4c always runs, scoped to the `BL-*` this run surfaced (no candidates ⇒ no-op); there is no opt-in flag. Auto-apply is gated by an **applicable-axes evidence bar, not human approval**: triangulate **docs + live + source**; an axis that is *structurally unavailable* (e.g. **no docs for a new / undocumented / pre-GA module**) is **waived (N/A)**, and a candidate is **auto-applied (body-only, env-agnostic) only when every applicable axis is met and the axes agree** (at least two must remain; a lone axis is never enough). A candidate whose applicable axes **disagree** (e.g. live contradicts source — commonly deploy lag: a merged fix not yet on the pinned artifact) or that has an **unverifiable** axis this run (blocked on a fixture) is **held as a draft** in `reports/ba/bl-proposals-<date>.md` with a **re-audit trigger** — not applied, not a failure. Every entry — applied or drafted — cites its sources; env-agnostic, no env names/URLs/slugs.
