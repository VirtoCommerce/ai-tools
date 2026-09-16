# Run 10 — the task

Read `RUN-BRIEF-unprompted.md` first. This page is the work.

## The task

**A shopper has a coupon code. Establish everything the storefront cart can tell them — before any
order exists — about whether it worked, what it gave them, and why it might not have.**

Create one promotion that requires a coupon, then work entirely on the cart:

* **what the cart holds once a valid coupon is applied.** Where does the code itself live, where does
  the reward live, and are they the same record or two? Say what a caller gets back, field by field,
  and say which of it the storefront's own page actually displays.
* **what a WRONG code does.** A typo, a code for a promotion that does not apply to this cart, a
  code applied twice. Does the call fail, or succeed with something in it that says otherwise? If
  there is a validation channel, say what it returns and whether the page shows it.
* **removing one.** Does the cart return to exactly what it was, or is there residue?
* **the boundary.** A coupon-driven promotion and an automatic one both end up as a discount on the
  cart. Given only the cart, can you tell which is which — and if you can, what field tells you?

Report what a shopper can see, what the API returns that the page drops, and any point where the two
disagree.

## Why this is worth a day

Coupons are the most heavily contracted part of this area — a dedicated validation query, add and
remove mutations, their own types — and no run has ever touched one. What those calls DO when a code
is wrong is exactly the half a contract cannot state.

## Where to work

Storefront signed in as described in the brief; the Admin SPA's Marketing module to create the
promotion. **You do not need to place an order, and should not** — everything here happens on the
cart, and an order cannot be deleted afterwards.

## What this is deliberately not

Not a promotions-engine exercise. One simple reward is enough; tiers, stacking and conditions are
not the subject unless something you observe forces them in.

Not a repeat of the discount-placement work. Where a cart-level reward lands, and what survives onto
an order, are covered by several entries already. If one is wrong, `kb dispute` it — otherwise do
not re-derive them.

## Scope

**You may create ONE promotion and its coupon, and edit or disable the one you created.** Name both
so they are obviously yours and obviously disposable. **Do not touch any promotion that existed
before you arrived** — run 09 left one disabled on purpose, and it is not yours.

**Do not place an order.** If you believe the task cannot be answered without one, say so in the
report rather than placing one.

Empty your cart at the end. Leave your promotion disabled, not deleted. Do not modify catalog or
pricing data, and do not create or delete member accounts.
