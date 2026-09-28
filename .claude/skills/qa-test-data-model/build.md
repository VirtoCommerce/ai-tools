# Data model — BUILD mode

**Role:** turn a mind map's `requires`/`produces` ids into declared data states, pointing each one at
the seeder and alias that already reach it. You author **declarations**, not seeders. A seeder gap is
handed to `/qa-generate-data`.

## Inputs

- The domain's mind map (every `requires` / `produces` id, and the node each belongs to).
- The domain's seeders and spec modules (`scripts/seed-data/<domain>/`), `package.json` `seed:*`
  scripts, and `test-data/aliases.json` (grep the entity's alias prefix).
- The suites' Preconditions for the stamped cases. Many rows embed `npm run seed:…` there, and those
  strings are the informal contract this model formalises.

## Procedure, per requirement id

1. **Entity + state.** `entity` in PascalCase; `required_state` as explicit key/values. `constraints`
   holds the relations a BVA or decision table needs (`goal_target: "> merchandise AND <= total"`).
2. **Lifecycle** from the table in SKILL.md. For every `FIXTURE`, write `shared_state`: what mutates
   on it across runs and what may therefore never be asserted on it. If a case must mutate it, the
   requirement is `SCENARIO`, not `FIXTURE`.
3. **Acquisition, reuse first:**
   - an alias already names this state → `EXISTING` + `td_alias`.
   - a seeder creates it → `CREATE` + `seed_capability` (the `seed:*` script) + `td_alias` for how the
     case addresses it.
   - it is reached from another state → `TRANSITION` + `from_state` + `transition`. Use executor `case`
     when the case's own Steps perform it (a settings toggle, cancelling the order under test).
   - an earlier behaviour produces it → lifecycle `DERIVED`, acquisition `DERIVE`, and
     `source.produced_by` = that node. The node must list it in `produces` (`TM-026`).
   - any matching entity will do and its id drifts → `DISCOVER` + `discover_fn` +
     `discover_constraints` on **every** dimension the feature reads.
   - a unique input never asserted on → lifecycle `DYNAMIC`, `GENERATE` + `generator`.
4. **Relationships.** Add a `required: true` edge to each requirement that must exist first. No cycles (`TM-027`).
5. **Cleanup.** `SCENARIO`/`STEP` data that is created or transitioned needs `cleanup.required: true` +
   `via` (a teardown script, the `AGENT-TEST-` prefix sweep, or the case's Cleanup column). If the
   state cannot be undone, say so in `via` and name what isolates it.
6. **`discriminates`** (SECOND RULE): which branch this data makes decidable, and the divergent values
   that make it so. If you cannot write it, the requirement does not yet discriminate. Fix the data,
   not the sentence.
7. **Evidence + status**, same rules as the mind map (`TM-007`).

## Profiles, per mind-map node that a case executes

`{id: "profile.<slug>.<name>", behavior: <node id>, requirements: [...]}` holds the node's direct
`requires`, plus only the closure entries the path needs (minimal data). Check the order with
`npm run models:check -- --plan <id>`. Stamp `DataProfile:<id>` on the cases that run on it, as the
single writer of each suite.

## Validate + close out

1. `npm run models:check` is green.
2. For every `seed_capability` you named, `npm run <script> -- --dry-run` where the seeder supports
   `DRY_RUN`. A capability that cannot dry-run is noted in the result, not run.
3. Bank anything observed live (kb write step, [`../qa-test-mind-map/build.md`](../qa-test-mind-map/build.md) step 9).

## Result contract (chat, JSON)

```json
{
  "mode": "build",
  "model": "test-data/models/<name>.data-model.json",
  "models_check": "OK | FAIL <n>",
  "reused": { "aliases": 0, "seed_capabilities": 0 },
  "seeder_gaps": [{ "requirement": "data.<slug>.…", "why": "no seeder reaches <state>" }],
  "profiles": ["profile.<slug>.…"],
  "stamped_cases": 0,
  "kb": { "read": [], "confirmed": [], "disputed": [], "captured": [] }
}
```
