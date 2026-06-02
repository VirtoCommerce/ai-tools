---
description: "Create a sprint test plan from JIRA Done items + vc-frontend PRs. Pulls Stories/Bugs (status=Done), maps PRs, computes risk, allocates regression suites, and writes a sprint-XX-YY-test-plan.md to vc/shared/docs/Sprint plans/."
argument-hint: "SprintXX-YY | XX-YY | current | last"
disable-model-invocation: true
---

# /qa-test-plan — Sprint Test Plan Generator

Build a sprint-level test plan by pulling **Done Stories and Bugs** from JIRA, cross-referencing **merged PRs in `VirtoCommerce/vc-frontend`** within the sprint window, scoring risk, and mapping work to regression suites. Reference output: `vc/shared/docs/Sprint plans/sprint-26-08-test-plan.md`.

You run this orchestration inline. Delegate the heavy "Write" step (Section 6: per-ticket test case generation count + GAP IDs) to `test-management-specialist`. Do NOT delegate to another orchestrator agent.

## Usage

`SprintXX-YY` denotes the sprint label (year-XX, sprint-YY). Replace with the actual sprint, e.g., `Sprint26-09`, `Sprint26-10`, `Sprint27-01`.

```
/qa-test-plan SprintXX-YY      # Build plan for a named sprint (e.g. Sprint26-09)
/qa-test-plan XX-YY            # Short form (e.g. 26-09)
/qa-test-plan current          # Detect current sprint from JIRA active sprint
/qa-test-plan last             # Detect last completed sprint from JIRA
/qa-test-plan XX-YY --no-jira  # Skip JIRA, use git log + GitHub PRs only
/qa-test-plan XX-YY --frontend # Only pull vc-frontend PRs (skip backend module repos)
```

## Flags

| Flag | Effect |
|------|--------|
| `--no-jira` | Skip Atlassian MCP. Build scope from merged PRs + git log only. |
| `--frontend` | Restrict PR review to `VirtoCommerce/vc-frontend`. Default behavior also searches relevant `vc-module-*` repos. |
| `--from <date>` / `--to <date>` | Override sprint window (ISO 8601). Defaults to JIRA sprint dates. |
| `--draft` | Write the plan with `Document status: Draft` and skip risk score validation gates. |
| `--no-suites` | Skip Section 5 regression suite mapping. |

---

## Pipeline: Resolve → Fetch JIRA → Fetch PRs → Correlate → Assess → Write

### Step 1 — Resolve Sprint

Parse any of `SprintXX-YY` / `sprint-XX-YY` / `XX-YY` (where `XX` is the year suffix and `YY` is the sprint number — e.g. `26-09`, `26-10`, `27-01`). Normalize into `{SPRINT_LABEL}` (e.g., `SprintXX-YY`).

| Input | Resolution |
|-------|-----------|
| `SprintXX-YY` / `sprint-XX-YY` / `XX-YY` | Match regex `^(?:[Ss]print[-]?)?(\d{2}-\d{2})$` → normalize to `Sprint<XX-YY>` |
| `current` | Atlassian MCP `searchJiraIssuesUsingJql`: `sprint in openSprints() AND project = ${JIRA_PROJECT_KEY}` → take the sprint name from any returned issue |
| `last` | JQL: `sprint in closedSprints() AND project = ${JIRA_PROJECT_KEY} ORDER BY sprint DESC` → take the most recent closed sprint name |

If parsing fails (input doesn't match `XX-YY` and isn't `current`/`last`), ask the user for the correct sprint label rather than guessing.

**Output target:** `vc/shared/docs/Sprint plans/sprint-{XX-YY}-test-plan.md` (single canonical location for all sprint plans — co-located with the structural reference). Per-ticket test artifacts (test-cases.csv, exploratory-session.md, etc.) continue to live under `tests/{SPRINT_LABEL}/VCST-XXXX/` — the sprint plan does NOT go there. Create the `vc/shared/docs/Sprint plans/` directory if it doesn't exist.

**Duplicate guard:** If `vc/shared/docs/Sprint plans/sprint-{XX-YY}-test-plan.md` already exists, ask the user whether to overwrite or append a `-v2` suffix. Never silently overwrite.

---

### Step 2 — Fetch JIRA Sprint Items (skip if `--no-jira`)

Use Atlassian MCP. If unavailable, ask user to paste the issue list (key, summary, type, priority, status, components).

**JQL queries:**
```
# Stories Done
project = ${JIRA_PROJECT_KEY} AND sprint = "{SPRINT_LABEL}" AND issuetype = Story AND status = Done

# Bugs Done
project = ${JIRA_PROJECT_KEY} AND sprint = "{SPRINT_LABEL}" AND issuetype = Bug AND status = Done

# Tasks/Tech-debt Done (for context — may include data-test-id refactors)
project = ${JIRA_PROJECT_KEY} AND sprint = "{SPRINT_LABEL}" AND issuetype in (Task, "Technical task", Sub-task) AND status = Done
```

For each returned issue, capture: key, summary, type, priority, components, labels, assignee, **acceptance criteria** (description body), linked PRs (remote links + body URLs), JIRA fix version. Use `getJiraIssue` for full detail on the top 30 by priority — keep payloads under control by lazy-loading the rest only when needed in Step 4.

**Sprint dates:** From any returned issue's sprint object → record `startDate` and `endDate`. These are the PR-window bounds for Step 3.

**Out-of-scope filter** — exclude from the test plan but log under Section 2.4 "Out of Scope":
- Tickets where status changed to Done before the sprint started (carryover already tested)
- Internal tooling tickets (Katalon migration, dataset manager, CI infra) — labels: `qa-tooling`, `ci-infra`
- Spike/architecture tickets with no shipped code
- Code review tasks (no user-facing change)
- Support tickets where the fix is not deployed to QA in the sprint window

---

### Step 3 — Fetch vc-frontend PRs (and module PRs)

Use GitHub MCP (`mcp__github__list_pull_requests` + `mcp__github__get_pull_request`). The sprint window is `[startDate, endDate]` from Step 2 (or `--from` / `--to` overrides).

**Primary repo:** `VirtoCommerce/vc-frontend` — list PRs with `state: closed`, filter by `mergedAt` within window.

**Secondary repos** (skip if `--frontend`): For each unique JIRA component touched by Done items, search the matching `vc-module-*` repo. Use `.claude/agents/knowledge/module-suite-map.md` for component → module mapping. List merged PRs in the window.

For each merged PR, capture:
- Number, title, mergedAt, author, base/head branches
- Body (extract VCST-XXXX references via regex `VCST-\d+`)
- Changed files (`mcp__github__get_pull_request_files`) — used to classify layer (Frontend / Backend / GraphQL / Config)

**File classification (per PR):**

| Pattern | Layer |
|---------|-------|
| `*.vue`, `*.tsx`, `*.jsx`, `client-app/**`, `theme/**` | Frontend (storefront) |
| `*.cs`, `*.csproj`, `Modules/**` | Backend module |
| `*Query.cs`, `*Mutation.cs`, `*.graphql`, `xapi/**` | GraphQL xAPI |
| `*.json` (config, settings_data) | Configuration |
| `*.scss`, `*.css`, BEM-renamed classes | Styling / BEM refactor |
| `*.spec.ts`, `*test*` | Test changes (note for test-update implications) |

---

### Step 4 — Correlate PRs ↔ JIRA Tickets

Build the master matrix: every Done JIRA item → list of merged PRs that reference it; every PR → its primary JIRA ticket (first VCST in title/body).

**Reconciliation rules:**

1. **PR with VCST in title/body** → linked to that ticket
2. **PR with no VCST** → check if branch name matches `{repo}/feat/VCST-XXXX-*` or similar
3. **JIRA ticket with no linked PR but status Done** → flag in plan as "code path unverified" (may be config-only or BE-only change). Surface to user.
4. **PR merged in window but no JIRA link** → list under "Unlinked PRs" — may be infra/refactor (e.g., `feat: refactor data-test-ids`). Still note layer impact.
5. **Multiple PRs per ticket** → list all; the ticket's domain is the union.

**Domain mapping:**
- Use JIRA components → domain: e.g., `Cart` → Cart, `[BOPIS]` label → BOPIS
- For tickets with no clear component, infer from PR file paths
- Each ticket gets one **primary domain** (used for risk scoring) and zero or more **secondary domains** (used for suite mapping)

---

### Step 5 — Risk Assessment

Apply the 5×5 Likelihood × Impact matrix from `.claude/skills/qa-methodology/qa-risk/risk-prioritization-framework.md`.

**Group tickets by primary domain** to produce one row per affected domain (NOT one per ticket — the plan stays readable).

**Likelihood (1-5) — how likely a regression escapes:**
- 5: Multiple concurrent changes to same component (e.g., 3+ tickets touching configurable products section logic)
- 4: New feature with non-trivial logic + bug fix in same area
- 3: Single new feature OR multiple bug fixes
- 2: i18n / localization / cosmetic change
- 1: Pure backend with no UI surface

**Impact (1-5) — blast radius if it breaks:**
- 5: P0 revenue path (checkout, payment, cart, auth, search, catalog browse)
- 4: P1 customer-visible flow (BOPIS, B2B org, orders, account)
- 3: Admin SPA primary workflows (catalog admin, orders admin, marketing)
- 2: CMS / Page Builder / non-critical admin
- 1: Internal dev tools, observability

**Score = Likelihood × Impact.** Levels: 1-4 Low, 5-9 Medium, 10-15 High, 16-25 Critical.

Critical-level domains drive priority of suite execution and dictate whether `qa-testing-expert` cross-browser pass is required (always for Critical).

---

### Step 6 — Generate Plan Sections

Delegate Sections 5.2 (Coverage Gaps) and 6 (New Test Cases per Ticket) to `test-management-specialist`. The orchestrator (you) writes Sections 1, 2, 3, 4, 7-13 and integrates the specialist's output.

#### 6a. Orchestrator-written sections

Follow the structure of `vc/shared/docs/Sprint plans/sprint-26-08-test-plan.md` exactly. Sections:

1. **Sprint Summary** — date range, theme (1-2 sentence narrative inferred from top-priority tickets), Done counts (split by type), test-relevant count, merged PR count
2. **Scope** — 2.1 Stories table, 2.2 Bugs table, 2.3 TechDebt/Structural (BEM, data-test-ids, etc.), 2.4 Out of Scope
3. **Risk Assessment** — table per domain with rationale
4. **Test Strategy** — 4.1 Layers Matrix (one row per domain × Storefront/Admin/REST/GraphQL/A11y/Analytics), 4.2 Approach by priority (Critical first, then High, then Medium), 4.3 Techniques per ticket (BVA / EP / Decision Table / State Transition / Pairwise — pick from `.claude/skills/qa-methodology/qa-test-design/test-design-techniques.md`)
7. **Entry/Exit Criteria** — concrete bullets keyed to this sprint's tickets (e.g., "Pickup locations >50 entries seeded" if BOPIS pagination is in scope)
8. **Test Data Requirements** — derive from tickets; reference `test-data/` files where applicable
9. **Schedule and Milestones** — calendar table from sprint end → +1 week
10. **Resources / Agent Assignments** — map domains to agents per `.claude/rules/agents.md` browser table
11. **JIRA Ticket Coverage Matrix** — every Done ticket × existing suite × new tests needed × owner
12. **Cross-Layer Verification Checklist** — list of P0/P1 tickets that span storefront + backend
13. **References** — PR list, knowledge files, suite manifest, existing test artifacts

#### 6b. Delegated sections (test-management-specialist)

```
Delegate to: test-management-specialist
Input:
  - sprint: {SPRINT_LABEL}
  - jiraDoneItems: [{key, summary, type, priority, components, acceptanceCriteria, linkedPRs, primaryDomain, secondaryDomains}]
  - mergedPRs: [{number, title, repo, layer, changedFiles, linkedTickets}]
  - riskMatrix: [{domain, level, score, rationale}]
  - changeInventory:
    - newFeatures: [...]
    - bugFixes: [...]
    - structuralChanges: [...] (BEM, data-test-ids)
    - breakingChanges: [...]

References (read these):
  - config/test-suites.json (suite definitions + selection groups)
  - .claude/agents/knowledge/business-logic.md (BL-* invariants per domain)
  - .claude/agents/knowledge/e-commerce-edge-cases-library.md (ECL-* patterns)
  - .claude/agents/knowledge/module-suite-map.md (module → suite mapping)
  - .claude/skills/testing/qa-coverage-gap/feature-domain-map.md
  - .claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md
  - .claude/skills/qa-methodology/qa-test-design/test-design-techniques.md

Context7: query `/virtocommerce/vc-docs` per primary domain (tokens: 8000)

Output:
  - section_5_1_suites_activated: [{suiteId, name, module, sprintTrigger: [VCST-...], priority}]
  - section_5_2_coverage_gaps: [{gapId: GAP-NN, ticket, description, targetSuites, owner}]
  - section_6_new_cases: [{ticket, layers, caseType, suggestedCount, targetSuite, technique}]
  - estimatedTotalNewCases: int (range OK, e.g., "63-72")

Do NOT generate the actual CSV test cases here — only counts, suite mapping, and technique recommendation. Case generation happens later via /qa-test-cases-generator per ticket.
```

---

### Step 7 — Write the Plan

Output path: `vc/shared/docs/Sprint plans/sprint-{XX-YY}-test-plan.md`

Use the **exact structure** of `vc/shared/docs/Sprint plans/sprint-26-08-test-plan.md`. Do not invent new section numbers; do not omit sections. If a section has no content for this sprint (e.g., no analytics changes), keep the section heading and write `_None in this sprint._`

**Header block:**
```markdown
# Sprint {XX-YY} Test Plan

**Document status:** Draft
**Author:** test-management-specialist (orchestrated by /qa-test-plan)
**Created:** {YYYY-MM-DD}
**Target environment:** QA (`FRONT_URL` / `BACK_URL`)
**Sprint dates:** {startDate} – {endDate}
```

**Companion files** (write alongside the plan):
- `vc/shared/docs/Sprint plans/sprint-{XX-YY}-summary.json` — machine-readable summary (co-located with the plan)

```json
{
  "sprint": "Sprint{XX-YY}",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "doneCounts": {"stories": 0, "bugs": 0, "tasks": 0, "spikes": 0, "total": 0},
  "testRelevantCount": 0,
  "mergedFrontendPRs": 0,
  "mergedModulePRs": 0,
  "domains": [{"name": "...", "score": 0, "level": "Critical|High|Medium|Low"}],
  "suitesActivated": ["042", "044", ...],
  "newCasesEstimate": "63-72",
  "criticalTickets": ["VCST-..."],
  "outOfScopeCount": 0,
  "artifacts": "vc/shared/docs/Sprint plans/"
}
```

---

## Output Summary to User

After writing the plan, deliver a short report:

```
Sprint {XX-YY} Test Plan — DRAFT

Sprint window: {startDate} – {endDate}
Done items in scope: {N} ({S} Stories, {B} Bugs)
Merged PRs: {P} in vc-frontend, {M} in modules
Critical-risk domains: [...]
Coverage gaps identified: {GAP_COUNT}
New test cases estimated: {RANGE}

Plan: vc/shared/docs/Sprint plans/sprint-{XX-YY}-test-plan.md
Summary: vc/shared/docs/Sprint plans/sprint-{XX-YY}-summary.json

Next: review the plan, then either:
  - /qa-test-cases-generator VCST-XXXX  (per-ticket case generation, driven by Section 6 counts/techniques)
  - /qa-test VCST-XXXX                  (test a specific ticket, prefilled from Section 11 row)
  - /qa-regression sprint               (auto-resolves vc/shared/docs/Sprint plans/sprint-{XX-YY}-summary.json → suitesActivated[])
  - /qa-regression sprint:{XX-YY}       (pin to this exact sprint plan; useful when re-running a past sprint)
```

---

## Rules

- Reference example: `vc/shared/docs/Sprint plans/sprint-26-08-test-plan.md` — match its structure section-for-section.
- Pull JIRA items via Atlassian MCP only — do NOT scrape the web. If MCP unavailable, ask user to paste.
- Pull PRs via GitHub MCP only — do NOT shell out to `gh` from this command (the orchestrator runs inline; `gh` is fine inside agent dispatches).
- The sprint window for PRs is the **JIRA sprint dates**, not arbitrary dates. Honor `--from` / `--to` only when explicitly given.
- **Bugs and Stories only** drive scope (Section 2.1 / 2.2). Tasks/TechDebt go to Section 2.3 only if they touch UI selectors or data-test-ids (test-impact). Otherwise → Section 2.4 Out of Scope.
- **Group risk by domain**, not by ticket. The plan stays readable.
- **Never assert exact prices, IDs, SKUs, order numbers** in the plan — refer to test data files / `@td(ALIAS.field)` resolver per `feedback_flexible_test_cases.md`.
- **Read URLs from `config.js` / `.env`** — never hardcode `vcst-qa.virtocommerce.com` in the plan body; use `{FRONT_URL}` / `{BACK_URL}`.
- **No fabricated suite IDs.** Every suite in Section 5.1 must exist in `config/test-suites.json`. If a domain has no existing suite, list it in 5.2 (Coverage Gap) and propose a target suite.
- **Honor the BL knowledge file** — when describing test approach for a ticket, reference applicable `BL-*` IDs from `business-logic.md` (read; do not edit). If a ticket implies a new invariant, note it as a candidate for `--update-bl` in a follow-up `/qa-test-lifecycle` run, not in this plan.
- **Document status defaults to Draft.** Promote to "Approved" only after user review (manual edit).
- **Companion summary.json must validate** — keys exactly as specified, no trailing commas.
- Follow `.claude/templates/agent-dispatch.md` for the test-management-specialist delegation.
- If `--no-jira` is set, the plan must explicitly mark Section 2.1/2.2 as "Reconstructed from PR titles + git log — verify against JIRA before sign-off."
