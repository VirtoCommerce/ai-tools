# Test plan — sections both modes share

Read by [`/qa-test-plan`](../../../commands/qa-test-plan.md) in both modes: [`sprint-mode.md`](sprint-mode.md) and
[`stable-mode.md`](stable-mode.md). Moved verbatim from the command on 2026-10-16. Where a passage names the sprint
(`sprintTrigger`, "this sprint"), a stable plan reads it as the release and its components.

## Risk assessment

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

## Delegated sections (test-management-specialist)

Delegate Sections 5.2 (Coverage Gaps), **5.3 (Exploratory Charters)** and 6 (New Test Cases per Ticket) to `test-management-specialist`. The orchestrator (you) writes Sections 1, 2, 3, 4, 7-13 and integrates the specialist's output. 5.2 and 5.3 share one input (the Step 6c gap-diff), so one writer owns both — split, a gap ends up in neither.

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
  - npm run bl:extract -- --domain <d> (BL-* invariants per domain)
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

## Checklist gap-diff — feeds BOTH §5.2 and §5.3

For each **Critical / High** domain in Section 3 (only those — a full 738-item sweep is not the job),
retrieve that domain's `/qa-checklist` list and diff it against the case titles of the domain's §5.1
suites. Route every uncovered item to exactly one destination:

| Uncovered item is… | Goes to | Becomes |
|---|---|---|
| Specific and assertable ("PDP shows tier price at qty ≥ MOQ") | §5.2 as a `GAP-NN` row | a `Draft` case → permanent coverage |
| State-shaped / interaction-shaped / "depends on…" | §5.3 as a charter **candidate scenario** | a 30-min probe this sprint |

Drawn once per domain, it feeds both outputs. Do **not**
schedule a separate checklist *run* — a checklist walk produces no fingerprint, no `history.json` row,
no flakiness signal and no promotion path, so its findings do not compound.

## Exploratory charters (derived, capped at 5)

Apply `.claude/skills/qa-sbtm/sprint-charter-selection.md` to Sections 3 + 5.2. Qualify a domain on any
of **C1** uncovered surface (a §5.2 gap with `Target suite(s) = none`) · **C2** concurrency seam (≥3
tickets at `L ≥ 4`) · **C3** cross-layer chain (a gap naming ≥3 suites across ≥2 layers) · **C4** latent
blast radius (`I = 5`, `L ≤ 3`). Disqualify on **D1** exact oracle (one assertable value/contract → it is
a test case, §6, not a charter — this applies however high the risk score) · **D2** no QA surface in this
repo (§2.4) · **D3** already charted in the last 24 h. Rank by signal count, then §3 score; keep ≤5.

Write the section as:

```markdown
### 5.3 Exploratory Charters (discovery — what the suites cannot assert)

> N charters × 30 min. Lane: any free browser slot (firefox included since 2026-09-08,
> `.claude/rules/agents.md`). Run isolated from the regression pool (3 lanes total).

| ID | Domain | Signals | Mission (discover X that suites Y don't cover) | Candidate scenarios | Technique | Owner |
|----|--------|---------|-----------------------------------------------|---------------------|-----------|-------|
| EXP-01 | ... | C2, C3 | ... | 1. … 2. … 3. … | Feature-pair matrix | qa-testing-expert |

**Not chartered (and why):** `<domain>` — D1 exact oracle → §6 case instead; `<domain>` — D2 separate product.
```

The "Not chartered" line is mandatory: a silently omitted Critical domain is indistinguishable from one
that was considered and correctly ruled out.

## Rules

- Reference example: `docs/Sprint plans/sprint-26-08-test-plan.md` — match its structure section-for-section.
- Pull JIRA items via Atlassian MCP only — do NOT scrape the web. If MCP unavailable, ask user to paste.
- Pull PRs via GitHub MCP only — do NOT shell out to `gh` from this command (the orchestrator runs inline; `gh` is fine inside agent dispatches).
- The sprint window for PRs is the **JIRA sprint dates**, not arbitrary dates. Honor `--from` / `--to` only when explicitly given.
- **Bugs and Stories only** drive scope (Section 2.1 / 2.2). Tasks/TechDebt go to Section 2.3 only if they touch UI selectors or data-test-ids (test-impact). Otherwise → Section 2.4 Out of Scope.
- **Group risk by domain**, not by ticket. The plan stays readable.
- **Never assert exact prices, IDs, SKUs, order numbers** in the plan — refer to test data files / `@td(ALIAS.field)` resolver.
- **Read URLs from `config.js` / `.env`** — never hardcode `vcst-qa.virtocommerce.com` in the plan body; use `{FRONT_URL}` / `{BACK_URL}`.
- **No fabricated suite IDs.** Every suite in Section 5.1 must exist in `config/test-suites.json`. If a domain has no existing suite, list it in 5.2 (Coverage Gap) and propose a target suite.
- **Charters are DERIVED, never invented.** Section 5.3 is a filter over Sections 3 + 5.2 per `.claude/skills/qa-sbtm/sprint-charter-selection.md` — never a domain absent from §3, never a suite absent from §5.1. Same discipline as the no-fabricated-suite-IDs rule above.
- **High risk is not the charter qualifier — oracle fuzziness is.** A domain can score 20 in §3 and still be a pure D1 (one assertable value or contract). Route it to §6 as a test case: a precise oracle makes a case cheaper *and* permanent, whereas a charter buys a one-off verdict.
- **Cap Section 5.3 at 5 charters** and always write the "Not chartered (and why)" line. A charter nobody runs makes the plan look covered; a silently dropped Critical domain is indistinguishable from one correctly ruled out.
- **A charter may run on any of the three lanes**, firefox included since 2026-09-08 (`.claude/rules/agents.md`, confirmed 6×). chrome or edge only.
- **Split Section 5.1 by layer.** Section 5.1 (Suites Activated) is written as two sub-tables — `5.1.1 Frontend Suites` (`regression/suites/Frontend/`) and `5.1.2 Backend Suites` (`regression/suites/Backend/`) — classifying each suite by the layer directory its CSV lives under in `config/test-suites.json`, not by JIRA component. Watch the loyalty split (083/083b storefront → Frontend; 075/075b/075c → Backend) and any admin/GraphQL suites (050*, 0XX admin) → Backend. Preserve suite order within each sub-table and keep the module/sprint-trigger/priority columns unchanged.
- **Honor the BL knowledge file** — when describing test approach for a ticket, reference applicable `BL-*` IDs (`bl:extract -- --domain <d>`; do not edit). If a ticket implies a new invariant, note it as a candidate for the Phase 4c BL audit in a follow-up `/qa-test-lifecycle` run (or a standalone `/qa-review-bl`), not in this plan.
- **Document status defaults to Draft.** Promote to "Approved" only after user review (manual edit).
- **Companion summary.json must validate** — keys exactly as specified, no trailing commas.
- Follow `.claude/templates/agent-dispatch.md` for the test-management-specialist delegation.
- If `--no-jira` is set, the plan must explicitly mark Section 2.1/2.2 as "Reconstructed from PR titles + git log — verify against JIRA before sign-off."
