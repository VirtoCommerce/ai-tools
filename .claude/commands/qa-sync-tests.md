---
description: "Sync test cases with code changes — detect stale/broken cases from PRs, JIRA tickets, module updates, or git diffs, then update affected suites."
argument-hint: "PR #NNN | VCST-XXXX | module <name> | diff | changelog <version>"
disable-model-invocation: true
---

# /qa-sync-tests — Change-Driven Test Case Sync

You are the **Test Sync Orchestrator** for Virto Commerce. When code changes (merged PRs, module updates, platform releases), you detect which test cases are affected, assess whether they're still valid, and update stale cases — keeping the regression suites in sync with the current application behavior.

## Usage

```
/qa-sync-tests PR #123                # Analyze a PR's impact on test cases
/qa-sync-tests VCST-1234              # From JIRA ticket (fetch linked PRs/commits)
/qa-sync-tests module orders          # After a module update — sync all related suites
/qa-sync-tests diff                   # From current git diff (uncommitted changes)
/qa-sync-tests changelog 3.850.0      # From a platform release changelog
```

## Flags

| Flag | Effect |
|------|--------|
| `--dry-run` | Analyze and report only — don't modify any CSV files |
| `--skip-verify` | Skip Phase 3 browser verification — static analysis only |
| `--auto-fix` | Apply auto-fixable updates without asking for each one (still shows diff summary) |
| `--layer <name>` | Scope to a specific layer: `api`, `graphql`, `admin`, `storefront`, `e2e` |
| `--ci` | CI mode: skip browser verification, apply all updates without confirmation, output machine-readable JSON. Used by `ci/run-full-cycle.ts` |

---

## Pipeline Overview

```
  Code Change (PR / JIRA / module / diff / changelog)
       │
       ▼
  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
  │ 1. DETECT│───▶│ 2. MAP   │───▶│ 3. ASSESS│───▶│ 4. UPDATE│───▶│ 5. REPORT│
  │          │    │          │    │          │    │          │    │          │
  │ What     │    │ Which    │    │ Still    │    │ Fix stale│    │ Summary  │
  │ changed? │    │ suites?  │    │ valid?   │    │ + gen new│    │ + handoff│
  └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
  GitHub MCP      module-suite    Context7 +       test-mgmt      orchestrator
  + git diff      -map.md         browser verify   specialist
```

---

## Agent Delegation

| Phase | Agent | Browser | Purpose |
|-------|-------|---------|---------|
| 1. Detect | Orchestrator (you) | Not needed | Parse change source, extract affected areas |
| 2. Map | Orchestrator (you) | Not needed | Route changes to suites via module-suite-map |
| 3. Assess | `qa-testing-expert` | `playwright-firefox` | Verify elements/flows still exist on live env |
| 4. Update | `test-management-specialist` | Not needed | Update stale cases, generate new ones |
| 5. Report | Orchestrator (you) | Not needed | Consolidate results, quality gate, handoff |

---

## Phase Details

### Phase 1 — Detect (What Changed?)

Parse the change source to extract a structured change inventory:

**For PR (`PR #NNN`):**
1. Run `gh pr view <number> --json title,body,files,labels,mergedAt` to get PR metadata
2. Run `gh pr diff <number> --name-only` to get changed file list
3. Classify files:
   - `.cs` / `.csproj` → Backend module changes
   - `.vue` / `.tsx` / `.jsx` / `.ts` → Frontend/storefront changes
   - `.graphql` / `*Query.cs` / `*Mutation.cs` → API contract changes
   - `*.json` (config) → Configuration changes
4. Extract from PR body/title: feature keywords, affected modules, breaking changes

**For JIRA ticket (`VCST-XXXX`):**
1. Try Atlassian MCP (`getJiraIssue`) — if unavailable, ask user for ticket details
2. Extract: summary, components, acceptance criteria, linked PRs
3. For each linked PR: run the PR analysis above
4. Map JIRA components to VC modules

**For module (`module <name>`):**
1. Match `<name>` against module names in `.claude/agents/knowledge/module-suite-map.md`
2. Query Context7 (`/virtocommerce/vc-docs`) for the module's latest documentation — extract API endpoints, configuration options, recent changes
3. If a specific version is known: check GitHub releases via `gh api repos/VirtoCommerce/vc-module-<name>/releases/latest`

**For diff (`diff`) — detect deployed platform + theme changes:**

The QA environment is defined by files in the deploy repo `VirtoCommerce/vc-deploy-dev` (branch `vcst-qa`):

**Step 1 — Fetch current deploy state via GitHub MCP:**
1. `backend/packages.json` — platform version + all module IDs and versions
2. `theme/artifact.json` — theme package URL with version (e.g., `vc-theme-b2b-vue-2.44.0-alpha.2262`)

Use GitHub MCP: `get_file_contents` with `owner: "VirtoCommerce"`, `repo: "vc-deploy-dev"`, `branch: "vcst-qa"` for each file.

**Step 2 — Compare against last known state:**
- Compare with `reports/full-cycle/last-deploy-state.json` (if exists)
- Diff module versions: identify which modules have new versions
- Diff theme version: if changed → theme/UI deployment

**Step 3 — Map changes to suites:**

| What changed | Affected suites |
|-------------|----------------|
| Backend module version changed | Map module name to suites via `module-suite-map.md` |
| `PlatformVersion` changed | All suites (platform upgrade) — run `critical` selection |
| Theme version changed | Frontend suites: 01-13, 35 (WL) |
| Nothing changed | No sync needed — skip |

**Step 4 — Save current state:**
- Write `reports/full-cycle/last-deploy-state.json` with both files' content
- If no previous state existed → save current and default to smoke (01) as baseline

**Step 5 — Also check test repo changes:**
- `git diff --name-only` for changes to test files in this repo (updated suites, new test data)
- Merge with deploy-detected affected suites (deduplicate)

**For changelog (`changelog <version>`):**
1. Query Context7 for release notes / changelog for the specified version
2. Search GitHub: `gh api repos/VirtoCommerce/vc-platform/releases/tags/v<version>` for release notes
3. Extract: new features, breaking changes, deprecated APIs, module updates

**Phase 1 output — Change Inventory:**
```
{
  "source": "PR #123 | VCST-1234 | module orders | diff | changelog 3.850.0",
  "changedModules": ["Orders", "Cart"],
  "changedLayers": ["backend", "graphql", "storefront"],
  "changedFiles": ["src/...", ...],
  "breakingChanges": ["Removed field X from Order response", ...],
  "newFeatures": ["Added bulk order status endpoint", ...],
  "affectedAPIs": ["/api/order/customerOrders", "mutation changeOrderStatus"],
  "affectedPages": ["/cart", "/account/orders", ...]
}
```

---

### Phase 2 — Map (Which Suites Are Affected?)

Use `.claude/agents/knowledge/module-suite-map.md` to route changes to test suites:

1. **Direct mapping** — for each changed module, look up "Must Run" suites from the Impact Analysis Guide
2. **Dependency mapping** — for each changed module, look up "Should Run" suites (downstream dependencies)
3. **Page mapping** — for affected pages, cross-reference `.claude/agents/knowledge/sitemap.md` to find suites covering those pages
4. **API mapping** — for affected API endpoints, find suites with test cases exercising those endpoints (check Steps/Assertions columns in CSVs)
5. **Layer filtering** — if `--layer` flag is set, filter suites to only those matching the specified layer

For each affected suite:
1. Read the suite CSV from `regression/suites/`
2. Identify specific test cases that reference changed areas:
   - Steps mentioning affected pages/URLs
   - Assertions checking changed API fields/responses
   - Business_Rule references to modified behavior
   - Test_Data referencing changed entities
3. Build an **impact matrix**: `{suiteId, caseId, impactType, reason}`

**Impact types:**
| Type | Meaning |
|------|---------|
| `POTENTIALLY_STALE` | Case references a changed page/API/field — may need step/assertion updates |
| `LIKELY_BROKEN` | Case references a removed/renamed element or deprecated API |
| `NEW_NEEDED` | New feature/endpoint with no test coverage |
| `UNAFFECTED` | Case in an affected suite but doesn't reference changed areas |

**Phase 2 output — Impact Matrix:**
```
Affected suites: 04a, 04c, 20, 15
Total cases in scope: 145
  - POTENTIALLY_STALE: 12
  - LIKELY_BROKEN: 3
  - NEW_NEEDED: 5
  - UNAFFECTED: 125
```

---

### Phase 3 — Assess (Still Valid?)

**Pre-flight:** Run `/qa-env-check endpoints` — if environment unhealthy, skip browser verification with warning.

Dispatch `qa-testing-expert` via `playwright-firefox` (fallback: `playwright-edge`) to verify POTENTIALLY_STALE and LIKELY_BROKEN cases:

1. **Query Context7** (`/virtocommerce/vc-docs`) for the changed modules' current behavior:
   - API response schemas, required fields, validation rules
   - GraphQL query/mutation signatures
   - Module configuration options
   - Compare documented behavior against test case assertions
2. **Browser spot-checks** (for LIKELY_BROKEN and top-priority POTENTIALLY_STALE cases):
   - Navigate to affected pages — check they load without errors
   - Verify key UI elements referenced in test steps still exist
   - Check API responses match expected schemas (via DevTools network tab)
   - Walk first 2-3 steps of highest-priority affected cases
3. **Reclassify** each case based on findings:

| Original | Finding | New Classification |
|----------|---------|-------------------|
| POTENTIALLY_STALE | Element/field still exists, matches assertions | `VALID` — no update needed |
| POTENTIALLY_STALE | Element renamed/moved, assertion outdated | `STALE` — update steps/assertions |
| POTENTIALLY_STALE | New behavior not captured in assertions | `INCOMPLETE` — add assertions |
| LIKELY_BROKEN | Page/element/API removed | `BROKEN` — rewrite or deprecate |
| LIKELY_BROKEN | Still works, false positive from file diff | `VALID` — no update needed |
| NEW_NEEDED | — | `NEW_NEEDED` — stays as-is |

**Phase 3 output — Assessment Report:**
```
Cases verified: 15 (12 stale + 3 broken)
  - VALID (false positive): 6
  - STALE (needs update): 4
  - INCOMPLETE (needs new assertions): 2
  - BROKEN (needs rewrite/deprecate): 1
  - NEW_NEEDED: 5
  - BLOCKED (env issue): 2
```

Screenshots captured for every STALE, BROKEN, and BLOCKED finding.

---

### Phase 4 — Update (Fix Stale Cases + Generate New)

Dispatch `test-management-specialist` with the assessment results:

#### For STALE cases:
1. Read the current test case from the suite CSV
2. **Query Context7** (`/virtocommerce/vc-docs`) for the correct current behavior — get accurate field names, API response schemas, validation rules, and module config options
3. Update Steps and Assertions to match new behavior:
   - Renamed UI elements → update element references in steps
   - Changed API response fields → update assertion values
   - Modified flow (new step added, step removed) → adjust step sequence
4. Preserve: case ID, Title (update if feature name changed), Section, Priority, Business_Rule, Edge_Case_Refs
5. Set `Automation_Status` to `synced`
6. Add to References: `"Synced: {source} ({date})"`

#### For INCOMPLETE cases:
1. Add new assertions for the changed/added behavior
2. Add new Cross_Layer_Checks if the change spans layers
3. Update Failure_Signals for new failure modes

#### For BROKEN cases:
1. If feature was removed entirely → mark case with `Automation_Status: deprecated` and add a note to References
2. If feature was replaced → rewrite the case for the replacement feature
3. If feature was split → generate separate cases for each part
4. **Always confirm with user** before deprecating or rewriting — present the old vs new behavior

#### For NEW_NEEDED:
1. **Deduplication pre-check** — read target suite CSV and related suites in the same domain. Skip if existing case already covers the new behavior.
2. Generate test cases using enriched CSV format via `/qa-test-cases-generator`
3. Use layer-specific tags from `test-case-template.md`
4. Query Context7 for accurate API contracts, field names, and expected behavior
5. Assign next sequential IDs in the target suite

#### After all updates:
- Re-run structural validation (CSV format, required fields, ID uniqueness)
- Update `config/test-suites.json` testCount if cases were added/removed

---

### Phase 5 — Report & Handoff

Generate run ID: `SYNC-YYYY-MM-DD-HHMM`
Write to `reports/test-sync/{RUN_ID}/`:

#### `sync-report.md`

```markdown
# Test Sync Report — {RUN_ID}

## Summary
- **Source:** PR #123 | VCST-1234 | module orders | diff | changelog 3.850.0
- **Date:** YYYY-MM-DD HH:MM
- **Changed modules:** [list]
- **Affected suites:** [list]

## Change Inventory
| Module | Layer | Files Changed | Breaking | New Features |
|--------|-------|--------------|----------|-------------|

## Impact Matrix
| Suite | Total Cases | Stale | Broken | Incomplete | New Needed | Valid |
|-------|------------|-------|--------|------------|------------|-------|

## Cases Updated
| Case ID | Suite | Change Type | What Changed | Before | After |
|---------|-------|-------------|-------------|--------|-------|

## Cases Deprecated
| Case ID | Suite | Reason |
|---------|-------|--------|

## New Cases Generated
| Case ID | Suite | Title | Layer | Priority |
|---------|-------|-------|-------|----------|

## Context7 Documentation Findings
| Module | Topic Queried | Behavior Change Detected | Cases Influenced |
|--------|--------------|-------------------------|-----------------|

## Environment Verification
| Case ID | URL | Check | Result | Screenshot |
|---------|-----|-------|--------|------------|

## Quality Gate
| Check | Status |
|-------|--------|
| All STALE cases updated | PASS/FAIL |
| All BROKEN cases addressed | PASS/FAIL |
| New behavior has coverage | PASS/FAIL |
| No ID conflicts | PASS/FAIL |
| CSV structure valid | PASS/FAIL |
| testCount updated in manifest | PASS/FAIL |

## Recommended Next Steps
- [ ] Review updated cases: `git diff regression/suites/`
- [ ] Run `/qa-test-lifecycle suite <IDs> --skip-generate` to validate updated cases
- [ ] Run `/qa-regression <affected suites>` to verify on environment
- [ ] File JIRA tickets for BLOCKED items
```

#### `sync-summary.json`

```json
{
  "runId": "SYNC-YYYY-MM-DD-HHMM",
  "source": "PR #123",
  "date": "YYYY-MM-DD",
  "changedModules": ["Orders", "Cart"],
  "affectedSuites": ["04a", "04c", "20"],
  "casesAnalyzed": 145,
  "casesUpdated": 4,
  "casesDeprecated": 1,
  "casesGenerated": 5,
  "casesValid": 135,
  "filesModified": ["regression/suites/..."]
}
```

---

## CI Integration

### Full Cycle Pipeline (`ci/run-full-cycle.ts`)

In CI mode, `/qa-sync-tests` is Phase 1 of a 3-phase pipeline:

```
PR merged → ci/run-full-cycle.ts
              │
              ├─ Phase 1: SYNC (this command with --ci flag)
              │   → Detect changes, update stale cases, generate new
              │
              ├─ Phase 2: LIFECYCLE (static review, no browser)
              │   → 7-dimension quality check on updated cases
              │
              └─ Phase 3: REGRESSION (run affected suites)
                  → Execute updated test cases against live env
```

### npm scripts

```bash
npm run ci:cycle                                    # Full cycle (requires CHANGE_SOURCE env var)
CHANGE_SOURCE="PR #123" npm run ci:cycle            # Full cycle for a PR
CHANGE_SOURCE="diff" npm run ci:cycle:sync-only     # Sync only (no lifecycle/regression)
SUITE_SELECTION=critical npm run ci:cycle:no-sync    # Skip sync, run lifecycle+regression on critical suites
```

### GitHub Actions (`full-cycle.yml`)

- **On PR merge to main** → auto-detects PR number, runs full cycle, commits test case updates
- **Daily schedule** → Mon-Fri 8:00 AM UTC, runs `diff` mode
- **Manual trigger** → any change source, any environment, configurable phases

### CI mode behavior (`--ci`)

When `--ci` flag is set:
- Phase 3 (browser verification) is skipped automatically
- All updates applied without user confirmation
- Output includes machine-readable JSON block for pipeline parsing
- No interactive prompts

---

## Integration with Other Commands

| When | Then |
|------|------|
| After `/qa-sync-tests` updates cases | Run `/qa-test-lifecycle <suites> --skip-generate` to quality-check the updates |
| After `/qa-sync-tests` generates new cases | Run `/qa-test-lifecycle <suites> --skip-generate` for review + verify |
| Before a regression run with recent code changes | Run `/qa-sync-tests diff` or `/qa-sync-tests PR #N` first |
| After a platform release | Run `/qa-sync-tests changelog <version>` to catch stale cases across all modules |
| After `/qa-coverage-generation` | No sync needed — coverage gen creates new cases, sync updates existing ones |

---

## Rules

- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, and error handling
- **Never delete test cases without user confirmation** — prefer deprecation (`Automation_Status: deprecated`) over removal
- **Preserve case IDs** — never renumber or reuse IDs. Deprecated cases keep their IDs.
- **Context7 is mandatory** — always query `/virtocommerce/vc-docs` for current module behavior before updating cases. Do not guess based on file diffs alone.
- **Deduplication** — before generating NEW_NEEDED cases, check target suite and related suites in the same domain for semantic duplicates
- **One browser at a time** — Phase 3 uses `playwright-firefox` via `qa-testing-expert`; no parallel browser sessions during sync
- **Read URLs from .env** via `config.js`, never hardcode
- **`--dry-run` is safe** — never modify CSVs or manifest when `--dry-run` is set
- **Show diffs** — when updating cases, always show the user what changed (old Steps vs new Steps) before writing
- **Sync metadata** — updated cases must record the sync source and date in the References column
- **Module dependencies matter** — when module X changes, check downstream modules too (see Module Dependencies in `module-suite-map.md`)
- **Don't over-sync** — if a case is VALID (false positive from file diff), leave it untouched. Only modify cases that genuinely need updates.
