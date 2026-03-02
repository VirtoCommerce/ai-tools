---
description: "[VC Knowledge] Documentation lookup via Context7: architecture, modules, APIs, deployment."
argument-hint: "topic | module name | concept"
---

# /vc-docs — Virto Commerce Documentation Lookup

Query up-to-date Virto Commerce platform documentation via Context7. Use this when you need accurate information about VC architecture, modules, APIs, configuration, or deployment.

## Usage
```
/vc-docs dynamic properties          # How dynamic properties work
/vc-docs xAPI cart mutations          # GraphQL xAPI cart operations
/vc-docs fulfillment centers          # Fulfillment center configuration
/vc-docs search indexing              # Elasticsearch/search index setup
/vc-docs modular architecture         # Platform module system
```

## Supporting Files

None — this skill queries Context7 MCP directly (`/virtocommerce/vc-docs`).

## Execution

1. **Resolve the Context7 library ID:**
   - Use `mcp__context7__resolve-library-id` with `libraryName: "virtocommerce"` or `libraryName: "vc-docs"`
   - The canonical library ID is `/virtocommerce/vc-docs`

2. **Query documentation:**
   - Use `mcp__context7__query-docs` with:
     - `libraryId: "/virtocommerce/vc-docs"`
     - `query:` the user's topic (e.g., "dynamic properties", "xAPI cart mutations")
     - `tokens: 8000` for comprehensive answers (default 5000 may be too brief)

3. **Synthesize and respond:**
   - Provide a clear, structured answer based on the documentation
   - Include relevant code examples, configuration snippets, or API patterns
   - Reference specific VC modules and concepts by their correct names
   - If the docs don't cover the topic, say so clearly

## Common Topics

| Topic | Query Hint |
|-------|-----------|
| Module system | "modular architecture platform modules" |
| GraphQL xAPI | "xAPI storefront queries mutations" |
| REST API | "platform REST API endpoints" |
| Dynamic properties | "dynamic properties configuration" |
| Search/indexing | "search indexing elasticsearch" |
| Multi-store | "multi-store multi-tenant configuration" |
| Pricing | "price lists pricing engine" |
| Catalog | "catalog products categories properties" |
| Orders | "order processing workflow" |
| Deployment | "deployment docker kubernetes azure" |

## Rules
- Always use Context7 for VC docs — do not rely on training data which may be outdated
- The xAPI was revamped July 2024 from monolithic ExperienceApi to specialized modules — always query latest
- Use correct VC terminology: catalogs, price lists, fulfillment centers, dynamic properties, etc.
- This skill is read-only and auto-invocable (no `disable-model-invocation`)
