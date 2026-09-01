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

## Step 0 — Is this a RELEASE question? (check before anything else)

VirtoOZ is the authority on how the product *works*. It is **not** an authority on what shipped
recently: its newest version page is `v3-2025-S12` (Platform **3.917.1**, frontend **2.36.0**) while
production is Platform **3.1063.0** / frontend **2.56.0** — roughly nine months of releases it cannot
see. Two features from the September 2026 digest were probed against `PlatformUserGuide` and it
returned nothing for either. So route the release axis somewhere else FIRST.

| Question shape | Read FIRST |
|---|---|
| what shipped · what's new · which version introduced X · since when · is X supported yet · recently added · new in · `3.10NN` / `2.5N` · *что нового* · *релиз* · *в какой версии* | **`.claude/knowledge/domain/release-ledger.md`** §1 (latest per component), §2 (last 6 months in full), §3 (older months index), §4 (component → month) |
| how does X work · where is it configured · what fields · API shape · deployment | VirtoOZ, per the table below |
| is it deployed on the env I am testing? | **neither** — `GET {{BACK_URL}}/api/platform/modules`. See `.claude/templates/agent-dispatch.md` § Build Verification |

The ledger is generated from the monthly community release digests (`npm run releases:refresh`) and
carries, per feature: title, `component@version`, the GitHub release tag, a docs deep link, and a
breaking-change flag. It is a local file read — no MCP call, no token cost beyond the read.

## Tool Selection — VirtoOZ MCP (primary for everything except the release axis)

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

0. **Release axis?** — if the query matches Step 0's left column, read the ledger first and only fall through to VirtoOZ for the *behaviour* half of the question.
1. **Classify the query** — pick the matching VirtoOZ tool from the table above (route by audience: end-user/admin vs developer vs source code).
2. **Query VirtoOZ** with focused `query` text and `top_k: 3–5`.
3. **If results are thin or off-topic** — broaden via the general `VirtoCommerce` tool, then fall back to Context7.
4. **Synthesize** — clear, structured answer; cite chunks via the URLs returned; reference VC modules/concepts by their correct names.
5. **If docs don't cover the topic** — say so explicitly; suggest the relevant source-code tool or module repo on GitHub.

## Rules

**Precedence is per-axis, not global.** One blanket "always prefer VirtoOZ" rule was wrong for the
release axis, and the next line down is the evidence: it is a hand-written staleness patch for one
known drift, which is exactly what a ledger replaces.

- **Evergreen "how does it work"** → VirtoOZ first, Context7 fallback, ledger never. VirtoOZ is the authority, and always beats training data — docs evolve faster than the model.
- **Release / version / what's-new** → **ledger first**. Where the two disagree on whether a feature exists, the ledger wins if its `generated:` date is newer than VirtoOZ's newest version page.
- **A ledger miss is NOT a negative result.** It is an editorial monthly digest, not an exhaustive changelog (`exhaustive: false` in its own frontmatter). On a miss, escalate — the newest digest topic → the module's GitHub Releases → the live env. Never answer *"that feature does not exist"* from a ledger miss.
- **Released ≠ deployed.** The ledger says what exists in the product line, never what is running on the env under test. A capability it records that the live probe does not carry is `NOT_DEPLOYED`, never a bug.
- **If the ledger's `generated:` is >45 days old**, say so in the answer and suggest `npm run releases:refresh`. A stale ledger presented as current is worse than no ledger: it turns "I don't know what shipped" into a confident "nothing shipped".
- The xAPI was revamped July 2024 from monolithic ExperienceApi to specialized modules — always query latest.
- Use correct VC terminology: catalogs, price lists, fulfillment centers, dynamic properties, etc.
- This skill is read-only and auto-invocable (no `disable-model-invocation`).
- For source-code-level questions ("where is X implemented?"), prefer the `*SourceCode` VirtoOZ tools or the GitHub MCP over guide tools.
