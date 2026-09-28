# Data model — UPDATE mode

**Role:** keep the declared states true when the behaviour, the seeders or the aliases move, and change
only the affected requirements. Never regenerate the file.

| Trigger | Touch |
|---|---|
| `/qa-test-mind-map update` returned `data_model_followups` | those requirement ids |
| A node gained or lost a `requires` / `produces` | its requirements + every profile whose `behavior` is that node |
| A seeder or `seed:*` script was renamed or split | every requirement naming it (`TM-024` finds them) |
| An alias was renamed, or `td:reconcile` reports it stale | every requirement naming it (`TM-023` finds them) |
| A case went BLOCKED on data | the requirements of its `DataProfile:` |

## Procedure

1. `npm run models:check -- --json` → the findings name the broken references.
2. For each affected requirement:
   - **state changed** (a new status, a new constraint): edit `required_state` / `constraints` and
     re-derive `discriminates`. A discriminating value that is now equal on both sides of a branch is
     a data defect. Fix the seed spec through `/qa-generate-data`; do not soften the sentence.
   - **executor changed**: update `seed_capability` / `td_alias`. The id stays.
   - **no longer needed**: `status: OBSOLETE`. Keep it until no profile names it, then keep it anyway
     (`TM-030`).
3. Re-check each affected profile: its node's direct requires are all present, and nothing outside the
   closure was added.
4. `npm run models:check`, then `--plan <profile>` for each affected profile.
5. Report the cases whose `DataProfile:` changed meaning; they are the lifecycle's to re-check.

## Result contract (chat, JSON)

```json
{
  "mode": "update",
  "changed": ["data.<slug>.…"],
  "obsoleted": ["data.<slug>.…"],
  "profiles_rechecked": ["profile.<slug>.…"],
  "cases_to_recheck": ["<case id>"],
  "seeder_gaps": [],
  "models_check": "OK | FAIL <n>"
}
```
