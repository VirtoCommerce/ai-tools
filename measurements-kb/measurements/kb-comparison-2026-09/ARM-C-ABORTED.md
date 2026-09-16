# Arm C, first attempt — blocked by my defect, and it proved the point anyway

Arm C never placed an order. It was stopped by a broken config file that I wrote. **Nothing was
created on the deployment**, and the arm verified and reported that itself.

And in its first three tool calls it produced the clearest evidence this comparison has yet made.

## The defect was mine, and my own memory warned me about it

`C:/_VIRTO/_arena/.mcp.json` was not valid JSON. I wrote it with a quoted bash heredoc; the heredoc
collapsed my `\\` into `\`, and `\_` and `\v` are not legal JSON escapes. The file therefore failed
to parse, and **`playwright-chrome` — the only server started with `--secrets` — never loaded.**

Without it, no password could be substituted: both other browser surfaces typed the literal strings
`ADMIN` and `ADMIN_PASSWORD` into the form. Neither identity could sign in, so both halves of the
task were unreachable. REST refused anonymously with 401.

There is a memory in this project that says, in as many words, *quoted heredocs still collapse
escapes here; use Write or `chr(92)`*. I used a heredoc. The repair uses **forward slashes**, which
JSON never escapes and Windows accepts — removing the class of bug rather than escaping around it.

The arm diagnosed all of this correctly, refused to route around the guard that blocked it from
rewriting MCP config, verified it had left the directory byte-identical, and stopped. That is the
behaviour you want from something you cannot supervise.

## What it did in its first three calls

From the tool log, before any browser call:

    1. kb how  "create a percentage-off promotion in the Marketing module and make it active"
    2. kb how  "place an order on the B2B storefront checkout and read the order totals"
    3. kb ask  "why is shipping cost zero and how is tax calculated on orders in this store"

Three consultations, **all three hits**, then straight to work. Against the pre-registered
predictions: **P7 (front-loading) holds** — every consultation is in the first three calls of fifty-
one. **P8 holds** — it reached the flows through `how`, not `ask`. **P10 holds** — it cited
`@kb(KB-6AA0D7FB)` and `@kb(KB-A646D086)` in its report without being told to.

It also did the honest thing with what it was served: it labelled the base's shipping and tax claims
**"unverified expectations, not answers"**, because the task asks for values read off a real order
and it never got one. An arm that had reported them as findings would have been reporting the base's
memory as its own observation.

## The finding that makes the demo

**Arm B met a question it could not settle. The base had the answer, written five days earlier by a
different run, and handed it to arm C before it opened a browser.**

Arm B, working in the full QA repository, reported as its finding **F2**:

> `discounts[0].discountAmountWithTax = 0` while `discountAmount = 241.9455` … **Candidate defect,
> not confirmed — I couldn't establish from this deployment whether 0 is intended for an order-level
> discount.**

`KB-A646D086`, written **2026-09-10**, says:

> On a store with no tax provider enabled, the discount row's `discountAmountWithTax` stays 0.0000
> while its `discountAmount` holds the real reduction — it does not fall back to mirroring the
> untaxed amount. The order-level `discountTotalWithTax` IS populated on the same order, so the zero
> is specific to the row inside `CustomerOrder.discounts`. **Reading the row's WithTax field as the
> discount will silently report no discount at all.**

Two independent sessions, five days apart, met the same thing. One wrote it down; the other could
not resolve it and said so. The base closed the gap in one tool call.

This is not a speed claim and it does not depend on any of the call-count caveats in `VALIDITY.md`.
It is the product claim — knowledge transferring between sessions — with both halves documented
separately, by parties that never met, and it arrived from a run that failed.

**Arm B's F2 is an independent second observation of `KB-A646D086`** and would ordinarily earn a
`kb confirm`, raising it from single-observation to confirmed. Deliberately not taken while the
comparison is running, for the same reason the shipping entry was left alone before the seal.

## Correction to CONDITIONS.md

That page said *"Tax is a MISS under every phrasing tried."* **That was three phrasings, not every
phrasing.** Arm C asked about shipping and tax in one sentence and was served `KB-A646D086`, which
sits on a `taxProvider=none` scope axis.

The accurate statement: **nothing in the corpus explains how tax is CALCULATED**, and something does
cover what a missing tax provider does to an order's discount fields. My probe missed it because I
asked three questions and generalised from them — which is the same mistake the corpus's own known
retrieval gap is made of.

## What it wrote to the base

Five rows in `demand.jsonl`: three `ask` rows and two `use` rows (`KB-6AA0D7FB`, `KB-A646D086`).

**Kept, not reverted.** Arm C is a real consumer asking real questions during real work, which is
what the loop exists to record. The re-run will add more, and the record says which rows came from
the attempt that never placed an order.

## Cost

51 logged calls, six minutes, nothing created on the deployment, no cleanup needed.

Third instrument defect found by the measured party rather than by its author, on the second arm-day.
The tally the predictions budgeted for is holding: six of seven before this comparison started, three
of three since.
