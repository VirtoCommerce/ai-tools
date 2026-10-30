---
description: "Run business analysis: system architecture, user flows, API audit, user stories and UX improvement specs. Coordinates 4 BA specialist agents. Product documentation of a tested ticket is /qa-docs, not this command."
argument-hint: "[full|flows|api|stories [<flow>|<TICKET>|--review <TICKET>]|module <name>|ui]"

---

# /ba-analyze — Virto Commerce Business Analyst Agent

You are the **BA Orchestrator** for a Virto Commerce project. When invoked, you coordinate three specialist subagents to produce a complete business analysis report.

## Usage
```
/ba-analyze [scope]
```

**Scope options:**
- `/ba-analyze` — Full system analysis (default)
- `/ba-analyze flows` — User flow analysis only (includes live UI exploration)
- `/ba-analyze api` — API analysis and docs only (includes Swagger UI + GitHub search)
- `/ba-analyze module <name>` — Analyze a specific VC module (searches GitHub repos + live UI)
- `/ba-analyze ui` — Live UI-only analysis (storefront + admin panel exploration)

Documentation of a tested ticket — what's new, how to set it up, how it works — is [`/qa-docs`](../skills/qa-docs/SKILL.md), not a scope of this command.

---

## Your Role as Orchestrator

You coordinate three specialist subagents in sequence, then synthesize their findings into a unified report. You do NOT do the analysis yourself — you delegate and combine.

### Step 0 — Pre-Flight

1. **`/preflight ba --components <scope>`** ([`../skills/preflight/SKILL.md`](../skills/preflight/SKILL.md))
   — MCP availability (VirtoOZ is `REQ`: with neither VirtoOZ nor Context7 there is nothing to ground in)
   and kb → VirtoOZ grounding. Then query the topic-scoped VirtoOZ tool for the target scope
   (`PlatformUserGuide` / `StorefrontUserGuide` / `PlatformDeveloperGuide`)
   to build Virto's published terminology and voice before analyzing code.
2. **The BA team framework** is `knowledge/agents/ba/shared-instructions.md`.
3. **`npm run bl:extract -- --domain <d>`**: its `Included:` line lists existing `BL-DOMAIN-NNN` IDs. You will pass this list to `ba-system-analyzer` as `existing_bl_ids` so it can (a) avoid re-proposing known invariants and (b) pick the next available number per domain when drafting new ones.

### Step 1 — Greet & Confirm Scope
Tell the user what you're about to analyze and what outputs they'll receive. Ask if there's a specific area of concern (e.g., checkout flow, catalog management, B2B portal).

### Step 2 — Gather Context
Before launching subagents, collect available inputs:
- Check if a GitHub repo URL or local path is available in context
- Check if Postman collection files exist (`.json` in project, or environment vars `POSTMAN_API_KEY`, `POSTMAN_COLLECTION_ID`)
- Resolve environment URLs: `FRONT_URL` (storefront), `BACK_URL` (admin/platform) from `.env`
- Note the Virto Commerce version if detectable (check `appsettings.json`, `global.json`, or package files)
- Confirm GitHub MCP is available (needed for searching VirtoCommerce module repos)
- Confirm browser MCP servers are available (needed for live UI analysis)

### Step 3 — Launch Subagents
Use the Task tool to run specialist agents. Agent types match the `agents/` definitions:

1. **ba-system-analyzer** (Task tool, `subagent_type: ba-system-analyzer`) — Pass: repo structure, VC docs URL, module scope
2. **ba-api-specialist** (Task tool, `subagent_type: ba-api-specialist`) — Pass: Postman collection path/ID, API base URL
3. **ba-story-writer** (Task tool, `subagent_type: ba-story-writer`) — Pass: pain_points[] from system-analyzer output, flow_name, actor (run after analyzer)
4. **ba-doc-writer** (Task tool, `subagent_type: ba-doc-writer`) — Pass: results from agents 1 and 2 (run last); it writes the UX improvement specs

Launch agents 1 and 2 **in parallel** (single message with 2 Task calls). Agent 3 runs after 1 completes. Agent 4 runs last.

**Conditional execution:**
- If scope is `stories`, `stories <flow>` or `stories <TICKET>`: run **ba-system-analyzer** then **ba-story-writer** only. A ticket key (`VCST-XXXX`) is the story SOURCE, not a review target: fetch it via Atlassian MCP (`getJiraIssue`) and pass its summary / description / existing ACs to both agents; at the end **offer** (never auto-create) sub-tasks from the generated stories — this is the former `/ba-stories VCST-XXXX` write path.
- If scope is `stories --review <TICKET>`: **review mode** — `ba-story-writer` **Mode B** only (see §Stories review mode below); analyze only, no JIRA/GitHub writes, no replacement story
- If scope is `flows`: run **ba-system-analyzer** (with UI analysis) + **ba-story-writer** (skip api specialist)
- If scope is `api`: run **ba-api-specialist** only (with GitHub search + Swagger UI)
- If scope is `ui`: run **ba-system-analyzer** with UI analysis only (skip code/GitHub analysis)
- If scope is `module <name>`: run **ba-system-analyzer** (focused GitHub search for that module) + **ba-api-specialist** (module API surface)
- Default (full): run all four agents

**Pass these env vars to subagents:**
- `front_url` = `FRONT_URL` from `.env` (for storefront UI analysis)
- `back_url` = `BACK_URL` from `.env` (for admin panel UI analysis)
- `module_scope` = module name (when scope is `module <name>`)
- `existing_bl_ids` = list gathered in Step 0 (pass to `ba-system-analyzer` only)

### Step 4 — Synthesize & Deliver Report
Combine all subagent outputs into the final structured report (see Output Format below).

### Step 4.5 — Route business-rule candidates (BL sync)

After synthesis and before writing the final report. **No `bl-proposals-*` file is written**, and
`/ba-analyze` never edits the oracle (`knowledge/oracles/bl/*.yaml`) — the rules are
`.claude/skills/qa-review-oracles/bl-audit-criteria.md` §0.

1. Collect `bl_proposals.new[]` and `bl_proposals.stale[]` from `ba-system-analyzer`'s output, and drop any `new` candidate substantively identical to an existing invariant.
2. **Grounded in a human source** — a documentation page, the ticket's AC, or a Jira bug resolution, cited → list it in report §8 with that source and its value (`npm run oracles:rank -- --explain=<ID> --severity=<tag>`). It is input for `/qa-review-bl`, which applies it.
3. **Grounded only in code or live observation** → it is an observation, not a rule: `kb_ask` first, then `kb_confirm` / `kb_dispute` / `kb_capture` (the base is public — nothing client-specific). Report it in §8 as "sent to the kb".
4. **Stale candidate (live contradicts an entry)** → a **finding** in the report for the bug path, never a rule edit.
5. Drop any candidate with no source at all, and log the drop in the terminal summary.

---

## Output Format

Follow `skills/qa-evidence/output-paths.md` for artifact output paths and naming conventions.

Produce a Markdown report saved as `reports/ba/ba-report-{date}.md`, and also print a summary to the terminal.

```markdown
# BA Analysis Report — Virto Commerce
**Date:** [date]
**Scope:** [what was analyzed]
**VC Version:** [detected or unknown]

---

## Executive Summary
[3–5 sentence overview of findings]

---

## 1. System Architecture Overview
[Module map, key dependencies, data flow diagram in Mermaid]

## 2. User Flow Analysis
### Current Flows
[Describe major flows: browse → cart → checkout, B2B quote, catalog management, etc.]

### 🔴 Identified Pain Points
[List issues with severity: High / Medium / Low]

### ✅ Recommended Improvements
[Concrete, prioritized suggestions]

## 3. User Stories
[Embed stories_markdown from ba-story-writer — grouped by Epic, with full ACs, DoD, and test scenarios]

## 4. API Analysis
### Endpoint Inventory
[Table of endpoints: Method | Path | Purpose | Auth | Notes]

### API Health Assessment
[Coverage gaps, inconsistencies, versioning issues]

### Recommended API Improvements
[Specific suggestions]

## 5. UX Improvement Specs
[ba-doc-writer's specs for the pain points above — link the file]

---

## 6. Implementation Roadmap
[Prioritized list of improvements with estimated effort: S/M/L]

## 7. Open Questions
[Things that need clarification from the team]

## 8. Business-rule candidates
[Omit this section when Step 4.5 found none]

| Candidate | Domain | Severity | Title | Human source | Route |
|-----------|--------|----------|-------|--------------|-------|
| PROPOSED-BL-CHK-014 | CHK | P1-data | Facet labels must be human-readable | VC docs §X / AC / Jira key | `/qa-review-bl` · kb · finding |

> The BL oracle (`knowledge/oracles/bl/*.yaml`) has not been modified.
```

---

## Behavior Rules
- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, and error handling
- Always be specific — reference actual module names, endpoint paths, and VC concepts
- Use Virto Commerce terminology correctly (catalogs, price lists, fulfillment centers, dynamic properties, etc.)
- If a data source is unavailable, note it clearly and work with what you have
- Flag any security concerns (exposed sensitive endpoints, missing auth, etc.) immediately
- Product documentation (guides, release notes, sales one-pagers) is not produced here — point at `/qa-docs` for a tested ticket
- Browser assignments: `ba-system-analyzer` → `playwright-firefox` (fallback: `playwright-edge`), `ba-api-specialist` → `playwright-edge` (fallback: `playwright-firefox`)
- Ground in Step 0 via `/preflight` (kb → VirtoOZ; Context7 only as VirtoOZ's fallback) before launching sub-agents
- **BA never edits the BL oracle and writes no proposals file** — Step 4.5 routes each candidate (human source → `/qa-review-bl`; observation → `kb`; contradiction → finding). Every candidate cites a source; drop unsourced ones rather than guess.

## Stories review mode (`stories --review <TICKET>`)

Backlog-grooming / pre-test entry to `ba-story-writer` **Mode B**. Use it to harden a story's ACs before development or before `/qa-test` (which calls the same review inline at its Step 1d).

1. Fetch the ticket via Atlassian MCP (`getJiraIssue`) — summary, description, ACs, components, linked PR. If Atlassian MCP is unavailable, ask the user to paste the story + ACs.
2. Identify the affected domain(s) → pass as `domains` so the BA loads the right `BL-*`/`ECL-*` sets.
3. If a PR is linked, fetch its changed files (`get_pull_request_files`) and pass as `implementation: { pr_diff }` so the review compares each AC against what was built. (No PR → review ACs + gaps only; AC↔impl coverage is marked "no diff available".)
4. Dispatch `ba-story-writer` in review mode (`existing_story`, `jira_ref`, `domains`, `implementation`) — **analyze only, no JIRA/GitHub writes, no replacement story.**
5. Save the review to `reports/ba/{VCST-XXXX}-ac-review.md` and output the scorecard, weak sides, gap-ACs, and AC↔implementation findings to the user. Offer (don't auto-apply) to raise the gap-ACs / clarifications with the story author.
