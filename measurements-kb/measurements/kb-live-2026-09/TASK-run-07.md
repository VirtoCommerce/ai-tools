# Run 07 — the task

Read `RUN-BRIEF-unprompted.md` first. This page is the work.

## The task

**Place one order on `vcptcore_stable` containing a simple product, a variation, and a configurable
product — then establish, in the Admin, whether the order the platform holds is what the storefront
charged.**

Field by field. The question is not whether checkout succeeds; it is whether what was bought and
what was recorded are the same thing, for three kinds of product that reach the cart by three
different routes.

* **which three the store actually has**, and how each gets into a cart. A variation is selected on
  its parent; a configurable product is assembled before it becomes a line item. Say what the routes
  are, because they are not the same call and the base will only tell you the names.
* **what each line item carries for its own kind** — `productType`, `sku`, `product`,
  `configurationItems`. Does a variation record what it is a variation *of*? Does the configuration
  a buyer chose survive onto the order, and in what shape?
* **the money, line by line and in the header** — `placedPrice`, `extendedPrice`, `listTotal`,
  `discountTotal`, `taxTotal`, each of them also `WithTax`. Do the Admin's numbers equal what the
  storefront showed at checkout? Do the line items sum to the header?
* **every place the two surfaces disagree**, or the Admin displays something the platform does not
  hold.

Report what each field holds for each product kind, and every disagreement you find.

## Where to work

Storefront signed in as described in the brief; the Admin SPA for the verification half. The
account the brief names already belongs to an organization with a usable shipping address.

**If checkout needs a payment method that cannot be completed here**, say so and get an order by
whatever route the deployment does allow. An unreachable step is a fact about the deployment, and a
well-evidenced "this cannot be completed on this store" is worth more than a guess about what it
would have recorded.

**If the catalog has no configurable product, or no product with variations**, say that too, work
the kinds that exist, and do not go and create one — catalog data is out of scope below.

## What this is deliberately not

Not a checkout-flow test. Whether the wizard's steps behave is somebody else's question; this one
starts when the order exists.

Not a promotions exercise. Four entries in the base are about how a discount lands on an order and
you may well be served one. If a discount applies to your order incidentally, record what it did —
but the subject is whether the fields are right, not whether the reward is.

## Scope — this run may place orders, and previous runs could not

**You may place orders.** That is a change from every task before this one and it is deliberate.

**An order cannot be deleted.** Cancel what you place, and say in your report what remains and in
what state. Do not touch an order you did not create.

Keep quantities at one or two. Do not modify catalog, pricing or promotion data, do not touch
another organization, and do not create or delete member accounts — runs 04 and 05 left one behind
that nothing can remove.
