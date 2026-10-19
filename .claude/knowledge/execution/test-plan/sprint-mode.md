# /qa-test-plan sprint — the sprint pipeline

Read by [`/qa-test-plan`](../../../commands/qa-test-plan.md) when the argument is a sprint (`SprintXX-YY`, `XX-YY`,
`current`, `last`). Moved verbatim from the command on 2026-10-16 when the command became a router for sprint and
stable-bundle plans; the sections both modes share (risk, the specialist delegation, the checklist gap-diff, the
charters, the rules) are in [`plan-sections.md`](plan-sections.md) and are cited here, not repeated.

You run this orchestration inline. Delegate the heavy "Write" step (Section 6: per-ticket test case generation count + GAP IDs) to `test-management-specialist`. Do NOT delegate to another orchestrator agent.

## Flags

| Flag | Effect |
|------|--------|
| `--no-jira` | Skip Atlassian MCP. Build scope from merged PRs + git log only. |
| `--frontend` | Restrict PR review to `VirtoCommerce/vc-frontend`. Default behavior also searches relevant `vc-module-*` repos. |
| `--from <date>` / `--to <date>` | Override sprint window (ISO 8601). Defaults to JIRA sprint dates. |
| `--draft` | Write the plan with `Document status: Draft` and skip risk score validation gates. |
| `--no-suites` | Skip Section 5 regression suite mapping. |
| `--no-sitemap` | Skip Step 0 (storefront sitemap refresh). Use offline or when the env is unreachable. |

---

## Pipeline: Refresh sitemap → Resolve → Fetch JIRA → Fetch PRs → Correlate → Assess → Write

### Step 0 — Refresh the storefront sitemap (diff-gated)

Before scoping the sprint, bring the storefront sitemap current — the sprint boundary is the natural cadence for this. Run:

```
/qa-sitemap
```

(or, headless / non-interactive: `npm run sitemap:refresh` then apply the diff per the `/qa-sitemap` methodology). It is **diff-gated** — on a quiet sprint the deterministic crawler prints `SITEMAP_CHANGED=no` and nothing is written, so this step is a cheap no-op when the catalog hasn't moved. When it does change, `.claude/knowledge/domain/sitemap.md` (+ the plugin mirror) is refreshed and the rev bumped **before** the plan is written, so any sitemap references in the plan are current.

Skip only with an explicit `--no-sitemap` flag (e.g. offline). Do not block the plan if the environment is unreachable — note "sitemap not refreshed (env unreachable)" and continue.

### Step 1 — Resolve Sprint

Parse any of `SprintXX-YY` / `sprint-XX-YY` / `XX-YY` (where `XX` is the year suffix and `YY` is the sprint number — e.g. `26-09`, `26-10`, `27-01`). Normalize into `{SPRINT_LABEL}` (e.g., `SprintXX-YY`).

| Input | Resolution |
|-------|-----------|
| `SprintXX-YY` / `sprint-XX-YY` / `XX-YY` | Match regex `^(?:[Ss]print[-]?)?(\d{2}-\d{2})$` → normalize to `Sprint<XX-YY>` |
| `current` | Atlassian MCP `searchJiraIssuesUsingJql`: `sprint in openSprints() AND project = ${JIRA_PROJECT_KEY}` → take the sprint name from any returned issue |
| `last` | JQL: `sprint in closedSprints() AND project = ${JIRA_PROJECT_KEY} ORDER BY sprint DESC` → take the most recent closed sprint name |

If parsing fails (input doesn't match `XX-YY` and isn't `current`/`last`), ask the user for the correct sprint label rather than guessing.

**Output target:** `docs/Sprint plans/sprint-{XX-YY}-test-plan.md` (single canonical location for all sprint plans — co-located with the structural reference). Per-ticket test artifacts (test-cases.csv, exploratory-session.md, etc.) continue to live under `reports/tickets/{SPRINT_LABEL}/VCST-XXXX/` — the sprint plan does NOT go there. Create the `docs/Sprint plans/` directory if it doesn't exist.

**Duplicate guard:** If `docs/Sprint plans/sprint-{XX-YY}-test-plan.md` already exists, ask the user whether to overwrite or append a `-v2` suffix. Never silently overwrite.

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

**Secondary repos** (skip if `--frontend`): For each unique JIRA component touched by Done items, search the matching `vc-module-*` repo. Use `knowledge/execution/module-suite-map.md` for component → module mapping. List merged PRs in the window.

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

Per [`plan-sections.md`](plan-sections.md) §Risk assessment.

---

### Step 6 — Generate Plan Sections

Delegate Sections 5.2 (Coverage Gaps), **5.3 (Exploratory Charters)** and 6 (New Test Cases per Ticket) to `test-management-specialist`. The orchestrator (you) writes Sections 1, 2, 3, 4, 7-13 and integrates the specialist's output. 5.2 and 5.3 share one input (the Step 6c gap-diff), so one writer owns both — split, a gap ends up in neither.

#### 6a. Orchestrator-written sections

Follow the structure of `docs/Sprint plans/sprint-26-08-test-plan.md` exactly. Sections:

1. **Sprint Summary** — date range, theme (1-2 sentence narrative inferred from top-priority tickets), Done counts (split by type), test-relevant count, merged PR count
2. **Scope** — 2.1 Stories table, 2.2 Bugs table, 2.3 TechDebt/Structural (BEM, data-test-ids, etc.), 2.4 Out of Scope
3. **Risk Assessment** — table per domain with rationale
4. **Test Strategy** — 4.1 Layers Matrix (one row per domain × Storefront/Admin/REST/GraphQL/A11y/Analytics), 4.2 Approach by priority (Critical first, then High, then Medium), 4.3 Techniques per ticket (BVA / EP / Decision Table / State Transition / Pairwise — pick from `skills/qa-test-design/test-design-techniques.md`)
7. **Entry/Exit Criteria** — concrete bullets keyed to this sprint's tickets (e.g., "Pickup locations >50 entries seeded" if BOPIS pagination is in scope)
8. **Test Data Requirements** — derive from tickets; reference `test-data/` files where applicable
9. **Schedule and Milestones** — calendar table from sprint end → +1 week
10. **Resources / Agent Assignments** — map domains to agents per `.claude/rules/agents.md` browser table
11. **JIRA Ticket Coverage Matrix** — every Done ticket × existing suite × new tests needed × owner
12. **Cross-Layer Verification Checklist** — list of P0/P1 tickets that span storefront + backend
13. **References** — PR list, knowledge files, suite manifest, existing test artifacts


#### 6b–6d. Delegated sections, checklist gap-diff, exploratory charters

Per [`plan-sections.md`](plan-sections.md) §Delegated sections, §Checklist gap-diff and §Exploratory charters — the
sprint inputs are the Done items, the merged PRs, the Step 5 risk matrix and the change inventory.

---

### Step 7 — Write the Plan

Output path: `docs/Sprint plans/sprint-{XX-YY}-test-plan.md`

Use the **exact structure** of `docs/Sprint plans/sprint-26-08-test-plan.md`, **plus Section 5.3 Exploratory Charters** (added 2026-08-26 — see Step 6d; the 26-08…26-16 plans predate it and have no 5.3). Do not invent any other new section numbers; do not omit sections. If a section has no content for this sprint (e.g., no analytics changes), keep the section heading and write `_None in this sprint._` — for 5.3 that means writing the "Not chartered (and why)" line, never an empty section.

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
- `docs/Sprint plans/sprint-{XX-YY}-summary.json` — machine-readable summary (co-located with the plan)

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
  "exploratoryCharters": [
    {"id": "EXP-01", "domain": "...", "signals": ["C2", "C3"], "mission": "...",
     "candidateScenarios": ["...", "..."], "technique": "Feature-pair matrix",
     "lane": "playwright-chrome", "timeboxMin": 30}
  ],
  "criticalTickets": ["VCST-..."],
  "outOfScopeCount": 0,
  "artifacts": "docs/Sprint plans/"
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
Exploratory charters: {EXP_COUNT} (§5.3)
New test cases estimated: {RANGE}

Plan: docs/Sprint plans/sprint-{XX-YY}-test-plan.md
Summary: docs/Sprint plans/sprint-{XX-YY}-summary.json

Next: review the plan, then either:
  - /qa-test-cases-generator VCST-XXXX  (per-ticket case generation, driven by Section 6 counts/techniques)
  - /qa-test VCST-XXXX                  (test a specific ticket, prefilled from Section 11 row)
  - /qa-regression sprint               (auto-resolves docs/Sprint plans/sprint-{XX-YY}-summary.json → suitesActivated[])
  - /qa-regression sprint:{XX-YY}       (pin to this exact sprint plan; useful when re-running a past sprint)
  - /qa-exploratory sprint              (run this plan's §5.3 charters — reads exploratoryCharters[] from the summary.json)
```
