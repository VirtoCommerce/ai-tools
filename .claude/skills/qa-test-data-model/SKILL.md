---
name: qa-test-data-model
description: "[QA Method] Build, update or audit a TEST DATA MODEL — the declared data STATE each behaviour of a domain requires (entity, required state, lifecycle scope, acquisition strategy, the existing seeder and @td() alias that reach it, cleanup, what the data discriminates) at test-data/models/<name>.data-model.json, plus executable profiles per mind-map node. Answers 'what state must exist before this runs?', never 'which API calls create it' — the existing seeders stay the executors. Hands a profile's ordered plan to /qa-seed-data. Not for authoring seeders or fixtures (/qa-generate-data) or running them (/qa-seed-data)."
argument-hint: "<build|update|audit> <domain-slug>"
---

# /qa-test-data-model — the data contract behind a behaviour

A case's data needs were spread across Preconditions prose, an `npm run seed:…` string, alias names
and a spec module. Nothing tied a behaviour to the state it needs. The data model declares that state
once per requirement and groups requirements into **profiles**, one per mind-map node. A case points
at one with a `DataProfile:<profile-id>` stamp.

Design and deviations: [`docs/decisions/test-mind-map-and-data-model.md`](../../../docs/decisions/test-mind-map-and-data-model.md).
The behaviour graph it serves: [`/qa-test-mind-map`](../qa-test-mind-map/SKILL.md).

## The rule this skill exists to enforce

**Behaviour defines WHAT must happen. The data model defines WHAT STATE is required. Seeding defines
HOW to reach it.** A requirement names a *state* (`{"status": "Published", "progress": "none"}`),
never a call sequence. The seeders under `scripts/seed-data/**` remain the only executors. There is no
second seeding engine, capability registry, resolver or runtime handle:

| The model says | Resolved by what already exists |
|---|---|
| `td_alias: "ALIAS.field"` | the `@td()` resolver + `test-data/aliases.<env>.json` write-back |
| `seed_capability: "seed:<x>"` | a `package.json` script, or `scripts/…-specs.mjs#EXPORT` |
| `acquisition: DISCOVER` + `discover_fn` | `scripts/lib/live-discover.ts` |
| `acquisition: GENERATE` + `generator` | `scripts/lib/random-data.ts` |
| `acquisition: DERIVE` + `source` | `[GQL-CAPTURE]` / the producing behaviour's output |

Cite, don't restate: [`../../rules/test-data.md`](../../rules/test-data.md). All four rules bind here.
The SECOND RULE is why `discriminates` is mandatory; DISPOSABLE FIXTURES is why `lifecycle` and
`shared_state` exist.

## Contract

- **Shape:** [`../../templates/test-data-model.schema.json`](../../templates/test-data-model.schema.json),
  the single source of truth. Its `$comment`s define every enum value, and the checker loads it.
- **Gate:** `npm run models:check` (data-model codes: the right-hand column of the header of
  `scripts/maintenance/check-test-models.ts`). The same run checks the mind map, because a profile
  is only valid against the node it serves.
- **Seed plan:** `npm run models:check -- --plan <profile-id> [--json]` prints the profile's
  requirements **dependencies first**, each with its executor. `/qa-seed-data --profile` executes
  exactly that order.
- **Ids are stable** (`data.<slug>.<entity>.<state>`, `profile.<slug>.<name>`) and never deleted.

## Lifecycle — pinned to the repo's isolation words

| Value | Means | Isolation qualifier ([`test-data.md`](../../rules/test-data.md) §DISPOSABLE FIXTURES rule 3) |
|---|---|---|
| `STATIC` | environment layer: `{{VAR}}`, store settings | per environment |
| `FIXTURE` | shared by a suite; **must** name `shared_state` | per suite |
| `SCENARIO` | minted per run with a run handle | per run |
| `STEP` | reached immediately before one step | per step |
| `DYNAMIC` | random-data, never asserted on | per call |
| `DERIVED` | produced by an earlier action; **must** name `source` | inherits its producer's |

**Choosing between `FIXTURE`, `SCENARIO` and `STEP`** is decided by who can take the state away, not by
convenience or by what already has a seeder: [`test-data-authoring.md`](../../knowledge/execution/test-data-authoring.md)
§FIFTH RULE — seed or create in the case.

## Modes

| Mode | Procedure |
|---|---|
| `build`: a mind map lists `requires`/`produces` ids with no data model behind them | [`build.md`](build.md) |
| `update`: a node's `requires` changed, a seeder or alias moved, or `td:reconcile` shows drift | [`update.md`](update.md) |
| `audit`: before provisioning a new env, or when cases go BLOCKED on data | [`audit.md`](audit.md) |

## Pre-flight

0. **Resolve the slug to files** the way [`/qa-test-mind-map`](../qa-test-mind-map/SKILL.md) §Pre-flight
   step 0 does. The data model is `test-data/models/` + the same basename + `.data-model.json`.
1. The domain's mind map must exist; if it does not, run `/qa-test-mind-map build` first. In `build`,
   `npm run models:check` must also be green before you start. In `update` / `audit`, a red check is
   the input, not a blocker.
2. **Ask the base for the coordinates the data touches.** For each entity endpoint / GraphQL operation
   the seeders call for the requirements in scope, run `npm run kb -- ask "<coordinate> <question>"`
   (MCP: `mcp__kb__kb_ask`). Record hit ids. Rule: [`CLAUDE.md`](../../../CLAUDE.md) §Essential Rules → *Product context*.
3. Read [`../../knowledge/execution/test-data-authoring.md`](../../knowledge/execution/test-data-authoring.md)
   §SECOND RULE + §DISPOSABLE FIXTURES and [`../../knowledge/execution/live-discovery.md`](../../knowledge/execution/live-discovery.md) (the layer decision tree).

## Minimal data

A profile lists the **smallest** set that makes its node executable: the node's direct `requires`
(mandatory, `TM-028` error) plus whatever of its closure it needs. A requirement outside the node's
requires-closure is a warning, because that is data seeded for no behaviour. Never add an entity
"because the flow usually has one".

## Integration

- **`/qa-generate-data`** persists its combination matrix as requirements + profiles here
  ([`../qa-generate-data/SKILL.md`](../qa-generate-data/SKILL.md) §Persist the design), instead of
  returning it inline and losing it.
- **`/qa-seed-data --profile <id>`** runs the `--plan` order. For each row it runs `seed_capability`
  (executor `seed`), leaves `case` rows to the case's own Steps, and resolves `resolve` rows through
  `@td()` ([`../qa-seed-data/profile-seeding.md`](../qa-seed-data/profile-seeding.md) §Procedure).
- **`td:validate` / `td:reconcile` stay the drift guards** for the seeded values themselves. This model
  declares states; it does not re-assert fixture values (`.claude/rules/test-data.md` FOURTH RULE).

## Failure handling

| Situation | Do |
|---|---|
| No seeder reaches a required state | record the requirement `UNVERIFIED` with `limits`, and hand the gap to `/qa-generate-data` (it authors seeders); never inline API calls here |
| Two branches need the same data with different values | two requirements. Equal values on both sides of a distinction under test are a data defect (SECOND RULE) |
| A FIXTURE carries mutable shared state (a pooled balance, frozen progress) | say it in `shared_state`, and move any case that mutates it to a SCENARIO requirement |
| Store-level toggles (`STEP`, executor `case`) | `limits` must name the concurrent suites the toggle disturbs |

## Do / Don't

- **Do** reuse an existing alias and seeder before declaring a new one. The pilot declared none.
- **Do** state `limits` when one requirement stands for a per-case family of accounts.
- **Don't** write GUIDs, emails, prices or counts into a requirement. `required_state` is semantic;
  values live behind `td_alias`.
- **Don't** add MOCK/IMPORT strategies until something executes them.

## Worked example

`test-data/models/loyalty-missions.data-model.json`. Run
`npm run models:check -- --plan profile.loy.reward-spend`: the DERIVED ledger row pulls in the grant
behaviour's own requirements first, which is the "customer → order → order.id" chain made explicit.
