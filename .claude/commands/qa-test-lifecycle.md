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
| `--skip-verify` | Skip Phase 5 (Environment Verification) — no browser needed |
| `--auto-fix` | Apply auto-fixable updates without asking for each one (still shows diff summary) |
| `--layer <name>` | Scope to a specific layer: `api`, `graphql`, `admin`, `storefront`, `e2e` |
| `--report-only` | Run all phases but don't modify any CSV files — output report only |
| `--ci` | CI mode: skip browser verification, apply all updates without confirmation, output machine-readable JSON |
| `--update-bl` | Draft proposed additions/updates to `business-logic.md` — new invariants from change inventory/Context7/JIRA ACs, plus stale BL-* whose Rule contradicts current behavior. Output goes to `reports/test-lifecycle/TLC-*/bl-proposals.md`; never auto-applied to the knowledge file. |

---

## Pipeline Overview

```
  Any Input (PR / JIRA / module / diff / changelog / suite / domain)
       │
       ▼
  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
  │ 1. SCOPE │──▶│ 2. SYNC  │──▶│3. ANALYZE│──▶│4. REVIEW │──▶│5. VERIFY │──▶│6. APPROVE│
  │          │   │ & UPDATE │   │& GENERATE│   │ & FIX    │   │          │   │          │
  │ Resolve  │   │ Stale    │   │ Coverage │   │ 7-dim    │   │ Live env │   │ Quality  │
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
| 3. Analyze & Generate | `test-management-specialist` | Not needed | Coverage gap detection, test case creation |
| 4. Review & Fix | `test-management-specialist` | Not needed | 7-dimension quality review, auto-fix, manual items |
| 5. Verify | `qa-testing-expert` | `playwright-firefox` | Live environment browser verification |
| 6. Approve | Orchestrator (you) | Not needed | Quality gate evaluation, final verdict, report |

---

## Pre-Flight

Before starting the pipeline:

1. **Build & version verification** — fetch deployed versions per `agent-dispatch.md § Build Verification`:
   - Use GitHub MCP to read `backend/packages.json` and `theme/artifact.json` from `VirtoCommerce/vc-deploy-dev` (branch `vcst-qa`)
   - Record platform version, theme version, and modules relevant to the target scope
   - Include version info in the lifecycle report header (Phase 6)
2. **Duplicate check** — scan `reports/test-lifecycle/` for a `TLC-*` run on the same scope in the last 24 hours. If found, warn user and show previous verdict.
3. **Context7 query** — resolve `/virtocommerce/vc-docs`, query the target domain(s) with `tokens: 8000`. Pass findings to `test-management-specialist`.
4. **GraphQL schema refresh** (when scope includes GraphQL suites or `--layer graphql`):
   - Run `npm run schema:refresh` to introspect the live GraphQL endpoint and update `.claude/agents/knowledge/graphql-schema.md`
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
1. Match `<name>` against module names in `.claude/agents/knowledge/module-suite-map.md`
2. Query Context7 (`/virtocommerce/vc-docs`) for the module's latest documentation
3. If a specific version is known: check GitHub releases via `gh api repos/VirtoCommerce/vc-module-<name>/releases/latest`

**Diff (`diff`) — detect deployed platform + theme changes:**

Step 1 — Fetch current deploy state via GitHub MCP:
1. `backend/packages.json` — platform version + all module IDs and versions
2. `theme/artifact.json` — theme package URL with version

Use GitHub MCP: `get_file_contents` with `owner: "VirtoCommerce"`, `repo: "vc-deploy-dev"`, `branch: "vcst-qa"` for each file.

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

Use `.claude/agents/knowledge/module-suite-map.md` to route changes to specific test cases:

1. **Direct mapping** — for each changed module, look up "Must Run" suites
2. **Dependency mapping** — look up "Should Run" suites (downstream dependencies)
3. **Page mapping** — cross-reference `.claude/agents/knowledge/sitemap.md`
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
5. Set `Automation_Status` to `synced`
6. Add to References: `"Synced: {source} ({date})"`

**For INCOMPLETE cases:**
- Add new assertions for changed/added behavior
- Add new Cross_Layer_Checks if change spans layers
- Update Failure_Signals for new failure modes

**For BROKEN cases:**
- Feature removed → mark `Automation_Status: deprecated`, add note to References
- Feature replaced → rewrite for replacement
- Feature split → generate separate cases
- **Always confirm with user** before deprecating or rewriting

**After updates:**
- Re-run structural validation (CSV format, required fields, ID uniqueness)
- Update `config/test-suites.json` testCount if cases were added/removed

**BL staleness detection (when `--update-bl` is set):**
- For each BL-* referenced by a STALE/BROKEN case, compare the BL Rule against the Context7 finding that drove the reclassification.
- If the Rule no longer holds (e.g., behavior changed, field renamed, threshold moved), add an entry to `blProposals.stale[]` with: `{id, currentRule, observedBehavior, sourceOfChange, affectedCases}`.
- Never modify `business-logic.md` directly — proposals are drafts only.

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

#### 3b. Generate Test Cases

1. **Deduplication pre-check** — read target suite CSV and related suites. Skip if existing case covers the gap.
2. **Query Context7** for domain-specific details: API field names, validation rules, GraphQL signatures
3. Generate test cases in enriched 15-column CSV format (1-3 cases per gap)
4. Apply **minimum effective set** principle: clear bug hypothesis, happy path + most likely negative + known edge cases
5. Use layer-specific tags from `test-case-template.md`
6. **GraphQL schema validation** (mandatory for GraphQL cases):
   - Read `agents/knowledge/graphql-schema.md`
   - Validate every query/mutation: name exists, args match, `command` wrapper on mutations, response fields match return types
   - If query/mutation doesn't exist in schema → do NOT generate a case for it
7. **BL proposal drafting (when `--update-bl` is set):**
   - For each generated case whose gap maps to a testable business rule not already in `business-logic.md`, draft a new BL entry.
   - Draft must follow the existing format: `BL-<DOMAIN>-<NNN>`, severity tag, **Rule**, **Verify**, **Violation signal**, **Agents**.
   - Pick the next available number per domain; mark proposed IDs with a `PROPOSED-` prefix (e.g., `PROPOSED-BL-CART-009`) until the user assigns the final ID.
   - Source each draft: JIRA AC / Context7 quote / changelog entry / PR description. No unsourced drafts.
   - Add to `blProposals.new[]` in the delegation output — do not write to `business-logic.md`.
8. **Present to user** as Feature Test Matrix for approval before proceeding

---

### Phase 4 — REVIEW & FIX (Quality Assurance)

**Always runs.** Dispatch `test-management-specialist` (continuing delegation).

#### 4a. 7-Dimension Static Analysis

Reviews ALL cases in scope (existing + updated + newly generated):

1. **Structure** — CSV format, IDs, required fields
2. **Determinism** — Step tags, specific element refs, no ambiguity
3. **Completeness** — Preconditions, assertions, failure signals, cleanup, `errors[]` checks
4. **Testability** — Falsifiable assertions, no vague predicates
5. **Data Validity** — Valid `{{VAR}}` tokens, no hardcoded URLs/creds; GraphQL suites: schema validation (DV-006–DV-011)
6. **BL/ECL Coverage** — Business rule and edge case traceability
7. **Duplication** — Cross-suite overlap detection

#### 4b. Auto-Fix

**Auto-fixable (applied with confirmation or `--auto-fix`):**
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

After fixes: re-run structure validation to confirm no regressions.

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
6. **Staleness spot-checks** (change-driven only) — verify STALE/BROKEN reclassifications from Phase 2 against live env

**Result classification:**

| Finding | Severity | Action |
|---------|----------|--------|
| VERIFIED | — | Test case is environment-compatible |
| CHANGED | Critical | Element renamed/moved → auto-fix label |
| BROKEN | Blocker | Page error or flow blocked → investigate |
| BLOCKED | High | Precondition can't be met → may be env issue |

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
| G6: Coverage | BL-* mapping >= 80% for P0/P1 cases | Recommended |
| G7: Duplication | No same-layer duplicates | Recommended |
| G8: Environment | 0 BROKEN findings | Yes (if verified) |
| G9: Sync | All STALE cases updated, all BROKEN addressed | Yes (if synced) |

#### Verdicts

| Verdict | Meaning |
|---------|---------|
| **APPROVED** | All required gates pass — ready for `/qa-regression` |
| **APPROVED WITH WARNINGS** | Required gates pass, recommended have minor findings |
| **NEEDS FIXES** | Required gate(s) failed — must address before regression |
| **BLOCKED** | Environment issues prevent verification — investigate env first |

---

## Final Report

Generate run ID: `TLC-YYYY-MM-DD-HHMM`
Write to `reports/test-lifecycle/TLC-YYYY-MM-DD-HHMM/`:

### `lifecycle-report.md`

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
| G1-G9 | PASS/FAIL/WARN/SKIP | ... |

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

## Business Logic Proposals (if `--update-bl`)
- Drafted N new invariants, M stale BL-* flagged — see `bl-proposals.md` in this run directory.
- These are **drafts for review**. Nothing was written to `business-logic.md`. Approve/edit and apply manually.

## Next Steps
- [ ] Address "Must Fix" items
- [ ] Run `/qa-regression` with reviewed suite(s)
- [ ] File JIRA tickets for environment issues
- [ ] Review `bl-proposals.md` and fold approved entries into `business-logic.md` (if `--update-bl` ran)
```

### `bl-proposals.md` (only when `--update-bl` ran)

```markdown
# Business Logic Proposals — {RUN_ID}

These are drafts. They are NOT applied to `.claude/agents/knowledge/business-logic.md`.
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

### `lifecycle-summary.json`

```json
{
  "runId": "TLC-YYYY-MM-DD-HHMM",
  "inputType": "change-source | direct-scope",
  "source": "PR #123",
  "date": "YYYY-MM-DD",
  "verdict": "APPROVED",
  "changedModules": ["Orders", "Cart"],
  "affectedSuites": ["04a", "04c", "20"],
  "casesAnalyzed": 145,
  "casesSynced": 12,
  "casesGenerated": 5,
  "casesReviewed": 150,
  "casesVerified": 20,
  "filesModified": ["regression/suites/..."],
  "gateResults": {"G1": "PASS", "G2": "PASS", ...},
  "blProposals": {
    "new": [{"proposedId": "PROPOSED-BL-CART-009", "severity": "P1-data", "rule": "...", "source": "..."}],
    "stale": [{"id": "BL-ORD-002", "observedBehavior": "...", "source": "..."}]
  }
}
```

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

In CI mode, `/qa-test-lifecycle` with `--ci` replaces the old 2-command flow. The pipeline is now:

```
PR merged → ci/run-full-cycle.ts
              │
              ├─ Phase 1: SCOPE + SYNC (detect changes, update stale cases)
              │   → Formerly: /qa-sync-tests --ci
              │
              ├─ Phase 2: ANALYZE + REVIEW (gap analysis + quality check)
              │   → Formerly: /qa-test-lifecycle --skip-generate --skip-verify
              │
              └─ Phase 3: REGRESSION (run affected suites)
                  → Delegates to ci/run-regression.ts
```

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
- All updates applied without user confirmation
- Output includes machine-readable JSON block for pipeline parsing
- No interactive prompts

---

## Delegation Protocol

**Phases 2-4** — Dispatch to `test-management-specialist` as a single delegation:

```
Delegate to: test-management-specialist
Input:
  - scope: [suite IDs from Phase 1]
  - changeInventory: [from Phase 1, if change-driven]
  - phases: [2,3,4] (or subset based on flags)
  - flags: [--auto-fix | --report-only | --layer <name>]
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
    - .claude/skills/testing/qa-review-tests/review-criteria.md
    - .claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md
    - .claude/agents/knowledge/business-logic.md
    - .claude/agents/knowledge/e-commerce-edge-cases-library.md
    - .claude/agents/knowledge/products.md
    - .claude/agents/knowledge/module-suite-map.md
    - .claude/agents/knowledge/sitemap.md
    - .claude/skills/testing/qa-checklist/domain-checklists.md
    - .claude/skills/testing/qa-checklist/backend-admin-checklists.md
    - .claude/skills/testing/qa-checklist/graphql-checklist.md
    - .claude/skills/testing/qa-coverage-gap/feature-domain-map.md
    - .claude/agents/knowledge/graphql-schema.md (for GraphQL scopes)
  - context7: query `/virtocommerce/vc-docs` for domain-specific module behavior

Output: structured JSON with:
  - syncResults: [{caseId, classification, action, before, after}]
  - gapInventory: [{domain, feature, priority, layers}]
  - generatedCases: [{caseId, title, suite, layer, priority}]
  - reviewFindings: [{caseId, dimension, severity, issue, suggestedFix}]
  - fixesApplied: [{caseId, issue, fixAction}]
  - manualItems: [{caseId, issue, dimension}]
  - blProposals (only when --update-bl): {new: [{proposedId, severity, rule, verify, violationSignal, agents, source, triggeredByCases}], stale: [{id, currentRule, observedBehavior, source, affectedCases, suggestedAction}]}
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
  - evidence: follow `.claude/skills/qa-methodology/qa-evidence/evidence-capture-policy.md`

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
| After Phase 6 APPROVED | Run `/qa-regression <affected suites>` |

---

## Rules

- Follow `.claude/skills/qa-methodology/qa-evidence/output-paths.md` for artifact output paths and naming conventions
- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, and error handling
- **Agent delegation is mandatory** — do NOT run Phases 2-4 directly in the orchestrator; always dispatch to `test-management-specialist`
- **Never delete test cases without user confirmation** — prefer deprecation (`Automation_Status: deprecated`) over removal
- **Preserve case IDs** — never renumber or reuse IDs. Deprecated cases keep their IDs.
- **Context7 is mandatory** — always query `/virtocommerce/vc-docs` for current module behavior before updating or generating cases
- **Deduplication** — before generating cases, check target suite and related suites for semantic duplicates
- **One browser at a time** — Phase 5 uses `playwright-firefox` via `qa-testing-expert`; no parallel browser sessions
- **Read URLs from .env** via `config.js`, never hardcode
- **Show diffs** — when updating cases, always show old vs new before writing (unless `--ci` or `--auto-fix`)
- **Sync metadata** — updated cases must record the sync source and date in the References column
- **Module dependencies matter** — when module X changes, check downstream modules too
- **Don't over-sync** — if a case is VALID (false positive from diff), leave it untouched
- **Environment issues != test case defects** — BROKEN/BLOCKED from Phase 5 may be env problems. Flag for investigation, don't auto-fix blindly.
- **Quality gate is advisory** — deliver the verdict but the user makes the final go/no-go
- **Report always written** — even with `--report-only`, produce the full report
- **Build verification before pipeline** — always run pre-flight build verification and include version info in report
- **GraphQL schema refresh** — when scope includes GraphQL suites, run `npm run schema:refresh` in Pre-Flight and validate all queries/mutations against `graphql-schema.md`
- **BL proposals are advisory only** — `--update-bl` drafts proposals to `reports/test-lifecycle/TLC-*/bl-proposals.md`. Never write to `.claude/agents/knowledge/business-logic.md` automatically; every entry requires human review and manual application. Every proposed entry must cite a source (JIRA AC, Context7 quote, changelog, PR).
