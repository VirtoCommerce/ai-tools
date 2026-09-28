# Profile-driven seeding — `/qa-seed-data --profile <profile-id>`

A **data-model profile** (`test-data/models/<name>.data-model.json`, authored by
[`/qa-test-data-model`](../qa-test-data-model/SKILL.md)) declares the data STATE one mind-map
behaviour needs. This mode seeds exactly that state and nothing else. It is the executor of the
contract; it never re-derives it.

## Procedure

1. **Get the plan:** `npm run models:check -- --plan <profile-id> --json`. It returns the profile's
   requirements plus their dependencies, **dependencies first**, one row each:
   `{step, requirement, lifecycle, strategy, executor, seed_capability, td_alias, in_profile}`.
   A non-zero exit (`missing[]` non-empty, or the models are red) is a STOP: fix the model, never
   improvise the order.
2. **Execute by `executor`, in plan order.** Run each distinct `seed_capability` once, even when
   several rows name it:

   | `executor` | Do |
   |---|---|
   | `seed` | `npm run <seed_capability>` (or the spec module's seeder when the capability is `path#EXPORT`), under the same `ENV_RISK` / `TEST_ENV` rules as every other profile above |
   | `resolve` | nothing to create. Confirm `@td(<td_alias>)` resolves: `npm run td:validate` covers it |
   | `case` | nothing now. The case's own Steps reach this state (a settings toggle, cancelling the order under test); note it in the report |
   | `discover` / `generate` | nothing now. Resolved at run time by `live-discover` / `random-data` |

3. **Verify:** `npm run td:validate` + `npm run td:reconcile`, the usual post-seed check.
4. **Report** in the standard Test Data Seed Report. Add one line per plan row: requirement, executor,
   and `ran` / `resolved` / `deferred-to-case`.

## Why the order comes from the model

A DERIVED requirement (an order id, a ledger row) exists only after its producing behaviour ran, so
that behaviour's own requirements must be seeded first. The plan encodes that chain
(`requirementDeps` in `scripts/maintenance/check-test-models.ts`). A hand-written order is the
transcribed constant `.claude/rules/test-data.md` §GOLDEN RULE forbids.

## Teardown

Each `cleanup.via` in the plan's requirements names its teardown. `--teardown` with `--profile` runs
them in **reverse** plan order, and runs only the ones whose requirement is `SCENARIO` or `STEP` with
`cleanup.required: true`. FIXTURE data outlives the run by design.
