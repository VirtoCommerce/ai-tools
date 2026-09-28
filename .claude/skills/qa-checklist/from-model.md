# Mode 5 — a ticket checklist built FROM its test model and the domain's mind map

`/qa-checklist <TICKET> --from-model [--mind-map <slug>]`

Mode 2 builds a ticket checklist from the ACs, the domain checklists and the oracles. That is
everything the *ticket* and the *corpus* say. It is not everything the *fault model* says: a test model's
scenario rows and a mind map's behaviour nodes are derived from the mechanism, so they hold the reverse
edges, the variant pairs and the state branches no AC mentions. Mode 5 is Mode 2 plus those two sources.
Every item traces to its source, and every in-scope source row is either an item or a declared omission.

## Inputs — both are files, never prose in a brief

| Input | Where | Missing ⇒ |
|---|---|---|
| Test model | `reports/ba/test-models/<TICKET>-*.md` with all of its rounds. Where two dated files exist for one ticket (a legacy fork), use the newest, plus the rows it declares still valid from the older file | **STOP** — run `/qa-test-model <TICKET>` first. Mode 5 without a model is Mode 2 |
| Mind map | `.claude/knowledge/domain/<name>.mind-map.json` for the slug (`--mind-map`, else the model's `Mind map:` header) | proceed; write `Mind map: ABSENT` in the header. A missing map is recorded, never a blocker |

## Procedure

1. **Run Mode 2 steps 1–7 unchanged** (SKILL.md §Mode 2): ACs, domain checklists, oracles, cited items.
2. **One item per scenario row of the model.** The row's cell, defect hypothesis and oracle become the
   item's Condition, Expected and Oracle. The `Technique:FLOW` journey row is item 1 of its lane.
   Several rows that one observation proves may share an item; the item's Ref then lists all of them.
3. **Select the in-scope mind-map nodes, then give each one an item or an omission line.** First pick
   the in-scope behaviours by either of two routes, then add their descendants:
   - **By chain link.** `chain_link` is set on `behavior` nodes and names a row of the domain map's §1
     value chain. A behaviour is in scope when that row is one the model's `Chain position` says this
     ticket TOUCHES. If the model numbers its own links (`L1…`) and does not map them to domain-map
     rows, write the crosswalk in the checklist header (`L6 → row 7`) before selecting. An L-link that
     maps to no row is mind-map DRIFT (step 4).
   - **By citation.** A behaviour the model's Part 0 cites by node id is in scope.
   - **By descent.** Every node reached along `contains` / `branches_to` edges from a behaviour picked
     by either route is in scope too. Branches carry no `chain_link` of their own.

   **`interfaces` never selects a node.** It is a layer enum (`storefront`, `graphql`, `admin-ui`, …),
   so almost every behaviour matches some ticket. It decides the node's **lane** in step 6 instead.

   For each in-scope `behavior` or `branch` node, add an item unless a step-2 item already observes it.
   When one does, that item's Ref also names the node. A `state` node is covered through the
   transition that reaches it and needs no item of its own.
4. **The ticket changes a mechanism no node carries?** Record it as mind-map DRIFT under the checklist.
   `/qa-test-mind-map update` resolves it; this file never edits the map.
5. **Give every item its data strategy.** Use the [`../../rules/test-data.md`](../../rules/test-data.md) layers,
   chosen with the [`../../knowledge/execution/live-discovery.md`](../../knowledge/execution/live-discovery.md)
   decision tree. The Data cell reads as one of:
   - `{{VAR}}`
   - `@td(ALIAS.field)`, for an entity the item asserts against by name
   - `live-discover <what>`
   - `create-on-fly <entity> via <op>`, a `random-data` value with the `AGENT-TEST-` prefix, created
     during the run and torn down after it
   - `setting <name> flip+restore`

   An item that no layer can reach is marked `FIXTURE-GAP`, with the reason. An item that needs
   several kinds lists them joined with ` + `, in the order the runner does them.
6. **Group the items into one section per executor lane** (storefront / Admin + API / cross-layer),
   the way `/qa-test`'s Artifact B does. A node-derived item goes to the lane its `interfaces` name:
   - `storefront` → storefront
   - `admin-ui` / `rest` / `graphql` → Admin + API
   - two layers, or `job` / `event` → cross-layer

   A runner then gets its section and nothing else. Shared
   mutable state — a store setting, a shared fixture — has one writing lane only, and that lane
   restores it (the header's Rules block).

## Output — the Artifact B shape, plus two columns

```markdown
# Testing checklist — <TICKET> (<summary>)
**Model:** <path> · **Mind map:** <path | ABSENT> · **Domain map:** <state>
**Data:** <the aliases / seeders / create-on-fly entities the items use>
**Rules for every executor:** <shared-state owner + restore, env quirks from the model>

## A. <lane> — <agent>, <browser lane>
| # | Condition (AC) | Ref | Expected | Oracle | Data | Result |
|---|---|---|---|---|---|---|
| A1 | … (AC-n) | S#1 · <node-id> | … | {BL-…}/{SPEC}/… | @td(…) | |

**Not covered, deliberately:** <scenario # / node id / BL / ECL> — reason, or where it belongs instead
**Mind-map DRIFT:** <mechanism> — no node carries it
```

- **Ref** names the model scenario (`S#<n>`), the mind-map node id, or both. `AC-<n>` alone is enough
  only for a Mode-2 item that neither source reaches.
- **Result** stays empty. The executor fills it with `PASS` / `FAIL` / `BLOCKED`, a one-line note, and
  its evidence file.
- **The size band is per lane, not per checklist.** A model-driven checklist is expected to be larger
  than the 6–15 domain band. It passes when every in-scope row is an item or an omission line, and it
  is never padded to reach a count.
