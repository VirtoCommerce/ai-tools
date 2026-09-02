---
applicability: universal
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
voice rules, and signature elements live in **`knowledge/ba/virto-doc-style.md` — read it
before authoring any doc.**

| Audience | Style source | Owned by |
|----------|--------------|----------|
| **Customer** (shopper) | StorefrontUserGuide — task-first, zero jargon, screenshots | `ba-doc-writer` |
| **Admin** (operator) | PlatformUserGuide — procedure-heavy, field tables, blade nav | `ba-doc-writer` |
| **Developer** (integrator) | PlatformDeveloperGuide — prerequisites → quick start → runnable code → API ref | `ba-doc-writer` + `ba-api-specialist` (API ref) |
| **Sales** (rep / decision maker) | virtocommerce.com — benefit-led, pain→capability→outcome, use cases, CTA | `ba-doc-writer` |

## Real-user rule (analysis agents)

`ba-system-analyzer` and `ba-api-specialist` drive the live UI. The **hook-enforced real-user rule**
(`knowledge/agents/qa/shared-instructions.md` §Browser Interaction) applies in full: click/type/hover/
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
`knowledge/oracles/business-logic.md`.** Proposals are staged to `reports/ba/bl-proposals-{date}.md`
for **explicit per-entry user approval**. Every proposal must cite a source (VirtoOZ/Context7 quote,
GitHub `file:line`, VC docs §, or UI screenshot path); drop unsourced entries. See `/ba-analyze` Step 4.5.

## External-write discipline (hard rule)

Do **not** write to JIRA, Confluence, GitHub (issues/PRs/comments), or Teams unless the user explicitly
requested it **in the current turn**. Drafting a story or doc to a local file in `reports/ba/` is the
default; pushing it to an external system is a separate, explicitly-authorized action. Subagents must not
bypass this via Bash→powershell indirection. Codified in memory `feedback_subagent_external_writes`,
`feedback_subagent_interpreter_bypass`.

**When the write IS authorized, the mechanics are not yours to invent.** Pushing a doc, guide, release
note or analysis to a ticket follows `.claude/knowledge/execution/tracker-ops.md` — read it BEFORE the
first API call, not after the first failure:

- **§5d** — publishing a deliverable to a ticket means **the deliverable, in full, in the comment body**.
  A summary plus a repo path is not a delivery.
- **§5c** — a Markdown image reference in a Jira comment renders as **nothing**, silently, at `200 OK`.
  Screenshots require both halves: attach via the REST endpoint (the Atlassian MCP has no attachment
  tool), then reference them as **wiki markup through the v2 comment API**. That is the single carve-out
  to the Markdown-everywhere rule in §Body format, and the whole comment body must then be wiki.
- **§5c also tells you which dead ends not to re-probe** — a hand-built ADF `media` node is rejected
  whatever you put in `collection`, and an `external` URL posts fine then renders an error string.

Skipping this section costs a round trip every time: VCST-5281 shipped twelve invisible screenshots,
and a 2026-09-02 run re-derived all four failure modes from scratch because the BA framework had no
pointer here. Consult it first.

## Self-check & verify work (MANDATORY)

Before returning any analysis, story, or doc, **verify your own output** — a tool call succeeding is not
proof the content is correct or complete. This is a hard rule for every BA agent.

- Re-read the deliverable for internal consistency, and confirm every factual claim about platform
  behavior is grounded in a cited VirtoOZ/source/live result (per "Documentation source — VirtoOZ
  first"), never paraphrased from memory.
- Confirm no hardcoded env-specific values slipped in (no-hardcode discipline) and that every
  `PROPOSED-BL-*` cites a real source.
- Report honestly what you verified versus what remains an open question — don't present an unverified
  assumption as a finding.

Codified in memory `feedback_agents_self_check_and_verify`.

## Output policy

All BA deliverables go to **`reports/ba/`** as one of the **ten** allowed report categories
(`.claude/rules/reports.md` is the single source of truth for paths, size caps, screenshot budgets, and
required sections). Do NOT create intermediate/working/"draft" files — return reasoning via the
orchestrator, write only the final artifact. Naming: `ba-report-{date}.md`, `{jira-id}-stories.md`,
`{feature}-{audience}-guide.md` (e.g. `vcst-5009-skyflow-customer-guide.md`), and — under the two named
sub-paths — `test-models/<TICKET>-<date>.md` and
`release-notes/<ticket>-<layer>-release-note.md` / `release-notes/release-<label>.md`. The `/ba-analyze`
orchestrator owns index generation across runs — do not write your own `README.md` in `reports/ba/`.

## Knowledge files (read on-demand)

| File | When |
|------|------|
| `knowledge/ba/virto-doc-style.md` | **Before authoring any documentation** — the four audience skeletons, plus §9 for release notes (where the layer picks the audience) |
| `knowledge/oracles/business-logic.md` | Before drafting BL proposals or story `Business_Rule` mappings |
| `knowledge/oracles/e-commerce-edge-cases-library.md` | Negative ACs / pain-point risk cross-refs (ECL-*) |
| `knowledge/domain/sitemap.md`, `products.md`, `catalog.md`, `store-settings.md` | Storefront/catalog/admin doc references |
| `knowledge/api/graphql-schema.md` | Authoritative xAPI field/type names for developer docs & story tech notes |
| `knowledge/api/graphql-test-cases-runner.md` | When recommending GraphQL test coverage downstream |
| `knowledge/execution/module-suite-map.md` | Mapping VC modules → existing regression suites |
| `test-data/aliases.json` + `test-data/graphql/index.json` | Resolving example values & golden-set fixtures |

## Browser assignments (max 3 concurrent, never WebKit on Windows)

| Agent | Server | Fallback |
|-------|--------|----------|
| `ba-system-analyzer` | `playwright-firefox` | `playwright-edge` |
| `ba-api-specialist` | `playwright-edge` | `playwright-firefox` |

`ba-story-writer` and `ba-doc-writer` consume other agents' output and do not require browsers — except
`ba-doc-writer` uses a browser **only** to capture real screenshots for Customer/Admin docs. Do not run BA
browsers in parallel with QA browsers on the same server.
