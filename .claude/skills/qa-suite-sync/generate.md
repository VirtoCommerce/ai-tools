# qa-suite-sync — Phase 3, analyze and generate

Supporting file for [`qa-suite-sync`](SKILL.md). Read it at Phase 3 — the subagent reads it.

### Phase 3 — ANALYZE & GENERATE (Coverage Gaps)

**Runs when:** every run. For change sources, also handles NEW_NEEDED from Phase 2.

Dispatch `test-management-specialist` (continuing from Phase 2 delegation).

#### 3a. Coverage Gap Detection

1. Read target suite CSV(s) — parse all existing test cases
2. Load domain context:
   - Domain checklist(s) from `.claude/skills/qa-checklist/domain-checklists.md` / `.claude/skills/qa-checklist/graphql-checklist.md`
   - BL-*: `npm run bl:extract -- --domain <d>`
   - ECL-* patterns from `.claude/knowledge/oracles/e-commerce-edge-cases-library.md`
   - Expected coverage from `.claude/skills/qa-coverage-gap/feature-domain-map.md`
   - Product types and test data from `.claude/knowledge/domain/products.md`
3. Query VirtoOZ (`/vc-docs`; Context7 fallback) for domain-relevant topics
4. Identify gaps:
   - Checklist items with no corresponding test case
   - BL-* invariants with no test case mapping
   - ECL-* patterns relevant but not referenced
   - Features in VC docs but not tested
   - NEW_NEEDED items from Phase 2 (change-driven only)
   - For JIRA tickets: acceptance criteria not covered
5. Score gaps by business impact (P0/P1/P2)

**Gate:** If 0 gaps found and 0 NEW_NEEDED → skip generation, proceed to Phase 4.

#### 3b. Prepare Test Data (Combinations)

**Runs when:** Gaps/NEW_NEEDED exist.

Before authoring any case, prepare the data each gap needs so cases reference *prepared* combinations, not ad-hoc values. `test-management-specialist` (continuing delegation) invokes the **[`/qa-generate-data`](../qa-generate-data/SKILL.md)** skill, scoped to the feature/flow behind the gaps (or the JIRA ticket for change sources):

1. The skill scopes scenarios → learns live variant space → designs the **combination matrix** (pairwise/all-pairs) → resolves each cell **reuse-first**, authoring only true gaps as `seeded=false` fixtures + `@td()` combination aliases, then runs `scripts/test-data/validate-td-refs.ts` (green gate).
2. It returns the **combination matrix inline** (Combo IDs + scenario-covered + reuse-vs-gap breakdown) — the on-disk output is the gap fixtures (`test-data/<domain>/*.csv`) + aliases (`test-data/aliases.json`). No stray files (honors `.claude/rules/reports.md`).
3. Map each gap (and NEW_NEEDED item) to one or more **Combo IDs** — this mapping drives 3c (one case / case-group per combination).
4. If gap fixtures were authored (`seeded=false`), note in the final report that **`/qa-seed-data <domains>` must run before these cases execute live** (reused cells already exist). The skill never provisions.

> Data-prep is **design + author fixtures only** — never provisioning, never editing suite CSVs (the `/qa-generate-data` boundary). Cases written in 3c consume the combinations via `@td(COMBO_ALIAS.field)`.

#### 3c. Generate Test Cases

1. **Deduplication pre-check** — read target suite CSV and related suites. Skip if existing case covers the gap.
   - For each gap, author one case (or case group) **per Combo ID** from 3b; set the `Test_Data` column to `@td(COMBO_ALIAS.field)` — never hardcode the prepared values (`.claude/rules/test-data.md`).
2. **Query VirtoOZ** (Context7 fallback): API field names, validation rules, GraphQL signatures
3. Generate test cases in enriched 15-column CSV format (1-3 cases per gap)
4. Apply **minimum effective set** principle: clear bug hypothesis, happy path + most likely negative + known edge cases
5. Use layer-specific tags from `.claude/skills/qa-test-cases-generator/test-case-template.md`
6. **GraphQL schema validation** (mandatory for GraphQL cases):
   - Read `.claude/knowledge/api/graphql-schema.md`
   - Validate every query/mutation: name exists, args match, `command` wrapper on mutations, response fields match return types
   - If query/mutation doesn't exist in schema → do NOT generate a case for it
7. **BL candidate collection (always):**
   - For each generated case whose gap maps to a rule no record holds (`bl:extract -- --domain <d>`): **a human source states it** (the ticket's AC, a docs page, a Jira resolution) → record a candidate (`PROPOSED-BL-<DOMAIN>-<NNN>`, severity, rule, check, violation signal, that source) in `blProposals.new[]`; **only code or live shows it** → `kb_capture`, not a candidate.
   - Phase 3 never edits a rule; 4c writes the candidates (`/qa-review-bl`, value gate applies).
8. **Present to user** as Feature Test Matrix for approval before proceeding — the subagent returns the
   matrix in `pendingApprovals[]` and writes no generated case until the orchestrator re-dispatches the
   approved ones (`briefs.md`)

---
