# ba-api-specialist — `api_docs_markdown` authoring rules

Cited by `.claude/agents/ba-api-specialist.md`; read it before authoring the `api_docs_markdown` output.

### `api_docs_markdown` — authoring rules

Write API docs that a developer can read and use in under 5 minutes. The structure must be **scenario-led with runnable code snippets**, not a per-endpoint template repeated N times.

#### Required structure (top to bottom)

1. **One-paragraph "What this PR/feature adds"** — the punchline, the asymmetry that matters, the migration story. Not a feature list.
2. **Quick reference table** — one row per endpoint/mutation, columns are *scope* and *what's different about this one*. The reader should pick the right call from this table alone.
3. **Common setup** — endpoint URL, auth header, shared input fields. **Show this exactly once.** Do NOT repeat per-endpoint.
4. **Shared input/output types** — once. With a discriminator decision table when types branch (e.g. "when do I pass `option`?").
5. **Recommended response selection** (GraphQL) — once. Match what regression test-data uses; note tax-inclusive variants in one line.
6. **Scenarios** — the heart of the doc. 3-6 numbered flows. Each scenario is:
   - **Narrative** (1-2 sentences): the user journey or trigger.
   - **Mutation + variables** as a single runnable code block (full GraphQL or `curl` for REST).
   - **What happens server-side**: state transition, repricing, locks, persistence, cascade.
   - **Response shape** when it's not obvious from the request.
   - At least one scenario must be a **full multi-step flow** that chains 3+ operations end-to-end (e.g. create → configure → checkout). Do not document each call in isolation.
   - Edge case scenarios where they exist: stale lineItem, parallel-tab conflict, error response shape.
7. **Reference** — compact per-endpoint section. Just the variant-specific fields (everything inherited goes in "Common setup"). Each entry says *"Example: Scenario N"* — do NOT repeat the example.
8. **Errors and side effects** — consolidated table for the whole family.
9. **vs. neighboring endpoints** — short, when relevant. Two paragraphs + one asymmetry table maximum.
10. **Endpoint inventory delta** — final compact table.

#### Hard rules

- **Repetition is a defect.** If you find yourself writing "Inherits cart authorization" or "Same as above" five times, refactor to a shared section.
- **Every code snippet must be runnable.** No fragments without an enclosing operation, no `{...}` placeholders for parts the reader needs.
- **Every mutation example must show variables**, either inline in the operation or in a `# Variables:` block beneath it. A bare mutation field with no inputs is useless.
- **"What happens after" is mandatory** for every mutation example: name the server-side calls (`UpdateConfiguredLineItemPrice`, `RecalculateAsync`, `SaveAsync`, etc.), the locks acquired, the cascade. The reader must know whether to expect a reprice, an index update, a webhook, or a side effect on neighboring entities.
- **No QA-internal sections in the user-facing doc.** "Test-Data File Validation", "API Health and Consistency Findings" and similar audit content belong in the structured JSON output (`health_issues`, `postman_improvements`), NOT in `api_docs_markdown`. Developers reading the docs do not want internal verification artifacts.
- **Schema-validate before publishing.** Confirm every type/field name against `.claude/knowledge/api/graphql-schema.md` (or run live introspection via `scripts/graphql/graphql-runner.ts --query`). Confirm the endpoint URL pattern (`{BACK_URL}/graphql` for xAPI, NOT `/xapi/graphql`).
- **Cross-link companion docs** instead of duplicating. The system-analysis report has flow diagrams and pain-point analysis; the developer-quickstart has React/Apollo storefront code. Link to them from the API doc rather than re-rendering.

#### Skeleton

```markdown
