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

**Output target:** `vc/shared/docs/Sprint plans/sprint-{XX-YY}-test-plan.md` (single canonical location for all sprint plans — co-located with the structural reference). Per-ticket test artifacts (test-cases.csv, exploratory-session.md, etc.) continue to live under `reports/tickets/{SPRINT_LABEL}/VCST-XXXX/` — the sprint plan does NOT go there. Create the `vc/shared/docs/Sprint plans/` directory if it doesn't exist.

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

Apply the 5×5 Likelihood × Impact matrix from `skills/qa-risk/risk-prioritization-framework.md`.

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

Delegate Sections 5.2 (Coverage Gaps), **5.3 (Exploratory Charters)** and 6 (New Test Cases per Ticket) to `test-management-specialist`. The orchestrator (you) writes Sections 1, 2, 3, 4, 7-13 and integrates the specialist's output. 5.3 is delegated with 5.2 deliberately: the two share an input (the checklist gap-diff, Step 6c) and splitting them across writers is how a gap ends up in neither.

#### 6a. Orchestrator-written sections

Follow the structure of `vc/shared/docs/Sprint plans/sprint-26-08-test-plan.md` exactly. Sections:

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
  - knowledge/oracles/business-logic.md (BL-* invariants per domain)
  - knowledge/oracles/e-commerce-edge-cases-library.md (ECL-* patterns)
  - knowledge/execution/module-suite-map.md (module → suite mapping)
  - skills/qa-coverage-gap/feature-domain-map.md
  - skills/qa-test-cases-generator/test-case-template.md
  - skills/qa-test-design/test-design-techniques.md
  - .claude/skills/qa-checklist/domain-checklists.md + backend-admin-checklists.md + graphql-checklist.md
  - .claude/skills/qa-sbtm/sprint-charter-selection.md   (the §5.3 derivation rule — read before writing charters)
  - reports/exploratory/  (last 24h of SBTM-* sessions — disqualifier D3)

Context7: query `/virtocommerce/vc-docs` per primary domain (tokens: 8000)

Output:
  - section_5_1_suites_activated: [{suiteId, name, module, sprintTrigger: [VCST-...], priority, layer: "Frontend"|"Backend"}]
    # Split §5.1 into TWO sub-tables in the written plan:
    #   5.1.1 Frontend Suites (regression/suites/Frontend/)
    #   5.1.2 Backend Suites  (regression/suites/Backend/)
    # Classify each suite by which layer directory its CSV lives under in config/test-suites.json
    # (NOT by JIRA component). Note the loyalty split: 083/083b storefront = Frontend; 075/075b/075c = Backend.
    # Preserve suite order within each sub-table; keep module/sprintTrigger/priority columns unchanged.
  - section_5_2_coverage_gaps: [{gapId: GAP-NN, ticket, description, targetSuites, owner}]
  - section_5_3_exploratory_charters: [{charterId: EXP-NN, domain, signals: ["C1".."C4"], mission,
      candidateScenarios: [2-3 strings], technique, persona?, lane: "playwright-chrome"|"playwright-edge",
      timeboxMin: 30, owner}]
  - section_6_new_cases: [{ticket, layers, caseType, suggestedCount, targetSuite, technique}]
  - estimatedTotalNewCases: int (range OK, e.g., "63-72")

Do NOT generate the actual CSV test cases here — only counts, suite mapping, and technique recommendation. Case generation happens later via /qa-test-cases-generator per ticket.
```

#### 6c. Checklist gap-diff → feeds BOTH §5.2 and §5.3

For each **Critical / High** domain in Section 3 (only those — a full 738-item sweep is not the job),
retrieve that domain's `/qa-checklist` list and diff it against the case titles of the domain's §5.1
suites. Route every uncovered item to exactly one destination:

| Uncovered item is… | Goes to | Becomes |
|---|---|---|
| Specific and assertable ("PDP shows tier price at qty ≥ MOQ") | §5.2 as a `GAP-NN` row | a `Draft` case → permanent coverage |
| State-shaped / interaction-shaped / "depends on…" | §5.3 as a charter **candidate scenario** | a 30-min probe this sprint |

This is what makes the checklist pay for itself: drawn once per domain, feeding both outputs. Do **not**
schedule a separate checklist *run* — a checklist walk produces no fingerprint, no `history.json` row,
no flakiness signal and no promotion path, so its findings do not compound.

#### 6d. Section 5.3 — Exploratory charters (derived, capped at 5)

Apply `.claude/skills/qa-sbtm/sprint-charter-selection.md` to Sections 3 + 5.2. Qualify a domain on any
of **C1** uncovered surface (a §5.2 gap with `Target suite(s) = none`) · **C2** concurrency seam (≥3
tickets at `L ≥ 4`) · **C3** cross-layer chain (a gap naming ≥3 suites across ≥2 layers) · **C4** latent
blast radius (`I = 5`, `L ≤ 3`). Disqualify on **D1** exact oracle (one assertable value/contract → it is
a test case, §6, not a charter — this applies however high the risk score) · **D2** no QA surface in this
repo (§2.4) · **D3** already charted in the last 24 h. Rank by signal count, then §3 score; keep ≤5.

Write the section as:

```markdown
### 5.3 Exploratory Charters (discovery — what the suites cannot assert)

> N charters × 30 min. Lane: chrome/edge only — firefox cannot click this storefront
> (`.claude/rules/agents.md`). Run isolated from the regression pool (3 lanes total).

| ID | Domain | Signals | Mission (discover X that suites Y don't cover) | Candidate scenarios | Technique | Owner |
|----|--------|---------|-----------------------------------------------|---------------------|-----------|-------|
| EXP-01 | ... | C2, C3 | ... | 1. … 2. … 3. … | Feature-pair matrix | qa-testing-expert |

**Not chartered (and why):** `<domain>` — D1 exact oracle → §6 case instead; `<domain>` — D2 separate product.
```

The "Not chartered" line is mandatory: a silently omitted Critical domain is indistinguishable from one
that was considered and correctly ruled out.

---

### Step 7 — Write the Plan

Output path: `vc/shared/docs/Sprint plans/sprint-{XX-YY}-test-plan.md`

Use the **exact structure** of `vc/shared/docs/Sprint plans/sprint-26-08-test-plan.md`, **plus Section 5.3 Exploratory Charters** (added 2026-08-26 — see Step 6d; the 26-08…26-16 plans predate it and have no 5.3). Do not invent any other new section numbers; do not omit sections. If a section has no content for this sprint (e.g., no analytics changes), keep the section heading and write `_None in this sprint._` — for 5.3 that means writing the "Not chartered (and why)" line, never an empty section.

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
  "exploratoryCharters": [
    {"id": "EXP-01", "domain": "...", "signals": ["C2", "C3"], "mission": "...",
     "candidateScenarios": ["...", "..."], "technique": "Feature-pair matrix",
     "lane": "playwright-chrome", "timeboxMin": 30}
  ],
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
Exploratory charters: {EXP_COUNT} (§5.3)
New test cases estimated: {RANGE}

Plan: vc/shared/docs/Sprint plans/sprint-{XX-YY}-test-plan.md
Summary: vc/shared/docs/Sprint plans/sprint-{XX-YY}-summary.json

Next: review the plan, then either:
  - /qa-test-cases-generator VCST-XXXX  (per-ticket case generation, driven by Section 6 counts/techniques)
  - /qa-test VCST-XXXX                  (test a specific ticket, prefilled from Section 11 row)
  - /qa-regression sprint               (auto-resolves vc/shared/docs/Sprint plans/sprint-{XX-YY}-summary.json → suitesActivated[])
  - /qa-regression sprint:{XX-YY}       (pin to this exact sprint plan; useful when re-running a past sprint)
  - /qa-exploratory sprint              (run this plan's §5.3 charters — reads exploratoryCharters[] from the summary.json)
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
- **Charters are DERIVED, never invented.** Section 5.3 is a filter over Sections 3 + 5.2 per `.claude/skills/qa-sbtm/sprint-charter-selection.md` — never a domain absent from §3, never a suite absent from §5.1. Same discipline as the no-fabricated-suite-IDs rule above, and for the same reason: an agent asked to name plausible things names plausible things.
- **High risk is not the charter qualifier — oracle fuzziness is.** A domain can score 20 in §3 and still be a pure D1 (one assertable value or contract). Route it to §6 as a test case: a precise oracle makes a case cheaper *and* permanent, whereas a charter buys a one-off verdict.
- **Cap Section 5.3 at 5 charters** and always write the "Not chartered (and why)" line. A charter nobody runs makes the plan look covered; a silently dropped Critical domain is indistinguishable from one correctly ruled out.
- **Never schedule a charter on `playwright-firefox`.** Exploration is click-driven by definition and `@playwright/mcp` + firefox cannot click this storefront or the Admin SPA (`.claude/rules/agents.md`, confirmed 6×). chrome or edge only.
- **Split Section 5.1 by layer.** Section 5.1 (Suites Activated) is written as two sub-tables — `5.1.1 Frontend Suites` (`regression/suites/Frontend/`) and `5.1.2 Backend Suites` (`regression/suites/Backend/`) — classifying each suite by the layer directory its CSV lives under in `config/test-suites.json`, not by JIRA component. Watch the loyalty split (083/083b storefront → Frontend; 075/075b/075c → Backend) and any admin/GraphQL suites (050*, 0XX admin) → Backend. Preserve suite order within each sub-table and keep the module/sprint-trigger/priority columns unchanged.
- **Honor the BL knowledge file** — when describing test approach for a ticket, reference applicable `BL-*` IDs from `business-logic.md` (read; do not edit). If a ticket implies a new invariant, note it as a candidate for the Phase 4c BL audit in a follow-up `/qa-test-lifecycle` run (or a standalone `/qa-review-bl`), not in this plan.
- **Document status defaults to Draft.** Promote to "Approved" only after user review (manual edit).
- **Companion summary.json must validate** — keys exactly as specified, no trailing commas.
- Follow `.claude/templates/agent-dispatch.md` for the test-management-specialist delegation.
- If `--no-jira` is set, the plan must explicitly mark Section 2.1/2.2 as "Reconstructed from PR titles + git log — verify against JIRA before sign-off."
