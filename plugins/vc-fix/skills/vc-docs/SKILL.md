---
name: vc-docs
description: "[VC Knowledge] Documentation lookup via VirtoOZ MCP (primary) or Context7 (fallback): architecture, modules, APIs, deployment, B2B."
argument-hint: "topic | module name | concept"
---

# /vc-docs — Virto Commerce Documentation Lookup

Query up-to-date Virto Commerce documentation via **VirtoOZ MCP** (preferred — 12 specialized retrieval tools scoped per area) or **Context7** (fallback for raw library docs). Use this when you need accurate information about VC architecture, modules, APIs, configuration, deployment, or marketplace.

## Usage
```
/vc-docs dynamic properties          # How dynamic properties work
/vc-docs xAPI cart mutations          # GraphQL xAPI cart operations
/vc-docs fulfillment centers          # Fulfillment center configuration
/vc-docs search indexing              # Elasticsearch/search index setup
/vc-docs modular architecture         # Platform module system
/vc-docs B2B approval workflow        # B2B-specific guidance (use B2BExperts)
/vc-docs deploy to Azure              # Deployment guidance
```

## Tool Selection — VirtoOZ MCP (primary)

VirtoOZ provides 12 topic-scoped tools. Pick the narrowest tool for your query — narrower scope = higher-quality chunks:

| Tool | Use for |
|------|---------|
| `mcp__claude_ai_VirtoOZ_for_virtocommerce_com_docs__VirtoCommerce` | General product / feature / architecture / pricing / case-study questions |
| `…__PlatformUserGuide` | Admin SPA operations — catalog, marketing, customer, order management |
| `…__PlatformDeveloperGuide` | Backend dev — REST/GraphQL APIs, modules, extensibility, CLI, VC Cloud |
| `…__PlatformBackendSourceCode` | Platform backend source lookup |
| `…__PlatformFrontendSourceCode` | Admin SPA (VC-Shell) source lookup |
| `…__StorefrontUserGuide` | Storefront usage from the shopper's perspective |
| `…__StorefrontDeveloperGuide` | vc-frontend (Vue 3 / TS / Tailwind / GraphQL) dev |
| `…__FrontendSourceCode` | vc-frontend source lookup |
| `…__MarketplaceUserGuide` | Marketplace operations |
| `…__MarketplaceDeveloperGuide` | Marketplace dev / extensions |
| `…__DeploymentGuide` | Deployment, infra, Azure, Docker, Kubernetes |
| `…__B2BExperts` | B2B-specific guidance (approval workflows, multi-org, quotes, etc.) |

**Common parameters:** `query` (required, free-text), `top_k` (default 10, lower to 3–5 for focused answers).

## Tool Selection — Context7 (fallback)

Use Context7 only when VirtoOZ returns no relevant chunks or for non-VC libraries (Vue, Playwright, etc.):
- `mcp__context7__resolve-library-id` with `libraryName: "virtocommerce"` → `/virtocommerce/vc-docs`
- `mcp__context7__query-docs` with `libraryId`, `query`, `tokens: 8000`

## Execution Flow

1. **Classify the query** — pick the matching VirtoOZ tool from the table above (route by audience: end-user/admin vs developer vs source code).
2. **Query VirtoOZ** with focused `query` text and `top_k: 3–5`.
3. **If results are thin or off-topic** — broaden via the general `VirtoCommerce` tool, then fall back to Context7.
4. **Synthesize** — clear, structured answer; cite chunks via the URLs returned; reference VC modules/concepts by their correct names.
5. **If docs don't cover the topic** — say so explicitly; suggest the relevant source-code tool or module repo on GitHub.

## Rules

> **Deliberate divergence from the `.claude/` copy — do NOT "fix" this by copying that file over.**
> The project-scoped `.claude/skills/vc-docs/SKILL.md` carries a Step 0 that routes release /
> version / what's-new questions to a generated `.claude/knowledge/domain/release-ledger.md`,
> because VirtoOZ is ~9 months stale on releases. That routing is **absent here on purpose**:
> `vc-fix` does not ship the ledger, and it ships no `scripts/maintenance/`, so it has no way to
> refresh one. Pointing at a file the plugin does not carry would resolve against the user's CWD
> and silently miss. A `vc-fix` run is scoped to a named ticket that already states its version,
> so it never asks "what shipped last month". If that changes, the ledger has to be shipped AND
> given a refresh path AND a drift guard — not hand-copied into a second unguarded location.

- **Always prefer VirtoOZ over training data** — docs evolve faster than the model.
- The xAPI was revamped July 2024 from monolithic ExperienceApi to specialized modules — always query latest.
- Use correct VC terminology: catalogs, price lists, fulfillment centers, dynamic properties, etc.
- This skill is read-only and auto-invocable (no `disable-model-invocation`).
- For source-code-level questions ("where is X implemented?"), prefer the `*SourceCode` VirtoOZ tools or the GitHub MCP over guide tools.
