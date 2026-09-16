# Run 12 — the task

Read `RUN-BRIEF-unprompted.md` first. This page is the work.

## The task

**Marketing wants to change a live promotion in the middle of the day. Shoppers already have carts
that used it. Establish what happens to those carts — and what a shopper looking at one would see.**

Run 09 established that a placed ORDER is a snapshot and nothing about it moves when its promotion
does. A cart is the opposite kind of record: it is alive. Nobody has established what that costs.

Create one percentage-off promotion, build a cart under it, and then — without touching the cart —
change the promotion. After each change, read the cart from every surface you can:

* **the rate.** Change 10% to 20%. Does the cart's discount move, and when — on the next read, on a
  mutation, or not at all? Say what makes it move.
* **eligibility.** Add a condition the cart does NOT meet. Does the discount disappear? Is anything
  left behind saying it was ever there — a row, a coupon, an amount of zero?
* **switching it off.** Disable it. Same questions.
* **the open page.** A shopper with the cart already rendered has stale HTML in front of them. What
  do they see, what does the next click show them, and is there any point where the page shows one
  total and the platform holds another?
* **the boundary.** Once a cart is converted to an order, does anything about that cart still
  respond to the promotion moving?

Report what a shopper can be shown that is no longer true, and for how long.

## Why this is worth a day

A cart that quietly changes price between the moment a shopper reads it and the moment they pay is
the kind of thing a business only hears about from a complaint. Whether this platform does that,
and where, has never been looked at.

## Where to work

The Admin SPA's Marketing module for the promotion; the storefront for the cart. Both signed in as
the brief describes. You do not need to place an order for the first four bullets.

## What this is deliberately not

Not a promotions-engine exercise. One simple percentage-off-cart-subtotal promotion is enough.

Not a repeat of run 09, which asked what an ORDER keeps when its promotion moves. If one of that
run's entries is wrong, `kb dispute` it — otherwise do not re-derive them.

## Scope

**You may create ONE promotion, and edit and disable the one you created.** Name it so it is
obviously yours and obviously disposable.

**Do not touch any promotion that existed before you arrived.** Runs 09 and 10 each left one
disabled, deliberately, and neither is yours.

**You may place at most one order**, and only if the last bullet needs it. An order cannot be
deleted — cancel what you place and report what remains.

Empty your cart at the end and leave your promotion disabled, not deleted. Do not modify catalog or
pricing data, and do not create or delete member accounts. Scratch files go in `.scratch/`.
