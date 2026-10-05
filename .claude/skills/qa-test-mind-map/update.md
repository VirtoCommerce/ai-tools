# Mind map — UPDATE mode

**Role:** change only what the new evidence changes, and hand the list of cases that may now be stale
to the lifecycle. A full rebuild is never the answer: it loses the evidence history and silently
renames ids.

## Triggers, and what each one touches

| Trigger | Start from |
|---|---|
| `TM-011`: the domain map's `rev` moved past `domain_map_rev` | the map's §0 "changed since rev N" and §7 amendments |
| A ticket changed behaviour (`--from VCST-XXXX`) | the chain links its test model's `Chain position:` names, plus its `/qa-test` `reports/tickets/<Sprint>/<TICKET>/<env>/summary.json` → `domain_map.mind_map_findings[]` (DRIFT and missing-behaviour candidates the run handed back at `5-docs-map`) |
| `--since <git-ref>` on the domain's code or specs | `npm run regression:select` for the paths, then the nodes whose evidence cites those files |
| An oracle amendment (`BL-*` Status or Rule changed) | every node whose `oracle_refs` or `{BL}` evidence names it |
| A `kb dispute` against an entry a node cites | that node |

The impact path always runs one way: change → domain node → behaviour → data requirement → cases.

## Procedure

1. Load the current map. Run `npm run models:check -- --json` and keep its `coverage` as the before-picture.
2. For each touched node, compare the new evidence with the stored evidence:
   - **same claim, newer confirmation**: add the evidence, move `last_verified`. That is not a
     behaviour change and does not make its cases suspect.
   - **changed claim**: edit `name`/`description`/`pre`/`postconditions`/`state_*`/`requires`.
     **Keep the id.** Wording changes never justify a new id.
   - **contradiction with a higher-precedence source**: `status: DRIFT` + `drift{expected, observed, route}`.
     Keep the older evidence.
   - **behaviour removed**: `status: OBSOLETE` + `obsolete{date, reason, replaced_by?}`. Never delete it (`TM-030`).
   - **new behaviour or branch**: add it with a new id under the same prefix, and wire the edges.
   - **new integration point**: the same cross-domain edge or `integrates with:` note as
     [`build.md`](build.md) step 4.
3. Update `domain_map_rev` and `amended`. Leave `generated` alone: it dates the last full derivation.
4. `npm run models:check`. `TM-030` is checked against `HEAD` by default; use `--base origin/main`
   before a PR. The `suspects` array now lists every case linked to a changed, DRIFT or OBSOLETE node.
5. Hand each suspect's suite to `/qa-test-lifecycle suite <ID>`; its Phase 2 re-syncs it, and the
   lifecycle does not read `suspects` itself. **Do not edit those cases here.** Deciding whether a case
   is stale is the lifecycle's job.
6. If a data requirement changed (`requires` / `produces`), run `/qa-test-data-model update` for it.
7. Close out with the kb write step from [`build.md`](build.md) step 9, for anything observed live.

## Result contract (chat, JSON)

```json
{
  "mode": "update",
  "trigger": "<what started this run>",
  "changed": ["<node id>"],
  "added": ["<node id>"],
  "obsoleted": [{ "node": "<id>", "reason": "…" }],
  "drift": [{ "node": "<id>", "route": "…" }],
  "suspects": [{ "caseId": "…", "node": "…", "why": "…" }],
  "data_model_followups": ["data.<slug>.…"],
  "integration_points": [{ "from": "<id>", "to": "<id> | <domain with no map>" }],
  "models_check": "OK | FAIL <n>"
}
```
