# The $50 nobody applied — and what the two arms did about it

Established over REST while arm C was still running, from the deployment rather than from either
arm's account.

## What is actually configured

`test promo` — created 2023-05-19, still active, and nobody's disposable test fixture:

    storeIds     ["B2B-store"]
    isActive     true
    hasCoupons   false
    isExclusive  false
    priority     0

    BlockCartCondition
      ConditionCartSubtotalLeast   subTotal=500  compareCondition="AtLeast"
    BlockReward
      RewardCartGetOfAbsSubtotal   amount=50

An active, store-scoped, coupon-free, **non-exclusive** promotion that takes $50 off any cart whose
subtotal reaches $500.

## What arm B's order holds

    subTotal        1612.97
    discountTotal    241.95
    total           1371.02
    order discounts  1   ->  241.9455, "KB-LAB run13 … 15% off the cart subtotal"
    line discounts   0

Subtotal **$1,612.97** — more than three times the threshold — and **no $50**.

So either the platform applies one promotion per cart whatever `isExclusive` says, or an eligible
active promotion silently did not fire. **Neither is established here**, and this page does not
guess which: it records that an active non-exclusive promotion specifying a $50 reward did not
appear on an order that met its condition.

## What each arm did

**Arm B** reported *"a single discount line, from my promotion"* and treated that as the expected
state. It had noticed several pre-existing promotions were active and wrote *"I'll watch for
stacking"* — then saw one discount line and moved on. **It never asked what those promotions
reward**, so it could not tell "no stacking occurred" from "stacking should have occurred and did
not".

**Arm C**, before building any cart, read the promotions API, found `test promo`, opened it, and
established its condition and reward. It then **kept its cart subtotal under $500** so that its own
promotion would be the only one that could apply — stating the reason.

## What this is, and what it is not

**It is not an oracle item and no score moves.** S3 asks whether an arm's stated discount matches
the rate of the promotion it created; arm B's arithmetic is right. Inventing a new scored item after
the arms have run is exactly what the seal exists to prevent, and it will not be done.

**It is a difference in thoroughness, and it is the second instance of the same shape.** The first
was `discountAmountWithTax`: arm B met it and could not settle it; the base had it answered five
days earlier. This one is earlier in the work — arm C did not need the base to *answer* it, it
needed the habit of checking the surface before trusting it. Whether the base caused that habit is
not something one run can show, and the write-up must not claim it did.

**Arm C's avoidance is itself a confound, and it cuts against arm C.** By holding its cart under
$500 it is doing a slightly different task from arm B's, on a smaller order, with one fewer
interacting promotion. The two orders are not the same experiment. That belongs in the result
beside anything favourable.

## The open question for the deployment

An active, non-exclusive, $50 promotion did not apply to a $1,612.97 cart. That is worth an entry in
the base once the comparison is over and the corpus can be written to again — as an observation with
the order number attached, not as the explanation, because the mechanism is unestablished.


---

## CORRECTED after arm B2

This page said arm C's check was "a difference in thoroughness" and that whether the base caused it
could not be shown by one run. **Arm B2 settled it: no.**

Arm B2 had no base, read the promotions surface before building its cart, found `test promo`, and
held its cart to $445.97 for the same stated reason. It went further than arm C did — it chose 17%,
a rate no other promotion on this store uses, so the discount is attributable by RATE as well as by
id.

So checking the promotions surface before trusting it is something a capable agent does anyway. Arm
B missed it; the two arms that followed did not; only one of those had a base. **The contrast on
this page was between arm B and everyone else, not between the base and its absence**, and reading
it the other way would have been the most flattering mistake available.
