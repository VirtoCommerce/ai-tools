---
name: qa-test-mind-map
description: "[QA Method] Build, update or audit a TEST MIND MAP — the machine-readable behaviour graph of one domain (behaviours, branches, states, transitions, the data each needs and produces, evidence per node) at .claude/knowledge/domain/<name>.mind-map.json. Answers 'how can this domain behave?' between the domain map ('what exists') and the suite CSVs ('how is a path executed'); cases link to it through Behavior: stamps. Not an oracle, not a case generator."
argument-hint: "<build|update|audit> <domain-slug> [--since <git-ref>] [--from <ticket>]"
---

# /qa-test-mind-map — the behaviour graph of a domain

A suite row used to be the only artifact saying which behaviour a case covers. When the behaviour
changed, finding the rows it invalidated meant reading prose. The mind map holds each behaviour
**once**, with a stable id, its branches, states, data needs and evidence. A case points at it with
a `Behavior:<node-id>` stamp in `References`. That turns "which cases does this change make
suspect?" into a lookup (`npm run models:check -- --json` → `suspects`).

Design, the deviations from the original proposal, and why: [`docs/decisions/test-mind-map-and-data-model.md`](../../../docs/decisions/test-mind-map-and-data-model.md).

## Where it sits — one question per layer, never merged

| Layer | Question | Artifact |
|---|---|---|
| Domain map | What exists, and where are its surfaces? | `.claude/knowledge/domain/<name>.md` |
| Test model | What should THIS ticket test? | `reports/ba/test-models/*.md` (Part 0 cites node ids) |
| **Mind map** | **How can the domain behave?** | **`.claude/knowledge/domain/<name>.mind-map.json`** |
| Data model | What state must exist first? | `test-data/models/<name>.data-model.json` → [`/qa-test-data-model`](../qa-test-data-model/SKILL.md) |
| Oracles | What MUST be true? | `BL-*` / `ECL-*` — the only behavioural oracle |
| Suite CSV | How is one path executed? | a row, carrying `Behavior:` / `DataProfile:` stamps |

**The map is not an oracle.** The domain map's own limit applies unchanged
([`../../knowledge/domain/domain-map.md`](../../knowledge/domain/domain-map.md)): it never grounds
an assertion as `{DOC}`. An expected outcome is cited through `oracle_refs` / `evidence`. A rule
found while building goes to `/qa-review-oracles` or `kb capture`, never into the map as truth.

## Contract

- **Shape:** [`../../templates/mind-map.schema.json`](../../templates/mind-map.schema.json). It is the
  single source of truth for the fields, and the checker loads it. Do not restate fields here or in a prompt.
- **Gate:** `npm run models:check`. Codes `TM-0NN` are listed in the header of
  `scripts/maintenance/check-test-models.ts`. A missing map passes; a wrong one fails.
- **Ids are a citation contract**, like `BL-*` ids and the domain map's `D*`/`G*` rows. They are
  dotted, prefixed with the map's `domain_slug`, and **never renamed or deleted**. A behaviour that is
  gone gets `status: OBSOLETE` plus `obsolete.reason`. Deleting it is `TM-030`.
- **Linked tests are derived, never stored.** The `Behavior:` stamps in suite rows are the one writer
  of that link.

## Modes

| Mode | Use when | Procedure |
|---|---|---|
| `build` | A domain has a domain map but no mind map | [`build.md`](build.md) |
| `update` | The domain map's `rev` moved, a ticket changed behaviour, an oracle was amended, or `--since <ref>` shows a diff in the domain's code | [`update.md`](update.md) |
| `audit` | Before a release, or when a suite's cases go red without a product change | [`audit.md`](audit.md) |

Each mode ends in the JSON result contract defined in its own file. **Writes:** the map file; in
`build` step 10, `Behavior:` stamps in suite CSVs (single writer per suite); in `build` step 9, `kb`
entries. Findings go to chat.

## Pre-flight (every mode)

0. **Resolve the slug to files.** The domain map is the `.claude/knowledge/domain/*.md` whose
   `domain_slug` matches the argument. The mind map is that file's basename + `.mind-map.json`
   (`loyalty-missions.md` ⇒ `loyalty-missions.mind-map.json`), and its `domain_slug` field holds the slug.
1. **Domain map first.** `npm run domain:check`. If there is no map for `<slug>`, STOP and run
   `/qa-domain-map <slug>`: the mind map is derived from the map's value chain. If the map is STALE,
   say so and proceed only in `audit` mode.
2. **Ask the base for this run's coordinates.** For each GraphQL operation, endpoint and page path the
   domain map §2 names for the behaviours in scope, run `npm run kb -- ask "<coordinate> <question>"`
   (MCP: `mcp__kb__kb_ask`). Record hit ids; a miss is not a blocker. Rule: [`CLAUDE.md`](../../../CLAUDE.md)
   §Essential Rules → *Product context*.
3. **VirtoOZ before any behaviour claim** (`/vc-docs`), the same rule. Released vs new decides the
   source: released behaviour needs `{DOC}`, `{BL}` or `{OBSERVED}` evidence before it can be CONFIRMED.
   New behaviour may rest on `{SPEC}` and is marked `"maturity": "new"`.

## Evidence rules — the part that keeps the map honest

- **Every CONFIRMED node carries evidence the checker accepts** (`TM-007`). Evidence classes are the
  provenance tags of [`../qa-test-cases-generator/test-case-template.md`](../qa-test-cases-generator/test-case-template.md):
  `SPEC`, `BL`, `DOC` (docs **and** source), `OBSERVED`, `HYPOTHESIS`. There is **no numeric
  confidence**, because a float an agent chose is precision nobody measured.
- **Cannot establish it? Do not invent it.** Mark the node `UNVERIFIED` with whatever evidence exists,
  even none. An UNVERIFIED node is a recorded question, not a defect.
- **Conflicting sources are recorded, never silently resolved.** The node becomes `DRIFT` with
  `drift.expected` (the higher-precedence source + ref), `drift.observed` and `drift.route` (who
  resolves it). Precedence is the repo's grounding order, not a generic one: this repo's oracles and
  knowledge → `kb` → VirtoOZ → live/source (*Product context*).
- **A domain-map claim is cited with its map rev** (`domain-map:<slug>@rev<N> §<section>`), keeping
  the class of the map's own verdict (`CONFIRMED (live)` → `OBSERVED`, `(source)` → `DOC`).
- **A promoted case is evidence of observation** (`OBSERVED`, ref = the promoting run id). A Draft,
  Manual or Deprecated case is not.

## Modelling rules

- **Model only the branch kinds the domain has** (`happy`, `negative`, `boundary`, `permission`,
  `state`, `integration`). Do not add empty categories.
- **One `technique` token per branch**, from the closed list in
  [`../qa-test-design/test-design-techniques.md`](../qa-test-design/test-design-techniques.md) §0 (`TM-013`).
- **States are nodes and transitions are edges.** A behaviour that moves state names `state_before`
  / `state_after`, and a `transitions_to` edge names it as `via` (`TM-008`). Mark a state `terminal`
  when nothing may leave it; an edge out of a terminal state is an impossible transition.
- **`requires` / `produces` point into the data model**, never at a seeder. What state is needed is
  `/qa-test-data-model`'s job; how it is reached is the seeders'.
- **A branch inherits its behaviour's `requires`.** List on a branch only what it needs beyond its parent.

## Integration

- **`/qa-test` Step 1e test model** — Part 0 cites `<name>.mind-map.json` node ids instead of re-deriving
  the chain when the map exists ([`../qa-test-model/test-model.md`](../qa-test-model/test-model.md)).
- **`/qa-test` 5-mind-map** — a FULL run whose domain has a map but no mind map runs `build <slug> --from <ticket>` after the verdict and stamps only its own authored cases ([`../qa-test/reporting.md`](../qa-test/reporting.md) §5-mind-map).
- **Case authoring** — a plan row's `behavior` / `dataProfile` fields become the stamps
  (`scripts/test-cases/scaffold-rows.ts`, [`../../knowledge/execution/regression-scaffold.md`](../../knowledge/execution/regression-scaffold.md)).
- **`/qa-test-lifecycle`** — hand each suspect's suite to `/qa-test-lifecycle suite <ID>`; its Phase 2
  re-syncs it. The lifecycle does not read `suspects` itself.
- **`/qa-review-oracles`** — every `DRIFT` whose `route` names it is a candidate for that audit.

## Failure handling

| Situation | Do |
|---|---|
| No domain map | STOP; run `/qa-domain-map <slug>` first |
| `models:check` red after an edit | Fix it in the same change; never hand off a red map |
| A source disagrees with the map | `DRIFT` + route, never overwrite the older evidence |
| A behaviour vanished from the product | `OBSOLETE` + reason (+ `replaced_by`), never delete |
| An existing case contradicts a doc | Observe it live first; the case may be the only source written from the screen ([`../../knowledge/agents/qa/shared-instructions.md`](../../knowledge/agents/qa/shared-instructions.md) §What VirtoOZ is authoritative FOR) |

## Do / Don't

- **Do** keep the map smaller than the suites. It holds behaviours, not steps, selectors, prices or copy.
- **Do** stamp a case only with the node it actually decides.
- **Don't** generate cases here. The map is the model a case is projected from.
- **Don't** write a count, an id list or a status tally into prose. `models:check` prints them.
- **Don't** edit a suite CSV from this skill without taking the one-author rule for that suite
  ([`../../rules/regression.md`](../../rules/regression.md)).

## Worked example

`loyalty-missions.mind-map.json` (domain `loy`, pilot of VCST-6090) is the reference. Look at
`loy.mission.reversal` for a DRIFT against `BL-LOY-019`, at
`loy.mission.progress.accrue.loyalty-currency-lines` for a DRIFT that was routed to `/qa-review-oracles` and
resolved there (its `notes` keep the history), and at the `loy.progress.state.*` nodes for terminal states.
