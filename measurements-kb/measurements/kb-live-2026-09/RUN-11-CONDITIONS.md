# Run 11 — conditions

What is true about the setup when this run starts. **No hypothesis and no predicted answer appears
on this page.** Predictions are pre-registered in the commit message that carries this file, which a
run does not read — verified over runs 07 to 10: no `git log`, `git show` or archive access in 904
calls.

## The base

`590 derived + 61 captured active` (6 retired) + `3 flows`. `kb validate` green.

**Configurable products are the longest-standing gap in this corpus.** Two demand rows have been
open since run 07 — "how does a configurable product become a line item in the cart" and "…on an
order" — and they are the only demand rows open at all. Run 07 was sent at three product kinds and
got two, because no product on this store is configurable.

Four captured entries already touch the subject, and one of them matters to what this run will do:
`KB-360127D0` states what a configuration loses between cart and order. **Its own body says it was
read off the schema rather than off a placed order**, because run 07 had no configured order to read.
It has one evidence row, no version stamp, and no confirmation.

**Changed since run 10:** six entries and a flow about coupons, and `kb amend` used by a run for the
first time.

## The deployment

`vcptcore_stable`, platform 3.1007.26, pin `c2f9c438eba4cd95`. Residue a reader should know about:

* Orders `CO260913-00001`, `CO260914-00001`, `CO260914-00002` — all **Cancelled**, runs 07-09. Two
  shipments remain `New`. Orders cannot be deleted.
* **Two disabled promotions**, from runs 09 and 10, each deliberately left in a particular state and
  described in its run's report. **Neither is this run's.**
* An undeletable contact from run 05.
* `FixedRateShippingMethod` has no configured rate, so every delivery option costs 0.00.
* **What the store has for configurable products**: the option products exist and the categories for
  them exist and are empty. What is missing is any product with a configuration attached.

**A configuration may not be removable.** The derived plane shows `POST
/api/catalog/products/configurations` (create), `GET …/{id}` and `POST …/search`, and **no delete
route**. Whether the Admin offers one is unknown — no run has looked. This is the first task that
permits a change to catalog-adjacent data, and the first whose residue may be permanent.

## The instrument

`kb ask`/`deliver` search the derived and experiential planes; `kb how` searches flows and neither
reaches the other. `kb capture --flow` writes a procedure, `kb amend` corrects one of its steps
without changing its goal or id.

Scratch files belong in `.scratch/`. **The repository root is now denied by default** — runs 08 and
10 each wrote deployment data into it, so everything at the top level is ignored unless named.

## Retrieval

`relevanceFloor`, `SEARCH_OPTIONS` and `INDEX_OPTIONS` are unchanged since run 06. The baseline was
re-taken after run 10; the replay stands at **0 LOST, 0 MOVED**.

Two rows are `want`-missing and left visible rather than tuned away. Both are written up in
`measurements/kb-retrieval-2026-09/README.md` part four. They are not a reason to do anything
differently.

## One thing the last run left for this one

Run 10 found that the `--secrets` key `IMPERSONATION_ADMIN_PASSWORD` works on the browser lane but
its value is **not** accepted by `POST /connect/token` for that same account — one attempt,
`login_failed`, and `accessFailedCount` read back as 0 afterwards. The admin password grant works.
An admin bearer can address a customer's cart over the storefront xAPI **by cartId**; passing
`userId` + `cartName` instead resolves against the token's own user and returns null.

## What is not being changed for this run

No code. No settings. No entry retired, corrected or re-anchored in preparation — including
`KB-360127D0`, which stands exactly as run 07 wrote it.
