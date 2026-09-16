# Run 10 — conditions

What is true about the setup when this run starts. **No hypothesis and no predicted answer appears
on this page.** Predictions are pre-registered in the commit message that carries this file, which a
run does not read — verified over runs 07, 08 and 09: no `git log`, `git show` or archive access in
681 calls.

## The base

`590 derived + 49 captured active` (6 retired) + `2 flows`. `kb validate` green.

**Coupons are the most heavily contracted corner of this area and have no experience behind them at
all.** The derived plane carries `Query.validateCoupon`, `Mutations.addCoupon`, `CouponType`,
`InputAddCouponType`, `InputRemoveCouponType` and the discount types that mention a coupon field.
One captured entry mentions the word in passing and none is about one.

That makes this the second run sent at ground the contract covers completely and experience does not
cover at all. Run 06 was the first, on shared lists, and found a documented-nowhere enum value that
served a whole list to a signed-out caller.

**Changed since run 09:** eleven entries about promotion edits and discount arithmetic, a second
flow, and `kb amend` — a verb for correcting one step of a flow without changing its goal or its id.
Both briefs describe it. `KB-AFB2D3C5` carries three amendments written with it.

## The deployment

`vcptcore_stable`, platform 3.1007.26, pin `c2f9c438eba4cd95`. Residue a reader should know about:

* Orders `CO260913-00001`, `CO260914-00001`, `CO260914-00002` — all **Cancelled**, from runs 07-09.
  Two shipments remain `New`. Orders cannot be deleted.
* **A promotion left by run 09**, id `6b167f1b-1c31-4659-afe2-6c32f1ac1c9f`, disabled, named
  `…25pct off cart (EDITED after the order)`. Deliberately left in that state so a reader can see
  its reference has moved away from what an order says. **Not this run's to touch.**
* An undeletable contact from run 05. Not this run's.
* `VALID_COUPON_CODE` in the environment file is **empty** — no coupon is known to exist here, and
  no run has created one.
* `FixedRateShippingMethod` has no configured rate, so every delivery option costs 0.00.

## The instrument

`kb ask`/`deliver` search the derived and experiential planes; `kb how` searches flows and neither
can reach the other. `kb capture --flow` writes a procedure, `kb amend` corrects one of its steps.

**Two** demand rows are open, both inherited from run 07 and both about configurable products,
which this store has none of.

Five more were open an hour ago and were closed as what they were: smoke tests of `kb how`, typed
against the live base while the flow plane was being built. `ask` and `how` WRITE -- they append to
the demand loop -- so probing the live base with them leaves rows that read like coverage somebody
wanted and did not get. Named here because the number is a condition of this run and the reason it
moved should not have to be reconstructed.

Scratch files belong in `.scratch/`, which is gitignored.

## Retrieval

`relevanceFloor`, `SEARCH_OPTIONS` and `INDEX_OPTIONS` are unchanged since run 06. The baseline was
re-taken after run 09 and the replay stands at **0 LOST, 0 MOVED**.

Two rows are `want`-missing — the corpus holds an entry a grader or a run said should have been
served, and it is not. Both are recorded in `measurements/kb-retrieval-2026-09/README.md` part four,
left visible rather than tuned away. They are not a reason to do anything differently.

## What is not being changed for this run

No code. No settings. No entry retired, corrected or re-anchored in preparation. One guessed anchor
named in earlier handoffs is still open — `Mutations.deleteOrganizationContact` on `KB-FA724D31`,
which is member territory and not this run's.
