# Test Mind Map + Test Data Model — why two JSON layers, and what the proposal was changed into

**Date:** 2026-09-28 · **Ticket:** VCST-6090 (epic VCST-5204) · **Status:** V1 shipped, piloted on `loyalty-missions`

Never loaded by an agent. This is the rationale behind `/qa-test-mind-map`, `/qa-test-data-model`
and `npm run models:check`. The skills themselves are the operative text.

---

## The problem

Suite CSV rows were the only artifact that said **which behaviour a case covers** and **what data it
needs**. Both lived in prose, in Title, Preconditions and `npm run seed:…` strings. So when a
behaviour changed, finding the cases it invalidated meant rereading the suites, and staleness was
discovered by a red run instead of predicted.

## What already existed (the audit that shaped V1)

Most of the proposed model was already in the repo, **as prose, in three places**:

| Proposed | Already here | Missing |
|---|---|---|
| behaviours, branches, negative paths | domain map §1 value chain; test-model Part 0; BL/ECL | stable machine-readable ids; Part 0 was *copied* model to model |
| states, transitions | Mermaid `stateDiagram-v2` in most test models; `qa-test-design` §5 | a parser, a lint (`model:lint` was never implemented) |
| evidence, status | provenance tags; Dim 11 verdicts; domain-map verdicts; kb trust | one per-behaviour record |
| linked tests | scaffold `Plan.link` | persisted (it was sidecar-only) |
| required data state | `data_surface`; SECOND RULE; `ORDER_FIXTURES`-style specs; `*_at_seed` | a declared per-behaviour contract; the `/qa-generate-data` matrix was never saved |
| capability registry | `seed:*` scripts, spec exports | nothing — and none was added |

So V1 adds **two JSON files per domain, one schema each, one checker and one link (a References
stamp)**. It adds no engine, registry, resolver, database or new CSV column.

## Deviations from the original proposal

1. **Source precedence.** The proposal ranked requirement > code > API > runtime > tests > docs >
   inference. The repo already has a grounding order (CLAUDE.md §Product context: repo oracles and
   knowledge → `kb` → VirtoOZ → live/source; released vs new decides the source). A second order
   would have been a contradiction waiting to be quoted. Conflicts become `DRIFT` with a `route`.
2. **The map is not an oracle.** It extends the domain map's own limit ("never grounds `{DOC}`").
   Expected outcomes cite `BL-*`/`ECL-*`, so the repo still has exactly one behavioural oracle.
3. **No numeric confidence.** A 0–1 float an agent chose is precision nobody measured. The checker
   derives consistency from evidence classes (`TM-007`): CONFIRMED needs non-HYPOTHESIS evidence, and
   released behaviour needs `DOC`, `BL` or `OBSERVED`.
4. **Acquisition limited to strategies with an executor.** EXISTING / DISCOVER / CREATE / TRANSITION /
   DERIVE / GENERATE. MOCK and IMPORT were dropped because nothing executes them against a live env.
   DISCOVER was *added*; the proposal had omitted `live-discover`.
5. **Linked tests are derived, not stored.** The proposal put `linked_tests` in the node. Storing it
   there as well as in the CSV creates two writers for one fact, and one of them would drift. The
   `Behavior:` stamp in suite References is the only writer; the checker derives coverage.
6. **Tests follow NO CODE ⇒ NO UNIT TEST.** Unit tests cover the checker's derivations only. The
   schemas and pilot JSON are owned by the gate. A mutation pass on three checker rules showed one of
   them uncovered (TM-031), and a test was added for it.
7. **The "Product Publish Draft→Published" example was dropped.** The VC catalog has no such product
   lifecycle, so shipping it would have been exactly the invented behaviour the proposal forbids. The
   pilot is a real domain with real state machines instead: the mission lifecycle and mission progress.

## What the pilot surfaced

- **An oracle-vs-product-decision conflict.** `BL-LOY-017` still names "a PerSkuGoal target satisfied
  by a PTS-priced line" as a violation. A 2026-09-02 product decision declared that configuration
  unsupported and deprecated the two cases that probed it (MSN-029, MSN-E2E-007). The prose layers
  held both facts without noticing that they conflict. The map recorded it as `DRIFT` routed to
  `/qa-review-oracles`. **Resolved the same day** (`reports/knowledge/BL-AUDIT-2026-09-28.md`):
  BL-LOY-017 was re-scoped per goal type. The audit also found that `OrderValueGoal` is safe only
  incidentally, because `order.Total` excludes loyalty-currency lines by construction. This is the loop
  working as designed: model → DRIFT → route → oracle audit → node back to CONFIRMED.
- **Coverage shape at a glance.** `npm run models:check -- --json` lists the behaviours no case
  stamps, for example mission deletion with progress, the daily expiry sweep, and per-organization
  grants.
- **Seeding order made explicit.** `--plan profile.loy.reward-spend` shows that a DERIVED ledger row
  pulls in the grant behaviour's own requirements first. That is the "customer → order → order.id"
  chain the proposal asked for.

## Known limits (V1)

- **No state-liveness check.** The `*_at_seed` overlay fields are still never read back
  (`test-data-authoring.md` §DISPOSABLE FIXTURES).
- **Per-case account families are one requirement** with a representative alias.
- **No `test-scenario` skill.** Branch + profile + expected behaviour is now addressable, but nothing
  projects it into a row yet.
- **Seed-profile lists still drift** between `qa-seed-data` and `regression-orchestrator`. That is
  out of scope here and noted for a follow-up.

---

## The rewritten prompt (as run)

This is the prompt that drove V1, kept for whoever runs the next domain.

> **Role:** Senior QA Architect + agent engineer, in `vc-mcp-testing-module`. **Goal:** a stable,
> machine-readable behaviour graph plus data contract between the domain map / test model and the CSV
> suites. **Extend, never duplicate.** Pilot on ONE domain, then stop and report.
>
> **Read first (cite, don't restate):**
> - CLAUDE.md §Product context
> - `.claude/rules/test-data.md`
> - `.claude/knowledge/agents/authoring-standard.md`
> - `.claude/knowledge/domain/domain-map.md`
> - `.claude/skills/qa-test/test-model.md`
> - `.claude/skills/qa-test-design/test-design-techniques.md` §1a, §5
> - `.claude/knowledge/execution/test-data-authoring.md`
> - `.claude/knowledge/execution/live-discovery.md`
> - `.claude/knowledge/execution/when-to-write-a-test.md`
> - `scripts/lib/test-data-resolver.ts`, `scripts/lib/seed-common.mjs`, `orders-specs.mjs`
> - `scripts/maintenance/check-domain-maps.mjs`
> - `scripts/test-cases/scaffold-rows.ts`
>
> **Responsibilities stay separate:**
>
> | Layer | Question |
> |---|---|
> | domain map | what exists |
> | test model | what this ticket tests |
> | mind map | how the domain behaves |
> | data model | what state is required |
> | seeders | how it is reached |
> | `@td()` | how it is addressed |
> | BL/ECL | what must be true |
> | CSV row | how one path executes |
>
> **Artifacts:**
> - `.claude/knowledge/domain/<name>.mind-map.json`
> - `test-data/models/<name>.data-model.json`
> - two JSON Schemas in `.claude/templates/`, loaded by `npm run models:check` through ajv; the
>   schemas are the single source of truth
>
> **Mind map:** graph nodes (feature / capability / behavior / branch / state) and node-to-node edges
> (contains / branches_to / transitions_to[via] / depends_on / affected_by). Each node carries:
> - `requires` / `produces` pointing into the data model
> - `oracle_refs` (promoted BL/ECL only)
> - evidence classed with the provenance tags
> - status CONFIRMED / UNVERIFIED / DRIFT / OBSOLETE, with no numeric confidence
>
> Ids are stable and never deleted.
>
> **Data model:** requirements with:
> - entity and explicit `required_state`
> - `lifecycle` STATIC / FIXTURE[shared_state] / SCENARIO / STEP / DYNAMIC / DERIVED[source]
> - `acquisition` EXISTING / DISCOVER / CREATE / TRANSITION / DERIVE / GENERATE, executor seed|case
> - `seed_capability` (package.json script or spec export) and `td_alias`
> - `cleanup`
> - `discriminates` (the SECOND RULE)
>
> Profiles map one node to its minimal requirement set.
>
> **Link:** `Behavior:` / `DataProfile:` stamps in suite References. The CSV header is unchanged.
>
> **Skills:** `/qa-test-mind-map` and `/qa-test-data-model`, each with build / update / audit modes,
> JSON result contracts and the kb read step. Each SKILL.md stays under BUDGET-004.
>
> **Integrate:**
> - test-model Part 0 cites node ids
> - `scaffold-rows.ts` persists `behavior` / `dataProfile`
> - `/qa-generate-data` saves its matrix as profiles
> - `/qa-seed-data --profile` executes `--plan`
>
> **Forbidden:**
> - a new engine, registry or resolver
> - a CSV header change
> - numeric confidence
> - behaviour rules without an oracle/kb/doc ref
> - deleting or renaming ids
> - generating cases
> - toy examples
> - tracker or external-repo writes
>
> **Verify:** `models:check`, `npm test`, `context:check`, `suites:lint`, `td:validate`.
