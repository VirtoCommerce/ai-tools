# Run 09 — conditions

What is true about the setup when this run starts. **No hypothesis and no predicted answer appears
on this page.** Run 07 read its own conditions page at tool call 2 with both on it, and its verdict
on the thing it existed to test stopped being independent. Predictions are pre-registered in the
commit message that carries this file, which a run does not read — verified over runs 07 and 08: no
`git log`, `git show` or archive access in 437 calls between them.

## The base

`590 derived + 47 captured active` (4 retired) + `1 flow`. 3,630 anchors. `kb validate` green.

**Eleven captured entries already touch discounts, promotions or rewards** — the densest coverage
of any subject in this corpus, written by runs 01, 02 and 07. This is the fourth coverage condition
and the only one where a run works ground the experiential plane already knows well. Runs 04 and 05
worked ground with 7 and 19 entries in total; here 11 entries sit on the run's own subject.

**Changed since run 08:** eight entries about shipments, and the flow plane's first confirmation.
`how` now writes a question-CSV row, which it did not for run 08 — so run 08's own question log
under-reports it by exactly one row, and `MEASUREMENT-archive/run-08-shipment/` is left as it was
rather than rewritten.

## The deployment

`vcptcore_stable`, platform 3.1007.26, pin `c2f9c438eba4cd95`. Residue a reader should know about:

* Orders `CO260913-00001` (run 07) and `CO260914-00001` (run 08) — both **Cancelled**. Run 08's
  shipment `SH260914-00001` is still `New`. Orders cannot be deleted.
* An undeletable contact from run 05, id `c2d5087c-c1ec-4b24-a4db-bd3b23ae083d`. Not this run's.
* No configurable product exists on this store. Two demand rows about them stand open.
* **Whether a promotion can be deleted here at all is unknown** — no run has tried. The task says
  to leave one disabled rather than assume either way.

`FixedRateShippingMethod` carries no configured rate, so every delivery option costs 0.00
(`KB-6AA0D7FB`). That is the store, not a fault, and it means shipping contributes nothing to the
arithmetic this run is checking.

## The instrument

`kb how <question>` searches the flow plane; `kb ask`/`deliver` search the other two and cannot
reach it. `kb capture --flow` writes a procedure. Both briefs describe the split.

Six demand rows are open, inherited from earlier runs — about checkout and configurable products.
None is this run's.

Scratch files belong in `.scratch/`, which is gitignored. Run 08 wrote a response body to the
repository root, where nothing covered it.

## Retrieval

`relevanceFloor`, `SEARCH_OPTIONS` and `INDEX_OPTIONS` are unchanged since run 06. The replay's 34
rows stand at **one** `LOST` and zero `MOVED`.

That one is `r2.5`, and it has been `LOST` since run 07. Its recorded anchor is an explicit
override rather than a baseline rank — it names what run 02's own answer column said it used, not
what ranked first for it — so the harness cannot settle it and has printed REGRESSION for two runs.
**This run's subject is the same question.** What it reaches for, and in what order, is recorded in
its tool log and its question rows either way.

## What is not being changed for this run

No code. No settings. No entry retired, corrected or re-anchored in preparation. The three wrong
anchors named in earlier handoffs (`Mutations.deleteOrganizationContact`, `Promotion.isActive`) are
still wrong, and `Promotion.isActive` sits in this run's territory — as it did for run 07, which
did not meet it.
