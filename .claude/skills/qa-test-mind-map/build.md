# Mind map — BUILD mode

**Role:** a QA architect deriving the behaviour graph of ONE domain from evidence that already exists.
You are a **Judge** in the sense of [`../../knowledge/agents/authoring-standard.md`](../../knowledge/agents/authoring-standard.md)
§5.2: you state how the platform behaves, so the pre-flight kb read in [`SKILL.md`](SKILL.md) is mandatory.
If you observe anything live yourself, you are also an **Observer** and step 9 applies.

## Inputs, in reading order

1. The domain map `.claude/knowledge/domain/<name>.md`: §1 value chain + actors, §2 surfaces, §3 `D*`
   disagreements, §5 `G*` gaps. **Each chain link becomes at least one behaviour node** (`chain_link`).
2. The oracle domain: `npm run bl:extract -- --domain <slug>`, plus the ECL sections the domain's cases cite.
3. The suites the domain map §4 names. Read Title + References + Automation_Status only; the steps
   are not needed. `npm run tc:scope` when the slice is unclear.
4. Prior test models in `reports/ba/test-models/`: their Part 0 diagrams already hold states and variants.
5. Seed spec modules for the domain (`scripts/seed-data/<domain>/*-specs.mjs`): their headers often
   record why a fixture has the shape it has, which is behaviour evidence (`DOC`).
6. `kb` hits from pre-flight, and VirtoOZ.

## Procedure

1. **Feature root.** One `feature` node `<slug>.<feature>`, and a `contains` edge to every top-level
   behaviour.
2. **Behaviours from the chain.** One `behavior` per chain link the domain map marks CONFIRMED or
   UNVERIFIED. Name it by what the system does, in the customer's or admin's words. Carry the map's
   verdict as evidence (`domain-map:<slug>@rev<N> §1 link <#>`).
3. **States.** For every entity whose lifecycle the chain or an oracle describes, add one `state` node
   per state and `transitions_to` edges with `via` = the behaviour. Mark `terminal` only when a
   source says nothing leaves it. "No reverse edge exists" is a claim that needs evidence.
4. **Branches.** For each behaviour, add a `branch` per distinct outcome a source supports:
   - negative, boundary, permission, state or integration paths
   - one per oracle `Violation signal` that is a separate path
   - one per existing case whose Title names a separate outcome

   Set `branch_kind` + `technique`. No source, no branch; list it under `open_questions` in the result instead.
5. **Data needs.** Put `requires` on each node for the state it needs beyond its parent, and `produces`
   for what it creates that a later behaviour consumes. Use requirement ids
   (`data.<slug>.<entity>.<state>`). Where the data model does not have them yet, list them in
   `new_requirements` for `/qa-test-data-model build`.
6. **Oracles.** `oracle_refs` gets promoted `BL-*` / `ECL-*` only. A PROPOSED- invariant is evidence
   (`SPEC` or `HYPOTHESIS`).
7. **Status per node**, per the evidence rules in SKILL.md. A released behaviour with only `{SPEC}`
   stays UNVERIFIED.
8. **Validate.** `npm run models:check`. It must be green before anything else. TM-014 coverage gaps
   are expected and are reported, not fixed here.
9. **Bank what you observed yourself** (skip if you observed nothing live). For each platform behaviour
   you established first-hand: matched ⇒ `kb confirm <id>`, contradicted ⇒ `kb dispute <id>`, base held
   nothing ⇒ `kb capture` (`--deployment {TEST_ENV}`). Public base — nothing client-specific.
10. **Stamp** existing cases with `Behavior:<node-id>` only after the map is green, as the single
    writer of each suite (`.claude/rules/regression.md`). Reuse `applyCellEdits` from
    `scripts/test-cases/promote-cases.ts`, which is byte-preserving and re-parse-verified. Never
    stamp a Deprecated case.

## Forbidden

- Generating test cases.
- Inventing a branch, a state or a terminal flag without a source.
- Numeric confidence.
- Restating an oracle's rule text in `description`: cite it.
- Nodes for UI copy, selectors, prices or counts. Those are `{OBSERVED}` surface, not behaviour.

## Result contract (chat, JSON)

```json
{
  "mode": "build",
  "map": ".claude/knowledge/domain/<name>.mind-map.json",
  "domain_map_rev": 3,
  "models_check": "OK | FAIL <n>",
  "nodes_by_status": { "CONFIRMED": 0, "UNVERIFIED": 0, "DRIFT": 0 },
  "drift": [{ "node": "<id>", "route": "<where it is resolved>" }],
  "new_requirements": ["data.<slug>.<entity>.<state>"],
  "open_questions": ["<a behaviour no source could establish>"],
  "stamped_cases": 0,
  "kb": { "read": ["KB-…"], "confirmed": [], "disputed": [], "captured": [] }
}
```

Take counts from `models:check -- --json`; never count by hand.
