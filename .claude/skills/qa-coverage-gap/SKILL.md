---
name: qa-coverage-gap
description: "[Testing] Autonomous test coverage gap analysis and generation — identifies missing test cases, generates enriched CSV test cases, validates P0 cases via browser, and reports improvements."
argument-hint: "analyze | generate | validate | full | domain <name> | suite <ID>"
disable-model-invocation: true

---

# /qa-coverage-gap — Test Coverage Gap Analysis & Generation

Autonomously improves test coverage by identifying gaps between application features and existing test suites, generating new test cases in the enriched agent-native format, validating P0 cases, and reporting improvements. Operates in a 4-cycle iterative pipeline.

For sprint- or release-level multi-domain runs, run this skill once per domain (the orchestrated `/qa-coverage-generation` twin was removed 2026-09-08 with zero recorded runs).

## Usage

```
/qa-coverage-gap                    # Run full 4-cycle pipeline (analyze → generate → validate → report)
/qa-coverage-gap analyze            # Cycle 1 only: gap analysis with prioritized report
/qa-coverage-gap generate           # Cycles 1-2: analyze + generate test cases
/qa-coverage-gap validate           # Cycles 1-3: analyze + generate + validate P0 cases
/qa-coverage-gap full               # All 4 cycles including commit
/qa-coverage-gap domain <name>      # Focus on one manifest domain
/qa-coverage-gap suite <ID>         # Focus on a specific suite by ID
```

**`<name>` and `<ID>` are resolved live, never from a list in this file.** The manifest's
`_meta.domains` is itself a transcription and has drifted behind the suites it describes, so derive
the domain vocabulary from the suites themselves:

```bash
node -e "const m=require('./config/test-suites.json');const d={};m.suites.forEach(s=>d[s.domain]=(d[s.domain]||0)+1);console.log(d)"
npm run suites:lint          # suite + case totals, corpus-wide unique-ID check
```

## Supporting Files

- **coverage-gap-methodology.md** — Gap detection heuristics, priority scoring matrix, gap categories
- **feature-domain-map.md** — Per-feature coverage judgment (`Partial` / `GAP` + rationale). It deliberately carries no suite-ID lists; those are derived from the manifest.

## Architecture

### Cycle 1 — Analysis (always runs)

1. **Read regression coverage** — every suite CSV referenced in `config/test-suites.json` (`suites[*].file`). Use the manifest's `domain` / `layer` / `concern` / `priority` fields for routing — never hardcode suite IDs.
2. **Scope the existing corpus against the change** — `npm run tc:scope -- --domain <d> --observable "<label>"` answers the direction a gap scan does not: *which existing rows does this change make WRONG?* A stale row is a coverage defect, not a gap — route it to `/qa-review-tests --fix`, never re-author over it (`knowledge/execution/regression-selection.md`).
3. **Read feature inventory** from:
   - `knowledge/domain/<slug>.md` — **the domain map is the first read** (actors, value chain, surface inventory per layer, where the layers disagree, current coverage shape). Build or refresh with `/qa-domain-map <slug>`; check freshness with `npm run domain:check`. A domain with no map gets one *before* gap analysis, not after.
   - `knowledge/oracles/business-logic.md` — `BL-*` invariants
   - `knowledge/oracles/e-commerce-edge-cases-library.md` — `ECL-*` edge cases
   - `knowledge/domain/sitemap.md` — storefront page inventory
   - `knowledge/execution/module-suite-map.md` — module-to-suite mapping
   - `knowledge/api/graphql-schema.md` — xAPI schema reference (REQUIRED before authoring any GraphQL case)
   - `skills/qa-plan/e2e-scenario-catalog.md` — E2E scenario catalog (its own header derives the count; never quote one)
   - `skills/qa-checklist/domain-checklists.md`, `backend-admin-checklists.md`, `graphql-checklist.md`
   - `skills/qa-api/xapi-query-ref.md`, `test-cases-api-graphql.md`
4. **Product documentation — VirtoOZ first, Context7 as fallback.** Per `CLAUDE.md` §Essential Rules, when what the platform is *supposed* to do is unclear, query VirtoOZ (`/vc-docs`) before acting on it; fall back to Context7 `/virtocommerce/vc-docs` only when VirtoOZ returns thin or off-topic chunks. Grounding order is **repo knowledge → VirtoOZ → live/source**. Flag features documented upstream but absent from coverage; a *released* behaviour VirtoOZ does not document is itself a finding. What VirtoOZ had to tell you that the repo should have known goes back into the domain map.
5. **Map every test case** to its manifest domain via the manifest's `domain` field; supplement with the `Section` column and title keywords only when the manifest is ambiguous.
6. **Identify gaps** per `coverage-gap-methodology.md` categories (`ZERO_COVERAGE`, `SHALLOW_HAPPY`, `MISSING_NEGATIVE`, `MISSING_INTEGRATION`, `MISSING_CROSS_DOMAIN`, `STALE_COVERAGE`).
7. **Score gaps** using the 4-factor matrix in `coverage-gap-methodology.md` §3:
   - Revenue impact (40%) · User frequency (25%) · Failure severity (20%) · Existing coverage (15%)
   - 8.0–10.0 → P0 · 5.0–7.9 → P1 · 2.0–4.9 → P2 · <2.0 → P3 (excluded from generation)
8. **Output** under `reports/coverage/COV-YYYY-MM-DD-HHMM/` (the run id, per `.claude/rules/reports.md` §1):
   - `gap-inventory.json` — one typed record per gap; schema in `coverage-gap-methodology.md` §`gap-inventory.json`
   - `gap-analysis.md` — digest, ≤150 lines (`reports.md` §2)

Definition of Done: every gap has `manifestDomain`, `applicableLayers[]`, `targetSuites[]` resolved against the manifest, `priorityScore`, `priority`, and `gapCategory`.

### Cycle 2 — Generation (runs with `generate`, `validate`, `full`)

1. **Claim the suite before writing to it.** A suite CSV has exactly ONE author for the duration of a change (`.claude/rules/regression.md`). Fan the *analysis* out across layers freely; serialise every *write*. A suite conflict is never resolved with git.
2. **Allocate case-ID blocks once, before any fan-out** — `npm run tc:alloc -- --prefix <PREFIX> --count <n>`. Case IDs are globally unique corpus-wide (`suites:lint` enforces it); two batches that each scan the corpus before either writes will both pass an append-time check and then collide, silently overwriting each other's per-case results at run time.
3. For each gap, invoke `/qa-test-cases-generator --layer <csv-list>` once per applicable layer. Layers: `api`, `graphql`, `admin`, `storefront`, `e2e`.
4. Format contract: `skills/qa-test-cases-generator/test-case-template.md` (15-column enriched CSV: ID, Title, Section, Priority, Business_Rule, Edge_Case_Refs, Preconditions, Test_Data, Steps, Assertions, Cross_Layer_Checks, Failure_Signals, Cleanup, References, Automation_Status).
5. **For the `050*` Backend/graphql sub-suites:** the authoring contract is `knowledge/api/graphql-test-cases-runner.md` — runner-native tags (`[AUTH]/[GQL-OP]/[GQL-VARS]/[GQL-EXEC]/[GQL-CAPTURE]/[REST-OP/EXEC/CAPTURE]/[ERRORS]/[DATA]/[NULL]/[COUNT]/[VAR]`). Browser-mode `[GQL]` tags are **not** valid in these suites. Query the manifest for which `050*` sub-suites exist and what each covers — that split has grown repeatedly, so any list written here goes stale.
6. **Test-data contract (mandatory)** per `.claude/rules/test-data.md` — resolve via `{{VAR}}`, `@td()`, `live-discover`, or `random-data`. Literal IDs/SKUs/emails/prices/order-numbers are review failures. Use the `AGENT-TEST-` prefix for generated entities so `/qa-seed-data teardown` reclaims them.
7. **Never write an evidence OUTPUT path into a case** (THIRD RULE, `.claude/rules/test-data.md`). A case says WHAT to observe; the RUN supplies WHERE evidence lands. A literal `reports/tickets/…` output path in Steps or Assertions bakes a sprint and a ticket into a row that outlives both — and the case still PASSES once that folder is pruned. Enforced by `td:validate` (`DV-024`).
8. **Ground every assertion, all-or-nothing per case** — each assertion line carries `{SPEC}` / `{BL}` / `{DOC}` / `{OBSERVED}` / `{HYPOTHESIS}`. A case is either fully tagged or fully untagged; a half-tagged case is a review failure. Offline-generated cases are `{SPEC}`/`{HYPOTHESIS}` and stay `Draft` until observed live.
9. **Deduplication** — before appending, read the target suite CSV and skip semantic duplicates (matching `Title + Section` OR `Steps + Assertions`).
10. **Test-case quality rules:**
    - Deterministic numbered steps with typed tags
    - Explicit assertions (predicate-driven, no "verify it looks correct")
    - Happy path → critical error paths → edge cases (boundary, negative, cross-domain)
    - Priority mapping: P0 = Critical, P1 = High, P2 = Medium
11. **Append** cases to the target suite CSVs **via the safe writer** —
    `npm run suites:append -- <target-suite.csv> --rows <new-rows.csv> --check-global-ids`
    (`scripts/test-cases/append-test-cases-to-suite.ts`). Never hand-roll the append: the writer
    enforces the 15-column schema, escapes commas/newlines, guarantees the boundary newline,
    dedup-checks (so step 9 is also enforced in code), corpus-wide ID-checks, and round-trip-verifies.
    Use `--dry-run` in Cycle 4's quality gate to confirm a clean append before committing. Re-parse the
    suite after every write — a mid-write unparsable CSV takes the manifest gate down for everyone.
12. If no existing suite matches, mark `blocked:needs-suite` and surface it in the report — never auto-create suite files.

Definition of Done: every generated case conforms to the template, references at least one `BL-*` invariant (or `ECL-*`), and `npm run td:validate` passes against all modified CSVs.

### Cycle 3 — Validation (runs with `validate`, `full`)

1. Execute each new **P0 case** against QA via the assigned browser (default: `playwright-chrome`; fallback per `defaults.fallbackChain` in `config/test-suites.json`).
2. If the steps don't work (element not found, flow changed), revise the case once; if still broken, leave it `Draft` with an explicit `Failure_Signals` note and list it in the report.
3. **`Automation_Status` stays `Draft`.** The enforced vocabulary is `Draft | Reviewed | Automated | Manual | Semi-Automated` (`scripts/test-cases/lint-test-cases.ts`, finding `S-006`); any other value is a High finding on every row. **This skill never promotes.** A green live pass here upgrades the case's assertions to `{OBSERVED}` — that is all it earns. `Draft → Reviewed/Automated` is owned by `/qa-test-lifecycle` **6P** and `/qa-regression` **6.5** (`knowledge/execution/regression-promotion.md`), is never automatic, and needs `/qa-review-tests` ≥ PASS WITH WARNINGS plus explicit approval.
4. Clean up created test data using the `AGENT-TEST-` prefix (see `knowledge/execution/live-discovery.md` § Cleanup).

Definition of Done: ≥80% of new P0 cases execute green and reach `{OBSERVED}` grounding; the remainder are flagged in the report with explicit failure signals, never silently skipped.

### Cycle 4 — Report & Commit (runs with `full` only)

1. **Quality gate** — all must pass before commit:
   - `npm run td:validate` — test-data refs + the `DV-024` output-path check
   - `npm run suites:lint` — manifest sync + corpus-wide unique case IDs
   - `npm run suites:review` — case lint: format, the `S-006` status vocabulary, `GRD-*` grounding
   - `npm run scope:validate` exits 0, if any modified suite is in critical-UI scope
   - P0 live-execution rate ≥ 80%
2. Write `reports/coverage/COV-YYYY-MM-DD-HHMM/coverage-generation-report.md` — before/after comparison, batch results, VirtoOZ/Context7 findings → cases, remaining gaps. ≤150 lines (`reports.md` §2).
3. Update `config/test-suites.json` `testCount` per modified suite via `npm run suites:sync` — never by hand.
4. Git commit message format: `test(coverage): add N new test cases covering [areas] - automated gap analysis (COV-…)`. Do not push.

If the quality gate fails, abort Cycle 4 — leave the CSVs as written (the user reviews the diff before a manual commit).

## Manifest-Domain Routing

This skill routes by the manifest domain (`config/test-suites.json` `suites[*].domain`), not by 2-digit suite IDs. **Derive the domain list at run time** (see §Usage) — domains have been added to the suites without `_meta.domains` being updated.

| Manifest Domain | Typical Layers | Lead Sub-agent |
|----------------|----------------|----------------|
| `purchase-flow` | storefront, graphql, e2e | `qa-frontend-expert` |
| `marketing` | storefront, admin, e2e | `qa-frontend-expert` |
| `auth-security` | api, admin, e2e | `qa-backend-expert` |
| `customer-b2b` | api, graphql, admin, e2e | `qa-backend-expert` |
| `communication` | api, admin, e2e | `qa-backend-expert` |
| `sales-rep` | storefront, graphql, admin, e2e | `qa-backend-expert` |
| `background-jobs` | api, admin | `qa-backend-expert` |
| `observability` | api, admin | `qa-backend-expert` |
| `catalog-search` | api, graphql, admin, storefront | `qa-testing-expert` |
| `platform-config` | api, graphql, admin | `qa-testing-expert` |
| `content-cms` | admin, storefront | `qa-testing-expert` |
| `branding` | admin, storefront | `qa-testing-expert` |
| `cross-cutting` | storefront, e2e | `qa-testing-expert` |

A domain present in the manifest but missing from this table still routes by the rule below using its own `layer` / `concern` fields — an unlisted domain is never a reason to skip a gap.

**Target-suite resolution rule** (run for every gap):

```text
targetSuites = suites where
  suite.domain === gap.manifestDomain
  AND suite.layer matches the layer being generated (frontend|backend)
  AND suite.concern is appropriate for the layer:
      api / graphql → concern: "api"
      admin         → concern: "admin"
      storefront    → concern: "functional" and layer: "frontend"
      e2e           → concern: "functional" (cross-domain)
```

Never hardcode suite IDs in this skill — query the manifest.

## Integration with Other Skills & Commands

| Direction | Skill / Command | Relationship |
|-----------|-----------------|--------------|
| Upstream | `/qa-domain-map` | Domain map — the first read of Cycle 1; built once per domain, cited thereafter |
| Upstream | `/qa-plan` | E2E scenario catalog provides expected coverage |
| Upstream | `/qa-checklist` | Domain checklists define expected test areas |
| Upstream | `/qa-api ref` | API/GraphQL reference inventory |
| Upstream | `/qa-risk` | 5×5 matrix as tie-breaker for priority scores within ±0.5 |
| Upstream | `knowledge/domain/sitemap.md` | Page inventory |
| Upstream | `knowledge/api/graphql-schema.md` | Schema verification before authoring GraphQL cases |
| Downstream | `/qa-test-cases-generator` | Receives `--layer` invocations to author cases |
| Downstream | `/qa-review-tests` | Reviews generated cases on 11 dimensions; `--fix` owns stale-row repair |
| Downstream | `/qa-test-lifecycle` | **Owns promotion** of this skill's `Draft` cases (step 6P) |
| Downstream | `/qa-test` | Generated cases can be executed by qa-testing-expert |
| Downstream | `/qa-regression` | Updated suites feed into regression runs; step 6.5 promotes |
| Downstream | `/qa-metrics` | Coverage metrics updated post-generation |

## Rules

**Architecture:**
- Single-agent execution by design — for sprint/release-level scope, run once per domain.
- Resolve target suites, domains and sub-suite splits by querying `config/test-suites.json` — never hardcode them here. A transcribed count or ID range is correct exactly once (`.claude/rules/test-data.md` GOLDEN RULE).
- One author per suite CSV for the duration of a change; serialise writes, never merge a CSV conflict with git.

**Format & data:**
- All generated cases follow `skills/qa-test-cases-generator/test-case-template.md` (15-column enriched CSV).
- `050*` Backend/graphql cases follow the runner-native authoring contract in `knowledge/api/graphql-test-cases-runner.md`. Never use browser-mode `[GQL]` tags inside those suites.
- Test data is never hardcoded — `{{VAR}}` / `@td()` / `live-discover` / `random-data` per `.claude/rules/test-data.md`.
- No evidence OUTPUT paths in a case (THIRD RULE / `DV-024`).
- Every assertion carries a provenance tag, all-or-nothing per case.
- `npm run td:validate` MUST pass before Cycle 3 begins (interactive) or before Cycle 4 commits (`full`).
- Use the `AGENT-TEST-` prefix for any new test data so `/qa-seed-data teardown` reclaims it.
- Generated steps must be MCP-executable (no manual-only steps).
- Never hardcode environment URLs — use `{FRONT_URL}` / `{BACK_URL}` patterns.

**Suite handling:**
- Never create new suite files — flag `blocked:needs-suite` and surface it in the report.
- Case IDs come from `npm run tc:alloc` before fan-out; they are globally unique corpus-wide.
- Mark gaps requiring new test-data creation as `blocked:test-data`.

**Validation & gates:**
- P0 validation requires actual browser execution, not just review.
- This skill never sets `Automation_Status` past `Draft`. Promotion belongs to `/qa-test-lifecycle` 6P or `/qa-regression` 6.5.
- Quality gate (Cycle 4): `td:validate` + `suites:lint` + `suites:review` + `scope:validate` (when applicable) + ≥80% P0 execution rate — all must pass before commit.

**Knowledge sources:**
- Gap analysis must reference `business-logic.md` invariants (`BL-*`) for priority scoring and case authoring.
- Query VirtoOZ (`/vc-docs`) during Cycle 1 for any unclear product behaviour; Context7 `/virtocommerce/vc-docs` is the fallback, not the primary. Never rely solely on local knowledge files.
- For GraphQL cases, consult `graphql-schema.md` (live introspection) before authoring queries/mutations.

**Output:**
- All artifacts under `reports/coverage/COV-YYYY-MM-DD-HHMM/` — never the repo root.
