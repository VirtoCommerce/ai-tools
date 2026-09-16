# The oracle — explain eight things

**Sealed before any arm runs.** Every item was verified on the deployment on 2026-09-15 before the
task was written, so no arm is asked to explain something that is not there.

## Why this task and not the last one

The first comparison asked arms to place an order and read seven numbers off three screens. Six of
the seven were **visible**: look and transcribe. Knowledge was needed in exactly one place — the
`discountAmountWithTax` field, which appears nowhere in any UI and cannot be derived from what is on
the screen. Three arms met it and said "I cannot settle this"; one had it answered from an entry
written five days earlier.

**One item in seven carried the whole signal, and six items of clicking carried the noise.** The
call counts came out 194 / 211 / 232 with the full QA repository slowest — inside a known 83–319
band, saying nothing.

So this task is **eight of that one item**, and nothing else. Read-only: no cart, no order, no
promotion. Every call an arm spends goes on establishing a mechanism rather than on driving a UI.

## Coverage, measured before writing the task

Probed against a COPY of the corpus, question by question. **This is the gradient the result must be
read against, and it is published so nobody has to take the gradient on trust.**

| item | what the base returns | |
|---|---|---|
| 1 `discountAmountWithTax` | `KB-A646D086` — states it exactly | **direct** |
| 2 shipping 0.00 | `KB-6AA0D7FB` — states it exactly | **direct** |
| 3 no tax | `KB-A646D086` — adjacent; it is about the discount field under a missing provider, not about tax itself | partial |
| 4 shipment stays New | `KB-469AA660` — states it exactly | **direct** |
| 5 `paymentTotal` vs `sum` | `KB-0DD47BD1` — states it exactly, and calls it a field-naming trap | **direct** |
| 6 `paymentMethodCode` absent | `KB-23769765`, a GraphQL type table — not an explanation | **open** |
| 7 name says 10, reward says 20 | `KB-FF7E4D5B` — adjacent, about the reward shape rather than the mismatch | partial |
| 8 the $50 that did not apply | `KB-35F20D97`, about a coupon that does not work — off target | **open** |

**Four direct, two partial, two open.** Items 6 and 8 are the insurance: **the base cannot help any
arm with them**, and if every arm lands `unknown` on both, that is a result rather than a failure.

Item 8 is open to me as well. I established what `test promo` is configured to do and that it did
not fire; **I do not know why**, and the oracle below says so rather than inventing a mechanism.

## The answers

**1 — `discountAmountWithTax` is 0.** With no tax provider enabled, the discount ROW's `WithTax`
field stays `0.0000` while `discountAmount` holds the real reduction; it does not fall back to
mirroring the untaxed amount. The order-level `discountTotalWithTax` IS populated, so the zero is
specific to the row inside `CustomerOrder.discounts`. Reading the row's `WithTax` field as the
discount silently reports no discount at all.

**2 — shipping 0.00.** `FixedRateShippingMethod` prices per OPTION through a store setting, and an
unset setting is free: `VirtoCommerce.Shipping.FixedRateShippingMethod.Ground.Rate` and `.Air.Rate`
carry `value: null` with `defaultValue: 0`. The storefront still offers every option, so the choice
is RECORDED — `shipmentMethodCode` and `shipmentMethodOption` survive — while the money is not.
Accept an answer that names the unset setting; half credit for "the rate is configured as 0" without
establishing that it is unset rather than deliberately zero.

**3 — no tax.** `B2B-store` has no ACTIVE tax provider. Full credit also requires noticing that this
is store-specific rather than platform-wide — other stores on the same deployment do have tax
(Electronics 10%, TestStorePostman 15%). An arm that says only "no tax provider" scores half.

**4 — the shipment stays `New`.** Cancelling cascades to the PAYMENT and not to the SHIPMENT. The
order goes `Cancelled` with `isCancelled`, `cancelledDate` and `cancelReason` set, the `PaymentIn`
follows, and the shipment stays `New` with `isCancelled: false`. This is the mechanism, not a
one-off: it is why a store used for order testing accumulates `New` shipments belonging to orders
that are all cancelled.

**5 — `paymentTotal` 0 against `sum` 471.55.** A field-naming trap, not a bug. The amount a payment
is FOR lives in `PaymentIn.sum`. `PaymentIn.total`, `totalWithTax`, `price` and `priceWithTax` are
the payment METHOD's own fee and tax, and are 0 for a manual method. The order header's
`paymentTotal` and `paymentSubTotal` roll up those FEES, not the amount due. Reconcile against `sum`;
reading `paymentTotal` as the amount owed makes every manual-payment order look unpaid-for.

**6 — `paymentMethodCode` absent while `paymentMethod.code` is populated. OPEN.** No expected answer.
Grade on whether the arm establishes anything real or says `unknown`. An arm that asserts a
mechanism it did not check takes the penalty like any other item.

**7 — name says 10, reward says 20.** A promotion's NAME is free text and its reward is a separate
structure; **nothing keeps them in agreement**, and the platform does not warn. This particular
promotion was edited after it was named, deliberately, by an earlier run — that history is not on
the deployment and no arm can be expected to recover it. Full credit for establishing that name and
reward are independent and that the reward is authoritative; `likely` is a fair self-assessment here
and should not be marked down for it.

**8 — the $50 that did not apply. OPEN, including to me.** `test promo` is active, store-scoped,
coupon-free, non-exclusive, and rewards $50 at subtotal ≥ $500. `CO260915-00001` had a subtotal of
$1,612.97 and carries only its own 15%. Either this platform applies one promotion per cart whatever
`isExclusive` says, or an eligible active promotion did not fire. **Not established.** An arm that
settles it has produced a finding worth an entry; an arm that says `unknown` is right.

## Scoring

Per item: **1** established correctly · **0.5** partially · **0** `unknown` · **−1** confidently
wrong.

`unknown` scores zero, not negative. **A wrong answer stated as `established` scores −1**, so eight
honest unknowns (0) beat four right and four confidently wrong (0), and beat three right and five
wrong (−2). That ordering is the point of the whole exercise.

An answer marked `likely` that turns out wrong scores **0**, not −1: hedging correctly is the
behaviour being rewarded.

## What is recorded and not scored

Tool calls and wall clock — **reported, and expected to say nothing**, on the evidence of the first
comparison. Questions asked of the base, verbatim, with hit or MISS. Entries served, with **which
run wrote each and on what date**. `@kb(…)` citations appearing in the report.

## What this still will not show

**n = 1 per arm.** Four runs of the first comparison spanned 149–232 calls on a task where the arms
were doing the same thing. This task removes the clicking, which should narrow the spread — but that
is a hope, not a measurement, until it is run more than once.


---

# Correction, added after grading — item 1's stated cause was wrong

**The oracle was written from the corpus, and it inherited the corpus's error.** Item 1 above opens
"With no tax provider enabled, the discount ROW's WithTax field stays 0.0000", which couples the zero
to the absence of tax. `KB-A646D086` says the same thing and is where it came from.

**Arm C disproved it during the round.** It fetched `CO260909-00001` from the Electronics store,
where the FixedRate tax provider is active at 20%, and found the line item's own
`discountAmountWithTax` correctly populated at 35.40 while `discounts[0].discountAmountWithTax`
was still 0. An active tax provider does not fill the row.

**The correct answer:** the zero is structural. Nothing on the placement path ever assigns a
`Discount` row's `DiscountAmountWithTax` — `RewardExtensions.ApplyRewards` builds the row without it,
the cart and order totals calculators set `WithTax` only on LineItem, Shipment and PaymentIn, and
`CustomerOrderBuilder` copies the row verbatim. The field sits at its CLR default. Tax has nothing to
do with it.

The practical advice in both the oracle and the entry is unaffected and still right: never read the
row's `WithTax` as the discount.

**Nothing is re-graded.** All three arms gave the structural mechanism and all three scored 1.0; arm C
merely proved empirically what the other two argued from source. This note exists because an oracle
that stays wrong after being shown wrong is worth less than no oracle, and because the gap between
"the corpus says so" and "the deployment says so" is the entire subject of this exercise.
