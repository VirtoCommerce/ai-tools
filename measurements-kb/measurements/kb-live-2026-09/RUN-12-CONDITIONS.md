# Run 12 — conditions

What is true about the setup when this run starts. **No hypothesis and no predicted answer appears
on this page.** Predictions are pre-registered in the commit message that carries this file, which a
run does not read — verified over runs 07 to 11: no `git log`, `git show` or archive access in 1,144
calls.

## The base

`590 derived + 69 captured active` (6 retired) + `3 flows`. `kb validate` green, and the demand loop
has **no open questions** for the first time since it existed — run 11 closed the last two.

**Promotions are now the densest subject in this corpus**, with entries from runs 01, 02, 09, 10 and
11. This is the second run to work ground that deep; run 09 was the first, and it confirmed nine
entries against three captures where every run on fresh ground has done the opposite.

**Changed since run 11:** seven entries about configured products; `kb amend` now refuses without
`--deployment`, which it accepted for its first two days, so both amendments written before today
are unstamped and stay that way; and one character in the tokenizer's split class.

## The deployment

`vcptcore_stable`, platform 3.1007.26, pin `c2f9c438eba4cd95`. Residue a reader should know about:

* Orders `CO260913-00001` through `CO260914-00003` — all **Cancelled**, runs 07-11. Three shipments
  remain `New`. Orders cannot be deleted.
* **Two disabled promotions**, from runs 09 and 10, each left in a particular state on purpose and
  described in its run's report. **Neither is this run's.**
* **One permanent product configuration** from run 11, `71c75561…`, neutralised to
  `isActive: false, sections: []` on product `ec235043d5…`. Nothing on this platform can delete a
  configuration — the Admin's Delete button calls no API. The product reads `isConfigurable: false`
  and behaves as an ordinary product; the deployment-wide configuration count is 1, of which 0 are
  active.
* An undeletable contact from run 05.
* `FixedRateShippingMethod` has no configured rate, so every delivery option costs 0.00.

## The instrument

`kb ask`/`deliver` search the derived and experiential planes; `kb how` searches flows and neither
reaches the other. `kb capture --flow` writes a procedure; `kb amend <id> --step N --note … 
--deployment …` corrects one step of one without changing its goal or id.

Scratch files belong in `.scratch/`. The repository root is denied by default — three runs wrote
deployment data into it before that rule existed in the shape it now has.

## Retrieval

`SEARCH_OPTIONS`, `INDEX_OPTIONS` and `relevanceFloor` are unchanged. The floor was re-measured
today against three questions agents had actually been refused, over six variants including two
nobody had tried, and **it ships unchanged** — what was wrong in the one case that could be fixed was
the tokenizer, not the floor. The replay stands at **0 LOST, 0 MOVED, 3 of 5 wanted rows served**,
its best state since the harness existed.

## What is not being changed for this run

No code. No settings. No entry retired, corrected or re-anchored in preparation.

`Mutations.deleteOrganizationContact` on `KB-FA724D31` is still a guess at what a button called —
the last one of the three named in earlier handoffs. It is member territory and not this run's.
