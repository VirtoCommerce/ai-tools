---
applicability: reference
applicability_rationale: "BA-team shared framework — VirtoOZ-first sourcing, four documentation audiences, no-hardcode + real-user + no-unauthorized-external-write discipline, output policy. Universal across VC customers; the storefront/admin under analysis is data (FRONT_URL/BACK_URL)."
---

# Shared BA Instructions — Virto Commerce Business Analysis

Shared framework for the **BA team** — `ba-system-analyzer`, `ba-api-specialist`, `ba-story-writer`, and
`ba-doc-writer`. These agents analyze a Virto Commerce project (code + GitHub + live UI + docs) and
produce analysis reports, user stories, and **audience-targeted documentation**. Agents reference this
file to avoid duplicating boilerplate.

## What this team is (and is not)
- **Is:** a read-only analysis + authoring team. It reads code, searches VirtoCommerce GitHub repos,
  browses the live storefront/admin like a customer, cross-references VirtoOZ docs, and writes
  analysis/stories/docs to `reports/ba/`.
- **Is not:** a write-capable team. **No commits/PRs to product repos** (that is the `developers/`
  team), and **no writes to external systems** (JIRA / Confluence / GitHub issues / Teams) unless the
  user explicitly asked for it this turn — see "External-write discipline" below.

## Documentation source — VirtoOZ first, always

For any Virto Commerce concept, terminology, module behavior, API surface, or doc-voice question, query
**VirtoOZ MCP first** (via the `/vc-docs` skill). Pick the topic-scoped tool:

| Tool | Use for |
|------|---------|
| `StorefrontUserGuide` | shopper-facing terminology & flows (Customer docs) |
| `PlatformUserGuide` | back-office / admin terminology & procedures (Admin docs) |
| `PlatformDeveloperGuide` / `StorefrontDeveloperGuide` | install, REST/GraphQL APIs, extensibility (Developer docs) |
| `PlatformBackendSourceCode` / `PlatformFrontendSourceCode` / `FrontendSourceCode` | code-level lookup |
| `B2BExperts` | B2B-specific behavior, stories, and benefits |
| `MarketplaceUserGuide` / `MarketplaceDeveloperGuide` / `DeploymentGuide` | marketplace / infra |
| `VirtoCommerce` (general/marketing) | product features, business benefits, case studies — **the source for Sales docs** |

Context7 (`/virtocommerce/vc-docs`) is the **fallback** only. **Never paraphrase platform behavior from
memory** — ground it in a tool result and cite the source.

## The four documentation audiences

The BA team writes for four distinct audiences, each with its own Virto style. The canonical skeletons,
voice rules, and signature elements live in **`.claude/agents/knowledge/virto-doc-style.md` — read it
before authoring any doc.**

| Audience | Style source | Owned by |
|----------|--------------|----------|
| **Customer** (shopper) | StorefrontUserGuide — task-first, zero jargon, screenshots | `ba-doc-writer` |
| **Admin** (operator) | PlatformUserGuide — procedure-heavy, field tables, blade nav | `ba-doc-writer` |
| **Developer** (integrator) | PlatformDeveloperGuide — prerequisites → quick start → runnable code → API ref | `ba-doc-writer` + `ba-api-specialist` (API ref) |
| **Sales** (rep / decision maker) | virtocommerce.com — benefit-led, pain→capability→outcome, use cases, CTA | `ba-doc-writer` |

## Real-user rule (analysis agents)

`ba-system-analyzer` and `ba-api-specialist` drive the live UI. The **hook-enforced real-user rule**
(`.claude/agents/qa/shared-instructions.md` §Browser Interaction) applies in full: click/type/hover/
scroll/wait like a customer; never `browser_evaluate` / `run_code_unsafe` / `evaluate_script` to bypass
the UI. When describing a flow or pain point, describe what a real customer experiences — a disabled
control is a UX signal (validation working), not a "missing capability." An API-only repro is not a
UI-layer finding.

## No-hardcode discipline

Any value in an analysis report, story AC, or doc that depends on the environment must resolve via
`{{VAR}}` (URLs/creds), `@td(ALIAS.field)` (named entities), or the `test-data/graphql/` fixtures.
Never hardcode GUIDs, SKUs, prices, emails, coupon codes, or URL hosts. Full rule:
`.claude/rules/test-data.md`. Sales docs use generic business language and rarely need values at all.

## Business-invariant proposals are advisory only

`ba-system-analyzer` may surface `PROPOSED-BL-*` candidates. **Never modify
`.claude/agents/knowledge/business-logic.md`.** Proposals are staged to `reports/ba/bl-proposals-{date}.md`
for **explicit per-entry user approval**. Every proposal must cite a source (VirtoOZ/Context7 quote,
GitHub `file:line`, VC docs §, or UI screenshot path); drop unsourced entries. See `/ba-analyze` Step 4.5.

## External-write discipline (hard rule)

Do **not** write to JIRA, Confluence, GitHub (issues/PRs/comments), or Teams unless the user explicitly
requested it **in the current turn**. Drafting a story or doc to a local file in `reports/ba/` is the
default; pushing it to an external system is a separate, explicitly-authorized action. Subagents must not
bypass this via Bash→powershell indirection. Codified in memory `feedback_subagent_external_writes`,
`feedback_subagent_interpreter_bypass`.

## Output policy

All BA deliverables go to **`reports/ba/`** as one of the four allowed report categories
(`.claude/rules/reports.md` is the single source of truth for paths, size caps, screenshot budgets, and
required sections). Do NOT create intermediate/working/"draft" files — return reasoning via the
orchestrator, write only the final artifact. Naming: `ba-report-{date}.md`, `{jira-id}-stories.md`,
`{feature}-{audience}-guide.md` (e.g. `vcst-5009-skyflow-customer-guide.md`). The `/ba-analyze`
orchestrator owns index generation across runs — do not write your own `README.md` in `reports/ba/`.

## Knowledge files (read on-demand)

| File | When |
|------|------|
| `knowledge/virto-doc-style.md` | **Before authoring any documentation** — the four audience skeletons |
| `knowledge/business-logic.md` | Before drafting BL proposals or story `Business_Rule` mappings |
| `knowledge/e-commerce-edge-cases-library.md` | Negative ACs / pain-point risk cross-refs (ECL-*) |
| `knowledge/sitemap.md`, `products.md`, `catalog.md`, `store-settings.md` | Storefront/catalog/admin doc references |
| `knowledge/graphql-schema.md` | Authoritative xAPI field/type names for developer docs & story tech notes |
| `knowledge/graphql-test-cases-runner.md` | When recommending GraphQL test coverage downstream |
| `knowledge/module-suite-map.md` | Mapping VC modules → existing regression suites |
| `test-data/aliases.json` + `test-data/graphql/index.json` | Resolving example values & golden-set fixtures |

## Browser assignments (max 3 concurrent, never WebKit on Windows)

| Agent | Server | Fallback |
|-------|--------|----------|
| `ba-system-analyzer` | `playwright-firefox` | `playwright-edge` |
| `ba-api-specialist` | `playwright-edge` | `playwright-firefox` |

`ba-story-writer` and `ba-doc-writer` consume other agents' output and do not require browsers — except
`ba-doc-writer` uses a browser **only** to capture real screenshots for Customer/Admin docs. Do not run BA
browsers in parallel with QA browsers on the same server.
