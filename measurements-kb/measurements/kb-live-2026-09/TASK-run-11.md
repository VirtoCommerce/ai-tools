# Run 11 — the task

Read `RUN-BRIEF-unprompted.md` first. This page is the work.

## The task

**Nobody has ever seen a configured product on this store. Find out whether one can be made to
exist, and if it can, put one through a cart onto an order and establish what the order actually
records of the choices somebody made.**

Three runs have wanted this and none could have it: the store's option products exist and the
categories for them exist, and no product is configurable. Two demand rows have stood open on it
since run 07.

* **first, whether it is possible at all.** A product's configurability is a separate entity keyed
  by product id, not a field on the product. Establish what creating one takes, what it needs to
  reference, and — before you create anything — **whether it can be removed again.** If it cannot,
  say so and decide in the report whether it was worth doing; you are allowed to conclude it was
  not and stop.
* **the storefront side.** Does the product page change once a configuration exists? What does a
  buyer choose, and what does the cart hold when they have chosen — section by section, field by
  field.
* **the crossing.** Place one order. What survives from the cart's record of the configuration onto
  the order's, and what does not. Be exact: name each field that exists on one side and not the
  other, and say what that costs somebody reading the order later.
* **the reverse direction.** Given only the order, could a system say which catalog products were
  chosen, and how many of each? If not, name the first field whose absence breaks it.

## Why this is worth a day

An order is the record a business keeps. If it cannot say what was bought, that matters more than
any of the surrounding machinery — and this is the one product kind where nobody has checked.

## Where to work

The platform REST API and the Admin SPA to create the configuration; the storefront to configure,
cart and order. Signed in as the brief describes.

## What this is deliberately not

Not a catalog exercise. Use a product that already exists, and prefer one the store was clearly set
up to configure. Do not create or delete catalog products.

Not a repeat of run 07. The order's money fields, its variation handling and its payment record are
covered by several entries. If one is wrong, `kb dispute` it — otherwise leave them.

## Scope — this run changes catalog-adjacent data, which no previous run has

**You may create ONE product configuration**, on one existing product, and you must name it so that
it is obviously disposable.

**Check for a removal path BEFORE you create it.** The contract shows a create route and a search
route and no delete; the Admin may still offer one. If nothing can remove it, what you create stays
on this store permanently — weigh that against what the task is worth and say which way you went.

**Do not create, delete or modify catalog products themselves**, and do not touch pricing.

**You may place one order.** An order cannot be deleted — cancel what you place and report what
remains. Do not touch orders, promotions or configurations you did not create. Run 09 and run 10
each left a disabled promotion; neither is yours.
