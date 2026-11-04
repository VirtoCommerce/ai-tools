# Documentation sources — which one answers which question

The single source for **where documented product behaviour comes from**: VirtoOZ through its connector,
the release ledger, the module repositories' own docs, and the fallbacks. It replaced the `/vc-docs` skill
(removed 2026-10-30): VirtoOZ is a connector every session can call directly, so a skill that only
wrapped it was a second door to the same tools. The rule for WHEN a claim needs a documented source is
[`../../../CLAUDE.md`](../../../CLAUDE.md) §Essential Rules → *Product context*; this file is the HOW.

## Which source answers which question

Check the release axis first: VirtoOZ is the authority on how the product *works*, not on what shipped
recently. Its newest version page is `v3-2025-S12` (Platform **3.917.1**, frontend **2.36.0**) while
production runs about nine months of releases ahead of it.

| Question shape | Read FIRST |
|---|---|
| what shipped · what's new · which version introduced X · since when · is X supported yet · `3.10NN` / `2.5N` — in any language | **[`../domain/release-ledger.md`](../domain/release-ledger.md)** §1 (latest per component), §2 (last 6 months in full), §3 (older months index), §4 (component → month) |
| how does X work · where is it configured · what fields · API shape · deployment | **VirtoOZ**, through the connector (§VirtoOZ through the connector) |
| one module's settings, defaults, limits or API that VirtoOZ is thin on · a NEW module with no doc page | **the module repo's `README.md` + `docs/`**, at the tag of the deployed version ([`../agents/qa/shared-instructions.md`](../agents/qa/shared-instructions.md) §Module repo docs) |
| is it deployed on the env I am testing? | **none of them** — `GET {{BACK_URL}}/api/platform/modules` ([`../../templates/agent-dispatch.md`](../../templates/agent-dispatch.md) §Build Verification) |
| what does it actually DO on the build in front of me · does it really behave the way the guide says | **`mcp__kb__kb_ask`** — what was OBSERVED, on a named deployment, with a trust count |

**The last row is VirtoOZ's blind spot.** The months of releases it cannot see are exactly the window in
which behaviour was observed and written down here, and a released behaviour the guides document
**wrongly** returns a confident answer rather than nothing. Put the coordinate (endpoint, GraphQL
operation, page path) in the `kb` question; exit 1 means nobody has recorded it yet.

## VirtoOZ through the connector

VirtoOZ is a claude.ai connector, not a project MCP server, so **its tool names carry the connector's id
and differ between installations** (`mcp__<connector-id>__PlatformUserGuide`). Never hard-code a full
tool name in a prompt: name the tool by its short name below. The tools are usually **deferred** — load
them with `ToolSearch` (query `PlatformUserGuide` or the short name you need) before the first call.

| Tool (short name) | Use for |
|---|---|
| `VirtoCommerce` | general product, feature, architecture, pricing, case studies — the source for Sales docs |
| `PlatformUserGuide` | Admin SPA operations — catalog, marketing, customer, order management |
| `PlatformDeveloperGuide` | backend development — REST/GraphQL APIs, modules, extensibility, CLI, VC Cloud |
| `PlatformBackendSourceCode` | platform backend source lookup |
| `PlatformFrontendSourceCode` | Admin SPA (VC-Shell) source lookup |
| `StorefrontUserGuide` | the storefront from the shopper's side |
| `StorefrontDeveloperGuide` | vc-frontend (Vue 3 / TS / Tailwind / GraphQL) development |
| `FrontendSourceCode` | vc-frontend source lookup |
| `MarketplaceUserGuide` / `MarketplaceDeveloperGuide` | marketplace operations / extensions |
| `DeploymentGuide` | deployment, infrastructure, Azure, Docker, Kubernetes |
| `B2BExperts` | B2B-specific behaviour — approvals, multi-organization, quotes |

Each takes `query` (free text, required) and `top_k` (default 10; 3–5 for a focused answer). Pick the
narrowest tool for the question; narrower scope gives better chunks. Thin or off-topic results: broaden
to `VirtoCommerce`, then the fallback.

**Fallback — Context7.** Only when VirtoOZ returns nothing relevant or the connector is not available:
`mcp__context7__resolve-library-id` with `libraryName: "virtocommerce"` → `/virtocommerce/vc-docs`, then
`mcp__context7__query-docs` with that id, the query and `tokens: 8000`. Neither available: say so and stop
— never answer a product question from memory.

## Rules

- **Precedence is per axis, not global.** How it works → VirtoOZ, then Context7, never the ledger.
  Release / version / what's new → the ledger first; where it and VirtoOZ disagree on whether a feature
  exists, the ledger wins when its `generated:` date is newer than VirtoOZ's newest version page.
- **A ledger miss is not a negative result.** The ledger is an editorial monthly digest
  (`exhaustive: false`). On a miss, escalate — the newest digest topic → the module's GitHub Releases →
  the live env. Never answer *"that feature does not exist"* from a ledger miss.
- **Released ≠ deployed.** The ledger says what exists in the product line, never what runs on the env
  under test. A capability it records that the live probe does not carry is `NOT_DEPLOYED`, never a bug.
- **A stale ledger is said aloud.** `generated:` more than 45 days old: say so and suggest
  `npm run releases:refresh`.
- **Cite what you used.** A doc claim carried into a report, case or verdict is a verbatim quote with its
  URL — the chunk URL VirtoOZ returns, or the README file URL at the deployed tag.
- **Source-code questions** ("where is X implemented?") go to the `*SourceCode` tools or the GitHub MCP,
  not to the guides.
- **The xAPI was split into per-domain modules in July 2024** — query the current docs, never the old
  monolithic ExperienceApi.
