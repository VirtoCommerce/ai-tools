# Run 07 — conditions

Brief: `RUN-BRIEF-unprompted.md`. Task: `TASK-run-07.md`.

## The one thing this run is for

Three coverage conditions have now been watched, and this is the fourth:

| | |
|---|---|
| runs 01–03 | fresh territory, thin corpus, retrieval pre-fix |
| runs 04–05 | ground where seven and then nineteen entries sat **on the exact subject** |
| run 06 | coordinates in full, **no experience anywhere near** |
| **run 07** | **experience that is adjacent and was written for something else** |

Four entries describe how a discount lands on an order — `KB-4982C91F` (the same discount stored
twice at different precision, and the Admin rendering both at once), `KB-FF7E4D5B`, `KB-CA4C93E4`,
`KB-A646D086`. Every one was written by a run doing promotions work. None of them is about whether
an order's fields are correct, and all of them are one step away from it.

**It is testable before the run starts, and it was.** Put to the base today:

```
does the admin order screen show the same totals the storefront charged
  -> KB-4982C91F  order-discount-amount-rounding-split
```

That is an entry about the Admin showing an unrounded number beside a rounded one, served first, to
a question nobody had in mind when it was written. Whether a run finds that useful or misleading is
the thing to read this run for. A reusable observation is worth more than a narrow one, and it is
also where a plausible near-miss does the most damage.

## The second thing, and it is the subject

Three product kinds have never been touched by any run: **simple, variation, configurable.** The
schema covers the third in full — `Mutations.createConfiguredLineItem`, `ConfigurationItemType`,
`OrderConfigurationItemType`, `ConfigurationLineItemType`, `Query.productConfiguration` — and
`OrderLineItemType` carries 54 fields including `productType`, `configurationItems` and the whole
money family twice over, with and without tax. Nothing experiential exists about any of it.

## This run places orders, and that is new

Every task from run 01 to run 06 said **do not place orders**. This one cannot be done without
placing one.

**An order is not undoable.** It can be cancelled; it cannot be deleted. Whatever this run creates
stays on the deployment as a cancelled record, and the task says so rather than implying a cleanup
that does not exist. That is a deliberate change of the standing scope rule and it is recorded here
as a condition, not left to be inferred from the task page.

## What changed since run 06

| | |
|---|---|
| `3decb71` | `kb reanchor` — a coordinate can be corrected without destroying the id others cite |
| `111f812` | the hook records the harness's session id, so the door finds its own log |
| `6256ccd` | `consultation-shape.mjs` — the headline number finally has a script |

**The task no longer tells the run which session it is.** Runs 04, 05 and 06 were each told to put
`VC_MEASURE_SESSION` on every `kb` call, and each complied perfectly — 25 of 25, then again — while
one missed prefix would have dropped a question row silently. The hook now writes
`CLAUDE_CODE_HOST_SESSION_ID` into every record and the resolvers match on it.

Verified in the exact shape this run will meet, not just in a unit test: an authoring log that began
before the field existed and carries it only on its newest lines, beside a log written entirely
after. Each session resolves to its own, `stamped: true`, no refusal. Runs 01–06 still refuse,
correctly — their logs predate the field.

## A defect is left in the base, again on purpose

`Promotion.isActive` (KB-35A09C64, promotion re-evaluation on a cart read) names a field the
contract does not carry beside four it does. It is in cart territory, which this run works.

`kb reanchor` now exists, so correcting it is one move — but the right value is somebody's
observation and I have not seen the screen. Nothing in the brief or the task mentions it. If the run
meets it, what it does is a finding; if it never goes near it, that is the honest outcome.

## What to read afterwards

1. Consultation shape — the seventh reading, from `consultation-shape.mjs` now rather than by hand.
2. **Were the four discount entries served, and to what?** This is the run's own question. An
   adjacent entry served to a question it was not written for is either the base's best property or
   its most expensive failure mode, and one run will start to say which.
3. The new replay rows. Run 06's five were the first from a run that never saw the tuned
   configuration; these are the second set, on money and line items rather than lists.
4. What the run could not reach — a product kind the store does not stock, a checkout step that
   needs a payment method nobody has. An unreachable step is a fact about the deployment.

---

## Written after the run: this file contaminated the measurement

Run 07 read this page at its second tool call, and disclosed it. That is not a fault of the run —
nothing told it not to, and the page sits in the directory its task lives in.

It cost the one thing run 07 was for. The section above states the hypothesis **and shows the probe
result**, naming `KB-4982C91F` as the entry that would be served. The run then reported that entry
being served "exactly as predicted" and gave a careful verdict on it. That verdict is no longer
independent evidence about whether an adjacent observation helps, because the run had been told what
to expect before it started.

Its verdict is still worth reading — *"useful, but not as an answer; it names the failure shape and
the disagreement I found is that shape exactly"* is a distinction a contaminated reader can still
draw honestly. It is not a blind result, and it is not counted as one.

**The convention that follows, for run 08 onward.** A conditions page records what is *true* about
the setup — what changed, what is planted, what the scope allows. The **hypothesis and any
prediction go in the commit message instead.** A commit message is pre-registration in every way
that matters: timestamped, immutable, written before the run, and readable by anyone afterwards —
and a run does not read `git log`. Verified for this run: one read of this file at call 2, and no
`git log`, `git show` or archive access in 302 calls.

The alternative — telling the run not to read it — is the shape this whole rebuild keeps removing.
