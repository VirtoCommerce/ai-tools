# Run 09 — the task

Read `RUN-BRIEF-unprompted.md` first. This page is the work.

## The task

**A customer disputes what they were charged. They say they were promised a percentage off, and the
order shows a money amount. Establish what that order can still prove about the percentage it was
given — and whether that survives the promotion being changed afterwards.**

Place an order on `vcptcore_stable` under a percentage-off promotion you create, then answer:

* **what the order records of the rate.** The order carries money. Does the percentage survive
  anywhere on it — a field, a description, a reference to something that knows? Say exactly where,
  and say it for the cart as well, because the cart and the order are not the same record.
* **what the reference is worth.** If the order points at the promotion rather than storing the
  rate, then the answer depends on the promotion still being what it was. **Change your promotion
  after the order exists** — the rate, the name, whichever the Admin lets you change — and re-read
  the order. Does anything on it move? Does anything on it now say something that was never true of
  this order?
* **the worst case.** Disable or delete your promotion and re-read the order again. What is left.
* **the reverse direction.** Given only the order, could a system reconstruct the rate arithmetically
  — amount against subtotal — and where does that break? Rounding, several discounts at once, a
  discount on a line item rather than the cart, tax.

Report what an auditor could and could not prove from that order alone, three months later.

## Why this is worth a day

An amount without a rate is only a problem if the rate cannot be recovered. Whether it can is
decided by something nobody has tested: the order references a promotion that stays editable, and
nothing has ever checked what that reference is worth once the promotion moves.

## Where to work

Storefront signed in as described in the brief; the Admin SPA for the promotion and for reading the
order back. The Marketing module is where a promotion is created.

## What this is deliberately not

Not a survey of order money fields. Several entries already describe where a cart-level reward
lands and what a line item carries. If one of them is wrong, say so and `kb dispute` it — otherwise
do not re-derive them.

Not a promotions-engine exercise. One simple percentage-off-the-cart-subtotal promotion is enough;
conditions, coupons, tiers and stacking are not the subject unless something you observe forces
them in.

## Scope — this run creates and edits a promotion

**You may create ONE promotion, and you may edit and disable the one you created.** Name it so that
it is obviously yours and obviously disposable. **Do not edit, disable or delete any promotion that
existed before you arrived**, and do not touch another organization's data.

**You may place orders. An order cannot be deleted.** Cancel what you place and say in your report
what remains and in what state.

Leave your promotion **disabled**, not deleted, if deleting it turns out to be something the
platform allows — a deleted one cannot be inspected by whoever reads your report.

Keep quantities at one or two. Do not modify catalog or pricing data, and do not create or delete
member accounts.
