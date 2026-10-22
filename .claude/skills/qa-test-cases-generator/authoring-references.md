# Authoring references — what `test-management-specialist` reads, by task

Moved out of `agents/test-management-specialist.md` (BUDGET-004: an agent body is re-paid on every dispatch).
**Read the row you need, not the file.** Paths are relative to `.claude/`. The agent body names the two
READ-BEFORE triggers (GraphQL cases, entity-naming cases); everything else is pulled when the step needs it.

## Domain References

| Resource | Reference |
|---|---|
| Business invariants | `npm run bl:extract -- --domain <d>` |
| Edge Cases Library | `knowledge/oracles/e-commerce-edge-cases-library.md` — ECL-* IDs |
| Test Design Examples (toggles/flags) | `skills/qa-test-design/examples/` — one worked file per technique (real QA products CFG-001–CFG-010) |
| Storefront Checklists | `skills/qa-checklist/domain-checklists.md` |
| Backend & Admin Checklists | `skills/qa-checklist/backend-admin-checklists.md` — Admin modules + REST/xAPI |
| GraphQL xAPI Checklist | `skills/qa-checklist/graphql-checklist.md` — xCatalog/xCart/xOrder/xProfile/xQuote/xCMS/xFrontend + New Query/Mutation Verification |
| GraphiQL Interaction Guide | `knowledge/api/graphiql-interaction.md` — CodeMirror editor interaction, auth headers, query typing, execution |
| **Authoring Runner-Native GraphQL Cases** | `knowledge/api/graphql-test-cases-runner.md` — **READ THIS BEFORE writing or migrating any GraphQL test case.** Canonical contract for the `Steps` / `Assertions` / `Cleanup` grammar consumed by `scripts/graphql/graphql-runner.ts`: tag list, predicate shapes, path syntax, `@td()` + capture rules, schema validation, authoring checklist, gold-standard examples (050i). |
| **Live Discovery + Random Inputs** | `knowledge/execution/live-discovery.md` — **READ THIS BEFORE authoring any case that names a product/address/cart/coupon entity.** Carries the `{{VAR}}` / `@td()` / `live-discover` / `random-data` decision tree, the JS helpers, the CSV-runner recipes and parallel-run isolation. |
| Live xAPI Schema Snapshot | `knowledge/api/graphql-schema.md` — types/fields/inputs from live introspection. Every new GraphQL query/mutation MUST validate against this (or run `scripts/graphql/graphql-runner.ts --query "<inline>"` for a live check). |
| Test Case Template (15-col CSV) | `skills/qa-test-cases-generator/test-case-template.md` |
| **Role scenarios (Part 0r)** | `skills/qa-test/authoring.md` §Artifact A — a permission-scoped model carries role scenarios; **every `Not allowed` item is its own case**, asserted at the SERVER with that role's token |

## Additional References

| Area | File |
|---|---|
| Test Case Generator Skill | `skills/qa-test-cases-generator/SKILL.md` |
| xAPI & REST API Reference | `skills/qa-api/xapi-query-ref.md` — ready-to-use query/mutation signatures for Steps column |
| API Test Case Patterns | `skills/qa-api/api-test-case-patterns.md` — coverage checklists, REST/GraphQL step tags, per-domain test ID patterns, negative test sets, skeletons |
| Test Data Combination Design | `skills/qa-generate-data/SKILL.md` — DESIGN cross-entity combinations (learn-live → pairwise matrix → reuse/gap → `@td()` combo aliases) BEFORE seeding. Run in workflow step 5b. **Delegate the actual authoring of new seeders / fixtures / validators to the `test-data-engineer` agent** — you design what data is needed; it writes the scripts that provision it (`knowledge/execution/test-data-authoring.md`). |
| Test Data Seeding | `skills/qa-seed-data/SKILL.md` |
| E2E Scenario Catalog | `skills/qa-plan/e2e-scenario-catalog.md` |
| Module → Suite Mapping | `knowledge/execution/module-suite-map.md` |
| Storefront Sitemap | `knowledge/domain/sitemap.md` |
| **What shipped recently** | `knowledge/domain/release-ledger.md` — `component@version` + docs link + ⚠ BREAKING flag per feature. Consult when authoring cases for a surface that changed since the env's deployed version: a feature shipped last month is asserted by no existing case, so it is a coverage gap by construction. **Released ≠ deployed** (a case asserting an undeployed feature is `NOT_DEPLOYED`, not a FAIL), it carries **no behaviour** so it can never ground an assertion as `{DOC}`, and it is `exhaustive: false` |

## Test Design Techniques

| Technique | When | Example |
|---|---|---|
| **Equivalence Partitioning** | Input fields | Valid / invalid / empty email |
| **Boundary Value Analysis** | Quantities, prices | qty=0, 1, max-1, max, max+1 |
| **Decision Tables** | Complex rules with multiple conditions | Configurable section type × sale price × promo type |
| **State Transitions** | Lifecycles & runtime toggle changes | Order states; admin toggles mid-session |
| **Pairwise / Combinatorial** | Many toggles/flags, full combo infeasible | Product type × section × stock × promo (2,160 → ~30 cases) |
| **Classification Tree** | Structured coverage of product type hierarchy | Type → Section → Pricing → Availability branches |
| **Error Guessing** | Known failures | Double-click submit, back after payment |

Full reference: `skills/qa-test-design/test-design-techniques.md`
**Applied examples:** `skills/qa-test-design/examples/` — 9 per-technique files mapped to real QA products CFG-001–CFG-010
